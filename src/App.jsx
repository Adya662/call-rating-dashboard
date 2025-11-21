import { useEffect, useRef, useState } from "react";

function App() {
  const [calls, setCalls] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [ratings, setRatings] = useState({}); // { callId: { idx: { stars, comment } } }

  const utteranceRefs = useRef({}); // { "callId:idx": HTMLDivElement }

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

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif", fontSize: 14 }}>
      {/* Sidebar – list of calls */}
      <aside
        style={{
          width: 260,
          borderRight: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 600 }}>
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
              borderBottom: "1px solid #f0f0f0",
              background:
                call.call_id === selectedCallId ? "#e5e7eb" : "white",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight:
                  call.call_id === selectedCallId ? 600 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Task: {call.call_id}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              {call.dialogue?.length ?? 0} turns
            </div>
          </button>
        ))}
      </aside>

      {/* Main – split view */}
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Left – transcript */}
        <section
          style={{
            borderRight: "1px solid #ddd",
            padding: 12,
            overflowY: "auto",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Transcript</div>
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
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: isAssistant ? "#f3f4f6" : "white",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      marginBottom: 4,
                      color: isAssistant ? "#1f2933" : "#6b7280",
                    }}
                  >
                    {utt.author}
                  </div>
                  <div>{utt.text}</div>
                </div>
              );
            })
          ) : (
            <div>Select a call from the left sidebar.</div>
          )}
        </section>

        {/* Right – ratings */}
        <section
          style={{ padding: 12, overflowY: "auto", position: "relative" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Rate Assistant Turns</div>
            <button
              onClick={handleExportRatings}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                cursor: "pointer",
                background: "white",
              }}
            >
              Export ratings JSON
            </button>
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
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 10,
                      backgroundColor: "#f9fafb",
                    }}
                    onMouseEnter={() =>
                      scrollToUtterance(selectedCall.call_id, u.idx)
                    }
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      Assistant @ turn {u.idx}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        marginBottom: 6,
                        maxHeight: 40,
                        overflow: "hidden",
                      }}
                    >
                      {u.text}
                    </div>

                    {/* Stars */}
                    <div style={{ marginBottom: 6 }}>
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
                            fontSize: 18,
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
                        minHeight: 40,
                        fontSize: 12,
                        padding: 4,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        resize: "vertical",
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