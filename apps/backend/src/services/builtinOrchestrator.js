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

// Note: Core reserves `_`-prefix slugs for system skills (per skillBootstrap.js
// validation). Use a normal id with `auto-` prefix to flag it as platform-
// generated without violating the slug convention.
const ORCH_ID = "auto-orchestrator";

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
    // Use the "fast" engine preset — orchestrator is just routing, no
    // deep iteration needed.
    engine: "fast",
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
 * returns the orchestrator skill + auto-generated handoffs to merge.
 * Caller is responsible for inserting them into the deploy bundle.
 *
 * @returns {{
 *   generated: boolean,
 *   reason: string,
 *   orchestrator?: Object,
 *   handoffs?: Array,
 * }}
 */
export function generateOrchestratorIfNeeded(solution, skills) {
  const decision = shouldGenerateOrchestrator(solution, skills);
  if (!decision.generate) {
    return { generated: false, reason: decision.reason };
  }
  const orch = buildOrchestratorSkill(solution, skills);
  return {
    generated: true,
    reason: "ok",
    orchestrator: orch,
    handoffs: orch._generated_handoffs || [],
  };
}

export default {
  shouldGenerateOrchestrator,
  buildOrchestratorSkill,
  generateOrchestratorIfNeeded,
  ORCH_ID,
};
