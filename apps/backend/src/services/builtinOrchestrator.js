/**
 * builtinOrchestrator.js — Phase 6 of §20 v2.3 schema strip.
 *
 * Generate a routing skill at deploy time when `solution.routing_mode === "auto"`.
 * Replaces hand-coded orchestrators like `pa-orchestrator` for new solutions
 * that opt in. Per the locked architectural boundary, this happens in Builder
 * at deploy time — Core sees a normal skill, has no idea it was generated.
 *
 * REPLACE protection:
 *   - `solution.routing_mode !== "auto"` → no action. mobile-pa case.
 *   - A skill named "_orchestrator" already exists in the bundle → no action
 *     (author wins, they wrote their own).
 *   - An explicit orchestrator-role skill already exists in solution.skills[]
 *     (e.g. pa-orchestrator) AND no explicit `solution.routing_mode` → opt
 *     OUT for safety. Author intent is "I have my own orchestrator."
 *
 * Generation strategy:
 *
 *   For each worker skill in the solution, the orchestrator needs:
 *     - knowledge of when to route there (skill.handoff_when, or fallback
 *       to skill.description)
 *     - the handoff tool to invoke
 *
 *   The orchestrator persona is built from the solution-level README/style
 *   plus a section per worker skill listing routing rules.
 *
 *   The orchestrator skill carries the standard handoff-controller-mcp
 *   connector + memory-mcp + the handoff tool, plus the worker skills'
 *   handoff routing.
 *
 *   The id of the generated skill is `_orchestrator` (underscore prefix
 *   signals "platform-generated" — same convention as `_system_service`
 *   actor in Core).
 *
 * What's NOT here:
 *   - Quality tuning (handoff priorities, edge cases) — those need
 *     explicit `handoff_when` overrides per skill.
 *   - Identity / grants config — inherited from solution-level identity.
 *   - The hard test case (does the generated orchestrator actually route
 *     as precisely as a hand-coded one?) — validated only at Phase 10.
 */

import crypto from "node:crypto";
import { createAdapter } from "./llm/adapter.js";

// Note: Core reserves `_`-prefix slugs for system skills (per skillBootstrap.js
// validation). Use a normal id with `auto-` prefix to flag it as platform-
// generated without violating the slug convention.
const ORCH_ID = "auto-orchestrator";

// ─────────────────────────────────────────────────────────────────────
// handoff_when synthesis (Phase 6b — generalization fix, 2026-05-12)
//
// Previously, generating an auto-orchestrator with high routing precision
// required the author to write `handoff_when` per skill (or copy them
// from an existing solution's hand-curated handoffs[] table). That made
// migration solution-specific.
//
// Generalization: at deploy time, if a skill has no explicit handoff_when,
// the platform synthesizes one from the skill's persona using LLM. The
// result is cached per skill via source-hash so no-op redeploys don't
// re-invoke the LLM.
//
// Cached on the skill object as `_auto_handoff_when` + `_auto_handoff_hash`.
// Author can always set explicit `handoff_when` — REPLACE wins.
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a compact tool-inventory string for the synthesis prompt — the
 * LLM uses this to discover capabilities the persona may not mention
 * (e.g. life-manager's persona is about style/behavior but its tools[]
 * carry gmail.cleanup, browser.navigate, calendar.list, …).
 *
 * Filters out internal/setup tools (names starting with _ or "ui.*" or
 * "*._*") so the trigger reflects user-facing capability, not plumbing.
 *
 * Round-robin sampling by tool-name prefix (the bit before the first
 * ".") so every connector / capability cluster is represented even
 * when one cluster has many more tools than the others. Without this,
 * a skill that lists 115 tools (life-manager) would have its first
 * connector eat all 40 slots and the gmail.* tools never reach the
 * prompt — which was the actual bug behind the 'clean my emails'
 * misroute.
 */
function summarizeToolsForSynthesis(tools, maxTools = 50) {
  if (!Array.isArray(tools)) return "";
  const filtered = tools.filter(t => {
    const n = (t?.name || "").toString();
    if (!n) return false;
    if (n.startsWith("_") || n.startsWith("sys.")) return false;
    if (n.includes("._")) return false;  // gmail._storeTokens etc
    if (/\.(status|setup|connect)$/i.test(n)) return false;  // probes / OAuth flows
    if (/^ui\./i.test(n)) return false;  // UI plugins, not capabilities
    const desc = (t?.description || "").toLowerCase();
    if (desc.startsWith("internal") || desc.startsWith("[internal]")) return false;
    return true;
  });
  // Group by prefix (text before the first ".")
  const groups = new Map();
  for (const t of filtered) {
    const prefix = (t.name || "").split(".")[0] || "_";
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(t);
  }
  // Round-robin pull from each group until we hit maxTools
  const picked = [];
  let exhausted = false;
  while (picked.length < maxTools && !exhausted) {
    exhausted = true;
    for (const arr of groups.values()) {
      if (arr.length > 0 && picked.length < maxTools) {
        picked.push(arr.shift());
        exhausted = false;
      }
    }
  }
  return picked.map(t => {
    const name = t.name;
    const desc = (t.description || "").replace(/\s+/g, " ").slice(0, 80).trim();
    return `  - ${name}: ${desc}`;
  }).join("\n");
}

function computeHandoffHash(persona, description, toolSummary, connectors) {
  const src = JSON.stringify({
    persona: String(persona || "").trim(),
    description: String(description || "").trim(),
    tools: String(toolSummary || "").trim(),
    connectors: Array.isArray(connectors) ? [...connectors].sort() : [],
  });
  return crypto.createHash("sha256").update(src).digest("hex");
}

async function synthesizeHandoffWhenForSkill(skill) {
  if (!skill || typeof skill !== "object") return null;
  // REPLACE: author's explicit value wins
  if (typeof skill.handoff_when === "string" && skill.handoff_when.trim().length > 0) {
    return null;  // already set, no synthesis
  }
  const persona = skill?.role?.persona || "";
  const description = skill?.description || "";
  const toolSummary = summarizeToolsForSynthesis(skill?.tools);
  if (persona.length < 20 && description.length < 20 && toolSummary.length < 50) {
    return null;  // not enough signal
  }

  const hash = computeHandoffHash(persona, description, toolSummary, skill?.connectors);
  if (skill._auto_handoff_hash === hash && skill._auto_handoff_when) {
    // Cache hit — use cached value
    skill.handoff_when = skill._auto_handoff_when;
    return { cached: true, source_hash: hash };
  }

  let adapter;
  try {
    adapter = createAdapter(process.env.LLM_PROVIDER || "openai");
  } catch (err) {
    return null;  // LLM unavailable, fall through to description
  }

  const systemPrompt = `You write ONE-LINE routing triggers for skill handoffs in a multi-skill AI agent platform.

Given a skill's persona + description + tool inventory, write a single concise sentence describing WHEN an orchestrator should route to this skill. The trigger is read by a routing LLM at runtime to decide skill selection.

CRITICAL: The trigger must mention the SPECIFIC verbs and nouns the user would say. If the tools include gmail operations, mention "email management" (search, send, archive, clean up). If they include calendar operations, mention "scheduling, calendar". Be specific so the routing LLM can disambiguate when multiple skills share a connector.

Output STRICTLY: just the trigger sentence. No prose, no quotes, no markdown, no preamble. One sentence, 15-50 words, in the imperative voice that matches the persona's domain.

Examples of good triggers:
  "User wants to store, recall, update, or delete memories."
  "User asks for a morning briefing, daily summary of their day, or schedule overview."
  "User wants to control smart home devices, lights, thermostats, locks, or scenes."
  "User wants email inbox management: search, archive, trash, clean up, move, label, OR web browsing, OR calendar/contact lookup, OR logging into web services."

DO NOT include the word "skill" or the skill name in the trigger.
DO NOT explain. Just the trigger sentence.`;

  const connectors = Array.isArray(skill?.connectors) ? skill.connectors : [];
  const connectorsLine = connectors.length > 0
    ? `\nConnectors (services this skill can call): ${connectors.join(", ")}`
    : "";

  const toolsBlock = toolSummary
    ? `\n\nTool inventory (round-robin sample across connectors; this is what the skill can DO):\n${toolSummary}`
    : "";

  const userMessage = `Skill name: ${skill.name || skill.id || "(unknown)"}
Skill description: ${description}${connectorsLine}

Skill persona:
\`\`\`
${persona.slice(0, 3000)}
\`\`\`${toolsBlock}

Write the routing trigger now (one sentence, 15-50 words, mentioning specific user-facing verbs/nouns drawn from the tool inventory and connectors above):`;

  try {
    const res = await adapter.chat({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 200,
      temperature: 0.2,
      enableTools: false,
    });
    const trigger = (res?.content || "").trim()
      .replace(/^["']/, "").replace(/["']$/, "")
      .replace(/^[-•*]\s+/, "")
      .split(/\n+/)[0]
      .trim();
    if (trigger.length < 10 || trigger.length > 400) return null;
    skill.handoff_when = trigger;
    skill._auto_handoff_when = trigger;
    skill._auto_handoff_hash = hash;
    return { synthesized: true, source_hash: hash, trigger };
  } catch (err) {
    return null;
  }
}

/**
 * Batch helper — synthesize handoff_when for all workers that don't have one.
 * Returns summary for logging.
 *
 * @param {Array} workers       skill objects (mutated in place when applicable)
 * @returns {Promise<{ synthesized: number, cached: number, skipped: number, failures: number }>}
 */
export async function synthesizeHandoffsForWorkers(workers) {
  const summary = { synthesized: 0, cached: 0, skipped: 0, failures: 0 };
  if (!Array.isArray(workers)) return summary;
  for (const w of workers) {
    if (typeof w?.handoff_when === "string" && w.handoff_when.trim().length > 0) {
      summary.skipped++;  // explicit author value
      continue;
    }
    const result = await synthesizeHandoffWhenForSkill(w);
    if (!result) summary.failures++;
    else if (result.cached) summary.cached++;
    else if (result.synthesized) summary.synthesized++;
  }
  return summary;
}

/**
 * Decide whether to generate the orchestrator for this solution.
 *
 * @param {Object} solution
 * @param {Array}  skills
 * @returns {{ generate: boolean, reason: string }}
 */
export function shouldGenerateOrchestrator(solution, skills) {
  if (!solution || typeof solution !== "object") {
    return { generate: false, reason: "no_solution" };
  }

  // REPLACE: opt-in via routing_mode:"auto"
  if (solution.routing_mode !== "auto") {
    return { generate: false, reason: "routing_mode_not_auto" };
  }

  // If author has their own _orchestrator skill, don't overwrite.
  const skillsArr = Array.isArray(skills) ? skills : [];
  if (skillsArr.some(s => s?.id === ORCH_ID)) {
    return { generate: false, reason: "explicit_orchestrator_skill_exists" };
  }

  // Belt-and-suspenders: if solution.skills[] declares ANY skill with
  // role:"orchestrator", we treat that as the existing router. Author
  // can force generation by removing routing_mode:"auto" or by removing
  // that role. mobile-pa case: pa-orchestrator has role:"orchestrator",
  // so we'd opt-out here too. The check above (routing_mode !== "auto")
  // catches it first.
  const declaredSkills = Array.isArray(solution.skills) ? solution.skills : [];
  if (declaredSkills.some(s => s?.role === "orchestrator")) {
    return { generate: false, reason: "orchestrator_role_already_declared" };
  }

  // Need at least 2 worker skills to make routing meaningful.
  const workers = skillsArr.filter(s => s?.id && s.id !== ORCH_ID);
  if (workers.length < 2) {
    return { generate: false, reason: "insufficient_workers" };
  }

  return { generate: true, reason: "ok" };
}

/**
 * Build the orchestrator skill from sibling skills.
 *
 * @param {Object} solution
 * @param {Array}  skills    Worker skills (anything not _orchestrator)
 * @returns {Object} Skill object ready to insert into skills[]
 */
export function buildOrchestratorSkill(solution, skills) {
  const workers = (skills || []).filter(s => s?.id && s.id !== ORCH_ID);

  // Build a routing prose section: one paragraph per worker skill.
  // Prefer skill.handoff_when (explicit one-liner from the author) over
  // skill.description (generic). If neither, fall back to skill name.
  const routingBlocks = workers.map(w => {
    const trigger = w.handoff_when ||
                    w.description ||
                    `Tasks related to ${w.name || w.id}`;
    return `- **${w.id}** (${w.name || w.id}): ${String(trigger).trim()}`;
  }).join("\n");

  const solutionDesc = solution.description || solution.name || "this assistant";

  const persona = `You are the orchestrator for "${solutionDesc}". Your job is to route every user request to the right worker skill. You never answer from your own knowledge — you consult a worker first.

Available worker skills:

${routingBlocks}

You have two routing tools — pick by intent:

  sys.handoffToSkill = "Not my job. YOU own it now."
    The worker takes over the conversation and replies to the user directly.
    You go silent. The user's next message also goes to this worker.
    Use this when the request belongs entirely to one worker's domain
    (e.g., "turn off the lights" → home-control owns it).

  sys.askAnySkill = "I'M doing this. Just help me out."
    The worker returns a result to YOU. The user does NOT see the worker.
    You then write the final reply yourself via sys.finalizePlan.
    Use this when you need answers from multiple workers, or when you
    need to filter / combine / wrap the worker's answer before replying.

Routing rules:
  1. Read the user's message carefully and pick the best worker.
  2. If one worker fully owns the request → sys.handoffToSkill.
  3. If you need to combine multiple workers' answers, or post-process →
     sys.askAnySkill, then sys.finalizePlan with the synthesized reply.
  4. If sys.handoffToSkill fails (e.g., no channel context), fall back to
     sys.askAnySkill and finalize the result yourself.
  5. NEVER invent skill IDs — only use the ones listed above.
  6. NEVER answer from your own knowledge before consulting a worker.`.trim();

  // Compose the handoffs[] array — orchestrator → each worker.
  // Authors can still write explicit handoffs at solution-level for
  // overrides; those compose with the ones generated here.
  const generatedHandoffs = workers.map(w => ({
    id: `auto-orch-to-${w.id}`,
    from: ORCH_ID,
    to: w.id,
    trigger: w.handoff_when || w.description || `Route to ${w.name || w.id}`,
    grants_passed: [],
    grants_dropped: [],
    mechanism: "handoff-controller-mcp",
    _auto_generated: true,
  }));

  // Build the orchestrator skill itself
  const skill = {
    id: ORCH_ID,
    name: "Orchestrator (auto-generated)",
    version: "1.0.0",
    role: {
      name: "Orchestrator",
      persona,
    },
    description: "Auto-generated orchestrator. Routes user requests to worker skills based on their descriptions and handoff_when triggers.",
    role_type: "orchestrator",
    connectors: ["handoff-controller-mcp", "memory-mcp"],
    tools: [
      // Orchestrator only needs the meta-tools (sys.findCapability,
      // sys.handoffToSkill, sys.askAnySkill). It doesn't carry worker
      // tools itself — that's what the workers are for.
    ],
    intents: {
      supported: [
        {
          id: "route_request",
          description: "Route a user request to the best worker skill.",
          examples: ["help me with X", "I need to Y", "can you Z"],
          candidate_tools: ["sys.findCapability", "sys.handoffToSkill"],
          _auto_generated: true,
        },
      ],
      thresholds: { accept: 0.5, clarify: 0.3, reject: 0.2 },
      out_of_domain: { action: "redirect", message: "" },
    },
    // Use "standard" engine — Phase 10 validation surfaced that "fast"
    // (5 iter, no HLR) is too tight for fallback chains (handoff fails
    // due to no_channel_context → planner needs to try sys.askAnySkill
    // → read sub-result → finalize). "standard" gives 10 iterations
    // which comfortably handles the fallback. No critic/reflection
    // needed for routing per se, but iteration headroom matters.
    engine: "standard",
    policy: {
      guardrails: {
        never: [
          "Never answer from your own knowledge — always consult a worker first (sys.handoffToSkill or sys.askAnySkill)",
        ],
        always: [
          "Always route to a worker. Use sys.handoffToSkill when the worker should take over the conversation. Use sys.askAnySkill when you need an answer back to synthesize. After sys.askAnySkill returns, finalize the worker's answer for the user.",
        ],
      },
      approvals: [],
      workflows: [],
      escalation: { enabled: false, conditions: [], target: "" },
    },
    access_policy: {
      rules: [{ tools: ["*"], requires_grants: [], effect: "allow" }],
    },
    _auto_generated: true,
    _generated_handoffs: generatedHandoffs,
  };

  return skill;
}

/**
 * Main entry. Inspects solution + skills; if generation criteria met,
 * synthesizes missing handoff_when fields on workers via LLM, then builds
 * the orchestrator skill. Caller is responsible for inserting the result
 * into the deploy bundle.
 *
 * Async because handoff_when synthesis calls the LLM. Skills already
 * carrying explicit `handoff_when` are not re-synthesized (REPLACE wins).
 * Cached per skill via source-hash → no-op redeploys skip the LLM.
 *
 * @returns {Promise<{
 *   generated: boolean,
 *   reason: string,
 *   orchestrator?: Object,
 *   handoffs?: Array,
 *   handoff_synthesis?: { synthesized, cached, skipped, failures },
 * }>}
 */
export async function generateOrchestratorIfNeeded(solution, skills) {
  const decision = shouldGenerateOrchestrator(solution, skills);
  if (!decision.generate) {
    return { generated: false, reason: decision.reason };
  }
  // Synthesize handoff_when on workers BEFORE building the orchestrator.
  // The persona-routing block (in buildOrchestratorSkill) reads w.handoff_when,
  // so this needs to fire first.
  const workers = (skills || []).filter(s => s?.id && s.id !== ORCH_ID);
  let handoff_synthesis = { synthesized: 0, cached: 0, skipped: 0, failures: 0 };
  try {
    handoff_synthesis = await synthesizeHandoffsForWorkers(workers);
  } catch (err) {
    // LLM unavailable / network fail — fall through with description fallback.
    handoff_synthesis = { synthesized: 0, cached: 0, skipped: 0, failures: workers.length, error: err.message };
  }
  const orch = buildOrchestratorSkill(solution, skills);
  return {
    generated: true,
    reason: "ok",
    orchestrator: orch,
    handoffs: orch._generated_handoffs || [],
    handoff_synthesis,
  };
}

export default {
  shouldGenerateOrchestrator,
  buildOrchestratorSkill,
  generateOrchestratorIfNeeded,
  synthesizeHandoffsForWorkers,
  ORCH_ID,
};
