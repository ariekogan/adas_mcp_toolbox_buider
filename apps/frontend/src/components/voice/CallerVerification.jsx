import React, { useState, useEffect } from "react";
import {
  getVerificationConfig,
  saveVerificationConfig,
  getKnownPhones,
  addKnownPhone,
  removeKnownPhone,
} from "../../api/voiceVerificationApi.js";
import voiceFetch from "../../api/voiceFetch.js";

// ── Styles (matching TwilioSettings tone) ──
const fieldStyle = { display: "flex", flexDirection: "column", marginBottom: 12 };
const labelStyle = { fontSize: 12, color: "#94a3b8", marginBottom: 4 };
const inputStyle = {
  background: "#1a2332", border: "1px solid #2a3a4a", borderRadius: 6,
  padding: "8px 10px", color: "#e6e6e6", fontSize: 13, outline: "none",
};
const selectStyle = { ...inputStyle, cursor: "pointer" };
const btnStyle = (variant) => ({
  padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 600, marginRight: 8, marginTop: 8,
  background: variant === "primary" ? "#2563eb" : "#334155",
  color: "#fff",
});
const msgStyle = (ok) => ({
  padding: "8px 12px", borderRadius: 6, marginTop: 8, fontSize: 12,
  background: ok ? "#0c2d1b" : "#2d0c0c",
  color: ok ? "#4ade80" : "#f87171",
  border: ok ? "1px solid #166534" : "1px solid #991b1b",
});
const hr = { border: "none", borderTop: "1px solid #2a3a4a", margin: "20px 0" };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 };

export default function CallerVerification() {
  const [config, setConfig] = useState({
    enabled: false,
    method: "phone_lookup",
    maxAttempts: 3,
    onFailure: "hangup",
    skipRecentMinutes: 0,
    securityQuestion: { question: "", answer: "", answerMatchMode: "case_insensitive" },
    customSkill: { skillSlug: "" },
  });
  const [phones, setPhones] = useState([]);
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [skills, setSkills] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getVerificationConfig().then(r => {
      if (r?.ok && r.config) setConfig(c => ({ ...c, ...r.config }));
    }).catch(() => {});
    getKnownPhones().then(r => {
      if (r?.ok && Array.isArray(r.phones)) setPhones(r.phones);
    }).catch(() => {});
    voiceFetch("voice-skills/selection").then(r => r.json()).then(r => {
      if (r?.ok && Array.isArray(r.allSkills)) setSkills(r.allSkills);
    }).catch(() => {});
  }, []);

  const setField = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const setSQ = (key, value) => setConfig(c => ({
    ...c,
    securityQuestion: { ...c.securityQuestion, [key]: value },
  }));

  const onSave = async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await saveVerificationConfig(config);
      setMsg(r?.ok ? { ok: true, text: "Settings saved" } : { ok: false, text: r?.error || "Save failed" });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setLoading(false);
  };

  const onAddPhone = async () => {
    if (!newPhone.trim()) return;
    const num = newPhone.trim().startsWith("+") ? newPhone.trim() : `+${newPhone.trim()}`;
    try {
      const r = await addKnownPhone({ number: num, label: newLabel.trim() });
      if (r?.ok) {
        setPhones(prev => [...prev.filter(p => p.number !== r.phone.number), r.phone]);
        setNewPhone(""); setNewLabel("");
      } else {
        setMsg({ ok: false, text: r?.error || "Failed to add phone" });
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };

  const onRemovePhone = async (number) => {
    try {
      const r = await removeKnownPhone(number);
      if (r?.ok) setPhones(prev => prev.filter(p => p.number !== number));
    } catch {}
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Caller Verification</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
        Require callers to verify their identity before the voice bot executes skills.
      </p>

      {/* Master toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => setField("enabled", e.target.checked)}
            style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#3b82f6" }}
          />
          Require caller verification
        </label>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 3,
          background: config.enabled ? "rgba(59,130,246,0.15)" : "#1e293b",
          color: config.enabled ? "#7dd3fc" : "#475569",
        }}>
          {config.enabled ? "ON" : "OFF"}
        </span>
      </div>

      {config.enabled && (
        <>
          <hr style={hr} />

          {/* Verification method */}
          <div style={sectionTitle}>Method</div>

          {[
            { value: "phone_lookup", title: "Phone Lookup", desc: "Auto-verify if caller's phone is in known contacts" },
            { value: "security_question", title: "Security Question", desc: "Ask a question, verify the answer" },
            { value: "custom_skill", title: "Custom Skill", desc: "Route to a tenant skill for verification" },
          ].map(m => (
            <label key={m.value} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, cursor: "pointer" }}>
              <input type="radio" name="method" value={m.value}
                checked={config.method === m.value} onChange={() => setField("method", m.value)}
                style={{ marginTop: 3, accentColor: "#3b82f6" }} />
              <div>
                <div style={{ fontSize: 13, color: "#cbd5e1" }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{m.desc}</div>
              </div>
            </label>
          ))}

          {/* Security Question config */}
          {config.method === "security_question" && (
            <>
              <hr style={hr} />
              <div style={sectionTitle}>Security Question</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Question</label>
                <input style={inputStyle} value={config.securityQuestion?.question || ""}
                  onChange={e => setSQ("question", e.target.value)}
                  placeholder='e.g. "What is your company name?"' />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Expected Answer</label>
                <input style={inputStyle} value={config.securityQuestion?.answer || ""}
                  onChange={e => setSQ("answer", e.target.value)}
                  placeholder="The correct answer" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Match Mode</label>
                <select style={selectStyle} value={config.securityQuestion?.answerMatchMode || "case_insensitive"}
                  onChange={e => setSQ("answerMatchMode", e.target.value)}>
                  <option value="case_insensitive">Case Insensitive</option>
                  <option value="exact">Exact Match</option>
                  <option value="contains">Contains</option>
                </select>
              </div>
            </>
          )}

          {/* Custom Skill config */}
          {config.method === "custom_skill" && (
            <>
              <hr style={hr} />
              <div style={sectionTitle}>Custom Skill</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Verification Skill</label>
                <select style={selectStyle}
                  value={config.customSkill?.skillSlug || ""}
                  onChange={e => setConfig(c => ({ ...c, customSkill: { ...c.customSkill, skillSlug: e.target.value } }))}>
                  <option value="">-- Select a skill --</option>
                  {skills.map(s => (
                    <option key={s.slug} value={s.slug}>{s.name} ({s.slug})</option>
                  ))}
                </select>
                {skills.length === 0 && (
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>No skills found for this tenant.</div>
                )}
              </div>
            </>
          )}

          <hr style={hr} />

          {/* General settings */}
          <div style={sectionTitle}>Failure Handling</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>Max Attempts</label>
              <input type="number" style={inputStyle} min={1} max={10}
                value={config.maxAttempts} onChange={e => setField("maxAttempts", parseInt(e.target.value, 10) || 3)} />
            </div>
            <div style={{ ...fieldStyle, flex: 1 }}>
              <label style={labelStyle}>On Failure</label>
              <select style={selectStyle} value={config.onFailure} onChange={e => setField("onFailure", e.target.value)}>
                <option value="hangup">Hang Up</option>
                <option value="continue_limited">Continue (Limited)</option>
              </select>
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Skip for recently verified (minutes, 0 = disabled)</label>
            <input type="number" style={inputStyle} min={0} max={10080}
              value={config.skipRecentMinutes} onChange={e => setField("skipRecentMinutes", parseInt(e.target.value, 10) || 0)} />
          </div>

          <hr style={hr} />

          {/* Known Phone Numbers */}
          <div style={sectionTitle}>Known Phone Numbers</div>
          {phones.length === 0 && (
            <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", marginBottom: 8 }}>No phones added yet.</div>
          )}
          {phones.map(p => (
            <div key={p.number} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
              borderBottom: "1px solid #1e293b", fontSize: 13,
            }}>
              <span style={{ color: "#cbd5e1", fontFamily: "monospace", flex: 1 }}>{p.number}</span>
              <span style={{ color: "#64748b", flex: 1 }}>{p.label || "\u2014"}</span>
              <button onClick={() => onRemovePhone(p.number)} style={{
                background: "none", border: "none", color: "#64748b", cursor: "pointer",
                fontSize: 13, padding: "2px 6px",
              }}
                onMouseEnter={e => e.target.style.color = "#f87171"}
                onMouseLeave={e => e.target.style.color = "#64748b"}
              >{"\u2715"}</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input style={{ ...inputStyle, flex: 1 }} value={newPhone}
              onChange={e => setNewPhone(e.target.value)} placeholder="+972501234567" />
            <input style={{ ...inputStyle, flex: 1 }} value={newLabel}
              onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)" />
            <button onClick={onAddPhone} style={{ ...btnStyle(), marginTop: 0 }} disabled={!newPhone.trim()}>Add</button>
          </div>
        </>
      )}

      {/* Save + Status */}
      <div style={{ marginTop: 16 }}>
        <button onClick={onSave} disabled={loading} style={btnStyle("primary")}>
          {loading ? "Saving..." : "Save Settings"}
        </button>
        {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
      </div>
    </div>
  );
}
