/**
 * engineCompiler.js — Phase 4 of §20 v2.3 schema strip.
 *
 * Resolve `skill.engine` from preset names OR explicit objects into the
 * full engine block that the runtime expects.
 *
 * Resolution order (REPLACE semantics):
 *   1. skill.engine is an object → use as-is (author override wins).
 *      Even partial objects are preserved verbatim — no auto-merge from
 *      presets, to avoid hidden inheritance bugs.
 *   2. skill.engine is a string → look up the preset by name.
 *   3. skill.engine is missing/null → apply the default preset.
 *
 * Presets live in `docs/engine-defaults.yaml` (source-controlled,
 * diffable, the canonical default library). Same voice-prompt pattern
 * we use for style + tool security.
 *
 * mobile-pa skills have explicit engine objects → unchanged.
 * New stripped skills can write `engine: "fast"` and get a full block.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = path.resolve(__dirname, "../../../../docs/engine-defaults.yaml");

let _cache = null;
let _cacheMtime = 0;

function loadDefaults() {
  try {
    const stat = fs.statSync(DEFAULTS_PATH);
    const mtime = stat.mtimeMs;
    if (_cache && mtime === _cacheMtime) return _cache;
    const raw = fs.readFileSync(DEFAULTS_PATH, "utf8");
    _cache = yaml.load(raw) || { presets: {}, default: null };
    _cacheMtime = mtime;
    return _cache;
  } catch (err) {
    console.warn(`[engineCompiler] could not load defaults at ${DEFAULTS_PATH}: ${err.message}`);
    return { presets: {}, default: null };
  }
}

/**
 * Resolve a skill's `engine` field into the full engine block.
 *
 * @param {*} engineValue  Raw value of skill.engine. Can be:
 *                          - undefined/null → apply default preset
 *                          - string → preset name lookup
 *                          - object → use as-is (REPLACE)
 * @returns {{ engine: Object|null, source: string }}
 *          source:
 *            "explicit"       — author wrote an object, returned verbatim
 *            "preset:<name>"  — preset name resolved
 *            "default:<name>" — default preset applied (missing value)
 *            "skip"           — couldn't resolve, return null
 */
export function resolveEngine(engineValue) {
  // Object → REPLACE. Return verbatim.
  if (engineValue && typeof engineValue === "object" && !Array.isArray(engineValue)) {
    return { engine: engineValue, source: "explicit" };
  }

  const defaults = loadDefaults();
  const presets = defaults?.presets || {};

  // String → preset lookup
  if (typeof engineValue === "string" && engineValue.trim()) {
    const name = engineValue.trim();
    if (presets[name]) {
      // Strip preset metadata fields (label) before returning the engine block
      const { label: _label, ...preset } = presets[name];
      return { engine: deepClone(preset), source: `preset:${name}` };
    }
    // Unknown preset → fall through to default with warning
    console.warn(`[engineCompiler] unknown engine preset "${name}", falling back to default`);
  }

  // Missing → default
  const defaultName = defaults?.default;
  if (defaultName && presets[defaultName]) {
    const { label: _label, ...preset } = presets[defaultName];
    return { engine: deepClone(preset), source: `default:${defaultName}` };
  }

  return { engine: null, source: "skip" };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Test hook: clear the YAML cache.
 */
export function _clearCache() {
  _cache = null;
  _cacheMtime = 0;
}

export default {
  resolveEngine,
  _clearCache,
};
