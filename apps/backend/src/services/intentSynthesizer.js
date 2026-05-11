/**
 * intentSynthesizer.js — Phase 3 of §20 v2.3 schema strip.
 *
 * Synthesize a skill's `intents.supported[]` from its persona + connector
 * tool list, at DEPLOY time (Builder-side, NOT Core runtime — locked
 * boundary per the plan's two amendments).
 *
 * The author's path to overriding: explicit `skill.intents.supported[]`
 * (even an empty array `[]` if they really want zero intents) → REPLACE
 * wins, synthesis skipped. This matches the pattern used by every other
 * strip phase: missing → derive, present → preserve.
 *
 * Why deploy-time, not runtime:
 *   - Per the evening amendment of 2026-05-05, all strip-related synthesis
 *     stays in Builder. Core has zero new code paths. The only runtime LLM
 *     in Core is the existing uiActions Tier 2 (grandfathered).
 *   - Intents are stable per (persona, tools) — they don't need runtime
 *     adaptivity. Source-hash invalidation handles the "tools changed"
 *     case at next deploy.
 *
 * Source-hash invalidation:
 *   - Hash of `{persona, toolNames}` is cached in skill.intents._auto_hash.
 *   - On redeploy, if hash matches, skip the LLM call entirely.
 *   - If hash differs (persona edit, tool added/removed), regenerate.
 *
 * Fail-safe behavior:
 *   - LLM unavailable → log warning, leave intents as-is. No fake stubs.
 *   - LLM returns malformed JSON → log warning, leave intents as-is.
 *   - Synthesized output validated for shape before writing to disk.
 *
 * Output is written to skill.intents.supported[] with metadata fields:
 *   {
 *     id: "store_memory",
 *     description: "...",
 *     examples: ["..."],
 *     candidate_tools: ["memory.store"],
 *     _auto_generated: true,   // distinguishes synthesized from authored
 *     _auto_hash: "<sha256>",  // source hash for invalidation
 *   }
 */

import crypto from "node:crypto";
import { createAdapter } from "./llm/adapter.js";

const MAX_INTENTS = 7;
const MIN_INTENTS = 3;

// ─────────────────────────────────────────────────────────────────────
// Source hash
// ─────────────────────────────────────────────────────────────────────

/**
 * Stable hash of the inputs that drive synthesis. If this changes,
 * the cached synthesized intents are invalid → regenerate next deploy.
 *
 * @param {string} persona
 * @param {Array<string>} toolNames
 * @returns {string} sha256 hex
 */
export function computeSourceHash(persona, toolNames) {
  const norm = {
    persona: String(persona || "").trim(),
    tools: Array.isArray(toolNames) ? [...toolNames].sort() : [],
  };
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────
// Prompt + parsing
// ─────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You analyze a skill's persona + tool list and produce a list of \`intents\` — the categories of user requests this skill can handle.

You will be given:
  - persona: the skill's role/personality description
  - tools: the names of tools available to this skill (and brief descriptions)

Your job: produce 3-7 intents covering what the skill does. For each intent:
  - id: snake_case identifier (e.g. "store_memory", "recall_calendar_event")
  - description: one sentence describing what the user wants
  - examples: 3-5 short, natural phrases a user might say
  - candidate_tools: subset of the tool list this intent uses (exact tool names, no wildcards)

Output STRICTLY this JSON shape — no prose, no code fence, no extra keys:

{
  "intents": [
    {
      "id": "store_memory",
      "description": "Save a fact, preference, or instruction for later recall.",
      "examples": ["Remember my anniversary is May 1", "Note that I'm allergic to peanuts"],
      "candidate_tools": ["memory.store"]
    }
  ]
}

Rules:
  - 3-7 intents — prefer fewer, well-defined intents over many narrow ones.
  - id MUST be snake_case, 2-30 chars, alphanumeric + underscores only.
  - examples MUST be in the user's voice, not the system's.
  - candidate_tools MUST be EXACT names from the tool list. Do NOT invent or paraphrase.
  - If a tool exists but no intent uses it, that's fine — coverage isn't required.
  - If the persona describes capabilities that have no matching tool, you may still include the intent with candidate_tools: [].

Return ONLY the JSON. No explanation. No markdown.`;

function buildUserMessage(persona, toolEntries) {
  // toolEntries: [{ name, description }, ...]
  const toolsBlock = toolEntries.slice(0, 30).map(t => {
    const desc = t.description ? ` — ${String(t.description).slice(0, 120)}` : "";
    return `  - ${t.name}${desc}`;
  }).join("\n");

  return `Skill persona:
\`\`\`
${String(persona || "").trim().slice(0, 4000)}
\`\`\`

Available tools (${toolEntries.length}):
${toolsBlock || "  (none)"}

Synthesize intents for this skill. Return JSON only.`;
}

function tryParseJson(text) {
  if (typeof text !== "string") return null;
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Hard shape-check the LLM-returned intents. Returns a normalized array
 * when valid, or null when not.
 */
function validateIntentsBlock(raw, validToolNames) {
  if (!raw || typeof raw !== "object") return null;
  const intents = raw.intents;
  if (!Array.isArray(intents) || intents.length === 0) return null;

  const validTools = new Set(validToolNames || []);
  const ID_RE = /^[a-z][a-z0-9_]{1,29}$/;
  const out = [];
  for (const intent of intents) {
    if (!intent || typeof intent !== "object") continue;
    const id = typeof intent.id === "string" ? intent.id.trim() : "";
    if (!ID_RE.test(id)) continue;
    const description = typeof intent.description === "string" ? intent.description.trim() : "";
    if (description.length < 5) continue;
    const examples = Array.isArray(intent.examples)
      ? intent.examples.filter(e => typeof e === "string" && e.trim().length > 0).map(e => e.trim()).slice(0, 8)
      : [];
    if (examples.length === 0) continue;
    const candidateTools = Array.isArray(intent.candidate_tools)
      ? intent.candidate_tools.filter(t => typeof t === "string" && validTools.has(t))
      : [];

    out.push({
      id,
      description,
      examples,
      candidate_tools: candidateTools,
    });
    if (out.length >= MAX_INTENTS) break;
  }

  if (out.length < MIN_INTENTS) return null;
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────────────

/**
 * Synthesize intents for a skill, with source-hash caching and fail-safe
 * fallback. Mutates the skill object's `intents.supported[]` ONLY when:
 *   - the skill has no existing intents.supported[] (or it's empty), AND
 *   - the cached _auto_hash doesn't match the current source hash, AND
 *   - LLM call succeeds with valid output.
 *
 * Returns a summary describing what happened.
 *
 * @param {Object} skill        Mutated in place.
 * @param {Array}  [tools]      Tools list to use as input. Defaults to skill.tools.
 * @param {Object} [options]
 * @param {string} [options.provider="openai"]   LLM provider
 * @param {string} [options.model]               Model override (semantic tier or raw id)
 * @returns {Promise<{ status, reason, intents_count, source_hash }>}
 */
export async function synthesizeIntentsForSkill(skill, tools, options = {}) {
  const baseResult = (status, reason, intentsCount = 0) => ({
    status,
    reason,
    intents_count: intentsCount,
    source_hash: null,
  });

  if (!skill || typeof skill !== "object") {
    return baseResult("skip", "not_object");
  }

  const existing = skill?.intents?.supported;
  // REPLACE: existing non-empty intents.supported[] preserved.
  if (Array.isArray(existing) && existing.length > 0) {
    return baseResult("skip", "explicit_intents");
  }

  const persona = skill?.role?.persona || "";
  if (!persona || persona.length < 20) {
    return baseResult("skip", "persona_too_short");
  }

  const toolList = Array.isArray(tools) ? tools : (skill.tools || []);
  if (toolList.length === 0) {
    return baseResult("skip", "no_tools");
  }
  const toolEntries = toolList
    .filter(t => t && typeof t === "object" && typeof t.name === "string")
    .map(t => ({ name: t.name, description: t.description || "" }));
  const toolNames = toolEntries.map(t => t.name);

  const sourceHash = computeSourceHash(persona, toolNames);

  // Cached intents check (when intents.supported is empty but cache header exists)
  if (skill?.intents?._auto_hash === sourceHash) {
    return baseResult("skip", "hash_cached", 0);
  }

  // ── Run LLM ──────────────────────────────────────────────────────────
  const provider = options.provider || process.env.LLM_PROVIDER || "openai";
  let adapter;
  try {
    adapter = createAdapter(provider, { model: options.model });
  } catch (err) {
    console.warn(`[intentSynthesizer] LLM adapter unavailable for ${skill.id}: ${err.message}`);
    return baseResult("skip", "llm_adapter_unavailable");
  }

  const userMessage = buildUserMessage(persona, toolEntries);
  let llmText = "";
  try {
    const res = await adapter.chat({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 1200,
      temperature: 0.3,
      enableTools: false,
    });
    llmText = (res?.content && typeof res.content === "string") ? res.content : "";
  } catch (err) {
    console.warn(`[intentSynthesizer] LLM call failed for ${skill.id}: ${err.message}`);
    return baseResult("skip", "llm_call_failed");
  }

  let parsed = tryParseJson(llmText);
  let intents = parsed ? validateIntentsBlock(parsed, toolNames) : null;

  // Retry once with stricter framing if invalid
  if (!intents && llmText) {
    try {
      const retry = await adapter.chat({
        systemPrompt: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: llmText },
          { role: "user", content: "Your previous response wasn't valid JSON. Return ONLY the JSON object in the required shape — no prose, no code fence." },
        ],
        maxTokens: 1200,
        temperature: 0,
        enableTools: false,
      });
      parsed = tryParseJson(retry?.content || "");
      intents = parsed ? validateIntentsBlock(parsed, toolNames) : null;
    } catch {}
  }

  if (!intents) {
    return baseResult("skip", "llm_invalid_output");
  }

  // Write to skill — preserve thresholds + out_of_domain from existing
  // intents object if present.
  const stamped = intents.map(i => ({
    ...i,
    _auto_generated: true,
  }));

  const existingIntentsObj = skill.intents || {};
  skill.intents = {
    ...existingIntentsObj,
    supported: stamped,
    _auto_hash: sourceHash,
    // Reasonable defaults if author hasn't set thresholds yet.
    thresholds: existingIntentsObj.thresholds || { accept: 0.8, clarify: 0.5, reject: 0.5 },
    out_of_domain: existingIntentsObj.out_of_domain || { action: "redirect", message: "" },
  };

  return {
    status: "synthesized",
    reason: "ok",
    intents_count: stamped.length,
    source_hash: sourceHash,
  };
}

export default { synthesizeIntentsForSkill, computeSourceHash };
