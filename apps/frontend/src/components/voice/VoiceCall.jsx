// VoiceCall.jsx — Runtime Debug view: left (session prompt + state) + right (call widget)
// Left panel shows the Voice frontend full page via iframe (session prompt, conversation state, context)
// Right panel shows VoiceCallMini via iframe (call controls, transcript, runtime state)

import React, { useRef, useEffect, useState, useCallback } from "react";
import { getTenant, getAuthToken } from "../../api/client.js";

const VOICE_URL = window.__VOICE_URL || "https://voice.ateam-ai.com";

export default function VoiceCall() {
  const miniRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [callState, setCallState] = useState("idle");

  const tenant = getTenant();
  const token = getAuthToken();

  // Full mode iframe — shows session prompt + conversation state (left panel)
  const fullSrc = `${VOICE_URL}?tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Mini mode iframe — call controls + transcript (right panel)
  const miniSrc = `${VOICE_URL}?mode=mini&tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Listen for call state updates from mini iframe
  useEffect(() => {
    function onMessage(ev) {
      const d = ev.data;
      if (d?.source === "voice-mini" && d.type === "call-state") {
        setCallState(d.state || "idle");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Send command to mini iframe
  const sendCommand = useCallback((command) => {
    if (!miniRef.current?.contentWindow) return;
    miniRef.current.contentWindow.postMessage(
      { source: "adas-host", type: "call-command", command, authToken: token || undefined },
      "*"
    );
  }, [token]);

  const isActive = callState === "connecting" || callState === "connected";

  return (
    <div style={{
      height: "calc(100vh - 80px)",
      margin: -16,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Call controls bar */}
      <div style={{
        flexShrink: 0, padding: "8px 16px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid #1e293b",
        background: "#0e141b",
      }}>
        <button
          onClick={() => sendCommand("start")}
          disabled={isActive}
          style={{
            padding: "6px 18px", borderRadius: 6, border: "none",
            fontSize: 12, fontWeight: 700, cursor: isActive ? "default" : "pointer",
            background: "#16a34a", color: "#fff",
            opacity: isActive ? 0.4 : 1,
          }}
        >Start Call</button>
        <button
          onClick={() => sendCommand("stop")}
          disabled={!isActive}
          style={{
            padding: "6px 18px", borderRadius: 6, border: "none",
            fontSize: 12, fontWeight: 700, cursor: !isActive ? "default" : "pointer",
            background: "#dc2626", color: "#fff",
            opacity: !isActive ? 0.4 : 1,
          }}
        >End Call</button>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: callState === "connected" ? "#4ade80"
            : callState === "connecting" ? "#facc15" : "#64748b",
        }}>
          {callState === "idle" ? "Ready" : callState === "connecting" ? "Connecting..." : callState === "connected" ? "Connected — speak now" : "Error"}
        </span>
      </div>

      {/* Split: left (full debug) + right (mini call) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: Session Prompt + Conversation State */}
        <iframe
          src={fullSrc}
          title="Voice Debug"
          style={{
            flex: "1 1 55%",
            border: "none",
            borderRight: "1px solid #1e293b",
            background: "#0d1117",
          }}
        />

        {/* Right: Call widget (mini) */}
        <iframe
          ref={miniRef}
          src={miniSrc}
          onLoad={() => setLoaded(true)}
          title="Voice Call"
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow="microphone *"
          style={{
            flex: "1 1 45%",
            border: "none",
            background: "#0d1117",
          }}
        />
      </div>
    </div>
  );
}
