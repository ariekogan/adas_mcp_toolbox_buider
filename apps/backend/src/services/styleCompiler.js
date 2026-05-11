/**
 * styleCompiler.js — Phase 1 of §20 v2.3 schema strip.
 *
 * Resolves `solution.style` / `skill.style` into the prose that gets
 * prepended to each skill's persona at deploy time.
 *
 * Architecture:
 *   - Presets live in `docs/style-defaults.yaml` (source-controlled).
 *   - Per-solution customization lives in `solution.style` (free-form prose
 *     OR preset name like "mobile").
 *   - Per-skill override lives in `skill.style` (same shape, REPLACE wins
 *     over solution-level).
 *   - Empty/missing style fields → NO prose prepended (preserves
 *     pre-Phase-1 behavior for existing solutions like mobile-pa).
 *
 * Why no separate Mongo customizations table:
 *   - Builder is FS-only by architectural rule (CLAUDE.md).
 *   - `solution.json` already lives in FS + GitHub via gitSync, so the
 *     `solution.style` field IS the per-tenant customization. Single
 *     source of truth.
 *   - The voice-prompt-editor pattern uses Mongo because it lives in
 *     Core (runtime, multi-actor). The Builder lives at design-time
 *     and edits files — Mongo would be a redundant layer here.
 *   - Chat-driven edits ("make memory-keeper more casual") happen via
 *     ateam_patch updating the file — same flow as every other field.
 *
 * REPLACE semantics:
 *   - `skill.style` present → use it (override). If it's a preset name,
 *     resolve via defaults YAML. If it's prose, use as-is.
 *   - `solution.style` present → use it (default for all skills).
 *   - Both missing → empty string returned. Caller skips prepending.
 *
 * This is purely additive. mobile-pa has neither field set → zero
 * behavior change. The deploy output is byte-identical to pre-Phase-1.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to the repo's docs/ — going up from apps/backend/src/services/
const DEFAULTS_PATH = path.resolve(__dirname, "../../../../docs/style-defaults.yaml");

let _cache = null;
let _cacheMtime = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Load + cache the style defaults YAML. The file is small and rarely
 * changes — a 60s mtime-aware cache is plenty.
 */
function loadDefaults() {
  try {
    const stat = fs.statSync(DEFAULTS_PATH);
    const mtime = stat.mtimeMs;
    if (_cache && mtime === _cacheMtime && (Date.now() - _cacheMtime < CACHE_TTL_MS + mtime)) {
      return _cache;
    }
    const raw = fs.readFileSync(DEFAULTS_PATH, "utf8");
    _cache = yaml.load(raw) || { presets: {}, default: null };
    _cacheMtime = mtime;
    return _cache;
  } catch (err) {
    // Defaults file missing or unreadable — return empty config.
    // This is safe: no styles → no prose prepended.
    console.warn(`[styleCompiler] could not load defaults at ${DEFAULTS_PATH}: ${err.message}`);
    return { presets: {}, default: null };
  }
}

/**
 * Resolve a `style` value into the prose to prepend.
 *
 * @param {string|null|undefined} styleValue  Raw field value from solution
 *                                            or skill. Can be:
 *                                              - undefined/null/"" → no style
 *                                              - preset name (matches a key
 *                                                under `presets:` in YAML)
 *                                              - raw prose (any other string)
 * @returns {string} The prose to prepend. Empty string if no style.
 */
export function resolveStyle(styleValue) {
  if (!styleValue || typeof styleValue !== "string") return "";
  const trimmed = styleValue.trim();
  if (!trimmed) return "";

  const defaults = loadDefaults();
  const presets = defaults?.presets || {};

  // Preset name lookup: short single-word value matching a preset key.
  if (trimmed.length < 40 && /^[a-z][a-z0-9_-]*$/i.test(trimmed) && presets[trimmed]) {
    const preset = presets[trimmed];
    return (preset?.prose || "").trim();
  }

  // Otherwise treat as raw prose.
  return trimmed;
}

/**
 * Resolve the effective style for a given (solution, skill) pair.
 * skill.style REPLACES solution.style if set.
 *
 * @param {Object} solution  Solution definition (has optional `style` field)
 * @param {Object} skill     Skill definition (has optional `style` field)
 * @returns {string} Prose to prepend, or empty string if no style applies.
 */
export function resolveEffectiveStyle(solution, skill) {
  if (skill?.style !== undefined && skill?.style !== null && skill?.style !== "") {
    return resolveStyle(skill.style);
  }
  if (solution?.style !== undefined && solution?.style !== null && solution?.style !== "") {
    return resolveStyle(solution.style);
  }
  // Both empty → check default preset (currently null, may be set in future)
  const defaults = loadDefaults();
  if (defaults?.default && typeof defaults.default === "string") {
    return resolveStyle(defaults.default);
  }
  return "";
}

/**
 * Prepend the effective style to a skill's persona. Returns the new
 * persona text. Idempotent guard: if persona already starts with the
 * style prose (e.g., from a previous deploy where the style was already
 * applied), don't double-prepend.
 *
 * @param {string} persona  Original persona text
 * @param {string} style    Resolved style prose (from resolveEffectiveStyle)
 * @returns {string} Combined persona
 */
export function prependStyleToPersona(persona, style) {
  const p = String(persona || "");
  const s = String(style || "").trim();
  if (!s) return p;
  // Idempotent: if persona already begins with the style block, skip.
  if (p.startsWith(s)) return p;
  return s + "\n\n" + p;
}

/**
 * Convenience: take a deployed-shape solution + skills array, apply the
 * style prepending across every skill, return the mutated skills. Caller
 * is responsible for replacing the original skills with the returned
 * ones before writing to disk / pushing to Core.
 *
 * @param {Object} solution
 * @param {Array}  skills
 * @returns {{ skills: Array, summary: { applied: Array, skipped: Array } }}
 */
export function applyStyleToSkills(solution, skills) {
  const out = [];
  const applied = [];
  const skipped = [];
  if (!Array.isArray(skills)) return { skills: [], summary: { applied, skipped } };

  for (const skill of skills) {
    const style = resolveEffectiveStyle(solution, skill);
    if (!style) {
      out.push(skill);
      skipped.push({ id: skill?.id, reason: "no_style" });
      continue;
    }
    const originalPersona = skill?.role?.persona || "";
    const newPersona = prependStyleToPersona(originalPersona, style);
    if (newPersona === originalPersona) {
      out.push(skill);
      skipped.push({ id: skill?.id, reason: "already_prepended" });
      continue;
    }
    const newSkill = {
      ...skill,
      role: {
        ...(skill.role || {}),
        persona: newPersona,
      },
    };
    out.push(newSkill);
    applied.push({
      id: skill?.id,
      style_source: skill?.style ? "skill" : "solution",
      style_length: style.length,
    });
  }
  return { skills: out, summary: { applied, skipped } };
}

/**
 * Test hook: clear the YAML cache.
 */
export function _clearCache() {
  _cache = null;
  _cacheMtime = 0;
}

export default {
  resolveStyle,
  resolveEffectiveStyle,
  prependStyleToPersona,
  applyStyleToSkills,
  _clearCache,
};
