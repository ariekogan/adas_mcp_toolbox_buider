# Migration Plan: `mobile-pa` → fresh `ada` tenant

**Owner:** Arie + Claude
**Goal:** spin up a brand-new `ada` tenant from the strip template, attach integrations fresh, cut over daily use. **No data migration. Clean slate.** Mobile-pa stays untouched as fallback.

**Hard rules:**
- Every phase has a pre-check, action, e2e test, rollback.
- No phase advances until its e2e test passes.
- Mobile-pa is NEVER mutated. Pure new-tenant build.
- Memory, conversations, cron state on `ada` start empty.

---

## Phase 1 — Provision `ada` tenant

**Pre-check:** Tenant `ada` does not exist (no `adas_ada` Mongo DB, no API key).

**Action:**
1. Issue API key: `adas_ada_<hex>`.
2. Init Mongo: `adas_ada` database + TTL indexes (`execution_logs`, `llm_traces`, `insights`, etc.).
3. Init Builder FS root: `data/tenants/ada/_builder/`.
4. Copy strip-built solution skeleton from `personal-adas-stripped` (solution.json + all skills/*.json + bootstrap_tools + ui_plugins). Rewrite `solution.id` → `ada-personal-assistant`.
5. **Do NOT copy:** memory data, conversations, cron state, integration tokens.
6. `ateam_build_and_run` to deploy. Push to new GitHub repo `ariekogan/ada--personal-assistant`.

**E2E test:**
- `ateam_list_solutions` (with ada key) shows the new solution.
- `ateam_get_solution(view: skills)` → all 10 skills.
- `ateam_get_solution(view: health)` → all healthy.
- Test prompt: `ateam_test_skill(skill_id: auto-orchestrator, message: "hello")` → finalizes in ≤3 iters.
- Routing smoke: 5 representative prompts route to the same skill names as on mobile-pa (e.g., "clean my emails" → messaging-agent, "log my breakfast" → mycoach).

**Rollback:** Drop `adas_ada` DB, delete Builder FS root, revoke API key, delete repo. Zero impact on mobile-pa or stripped.

**Output:** `docs/migration/phase1-provision.json` (API key handle, solution_id, repo URL, smoke result)

---

## Phase 2 — Integration attach (Human-required: OAuth)

**Pre-check:** Phase 1 passes.

**Action (Claude-automatable):**
- Configure Telegram webhook to route to ada tenant (user's bot token).
- Update emailPoller config to include ada.
- Update voice manifest with auto-orchestrator at index 0.

**Action (Human-required):**
- Re-do Gmail OAuth on ada UI (click "Connect Gmail" in app.ateam-ai.com/?tenant=ada).
- Confirm Telegram messages route to ada after rebind.

**E2E test:**
- `platform.auth.status(service_id: "gmail")` on ada → connected.
- Send test Telegram message → ada responds (not mobile-pa).
- Send a test email to gmail account → emailPoller picks it up on ada.
- Voice test call (if applicable) → routes to ada.

**Rollback:** Re-point Telegram + voice + emailPoller back to mobile-pa. Gmail tokens harmlessly remain on whatever tenant they were attached to.

**Output:** `docs/migration/phase2-integrations.json`

---

## Phase 3 — Smoke test on real flows

**Pre-check:** Phase 2 passes.

**Action:**
- Run a representative set of real-world prompts via `ateam_test_skill` against ada (the user picks 10 — covering email, smart home, mycoach, memory, daily-intel, travel).
- Watch `execution_logs` for: `tool_drift`, `routing_divergence`, job failures.

**E2E test:**
- All 10 prompts produce a sensible response (subjective: user reviews).
- 0 `tool_drift` events.
- ≤2 `routing_divergence` events.
- Iteration count median ≤ 8.

**Rollback:** Stay on mobile-pa as primary. Investigate failures, fix, re-test.

**Output:** `docs/migration/phase3-smoke.json`

---

## Phase 4 — Cutover

**Pre-check:** Phase 3 passes.

**Action (Claude):**
- Flip user's default tenant in web UI to ada.
- Switch mobile app active API key to ada.
- Notification routing default → ada.

**Action (Human-required):**
- Use ada via each channel (web, mobile, Telegram, voice). Confirm working.
- Explicit go/no-go.

**E2E test:**
- One real prompt per channel completes on ada.
- 0 errors in `execution_logs` during the test window.

**Rollback:** Flip bindings back. Mobile-pa is ready, untouched.

---

## Phase 5 — Burn-in (7 days)

**Pre-check:** Phase 4 complete.

**Action:**
- Daily auto-query of `execution_logs` for `tool_drift`, `routing_divergence`, job failures.
- Daily summary: jobs run, median/p95 iterations, incidents.
- Auto-alert on `tool_drift > 0` or `routing_divergence > 5/day`.

**E2E test (cumulative after 7 days):**
- 0 unexplained job failures.
- 0 `tool_drift`.
- ≤10 `routing_divergence` total across the week.
- No user-reported issues.

**Rollback:** Phase 4 rollback if any criterion fails.

---

## Phase 6 — Decommission `mobile-pa` (optional, +30 days)

**Pre-check:** 30 days post-cutover, zero incidents.

**Action:**
- Mark mobile-pa archived in tenant registry.
- Stop emailPoller + Telegram poller for mobile-pa.
- Keep Mongo data dormant for forensic.

**Rollback:** Reactivate mobile-pa (config flip — instant).

---

## What I Can Run Autonomously vs What I Need You For

| Phase | Claude | You |
|---|---|---|
| 1 provision | ✅ all | – |
| 2 integration | ✅ Telegram/voice/emailPoller | ❌ Gmail OAuth click, Telegram confirm |
| 3 smoke | ✅ run + check | ❌ "looks right" review |
| 4 cutover | ✅ binding flips | ❌ test prompt per channel, go/no-go |
| 5 burn-in | ✅ daily checks + alerts | – |
| 6 decommission | ✅ when you say "yes" | ❌ explicit yes |

---

## Open Questions Before I Start

1. **Solution_id for ada:** `ada-personal-assistant`, `ada`, something else?
2. **API key:** I can generate it, or you want to issue it manually?
3. **Smoke prompts:** I pick 10 representative, or you give me a list?
4. **Burn-in window:** 7 days or shorter?

Answer those — I can start Phase 1 immediately.
