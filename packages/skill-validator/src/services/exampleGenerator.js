/**
 * exampleGenerator.js — LLM-backed natural example generator for skill intents.
 *
 * Replaces the old template-based generator (still present as the fallback).
 * Given an intent description, asks the platform LLM for 4 realistic user
 * phrases. Results are cached in Core's MongoDB (via the
 * /api/internal/llm-cache HTTP endpoint) keyed by a hash of the
 * description so redeploys don't re-hit the LLM unless the description
 * actually changed.
 *
 * Strategy:
 *   1. Hash the normalized description → cache key "intent-examples:<hash>"
 *   2. GET Core /api/internal/llm-cache/<key>
 *   3. If hit → return cached examples (instant)
 *   4. If miss → call LLM, PUT cache in Core, return examples
 *   5. If LLM errors → fall back to the original template generator
 *
 * The cache lives in Core's MongoDB (not on Builder FS). Reason: the
 * Skill Builder's source tree is a mirror of GitHub, so anything under
 * packages/ or _builder/ ends up in version control — a cache would
 * leak into commits. MongoDB is already the canonical runtime store
 * and survives container rebuilds. Cache failures become cache misses
 * (never fail the LLM call).
 */

import { createHash } from "node:crypto";
import { getDefaultAdapter } from "./llm/adapter.js";
import { deriveIntentId } from "./skillExpander.js";

// Core HTTP cache configuration — same env vars as llm/adapter.js.
const CORE_URL = process.env.ADAS_CORE_URL || "http://adas-backend:4000";
const CORE_SECRET =
  process.env.ADAS_MCP_TOKEN || process.env.CORE_MCP_SECRET || "";
const CACHE_NAMESPACE_EXAMPLES = "intent-examples";
const CACHE_NAMESPACE_LISTS = "intent-lists";

// ─── Mongo-backed cache (via Core HTTP) ────────────────────────────────────
//
// Cache ops go through Core's /api/internal/llm-cache/:key endpoints
// with the internal shared secret. Failures become cache misses — the
// generator always falls through to a fresh LLM call rather than
// erroring out. This keeps the hot path resilient to Core restarts or
// transient network issues.

function hashDescription(desc) {
  return createHash("sha256")
    .update(String(desc || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

async function cacheGet(namespace, hash) {
  if (!CORE_SECRET) return null;
  try {
    const key = `${namespace}:${hash}`;
    const resp = await fetch(
      `${CORE_URL}/api/internal/llm-cache/${encodeURIComponent(key)}`,
      {
        headers: { "x-adas-token": CORE_SECRET },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.hit) return null;
    return data.entry?.payload ?? null;
  } catch (e) {
    console.warn(`[exampleGenerator] cache GET failed (${namespace}): ${e.message}`);
    return null;
  }
}

async function cachePut(namespace, hash, payload) {
  if (!CORE_SECRET) return;
  try {
    const key = `${namespace}:${hash}`;
    const resp = await fetch(
      `${CORE_URL}/api/internal/llm-cache/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: {
          "x-adas-token": CORE_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify({ namespace, payload }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!resp.ok) {
      console.warn(
        `[exampleGenerator] cache PUT failed (${namespace}): ${resp.status} ${resp.statusText}`
      );
    }
  } catch (e) {
    console.warn(`[exampleGenerator] cache PUT failed (${namespace}): ${e.message}`);
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
  const adapter = await getDefaultAdapter();

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
  const cached = await cacheGet(CACHE_NAMESPACE_EXAMPLES, hash);
  if (Array.isArray(cached?.examples) && cached.examples.length > 0) {
    return cached.examples;
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
    await cachePut(CACHE_NAMESPACE_EXAMPLES, hash, {
      description: desc,
      examples,
      generatedAt: new Date().toISOString(),
    });
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
    // If the whole `intents` shape is missing, coerce it to an empty
    // supported[] so the 0-intent branch below can try to generate them
    // from scratch. Same path as a skill that was deployed with
    // explicitly-empty intents.
    if (!skill.intents) skill.intents = {};
    skill.intents.supported = [];
  }

  const skillContext = skill.role?.name || skill.role?.persona || skill.name || skill.id;

  // 0-intent branch: skill has no intents declared at all. Call the LLM
  // to synthesize a small (3-7) persona-driven set of grouped intents
  // from the skill's persona, problem, and tool list. Results are
  // cached on a hash of (persona + tool names) so repeated deploys are
  // instant. Fails soft to the 1-per-tool template fallback (matches
  // pre-SOL-02 behavior).
  if (skill.intents.supported.length === 0) {
    try {
      const generated = await generateIntentListForSkill({
        skillId: skill.id,
        skillName: skill.name || skill.id,
        persona: skill.role?.persona || "",
        roleName: skill.role?.name || "",
        problem:
          typeof skill.problem === "string"
            ? skill.problem
            : skill.problem?.statement || "",
        tools: (tools || skill.tools || []).map((t) => ({
          name: t.name,
          description: t.description || "",
        })),
      });
      if (Array.isArray(generated) && generated.length > 0) {
        skill.intents.supported = generated;
        console.log(
          `[exampleGenerator] Generated ${generated.length} intents for skill "${skill.id}" from persona+tools`
        );
        // Fall through to the per-intent loop below so examples are also
        // attached via the existing example cache. (The list generator
        // already returns examples, but the enrichment loop normalizes
        // shape and keeps examples_generated mirrored.)
      } else {
        console.warn(
          `[exampleGenerator] Intent list generation returned empty for "${skill.id}" — leaving intents empty`
        );
      }
    } catch (e) {
      console.warn(
        `[exampleGenerator] Intent list generation failed for "${skill.id}": ${e.message}`
      );
    }
  }

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

// ─── Intent list generation (0-intent case) ────────────────────────────────
//
// When a skill has no intents declared, ask the LLM to synthesize a small
// (3-7) set of persona-driven, tool-grouped intents. Each intent gets an
// ID, description, and 4 example phrases in a single LLM call. Cached in
// Core's Mongo under the "intent-lists" namespace keyed by a hash of
// (persona + tool names).

function intentListCacheKey({ persona, tools }) {
  const normalized =
    String(persona || "")
      .trim()
      .toLowerCase() +
    "||" +
    (tools || [])
      .map((t) => (t.name || "") + ":" + (t.description || ""))
      .sort()
      .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

async function callLLMForIntentList({
  skillName,
  persona,
  roleName,
  problem,
  tools,
}) {
  const adapter = await getDefaultAdapter();

  const systemPrompt =
    "You design intent catalogs for a skill-based AI assistant. Given a " +
    "skill's persona, problem, and tool list, produce a SMALL set of " +
    "high-level user intents (3 to 7) that group related tools together. " +
    "Each intent represents something the user might ASK for in plain " +
    "language, not a tool call. Focus on the persona and user-facing " +
    "outcomes; do NOT create one intent per tool. Use concise snake_case " +
    "ids. Descriptions are one-sentence natural language. Examples are " +
    "4 varied, realistic user phrases — no robotic templates like " +
    "'I need to X' or 'Please X'. " +
    "Return STRICT JSON: " +
    '{ "intents": [ { "id": "...", "description": "...", "examples": ["...", "...", "...", "..."], "tools": ["tool.name", ...] } ] }. ' +
    "The `tools` array on each intent lists which of the skill's tools " +
    "that intent would likely dispatch (helps the planner pick tools). " +
    "Do not include any prose or markdown outside the JSON.";

  const toolBlock = (tools || [])
    .map((t) => `- ${t.name}: ${t.description || "(no description)"}`)
    .join("\n");

  const userMsg =
    `Skill name: ${skillName}\n` +
    (roleName ? `Role: ${roleName}\n` : "") +
    `Persona:\n${persona || "(none)"}\n\n` +
    (problem ? `Problem: ${problem}\n\n` : "") +
    `Tools (${(tools || []).length}):\n${toolBlock}\n\n` +
    `Return 3-7 grouped intents as JSON.`;

  const resp = await adapter.chat({
    systemPrompt,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 2000,
    temperature: 0.5,
    enableTools: false,
  });

  const text =
    resp?.content ||
    resp?.text ||
    resp?.message?.content ||
    (Array.isArray(resp?.content) ? resp.content[0]?.text : null) ||
    "";

  if (!text) throw new Error("empty LLM response");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no JSON in LLM response");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed?.intents) || parsed.intents.length === 0) {
    throw new Error("LLM returned invalid intents array");
  }

  // Normalize each intent into our internal shape.
  return parsed.intents
    .filter((i) => i && typeof i.id === "string" && i.id.length > 0)
    .slice(0, 7)
    .map((i) => {
      const examples = Array.isArray(i.examples)
        ? i.examples.map((e) => String(e).trim()).filter(Boolean).slice(0, 5)
        : [];
      return {
        id: i.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
        description: String(i.description || "").trim(),
        examples,
        examples_generated: examples,
        // The LLM may suggest which tools this intent dispatches. We
        // store it as advisory metadata — Core doesn't read it yet, but
        // it gives authors and future tooling something to work with.
        candidate_tools: Array.isArray(i.tools)
          ? i.tools.filter((t) => typeof t === "string")
          : [],
      };
    });
}

/**
 * generateIntentListForSkill({ skillId, skillName, persona, roleName, problem, tools })
 *
 * Returns a promise for a small set of persona-driven intents for a skill
 * that currently has none. Cached on (persona + tools) hash. Throws on
 * LLM failure so the caller can decide whether to fall back.
 */
export async function generateIntentListForSkill({
  skillId,
  skillName,
  persona,
  roleName,
  problem,
  tools,
}) {
  const hash = intentListCacheKey({ persona, tools });

  // 1. Cache hit?
  const cached = await cacheGet(CACHE_NAMESPACE_LISTS, hash);
  if (Array.isArray(cached?.intents) && cached.intents.length > 0) {
    console.log(
      `[exampleGenerator] Intent list cache HIT for "${skillId}" (hash=${hash}, ${cached.intents.length} intents)`
    );
    return cached.intents;
  }

  // 2. LLM call
  const intents = await callLLMForIntentList({
    skillName,
    persona,
    roleName,
    problem,
    tools,
  });

  await cachePut(CACHE_NAMESPACE_LISTS, hash, {
    skillId,
    skillName,
    persona,
    toolCount: (tools || []).length,
    generatedAt: new Date().toISOString(),
    intents,
  });

  return intents;
}

