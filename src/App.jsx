import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const RATINGS_STORAGE_KEY = "call_rating_dashboard_ratings_v1";
const USER_ID = "demo-user"; // TODO: replace with real user id once you add auth

function App() {
  const [calls, setCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [ratings, setRatings] = useState({}); // { callId: { idx: { stars, comment } } }

  const utteranceRefs = useRef({}); // { "callId:idx": HTMLDivElement }

  // ---------------------------------------------------
  // Load transcripts.json from /public
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
  // Load ratings from localStorage on first mount
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
  // Load shared ratings from Supabase on startup
  // ---------------------------------------------------
  useEffect(() => {
    const loadSharedRatings = async () => {
      try {
        const { data, error } = await supabase
          .from("call_ratings")
          .select("*");

        if (error) {
          console.error("Error loading ratings from Supabase:", error);
          return;
        }

        if (!data) return;

        const formatted = {};
        data.forEach((r) => {
          if (!formatted[r.call_id]) formatted[r.call_id] = {};
          formatted[r.call_id][r.turn_index] = {
            stars: r.stars,
            comment: r.comment || "",
          };
        });

        setRatings(formatted);
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
      window.localStorage.setItem(
        RATINGS_STORAGE_KEY,
        JSON.stringify(ratings)
      );
    } catch (e) {
      console.warn("Failed to save ratings to localStorage", e);
    }
  }, [ratings]);

  const selectedCall = calls.find((c) => c.call_id === selectedCallId);

  // ---------------------------------------------------
  // Update rating locally + send to Supabase
  // (stars AND comment both saved)
  // ---------------------------------------------------
  const handleRatingChange = (callId, idx, field, value) => {
    setRatings((prev) => {
      const prevForCall = prev[callId] || {};
      const prevForUtterance = prevForCall[idx] || {
        stars: 0,
        comment: "",
      };

      const updatedUtterance = {
        ...prevForUtterance,
        [field]: value,
      };

      const updatedRatings = {
        ...prev,
        [callId]: {
          ...prevForCall,
          [idx]: updatedUtterance,
        },
      };

      // Fire-and-forget Supabase upsert using the latest values
      const { stars, comment } = updatedUtterance;
      supabase
        .from("call_ratings")
        .upsert({
          call_id: callId,
          turn_index: idx,
          stars: stars || 0,
          comment: comment || "",
          user_id: USER_ID,
        })
        .then(({ error }) => {
          if (error) {
            console.error("Supabase save error:", error);
          }
        })
        .catch((e) => {
          console.error("Unexpected Supabase save error:", e);
        });

      return updatedRatings;
    });
  };

  const scrollToUtterance = (callId, idx) => {
    const key = `${callId}:${idx}`;
    const el = utteranceRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Helper: build annotated version of all calls using current ratings
  const buildAnnotatedCalls = () => {
    return calls.map((call) => {
      const callRatings = ratings[call.call_id] || {};
      return {
        call_id: call.call_id,
        dialogue: call.dialogue.map((utt, idx) => {
          const rating = callRatings[idx];
          if (utt.author === "Assistant" && rating && rating.stars > 0) {
            return {
              ...utt,
              rating_stars: rating.stars,
              rating_comment: rating.comment || "",
            };
          }
          return utt;
        }),
      };
    });
  };

  // Download annotated JSON for ALL calls
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

  // Download annotated JSON for ONLY the current call
  const handleExportAnnotatedTranscriptCurrent = () => {
    if (!selectedCall) return;
    const annotatedAll = buildAnnotatedCalls();
    const current = annotatedAll.find(
      (c) => c.call_id === selectedCall.call_id
    );
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 15,
        backgroundColor: "#e5e7eb",
        color: "#111827",
      }}
    >
      {/* Sidebar – list of calls */}
      <aside
        style={{
          width: 260,
          borderRight: "1px solid #d1d5db",
          overflowY: "auto",
          backgroundColor: "#f9fafb",
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
        {calls.map((call, index) => (
          <button
            key={call.call_id}
            onClick={() => setSelectedCallId(call.call_id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: 10,
              border: "none",
              borderBottom: "1px solid #e5e7eb",
              background:
                call.call_id === selectedCallId ? "#dbeafe" : "#ffffff",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 2,
                color: "#6b7280",
              }}
            >
              {/* Serial number for each task */}
              Task {index + 1}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight:
                  call.call_id === selectedCallId ? 700 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#111827",
              }}
            >
              {call.call_id}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {call.dialogue?.length ?? 0} turns
            </div>
          </button>
        ))}
      </aside>

      {/* Main – split view */}
      <main
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          backgroundColor: "#e5e7eb",
        }}
      >
        {/* Left – transcript */}
        <section
          style={{
            borderRight: "1px solid #d1d5db",
            padding: 12,
            overflowY: "auto",
            backgroundColor: "#f3f4f6",
          }}
        >
          <div
            style={{
              marginBottom: 10,
              fontWeight: 700,
              fontSize: 16,
              color: "#111827",
            }}
          >
            Transcript
          </div>
          {selectedCall ? (
            selectedCall.dialogue.map((utt, idx) => {
              const key = `${selectedCall.call_id}:${idx}`;
              const isAssistant = utt.author === "Assistant";
              return (
                <div
                  key={key}
                  ref={(el) => (utteranceRefs.current[key] = el)}
                  style={{
                    marginBottom: 8,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: isAssistant ? "#eff6ff" : "#ffffff",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
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
                    }}
                  >
                    {utt.author}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: "#111827",
                      lineHeight: 1.45,
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

        {/* Right – ratings */}
        <section
          style={{
            padding: 12,
            overflowY: "auto",
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
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "#111827",
              }}
            >
              Rate Assistant Turns
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
                }}
              >
                Download all calls
              </button>
            </div>
          </div>

          {selectedCall ? (
            selectedCall.dialogue
              .map((utt, idx) => ({ ...utt, idx }))
              .filter((u) => u.author === "Assistant")
              .map((u) => {
                const r =
                  ratings[selectedCall.call_id]?.[u.idx] || {
                    stars: 0,
                    comment: "",
                  };
                return (
                  <div
                    key={u.idx}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 12,
                      backgroundColor: "#ffffff",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
                    }}
                    onMouseEnter={() =>
                      scrollToUtterance(selectedCall.call_id, u.idx)
                    }
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      Assistant @ turn {u.idx}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        marginBottom: 8,
                        maxHeight: 60,
                        overflow: "hidden",
                        color: "#111827",
                      }}
                    >
                      {u.text}
                    </div>

                    {/* Stars */}
                    <div style={{ marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() =>
                            handleRatingChange(
                              selectedCall.call_id,
                              u.idx,
                              "stars",
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
                              star <= r.stars ? "#f59e0b" : "#d1d5db",
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>

                    {/* Comment */}
                    <textarea
                      placeholder="Custom feedback for this assistant utterance..."
                      value={r.comment}
                      onChange={(e) =>
                        handleRatingChange(
                          selectedCall.call_id,
                          u.idx,
                          "comment",
                          e.target.value
                        )
                      }
                      style={{
                        width: "100%",
                        minHeight: 55,
                        fontSize: 13,
                        padding: 6,
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        resize: "vertical",
                        backgroundColor: "#ffffff",
                        color: "#111827",
                      }}
                    />
                  </div>
                );
              })
          ) : (
            <div>Select a call to start rating.</div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;