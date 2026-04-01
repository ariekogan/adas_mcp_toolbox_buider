// VoiceCall.jsx — Embeds the Voice frontend as an iframe (single source of truth).
// The actual WebRTC/call logic lives in apps/voice/frontend/ and is served
// at voice.ateam-ai.com. This eliminates the 600+ line duplicated component.
// Parent controls (Start/End Call) send commands via postMessage to the iframe.

import React, { useRef, useEffect, useState, useCallback } from "react";
import { getTenant, getAuthToken } from "../../api/client.js";

const VOICE_URL = window.__VOICE_URL || "https://voice.ateam-ai.com";

export default function VoiceCall() {
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [callState, setCallState] = useState("idle"); // idle | connecting | connected | error

  const tenant = getTenant();
  const token = getAuthToken();

  const src = `${VOICE_URL}?mode=mini&tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Listen for call state updates from iframe
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

  // Send command to iframe
  const sendCommand = useCallback((command) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
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
      {/* Call controls */}
      <div style={{
        flexShrink: 0, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid #1e293b",
        background: "#0e141b",
      }}>
        <button
          onClick={() => sendCommand("start")}
          disabled={isActive}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            fontSize: 13, fontWeight: 700, cursor: isActive ? "default" : "pointer",
            background: "#16a34a", color: "#fff",
            opacity: isActive ? 0.4 : 1, transition: "opacity 0.15s",
          }}
        >
          Start Call
        </button>
        <button
          onClick={() => sendCommand("stop")}
          disabled={!isActive}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            fontSize: 13, fontWeight: 700, cursor: !isActive ? "default" : "pointer",
            background: "#dc2626", color: "#fff",
            opacity: !isActive ? 0.4 : 1, transition: "opacity 0.15s",
          }}
        >
          End Call
        </button>
        <span style={{
          fontSize: 12, fontWeight: 600, marginLeft: 8,
          color: callState === "connected" ? "#4ade80"
            : callState === "connecting" ? "#facc15"
            : "#64748b",
        }}>
          {callState === "idle" && "Ready"}
          {callState === "connecting" && "Connecting..."}
          {callState === "connected" && "Connected — speak now"}
          {callState === "error" && "Error"}
        </span>
      </div>

      {/* Voice frontend iframe */}
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => setLoaded(true)}
        title="Voice Call"
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="microphone *"
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          background: "#0d1117",
        }}
      />
    </div>
  );
}
