import React, { useState } from "react";
import VoiceCall from "./VoiceCall.jsx";
import PromptEditor from "./PromptEditor.jsx";
import TwilioSettings from "./TwilioSettings.jsx";
import VoiceSessionMonitor from "./VoiceSessionMonitor.jsx";
import SkillVoiceEditor from "./SkillVoiceEditor.jsx";
import CallerVerification from "./CallerVerification.jsx";

const TABS = [
  { id: "call", label: "Runtime Debug" },
  { id: "prompt", label: "Refine Behaviour" },
  { id: "settings", label: "Twilio Settings" },
  { id: "monitor", label: "Voice Sessions" },
  { id: "skills", label: "Skill Voice Editor" },
  { id: "verify", label: "Caller Verification" },
];

export default function VoiceView({ onClose }) {
  const [tab, setTab] = useState("call");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Top bar tabs */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 0,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        paddingLeft: 8,
      }}>
        {/* Back button */}
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "8px 12px 8px 4px", fontSize: 16, color: "var(--text-muted)",
          }}
          title="Back to Solution"
        >&#8592;</button>

        {/* Tabs */}
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                transition: "color 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto", padding: tab === "call" ? 0 : 16 }}>
        {tab === "call" && <VoiceCall />}
        {tab === "prompt" && <PromptEditor />}
        {tab === "skills" && <SkillVoiceEditor />}
        {tab === "settings" && <TwilioSettings />}
        {tab === "monitor" && <VoiceSessionMonitor />}
        {tab === "verify" && <CallerVerification />}
      </div>
    </div>
  );
}
