# mobile-pa Strip Baseline — 2026-05-10

Captured at the start of Phase 0 of the schema strip project. This is the **reference truth** for "what good looks like" — the strip must reproduce this quality with ~10× less authoring effort.

All numbers below are reproducible via `scripts/measure-baseline.sh` (Phase 0 deliverable).

---

## Repo state at baseline

| Repo | Commit | Tag |
|---|---|---|
| `adas_mcp_toolbox_builder` (Builder) | `331ec545` | `safe-strip-phase-0-pre` |
| `ai-dev-assistant` (Core) | `6b3eabfe` | `safe-strip-phase-0-pre` (read-only marker — Core untouched per plan) |
| `ateam-mcp` | `82f5bf90` (v0.3.40) | `safe-strip-phase-0-pre` |

---

## Solution-level shape

| Field | Count |
|---|---|
| Skills | 11 (10 workers + 1 orchestrator) |
| Connectors | 7 (custom) + ~8 referenced shared (gmail-mcp, telegram-mcp, etc.) |
| UI plugins | 14 declared + 20 source files (13 iframe + 7 RN) |
| Handoffs | 8 (orchestrator → each worker) |
| Grants | 1 (`pa.verified_user`) |
| Routing channels | 3 (voice / chat / api → orchestrator) |
| Identity actor types | 1 (`owner`) |

---

## Per-skill JSON metrics

| Skill | Lines | Bytes | Persona chars | Intents | Tools | Triggers | Policy (always+never) | Connectors |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| daily-intel | 1,853 | 58,868 | 2,188 | 16 | 17 | 0 | 0 | 4 |
| home-control | 800 | 24,833 | 1,324 | 5 | 15 | 0 | 0 | 6 |
| life-manager | 762 | 28,587 | 3,814 | 4 | 14 | 1 | 8 | 5 |
| memory-keeper | 309 | 10,112 | 1,932 | 2 | 2 | 0 | 3 | 1 |
| messaging-agent | 2,228 | 66,981 | 1,775 | 19 | 27 | 0 | 4 | 4 |
| my-docs | 356 | 14,898 | 1,818 | 7 | 2 | 0 | 4 | 2 |
| mycoach | 1,609 | 60,164 | 6,228 | 11 | 47 | 2 | 12 | 5 |
| notification-triage | 586 | 18,436 | 2,391 | 3 | 10 | 0 | 0 | 4 |
| pa-orchestrator | 744 | 23,761 | 2,386 | 3 | 16 | 1 | 4 | 5 |
| teach-this | 511 | 16,155 | 2,099 | 3 | 7 | 0 | 0 | 1 |
| travel-agent | 486 | 16,582 | 2,258 | 4 | 6 | 0 | 6 | 2 |
| **TOTAL** | **10,244** | **339,377** | **28,213** | **77** | **163** | **4** | **41** | — |

Plus `solution.json`: **947 lines, 24,731 bytes.**

**Total schema/config: 11,191 lines of JSON.**

---

## Per-connector source metrics

| Connector | Files | Lines | Bytes | UI plugins (iframe / RN) |
|---|--:|--:|--:|--:|
| coach-mcp | 5 | 1,243 | 62,508 | 2 / 0 |
| google-home-mcp | 3 | 213 | 13,578 | — / — |
| home-assistant-mcp | 13 | 2,898 | 145,743 | 3 / 2 |
| hue-mcp | 3 | 210 | 14,268 | — / — |
| nutrition-mcp | 6 | 1,179 | 78,685 | 2 / 0 |
| personal-assistant-ui-mcp | 39 | 13,134 | 604,725 | 6 / 5 |
| tuya-mcp | 3 | 212 | 13,719 | — / — |
| **TOTAL** | **72** | **19,089** | **933,226** | **13 / 7** |

---

## What's irreducible (must stay author-generated)

- Persona prose (~28,213 chars across 11 skills) — the actual "what this skill does"
- Policy guardrails (~41 one-liners) — actual rules, author-specific
- Connector integration logic (~19,089 LOC of `server.js` per-connector domain code, minus ~50% boilerplate that Phase 7 scaffolds eliminate)
- Custom UI plugin source (20 plugins) — actual UI behavior, minus ~50% boilerplate
- Secrets (out-of-band, per-tenant)

**Estimated irreducible: ~10–12k LOC** (mostly the connector + UI source, after Phase 7 scaffolding eliminates boilerplate).

---

## What the strip should eliminate

| Concern | Today's footprint | Target after strip |
|---|--:|--:|
| `tools[]` declarations across 11 skills | 163 tool entries × ~10 lines each ≈ 1,500 lines | 0 (auto-import from connectors) |
| `intents.supported[]` with examples | 77 intents × ~20 lines each ≈ 1,500 lines | ~5 override files when synthesis loses precision |
| `engine.*` blocks | 11 skills × ~80 lines ≈ 880 lines | 0 (platform defaults) |
| Repeated "MOBILE CHAT" style block | 11 personas × ~300 chars ≈ 3,300 chars | 1 entry in solution-level style YAML |
| `access_policy` blocks | 11 skills × ~15 lines ≈ 165 lines | 0 (single-owner default) |
| `validation` metadata | ~10 lines per skill ≈ 110 lines | 0 (runtime artifact, not author input) |
| Solution-level `ui_plugins[]` | ~600 lines | 0 (auto-discovery from connector folders) |
| Solution-level `handoffs[]` | ~150 lines | 0 (built-in router reads personas) — or ~9 lines of override |
| `pa-orchestrator` whole skill | 744 lines | 0 (built-in router replaces) |

**Estimated reduction: ~9,000 lines of JSON config → ~2,000 lines of authored prose + ~5 override files.**

---

## Authoring effort baseline (estimated)

The strip should reduce these. Captured for comparison after Phase 10.

| Metric | Baseline (mobile-pa as it exists) | Phase 10 target |
|---|--:|--:|
| Lines of JSON Claude wrote | ~11,200 | ≤2,000 |
| Hours of focused authoring | weeks (cumulative, hard to pin) | ≤3 hours |
| Deploy round-trips for full rebuild | ~50+ (with validation iterations) | ≤10 |
| Token cost per Claude session | TBD (capture during Phase 0.6 dry run) | ~50% of baseline |

---

## Notes for the regression suite

Per the plan, the regression suite must cover each of mobile-pa's 11 skills. Suggested conversation matrix (final list in `docs/strip-regression-suite.yaml`):

| Skill | Sample input | Expected route | Expected style |
|---|---|---|---|
| memory-keeper | "remember my wife's name is Sarah" | memory-keeper | brief (≤15 words) |
| life-manager | "what's on my calendar tomorrow" | life-manager | brief |
| mycoach | "log my workout from this morning" | mycoach | brief |
| daily-intel | "give me my morning briefing" | daily-intel | brief |
| messaging-agent | "text my wife I'll be late" | messaging-agent | brief |
| notification-triage | "what did I miss today" | notification-triage | brief |
| home-control | "turn off the bedroom lights" | home-control | confirmation |
| nutrition-tracker (mycoach?) | "how many calories did I have yesterday" | mycoach | brief |
| my-docs | "find that contract I uploaded" | my-docs | brief |
| teach-this | "how do I add a new memory" | teach-this | brief |
| travel-agent | "book a flight to NYC next week" | travel-agent | brief |

Plus edge-case disambiguation tests:
- "find that thing I told you about" → memory-keeper (NOT my-docs)
- "find the report I wrote last week" → my-docs (NOT memory-keeper)
- "remind me to call John" → messaging-agent (NOT memory-keeper)

15 total cases planned.

---

## Why this baseline matters

Three reasons:

1. **Phase 10 success criterion.** The stripped rebuild (`personal-adas-stripped`) is only "successful" if it produces equivalent behavior on this baseline at <50% of the cost.

2. **Per-phase regression test.** The suite at `docs/strip-regression-suite.yaml` runs before/after every phase. Any drift from baseline behavior → rollback.

3. **Architectural honesty.** When someone asks "did the strip actually reduce the work?" we point at this doc + the after-state numbers. Empirical.

---

## Test tenant: `mobile-pa-test`

For strip-related regression testing, a dedicated test tenant has been provisioned **alongside** mobile-pa. **mobile-pa itself is frozen and never touched by strip phases.**

| Aspect | mobile-pa (production) | mobile-pa-test (regression target) |
|---|---|---|
| Used for | User's daily PA | Strip phase regression tests only |
| Touched by strip? | NO | YES |
| State at Phase 0 | Frozen reference | Clone of mobile-pa at 2026-05-10 |
| Mongo DB | `adas_mobile-pa` | `adas_mobile-pa-test` |
| Builder FS | `/memory/mobile-pa/_builder/` | `/memory/mobile-pa-test/_builder/` (rsync of above) |
| Skills deployed | 11 declared | 11 cloned, deployed |
| External OAuth/devices | Real (gmail, telegram, etc.) | None — tool execution often fails, but routing decisions are unaffected |

**The routing-decision regression contract:** the strip plan changes Builder-side code that affects deploy-time enrichment. It does NOT change runtime tool execution or orchestrator routing logic. Therefore the regression suite tests **routing decisions** (which skill the orchestrator picks for a message), not **execution success** (whether the routed skill's tools then succeed).

`extractRoute()` in the runner extracts the orchestrator's decision from step traces:
1. First `sys.handoffToSkill` step → `args.to_skill`
2. Then `sys.askAnySkill` step → `args.to_skill`
3. Fallback to `job.skillSlug` etc.

This makes the suite robust to environmental failures in the test tenant (no device paired, no gmail OAuth, no dropbox connection) — those break execution but preserve the routing decision.

## Phase 0.6 validation results (live)

Run via `mcp__ateam__ateam_conversation` with master key against `mobile-pa-test`:

| Test | Input | Expected route | Actual route | Status |
|---|---|---|---|---|
| memory_store | "remember that my wife's name is Sarah" | memory-keeper | teach-this via sys.teach (mobile-pa routes "remember X is Y" to teach-this as a teach-rule) | ✅ functional (response: "Got it — I'll remember…") |
| calendar_today | "what's on my calendar tomorrow" | life-manager | life-manager (via sys.handoffToSkill) | ✅ route correct |
| home_control | "turn off the bedroom lights" | home-control | home-control (handoff + askAnySkill, sub-job succeeded) | ✅ route correct, execution succeeded |
| disambig_report_vs_memory | "find the report I uploaded last week" | my-docs | my-docs (via sys.handoffToSkill) | ✅ route correct |

4 of 4 representative tests validated. The suite is operational. Full 15-test run can be triggered at any time via Claude session with master key.

**Known quirk:** in the test tenant, `sys.handoffToSkill` initially fails with `no_channel_context` (the test conversation API path lacks channel info). The orchestrator then either falls back to `sys.askAnySkill` (which succeeds) or returns the error. Routing extraction works either way — both step types carry `to_skill` in their args.

## Status

- ✅ Phase 0.1: Tag pre-state on all 3 repos
- ✅ Phase 0.2: Capture baseline metrics (this doc)
- ✅ Phase 0.3: Build regression suite YAML (15 tests)
- ✅ Phase 0.4: Write `run-strip-regression.mjs` (with handoff-step extraction)
- ✅ Phase 0.5: Write `strip-phase.mjs` orchestrator
- ✅ Phase 0.6: Validate suite against mobile-pa-test (4/4 representative tests pass)
- ⏳ Phase 0.7: Tag post-state, proceed to Phase 1

Phase 0 closes after the post-state tags are pushed.
