import React, { useState, useEffect } from "react";
import { loadSettings, saveSettings, loadNumbers, wireNumber, getTwilioStatus } from "../../api/twilioApi.js";

const fieldStyle = { display: "flex", flexDirection: "column", marginBottom: 12 };
const labelStyle = { fontSize: 12, color: "#94a3b8", marginBottom: 4 };
const inputStyle = {
  background: "#1a2332", border: "1px solid #2a3a4a", borderRadius: 6,
  padding: "8px 10px", color: "#e6e6e6", fontSize: 13, outline: "none",
};
const btnStyle = (variant) => ({
  padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 600, marginRight: 8, marginTop: 8,
  background: variant === "primary" ? "#2563eb" : variant === "success" ? "#16a34a" : "#334155",
  color: "#fff",
});
const readonlyStyle = {
  ...inputStyle, background: "#0e141b", color: "#64748b", cursor: "default",
};
const msgStyle = (ok) => ({
  padding: "8px 12px", borderRadius: 6, marginTop: 8, fontSize: 12,
  background: ok ? "#0c2d1b" : "#2d0c0c",
  color: ok ? "#4ade80" : "#f87171",
  border: ok ? "1px solid #166534" : "1px solid #991b1b",
});

export default function TwilioSettings() {
  const [form, setForm] = useState({
    twilioAccountSid: "", twilioAuthToken: "", twilioPublicBaseUrl: "",
    twilioTenantId: "default", twilioSkillSlug: "",
  });
  const [numbers, setNumbers] = useState([]);
  const [selectedSid, setSelectedSid] = useState("");
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings().then(r => {
      if (r?.ok && r.settings) {
        setForm(f => ({
          ...f,
          twilioAccountSid: r.settings.twilioAccountSid || "",
          twilioAuthToken: r.settings.twilioAuthToken || "",
          twilioPublicBaseUrl: r.settings.twilioPublicBaseUrl || "",
          twilioTenantId: r.settings.twilioTenantId || "default",
          twilioSkillSlug: r.settings.twilioSkillSlug || "",
        }));
      }
    });
    getTwilioStatus().then(r => { if (r?.ok) setStatus(r); });
  }, []);

  const onChange = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const onSave = async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await saveSettings(form);
      setMsg(r?.ok ? { ok: true, text: "Settings saved" } : { ok: false, text: r?.error || "Save failed" });
      getTwilioStatus().then(r => { if (r?.ok) setStatus(r); });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setLoading(false);
  };

  const onLoadNumbers = async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await loadNumbers();
      if (r?.ok) {
        setNumbers(r.numbers || []);
        setMsg({ ok: true, text: `Found ${r.numbers?.length || 0} number(s)` });
      } else {
        setMsg({ ok: false, text: r?.error || "Failed to load numbers" });
      }
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setLoading(false);
  };

  const onWire = async () => {
    if (!selectedSid) return;
    setLoading(true); setMsg(null);
    try {
      const r = await wireNumber(selectedSid);
      if (r?.ok) {
        setMsg({ ok: true, text: `Wired ${r.phoneNumber || selectedSid} -> ${r.voiceUrl}` });
        getTwilioStatus().then(r => { if (r?.ok) setStatus(r); });
      } else {
        setMsg({ ok: false, text: r?.error || "Wire failed" });
      }
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setLoading(false);
  };

  const baseUrl = (form.twilioPublicBaseUrl || "").replace(/\/+$/, "");

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Twilio (Realtime Phone Calls)</h2>

      <div style={fieldStyle}>
        <label style={labelStyle}>Twilio Account SID</label>
        <input style={inputStyle} value={form.twilioAccountSid} onChange={onChange("twilioAccountSid")} placeholder="AC..." />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Twilio Auth Token</label>
        <input style={inputStyle} type="password" value={form.twilioAuthToken} onChange={onChange("twilioAuthToken")} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Public HTTPS Base URL (ngrok)</label>
        <input style={inputStyle} value={form.twilioPublicBaseUrl} onChange={onChange("twilioPublicBaseUrl")} placeholder="https://abc123.ngrok-free.app" />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Tenant ID</label>
        <input style={inputStyle} value={form.twilioTenantId} onChange={onChange("twilioTenantId")} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Default Skill Slug</label>
        <input style={inputStyle} value={form.twilioSkillSlug} onChange={onChange("twilioSkillSlug")} />
      </div>

      <button style={btnStyle("primary")} onClick={onSave} disabled={loading}>Save Settings</button>

      <hr style={{ border: "none", borderTop: "1px solid #2a3a4a", margin: "20px 0" }} />

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Phone Number Wiring</h3>

      <button style={btnStyle()} onClick={onLoadNumbers} disabled={loading}>Load Numbers</button>

      {numbers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <select
            style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
            value={selectedSid}
            onChange={(e) => setSelectedSid(e.target.value)}
          >
            <option value="">-- Select a number --</option>
            {numbers.map(n => (
              <option key={n.sid} value={n.sid}>
                {n.phoneNumber} ({n.friendlyName})
              </option>
            ))}
          </select>
          <button style={btnStyle("success")} onClick={onWire} disabled={!selectedSid || loading}>
            Wire Number
          </button>
        </div>
      )}

      {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}

      <hr style={{ border: "none", borderTop: "1px solid #2a3a4a", margin: "20px 0" }} />

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Derived Endpoints</h3>
      <div style={fieldStyle}>
        <label style={labelStyle}>Voice Webhook</label>
        <input style={readonlyStyle} readOnly value={baseUrl ? `${baseUrl}/twilio/voice` : "(set base URL first)"} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Media Stream</label>
        <input style={readonlyStyle} readOnly value={baseUrl ? `wss://${baseUrl.replace(/^https?:\/\//, "")}/twilio/stream` : "(set base URL first)"} />
      </div>

      {status && (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          Configured: {status.configured ? "Yes" : "No"} | Wired Number: {status.wiredNumberSid || "none"}
        </div>
      )}
    </div>
  );
}
