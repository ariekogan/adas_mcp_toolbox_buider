# Schema Strip — Master Status (2026-05-12, updated end-of-day)

**End-of-day update (commit `a0a0221`):** four follow-up fixes landed and were verified live on `personal-adas-stripped`. See [§1.5 below](#15--end-of-day-fixes-commit-a0a0221) for what shipped and how it was validated.

**Owner:** Arie + Claude
**Authoritative plan:** [`STRIP_PLAN_2026-05-05.md`](./STRIP_PLAN_2026-05-05.md)
**Reference truth:** `mobile-pa` solution (`personal-adas`) — untouched.
**Test tenant:** `personal-adas-stripped` — owner-actor bootstrapped for Arie (Owner role).

This doc tracks current state: what's shipped, what's broken, what's left.
Updated whenever a phase lands or a real-world test surfaces a gap.

---

## 1) DONE — Shipped to mac1, committed, validated

### Strip Phases 0–9 (60% JSON reduction)
- Style inheritance (Phase 1)
- Tool security classification (Phase 2)
- Intent synthesis (Phase 3)
- Engine resolution (Phase 4)
- Plugin auto-discovery from FS (Phase 5) — see ⚠️ in §2
- Built-in orchestrator generation (Phase 6) — `routing_mode: "auto"`
- Plugin auto-scaffolds (Phase 7)
- Self-healing validator (Phase 8)
- Strip dialect / cross-tenant safety (Phase 9)

### Phase 2b — Auto-import connector tool bridges (additional 8% = 68% total reduction)
- `apps/backend/src/services/connectorTools.js`
- At deploy time, fetches each connector's live `GET /api/connectors/:id/tools` and injects into `skill.tools[]`.
- Per-skill validated counts: memory-keeper=22, home-control=73, daily-intel=89, etc.
- E2E chat test passed: `"remember my anniversary is May 15"` → memory-keeper → `memory.store` → 18s ✓

### Phase 6b — LLM-synthesize `handoff_when` from skill content
**Why:** the first Gap-3 fix copied mobile-pa's hand-curated triggers — solution-specific. User correctly rejected this. Replaced with general LLM synthesis.

- `synthesizeHandoffWhenForSkill()` in `builtinOrchestrator.js` — LLM-generates one-sentence trigger from `persona + description + tools[] + connectors[]`.
- Source-hash cached on `_auto_handoff_hash` + `_auto_handoff_when` so no-op redeploys skip the LLM.
- Tool sampling is **round-robin by connector prefix** to avoid single-connector skills (life-manager: 115 tools) starving lazy connectors.
- REPLACE wins: any explicit `handoff_when` the author writes is preserved.
- `generateOrchestratorIfNeeded()` is now async; runs synthesis before persona assembly.
- Validated on `personal-adas-stripped`: 10/10 synthesized, 0 failures, routing tests pass for memory/home-control/mycoach.

**Commits:** `1d8e3fe`, `a2cf4b9`, `9931db7`

### Tenant bootstrap fixes (one-time, on `personal-adas-stripped`)
- Owner-actor record cloned from mobile-pa shape (`actorType: user`, `roles: [admin, user]`, `displayName`, `identities[]`) so the Actors panel renders.
- `usr_arie_admin_0001` added as `owner` of `personal-adas-stripped` in `adas_system.users.tenants[]`.
- 13 UI plugins patched into `solutions._id="current"` in Core Mongo + Builder FS (via FS scan — see ⚠️).
- Orphan `orchestrator` skill (left over from `ORCH_ID` renames) deleted from Mongo + FS.

---

## 1.5) END-OF-DAY FIXES (commit `a0a0221`)

Four bugs from §2 landed, deployed to mac1, and were verified live.

### ✅ Bug A — `sys.askAnySkill` drift after handoff failure
**Was:** "I'm feeling tired today" → handoff(mycoach) failed → askAnySkill drifted to **home-control**.
**Fix:** persona rule 4 + new guardrails.always entry — "If handoffToSkill(X) fails, askAnySkill MUST target the SAME X."
**Verified 2026-05-12 18:24:** same prompt → handoff(mycoach) fails → askAnySkill(**mycoach**) succeeds → finalize. 118s, 3 iter.

### ✅ Phase 5 — MCP introspection replaces FS-scan
**Was:** `pluginDiscovery.js` walked `mcp-store/*/plugins/` folders, over-discovered + missed MCP-internal fields.
**Fix:** new `discoverPluginsViaIntrospection(solution, skills)` iterates `skill.connectors[]`, calls Core's `POST /api/connectors/<id>/call` with tool `ui.listPlugins`, dedups by plugin id. MCPs are the source of truth.
**Validated end-to-end:** TBD by next deploy (the in-place 13-plugin hack from earlier is still in solution.ui_plugins; once it's cleared the new path will re-discover canonically).

### ✅ `ateam_redeploy` strip meta-phases
**Was:** bulk-redeploy iterated `solution.skills[]` only; Phase 5 + Phase 6 never ran.
**Fix:** `routes/solutions.js` `/redeploy` handler now runs Phase 5 + Phase 6 before the per-skill deploy loop; persists results via stores.
**Verified:** end-of-day redeploy logged `[BulkRedeploy] Phase 6 orchestrator regen: persona 4890 chars; handoff_when synthesis: 0 new, 0 cached, 10 skipped, 0 failed`.

### ✅ Orphan-cleanup on skill rename
**Was:** when `ORCH_ID` changed (e.g. `orchestrator` → `auto-orchestrator`), old records lingered in Mongo + FS. User caught it as "I see 2 orchestrators".
**Fix:** `LEGACY_ORCH_IDS = ["_orchestrator", "orchestrator"]` exported from builtinOrchestrator. `generateOrchestratorIfNeeded` returns `legacy_ids_to_drop[]`; both deploy paths call `adasCore.deleteSkill` + `skillsStore.remove` on each. Idempotent.
**Verified:** structurally — next rename will auto-clean.

---

## 2) NEEDS FIX — known wrong, blocking real e2e validation

### ✅ ~~Phase 5 is wrong (FS-scan, not MCP-introspection)~~ — FIXED in `a0a0221`, see §1.5
**Current behavior:** `pluginDiscovery.js` walks `mcp-store/<connector>/plugins/` and `ui-dist/` folders, infers manifest from filenames.

**Why it's wrong:**
1. **Wrong source of truth.** Plugins live in the MCP servers — they expose `ui.listPlugins` (per CLAUDE.md global rule: `ui_capable: true` connectors must implement `ui.listPlugins`). FS scan guesses; MCP knows.
2. **Over-discovers.** Same plugin source file lives in multiple connector folders → `mcp:memory-mcp:memories-panel` AND `mcp:personal-assistant-ui-mcp:memories-panel`. Mobile-pa's hand-curated list picks one canonical connector.
3. **Misses MCP-only fields.** `uiActions`, `surface.placement`, exact `version` — only the running MCP knows these.

**Why runtime `cp.listContextPlugins` doesn't fully save us:** Core deliberately skips lazy connectors at startup (correct — spawning all 16 connectors just to list plugins defeats lazy-spawn). Live runtime only returns plugins from the ~3 already-spawned connectors.

**Right fix:** at Builder **deploy time**, force-spawn each `ui_capable` connector once, call `ui.listPlugins`, write into `solution.ui_plugins[]`, shut it down. MCP stays source of truth, runtime stays lazy-spawn-friendly, author writes zero plugin boilerplate.

**Current state on `personal-adas-stripped`:** 13 plugins visible (from FS-scan hack). Compared to mobile-pa's curated 14: missing `connections-panel` + `auth-webview`; extras `login-webview`, `home-setup-panel`. **Cosmetic but not canonical.**

### ✅ ~~`ateam_redeploy` doesn't run strip phases~~ — FIXED in `a0a0221`, see §1.5
Per-skill MCP-server regeneration only. **Skips:**
- Phase 5 (plugin discovery)
- Phase 6 (orchestrator generation + handoff_when synthesis)
- Phase 6b (LLM trigger refresh)

Full strip pipeline only runs in `POST /api/deploy/solution` (initial bulk deploy). Net effect: tenants iterated only via `ateam_redeploy` silently drift from the strip's intended output.

### ✅ ~~Orphan-skill cleanup on rename~~ — FIXED in `a0a0221`, see §1.5
When `ORCH_ID` constant changed (`_orchestrator` → `orchestrator` → `auto-orchestrator`), each rename deployed a new skill but didn't delete the previous one. Discovered by user in the topology view ("I see 2 orchestrators").

**Today's manual fix:** Mongo `deleteOne` + FS `rm -rf`. **Real fix:** deploy pipeline should track previous `_id` per skill and drop the old record on rename.

### ⚠️ `sys.findCapability` ranks by tool-description match, can override handoff_when
**Symptom:** `"clean my emails"` routes to `messaging-agent` (gmail.archive description match 442.7) instead of `life-manager`, even when life-manager's synthesized `handoff_when` explicitly mentions "email management ... clean up inbox".

**Mobile-pa behaves identically** — same query, same routing, same `findCapability`-driven decision. So this is not a Phase 6b regression; it's a pre-existing Core-side ranking issue that exists in both tenants.

**Not in strip scope.** Documented here so we don't chase it as a strip bug. If we want better disambiguation, the fix lives in `sys.findCapability`'s scorer or the orchestrator's persona prompt ("PREFER your routing table when it conflicts with capability hints").

### ⚠️ `no_channel_context` fallback UX divergence
When `sys.handoffToSkill` fails due to no channel (the common test-harness path), both tenants fall back to `sys.askAnySkill` then `sys.askUser`. **Mobile-pa's** fallback hits `platform.auth.status(gmail)` → "Gmail not connected, please reconnect" (clean). **Stripped's** fallback asks a verbose multi-question clarification.

Difference is in the auto-generated orchestrator persona vs mobile-pa's hand-tuned pa-orchestrator. Not a routing-quality issue; a prompt-tuning issue.

### ✅ ~~`sys.askAnySkill` fallback re-routes (Bug A)~~ — FIXED in `a0a0221`, see §1.5

---

## OUT OF STRIP SCOPE (architectural, leave for separate Core work)

### Channel-driven response style (was "Bug B" in E2E parity test)
Per-skill MOBILE CHAT guardrails in `policy.guardrails.always[]` are the wrong abstraction. Channel TYPE (`voice` / `mobile-chat` / `web` / `api`) should drive the finalization-gate's style rules automatically. Authors shouldn't write style guardrails per skill — the platform knows the channel.

This is a Core-side change. Schema strip is the wrong layer to fix it. **Stripped responses will be verbose vs mobile-pa's 1-sentence replies** until channel-driven style is implemented.

---

## 3) LEFT TO DO — to declare the migration complete

### A. Validate the new Phase 5 introspection live
Plugin list currently in `personal-adas-stripped` is the leftover from the FS-scan hack (13 plugins). Clear `solution.ui_plugins[]` and trigger a fresh bulk-redeploy → the new MCP-introspection path will populate it canonically. Compare result to mobile-pa's 14.

### B. Connect Gmail (or pick one real connector) on `personal-adas-stripped`
Without a working OAuth on this tenant, every email-touching e2e test hits the auth wall. ~10 min via the Gmail Setup plugin once it's visible.

### C. Run full side-by-side e2e parity test set (mobile-pa vs stripped)
Today's 3-prompt test was the smoke. Real parity test should include:
- Memory ops (`"remember X"`, `"what do you know about Y"`)
- Daily briefing (`"good morning"`, `"how is my day"`)
- Email management (`"summarize my unread"`, `"archive newsletters"`)
- Coaching (`"log a salad for lunch"`, `"how am I doing this week"`)
- Smart home (real device, not mock)
- Travel (`"find flights to X next week"`)
- Multi-step (`"summarize unread and remind me to reply to mom"`)

Pass criterion: **stripped routes to the same skill as mobile-pa, executes the same primary tool, returns a similar shape**. Differences in wording/style are fine; differences in routing or tool selection are bugs.

### D. (Optional, low-priority) Improve `sys.findCapability` disambiguation
The "clean my emails → messaging-agent" routing IS what mobile-pa does — but is it what the **author** intended? Documenting as "not a strip bug" is correct; if user wants behavior changed, that's a Core-side ranking change, separate work.

---

## 4) Files / commits index

### Builder commits (all on origin/main)
- `fd1631e` — Phase 2b: auto-import tool bridges
- `5e18bbf` — Phase 10 validation + report (Bug 1 + Bug 2 fixes)
- `d816952` — Phase 6 orchestrator id rename to `auto-orchestrator`
- `9021931` — Orchestrator persona — handoff vs askAnySkill clarity
- `7389332` — Orchestrator persona — guardrail contradictions removed
- `75b2207` — Docs: 3 gaps closed (HARDCODED fix, since superseded)
- `1d8e3fe` — Phase 6b initial: LLM synthesize handoff_when from persona
- `e1acaf9` — Docs: Gap 3 generalized (replaces hardcoded fix)
- `a2cf4b9` — Phase 6b: feed skill.tools[] into LLM prompt
- `9931db7` — Phase 6b: round-robin tool sampling + connectors[] in prompt

### Source files
- **New** in this work: `services/connectorTools.js`, `services/builtinOrchestrator.js`, `services/pluginDiscovery.js`, `services/styleInheritance.js`, `services/toolSecurityClassifier.js`, `services/intentSynthesizer.js`, etc.
- **Modified:** `services/exportDeploy.js` (wires phases in order), `routes/deploy.js` (Phase 5/6 invocation)
- **Untouched:** ADAS Core (`ai-dev-assistant`) — by design.

### Tenant artifacts (live on mac1)
- `mobile-pa` — reference, untouched, still in production
- `mobile-pa-test` — explicit-field regression clone (Phase 10 baseline)
- `personal-adas-stripped` — full strip output, this is the migration target

---

## 5) The pinned principle (do not lose)

> Plugins are owned by the MCPs that serve them.
> Triggers are written by the LLM at deploy time from each skill's content.
> Author writes: persona, connector picks, policy guardrails, integration code, UI source.
> Everything else: platform-generated, MCP-introspected, or LLM-synthesized.

If any phase contradicts this — fix the phase, don't carve solution-specific exceptions.
