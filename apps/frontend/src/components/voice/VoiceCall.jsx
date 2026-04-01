// VoiceCall.jsx — Embeds the Voice frontend as an iframe (single source of truth).
// The actual WebRTC/call logic lives in apps/voice/frontend/ and is served
// at voice.ateam-ai.com. This eliminates the 600+ line duplicated component.

import React, { useRef, useEffect, useState } from "react";
import { getTenant, getAuthToken } from "../../api/client.js";

// Voice frontend URL — in production served via Cloudflare tunnel
const VOICE_URL = window.__VOICE_URL || "https://voice.ateam-ai.com";

export default function VoiceCall() {
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  const tenant = getTenant();
  const token = getAuthToken();

  // Build iframe URL — full mode (not mini), call tab selected
  const src = `${VOICE_URL}?tenant=${encodeURIComponent(tenant || "")}&authToken=${encodeURIComponent(token || "")}`;

  // Forward tenant/token changes to iframe
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "adas-tenant-change", tenant },
      "*"
    );
  }, [tenant, loaded]);

  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    if (token) {
      iframeRef.current.contentWindow.postMessage(
        { type: "adas-auth-token", token },
        "*"
      );
    }
  }, [token, loaded]);

  return (
    <div style={{
      height: "calc(100vh - 80px)",
      margin: -16,  // counteract parent padding
      display: "flex",
      flexDirection: "column",
    }}>
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => setLoaded(true)}
        title="Voice Call"
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
