import React, { useState, useEffect, useRef } from "react";
import voiceFetch from "../../api/voiceFetch.js";

const SECTION_LABELS = {
  language: "Language",
  persona: "Persona",
  welcome: "Welcome Message",
  behavior_rules: "Behavior Rules",
  information_gathering: "Information Gathering",
  skill_acknowledgment: "Skill Acknowledgment",
  tool_usage: "Tool Usage",
  async_behavior: "Async Behavior",
  context_reserved: "Context / Reserved",
};

export default function PromptEditor() {
  const [config, setConfig] = useState(null);
  const [customizedKeys, setCustomizedKeys] = useState([]);
  const [customizations, setCustomizations] = useState({});
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  async function loadConfig() {
    try {
      const r = await voiceFetch("voice-prompt");
      const data = await r.json();
      if (data.ok) {
        setConfig(data.config);
        setCustomizedKeys(data.customizedKeys || []);
      }
      // Also load raw customizations
      const r2 = await voiceFetch("voice-prompt/custom");
      const d2 = await r2.json();
      if (d2.ok) setCustomizations(d2.customizations || {});
    } catch (e) {
      console.error("Failed to load prompt config:", e);
    }
  }

  async function sendMessage() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setChatHistory(h => [...h, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const r = await voiceFetch("voice-prompt/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await r.json();
      if (data.ok) {
        setChatHistory(h => [...h, { role: "assistant", text: data.explanation, patch: data.patch }]);
        setConfig(data.merged);
        setCustomizations(data.customizations || {});
        setCustomizedKeys(Object.keys(data.customizations || {}));
      } else {
        setChatHistory(h => [...h, { role: "error", text: data.error || "Failed" }]);
      }
    } catch (e) {
      setChatHistory(h => [...h, { role: "error", text: String(e) }]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    try {
      const r = await voiceFetch("voice-prompt/preview", { method: "POST" });
      const data = await r.json();
      setPreview(data.ok ? data.prompt : "Error: " + data.error);
    } catch (e) {
      setPreview("Error: " + e);
    }
  }

  async function handleReset() {
    if (!confirm("Reset all customizations to defaults?")) return;
    try {
      const r = await voiceFetch("voice-prompt/reset", { method: "POST" });
      const data = await r.json();
      if (data.ok) {
        setConfig(data.config);
        setCustomizedKeys([]);
        setCustomizations({});
        setChatHistory(h => [...h, { role: "assistant", text: "All customizations have been reset to defaults." }]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!config) return <div style={{ padding: 24, color: "#94a3b8" }}>Loading prompt config...</div>;

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 80px)" }}>
      {/* LEFT: Chat interface */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h3 style={{ margin: "0 0 12px", color: "#7dd3fc", fontSize: 15 }}>Prompt Fine-Tuning Chat</h3>
        <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 12 }}>
          Describe changes in natural language. Example: "Change the welcome to say Hi, I'm your support agent"
        </p>

        {/* Chat messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: 12, borderRadius: 8,
          background: "#111827", border: "1px solid #1e3a5f",
        }}>
          {chatHistory.length === 0 && (
            <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>
              Start chatting to customize the voice prompt...
            </div>
          )}
          {chatHistory.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 10, padding: "8px 12px", borderRadius: 8,
              background: msg.role === "user" ? "#1e3a5f" : msg.role === "error" ? "#7f1d1d" : "#1a2332",
              textAlign: msg.role === "user" ? "right" : "left",
              fontSize: 13, lineHeight: 1.5,
            }}>
              <div style={{ color: msg.role === "user" ? "#93c5fd" : msg.role === "error" ? "#fca5a5" : "#e2e8f0" }}>
                {msg.text}
              </div>
              {msg.patch && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", color: "#64748b", fontSize: 11 }}>Applied patch</summary>
                  <pre style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap", marginTop: 4 }}>
                    {JSON.stringify(msg.patch, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to change..."
            disabled={loading}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 13,
              background: "#1a2332", border: "1px solid #2a3a4a", color: "#e2e8f0",
              outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: loading ? "#374151" : "#2563eb", color: "#fff",
              border: "none", cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={handlePreview} style={actionBtn("#1e3a5f")}>Preview Compiled Prompt</button>
          <button onClick={handleReset} style={actionBtn("#7f1d1d")}>Reset to Defaults</button>
        </div>
      </div>

      {/* RIGHT: Config viewer + customizations */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <h3 style={{ margin: "0 0 12px", color: "#7dd3fc", fontSize: 15 }}>Current Configuration</h3>

        {/* User customizations section */}
        {Object.keys(customizations).length > 0 && (
          <div style={{
            marginBottom: 16, padding: 12, borderRadius: 8,
            background: "#172554", border: "1px solid #2563eb",
          }}>
            <h4 style={{ margin: "0 0 8px", color: "#60a5fa", fontSize: 13 }}>Your Customizations</h4>
            <pre style={{ fontSize: 11, color: "#93c5fd", whiteSpace: "pre-wrap", margin: 0 }}>
              {JSON.stringify(customizations, null, 2)}
            </pre>
          </div>
        )}

        {/* Full merged config */}
        {Object.entries(config).map(([key, value]) => {
          const isCustomized = customizedKeys.includes(key);
          return (
            <div key={key} style={{
              marginBottom: 8, padding: 10, borderRadius: 8,
              background: isCustomized ? "#172554" : "#111827",
              border: `1px solid ${isCustomized ? "#2563eb" : "#1e293b"}`,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 600, marginBottom: 4,
                color: isCustomized ? "#60a5fa" : "#94a3b8",
              }}>
                {SECTION_LABELS[key] || key}
                {isCustomized && <span style={{ fontSize: 10, marginLeft: 6, color: "#3b82f6" }}>(customized)</span>}
              </div>
              <pre style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "pre-wrap", margin: 0 }}>
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </pre>
            </div>
          );
        })}

        {/* Preview overlay */}
        {preview !== null && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)", zIndex: 2000, display: "flex",
            justifyContent: "center", alignItems: "center", padding: 40,
          }} onClick={() => setPreview(null)}>
            <div style={{
              maxWidth: 800, maxHeight: "80vh", overflow: "auto",
              background: "#0f172a", borderRadius: 12, padding: 24,
              border: "1px solid #2563eb",
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", color: "#7dd3fc" }}>Compiled Prompt Preview</h3>
              <pre style={{ fontSize: 12, color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{preview}</pre>
              <button onClick={() => setPreview(null)} style={{ ...actionBtn("#2563eb"), marginTop: 12 }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function actionBtn(bg) {
  return {
    padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
    background: bg, color: "#e2e8f0", border: "1px solid #334155",
    cursor: "pointer",
  };
}
