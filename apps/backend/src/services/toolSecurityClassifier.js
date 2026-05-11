/**
 * toolSecurityClassifier.js — Phase 2 of §20 v2.3 schema strip.
 *
 * Auto-classify tools that don't have an explicit security classification.
 * Reads pattern rules from `docs/tool-security-defaults.yaml` and applies
 * them at deploy time. The author can ALWAYS override by setting
 * `tool.security.classification` explicitly in skill.json (REPLACE wins).
 *
 * Why this is critical (Tier-1 risk from the architectural review):
 *
 *   Auto-classification gets a tool wrong → security violation. The strip
 *   makes the platform more autonomous, but security gates can never be
 *   silently wrong-and-loose. We apply the fail-safe principle:
 *
 *     - When a tool matches no pattern → classify as "internal" (not
 *       "public"). Internal requires an authenticated actor; public is
 *       open to anyone. Defaulting to internal protects against accidental
 *       exposure.
 *     - When a tool MIGHT be destructive (verb-pattern unclear) → classify
 *       as destructive (gated by confirmation). Annoying-but-safe over
 *       silent-data-loss.
 *
 * Architecture:
 *   - Rules in docs/tool-security-defaults.yaml (source-controlled,
 *     diffable, the canonical default library).
 *   - Per-skill / per-tool overrides via explicit
 *     `tool.security.classification` (REPLACE).
 *   - Per-skill deny-list via `skill.excluded_tools[]` (separate from
 *     classification — this is a hard "this tool is unavailable to this
 *     skill regardless of classification").
 *
 * NOT in scope here:
 *   - Enforcement. This file CLASSIFIES; the engine enforces.
 *   - Auto-importing tool bridges from connectors. That's Phase 2b
 *     (the actual `connector.tools/list` round-trip). For now,
 *     classification operates on whatever tools are in skill.tools[].
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = path.resolve(__dirname, "../../../../docs/tool-security-defaults.yaml");

// Valid classification values — matches existing validator schema.
const VALID_CLASSIFICATIONS = new Set([
  "public",
  "internal",
  "pii_read",
  "pii_write",
  "financial",
  "destructive",
]);

let _cache = null;
let _cacheMtime = 0;

function loadDefaults() {
  try {
    const stat = fs.statSync(DEFAULTS_PATH);
    const mtime = stat.mtimeMs;
    if (_cache && mtime === _cacheMtime) return _cache;
    const raw = fs.readFileSync(DEFAULTS_PATH, "utf8");
    const parsed = yaml.load(raw) || {};
    _cache = {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      default: typeof parsed.default === "string" ? parsed.default : "internal",
    };
    // Pre-compile regexes for speed
    for (const rule of _cache.rules) {
      try {
        rule._regex = new RegExp(rule.pattern, "i");
      } catch (err) {
        console.warn(`[toolSecurityClassifier] invalid regex '${rule.pattern}': ${err.message}`);
        rule._regex = null;
      }
    }
    _cacheMtime = mtime;
    return _cache;
  } catch (err) {
    console.warn(`[toolSecurityClassifier] could not load defaults: ${err.message}`);
    return { rules: [], default: "internal" };
  }
}

/**
 * Classify a tool by name. Returns the classification + matching rule's
 * rationale (or "default" if no rule matched).
 *
 * @param {string} toolName  Full tool name, e.g. "gmail.send" or "memory.recall"
 * @returns {{ classification: string, rule_index: number, rationale: string }}
 */
export function classifyTool(toolName) {
  if (!toolName || typeof toolName !== "string") {
    return { classification: "internal", rule_index: -1, rationale: "no_tool_name" };
  }
  const { rules, default: defaultClassification } = loadDefaults();
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule._regex) continue;
    if (rule._regex.test(toolName)) {
      const classification = VALID_CLASSIFICATIONS.has(rule.classification)
        ? rule.classification
        : defaultClassification;
      return {
        classification,
        rule_index: i,
        rationale: rule.rationale || rule.pattern,
      };
    }
  }
  return {
    classification: defaultClassification,
    rule_index: -1,
    rationale: "no_pattern_matched_default_applied",
  };
}

/**
 * Apply auto-classification to a tools[] array. Tools with explicit
 * `security.classification` are PRESERVED (REPLACE wins). Tools without
 * get classified via pattern matching.
 *
 * @param {Array} tools  skill.tools[] array. Each entry expected to have
 *                       at least `name`.
 * @returns {{ tools: Array, summary: { classified: Array, preserved: Array } }}
 */
export function classifyToolList(tools) {
  if (!Array.isArray(tools)) return { tools: [], summary: { classified: [], preserved: [] } };

  const out = [];
  const classified = [];
  const preserved = [];

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") {
      out.push(tool);
      continue;
    }
    // REPLACE check: existing classification wins.
    const existingCls = tool?.security?.classification;
    if (existingCls && VALID_CLASSIFICATIONS.has(existingCls)) {
      out.push(tool);
      preserved.push({ name: tool.name, classification: existingCls, source: "author" });
      continue;
    }
    // Classify by pattern.
    const result = classifyTool(tool.name);
    out.push({
      ...tool,
      security: {
        ...(tool.security || {}),
        classification: result.classification,
        _auto_classified: true,
        _rationale: result.rationale,
      },
    });
    classified.push({
      name: tool.name,
      classification: result.classification,
      rule_index: result.rule_index,
      rationale: result.rationale,
    });
  }

  return { tools: out, summary: { classified, preserved } };
}

/**
 * Apply `excluded_tools[]` to drop tools by name pattern.
 * Patterns support glob-style `*` (converted to regex internally).
 *
 * @param {Array} tools          skill.tools[]
 * @param {Array<string>} excludePatterns  list of name patterns
 * @returns {{ tools: Array, summary: { excluded: Array } }}
 */
export function applyExclusions(tools, excludePatterns) {
  if (!Array.isArray(tools)) return { tools: [], summary: { excluded: [] } };
  if (!Array.isArray(excludePatterns) || excludePatterns.length === 0) {
    return { tools, summary: { excluded: [] } };
  }
  const regexes = excludePatterns.map(p => {
    // glob → regex: '*' → '.*'; other characters escape regex meta.
    const escaped = String(p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try { return new RegExp(`^${escaped}$`, "i"); } catch { return null; }
  }).filter(Boolean);

  const out = [];
  const excluded = [];
  for (const tool of tools) {
    if (!tool?.name) { out.push(tool); continue; }
    const matched = regexes.some(r => r.test(tool.name));
    if (matched) {
      excluded.push({ name: tool.name });
    } else {
      out.push(tool);
    }
  }
  return { tools: out, summary: { excluded } };
}

/**
 * Test hook: clear the YAML cache.
 */
export function _clearCache() {
  _cache = null;
  _cacheMtime = 0;
}

export default {
  classifyTool,
  classifyToolList,
  applyExclusions,
  _clearCache,
};
