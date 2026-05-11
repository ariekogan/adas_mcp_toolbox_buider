# AI-Driven Solution Authoring — Schema Strip + Self-Healing Plan

**Created:** 2026-05-05
**Last amended:** 2026-05-10 (Q&A clarifications — see SECOND AMENDMENT below)
**Previous amendment:** 2026-05-05 evening (Core untouched, voice-prompt pattern, chat-only UI)
**Owner:** Arie + Claude
**Status:** Approved, full autonomous execution, ready to start Phase 0
**Reference truth:** `mobile-pa` solution (`personal-adas`) at `/Users/arie/Projects/ateam_solutions/personal-adas`

This document is the authoritative plan for a 6-week effort to strip the verbose authoring schema and make AI-driven solution authoring (the actual model that built mobile-pa) ~10× more efficient.

---

## SECOND AMENDMENT 2026-05-10 — Q&A CLARIFICATIONS

Additional binding clarifications surfaced through a Q&A drill on 2026-05-10. These refine (and in one case CORRECT) decisions in the first amendment. Read after the first amendment.

### Clarification 1: Handoff triggers are NOT a required authored field

The first amendment listed handoff triggers as something the author writes. **This was wrong.** Handoffs are implemented in Core via `sys.handoffToSkill` + `handoff-controller-mcp`. The built-in orchestrator (Phase 6) reads each skill's persona and decides routing. Handoff trigger sentences are **only needed as overrides** for cases where the orchestrator's persona-based inference is wrong.

**Corrected "what the author keeps writing":**

- Persona (prose per skill)
- Policy guardrails (never/always rules)
- Connector picks (which integrations a skill uses)
- Connector integration code (real API logic — strippable boilerplate via Phase 7 scaffolds)
- Custom UI plugin source (real UI — strippable boilerplate via Phase 7 scaffolds)
- Secrets (per-tenant, out of band)

**Authored only when overriding a platform default:**

- Handoff triggers (override file `skills/<id>/handoff_when.md` — one sentence, only when orchestrator routing is wrong)
- Engine config tweaks (override file `skills/<id>/engine.json` — only for skills that need non-default engine behavior)
- Intent precision (override file `skills/<id>/intents.json` — only when description-based intent synthesis loses precision on close calls)
- Tool security classifications (override file `skills/<id>/tool_classifications.json` — only when auto-classification by name pattern is wrong)
- Solution style override (override file at solution level — only when one skill needs different style from solution default)

### Clarification 2: Discoverability via chat is a first-class capability

The new Builder must support questions like "what can I tweak on memory-keeper that we haven't?" The user must be able to discover deep configurability through conversation, not by reading docs.

**Three sources the chat-based Builder queries on demand:**

1. **YAML defaults files in repo** (self-documenting — every configurable field is listed with its default value)
   - `Docs/style-defaults.yaml`, `Docs/engine-defaults.yaml`, `Docs/identity-presets.yaml`, etc.

2. **Focused ateam-mcp tools (Phase 9 deliverables):**
   - `ateam_get_field_spec(field_path)` — what a field does, valid values, default
   - `ateam_show_skill_resolved(skill_id)` — current effective state (defaults + overrides merged), same shape as today's verbose schema, generated on demand
   - `ateam_diff_authored_vs_resolved(skill_id)` — side-by-side: what was explicitly authored ↔ what platform derived
   - `ateam_inspect_intent_synthesis(skill_id)` — the LLM prompt + response + hash that produced synthesized intents
   - `ateam_inspect_router_decision(conversation_id)` — why the orchestrator picked the skill it did, with alternatives + confidence

3. **Validator feedback** — typos and unknown fields return "field X not recognized, did you mean Y?" with suggestions.

**Conversation patterns the chat-based Builder must support:**

- "what can I tweak on `<skill>` that we haven't?" → list of inherited defaults
- "set `<skill>`'s `<field>` to `<value>`" → write override, redeploy, confirm
- "show me what's customized vs default for `<skill>`" → `diff_authored_vs_resolved` output
- "why did you route to `<skill>` instead of `<other>`?" → `inspect_router_decision` output
- "reset `<skill>` to platform defaults" → delete override file(s), redeploy

These conversation patterns are not optional — they're how "visibility + control" is preserved in the stripped model. The author can drill into any configurability that the verbose schema used to expose. The strip eliminates required authoring, not exposed capability.

### Clarification 3: Reversibility is the foundational guarantee

The user's primary concern is not interference (production traffic is safe by architecture) — it's **the ability to keep mobile-pa exactly as it was until the new approach is proven**. The plan must make this explicit.

**Five reversibility guarantees:**

1. **mobile-pa data is never modified during the strip.** Same Mongo collections, same GitHub repo content, same skill.json files. The strip works on a parallel tenant (`personal-adas-stripped`), not on mobile-pa.

2. **mobile-pa never uses the new features.** REPLACE semantics ensure mobile-pa's explicit fields make every new code path inert. Even if a strip phase is buggy, mobile-pa is executing zero new logic.

3. **Every phase is git-tagged.** `safe-strip-phase-N-pre` and `safe-strip-phase-N-post` on every affected repo. Rollback is one `ateam_github_rollback` call + Docker rebuild.

4. **Phase-level rollback time: ~5 minutes** (revert tag, rebuild Builder Docker container).
   **Full-strip rollback time: ~30 minutes** (revert to `safe-strip-phase-0-pre`, rebuild Builder, delete `personal-adas-stripped` tenant).

5. **Phase 10 outcome is fully reversible.** If `personal-adas-stripped` looks good, the user *chooses* to migrate (or not). If it looks bad, delete it via `ateam_delete_solution`. mobile-pa stays exactly as-is. There is no "schema dependency" or "data migration" forced on mobile-pa by the strip's existence.

### Clarification 4: The new Builder is a strict superset of the old one

There's only one Builder running on mac1. When mobile-pa redeploys during the strip window (or after), it uses the new Builder. **This is safe because:**

- New Builder treats explicit-field skills (like mobile-pa's) identically to the old Builder. REPLACE wins. Same bytes deployed.
- Skills can mix old-style (verbose, explicit) and new-style (minimal, derived) within the same solution.
- Migration of an existing skill from verbose to minimal is opt-in, granular (one skill at a time), and reversible (just restore the explicit fields).

The new Builder is to the old Builder what TypeScript is to JavaScript: a strict superset that handles old code identically and adds new capabilities for new code.

### Clarification 5: Override mechanics happen via chat, not manual file editing

The user does not open file editors. Override files are created and edited by Claude via ateam-mcp tools, driven by chat:

```
You: "increase max_iterations on memory-keeper to 25"
Me: writes skills/memory-keeper/engine.json with the override
    runs ateam_redeploy(solution_id: "personal-adas")
    confirms the override is in effect
```

Same pattern for every override type:
- Persona edits → `ateam_patch` with new persona text
- Engine tweaks → write `engine.json` override file
- Handoff trigger correction → write `handoff_when.md` override file
- Intent precision → write `intents.json` override file
- Style change → patch `solution.style` field

**The author's authoring surface is chat. The override-file mechanism is platform internals.**

### Clarification 6: Same Builder, different tenants — operational isolation acknowledged

The strip development uses:
- **Same mac1 instance** (no separate `mcp-dev.ateam-ai.com`)
- **Same Builder Docker container**, restarted between phases
- **Same Core Docker container** (untouched per first amendment)
- **Two different tenants**: `mobile-pa` (production, frozen) and `personal-adas-stripped` (Phase 10 validation, new)

The single-instance model gives **~99% isolation**:
- Production runtime path (mobile/voice/web → Core → skills → connectors) is fully isolated. Builder is not in this path.
- Design-time path (chat → ateam-mcp → Builder) is shared. ~30-second Builder restart windows during phase transitions are the only operational overlap.

The remaining ~1% risk: if the user triggers an emergency mobile-pa redeploy during a Builder restart, the deploy fails — retry works. Mitigation: I tag stable points (`safe-strip-phase-N-post`), and mobile-pa redeploys at any tagged state are safe.

**A truly separate dev instance is possible but not recommended.** It would require a second docker-compose project on mac1 with different ports and a `mcp-dev.ateam-ai.com` Cloudflare route. Heavier infra, marginal gain. Single-instance plan is the chosen path.

### Common mistakes a fresh agent might make (adds to first amendment's list)

8. **Treating handoff triggers as required authored content.** They're optional overrides. Default is built-in orchestrator reading personas.
9. **Hiding deep capabilities from the chat-based Builder.** Discoverability via chat is mandatory. Every configurable field must be queryable.
10. **Forcing migration of mobile-pa to stripped form.** It's optional, opt-in, reversible.
11. **Manual override file editing.** Author does not edit files. Claude writes overrides via ateam-mcp, driven by chat.

---

## AMENDMENT 2026-05-05 EVENING — READ THIS FIRST

After the original plan was drafted, several architectural decisions were locked down in conversation that **override the original phase definitions below**. A fresh Claude session opening this doc MUST internalize these before reading anything else.

### Binding decisions (in priority order)

#### 1. Core (`ai-dev-assistant`) is UNTOUCHED for the entire project

The original plan listed Core touches in Phases 3, 6, and 8. **All of these are reframed as Builder-side deploy-time work.** Core stays a constant. No new Core builds. No new Core mongo collections. No new Core code paths. The runtime that real users hit doesn't change.

| Original phase placement | Corrected placement |
|---|---|
| Phase 3: intent synthesis (Core, runtime LLM cache-once) | **Builder, deploy-time LLM synthesis, written into skill.json before save** |
| Phase 6: built-in orchestrator (Core, runtime feature) | **Builder, generates an `_orchestrator` skill at deploy when `routing_mode: "auto"` set; Core sees it as a normal skill** |
| Phase 8: validator fix-suggester (skill-validator package) | **Builder-side. The `packages/skill-validator/` workspace lives in the Builder repo, not Core.** |

**Touch surface, corrected:**
- Builder (`adas_mcp_toolbox_builder`): Phases 0, 1, 2, 3, 4, 5, 6, 8
- ateam-mcp: Phases 7, 9
- Core (`ai-dev-assistant`): NONE
- ateam_solutions: only Phase 10 (creates `personal-adas-stripped` parallel tenant)

The existing Tier 2 uiActions synthesizer in Core (`apps/backend/tools/impl/controlpanel/cp.uiActions_api/synthesizer.js`) **stays** — it's shipped, working, covers edge cases (plugins added via ateam-mcp uploads bypassing Builder). Do NOT migrate it. Do NOT touch it.

#### 2. Voice-prompt pattern is the canonical reference, not always-Mongo-side-tables

The original plan defaulted to Tier 1/Tier 2 LLM-cache-once side-tables for every concern. **This was wrong for most cases.** The user pointed out the voice-prompt editor implementation as the reference architecture:

- **Defaults:** YAML in repo (`/Users/arie/Projects/ai-dev-assistant/apps/voice/backend/defaults/voice-prompt.yaml`). Source-controlled, visible, diffable.
- **Customizations:** Mongo, per-tenant, ONLY the deltas (`storage/voicePromptCustomizations.js`).
- **Compiler:** merges defaults + customizations on read (`voicePromptCompiler.js`).
- **Author UI:** chat-driven patches via LLM (`PromptEditor.jsx` — chat panel + config viewer with customizations highlighted).

**Three patterns, not five:**

| Pattern | Use for | Location of defaults |
|---|---|---|
| A. YAML defaults + customization compiler (voice-prompt pattern) | engine config, identity presets, style inheritance, common policy patterns | YAML in repo (Builder side) |
| B. Deploy-time derivation (deterministic, no LLM) | tool bridge auto-import from connectors, plugin manifest auto-discovery | Code in Builder |
| C. Tier 1 deploy-time LLM synthesis in Builder (NOT Core-side Tier 2) | intents from persona, generated `_orchestrator` skill | LLM-generated, written into deployed artifact |

**The Tier 2 Core-side LLM cache-once pattern is reserved for the existing uiActions case only.** Don't extend it.

#### 3. UI: chat-only

The field-editor Builder UI panels (SkillPanel, IntentsPanel, EnginePanel, PolicyPanel, ToolsPanel, ConnectorsPage, etc.) are **retired**. They embodied the form-driven authoring model that the strip is fighting.

What stays:
- Voice-prompt PromptEditor (domain-specific, narrow, already shipped)
- A small read-only status dashboard (Phase 0, optional)
- End-user surfaces (mobile app, voice channels) — out of scope, untouched

What goes:
- All field-editor panels in `apps/frontend/src/components/`
- ChatPanel's regex routing to those panels
- MiniDashboard with completeness badges
- The 1,667-line SkillPanel + 11 sub-panels

**Authoring is chat with Claude + ateam-mcp.** Inspection is markdown rendered in chat replies. The user (Arie) explicitly said: "I will NEVER create UI." Do not propose new UI surfaces. Do not maintain the existing field-editor panels.

#### 4. Full autonomous execution — one green light, then silence

The original plan required user thumbs-up per phase (11 decision points over 6 weeks). **This was rejected.** The user wants:

- One thumbs-up to start (already given for 2026-05-06 morning)
- Autonomous execution from there
- Silence-or-notify model: ping only on failure or phase completion
- User halts via "stop" anytime

**Halt triggers (automatic):**
1. Any regression test fails post-phase → auto-rollback to `safe-strip-phase-N-pre` tag → notify
2. mobile-pa health check fails → halt, notify
3. User says "stop" → halt mid-phase
4. (Future) User observes wrong behavior in real mobile-pa use → user says "stop"

**Notification formats:**
- Success: one line. Example: `✅ Phase 3 complete. 18/18 tests pass. Tag: safe-strip-phase-3-post. Proceeding to Phase 4.`
- Failure: detailed. Example: `❌ Phase 4 failed. Test "memory_recall_short" regressed: expected "Got it" → got 47-word essay. Rolled back to safe-strip-phase-4-pre. mobile-pa is healthy. Halting until you say "investigate" or "abort."`

#### 5. Existing connector + UI plugin authoring stays

The strip does NOT eliminate Claude's role in writing custom connector code or custom UI plugin code. Domain-specific integration logic (Hue API, OAuth flows, custom UI behavior) remains author-generated. What gets stripped:
- ~50% of every connector and plugin = boilerplate (MCP server setup, theme/bridge hooks, postMessage protocol, RN imports)
- Stripped via Phase 7 scaffolds (`ateam_create_connector`, `ateam_create_plugin`)

Pre-built MCPs from the catalog (gmail-mcp, telegram-mcp, etc.) require zero code from Claude — connect them by name. Custom MCPs require integration logic only — boilerplate is scaffold-generated.

**The flow stays:** user describes in chat → Claude generates the full solution including connectors + UI. Only the redundant boilerplate around connectors+UI goes away.

#### 6. mobile-pa is the regression target, NEVER migrated

`personal-adas` at `/Users/arie/Projects/ateam_solutions/personal-adas/` is **frozen** for the entire 6 weeks. Real users hit it. Phase 10 creates a **parallel** solution (`personal-adas-stripped` in a new tenant) for validation testing. Original mobile-pa is never modified, never migrated, never replaced as part of this plan. Migration is a separate decision after Phase 10 results.

#### 7. Inspection layer = generalize the voice-prompt PromptEditor pattern

The user's original concern about visibility was valid: stripping moves complexity into the platform. The answer: every concern that gets stripped also gets:
- A YAML defaults file in the repo (visible, diffable)
- A "show resolved" view rendered in chat (markdown table or code block, like PromptEditor's "Preview Compiled Prompt")
- A "show what's customized" diff (markdown, like PromptEditor's blue highlights)
- A `Reset to Defaults` equivalent (chat command)

This is **not a separate phase** — it's a constraint on every strip phase. Each phase ships with its inspection rendering.

### Concrete amendments to the phase definitions below

When reading the phase definitions later in this doc, apply these corrections:

- **Phase 1 (style inheritance):** ship `Docs/style-defaults.yaml` + per-tenant customizations (Mongo) + voicePrompt-style compiler. Not just a code change.
- **Phase 3 (intent synthesis):** Builder-side. New file `apps/backend/src/services/intentSynthesizer.js`. Called from `exportDeploy.js` at deploy time. Source-hash invalidated. NO Core changes. NO new Core mongo collection. The synthesizer's output is written directly into the skill.json blob deployed to Core, where it appears as a normal `intents.supported[]` field.
- **Phase 4 (engine defaults):** ship `Docs/engine-defaults.yaml` + voicePrompt-style compiler. Same pattern as Phase 1.
- **Phase 6 (built-in orchestrator):** Builder-side. New file `apps/backend/src/services/builtinOrchestrator.js`. At deploy when `solution.routing_mode === "auto"`, Builder generates a regular skill named `_orchestrator` and includes it in the deployed bundle. Core sees a normal skill, has no idea it was generated. NO Core changes.
- **Phase 8 (validator fix-suggester):** Builder-side, in `packages/skill-validator/` (which lives in the Builder repo). NOT a Core change.
- **Phase 11 (inspection):** NOT a separate phase. Each strip phase ships with its inspection rendering as a constraint.

### Common mistakes a fresh agent might make (and must avoid)

1. **Putting intent synthesis in Core.** Wrong. The user explicitly corrected this on 2026-05-05 ("you made a mess" earlier in the day, then "or its ONLY the builder?" in the evening). Builder-side, deploy-time, written into skill.json. Period.

2. **Creating new Mongo side-tables in Core.** Wrong for everything except the existing uiActions case. Use YAML defaults + Mongo deltas (voice-prompt pattern) for most concerns.

3. **Maintaining or extending the field-editor Builder UI.** Wrong. Retire it. Chat is the only authoring surface.

4. **Asking the user for per-phase thumbs-up.** Wrong. Autonomous from the initial green light. Notify only on completion or failure.

5. **Migrating mobile-pa.** Wrong. mobile-pa is frozen reference. Phase 10 creates a parallel solution.

6. **Touching Core for any reason during the strip.** Wrong. The whole point of the evening's amendment is that Core stays a constant.

7. **Treating the strip as a UI project.** Wrong. The user doesn't write UI, doesn't want a Builder UI. The strip is about reducing what Claude has to write per session, not about any human-facing UI.

### What's been delivered already (do not redo)

- **Tier 1+2 uiActions auto-generation** (2026-05-05, earlier in the day). Code paths:
  - `apps/backend/storage/uiActionsGenerated.js` — Core mongo CRUD
  - `apps/backend/storage/collections.js` — `UI_ACTIONS_GENERATED` constant + index
  - `apps/backend/routes/uiActions.js` — admin/CRUD endpoints
  - `apps/backend/server.js` — mounts `/api/ui-actions`
  - `apps/backend/tools/impl/controlpanel/cp.uiActions_api/manifestFetcher.js` — extended with side-table read + Tier 2 synthesizer call
  - `apps/backend/tools/impl/controlpanel/cp.uiActions_api/synthesizer.js` — Tier 2 LLM synthesis with single-flight, skip sentinels, source-hash invalidation
  - Builder side: `apps/backend/src/services/uiActionsAutoDefaults.js` — Tier 1 heuristic only, no LLM
- **Mongo side-table populated** with skip sentinels for utility plugins (validated by another agent in same-day testing)
- **The Tier 2 synthesizer in Core stays** — covers ateam-mcp upload edge cases. Don't migrate.
- **F3 storage discipline** (GitHub source of truth, boot sync, write coupling, pre-deploy guard).
- **A1 stdio migration** (skills are stdio MCPs, ports gone).

---

## TL;DR

mobile-pa today is ~17,000 lines of JSON config + connector code + UI source. **Claude (the AI agent) wrote all of it**, in a chat-driven loop with the user via `ateam-mcp`. The bulk of those 17k lines are rote schema-filling, not solution design.

This plan strips ~90% of the schema by absorbing it into platform defaults, auto-derivation, and auto-synthesis — using the same Tier 1/Tier 2 pattern we shipped for `uiActions` on 2026-05-05. After this plan ships:

- Same mobile-pa quality, ~2k chars of authored prose instead of ~17k lines of JSON
- New solutions: 3-hour author sessions instead of week-long projects
- Claude focuses on integration logic and persona shaping, not JSON typing
- Deploy round-trips drop from 50+ to <10 per solution
- mobile-pa is the **regression target** throughout — never modified, never broken

---

## Why this exists

### Reframe: the AI agent is the builder, not the human

The user (Arie) explicitly stated: **"I will NEVER create files. I will NEVER create UI. Today based on ateam-mcp YOU created the whole mobile-pa solution."**

This is correct. mobile-pa was authored by Claude via `ateam-mcp` tools, driven by user direction in chat. The user provided vision, corrections, and quality feedback. Claude wrote every JSON file, every connector `server.js`, every UI plugin source.

The strip's optimization target is therefore **the AI agent's authoring work**, not human authoring. The "chat-based builder" already exists — it's Claude + ateam-mcp. We're not inventing a new user experience. We're optimizing an existing one by shrinking the schema the AI must master and the artifacts the AI must generate.

### What Claude struggled with when building mobile-pa

Honest pain list from the AI's seat:

| Pain point | Token cost |
|---|---|
| Reading platform spec on every session (`ateam_get_spec`, `ateam_get_examples`) | High |
| Generating 200–8000-line `skill.json` per skill | Very high |
| Writing 200-line `engine.*` blocks identical across 10 skills | Pure waste |
| Writing 136 tool bridge declarations (auto-derivable from connectors) | Pure waste |
| Generating 70 hand-curated intent rules with examples | High |
| Repeating "MOBILE CHAT — 1-3 sentences" in 10 personas | Pure duplication |
| Writing identical MCP server boilerplate × 14 connectors | Very high |
| Writing identical RN component scaffolding × 12 plugins | High |
| Iterating on opaque deploy validation errors (3-5 round trips per change) | High |

**Notice what's NOT on the list:** writing personas, writing actual integration logic (Hue API calls, Gmail OAuth flow), writing actual UI behavior. Those were the *valuable* parts. The strugglers were schema mechanics, not solution design.

The strip's job is to delete everything on the pain list while preserving the valuable parts.

---

## Architectural anchor

Every move in this plan reuses the exact pattern we shipped for `uiActions` on 2026-05-05:

### The Tier 1/Tier 2 pattern

1. **Tier 1 — Builder, deploy-time, heuristic.** Synthesizes from manifest data at deploy time, writes back into the manifest. Result lands in mongo + GitHub. Greppable, debuggable, copy-editable.
2. **Tier 2 — Core, runtime, LLM cache-once.** When Tier 1 misses (or never ran), Core synthesizes via LLM on first read, writes through to a mongo side-table (`<concern>_generated`). All subsequent reads hit Mongo directly. Single-flight gate per (tenant, target) prevents concurrent first-chat double-billing. Source-hash invalidation: when source changes, regenerate once, cache again.
3. **REPLACE override semantics.** Explicit author input always wins. Only synthesize when the field is `undefined`. This makes auto vs hand-authored distinguishable and gives authors full control.
4. **Skip sentinels.** When a target can't be synthesized confidently, write a "skip" sentinel doc to the side-table so we don't retry on every chat. Sentinel persists until source changes.

If a phase below doesn't fit that pattern, it gets reshaped until it does. The pattern is proven; we extend it.

### Why mobile-pa is safe under this pattern

mobile-pa has explicit values for every field in the verbose schema. REPLACE semantics means strip moves **never override existing data** — they only activate when fields are absent. mobile-pa keeps working identically through every phase.

---

## Phase-by-phase plan

### Phase 0 — Baseline measurement (1 day)

**Goal:** capture current cost so we can prove improvement.

**Deliverables:**
- `Docs/STRIP_BASELINE_2026-05-05.md` with these numbers:
  - Total lines of JSON: `solution.json` + 11 `skill.json`
  - Average lines per skill
  - Token count of `ateam_get_spec` outputs (per topic)
  - Token count of `ateam_get_examples` outputs (per type)
  - Last full mobile-pa rebuild: deploy round-trips, total tokens, wall time
  - Conversation regression suite (10–15 fixed conversations, expected outputs)

**Validation:** numbers checked into git, reproducible. `Docs/strip-regression-suite.yaml` ready to run before/after each phase.

**Files touched:** `Docs/` only. No code change.

---

### Phase 1 — Solution-level style inheritance (2 days)

**Problem:** mobile-pa repeats "MOBILE CHAT — 1-3 sentences, casual, no preamble" inside 10 different skill personas. ~3k chars of duplication. Drift over time.

**Change:**
- Add `solution.style` field (free-form prose).
- At deploy, Builder prepends `solution.style` to each skill's persona before sending to Core.
- Skills can override locally with `skill.style` (REPLACE).

**Files:**
- `apps/backend/src/services/exportDeploy.js` — prepend style during deploy
- `apps/backend/src/store/solutions.js` — accept new field
- Spec doc: append to existing schema doc

**Validation:** mobile-pa redeploy succeeds, behavior identical. Save ~3k chars when authors choose to dedupe.

**Risk:** zero, purely additive.

**Rollback:** `safe-strip-phase-1-pre` tag.

---

### Phase 2 — Auto-import tool bridges from connectors (4 days)

**Problem:** every `skill.json` declares `tools[]` with full bridge config (`source.type: "mcp_bridge"`, `connection_id`, `mcp_tool`, `inputs[]`, `output`). 136 of these in mobile-pa, all redundant — the connector already exposes them via MCP `tools/list`.

**Change:**
- Drop `tools[]` from skill schema (remains optional, REPLACE wins).
- At deploy, Builder calls each connector's `tools/list` MCP method, builds bridge declarations, includes them in the skill blob sent to Core.
- New optional field: `skill.excluded_tools: ["delete_*", "send_money"]` for deny-listing.
- Tool security classifications default to `destructive` for `delete_*|drop_*|remove_*|send_*|transfer_*|post_*` patterns, otherwise `internal`. Override via `tool_classifications.json`.

**Files:**
- `apps/backend/src/services/connectorTools.js` (new) — fetch tool list from connector
- `apps/backend/src/services/exportDeploy.js` — auto-populate bridges before deploy
- Schema update: `tools[]` becomes optional, `excluded_tools[]` added

**Validation:** skill with no `tools[]` deploys with auto-imported bridges. mobile-pa still works (its explicit `tools[]` wins under REPLACE). Save ~1,500 lines per solution when authors omit explicit tools.

**Risk:** auto-classification could mark a non-destructive tool as destructive. Mitigation: log every classification, expose `ateam_inspect_tool_classifications(skill)` for AI auditing.

**Rollback:** explicit `tools[]` always works. `safe-strip-phase-2-pre` tag.

---

### Phase 3 — Auto-synthesize intents from persona + tools (5 days)

**Problem:** every `skill.json` has `intents.supported[]` with hand-curated examples and `candidate_tools[]`. 70 of these in mobile-pa.

**Change:** apply Tier 1/Tier 2 uiActions pattern to intents.

- New mongo collection `intents_generated`. Schema: `{ _id: skillSlug, intents[], source_hash, generated_at, generator_kind }`.
- New: `apps/backend/storage/intentsGenerated.js` — mirrors `uiActionsGenerated.js`.
- New: `apps/backend/storage/collections.js` — add `INTENTS_GENERATED` constant + index.
- New: `apps/backend/tools/impl/.../intentSynthesizer.js` — same shape as `uiActions/synthesizer.js`. Reads persona + connector tool list, calls LLM, writes through to side-table, single-flight gate.
- New: `apps/backend/tools/impl/.../intentFetcher.js` — same shape as `uiActions/manifestFetcher.js`. 4-step resolution: explicit → side-table → synthesize → cache.
- Author can drop `intents.json` next to skill for explicit override.
- Source-hash: `sha256({persona, tools[]})`. Persona edit → re-synth on next chat.

**Files:** see above. Mirror the uiActions implementation file-for-file.

**Validation:** drop `intents.supported[]` from a test skill, run sample conversations, compare routing accuracy to baseline. Target ≥90% match.

**Risk:** auto-synthesis loses precision on close-call intents. Mitigation: skip sentinel pattern when LLM can't generate confident intents; author drops `intents.json` for that skill.

**Rollback:** any skill with explicit `intents.supported[]` falls back to current behavior. `safe-strip-phase-3-pre` tag.

---

### Phase 4 — Engine config + identity defaults (2 days)

**Problem:** every `skill.json` carries identical 80-line `engine.*` blocks. Single-owner solutions copy the same identity block 1:1.

**Change:**
- All `engine.*` fields become platform defaults from `Docs/ENGINE_DEFAULTS.json` (versioned).
- Author can write `engine: "fast" | "careful" | "autonomous"` (preset) OR explicit `engine: { ... }` (override).
- Identity becomes `identity_mode: "single-owner" | "multi-tenant" | "team-roles"`. Each preset expands at deploy.
- mobile-pa = `identity_mode: "single-owner"`.

**Files:**
- `Docs/ENGINE_DEFAULTS.json` (new)
- `Docs/IDENTITY_PRESETS.json` (new)
- `apps/backend/src/services/exportDeploy.js` — expand presets before deploy

**Validation:** drop `engine.*` from a test skill, replace identity with `identity_mode: "single-owner"`. Redeploy. Behavior identical.

**Risk:** very low. Custom needs still use explicit override.

**Rollback:** `safe-strip-phase-4-pre` tag.

---

### Phase 5 — Plugin auto-discovery (3 days)

**Problem:** `solution.ui_plugins[]` declares 12 plugins manually. Each duplicates info that's already in the connector's `plugins/<id>/` or `ui-dist/<id>/` folder.

**Change:**
- At deploy, Builder scans every connector's `plugins/*/index.tsx` and `ui-dist/*/index.html`. For each, generates a manifest (id from path, type from extension, render = `adaptive` default).
- Plugin author can drop `plugins/<id>/manifest.json` for overrides.
- `solution.ui_plugins[]` becomes optional; if absent, all discovered plugins auto-included.

**Files:**
- `apps/backend/src/services/pluginDiscovery.js` (new)
- `apps/backend/src/services/exportDeploy.js` — call discovery, populate `ui_plugins[]`

**Validation:** test solution with no `ui_plugins[]`, all auto-discovered. mobile-pa unchanged (REPLACE wins).

**Risk:** ambiguity if same plugin name in multiple connectors. Mitigation: id is `mcp:<connector>:<plugin>`, fully qualified — no collision possible.

**Rollback:** `safe-strip-phase-5-pre` tag.

---

### Phase 6 — Built-in orchestrator router (7 days, riskiest phase)

**Problem:** `pa-orchestrator` is a 2,386-char skill whose entire job is routing. Every multi-skill solution needs an equivalent.

**Change:**
- New solution-level config: `routing_mode: "auto"` (opt-in for new solutions).
- Platform ships a built-in `_orchestrator` skill auto-created when `routing_mode: "auto"`.
- It reads each child skill's persona + a per-skill `handoff_when` field (one-line trigger description).
- Replaces hand-coded `pa-orchestrator` for new solutions.
- Existing solutions keep their explicit orchestrator (REPLACE).

**Files:**
- `apps/backend/src/services/builtinOrchestrator.js` (new)
- `apps/backend/src/services/exportDeploy.js` — synthesize orchestrator skill at deploy
- Per-skill schema: add `handoff_when: string` (optional)

**Validation:** create parallel `personal-adas-stripped` solution with `routing_mode: "auto"`. No hand-written orchestrator. Run real conversations. Target ≥85% routing match to current `pa-orchestrator`.

**Risk:** highest of any phase. Hand-tuned routing in mobile-pa is precise; auto-router will lose nuance. Mitigation: `handoff_when` is the override — author writes the trigger phrase explicitly, which IS what mobile-pa's orchestrator does today.

**Rollback:** `routing_mode: "auto"` opt-in. Existing solutions unaffected. `safe-strip-phase-6-pre` tag.

---

### Phase 7 — Connector + plugin scaffolds (3 days)

**Problem:** every connector starts with ~200 lines of identical MCP-server boilerplate. Every RN plugin starts with ~80 lines of identical hooks/imports.

**Change:** add MCP tools to ateam-mcp:
- `ateam_create_connector(name, kind?, ui_capable?)` → produces `connectors/<name>/{server.js, package.json}` with working stubs.
- `ateam_create_plugin(connector_id, plugin_name, type)` → produces working plugin scaffold with theme/bridge/native hooks.

**Files:**
- `tools/connectorTemplate/` (new)
- `tools/pluginTemplate/` (new)
- `ateam-mcp/src/tools.js` — add the two new MCP tools
- npm publish + Docker rebuild + restart cycle (per CLAUDE.md global rules)

**Validation:** create new connector via the new tool. AI only writes tool implementations, not setup. Compare token count vs writing from scratch.

**Risk:** templates go stale. Mitigation: template versioned, tested in CI.

**Rollback:** `safe-strip-phase-7-pre` tag (ateam-mcp prior version).

---

### Phase 8 — Self-healing deploy validator (5 days)

**Problem:** today, `validation.errors[]` reports issues like `INVALID_VERBOSITY: must be one of concise/balanced/detailed`. AI reads error → guesses fix → redeploys → next error → loop. 3-5 round trips per change.

**Change:**
- Validator runs an LLM pass on its output. For each error, generates `suggested_fix: { path, replacement }` if it's a clear case.
- Deploy endpoint accepts `auto_apply_fixes: true` flag.
- For ambiguous errors, return both `error` AND `suggested_fix` — AI chooses.

**Files:**
- `packages/skill-validator/src/services/fixSuggester.js` (new — LLM-driven, uses Core's `callAI` adapter)
- `packages/skill-validator/src/routes/deploy.js` — wire suggester into validation response
- `apps/backend/src/routes/deploy.js` — accept `auto_apply_fixes` flag

**Validation:** rebuild a test skill with intentional small errors. Deploy with `auto_apply_fixes: true`. Target ≥80% trivial errors auto-fixed in 1 round trip.

**Risk:** auto-fix changes intent. Mitigation: only apply fixes with confidence ≥0.9. Lower confidence → return suggestion only.

**Rollback:** `auto_apply_fixes` defaults to false. `safe-strip-phase-8-pre` tag.

---

### Phase 9 — Smaller, focused ateam-mcp responses (3 days)

**Problem:** `ateam_get_spec(topic)` and `ateam_get_examples(type)` return giant docs. Claude burns context on every session.

**Change:** add focused variants:
- `ateam_get_field_spec(field_path)` — one field's contract + 2-3 examples
- `ateam_show_skill_minimal(id)` — persona + connectors + handoff_when only
- `ateam_show_solution_minimal(id)` — identity_mode + skills + style only
- `ateam_diff_skill(id)` — what changed since last deploy

**Files:**
- `ateam-mcp/src/tools.js` — add four new tools
- npm publish + Docker rebuild + restart cycle

**Validation:** measure context tokens for typical mobile-pa modification session. Target ≥50% reduction.

**Risk:** trivial.

**Rollback:** `safe-strip-phase-9-pre` tag.

---

### Phase 10 — Real test: rebuild mobile-pa from scratch (1 week)

This is the validation gate.

**Setup:**
- Fresh tenant `personal-adas-stripped` (parallel to `personal-adas`)
- Fresh chat with Claude
- All new MCP tools, scaffolds, and stripped schema available
- Reference: current `personal-adas` solution

**Process:**
1. User: high-level direction in chat (same as how mobile-pa was built originally)
2. Claude builds via ateam-mcp using stripped schema + auto-derivation + scaffolds
3. Deploy. Test conversations. Iterate.
4. After ~3 hours of chat, compare to baseline mobile-pa.

**Success metrics:**
- Lines of JSON authored: ≤2,000 (vs ~17,000 baseline)
- Deploy round-trips: ≤10 (vs ~50+ baseline)
- Conversation tokens consumed: ≤50% of baseline
- Conversation quality (routing, style): ≥90% match to current mobile-pa

**Outcomes:**
- **Success:** ship the strip, deprecate explicit schema fields with 30-day migration window, update CLAUDE.md global rules
- **Partial:** identify which phase's auto-derivation underperforms, harden, retest
- **Failure:** rollback most aggressive phase (likely Phase 6), keep rest, document limit

---

## Sequencing & critical path

```
Phase 0 (1d) → baseline
   ↓
Phase 1 (2d) ─┐ Quick wins, no dependencies
Phase 4 (2d) ─┤
   ↓
Phase 2 (4d) → Phase 3 (5d)   [tools auto-import, then intents auto-synth]
   ↓
Phase 5 (3d)                  [plugin discovery — independent]
   ↓
Phase 6 (7d)                  [built-in orchestrator — riskiest]
   ↓
Phase 7 (3d) ─┐ Independent of stripping moves
Phase 8 (5d) ─┤
Phase 9 (3d) ─┤
   ↓
Phase 10 (1w) → real-test rebuild
```

**Total:** ~6 weeks of focused build + 1 week test/iteration.
**Critical path:** Phase 0 → 2 → 3 → 6 → 10. Other phases parallelize.

---

## Safety mechanics

### No branching — main only

Per CLAUDE.md global rules: "Single branch: main — all changes go here directly. This IS the live running system." Every phase is additive or feature-flagged. mobile-pa never depends on the strip activating.

### Per-phase tag protocol

Before each phase:
1. Tag platform with `safe-strip-phase-N-pre`
2. Ship phase to main
3. Run regression suite
4. **If green:** tag `safe-strip-phase-N-post`
5. **If red:** revert to `safe-strip-phase-N-pre`, fix, retry

Use existing `ateam_github_promote` / `ateam_github_rollback` mechanism.

### Regression test (runs before/after every phase)

Stored at `Docs/strip-regression-suite.yaml`. Fixed set of conversations:

```yaml
- name: memory_recall
  input: "remember that my wife's name is Sarah"
  expected_route: memory-keeper
  expected_style: "Got it." or "Saved."
  pass_criteria: exact_route + ≤10_words

- name: calendar_lookup
  input: "what's on my calendar tomorrow"
  expected_route: life-manager
  expected_style: mobile-chat brief
  pass_criteria: exact_route

# ...10–15 total covering each of mobile-pa's 11 skills
```

Run via script that drives the chat API. Output: green/red per case + diff. Any phase that fails ≥1 case rolls back before next phase.

### What's frozen

- `mobile-pa` solution at `/Users/arie/Projects/ateam_solutions/personal-adas` is **untouched** through Phase 9.
- mobile-pa's deploy onto mac1 keeps running on production for real users.
- Phase 10 creates `personal-adas-stripped` as a NEW tenant — original mobile-pa is the reference, not the migration target.

---

## Cross-repo file map (CORRECTED per evening amendment)

**Core is NOT touched in any phase.** All Builder-side, ateam-mcp-side, or new-tenant work.

| Phase | Repo | Key files |
|---|---|---|
| 0 | adas_mcp_toolbox_builder (Builder) | `Docs/STRIP_BASELINE_2026-05-05.md`, `Docs/strip-regression-suite.yaml`, `scripts/run-strip-regression.mjs`, `scripts/strip-phase.mjs` |
| 1 | adas_mcp_toolbox_builder (Builder) | `Docs/style-defaults.yaml` (new), `apps/backend/src/services/styleCompiler.js` (new — voicePrompt pattern), `apps/backend/storage/styleCustomizations.js` (new — Mongo deltas), `apps/backend/src/services/exportDeploy.js` |
| 2 | adas_mcp_toolbox_builder (Builder) | `apps/backend/src/services/connectorTools.js` (new), `apps/backend/src/services/exportDeploy.js` — auto-import tool bridges from connector `tools/list` at deploy time |
| 3 | adas_mcp_toolbox_builder (Builder) | `apps/backend/src/services/intentSynthesizer.js` (new — Builder-side LLM synthesis at deploy), `apps/backend/storage/intentsCache.js` (new — Builder-side mongo cache for source-hash invalidation), `apps/backend/src/services/exportDeploy.js`. **NO Core changes.** Output written into skill.json before deploy. |
| 4 | adas_mcp_toolbox_builder (Builder) | `Docs/engine-defaults.yaml` (new), `Docs/identity-presets.yaml` (new), `apps/backend/src/services/engineCompiler.js` (new — voicePrompt pattern), `apps/backend/src/services/exportDeploy.js` |
| 5 | adas_mcp_toolbox_builder (Builder) | `apps/backend/src/services/pluginDiscovery.js` (new), `apps/backend/src/services/exportDeploy.js` — walks connector `plugins/*/` and `ui-dist/*/` at deploy |
| 6 | adas_mcp_toolbox_builder (Builder) | `apps/backend/src/services/builtinOrchestrator.js` (new), `apps/backend/src/services/exportDeploy.js`. Generates an `_orchestrator` skill.json at deploy when `solution.routing_mode === "auto"`. **NO Core changes** — Core sees a normal skill. |
| 7 | ateam-mcp | `tools/connectorTemplate/` (new), `tools/pluginTemplate/` (new), `src/tools.js`. Triggers npm-version + Docker rebuild + local-process kill cycle per CLAUDE.md global rules. |
| 8 | adas_mcp_toolbox_builder (Builder) | `packages/skill-validator/src/services/fixSuggester.js` (new), `packages/skill-validator/src/routes/deploy.js`, `apps/backend/src/routes/deploy.js`. **`packages/skill-validator/` lives in the Builder repo, not Core.** |
| 9 | ateam-mcp | `src/tools.js` — adds `ateam_get_field_spec`, `ateam_show_skill_minimal`, `ateam_show_solution_minimal`, `ateam_diff_skill`. Triggers npm + Docker cycle. |
| 10 | ateam_solutions | NEW: `personal-adas-stripped/` directory (parallel to `personal-adas/`). Original mobile-pa is never modified. |

### Repos that change

- **Builder (`adas_mcp_toolbox_builder`)** — Phases 0, 1, 2, 3, 4, 5, 6, 8
- **ateam-mcp** — Phases 7, 9
- **ateam_solutions** — Phase 10 only (new parallel solution)

### Repos that DO NOT change

- **Core (`ai-dev-assistant`)** — zero changes during the strip. Existing Tier 2 uiActions synthesizer stays as-is.
- **ateam-mobile** — out of scope, no changes
- **Existing connectors** — out of scope, no changes
- **`/Users/arie/Projects/ateam_solutions/personal-adas/`** — frozen reference

---

## Starting protocol (per phase)

For each phase:

1. **Verify previous phase's `-post` tag is green** (regression suite passed).
2. **Read the phase definition** in this doc.
3. **Tag pre-state:** `ateam_github_promote(<each affected solution_id>)` for affected platform repos. Note tags in commit message.
4. **Read mobile-pa baseline:** `Docs/STRIP_BASELINE_2026-05-05.md` and `Docs/strip-regression-suite.yaml`.
5. **Implement** following the phase's file map.
6. **Build & deploy** per CLAUDE.md mac1 deploy commands.
7. **Run regression suite** against mobile-pa. Capture diff.
8. **If green:** tag `safe-strip-phase-N-post`. Update this doc's "Status" line. Move to next phase.
9. **If red:** rollback to `safe-strip-phase-N-pre`. Diagnose. Either fix-forward or back off. Document failure mode in this doc.

---

## Agent handoff notes (for fresh Claude session)

If you (a future Claude session) are picking this up, **read the AMENDMENT 2026-05-05 EVENING section at the top of this doc FIRST.** It contains binding decisions that supersede parts of the original plan body. Then read in this order:

1. **AMENDMENT 2026-05-05 EVENING** (top of this doc) — binding architectural decisions
2. **The rest of this doc** — phase plan, sequencing, safety mechanics
3. **`Docs/STRIP_BASELINE_2026-05-05.md`** — current mobile-pa numbers (created in Phase 0)
4. **`Docs/strip-regression-suite.yaml`** — the conversations to test (created in Phase 0)
5. **`/Users/arie/.claude/CLAUDE.md`** — global A-Team rules
6. **`/Users/arie/Projects/adas_mcp_toolbox_builder/CLAUDE.md`** — project rules
7. **Voice-prompt reference architecture** (the canonical pattern for YAML-defaults + customizations + compiler):
   - `/Users/arie/Projects/ai-dev-assistant/apps/voice/backend/defaults/voice-prompt.yaml`
   - `/Users/arie/Projects/ai-dev-assistant/apps/voice/backend/storage/voicePromptCustomizations.js`
   - `/Users/arie/Projects/ai-dev-assistant/apps/voice/backend/voice/voicePromptCompiler.js`
   - `/Users/arie/Projects/ai-dev-assistant/apps/voice/backend/routes/voicePromptChat.js`
   - `/Users/arie/Projects/adas_mcp_toolbox_builder/apps/frontend/src/components/voice/PromptEditor.jsx`
8. **Tier 2 uiActions reference implementation** (for the rare cases that genuinely need runtime LLM cache-once — but DON'T add new ones during the strip):
   - `apps/backend/storage/uiActionsGenerated.js`
   - `apps/backend/tools/impl/controlpanel/cp.uiActions_api/synthesizer.js`
   - `apps/backend/tools/impl/controlpanel/cp.uiActions_api/manifestFetcher.js`
9. **`/Users/arie/Projects/ateam_solutions/personal-adas/`** — reference truth (do not modify)

### Already shipped (do not redo)

- **Tier 1+2 uiActions auto-generation** (2026-05-05). Builder writes heuristic uiActions during deploy enrichment; Core synthesizes via LLM at runtime on side-table miss; cache-once. Skip sentinel pattern. The uiActionsDeploySync from Builder was removed per architectural correction (LLM stays in Core only).
- **F3 storage discipline** (GitHub source of truth, boot sync, write coupling, pre-deploy guard).
- **A1 stdio migration** (skills are stdio MCPs, ports gone).

### What the user does NOT do

The user (Arie) explicitly said:
- "I will NEVER create files."
- "I will NEVER create UI."

Their role: thumbs-up per phase, real-chat quality signal during Phase 10, production canary if mobile-pa misbehaves during the 6-week build.

Their non-role: writing files, writing JSON, writing code, opening editors.

If you find yourself describing actions that require the user to open a file, you've taken the wrong frame. The user describes intent in chat; the AI agent (you) executes via ateam-mcp.

### What "the AI agent" means in this plan

It means Claude with these tools available:
- `ateam-mcp` (deploy, patch, GitHub workflow, test, conversation)
- Direct file system access in the platform repos (Edit, Write, Read, Bash via Claude Code)
- Mongo access via the Builder's API
- Core LLM access via the existing `callAI` adapter

The AI agent does the building. The user provides direction.

### Common mistakes to avoid

- **Don't move LLM synthesis to Core.** Per the evening amendment, ALL strip-related synthesis is Builder-side at deploy time. The earlier same-day "you made a mess" feedback was about adding LLM synthesis to Core's runtime path WITHOUT a cache. The evening amendment then went further: even the cached version stays Builder-side for the strip phases. The existing uiActions Tier 2 in Core is grandfathered, but no new Core-side synthesis.
- **Don't add new Mongo collections to Core.** All new state during the strip lives in Builder's Mongo or in YAML defaults files in the repo. Core's storage stays as-is.
- **Don't keep the field-editor Builder UI alive.** It's retired. Don't propose new panels, don't maintain old ones. Chat is the only authoring surface.
- **Don't ask for per-phase approval.** Autonomous execution model — green light was given for the whole project on 2026-05-05 evening. Notify only on completion or failure.
- **Don't skip the regression suite.** It's the contract that protects mobile-pa.
- **Don't batch phases.** Each ships independently with its own tag pair.
- **Don't try to migrate mobile-pa.** Phase 10 builds a parallel solution (`personal-adas-stripped`). Original stays frozen.
- **Don't propose new UI surfaces for authoring.** Chat-only. Inspection rendered as markdown in chat replies.
- **Don't extend Tier 2 to new concerns.** Core-side runtime LLM cache-once is reserved for the existing uiActions case. New strip phases use either YAML-defaults+compiler (voice-prompt pattern) or Builder-side deploy-time synthesis.
- **Don't think the strip is about reducing what humans write.** The user (Arie) doesn't write files. The strip reduces what Claude (the AI agent) writes per session — eliminating rote schema/boilerplate so Claude focuses on persona prose + integration logic + custom UI behavior.

---

## Reference: where mobile-pa came from

mobile-pa was built over months by Claude via ateam-mcp, in chat sessions with Arie. The user provided vision and direction; Claude wrote every line of JSON, every connector, every UI plugin. The current state at `/Users/arie/Projects/ateam_solutions/personal-adas` is the canonical reference of "what good looks like."

Key numbers:
- 10 worker skills + 1 orchestrator (`pa-orchestrator`)
- 14 connectors (some shipped: gmail-mcp, telegram-mcp, etc.; some custom: personal-assistant-ui-mcp, nutrition-mcp, hue-mcp, tuya-mcp, home-assistant-mcp, google-home-mcp, browser-mcp, etc.)
- 12 UI plugins (memories-panel, pa-dashboard, schedule-panel, teach-panel, triggers-panel, home-layout-panel, whatsapp-setup, browser-view, auth-webview, nutrition-dashboard, connections-panel, nutrition-camera)
- 9 handoff triggers (orchestrator → each worker, English prose)
- 1 grant (`pa.verified_user`)
- 3 routing channels (voice/chat/api → orchestrator)
- ~22k chars of persona prose total
- ~70 hand-curated intents
- ~31 policy guardrails

This is the bar. The strip succeeds if a fresh chat session reproduces equivalent behavior in <50% of the original token budget.

---

## Open decisions / parking lot

Things noted but not yet committed:

- **Should `tool_classifications.json` be a separate file or embedded in skill-level config?** Lean separate (matches override-file pattern).
- **Should built-in `_orchestrator` skill be visible in the UI?** Lean yes (transparency), but with read-only marker.
- **What's the migration story for existing solutions if/when strip is fully proven?** Out of scope for this plan. Add deprecation warnings during deploy when explicit fields match defaults exactly.
- **Phase 6 fallback if auto-router quality is insufficient:** keep `routing_mode: "auto"` opt-in indefinitely; existing pa-orchestrator-style solutions stay manual; document the trade-off.

---

## Status log

Update this section after each phase.

| Date | Phase | Status | Tag pair | Notes |
|---|---|---|---|---|
| 2026-05-05 | — | Plan created, scheduled to start 2026-05-06 | — | After uiActions Tier 1+2 ship |
| | 0 | Not started | | |
| | 1 | Not started | | |
| | 2 | Not started | | |
| | 3 | Not started | | |
| | 4 | Not started | | |
| | 5 | Not started | | |
| | 6 | Not started | | |
| | 7 | Not started | | |
| | 8 | Not started | | |
| | 9 | Not started | | |
| | 10 | Not started | | |

---

## Authority of this doc

If this doc and CLAUDE.md global/project rules conflict on tactics: CLAUDE.md wins for tactics (deploy commands, tooling discipline). This doc wins for strategy (what to build, in what order, why).

If this doc and a future agent's "improvement" disagree: this doc is authoritative until explicitly amended by the user (Arie) and re-tagged. Do not silently mutate the plan; propose changes and wait for thumbs-up.

If the chat session that produced this doc is lost: this doc plus the listed reading order is sufficient to continue. The user (Arie) is the only person with override authority.
