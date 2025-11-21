import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const RATINGS_STORAGE_KEY = "call_rating_dashboard_ratings_v1";
const COMPLETED_CALLS_KEY = "call_rating_dashboard_completed_v1";
const USER_ID = "demo-user";

const EMPTY_RATING = {
  codeSwitch: 0,
  colloquialness: 0,
  emotionalIntelligence: 0,
  sopAdherence: 0,
  idealResponse: "",
};

const METRICS = [
  { key: "codeSwitch", label: "Code-Switch - Response Level" },
  { key: "colloquialness", label: "Colloquialness - Response Level" },
  { key: "emotionalIntelligence", label: "Emotional Intelligence - Response Level" },
  {
    key: "sopAdherence",
    label:
      "SOP Adherence (Instruction Adherence / Error Recovery / Task Success) - Conversational Level",
  },
];

function App() {
  const [calls, setCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  // ratings: { [callId]: { [turnIndex]: { ...metrics } } }
  const [ratings, setRatings] = useState({});
  const [completedCalls, setCompletedCalls] = useState({}); // { callId: true }

  // sidebar resizing
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // modal state: { callId, idx } | null
  const [activeRatingTarget, setActiveRatingTarget] = useState(null);

  const utteranceRefs = useRef({}); // { "callId:idx": HTMLDivElement }

  // ---------------------------------------------------
  // Load transcripts.json
  // ---------------------------------------------------
  useEffect(() => {
    fetch("/transcripts.json")
      .then((r) => r.json())
      .then((data) => {
        const normalized = data.map((item) => item.data || item);
        setCalls(normalized);
        if (normalized.length > 0) {
          setSelectedCallId(normalized[0].call_id);
        }
      })
      .catch((err) => {
        console.error("Failed to load transcripts.json", err);
      });
  }, []);

  // ---------------------------------------------------
  // Load ratings from localStorage
  // ---------------------------------------------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RATINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setRatings(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load ratings from localStorage", e);
    }
  }, []);

  // ---------------------------------------------------
  // Load completed calls from localStorage
  // ---------------------------------------------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPLETED_CALLS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setCompletedCalls(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load completed calls from localStorage", e);
    }
  }, []);

  // ---------------------------------------------------
  // Load shared ratings from Supabase, merge safely
  // EXPECTED TABLE COLUMNS:
  // call_id, turn_index, user_id,
  // code_switch, colloquialness, emotional_intelligence, sop_adherence, ideal_response
  // ---------------------------------------------------
  useEffect(() => {
    const loadSharedRatings = async () => {
      try {
        const { data, error } = await supabase
          .from("call_ratings")
          .select("*")
          .eq("user_id", USER_ID);

        console.log("Loaded ratings from Supabase:", { data, error });

        if (error) {
          console.error("Error loading ratings from Supabase:", error);
          return;
        }
        if (!data) return;

        setRatings((prev) => {
          const next = { ...prev };

          data.forEach((r) => {
            const callId = r.call_id;
            const idx = r.turn_index;
            if (!callId || idx == null) return;

            if (!next[callId]) next[callId] = {};

            const existing = next[callId][idx] || { ...EMPTY_RATING };

            next[callId][idx] = {
              ...existing,
              codeSwitch:
                typeof r.code_switch === "number" ? r.code_switch : existing.codeSwitch || 0,
              colloquialness:
                typeof r.colloquialness === "number"
                  ? r.colloquialness
                  : existing.colloquialness || 0,
              emotionalIntelligence:
                typeof r.emotional_intelligence === "number"
                  ? r.emotional_intelligence
                  : existing.emotionalIntelligence || 0,
              sopAdherence:
                typeof r.sop_adherence === "number" ? r.sop_adherence : existing.sopAdherence || 0,
              idealResponse:
                typeof r.ideal_response === "string"
                  ? r.ideal_response
                  : existing.idealResponse || "",
            };
          });

          return next;
        });
      } catch (e) {
        console.error("Unexpected error loading Supabase ratings:", e);
      }
    };

    loadSharedRatings();
  }, []);

  // ---------------------------------------------------
  // Save ratings to localStorage whenever they change
  // ---------------------------------------------------
  useEffect(() => {
    try {
      window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
    } catch (e) {
      console.warn("Failed to save ratings to localStorage", e);
    }
  }, [ratings]);

  // ---------------------------------------------------
  // Save completed calls to localStorage whenever they change
  // ---------------------------------------------------
  useEffect(() => {
    try {
      window.localStorage.setItem(COMPLETED_CALLS_KEY, JSON.stringify(completedCalls));
    } catch (e) {
      console.warn("Failed to save completed calls to localStorage", e);
    }
  }, [completedCalls]);

  // ---------------------------------------------------
  // Sidebar resize mouse handlers
  // ---------------------------------------------------
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingSidebar) return;
      const newWidth = Math.min(Math.max(e.clientX, 200), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizingSidebar) {
        setIsResizingSidebar(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar]);

  const selectedCall = calls.find((c) => c.call_id === selectedCallId);

  // ---------------------------------------------------
  // Update rating locally + send to Supabase
  // field is one of:
  // "codeSwitch" | "colloquialness" | "emotionalIntelligence" | "sopAdherence" | "idealResponse"
  // ---------------------------------------------------
  const handleRatingChange = async (callId, idx, field, value) => {
    const prevForCall = ratings[callId] || {};
    const prevForUtterance = prevForCall[idx] || { ...EMPTY_RATING };

    const updated = {
      ...prevForUtterance,
      [field]: field === "idealResponse" ? value : value || 0,
    };

    // 1) Update local state (drives localStorage)
    setRatings((prev) => ({
      ...prev,
      [callId]: {
        ...(prev[callId] || {}),
        [idx]: updated,
      },
    }));

    // 2) Upsert into Supabase
    try {
      const { data, error } = await supabase
        .from("call_ratings")
        .upsert(
          {
            call_id: callId,
            turn_index: idx,
            user_id: USER_ID,
            code_switch: updated.codeSwitch || 0,
            colloquialness: updated.colloquialness || 0,
            emotional_intelligence: updated.emotionalIntelligence || 0,
            sop_adherence: updated.sopAdherence || 0,
            ideal_response: updated.idealResponse || "",
          },
          {
            onConflict: "call_id,turn_index,user_id",
            ignoreDuplicates: false,
          }
        );

      console.log("Upsert rating result:", { data, error });

      if (error) {
        console.error("Supabase save error:", error);
      }
    } catch (e) {
      console.error("Unexpected Supabase save error:", e);
    }
  };

  const scrollToUtterance = (callId, idx) => {
    const key = `${callId}:${idx}`;
    const el = utteranceRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const openRatingModal = (callId, idx) => {
    setActiveRatingTarget({ callId, idx });
    scrollToUtterance(callId, idx);
  };

  const closeRatingModal = () => {
    setActiveRatingTarget(null);
  };

  // ---------------------------------------------------
  // Toggle call completion
  // ---------------------------------------------------
  const toggleCallCompleted = (callId) => {
    setCompletedCalls((prev) => ({
      ...prev,
      [callId]: !prev[callId],
    }));
  };

  // ---------------------------------------------------
  // Build annotated version of all calls (for download)
  // ---------------------------------------------------
  const buildAnnotatedCalls = () => {
    return calls.map((call) => {
      const callRatings = ratings[call.call_id] || {};
      return {
        call_id: call.call_id,
        dialogue: call.dialogue.map((utt, idx) => {
          const rating = callRatings[idx];
          if (utt.author === "Assistant" && rating) {
            const hasAnyRating =
              rating.codeSwitch ||
              rating.colloquialness ||
              rating.emotionalIntelligence ||
              rating.sopAdherence ||
              (rating.idealResponse || "").trim().length > 0;

            if (hasAnyRating) {
              return {
                ...utt,
                rating_code_switch: rating.codeSwitch || 0,
                rating_colloquialness: rating.colloquialness || 0,
                rating_emotional_intelligence: rating.emotionalIntelligence || 0,
                rating_sop_adherence: rating.sopAdherence || 0,
                rating_ideal_response: rating.idealResponse || "",
              };
            }
          }
          return utt;
        }),
      };
    });
  };

  const handleExportAnnotatedTranscriptsAll = () => {
    const annotated = buildAnnotatedCalls();
    const blob = new Blob([JSON.stringify(annotated, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annotated_transcripts_all_calls.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAnnotatedTranscriptCurrent = () => {
    if (!selectedCall) return;
    const annotatedAll = buildAnnotatedCalls();
    const current = annotatedAll.find((c) => c.call_id === selectedCall.call_id);
    if (!current) return;

    const blob = new Blob([JSON.stringify(current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annotated_${selectedCall.call_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // derive info for active modal
  let activeUtteranceText = "";
  let activeTurnIndex = null;
  let activeRating = { ...EMPTY_RATING };
  if (activeRatingTarget) {
    const c = calls.find((call) => call.call_id === activeRatingTarget.callId);
    const u = c?.dialogue?.[activeRatingTarget.idx];
    activeUtteranceText = u?.text || "";
    activeTurnIndex = activeRatingTarget.idx;
    activeRating =
      ratings[activeRatingTarget.callId]?.[activeRatingTarget.idx] || { ...EMPTY_RATING };
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflowX: "auto",
        overflowY: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 15,
        backgroundColor: "#e5e7eb",
        color: "#111827",
      }}
    >
      {/* Sidebar – list of calls */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: 200,
          maxWidth: 500,
          borderRight: "1px solid #d1d5db",
          overflowY: "auto",
          overflowX: "auto",
          backgroundColor: "#f9fafb",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e5e7eb",
            fontWeight: 700,
            fontSize: 15,
            backgroundColor: "#ffffff",
          }}
        >
          Calls
        </div>
        {calls.map((call, index) => {
          const isSelected = call.call_id === selectedCallId;
          const isCompleted = !!completedCalls[call.call_id];

          let rowBg = "#ffffff";
          if (isCompleted && isSelected) rowBg = "#bbf7d0"; // darker green
          else if (isCompleted) rowBg = "#dcfce7"; // light green
          else if (isSelected) rowBg = "#dbeafe"; // blue

          return (
            <div
              key={call.call_id}
              style={{
                borderBottom: "1px solid #e5e7eb",
                background: rowBg,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <button
                onClick={() => setSelectedCallId(call.call_id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 4,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    whiteSpace: "normal", // show full call_id (wrap instead of ellipsis)
                    color: "#111827",
                  }}
                >
                  Task {index + 1}: {call.call_id}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {call.dialogue?.length ?? 0} turns
                </div>
              </button>
              <button
                onClick={() => toggleCallCompleted(call.call_id)}
                style={{
                  alignSelf: "flex-start",
                  padding: "2px 8px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: "1px solid #10b981",
                  cursor: "pointer",
                  background: isCompleted ? "#10b981" : "#ffffff",
                  color: isCompleted ? "#ffffff" : "#10b981",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {isCompleted ? "Completed ✓" : "Mark done"}
              </button>
            </div>
          );
        })}
      </aside>

      {/* Drag handle between sidebar and main */}
      <div
        onMouseDown={() => setIsResizingSidebar(true)}
        style={{
          width: 4,
          cursor: "col-resize",
          backgroundColor: isResizingSidebar ? "#bfdbfe" : "transparent",
          borderRight: "1px solid #d1d5db",
        }}
      />

      {/* Main – middle transcript + right panel */}
      <main
        style={{
          flex: 1,
          minWidth: 800,
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          backgroundColor: "#e5e7eb",
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {/* Middle – transcript */}
        <section
          style={{
            borderRight: "1px solid #d1d5db",
            padding: 12,
            overflowY: "auto",
            overflowX: "auto",
            backgroundColor: "#f3f4f6",
          }}
        >
          <div
            style={{
              marginBottom: 10,
              fontWeight: 700,
              fontSize: 16,
              color: "#111827",
              whiteSpace: "nowrap",
            }}
          >
            Transcript (click an Assistant turn to rate)
          </div>
          {selectedCall ? (
            selectedCall.dialogue.map((utt, idx) => {
              const key = `${selectedCall.call_id}:${idx}`;
              const isAssistant = utt.author === "Assistant";
              return (
                <div
                  key={key}
                  ref={(el) => (utteranceRefs.current[key] = el)}
                  onClick={() =>
                    isAssistant && openRatingModal(selectedCall.call_id, idx)
                  }
                  style={{
                    marginBottom: 8,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: isAssistant ? "#eff6ff" : "#ffffff",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
                    overflowX: "auto",
                    cursor: isAssistant ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 4,
                      color: isAssistant ? "#1d4ed8" : "#4b5563",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {utt.author} {isAssistant ? `(click to rate)` : ""}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: "#111827",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {utt.text}
                  </div>
                </div>
              );
            })
          ) : (
            <div>Select a call from the left sidebar.</div>
          )}
        </section>

        {/* Right – info + downloads */}
        <section
          style={{
            padding: 12,
            overflowY: "auto",
            overflowX: "auto",
            backgroundColor: "#f3f4f6",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "#111827",
              }}
            >
              Ratings & Export
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleExportAnnotatedTranscriptCurrent}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 999,
                  border: "1px solid #6366f1",
                  cursor: "pointer",
                  background: "#6366f1",
                  color: "#ffffff",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                Download this call
              </button>
              <button
                onClick={handleExportAnnotatedTranscriptsAll}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 999,
                  border: "1px solid #10b981",
                  cursor: "pointer",
                  background: "#10b981",
                  color: "#ffffff",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                Download all calls
              </button>
            </div>
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#4b5563",
              marginBottom: 12,
            }}
          >
            Click any <strong>Assistant</strong> turn in the transcript to open the rating dialog
            and label it on:
            <ul style={{ paddingLeft: 18, marginTop: 4 }}>
              <li>Code-Switch</li>
              <li>Colloquialness</li>
              <li>Emotional Intelligence</li>
              <li>SOP Adherence</li>
            </ul>
          </div>

          {activeTurnIndex != null && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                Currently selected: Assistant @ turn {activeTurnIndex}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#111827",
                  maxHeight: 80,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                {activeUtteranceText}
              </div>
              {METRICS.map((m) => (
                <div
                  key={m.key}
                  style={{
                    fontSize: 12,
                    color: "#4b5563",
                    marginBottom: 4,
                  }}
                >
                  {m.label}:{" "}
                  <strong>
                    {activeRating[m.key] ? `${activeRating[m.key]} / 5` : "not rated"}
                  </strong>
                </div>
              ))}
              <div
                style={{
                  fontSize: 12,
                  color: "#4b5563",
                  marginTop: 6,
                }}
              >
                Ideal response:{" "}
                {activeRating.idealResponse ? (
                  <span>"{activeRating.idealResponse}"</span>
                ) : (
                  <em>not provided</em>
                )}
              </div>
              <button
                style={{
                  marginTop: 10,
                  padding: "4px 8px",
                  fontSize: 12,
                  borderRadius: 999,
                  border: "1px solid #6366f1",
                  backgroundColor: "#6366f1",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
                onClick={() =>
                  activeRatingTarget &&
                  openRatingModal(activeRatingTarget.callId, activeRatingTarget.idx)
                }
              >
                Edit ratings
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Modal for per-utterance ratings */}
      {activeRatingTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={closeRatingModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(800px, 95vw)",
              maxHeight: "90vh",
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow: "0 20px 40px rgba(15,23,42,0.25)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                Rate Assistant @ turn {activeTurnIndex}
              </div>
              <button
                onClick={closeRatingModal}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Click stars for each metric and optionally write the ideal response for this turn.
            </div>

            <div
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb",
                maxHeight: 120,
                overflowY: "auto",
                fontSize: 14,
              }}
            >
              {activeUtteranceText}
            </div>

            <div style={{ marginTop: 4 }}>
              {METRICS.map((metric) => (
                <div
                  key={metric.key}
                  style={{
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      marginBottom: 2,
                      color: "#111827",
                    }}
                  >
                    {metric.label}
                  </div>
                  <div>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          handleRatingChange(
                            activeRatingTarget.callId,
                            activeRatingTarget.idx,
                            metric.key,
                            star
                          )
                        }
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 22,
                          padding: 0,
                          marginRight: 4,
                          color:
                            star <= (activeRating[metric.key] || 0)
                              ? "#f59e0b"
                              : "#d1d5db",
                        }}
                      >
                        ★
                      </button>
                    ))}
                    <span
                      style={{
                        fontSize: 12,
                        color: "#4b5563",
                        marginLeft: 6,
                      }}
                    >
                      {activeRating[metric.key]
                        ? `${activeRating[metric.key]} / 5`
                        : "Not rated"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  fontSize: 13,
                  marginBottom: 4,
                  color: "#111827",
                }}
              >
                Ideal response for this assistant turn
              </div>
              <textarea
                value={activeRating.idealResponse}
                onChange={(e) =>
                  handleRatingChange(
                    activeRatingTarget.callId,
                    activeRatingTarget.idx,
                    "idealResponse",
                    e.target.value
                  )
                }
                placeholder="Write the ideal response you would want the assistant to give here..."
                style={{
                  width: "100%",
                  minHeight: 80,
                  fontSize: 13,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                }}
              />
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={closeRatingModal}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;