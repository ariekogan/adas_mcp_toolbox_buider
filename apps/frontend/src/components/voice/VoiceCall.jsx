// VoiceCall.jsx — Runtime Debug view: left (session prompt + state) + right (call widget)
// Left: Voice frontend in debug mode (session prompt, conversation state — no tab bar)
// Right: VoiceCallMini (call controls, transcript, runtime state panel)

import React, { useRef, useEffect, useState, useCallback } from "react";
import { getTenant, getAuthToken } from "../../api/client.js";

const VOICE_URL = window.__VOICE_URL || "https://voice.ateam-ai.com";

export default function VoiceCall() {
  const miniRef = useRef(null);
  const [callState, setCallState] = useState("idle");

  const tenant = getTenant();
  const token = getAuthToken();

  // Debug mode iframe — session prompt + conversation state only (no tab bar)
  const debugSrc = `${VOICE_URL}?mode=debug&tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Mini mode iframe — call controls + transcript
  const miniSrc = `${VOICE_URL}?mode=mini&tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Listen for call state updates from mini iframe
  useEffect(() => {
    function onMessage(ev) {
      if (ev.data?.source === "voice-mini" && ev.data.type === "call-state") {
        setCallState(ev.data.state || "idle");
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
      height: "calc(100vh - 120px)",
      display: "flex",
      gap: 0,
      overflow: "hidden",
    }}>
      {/* Left: Session Prompt + Conversation State (debug mode — no tabs) */}
      <iframe
        src={debugSrc}
        title="Voice Debug"
        style={{
          flex: "1 1 55%",
          border: "none",
          borderRight: "1px solid #1e293b",
          background: "#0d1117",
        }}
      />

      {/* Right: Call controls + transcript */}
      <div style={{ flex: "1 1 45%", display: "flex", flexDirection: "column", background: "#0d1117" }}>

        {/* Call control bar */}
        <div style={{
          flexShrink: 0, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid #1e293b",
        }}>
          <button
            onClick={() => sendCommand("start")}
            disabled={isActive}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              fontSize: 12, fontWeight: 700, cursor: isActive ? "default" : "pointer",
              background: "#16a34a", color: "#fff",
              opacity: isActive ? 0.4 : 1,
            }}
          >Start Call</button>
          <button
            onClick={() => sendCommand("stop")}
            disabled={!isActive}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              fontSize: 12, fontWeight: 700, cursor: !isActive ? "default" : "pointer",
              background: "#dc2626", color: "#fff",
              opacity: !isActive ? 0.4 : 1,
            }}
          >End Call</button>
          <span style={{
            fontSize: 11, fontWeight: 600, marginLeft: 4,
            color: callState === "connected" ? "#4ade80"
              : callState === "connecting" ? "#facc15" : "#64748b",
          }}>
            {callState === "idle" ? "Ready" : callState === "connecting" ? "Connecting..." : callState === "connected" ? "Connected" : "Error"}
          </span>
        </div>

        {/* Mini call iframe */}
        <iframe
          ref={miniRef}
          src={miniSrc}
          title="Voice Call"
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow="microphone *"
          style={{
            flex: 1,
            border: "none",
            background: "#0d1117",
          }}
        />
      </div>
    </div>
  );
}
