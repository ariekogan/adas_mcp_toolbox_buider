/**
 * fixSuggester.js — Phase 8 of §20 v2.3 schema strip.
 *
 * Reduces deploy round-trips by suggesting concrete fixes for common
 * validation errors. Without this, Claude reads an error like
 * "INVALID_VERBOSITY: brief", guesses "concise", redeploys, hits the
 * next error. 3-5 round-trips per change.
 *
 * The suggester maps error codes to deterministic, high-confidence
 * fixes. `suggested_fix: { path, replacement }` is added to each issue
 * the suggester understands. Deploy can auto-apply when
 * `auto_apply_fixes: true` AND confidence >= 0.9.
 *
 * Pattern-based (not LLM) because:
 *   - Validation error codes are stable (INVALID_VERBOSITY,
 *     UNCLASSIFIED_TOOL, MISSING_SCENARIO_TITLE, etc.).
 *   - Pattern fixes are deterministic, no LLM variance.
 *   - LLM-driven fixes can land as Phase 8b if needed, on top of this.
 *
 * Confidence levels:
 *   - 1.0: enum mismatch with single safe replacement (e.g.,
 *     INVALID_VERBOSITY: brief → concise — the validator already knows
 *     the allowed values).
 *   - 0.95: typo correction with high lexical similarity.
 *   - 0.9: missing-field defaults that are safe (empty array, false,
 *     standard preset name).
 *   - <0.9: returns suggestion only, no auto-apply.
 */

// Levenshtein distance for typo correction (small, no deps)
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function closestMatch(value, allowed) {
  if (!value || !Array.isArray(allowed) || allowed.length === 0) return null;
  const lower = String(value).toLowerCase();
  let best = null;
  let bestDist = Infinity;
  for (const cand of allowed) {
    const d = lev(lower, String(cand).toLowerCase());
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  // Only suggest if the distance is small relative to the input
  if (bestDist <= Math.max(2, Math.floor(lower.length / 2))) return best;
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Rule table: error code → suggester function
// Each function takes (issue, context) and returns
//   { replacement, confidence, rationale } or null.
// ─────────────────────────────────────────────────────────────────────

const SUGGESTERS = {
  // ── role.communication_style.verbosity is restricted to a small set ──
  INVALID_VERBOSITY: (issue) => {
    const allowed = ["concise", "balanced", "detailed"];
    // Issue message: "Invalid verbosity: brief. Must be one of: ..."
    const match = /verbosity:\s*(\S+?)\./i.exec(issue.message || "");
    const bad = match ? match[1] : null;
    const fixed = bad ? closestMatch(bad, allowed) : null;
    if (fixed) {
      return {
        replacement: fixed,
        confidence: 1.0,
        rationale: `Closest valid value to "${bad}"`,
      };
    }
    // Fallback: pick the middle option
    return {
      replacement: "balanced",
      confidence: 0.9,
      rationale: "Default to balanced when source value is unrecognizable",
    };
  },

  // ── tool security classification: pattern-based via Phase 2 classifier ──
  UNCLASSIFIED_TOOL: (issue, ctx) => {
    // The Phase 2 classifier lives in the Builder backend — we don't
    // import it from here to avoid a cross-package dependency. Instead
    // we use a conservative default: "internal" (fail-safe, matches
    // the classifier's default).
    return {
      replacement: "internal",
      confidence: 0.9,
      rationale: "Default classification; refine via Phase 2 auto-classifier or explicit security.classification",
    };
  },

  // ── scenario without title ──
  MISSING_SCENARIO_TITLE: (issue, ctx) => {
    // issue.path is "scenarios[N].title"; suggest a placeholder
    const idx = /scenarios\[(\d+)\]/i.exec(issue.path || "");
    const n = idx ? parseInt(idx[1], 10) + 1 : null;
    return {
      replacement: n ? `Scenario ${n}` : "Untitled scenario",
      confidence: 0.9,
      rationale: "Generic placeholder; author can refine",
    };
  },

  // ── intent missing examples ──
  MISSING_INTENT_EXAMPLES: (issue, ctx) => {
    // Suggest one generic example so the validator passes; author refines.
    return {
      replacement: ["(example to be added by author)"],
      confidence: 0.85,
      rationale: "Placeholder array; replace with real examples",
    };
  },

  // ── INCOMPLETE_PROBLEM: empty or too-short problem statement ──
  INCOMPLETE_PROBLEM: (issue, ctx) => {
    // Don't auto-apply — this is a content gap the author has to fill.
    return null;
  },

  // ── unknown engine preset → suggest "standard" ──
  UNKNOWN_ENGINE_PRESET: (issue, ctx) => {
    return {
      replacement: "standard",
      confidence: 0.95,
      rationale: "Default preset (matches mobile-pa shape)",
    };
  },
};

/**
 * Annotate a validation result with suggested_fix entries.
 *
 * @param {{ errors: Array, warnings: Array }} validationResult
 *        Standard validator output.
 * @param {Object} [context]
 *        Optional context (full skill object) for richer suggestions.
 * @returns {{
 *   errors: Array,           // each with optional suggested_fix
 *   warnings: Array,         // each with optional suggested_fix
 *   summary: {
 *     total_issues: number,
 *     suggestions_offered: number,
 *     auto_applicable: number,  // count with confidence >= 0.9
 *   }
 * }}
 */
export function annotateWithFixes(validationResult, context = {}) {
  const errors = Array.isArray(validationResult?.errors) ? [...validationResult.errors] : [];
  const warnings = Array.isArray(validationResult?.warnings) ? [...validationResult.warnings] : [];

  let offered = 0;
  let autoable = 0;

  const annotate = (issue) => {
    if (!issue?.code) return issue;
    const suggester = SUGGESTERS[issue.code];
    if (!suggester) return issue;
    const result = suggester(issue, context);
    if (!result) return issue;
    offered++;
    if (result.confidence >= 0.9) autoable++;
    return {
      ...issue,
      suggested_fix: {
        path: issue.path,
        replacement: result.replacement,
        confidence: result.confidence,
        rationale: result.rationale,
      },
    };
  };

  const annotatedErrors = errors.map(annotate);
  const annotatedWarnings = warnings.map(annotate);

  return {
    ...validationResult,
    errors: annotatedErrors,
    warnings: annotatedWarnings,
    summary: {
      ...(validationResult?.summary || {}),
      total_issues: errors.length + warnings.length,
      suggestions_offered: offered,
      auto_applicable: autoable,
    },
  };
}

/**
 * Apply a suggested fix to a target object by path. Path is a dotted
 * string (e.g. "role.communication_style.verbosity" or
 * "scenarios[0].title"). Returns the new object (mutates a deep clone).
 *
 * @param {Object} target
 * @param {string} path
 * @param {*} replacement
 * @returns {Object} new target with the fix applied
 */
export function applyFix(target, path, replacement) {
  if (!target || typeof target !== "object") return target;
  if (!path || typeof path !== "string") return target;
  const clone = JSON.parse(JSON.stringify(target));
  // Parse path: "scenarios[0].title" → ["scenarios", 0, "title"]
  const segments = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1]) segments.push(m[1]);
    else if (m[2]) segments.push(parseInt(m[2], 10));
  }
  if (segments.length === 0) return target;

  let cur = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i];
    if (cur[k] == null) cur[k] = (typeof segments[i + 1] === "number") ? [] : {};
    cur = cur[k];
  }
  cur[segments[segments.length - 1]] = replacement;
  return clone;
}

/**
 * Auto-apply all high-confidence (>=0.9) fixes from an annotated
 * validation result. Returns the patched target + summary.
 *
 * @param {Object} target            object to patch (e.g., a skill)
 * @param {Object} annotatedResult   output of annotateWithFixes
 * @returns {{ target: Object, applied: Array, skipped: Array }}
 */
export function autoApplyHighConfidenceFixes(target, annotatedResult) {
  let patched = target;
  const applied = [];
  const skipped = [];

  const consider = (issue) => {
    const fix = issue?.suggested_fix;
    if (!fix) return;
    if (fix.confidence < 0.9) {
      skipped.push({ code: issue.code, path: fix.path, reason: "low_confidence" });
      return;
    }
    try {
      patched = applyFix(patched, fix.path, fix.replacement);
      applied.push({ code: issue.code, path: fix.path, replacement: fix.replacement });
    } catch (err) {
      skipped.push({ code: issue.code, path: fix.path, reason: `apply_error: ${err.message}` });
    }
  };

  (annotatedResult?.errors || []).forEach(consider);
  (annotatedResult?.warnings || []).forEach(consider);

  return { target: patched, applied, skipped };
}

export default {
  annotateWithFixes,
  applyFix,
  autoApplyHighConfidenceFixes,
};
