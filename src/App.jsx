import { useEffect, useRef, useState } from "react";

function App() {
  const [calls, setCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [ratings, setRatings] = useState({}); // { callId: { idx: { stars, comment } } }

  const utteranceRefs = useRef({}); // { "callId:idx": HTMLDivElement }

  // Load transcripts.json from /public
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

  const selectedCall = calls.find((c) => c.call_id === selectedCallId);

  const handleRatingChange = (callId, idx, field, value) => {
    setRatings((prev) => {
      const prevForCall = prev[callId] || {};
      const prevForUtterance = prevForCall[idx] || { stars: 0, comment: "" };

      return {
        ...prev,
        [callId]: {
          ...prevForCall,
          [idx]: {
            ...prevForUtterance,
            [field]: value,
          },
        },
      };
    });
  };

  const scrollToUtterance = (callId, idx) => {
    const key = `${callId}:${idx}`;
    const el = utteranceRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Export only the ratings object (per-call, per-turn)
  const handleExportRatings = () => {
    const blob = new Blob([JSON.stringify(ratings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assistant_ratings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export full transcripts with ratings merged into Assistant turns
  const handleExportAnnotatedTranscripts = () => {
    const annotated = calls.map((call) => {
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

    const blob = new Blob([JSON.stringify(annotated, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annotated_transcripts.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 15, // slightly larger base font
        backgroundColor: "#e5e7eb", // light grey background
        color: "#111827", // dark text
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
        {calls.map((call) => (
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
                fontSize: 13,
                fontWeight:
                  call.call_id === selectedCallId ? 700 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#111827",
              }}
            >
              Task: {call.call_id}
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
                      fontSize: 16, // larger transcript text
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
                onClick={handleExportRatings}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 999,
                  border: "1px solid #3b82f6",
                  cursor: "pointer",
                  background: "#3b82f6",
                  color: "#ffffff",
                  fontWeight: 500,
                }}
              >
                Export ratings
              </button>
              <button
                onClick={handleExportAnnotatedTranscripts}
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
                Export annotated transcripts
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