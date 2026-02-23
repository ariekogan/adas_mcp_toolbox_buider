import React, { useState } from "react";
import VoiceCall from "./VoiceCall.jsx";
import PromptEditor from "./PromptEditor.jsx";
import TwilioSettings from "./TwilioSettings.jsx";
import VoiceSessionMonitor from "./VoiceSessionMonitor.jsx";
import SkillVoiceEditor from "./SkillVoiceEditor.jsx";

const TABS = [
  { id: "call", label: "Call", icon: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z", abbr: "CL" },
  { id: "prompt", label: "Prompt", icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z", abbr: "PR" },
  { id: "skills", label: "Skills", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z", abbr: "SK" },
  { id: "settings", label: "Twilio", icon: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z", abbr: "TW" },
  { id: "monitor", label: "Sessions", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5V5h7v12z", abbr: "SS" },
];

export default function VoiceView({ onClose }) {
  const [tab, setTab] = useState("call");
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left sidebar — voice sub-navigation */}
      <div style={{
        width: 52,
        minWidth: 52,
        height: "100%",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 2,
      }}>
        {/* Back button */}
        <button
          onClick={onClose}
          onMouseEnter={() => setHovered("back")}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: 40, height: 40, border: "none", borderRadius: 8,
            background: hovered === "back" ? "var(--bg-hover)" : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 8,
          }}
          title="Back to Solution"
        >
          <span style={{
            fontSize: 18,
            color: hovered === "back" ? "var(--accent)" : "var(--text-muted)",
            lineHeight: 1,
          }}>&#8592;</span>
        </button>

        {/* Separator */}
        <div style={{ width: 28, height: 1, background: "var(--border)", marginBottom: 8 }} />

        {/* Tab icons */}
        {TABS.map(t => {
          const isActive = tab === t.id;
          const isHov = hovered === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: 40, height: 40, border: "none", borderRadius: 8,
                background: isActive ? "var(--bg-tertiary)" : isHov ? "var(--bg-hover)" : "transparent",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
              }}
              title={t.label}
            >
              <svg viewBox="0 0 24 24" width={16} height={16}>
                <path d={t.icon} fill={isActive ? "var(--accent)" : isHov ? "var(--text-secondary)" : "var(--text-muted)"} />
              </svg>
              <span style={{
                fontSize: 8, fontWeight: 600, marginTop: 1, letterSpacing: 0.5,
                color: isActive ? "var(--accent)" : "var(--text-muted)",
              }}>{t.abbr}</span>
            </button>
          );
        })}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {tab === "call" && <VoiceCall />}
        {tab === "prompt" && <PromptEditor />}
        {tab === "skills" && <SkillVoiceEditor />}
        {tab === "settings" && <TwilioSettings />}
        {tab === "monitor" && <VoiceSessionMonitor />}
      </div>
    </div>
  );
}
