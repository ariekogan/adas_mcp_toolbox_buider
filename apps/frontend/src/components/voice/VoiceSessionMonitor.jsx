import React, { useState, useEffect, useCallback } from "react";
import { listSessions, getSessionState } from "../../api/voiceApi.js";

const cardStyle = {
  background: "#1a2332", border: "1px solid #2a3a4a", borderRadius: 8,
  padding: 16, marginBottom: 12, cursor: "pointer",
};
const labelStyle = { fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 };
const valStyle = { fontSize: 13, color: "#e6e6e6", marginTop: 2 };
const btnStyle = {
  padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 600, background: "#334155", color: "#fff", marginBottom: 16,
};
const tagStyle = (color) => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
  fontWeight: 600, background: color, color: "#fff", marginRight: 6,
});

export default function VoiceSessionMonitor() {
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listSessions();
      if (r?.ok) setSessions(r.sessions || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onExpand = async (id) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    try {
      const r = await getSessionState(id);
      if (r?.ok) setDetail(r);
      else setDetail(null);
    } catch { setDetail(null); }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Active Voice Sessions</h2>
      <button style={btnStyle} onClick={refresh} disabled={loading}>Refresh</button>

      {sessions.length === 0 && !loading && (
        <div style={{ color: "#64748b", fontSize: 13 }}>No active sessions.</div>
      )}

      {sessions.map(s => (
        <div key={s.id} style={cardStyle} onClick={() => onExpand(s.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#7dd3fc" }}>{s.id}</span>
              {s.skill_slug && <span style={tagStyle("#1e3a5f")}>{s.skill_slug}</span>}
              {s.running_checks > 0 && <span style={tagStyle("#854d0e")}>{s.running_checks} running</span>}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {s.tail_length} turns | {new Date(s.created_at).toLocaleTimeString()}
            </div>
          </div>

          {expanded === s.id && detail && (
            <div style={{ marginTop: 12, borderTop: "1px solid #2a3a4a", paddingTop: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={labelStyle}>Tenant</div>
                <div style={valStyle}>{detail.state?.head?.tenant_id || s.tenant_id || "default"}</div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={labelStyle}>Entities</div>
                <div style={valStyle}>
                  {detail.state?.head?.entities && Object.keys(detail.state.head.entities).length > 0
                    ? Object.entries(detail.state.head.entities).map(([k, v]) => (
                        <div key={k}><strong>{k}:</strong> {String(v)}</div>
                      ))
                    : <span style={{ color: "#64748b" }}>(none)</span>}
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={labelStyle}>Open Threads</div>
                <div style={valStyle}>
                  {detail.state?.head?.open_threads?.length > 0
                    ? detail.state.head.open_threads.map(th => (
                        <div key={th.thread_id}>[{th.thread_id}] {th.topic} ({th.status})</div>
                      ))
                    : <span style={{ color: "#64748b" }}>(none)</span>}
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={labelStyle}>Running Checks</div>
                <div style={valStyle}>
                  {detail.state?.head?.running_checks && Object.keys(detail.state.head.running_checks).length > 0
                    ? Object.values(detail.state.head.running_checks).map(c => (
                        <div key={c.id}>[{c.id}] {c.label} (job={c.job_id})</div>
                      ))
                    : <span style={{ color: "#64748b" }}>(none)</span>}
                </div>
              </div>

              {detail.head_block && (
                <div style={{ marginBottom: 8 }}>
                  <div style={labelStyle}>Context Head Block</div>
                  <pre style={{ fontSize: 11, color: "#94a3b8", background: "#0e141b", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200 }}>
                    {detail.head_block}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
