/**
 * exampleGenerator.js — LLM-backed natural example generator for skill intents.
 *
 * Replaces the old template-based generator (still present as the fallback).
 * Given an intent description, asks the platform LLM for 3-5 realistic user
 * phrases. Results are cached on disk keyed by a hash of the description so
 * redeploys don't re-hit the LLM unless the description actually changed.
 *
 * Strategy:
 *   1. Hash the normalized description → cache key
 *   2. Look up cache file in _builder/cache/intent-examples/<hash>.json
 *   3. If hit → return cached examples (instant)
 *   4. If miss → call LLM, write cache, return examples
 *   5. If LLM errors → fall back to the original template generator
 *
 * The cache lives on the filesystem because this is a BUILDER task (design
 * time), not a runtime task. Per CLAUDE.md: "Skill Builder = Filesystem ONLY
 * (_builder/)".
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultAdapter } from "./llm/adapter.js";
import { deriveIntentId } from "./skillExpander.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache lives at <repo>/packages/skill-validator/cache/intent-examples/
// which is inside the skill-validator package. Simple, no tenant scoping
// needed because the cache key is content-hashed.
const CACHE_DIR = join(__dirname, "..", "..", "cache", "intent-examples");

// ─── Cache helpers ─────────────────────────────────────────────────────────

function hashDescription(desc) {
  return createHash("sha256").update(String(desc || "").trim().toLowerCase()).digest("hex").slice(0, 16);
}

function cachePath(hash) {
  return join(CACHE_DIR, `${hash}.json`);
}

function readCache(hash) {
  try {
    const p = cachePath(hash);
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.examples)) return null;
    return parsed.examples;
  } catch {
    return null;
  }
}

function writeCache(hash, description, examples) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const payload = {
      description,
      examples,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(cachePath(hash), JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn(`[exampleGenerator] cache write failed: ${e.message}`);
  }
}

// ─── Template fallback (same shape as the legacy generator) ────────────────

function templateFallback(intentId, description) {
  const action = intentId.replace(/_/g, " ");
  const desc = (description || "").trim();
  if (desc && desc.toLowerCase() !== action.toLowerCase() && desc.length > action.length) {
    const lower = desc.charAt(0).toLowerCase() + desc.slice(1);
    return [
      desc.charAt(0).toUpperCase() + desc.slice(1),
      `I need to ${lower}`,
      `Can you ${lower}?`,
      `Please ${lower}`,
    ];
  }
  return [
    `I want to ${action}`,
    `Can you help me ${action}?`,
    `I need to ${action}`,
  ];
}

// ─── LLM call ─────────────────────────────────────────────────────────────

async function callLLMForExamples({ intentId, description, skillContext, toolInputs, toolName }) {
  const adapter = getDefaultAdapter();

  const systemPrompt =
    "You generate realistic user utterances for an intent classifier. " +
    "Given an intent description and context, return 4 varied ways a real " +
    "user might phrase a request that matches it — short, natural, " +
    "conversational, no duplicated structure, no robotic templates like " +
    "'I need to X' or 'Please X'. Mix styles: questions, statements, " +
    "casual, direct. Include at least one phrasing that uses synonyms or " +
    "paraphrases rather than the exact words from the description. " +
    "Return STRICT JSON: { \"examples\": [string, string, string, string] }. " +
    "Do not include any prose or markdown outside the JSON.";

  const inputsBlock =
    Array.isArray(toolInputs) && toolInputs.length > 0
      ? `\nTool inputs (parameters the user might mention): ${toolInputs
          .map((i) => `${i.name}${i.required ? "*" : ""}`)
          .join(", ")}`
      : "";

  const userMsg =
    `Intent id: ${intentId}\n` +
    (toolName ? `Underlying tool: ${toolName}\n` : "") +
    `Intent description: ${description}` +
    inputsBlock +
    (skillContext ? `\nSkill persona / role: ${skillContext}` : "") +
    `\n\nReturn 4 realistic user phrases.`;

  const resp = await adapter.chat({
    systemPrompt,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 300,
    temperature: 0.7,
    enableTools: false,
  });

  // Adapter response shape varies — try common fields
  const text =
    resp?.content ||
    resp?.text ||
    resp?.message?.content ||
    (Array.isArray(resp?.content) ? resp.content[0]?.text : null) ||
    "";

  if (!text) throw new Error("empty LLM response");

  // Extract JSON (may be wrapped in ```json ... ```)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no JSON in LLM response");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed?.examples) || parsed.examples.length < 2) {
    throw new Error("LLM returned invalid examples array");
  }

  return parsed.examples
    .map((e) => String(e).trim())
    .filter((e) => e.length > 0 && e.length < 200)
    .slice(0, 5);
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * generateIntentExamples({ intentId, description, skillContext, toolInputs, toolName })
 *
 * Returns a promise for an array of 3-5 realistic user phrases for the
 * intent. Uses cache, then LLM, then falls back to templates. Never throws.
 *
 * Cache key is description-only per design: same description → same
 * examples, even across intents/tools. toolInputs, toolName and skillContext
 * are passed to the LLM for richer generation on first call, but do NOT
 * affect the cache key.
 */
export async function generateIntentExamples({ intentId, description, skillContext, toolInputs, toolName }) {
  const desc = String(description || "").trim();
  if (!desc) return templateFallback(intentId, desc);

  const hash = hashDescription(desc);

  // 1. Cache hit?
  const cached = readCache(hash);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 2. Cache miss → LLM
  try {
    const examples = await callLLMForExamples({
      intentId,
      description: desc,
      skillContext,
      toolInputs,
      toolName,
    });
    writeCache(hash, desc, examples);
    return examples;
  } catch (e) {
    console.warn(
      `[exampleGenerator] LLM failed for intent "${intentId}" — falling back to templates: ${e.message}`
    );
    return templateFallback(intentId, desc);
  }
}

/**
 * enrichSkillIntentsWithLLM(skill, tools)
 *
 * Post-process an already-expanded skill definition: walk its intents and
 * populate the `examples` field with LLM-generated (or cached) phrases.
 *
 * Params:
 *   - skill: expanded skill definition (the output of expandSkill())
 *   - tools: original tools array — used to recover per-intent context
 *     (inputs, tool name) so the LLM gets richer grounding than just the
 *     one-line description. Optional.
 *
 * Rules:
 *   - If an intent already has author-written `examples` (non-empty) AND
 *     they don't look like legacy auto-templates, we NEVER overwrite them.
 *   - If `examples` is missing, empty, OR looks like the old robotic
 *     templates ("I need to X" / "Please X" / etc), we regenerate.
 *   - We mirror the result into `examples_generated` so downstream tooling
 *     (voice, eval) can distinguish generated vs hand-written.
 *   - Mutates the skill in place AND returns it for convenience.
 */
export async function enrichSkillIntentsWithLLM(skill, tools = []) {
  if (!skill?.intents?.supported || !Array.isArray(skill.intents.supported)) {
    return skill;
  }

  const skillContext = skill.role?.name || skill.role?.persona || skill.name || skill.id;

  // Build a tool lookup keyed by derived intent id so we can attach
  // per-intent inputs/name without exposing the mapping logic here.
  const toolsByIntentId = new Map();
  for (const t of tools) {
    if (!t?.name) continue;
    toolsByIntentId.set(deriveIntentId(t.name), t);
  }

  for (const intent of skill.intents.supported) {
    // Skip only if author wrote examples by hand and they're not legacy
    // auto-templates. The old skillExpander generator produced a 4-item
    // set where the FIRST entry was the description verbatim and the
    // other 3 were "I need to X / Can you X? / Please X" wrappers. We
    // detect legacy sets by asking: do 2+ of the examples match the
    // template patterns? That catches the 3-of-4 case without
    // false-positive-ing genuinely hand-authored phrases (where at most
    // one might accidentally start with "I need to").
    if (Array.isArray(intent.examples) && intent.examples.length > 0) {
      const templateHits = intent.examples.filter((e) =>
        /^(I need to |Please |Can you help me |Can you .*\?$|I want to )/i.test(e)
      ).length;
      const isLegacyTemplates = templateHits >= 2;
      if (!isLegacyTemplates) continue; // real hand-authored, leave alone
    }

    const tool = toolsByIntentId.get(intent.id);
    const examples = await generateIntentExamples({
      intentId: intent.id,
      description: intent.description,
      skillContext,
      toolInputs: tool?.inputs || [],
      toolName: tool?.name,
    });
    intent.examples = examples;
    intent.examples_generated = examples;
  }

  return skill;
}

