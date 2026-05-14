# Migration Plan: `mobile-pa` → `personal-adas-stripped`

**Owner:** Arie + Claude
**Goal:** cut over daily-use solution from `mobile-pa` to `personal-adas-stripped`. Keep mobile-pa as immediate rollback. Self-running by Claude end-to-end except where explicitly flagged **Human-required**.

**Hard rules:**
- Every phase has a pre-check, action, e2e test, rollback.
- No phase advances until its e2e test passes.
- Mobile-pa data and bindings are NEVER mutated by this plan — pure copy-out + new-bind-in.

---

## Phase 0 — Baseline & Inventory

**Pre-check:** Both tenants reachable, both backends healthy.

**Action:**
1. Snapshot tenant state to JSON: skill count, intent count, tool count, persona length, connector count per tenant.
2. Snapshot Mongo collection counts per tenant: `memory_*`, `conversations`, `jobs`, `trigger_runs`, `job_summaries`, `insights`.
3. Capture last 30 user prompts from `adas_mobile-pa.conversations` (sanitized; PII safe to keep tenant-local).

**E2E test:**
- `/api/health` returns 2xx on both backend services.
- `ateam_get_solution` returns valid solution definitions for both tenants.
- Snapshot file written, both sections populated, no zero-counts where they shouldn't be.

**Rollback:** None needed — read-only.

**Output:** `docs/migration/phase0-baseline.json`

---

## Phase 1 — Replay Harness

**Pre-check:** Phase 0 complete.

**Action:** Build a deterministic replay script:
- Input: the 30 prompts from Phase 0.
- For each prompt: invoke `ateam_test_skill` against BOTH tenants (mobile-pa fully shadowed, no side effects).
- Capture per prompt: routed skill, iteration count, top 5 tool calls, final-response sentiment, error/success flag.
- Output: side-by-side comparison report.

**E2E test:**
- Harness runs on 5 representative prompts end-to-end without errors.
- Output JSON parseable, both tenants populated.
- Report flags discrepancies (different routed skill, different tool sequence).

**Rollback:** Discard the script — purely additive.

**Output:** `scripts/replay-harness.mjs` + `docs/migration/phase1-smoke.json`

---

## Phase 2 — Data Migration (read-only sources, append-only target)

**Pre-check:** Phase 1 passes. Stripped tenant `memory_*` collections are empty OR explicitly marked safe to overwrite (we'll dry-run first).

**Action:**
1. Dump from `adas_mobile-pa`: `memory_facts`, `memory_episodic`, `memory_rules`, `trigger_runs` (recent 90d), `learned_shortcuts`.
2. Transform: rewrite any tenant-scoped IDs that need rewriting (likely none — IDs are per-tenant).
3. Insert into `adas_personal-adas-stripped` (same collection names).
4. Skip `conversations` for now (not critical for daily use; can backfill later).

**E2E test:**
- Doc counts in stripped MATCH the source counts from mobile-pa (within ±1% for the live ones).
- Sample 10 random docs from each collection; spot-check identity (same `_id`, same content).
- Stripped `sys.memory.recall` against a known memory returns the same content as mobile-pa.

**Rollback:** `db.adas_personal-adas-stripped.memory_*.drop()` per collection. Mobile-pa untouched.

**Output:** `docs/migration/phase2-data.json` (counts before/after) + a dump file backed up.

---

## Phase 3 — Integration Re-bind (Human-required: OAuth flows)

**Pre-check:** Phase 2 passes.

**Action (Claude-automatable):**
- Update voice manifest for stripped (auto-detect orchestrator at index 0 — same as item E in master plan).
- Update Telegram webhook to route to stripped tenant (requires the user's bot token already configured, just flip the binding).
- emailPoller config: add stripped to active polling list.

**Action (Human-required):**
- Re-do Gmail OAuth in stripped UI (click "Connect Gmail").
- Confirm Telegram messages route to stripped after the rebind.

**E2E test:**
- `platform.auth.status(service_id: "gmail")` returns connected on stripped.
- Send a test Telegram message → stripped responds (not mobile-pa).
- `voice.test` endpoint (or equivalent) returns OK on stripped.

**Rollback:** Re-point Telegram + voice + emailPoller back to mobile-pa. Gmail OAuth stays attached to whichever tenant authed it (harmless).

**Output:** `docs/migration/phase3-integrations.json` (per-integration status)

---

## Phase 4 — Replay Test on Migrated Stripped

**Pre-check:** Phases 2 + 3 pass.

**Action:**
- Re-run the Phase 1 replay harness — but this time against the MIGRATED stripped (with memory + integrations attached).
- Same 30 prompts. Compare:
  - Routing parity per prompt (same skill picked, or both bounce to orchestrator → same skill).
  - Tool-call parity (same gmail.send, same memory.recall, etc. — not order-strict but presence-strict).
  - No `tool_drift` events in `execution_logs`.
  - No `routing_divergence` events.

**E2E test (pass criteria):**
- ≥80% routing parity (24/30).
- 0 catastrophic errors (job failures, infinite loops, timeouts).
- 0 `tool_drift` events.
- ≤2 `routing_divergence` events.
- Iteration count median ≤ 8 (no spikes).

**Rollback:** Phase 2 rollback (drop memory) + Phase 3 rollback (re-point integrations).

**Output:** `docs/migration/phase4-replay.json`

---

## Phase 5 — Cutover (Human-required: explicit go/no-go)

**Pre-check:** Phase 4 passes ALL pass criteria.

**Action:** Flip the user's primary tenant binding:
- A-Team web UI: stripped is the default tenant in the dropdown.
- Mobile app: switch active API key to stripped.
- Notification routing default: stripped.

**Human-required:**
- User runs ONE real prompt via each channel (web, mobile, Telegram, voice). Reports success.

**E2E test:**
- One test prompt per channel routes to stripped, completes, returns sensible answer.
- No errors in `execution_logs` during the test window.

**Rollback:** Flip bindings back. Mobile-pa is ready, untouched.

**Output:** `docs/migration/phase5-cutover.md`

---

## Phase 6 — Burn-in (7 days)

**Pre-check:** Phase 5 complete.

**Action:**
- Daily auto-query of `execution_logs` for `tool_drift`, `routing_divergence`, job failures.
- Daily summary: how many jobs ran, how many iterations median/p95, any incidents.
- Auto-alert if `tool_drift` count > 0 or `routing_divergence` count > 5.

**E2E test (after 7 days):**
- Zero unexplained job failures.
- Zero `tool_drift`.
- ≤10 `routing_divergence` cumulative across the week.
- No user-reported issues.

**Rollback:** Phase 5 rollback if any pass criterion fails.

**Output:** `docs/migration/phase6-burn-in-day-N.json` (daily)

---

## Phase 7 — Decommission (optional, +30 days)

**Pre-check:** 30 days post-cutover, zero incidents on stripped.

**Action:**
- Mark mobile-pa as archived in tenant registry (don't delete — keep for forensic).
- Stop the emailPoller / Telegram poller for mobile-pa.
- Keep its Mongo data dormant.

**E2E test:**
- Stripped serves all daily traffic for 30 days, zero incidents.

**Rollback:** Reactivate mobile-pa (instant — config flip).

---

## What I Can Run Autonomously vs What I Need You For

| Phase | Claude alone | Needs you |
|---|---|---|
| 0 baseline | ✅ all | – |
| 1 harness | ✅ all | – |
| 2 data migration | ✅ all | – |
| 3 integration re-bind | ✅ voice + Telegram routing + emailPoller | ❌ Gmail OAuth click, Telegram confirm |
| 4 replay test | ✅ all | – |
| 5 cutover | ✅ binding flips | ❌ one real prompt per channel, go/no-go |
| 6 burn-in | ✅ daily checks | – |
| 7 decommission | ✅ all | ❌ explicit "yes, decommission" |

---

## Open Questions Before I Start

1. **Memory scope to migrate:** all `memory_*` collections from mobile-pa? Or specific types only (facts + rules, skip episodic)?
2. **Conversations:** include or skip? They're recoverable (can backfill later if needed).
3. **Replay prompt sample:** the last 30 from `conversations`? Or a curated set you pick?
4. **Burn-in window:** 7 days or shorter?

Answer those, and I can start Phase 0 immediately.
