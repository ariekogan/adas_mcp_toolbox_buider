# Master Status (2026-05-13, end-of-day)

**Owner:** Arie + Claude
**Previous snapshot:** [`STRIP_MASTER_STATUS_2026-05-12.md`](./STRIP_MASTER_STATUS_2026-05-12.md) — strip work complete, kept for history.
**Scope of this doc:** continuation. Strip is done; today's work covers Core runtime quality, tenant isolation, and the new-user multi-agent builder experience.

---

## 0) Headline

- **Strip status:** complete. 6/6 routing parity. Author surface ~5 fields/skill. No regressions.
- **Closed today (full day's work):**
  1. Tenant isolation in Core in-memory job store
  2. Planner Python-truncation fix (max_tokens 1200→4000 + prompt fix)
  3. Public MCP platform-connector doc corrected (10 connectors visible)
  4. Item C — capability matcher convergence (`handoff_when` indexed + divergence diagnostic)
  5. Trace migration to Mongo (`dbg/tbInfo/tbWarn/hlr_replan/planner_prompt+resp` → `execution_logs`; 115,954 disk files deleted, 3.1G freed)
  6. Item B — case-aware "unknown tool" diagnosis (Layer 1 runtime + Layer 2 deploy-time)
  7. Item A — cross-skill recursion guard verified by 15-test unit suite (was already implemented; now proven)
- **Next focus:** new-user multi-agent builder experience (blueprints, dry-run, semantic lint).

---

## 1) SHIPPED TODAY (2026-05-13, all on main, all live on mac1)

### A. Cross-tenant data leak in Core in-memory job store
**Repo:** `ai-dev-assistant`
**Commit:** `3b4061c6` — `fix(security): in-memory job store now ALS-tenant-scoped`
**File:** `apps/backend/store.js`

The global `jobs` Map had no `tenantId` field. `fetchRunningJob()` could return another tenant's job on tenant-switch. Patched: `setJob()` stamps `tenantId` from AsyncLocalStorage; `getJob(id)` blocks cross-tenant reads; `getAllJobs()` filters by ALS tenant. Used `getCurrentTenantOrNull()` to avoid CRITICAL logs outside HTTP context.

### B. Planner Python truncation → SyntaxError loop
**Repo:** `ai-dev-assistant`
**Commit:** `e00b518a` — `fix(planner): raise planner max_tokens baseline to 4000 + restore Python-retry guidance`
**Files:**
- `apps/backend/ai/realPlanner.js` — baseline `max_tokens` 1200 → 4000; bump-on-truncate still escalates to 8000
- `apps/backend/ai/prompts/worker-v2/addons/python-patterns.md` — added "When a Python script fails" section explicitly favoring direct retry over scratchpad detour
- `apps/backend/ai/prompts/worker-v2/cheat-sheet-v2.md` — softened the line that pushed planners away from retrying Python after a syntax error

**Observed failure pre-fix:** `job_3vjwpw0e` on `personal-adas-stripped`, "clean my emails" — iters 2 and 7 both truncated a 3,767-char `run_python_script` body mid-string, producing `SyntaxError: unterminated string literal`. The worker-v1 → worker-v2 prompt migration had over-rotated to scratchpad patterns, so the planner detoured through `sys.step` / `gmail.fetch` / `core.self_query` instead of fixing the script.

**Verified post-fix:** `job_y4nveb20` ran "clean my emails" end-to-end in 7 iters. **Zero `run_python_script` attempts.** Direct path: `auth → fetch → sys.step → gmail.cleanup × 3 → finalize`. 350 real Gmail operations completed.

### C. Public MCP platform-connector doc corrected
**Repo:** `ateam-mcp`
**Commits:**
- `cc85b57` (v0.3.44) — initial expansion (over-included solution-level connectors)
- `52e3f72` (v0.3.45) — correction per `ai-dev-assistant/connectors/` ground truth
- `75d5b46` (v0.3.46) — hide internal infrastructure (`handoff-controller-mcp`, `internal-comm-mcp`) from solution builders

**Final list visible in `ateam_bootstrap` → `platform_connectors.available` (10):**
`memory-mcp, docs-index-mcp, browser-mcp, gmail-mcp, whatsapp-mcp, telegram-mcp, mobile-device-mcp, travel-mcp, nutrition-mcp, cloud-docs`

Container `ai-dev-assistant-ateam-mcp-1` rebuilt with v0.3.46, local procs killed, verified live.

### D. Item C closed — capability matcher convergence
**Repo:** `ai-dev-assistant`
**Commits:** `6df9d5d6`, `5ed8be5a`
**Files:** `apps/backend/storage/capabilityProfile.js`, `apps/backend/storage/capabilityIndex.js`, `apps/backend/tools/impl/system/sys.askAnySkill.js`

The original framing of item C ("`sys.askAnySkill` ignores `target_skill` arg") suggested trusting LLM-supplied routing. We chose a generic structural fix instead: **align the matcher with the orchestrator's intent by feeding `handoff_when` into the per-skill LLM profile + Phase-1 fallback entries.** Hash key now includes `handoff_when` so cache invalidates on changes. Profile rebuilt for `mobile-pa`, `mobile-pa-test`, `personal-adas-stripped` — all three converge with the orchestrator's pick on "clean my emails."

Plus a divergence diagnostic in `sys.askAnySkill`: when the planner-stripped `target_skill` differs from the matcher's top pick, write a `routing_divergence` record to `execution_logs` (TTL 7d, queryable). After convergence, this should be rare; any hits are real data.

**The `_engine_synthetic` trust marker stays as-is** — only PLAT-04.1 sets it. We did NOT broaden trust on LLM-supplied routing.

### E. Trace migration to Mongo — 115,954 disk files eliminated
**Repo:** `ai-dev-assistant`
**Commits:** `a8aceb70`, `d4ad7e1f`, `a7402b3c`

The system had TWO parallel logging systems: Mongo-based (`execution_logs`, `llm_traces`, `insights`) and disk-based (`dbg() → buffer → JSONL`). The disk one was the most-popular (405 callsites across 44 files for `dbg()` alone), with no TTL, not queryable, and on production had 115,954 stale files totaling ~3GB.

Migrated to Mongo in three commits:
- `a8aceb70` — `utils/traceBuffer.js`: `tbFlush` now bulk-inserts to `execution_logs` instead of writing JSONL. Public API unchanged; 405 callsites auto-migrate.
- `d4ad7e1f` — `worker/hlr/hlrReplanV1.js`: `writeReplanLog` uses `appendLog` instead of disk.
- `a7402b3c` — `ai/realPlanner.js` + `controlpanel/cp.fe_api/methods/_jobLoader.js` + `getJobDetails.js`: `savePlannerArtifact` + CP readers (countJobIterations, loadIterationFromLogs) migrated to `execution_logs`.

**Result:** `/tenants` 4.2G → 1.1G (3.1G freed). Zero log files left under any `*/logs/` dir. All future traces are searchable in Mongo with 7d TTL.

### F. Item B closed — case-aware "unknown tool" diagnosis (two layers)
**Repos:** `ai-dev-assistant`, `adas_mcp_toolbox_builder`
**Commits:** `fdabcfe0` (runtime), `ed0c3d5` (deploy)

The old hint *"unknown tool: X. Use sys.handoffToSkill to route to the skill that has it"* was the salad-incident seed. It conflated LLM hallucination, transient connector outage, and cross-skill needs — and in sub-call context the hint led directly to a rejected handoff and a fallback `askAnySkill` bounce.

**Layer 1 — runtime** (`apps/backend/worker/planUtils.js`): new `diagnoseUnknownTool` helper distinguishes:
- **Case 2** (tool name IS in skill.tools[] but missing from runtime registry): hint says "declared but currently unavailable, finalize" → lands in RESOLUTION.
- **Case 1/3** (not declared): "Pick another tool from your list or finalize." No `sys.handoffToSkill` suggestion — the bad hint is gone.

Wildcards handled: `web.*` expanded; `mobile-device-mcp:*` treated as soft signal. Seatbelt contract preserved; all 10 existing tests pass.

**Layer 2 — deploy** (`apps/backend/src/services/exportDeploy.js` Phase 2c): the deploy fails loudly if (a) any `skill.tools[]` entry references a connector not in `skill.connectors[]`, or (b) `skill.connectors[]` non-empty but Phase 2b returned `no_tools_returned`. Bad configs never reach Core.

### G. Item A closed — recursion guard proven
**Repo:** `ai-dev-assistant`
**Commit:** `3dadf562`
**Files:** `apps/backend/tools/impl/system/sys.askAnySkill.js`, `apps/backend/tools/impl/system/tests/sys.askAnySkill.depthGuard.test.js`

Item A had guards in production (`MAX_DELEGATION_DEPTH = 3`, `MAX_SAME_SKILL = 3`) but no tests. The salad incident happened after the guards were added, raising the question: do they actually work?

Refactor: extracted the pure counting logic from `inspectChain()` into an exported `computeChainStats()` helper. Wrote 15 unit tests covering the salad pattern (A→B→A→B), completed-vs-running jobs, handoff vs askAnySkill prefix counting, edge cases. **All 15 pass.** Item A: working as designed, now provably so.

---

## 2) ARCHITECTURAL ITEMS — status update

Items A–H, end-of-day 2026-05-13. **A, B, and C are closed today.**

| # | Item | Status |
|---|---|---|
| A | Cross-skill recursion has no budget | **Closed** — already implemented (`MAX_DELEGATION_DEPTH=3`, `MAX_SAME_SKILL=3`), now proven via 15-test unit suite (`3dadf562`). |
| B | Workers re-delegate instead of failing fast | **Closed** — two-layer fix. Layer 1 (`fdabcfe0`): runtime case-aware validator (`diagnoseUnknownTool`) — declared-but-unbound tools land in RESOLUTION instead of triggering delegation. Layer 2 (`ed0c3d5`): deploy-time Phase 2c — `tools[]` entries referencing undeclared connectors / empty `tools[]` despite live connectors fail the deploy. |
| C | `sys.askAnySkill` ignores `target_skill` arg | **Closed** — instead of forcing trust on LLM-supplied routing, the matcher was upgraded so the orchestrator and the matcher converge by design. (a) `handoff_when` is now in the per-skill LLM profile (`6df9d5d6`) — capability index aligns with routing intent. (b) Divergence diagnostic added (`5ed8be5a`): when planner-stripped `target_skill` differs from matcher pick, both picks + scores logged to `execution_logs` for monitoring. The `_engine_synthetic` trust marker remains for PLAT-04.1 only. |
| D | Channel-driven style is per-skill | **Partially mitigated** — finalize gate enforces mobile-chat guardrails today. Still architecturally in wrong place. |
| E | Voice orchestrator placement | Still open (voice-backend). |
| F | `sys.findCapability` ranks by tool-description match | **Largely mitigated** by C-(a) above — the matcher now also indexes `handoff_when`. Remaining edges fall back to keyword scoring. |
| G | OAuth callback timeout at Cloudflare | Still open (infra). |
| H | worker-v2 prompt drift, no regression suite | Still open — patched in `e00b518a` but no harness. |

---

## 3) NEW-USER MULTI-AGENT BUILDER EXPERIENCE — proposed (none shipped)

The strip lowered the author surface from ~50 fields/skill to ~5. But a new user sitting with Claude (or any AI builder agent) still has to invent the skill shape from scratch. Five proposed improvements, ordered by leverage:

| # | Improvement | Pain Removed | Surface | Effort | Impact |
|---|---|---|---|---|---|
| 1 | **Solution blueprints** | Every new solution is greenfield; Claude reinvents shape each time | New MCP tool: `ateam_clone_blueprint(name)` + curated library (Personal Assistant, Customer Support, Email Triage, Travel Concierge) | M | ⭐⭐⭐⭐⭐ |
| 2 | **Semantic pre-deploy lint** | Schema-valid but broken solutions deploy and fail at runtime | New MCP tool: `ateam_validate_semantic(solution_id)` — checks intent↔tool coverage, handoff refs, persona↔guardrail consistency | M | ⭐⭐⭐⭐⭐ |
| 3 | **Conversation dry-run** | Claude can't test design without deploying + burning real connector calls | New MCP tool: `ateam_simulate(solution_id, message)` — returns routing + tool calls + draft response, no Core/connector hits | L | ⭐⭐⭐⭐⭐ |
| 4 | **Visual multi-agent topology** | `handoff_when` is free-form text scattered across N skill files | Builder UI: skills as nodes, handoffs as edges, editable graph → saves to JSON | L | ⭐⭐⭐⭐ |
| 5 | **"Why did the agent do that?" explainer** | Debugging means reading log JSON; new users can't decode it | New MCP tool: `ateam_explain_run(job_id)` — plain English trace + fix proposals | S | ⭐⭐⭐⭐ |

**Recommended sequence:** #1 + #3 first (blueprint clone + dry-run lets a new user reach a working agent in minutes without deploys). #2 + #5 next (catch and explain failures). #4 last (visual layer is icing).

---

## 4) NEXT WORK — concrete, in priority order

Items A, B, C closed today. Remaining ordered list:

1. **`ateam_clone_blueprint`** (Improvement #1) — single biggest unlock for new users.
2. **`ateam_simulate`** (Improvement #3) — pairs with blueprints; replaces deploy-test-fix loops with seconds-fast feedback.
3. **`ateam_validate_semantic`** (Improvement #2) — catches the class of bugs that today's Python detour came from (HLP step with no tool).
4. **Prompt regression suite** (item H) — protects against the worker-v1 → v2 style regression that bit us today.
5. **OAuth callback Cloudflare 504** (item G) — Gmail OAuth completes but token never reaches Core; user-facing pain.
6. **Voice orchestrator auto-placement** (item E) — eliminates the one manual step on fresh tenant onboarding.
7. **Channel-driven style at finalize gate** (item D) — moves guardrails to the right layer.
8. **Document the migration playbook** (carried over from 05-12) — strip → tenant migration guide using `personal-adas-stripped` as canonical example.

---

## 5) COMMITS INDEX — 2026-05-13

### `ai-dev-assistant` (Core)

**Morning — security + planner:**
- `3b4061c6` — `fix(security): in-memory job store now ALS-tenant-scoped`
- `e00b518a` — `fix(planner): raise planner max_tokens baseline to 4000 + restore Python-retry guidance`

**Item C — capability matcher convergence:**
- `6df9d5d6` — `fix(routing): feed handoff_when into capability matcher + add divergence diagnostic`
- `5ed8be5a` — `fix(routing): write routing_divergence to execution_logs (Mongo), not JSONL`

**Trace migration — disk → Mongo (eliminated 115,954 disk files):**
- `a8aceb70` — `refactor(traces): migrate dbg/tbInfo/tbWarn from disk JSONL to execution_logs (Mongo)`
- `d4ad7e1f` — `refactor(traces): migrate hlr_replan disk writer to execution_logs (Mongo)`
- `a7402b3c` — `refactor(traces): migrate planner_prompt/_resp from disk .txt to execution_logs`

**Item B — case-aware tool-not-found:**
- `fdabcfe0` — `fix(routing): case-aware "unknown tool" diagnosis in plan validator` (Layer 1, runtime)

**Item A — recursion guard proven:**
- `3dadf562` — `test(askAnySkill): unit tests for cross-skill recursion guard (item A)` (refactor + 15 unit tests)

### `ateam-mcp` (public docs)
- `cc85b57` (v0.3.44) — initial platform_connectors expansion *(superseded)*
- `52e3f72` (v0.3.45) — corrected list per `ai-dev-assistant/connectors/`
- `75d5b46` (v0.3.46) — hide `handoff-controller-mcp` and `internal-comm-mcp` from builders

### `adas_mcp_toolbox_builder` (Builder)
- `ed0c3d5` — `fix(deploy): Phase 2c — tool resolution validation at deploy time` (Item B Layer 2)
- (this doc)

---

## 6) THE PINNED PRINCIPLE (carried forward)

> Plugins are owned by the MCPs that serve them — discovered at deploy time via `ui.listPlugins`.
> Triggers are written by the LLM at deploy time from each skill's persona + tools + connectors.
> Tools are imported at deploy time from each connector's live inventory; refreshed on every deploy.
> Orchestrator is generated at deploy time from worker `handoff_when` triggers when `routing_mode: "auto"`.
>
> Author writes: persona, connector picks, policy guardrails, connector integration code, UI plugin source.
> Everything else: platform-generated, MCP-introspected, or LLM-synthesized.

**Loud failures.** Every phase failure aborts the deploy. The no-fallback discipline that found 5 bugs on 05-12 continues to apply on 05-13 — today's Python truncation, tenant leak, and platform-connector mismatch were all surfaced by either a user-visible symptom or a code audit, not by silent retries.

---

## 7) STATE SUMMARY (end of 2026-05-13)

- **Items A, B, C closed.** Salad-class loop now structurally impossible (Layer 1+2 validation; recursion guard proven).
- **All logs in Mongo.** 115,954 disk trace files deleted; ~3.1G freed on `/tenants`. Nothing in the backend writes log/trace data to disk anymore.
- **`personal-adas-stripped`** — fully strip-built, parity at 6/6, "clean my emails" verified end-to-end.
- **`mobile-pa`** — reference baseline, untouched.
- **ateam-mcp** — v0.3.46 published, Docker container rebuilt, 10 platform connectors visible in `ateam_bootstrap`.
- **Core backend** — running latest `main`, healthy.
