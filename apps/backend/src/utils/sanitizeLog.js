// utils/sanitizeLog.js
// Recursively redact sensitive-named fields before logging. Use when echoing
// request bodies, API responses, or anything user-supplied.
//
// Rule: keys matching SENSITIVE_KEY_RE have their values replaced with
// `[REDACTED]`. Non-string values at sensitive keys also get replaced.
// Recurses up to MAX_DEPTH levels (4) to avoid runaway on cyclic objects.
//
// Pattern matches Core's `_sanitizeForLog` from round 008.

const SENSITIVE_KEY_RE = /^(authorization|cookie|password|token|secret|jwt|api[_-]?key|refresh[_-]?token|access[_-]?token|client[_-]?secret|code|private[_-]?key|pat)$/i;
const MAX_DEPTH = 4;

export function sanitizeForLog(obj, depth = 0) {
  if (depth > MAX_DEPTH || obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitizeForLog(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = sanitizeForLog(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}
