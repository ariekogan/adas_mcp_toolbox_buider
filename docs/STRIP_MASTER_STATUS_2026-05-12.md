# Schema Strip — Master Status (2026-05-12, end-of-day)

**Owner:** Arie + Claude
**Authoritative plan:** [`STRIP_PLAN_2026-05-05.md`](./STRIP_PLAN_2026-05-05.md)
**Reference tenant:** `mobile-pa` (`personal-adas`) — production, untouched.
**Strip target tenant:** `personal-adas-stripped` — fully strip-built, verified at-parity.

This is the canonical state. Read this to pick up the work.

---

## 0) Headline

The strip is **operational end-to-end** on `personal-adas-stripped`. Author surface is ~5 fields per skill (id, name, role.persona, connectors, optional handoff_when + policy.guardrails). Everything else is platform-generated at deploy time. 68% JSON reduction measured.

E2E parity (6 prompts × 2 tenants) is at **6/6 same-skill routing** after the Phase 2b stale-tools fix. Public MCP guidance updated to reflect the new minimal authoring model.

Remaining gaps are all **architectural Core-side items** (cross-skill recursion budget, channel-driven style, askAnySkill target_skill arg). Documented in §3.

---

## 1) SHIPPED (live on mac1, verified)

### Strip phases — Builder-side at deploy time
- **Phase 1** — Style inheritance (solution.style → skill personas)
- **Phase 2** — Tool security classification (destructive/read/write auto-classified)
- **Phase 2b** — Auto-import tool bridges from connector `/api/connectors/:id/tools` (per-tool REPLACE, refreshes on every deploy)
- **Phase 3** — Intent synthesis (LLM, source-hash cached)
- **Phase 4** — Engine config preset resolution
- **Phase 5** — UI plugin discovery via MCP `ui.listPlugins` + `ui.getPlugin` per connector
- **Phase 6** — Built-in orchestrator generation (`routing_mode: "auto"` opt-in)
- **Phase 6b** — LLM-synthesize `handoff_when` from persona + tools + connectors
- **Phase 7** — Plugin auto-scaffolds
- **Phase 8** — Self-healing validator
- **Phase 9** — Strip dialect / cross-tenant safety

### Routing quality (E2E parity test v3, 2026-05-12)
6 prompts × 2 tenants, all routing decisions match mobile-pa:
| Test | mobile-pa | stripped | Match |
|---|---|---|---|
| Memory store | memory-keeper | memory-keeper | ✅ |
| Log salad | mycoach → 150 cal | mycoach → 93 cal | ✅ |
| Smart home list | home-control × 15 devices | home-control × 15 devices | ✅ |
| Tokyo flights | travel-agent | travel-agent (better — inferred TLV) | ✅ |
| Log espresso | mycoach → 30ml | mycoach → 30ml | ✅ |
| What do you know | memory-keeper (7 iter) | memory-keeper (2 iter, 4× faster) | ✅ |

### Deploy pipeline hardening
- **No silent fallbacks:** all 18 `try/catch { log.warn 'non-fatal' }` patterns removed from the deploy pipeline. Phase failures abort the deploy with a real error. (Audit: `grep -rE "non-fatal" apps/backend/src/` → 0 hits.)
- **Marker-based orphan cleanup:** `findStaleOrchestratorIds()` matches `_auto_generated:true AND role_type:"orchestrator" AND id !== ORCH_ID`. Hardcoded delete lists eliminated. Author-written skills are NEVER touched regardless of id.
- **Phase 2b per-tool REPLACE:** previously a binary "tools[] non-empty? skip" → caused mycoach to permanently lose nutrition tools after one transient connector outage → caused the cross-skill recursion incident. Now refreshes auto-imported tools on every deploy; preserves only `_auto_imported !== true` author tools. Throws loudly if a connector that previously contributed tools regresses to 0.
- **`ateam_redeploy` runs strip meta-phases:** `routes/solutions.js` `/redeploy` now runs Phase 5 + Phase 6 before the per-skill deploy loop.

### Public MCP guidance aligned with strip
- `/spec/skill` — `auto_expand.minimal_required: ['id', 'name', 'role.persona', 'connectors']`. Full auto_generated list (tools/intents/scenarios/engine/security/ui_plugins/handoff_when). Includes a 12-line `typical_minimal_skill` example.
- `/spec/solution` — new `auto_expand` block describing Phase 6 orchestrator generation + Phase 5 plugin introspection + Phase 1 style cascade. Includes `typical_minimal_solution`.
- `/spec/examples/skill` + `/solution` — verbose reference examples now carry `_strip_summary` headers pointing to the minimal form.
- `ateam_bootstrap` — new `minimal_authoring` block lists what to hand-write vs what's platform-generated.
- ateam-mcp **v0.3.43** published, Docker `ateam-mcp` rebuilt, local processes killed.

### Bootstrap of `personal-adas-stripped` tenant
- Owner-actor record (`usr_arie_admin_0001` as owner)
- 10 worker skills + auto-orchestrator deployed
- Voice manifest recompiled with `auto-orchestrator` at PRIMARY position 1 (manual `voice_skill_selections` insert; structural fix is voice-backend's responsibility)

---

## 2) FIVE BUGS FOUND AND FIXED TODAY (the no-fallbacks rule earned its keep)

| # | Bug | Root cause | Where the no-fallbacks rule mattered |
|---|---|---|---|
| 1 | Hardcoded `LEGACY_ORCH_IDS` delete list | Would silently delete author-written skills named "orchestrator" | Surfaced when I noticed I was hardcoding solution-specific data, replaced with marker-based detection |
| 2 | Phase 5 FS-scan over-discovered + missed MCP fields | Plugin manifests were thin (no render.iframeUrl, no surface) | "Not found" iframe error → traced → MCP ui.getPlugin call added |
| 3 | `sys.askAnySkill` drift after handoff failure | Orchestrator persona didn't say "reuse same target skill" | E2E parity test caught it on "I'm feeling tired" prompt |
| 4 | Phase 2b stale REPLACE → mycoach lost nutrition tools | One transient nutrition-mcp outage → tools[] partial → never refreshed | Cross-skill recursion incident. Was hidden by `log.warn non-fatal` for who knows how long. |
| 5 | MCP-error JSON response broke Phase 5 | Connector returned `"MCP error -32601..."` as text, code tried JSON.parse | First successful Phase 5 introspection — error surfaced because no-fallback meant no silent skip |

**Pattern across all five:** each was hidden by either a silent try/catch wrapper, a hardcoded shortcut, or a coarse REPLACE rule. Each was found by either (a) removing the silent wrapper, or (b) the user catching a behavioral symptom in the UI. The no-fallback enforcement is the discipline forcing function.

---

## 3) ARCHITECTURAL ITEMS — known, named, traced (NOT strip-side; Core/runtime work)

### A. Cross-skill recursion has no budget
**The salad incident:** auto-orchestrator → askAnySkill → mycoach → askAnySkill → life-manager → askAnySkill → mycoach → … hung ~30 min before HLR critic caught it.

**Why every per-skill guard didn't trip:**
| Guard | Per | Catches | Misses |
|---|---|---|---|
| `maxIters: 10-16` | skill | iter loop in one skill | resets in each spawned sub-job |
| `askAnySkill.timeout_seconds: 300` | call | one delegation | each spawn = fresh timer |
| `identical_call_threshold: 2` | skill | same tool + same args | different skills calling same tool |
| HLR critic | skill | local stagnation | the sub-job it spawned |

Total runaway budget = **N_skills × 300s**. A 3-skill loop = ~30 min before anything trips.

**Fix path (Core-side):** depth-cap on nested `sys.askAnySkill` calls (after depth=2 or 3, force finalize). Plus same-intent loop detection across spawn boundaries.

### B. Workers re-delegate instead of failing fast
mycoach's planner observed nutrition.lookupMultiple missing and tried to delegate to find it — instead of throwing a deploy-time config error. The orchestrator already made the routing decision; if the chosen worker can't deliver, that's a config bug to surface, not a problem to route around.

**Fix path (Core-side):** skill planner prompt change — "if a needed tool is missing from your tools[], surface as error; do not delegate."

### C. `sys.askAnySkill` ignores `target_skill` arg
When the orchestrator passes `target_skill: "mycoach"`, the runtime re-runs capability matching and may pick a different skill. Caused Test 5 (espresso) to misroute pre-Phase-2b-fix.

**Fix path (Core-side):** honor `target_skill` arg when set; skip capability re-evaluation.

### D. Channel-driven style is per-skill (wrong layer)
MOBILE CHAT guardrails ("1-2 sentences max, casual tone") live in `policy.guardrails.always[]` on every skill. Should be per-channel at the finalization gate: voice → speech-friendly, mobile-chat → tight, web → markdown OK.

**Fix path (Core-side):** finalization gate reads inbound channel and applies style profile automatically.

### E. Voice agent orchestrator placement
The voice manifest compiler defaults to skill creation order when no explicit `voice_skill_selections` exists. Places `life-manager` first instead of `auto-orchestrator`. Voice calls then bypass the orchestrator.

**Fix path (voice-backend):** auto-detect `role_type: "orchestrator"` or `_auto_generated: true` and place at index 0 when no user selection exists.

### F. `sys.findCapability` ranks by tool-description match
Can override the worker's `handoff_when` trigger. "Clean my emails" routes by tool description score, not by routing-rule preference. Same behavior in mobile-pa — not a strip bug.

**Fix path (Core-side, low-priority):** weighting that prefers worker `handoff_when` over raw tool-description match when there's a tie.

### G. OAuth callback timeout at Cloudflare
Gmail OAuth completes successfully BUT the callback to `app.ateam-ai.com/api/integrations/callback` times out at Cloudflare 504. User completes consent in Google, popup closes, tenant never receives the token. Infra-level, not strip.

**Fix path (Core/infra):** investigate why Core takes >100s to process the callback. Either speed it up or set a higher Cloudflare timeout.

---

## 4) NEXT WORK — concrete, in priority order

### 1. End-to-end with real connectors
The parity test set used mocked smart-home and stub responses. The next-level test: actually send a Gmail (Gmail OAuth works on the tenant once G is resolved), actually fetch real Apple Health data (needs device-bridge sync), actually book a flight. These prove the strip in production conditions, not just demo conditions.

### 2. Add a cross-skill recursion budget (item A above)
Highest-value Core-side fix. Eliminates a whole class of incidents like today's salad hang.

### 3. Channel-driven style (item D above)
The only thing that makes stripped responses visibly different from mobile-pa is the lack of style enforcement. Fix this in Core's finalization gate and the strip's response quality matches at-style.

### 4. Voice-backend auto-detect orchestrator (item E above)
Small voice-service change; eliminates the one manual config step the strip requires on a fresh tenant.

### 5. Document the migration playbook
Given that ateam-mcp v0.3.43 + spec docs are now strip-aware, write a 1-page "migrating from verbose to stripped" guide for any tenant that still has the old schema. Should reference `personal-adas-stripped` as the canonical example.

---

## 5) COMMITS INDEX

### Builder repo (`adas_mcp_toolbox_builder`, origin/main)

**Phase work:**
- `fd1631e` — Phase 2b initial: auto-import tool bridges
- `1d8e3fe`, `a2cf4b9`, `9931db7` — Phase 6b: LLM handoff_when synthesis (persona-only → +tools → round-robin + connectors)
- `01084f3` — Phase 5: also call ui.getPlugin per plugin for full manifest

**Today's fixes (in order):**
- `5e18bbf` — Phase 10 validation report
- `d816952`, `9021931`, `7389332` — Orchestrator persona refinements
- `a0a0221` — Bug A + Phase 5 rewrite + redeploy meta-phases + orphan cleanup (legacy ORCH_IDS approach, since superseded)
- `aa8cd5c` — **NO FALLBACKS** — propagate errors + marker-based orphan cleanup (replaces hardcoded LEGACY_ORCH_IDS)
- `a316d1c` — Phase 5: recognize MCP-error text responses
- `9662a6d` — Phase 5: treat ok:false connector responses as legit skip
- `37bd432` — Phase 5: canonicalize plugin id to `mcp:<connector>:<slug>`
- `b95e144` — Phase 2b: per-tool REPLACE + refresh auto-imported + no fallback (the recursion fix)
- `5e6e55b` — **Strip the remaining 18 silent fallbacks from the deploy pipeline**
- `7948c76` — Public spec + examples updated to strip-aware authoring

**Docs:**
- `e1acaf9`, `1cdb34c`, this commit — Master status iterations
- `ab80ee8` — E2E parity report v1
- `a4a36a7` — E2E parity report v2

### ateam-mcp repo

- `2a07c08`, `8e71be0` (v0.3.43) — `ateam_bootstrap` minimal_authoring block

---

## 6) THE PINNED PRINCIPLE

> Plugins are owned by the MCPs that serve them — discovered at deploy time via `ui.listPlugins`.
> Triggers are written by the LLM at deploy time from each skill's persona + tools + connectors.
> Tools are imported at deploy time from each connector's live inventory; refreshed on every deploy.
> Orchestrator is generated at deploy time from worker `handoff_when` triggers when `routing_mode: "auto"`.
>
> Author writes: persona, connector picks, policy guardrails, connector integration code, UI plugin source.
> Everything else: platform-generated, MCP-introspected, or LLM-synthesized.

If any phase contradicts this — fix the phase, don't carve solution-specific exceptions.

Deploys must be **loud**. Every phase failure must abort the deploy with a real error. Silent fallbacks turn a 30-second bug surface into a 30-minute runtime hunt. The discipline that found today's 5 bugs.

---

## 7) Files / source layout

### New in this work
- `apps/backend/src/services/connectorTools.js` — Phase 2b
- `apps/backend/src/services/builtinOrchestrator.js` — Phase 6 + 6b
- `apps/backend/src/services/pluginDiscovery.js` — Phase 5 (MCP introspection)
- `apps/backend/src/services/styleInheritance.js` — Phase 1
- `apps/backend/src/services/toolSecurityClassifier.js` — Phase 2
- `apps/backend/src/services/intentSynthesizer.js` — Phase 3
- `apps/backend/src/services/engineCompiler.js` — Phase 4
- `apps/backend/src/services/uiActionsAutoDefaults.js`

### Modified
- `apps/backend/src/services/exportDeploy.js` — orchestrates all phases per skill, NO try/catch wrappers
- `apps/backend/src/routes/deploy.js` — bulk deploy entry, runs meta-phases first, NO try/catch wrappers
- `apps/backend/src/routes/solutions.js` — bulk redeploy now runs strip meta-phases
- `apps/backend/src/routes/exportRuntime.js` + `apps/backend/src/routes/import.js` — fallback wrappers removed
- `packages/skill-validator/src/routes/spec.js` — strip-aware `/spec/skill` + `/spec/solution`
- `packages/skill-validator/src/routes/examples.js` — `_strip_summary` headers
- `/Users/arie/Projects/ateam-mcp/src/tools.js` — `minimal_authoring` block in `ateam_bootstrap`

### Untouched
- ADAS Core (`ai-dev-assistant`) — by design.

### Tenants
- `mobile-pa` — reference, untouched
- `mobile-pa-test` — explicit-field regression clone
- `personal-adas-stripped` — fully strip-built, the migration target
