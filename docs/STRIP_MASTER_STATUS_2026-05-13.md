# Master Status (2026-05-13, end-of-day)

**Owner:** Arie + Claude
**Previous snapshot:** [`STRIP_MASTER_STATUS_2026-05-12.md`](./STRIP_MASTER_STATUS_2026-05-12.md) — strip work complete, kept for history.
**Scope of this doc:** continuation. Strip is done; today's work covers Core runtime quality, tenant isolation, and the new-user multi-agent builder experience.

---

## 0) Headline

- **Strip status:** complete. 6/6 routing parity. Author surface ~5 fields/skill. No regressions.
- **Today shipped 3 fixes:** tenant isolation in Core in-memory job store, planner Python-truncation fix, public MCP platform-connector doc corrected to match `ai-dev-assistant/connectors/` ground truth.
- **Next focus:** new-user multi-agent builder experience (5 improvements proposed, none shipped yet).

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

---

## 2) ARCHITECTURAL ITEMS — status update

Items A–G from the 05-12 plan, with updated status:

| # | Item | Status |
|---|---|---|
| A | Cross-skill recursion has no budget | Still open (Core-side) |
| B | Workers re-delegate instead of failing fast | Still open (Core-side prompt change) |
| C | `sys.askAnySkill` ignores `target_skill` arg | Still open (Core-side) |
| D | Channel-driven style is per-skill | **Partially mitigated** — finalize gate enforces mobile-chat guardrails today; rewrites work. Still architecturally in wrong place. |
| E | Voice orchestrator placement | Still open (voice-backend) |
| F | `sys.findCapability` ranks by tool-description match | Still open (Core-side, low-priority) |
| G | OAuth callback timeout at Cloudflare | Still open (infra) |

**New item H (uncovered today):** worker-v2 prompts over-rotated to scratchpad/sys.step at the expense of the simpler "fix Python and retry" path. Patched via prompt additions in commit `e00b518a`, but the broader pattern (prompts drift between v1 and v2 with no diff harness) is unaddressed. **Fix path:** add a prompt regression suite — record golden iteration traces, alert when a prompt change shifts the iteration shape.

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

1. **Cross-skill recursion budget** (item A) — highest-value Core fix; eliminates a class of incidents.
2. **`ateam_clone_blueprint`** (Improvement #1) — single biggest unlock for new users.
3. **`ateam_simulate`** (Improvement #3) — pairs with blueprints; replaces deploy-test-fix loops with seconds-fast feedback.
4. **`ateam_validate_semantic`** (Improvement #2) — catches the class of bugs that today's Python detour came from (HLP step with no tool).
5. **Prompt regression suite** (new item H) — protects against the worker-v1 → v2 style regression that bit us today.
6. **Channel-driven style at finalize gate** (item D) — moves guardrails to the right layer.
7. **Document the migration playbook** (carried over from 05-12) — strip → tenant migration guide using `personal-adas-stripped` as canonical example.

---

## 5) COMMITS INDEX — 2026-05-13

### `ai-dev-assistant`
- `3b4061c6` — `fix(security): in-memory job store now ALS-tenant-scoped`
- `e00b518a` — `fix(planner): raise planner max_tokens baseline to 4000 + restore Python-retry guidance`

### `ateam-mcp`
- `cc85b57` (v0.3.44) — initial platform_connectors expansion *(superseded)*
- `52e3f72` (v0.3.45) — corrected list per `ai-dev-assistant/connectors/`
- `75d5b46` (v0.3.46) — hide `handoff-controller-mcp` and `internal-comm-mcp` from builders

### `adas_mcp_toolbox_builder`
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

## 7) STATE SUMMARY

- **`personal-adas-stripped`** — fully strip-built, parity at 6/6, "clean my emails" verified end-to-end on 05-13.
- **`mobile-pa`** — reference baseline, untouched.
- **ateam-mcp** — v0.3.46 published, Docker container rebuilt.
- **Core backend** — `apps/backend/store.js` + `apps/backend/ai/realPlanner.js` + worker-v2 prompts updated; container restarted.
