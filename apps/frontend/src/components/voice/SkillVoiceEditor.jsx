import React, { useState, useEffect, useCallback } from "react";
import voiceFetch from "../../api/voiceFetch.js";

/* ─── Styles ─── */
const panelBox = {
  background: "#141c27", border: "1px solid #1e293b", borderRadius: 8,
  padding: 16, marginBottom: 16,
};
const sectionTitle = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
  color: "#64748b", marginBottom: 10,
};
const btnStyle = (variant, disabled) => ({
  padding: "8px 18px", borderRadius: 6, border: "none",
  cursor: disabled ? "default" : "pointer",
  fontSize: 13, fontWeight: 600, marginRight: 8,
  background: variant === "primary" ? "#2563eb" : variant === "success" ? "#16a34a" : variant === "danger" ? "#dc2626" : "#334155",
  color: "#fff", opacity: disabled ? 0.5 : 1, transition: "all 0.15s",
});
const msgBox = (ok) => ({
  padding: "8px 12px", borderRadius: 6, marginTop: 10, fontSize: 12,
  background: ok ? "#0c2d1b" : "#2d0c0c",
  color: ok ? "#4ade80" : "#f87171",
});
const chipStyle = (active) => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10,
  fontWeight: 600, marginLeft: 6,
  background: active ? "#16a34a22" : "#64748b22",
  color: active ? "#4ade80" : "#64748b",
  border: `1px solid ${active ? "#16a34a" : "#334155"}`,
});

export default function SkillVoiceEditor() {
  const [allSkills, setAllSkills] = useState([]);
  const [enabled, setEnabled] = useState([]);
  const [disabled, setDisabled] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // ─── Load current selection + all skills ───
  const loadSelection = useCallback(async () => {
    setLoading(true);
    try {
      const [selRes, manRes] = await Promise.all([
        voiceFetch("voice-skills/selection").then(r => r.json()),
        voiceFetch("manifest").then(r => r.json()),
      ]);

      const all = selRes?.allSkills || [];
      setAllSkills(all);

      const sel = selRes?.selection || {};
      if (sel.enabled?.length || sel.disabled?.length) {
        const en = sel.enabled || [];
        const dis = sel.disabled || [];
        // Auto-add newly discovered skills (not in either list) to enabled
        const listed = new Set([...en, ...dis]);
        const newSlugs = all.filter(s => !listed.has(s.slug)).map(s => s.slug);
        setEnabled([...en, ...newSlugs]);
        setDisabled(dis);
      } else {
        setEnabled(all.map(s => s.slug));
        setDisabled([]);
      }

      if (manRes?.manifest) setManifest(manRes.manifest);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSelection(); }, [loadSelection]);

  // ─── Save selection + trigger recompile ───
  const onSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await voiceFetch("voice-skills/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, disabled }),
      });
      const json = await r.json();
      if (json.ok) {
        setManifest(json.manifest);
        setMsg({ ok: true, text: `Saved & recompiled: ${json.manifest?.skills?.length || 0} skills` });
      } else {
        setMsg({ ok: false, text: json.error || "Save failed" });
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setSaving(false);
  };

  // ─── Drag handlers ───
  const onDragStart = (idx) => (e) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (idx) => (e) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const onDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...enabled];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      setEnabled(next);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ─── Move up/down ───
  const move = (idx, dir) => {
    const next = [...enabled];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setEnabled(next);
  };

  // ─── Toggle enable/disable ───
  const toggleSkill = (slug) => {
    if (enabled.includes(slug)) {
      setEnabled(enabled.filter(s => s !== slug));
      setDisabled([...disabled, slug]);
    } else {
      setDisabled(disabled.filter(s => s !== slug));
      setEnabled([...enabled, slug]);
    }
  };

  // ─── Helper: get skill info ───
  const getSkillInfo = (slug) => allSkills.find(s => s.slug === slug) || { slug, name: slug, description: "" };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

      {/* ═══════════════════════════════════════════════════ */}
      {/* LEFT PANEL: Skill Selection + Ordering             */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{ flex: "1 1 50%", minWidth: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Voice Skills</h2>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Drag to reorder. Top skill = PRIMARY (highest priority).
        </p>

        {/* ─── Enabled Skills ─── */}
        <div style={panelBox}>
          <div style={sectionTitle}>
            Enabled Skills
            <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
              ({enabled.length})
            </span>
          </div>

          {enabled.length === 0 && (
            <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>
              No skills enabled.
            </div>
          )}

          {enabled.map((slug, idx) => {
            const info = getSkillInfo(slug);
            const isPrimary = idx === 0;
            const isDragging = dragIdx === idx;
            const isDragOver = dragOverIdx === idx;

            return (
              <div
                key={slug}
                draggable
                onDragStart={onDragStart(idx)}
                onDragOver={onDragOver(idx)}
                onDragEnd={onDragEnd}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", marginBottom: 3, borderRadius: 6,
                  background: isDragOver ? "#1e3a5f" : isDragging ? "#1a2332" : isPrimary ? "#0c2d1b" : "#1a2332",
                  border: `1px solid ${isDragOver ? "#2563eb" : isPrimary ? "#16a34a55" : "#1e293b"}`,
                  cursor: "grab", transition: "all 0.1s",
                  opacity: isDragging ? 0.5 : 1,
                }}
              >
                {/* Position number */}
                <div style={{ color: "#475569", fontSize: 11, fontWeight: 700, width: 18, textAlign: "center", flexShrink: 0 }}>
                  {idx + 1}
                </div>

                {/* Up/Down arrows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 0, flexShrink: 0 }}>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    style={{
                      background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer",
                      color: idx === 0 ? "#334155" : "#64748b", fontSize: 9, padding: 0, lineHeight: 1,
                    }}
                  >▲</button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === enabled.length - 1}
                    style={{
                      background: "none", border: "none",
                      cursor: idx === enabled.length - 1 ? "default" : "pointer",
                      color: idx === enabled.length - 1 ? "#334155" : "#64748b", fontSize: 9, padding: 0, lineHeight: 1,
                    }}
                  >▼</button>
                </div>

                {/* Skill info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isPrimary ? "#4ade80" : "#e6e6e6" }}>
                      {info.name}
                    </span>
                    {isPrimary && <span style={chipStyle(true)}>PRIMARY</span>}
                  </div>
                  {info.description && (
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {info.description}
                    </div>
                  )}
                </div>

                {/* Disable button */}
                <button
                  onClick={() => toggleSkill(slug)}
                  style={{
                    background: "none", border: "1px solid #991b1b", borderRadius: 4, padding: "2px 8px",
                    color: "#f87171", fontSize: 10, cursor: "pointer", flexShrink: 0,
                  }}
                >
                  Disable
                </button>
              </div>
            );
          })}
        </div>

        {/* ─── Disabled Skills ─── */}
        {disabled.length > 0 && (
          <div style={panelBox}>
            <div style={sectionTitle}>
              Disabled
              <span style={{ color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
                ({disabled.length})
              </span>
            </div>

            {disabled.map(slug => {
              const info = getSkillInfo(slug);
              return (
                <div
                  key={slug}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", marginBottom: 3, borderRadius: 6,
                    background: "#1a2332", border: "1px solid #1e293b", opacity: 0.6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>{info.name}</span>
                  </div>
                  <button
                    onClick={() => toggleSkill(slug)}
                    style={{
                      background: "none", border: "1px solid #16a34a", borderRadius: 4, padding: "2px 8px",
                      color: "#4ade80", fontSize: 10, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    Enable
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Save + Status ─── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={btnStyle("primary", saving || loading)} onClick={onSave} disabled={saving || loading}>
            {saving ? "Compiling..." : "Save & Recompile"}
          </button>
          <button style={btnStyle(null, loading)} onClick={loadSelection} disabled={loading}>
            Reload
          </button>
        </div>

        {msg && <div style={msgBox(msg.ok)}>{msg.text}</div>}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* RIGHT PANEL: Compiled Manifest                     */}
      {/* ═══════════════════════════════════════════════════ */}
      <div style={{ flex: "1 1 50%", minWidth: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Compiled Manifest</h2>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          {manifest?.compiledBy
            ? <>Compiled by <strong style={{ color: "#7dd3fc" }}>{manifest.compiledBy}</strong> at {manifest.compiledAt?.replace("T", " ").slice(0, 19)}</>
            : "Not yet compiled"
          }
        </p>

        {/* ─── Routing Summary ─── */}
        {manifest?.routing_summary && (
          <div style={{
            fontSize: 13, color: "#cbd5e1", background: "#0c2d1b", padding: "10px 14px",
            borderRadius: 8, marginBottom: 16, border: "1px solid #16a34a33", lineHeight: 1.5,
          }}>
            <div style={{ ...sectionTitle, marginBottom: 6, color: "#4ade80" }}>Routing Summary</div>
            {manifest.routing_summary}
          </div>
        )}

        {/* ─── Compiled Skills ─── */}
        {manifest?.skills?.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {manifest.skills.map(sk => (
              <div key={sk.slug} style={{
                padding: "10px 14px", borderRadius: 8,
                background: "#0e141b", border: "1px solid #1e293b",
              }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 600,
                    color: sk.voice?.priority === "high" ? "#4ade80" : "#e6e6e6",
                  }}>
                    {sk.voice?.voice_title || sk.name}
                  </span>
                  <span style={chipStyle(sk.voice?.priority === "high")}>
                    {sk.voice?.priority || "?"}
                  </span>
                  {sk.voice?.async && <span style={chipStyle(false)}>async</span>}
                  {sk.voice?.requires_confirmation && <span style={chipStyle(false)}>confirm</span>}
                  {sk.voice?.side_effects && sk.voice.side_effects !== "none" && (
                    <span style={chipStyle(false)}>{sk.voice.side_effects}</span>
                  )}
                </div>

                {/* Voice description */}
                {sk.voice?.voice_description && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    {sk.voice.voice_description}
                  </div>
                )}

                {/* Invocation hint */}
                {sk.voice?.invocation_hint && (
                  <div style={{ fontSize: 11, color: "#7dd3fc", marginBottom: 2 }}>
                    Hint: "{sk.voice.invocation_hint}"
                  </div>
                )}

                {/* Re-entry phrase */}
                {sk.voice?.reentry_phrase && (
                  <div style={{ fontSize: 11, color: "#a78bfa", marginBottom: 2 }}>
                    Re-entry: "{sk.voice.reentry_phrase}"
                  </div>
                )}

                {/* Trigger phrases */}
                {sk.voice?.user_trigger_phrases?.length > 0 && (
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                    Triggers: {sk.voice.user_trigger_phrases.slice(0, 4).map(p => `"${p}"`).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            ...panelBox, color: "#475569", fontSize: 13, fontStyle: "italic", textAlign: "center", padding: 40,
          }}>
            No compiled manifest available. Save & Recompile to generate.
          </div>
        )}
      </div>
    </div>
  );
}
