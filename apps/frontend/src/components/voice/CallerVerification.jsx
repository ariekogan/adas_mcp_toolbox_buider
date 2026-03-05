import React, { useState, useEffect } from "react";
import {
  getVerificationConfig,
  saveVerificationConfig,
  getKnownPhones,
  addKnownPhone,
  removeKnownPhone,
} from "../../api/voiceVerificationApi.js";

// ── Shared styles (same as TwilioSettings) ──
const fieldStyle = { display: "flex", flexDirection: "column", marginBottom: 12 };
const labelStyle = { fontSize: 12, color: "#94a3b8", marginBottom: 4 };
const inputStyle = {
  background: "#1a2332", border: "1px solid #2a3a4a", borderRadius: 6,
  padding: "8px 10px", color: "#e6e6e6", fontSize: 13, outline: "none",
};
const selectStyle = { ...inputStyle, cursor: "pointer" };
const btnStyle = (variant) => ({
  padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 600, marginRight: 8,
  background: variant === "primary" ? "#2563eb" : variant === "danger" ? "#dc2626" : "#334155",
  color: "#fff",
  opacity: variant === "disabled" ? 0.5 : 1,
});
const msgStyle = (ok) => ({
  padding: "8px 12px", borderRadius: 6, marginTop: 8, fontSize: 12,
  background: ok ? "#0c2d1b" : "#2d0c0c",
  color: ok ? "#4ade80" : "#f87171",
  border: ok ? "1px solid #166534" : "1px solid #991b1b",
});
const sectionStyle = {
  marginTop: 16, padding: "12px 14px", borderRadius: 8,
  background: "#0f1923", border: "1px solid #1e2d3d",
};
const radioStyle = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" };

export default function CallerVerification() {
  // ── Config form state ──
  const [config, setConfig] = useState({
    enabled: false,
    method: "phone_lookup",
    maxAttempts: 3,
    onFailure: "hangup",
    skipRecentMinutes: 0,
    securityQuestion: { question: "", answer: "", answerMatchMode: "case_insensitive" },
    customSkill: { skillSlug: "" },
  });

  // ── Phone list state ──
  const [phones, setPhones] = useState([]);
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // ── UI state ──
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Load on mount ──
  useEffect(() => {
    getVerificationConfig().then(r => {
      if (r?.ok && r.config) setConfig(c => ({ ...c, ...r.config }));
    }).catch(() => {});
    getKnownPhones().then(r => {
      if (r?.ok && Array.isArray(r.phones)) setPhones(r.phones);
    }).catch(() => {});
  }, []);

  // ── Config helpers ──
  const setField = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const setSQ = (key, value) => setConfig(c => ({
    ...c,
    securityQuestion: { ...c.securityQuestion, [key]: value },
  }));

  // ── Save config ──
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

  // ── Phone list actions ──
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
    <div style={{ maxWidth: 520 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#e6e6e6" }}>Caller Verification</h3>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b" }}>
        Require callers to verify their identity before the voice bot executes skills.
      </p>

      {/* ── Master toggle ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => setField("enabled", e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          Require caller verification
        </label>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
          background: config.enabled ? "#0c2d1b" : "#1e293b",
          color: config.enabled ? "#4ade80" : "#64748b",
        }}>
          {config.enabled ? "ON" : "OFF"}
        </span>
      </div>

      {config.enabled && (
        <>
          {/* ── Verification method ── */}
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, marginBottom: 8, fontWeight: 600 }}>Verification Method</div>

            <label style={radioStyle}>
              <input type="radio" name="method" value="phone_lookup"
                checked={config.method === "phone_lookup"} onChange={() => setField("method", "phone_lookup")} />
              <div>
                <div style={{ fontSize: 13, color: "#e6e6e6" }}>Phone Lookup</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Auto-verify if caller's phone is in known contacts</div>
              </div>
            </label>

            <label style={radioStyle}>
              <input type="radio" name="method" value="security_question"
                checked={config.method === "security_question"} onChange={() => setField("method", "security_question")} />
              <div>
                <div style={{ fontSize: 13, color: "#e6e6e6" }}>Security Question</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Ask a question, verify the answer</div>
              </div>
            </label>

            <label style={radioStyle}>
              <input type="radio" name="method" value="custom_skill"
                checked={config.method === "custom_skill"} onChange={() => setField("method", "custom_skill")} />
              <div>
                <div style={{ fontSize: 13, color: "#e6e6e6" }}>Custom Skill</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Route to a tenant skill for verification</div>
              </div>
            </label>
          </div>

          {/* ── Method-specific config ── */}
          {config.method === "security_question" && (
            <div style={sectionStyle}>
              <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8 }}>Security Question Config</div>
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
            </div>
          )}

          {config.method === "custom_skill" && (
            <div style={sectionStyle}>
              <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8 }}>Custom Skill Config</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Skill Slug</label>
                <input style={inputStyle} value={config.customSkill?.skillSlug || ""}
                  onChange={e => setConfig(c => ({ ...c, customSkill: { ...c.customSkill, skillSlug: e.target.value } }))}
                  placeholder="e.g. identity-verifier" />
              </div>
            </div>
          )}

          {/* ── General settings ── */}
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8 }}>Settings</div>
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
          </div>

          {/* ── Known Phone Numbers (always shown — useful for all methods via skipRecent) ── */}
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, fontWeight: 600, marginBottom: 8 }}>Known Phone Numbers</div>
            {phones.length === 0 && (
              <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", marginBottom: 8 }}>No phones added yet.</div>
            )}
            {phones.map(p => (
              <div key={p.number} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                borderBottom: "1px solid #1e2d3d", fontSize: 13,
              }}>
                <span style={{ color: "#e6e6e6", fontFamily: "monospace", flex: 1 }}>{p.number}</span>
                <span style={{ color: "#64748b", flex: 1 }}>{p.label || "—"}</span>
                <button onClick={() => onRemovePhone(p.number)} style={{
                  background: "none", border: "none", color: "#f87171", cursor: "pointer",
                  fontSize: 14, padding: "2px 6px",
                }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={newPhone}
                onChange={e => setNewPhone(e.target.value)} placeholder="+972501234567" />
              <input style={{ ...inputStyle, flex: 1 }} value={newLabel}
                onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)" />
              <button onClick={onAddPhone} style={btnStyle("primary")} disabled={!newPhone.trim()}>Add</button>
            </div>
          </div>
        </>
      )}

      {/* ── Save + Status ── */}
      <div style={{ marginTop: 16 }}>
        <button onClick={onSave} disabled={loading} style={btnStyle("primary")}>
          {loading ? "Saving..." : "Save Settings"}
        </button>
        {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
      </div>
    </div>
  );
}
