/**
 * VoiceChannelTab — Solution-level voice configuration.
 * Shown inside SolutionPanel as the "Voice Channel" tab.
 * Focuses on: bot prompt tuning, caller verification, skill voice settings.
 * Delegates runtime debug/sessions to the full Voice Admin panel.
 */
import React, { useState } from "react";
import PromptEditor from "./PromptEditor.jsx";
import CallerVerification from "./CallerVerification.jsx";
import SkillVoiceEditor from "./SkillVoiceEditor.jsx";

const SECTIONS = [
  { id: "prompt", label: "Bot Behaviour" },
  { id: "verify", label: "Caller Verification" },
  { id: "skills", label: "Skill Voice Settings" },
];

const tabBarStyle = {
  display: "flex",
  gap: 0,
  borderBottom: "1px solid var(--border)",
  padding: "0 16px",
  background: "var(--bg-secondary)",
};

const tabBtnStyle = (active) => ({
  padding: "8px 16px",
  fontSize: 12,
  fontWeight: active ? 600 : 400,
  color: active ? "var(--accent)" : "var(--text-muted)",
  background: "transparent",
  border: "none",
  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  cursor: "pointer",
  transition: "all 0.15s",
});

export default function VoiceChannelTab() {
  const [section, setSection] = useState("prompt");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sub-tabs */}
      <div style={tabBarStyle}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            style={tabBtnStyle(section === s.id)}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {section === "prompt" && <PromptEditor />}
        {section === "verify" && <CallerVerification />}
        {section === "skills" && <SkillVoiceEditor />}
      </div>
    </div>
  );
}
