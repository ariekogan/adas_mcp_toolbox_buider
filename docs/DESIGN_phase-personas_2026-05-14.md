# Design — Phase-Specific Personas at Platform Level

**Date:** 2026-05-14
**Status:** Design proposal, not implemented
**Owner:** Arie + Claude
**Motivation:** Stop forcing skill authors to encode lifecycle state branches inside a single persona prompt. Today every turn the LLM reads instructions for phases it isn't in. The skill grows, the LLM gets noisier, and authors stack rules to wrestle the model into the right branch.

---

## 1. Problem (today)

A skill stores ONE `role.persona` string. If the skill has lifecycle phases (mycoach: `new → onboarding → observing → calibrating → accompanying`), all phase-specific instructions live inside that one string. Every turn the LLM reads everything and is expected to follow only the relevant phase. In practice:

- 80% of the persona is irrelevant on any given turn.
- The model is biased by canonical strings from inactive phases (e.g. it grabs the "What brings you here?" greeting on an action turn because that string is the most prominent text in the prompt).
- Authors compensate by stacking imperative rules ("ABSOLUTE", "VIOLATION", "FORBIDDEN"), which is brittle and unpleasant to maintain.
- Strip pipelines that shrink intents/scenarios push MORE logic into the persona, making this worse, not better.

This is what produced today's wizard-hijack incident.

---

## 2. Proposal

Replace `role.persona: string` with `role.personas: { [phaseKey]: string }` plus a runtime resolver that picks the active phase before each turn.

### 2.1 Schema change

**Before:**
```json
{
  "role": {
    "name": "MyCoach",
    "persona": "You are MyCoach — ... # PHASE: new ... # PHASE: onboarding ... # PHASE: observing ..."
  }
}
```

**After:**
```json
{
  "role": {
    "name": "MyCoach",
    "persona": {
      "default": "You are MyCoach — a personal AI coach for nutrition, activity, and habits. Tone: ...",
      "phases": {
        "new":         "The user is brand new. If their message is a clear action, run the tools and answer. Otherwise call coach.state.initOnboarding and ask what brings them here.",
        "onboarding":  "Collect 5 answers one at a time: goal, typical_day, ... If their message is an action, handle it first then continue onboarding.",
        "observing":   "Receptive, not directive. Log meals, summarize progress, record check-ins.",
        "calibrating": "...",
        "accompanying": "..."
      },
      "phase_resolver": {
        "tool": "coach.state.get",
        "path": "state.phase",
        "fallback": "new",
        "cache_per_turn": true
      }
    }
  }
}
```

`default` is always present in the prompt — it carries identity, tone, hard rules (NEVER medical advice, etc.). `phases[<active>]` is appended for the current turn only.

### 2.2 Runtime behavior

Before the first LLM call of each turn:

1. Engine looks at `role.persona.phase_resolver`. If `tool` is set, call that tool, read `path`, get the active phase key (string).
2. If the tool fails or returns nothing, use `fallback`.
3. Construct the actual system prompt:
   - `personas.default` first
   - `personas.phases[<active>]` second
4. Hand this to the LLM. The LLM never sees the phase strings it isn't in.

`cache_per_turn` ensures the resolver tool is called once per turn (not once per LLM iteration). Cheap.

### 2.3 Skill author experience

Each phase is ~50-200 words instead of one 2000-word monster. Authors stop writing "if phase=X do Y" branches — that's the engine's job now. The default block holds identity + invariants. The phase blocks hold what to do.

### 2.4 Backward compatibility

If `role.persona` is still a `string` (old schema), the engine wraps it as `{ default: <string>, phases: {}, phase_resolver: null }`. Existing skills keep working.

---

## 3. Implementation surface

Changes are localized to the skill-engine, not the skill-builder UI or the orchestrator:

- **Schema:** `packages/skill-validator` — add the `persona` union type (string OR phased object) and validation.
- **Engine:** `apps/backend/worker/...` — before each turn, resolve phase via the declared resolver, assemble the prompt, pass to LLM.
- **Tool surface:** no new tools needed. The resolver re-uses an existing per-skill tool (`coach.state.get` here) to fetch the phase.
- **Builder UI:** add a phase tab strip in the skill editor. Optional, can defer to a later pass.

Estimated work: ~1-2 days for the engine + schema + validator. UI work is on top.

---

## 4. Why this is better than today's workarounds

Two non-platform workarounds exist today:

**(a) Inline phase branches in the persona (status quo).** What we just did with mycoach. Brittle, model-fights-the-prompt, doesn't scale to skills with 5+ phases.

**(b) Phase-shaped persona returned by the state-get tool.** The connector returns a `persona_for_phase` blob along with state, and the persona becomes a one-liner "follow state.persona_for_phase". This works without platform changes, but:
- The connector now owns prompt logic, which is wrong (connectors are data/tools, not prompts).
- Different skills' state tools all need to re-implement the same return shape.
- The prompt logic is hidden inside connector code rather than in the skill definition where authors can see it.
- Builder UI can't render or edit phase-personas.

The platform-level proposal is cleaner because phase-personas are first-class skill content: they live in the skill definition, they're versioned with the skill, they're shown in the UI, and the engine handles dispatch.

---

## 5. Open questions

- **Should `phase_resolver` accept a path on the LIVE state object** (e.g. computed by the engine from observed memory) **instead of a tool call**? Probably yes — skip the tool call when the state is already in the ALS frame. Add as a second resolver type.
- **What if a phase is undeclared?** Engine falls back to `default` only (no phase block appended) and emits a one-time warning.
- **Versioning:** when an author renames `observing` to `coaching`, existing actor states under the old key need a migration hook. Same problem as today's `coach.state.advancePhase` rename pattern — solve it the same way (alias map).
- **Strip pipeline:** the strip can be re-shaped to leave the phase map intact (it's already small per phase) while still dropping intents/scenarios. Net effect: stripped skills get SMALLER personas, not larger, because they no longer carry all phases at once.

---

## 6. Sequencing

1. Today (DONE): simplified mycoach persona (a) — trust the LLM, drop keyword greps. Works in production.
2. Soon (this proposal): platform-level phase-personas (b). Roll out per-skill: mycoach first (5 phases, biggest win), then any other skill with declared lifecycle.
3. Later: strip pipeline learns to slice phase-personas out of stripped output by default.

---

## 7. Decision needed

Ship (b) as proposed? If yes, I'll spec the schema change in `skill-validator`, draft the engine-side phase resolver, and propose a minimal Builder UI change.

This is Core platform work, not a Builder skill patch. Awaiting explicit approval before any code change.
