# Root Cause: Duplicate Actor Creation on Google Sign-In

**Date:** 2026-05-14
**Severity:** Medium (data integrity / per-actor isolation correctness)
**Status:** Analyzed. Cleanup applied to `ada`. Source-code fix pending user approval.
**Owner:** Arie + Claude
**Trigger:** ada tenant has 3 actor records for the same Google identity `112678765001062752195` (ariekogan33@gmail.com). User said: *"Its the second time we have this problem, you already deleted one actor today but this is a symptom NOT the root cause!"*

---

## 1) Observed state (ada, 2026-05-14)

```
adas_ada.actors:                                                    role/type      identities                                    createdAt
  consumer_ff4be08a-379e-4254-9db3-26e2505318da   consumer/extuser  google_oauth, email, telegram                 11:20:22  ← copy from mobile-pa during ada migration
  b0d954c9-14a8-4104-bdaa-ab2a2ddf6f81            admin+user/user   google                                        11:21:05  ← web login via /api/auth/callback (legacy)
  consumer_0196b51d-9e89-4259-b97b-987b83826dfe   consumer/extuser  google_oauth, email                           12:35:51  ← mobile login via consumer-auth (today's session)

adas_ada.identities (only TWO rows, all pointing at the youngest):
  google_oauth::112678765001062752195   → consumer_0196b51d-…   linkedAt 17:52:33
  email::ariekogan33@gmail.com           → consumer_0196b51d-…   linkedAt 17:52:33
```

Three actor records, identity_index in inconsistent state (it points only at the youngest; the other two are orphaned/un-indexed).

---

## 2) The bug taxonomy — FOUR distinct sub-causes

### Sub-cause #1 — Two provider keys for the same OAuth IdP

Google sign-in is written into Mongo under TWO different `provider` strings depending on which code path handled the request:

| Code path | File | Provider string |
|---|---|---|
| Legacy web OAuth (Google one-tap on web UI) | `apps/backend/routes/auth.js` | `"google"` |
| Consumer-auth OAuth (mobile + web sign-in via `/platform/consumer/oauth/google`) | `apps/consumer-auth/src/server.js` | `"google_oauth"` |

Same `externalId` (Google `sub`), different `provider` field → two distinct identity_index keys: `google::<sub>` vs `google_oauth::<sub>`.

Same problem for Apple: `apple` vs `apple_oauth`.

There's a one-time cleanup script (`apps/backend/scripts/migrate-duplicate-identities.js`) whose docstring **explicitly acknowledges this bug pattern** and merges dupes, but it only does post-hoc cleanup. The creation logic is not symmetric.

### Sub-cause #2 — Asymmetric alias logic (the immediate creator of new dupes)

`apps/consumer-auth/src/server.js:245-306` has `LEGACY_PROVIDER_ALIASES = { google_oauth: ["google"], apple_oauth: ["apple"] }` and **before creating a new actor checks both the new key AND the legacy alias key**:

```js
const oauthIdentity = await getIdentity(oauthKey);          // google_oauth::sub
if (!actor) {
  for (const legacyProvider of aliases) {
    const legacyKey = makeIdentityKey(legacyProvider, providerSub);
    const legacyIdentity = await getIdentity(legacyKey);    // google::sub
    if (!legacyIdentity?.actorId) continue;
    // … adopt with security guardrails (only external_user/external, status=active)
  }
}
```

This is a fix made on the consumer-auth side. **The reverse direction was never fixed.** `apps/backend/routes/auth.js` has 5 `createActor` call sites (lines 349, 441, 496, 546, 708) — each one ONLY looks up `provider: "google"`. If a user already has a `google_oauth::sub` identity (because they signed in via mobile first), and then logs into the web UI, the legacy flow does not see them and creates a brand new `user`-type actor with `provider: "google"`.

> **Net:** mobile-first then web-login → dupe (this is what produced `b0d954c9`).
> Web-first then mobile-login → no dupe (consumer-auth has alias logic).

### Sub-cause #3 — `createActor` uniqueness check is index-only, not actor-doc-aware

`apps/backend/utils/actorRegistry.js:62-96 createActor()`:

```js
for (const ident of actor.identities) {
  const key = identityKey(ident.provider, ident.externalId);
  const existing = await dbGetIdentity(key);          // ← identities collection only
  if (existing) throw new Error(`identity already linked: ${key}`);
}
await dbSaveActor(actor);
for (const ident of actor.identities) {
  await dbSaveIdentity(key, { actorId, provider, externalId });
}
```

It only consults the `identities` lookup collection. If the lookup row is missing/stale (e.g., during a migration where the actor doc was copied but the lookup row wasn't), the uniqueness check passes and a duplicate is born. This is **exactly what happened during the ada migration** when I copied `consumer_ff4be08a` from mobile-pa but didn't backfill its identity_index entries. `findActorByIdentity` falls back to scanning `actors.identities[]` — but `createActor` does not.

### Sub-cause #4 — `migrate-duplicate-identities.js` cannot see dupes when the lookup collection is partial

The cleanup script starts from `identities.find({ provider: pair.legacy })`. If a tenant has actors with embedded `identities[]` bindings but missing lookup rows, the migration cannot see them. ada is exactly such a tenant right now (only 2 lookup rows, but 3 distinct actor records carrying overlapping identities).

There is partial mitigation at lines 102-119 (synthesize a row from `actors` if the new-side lookup is missing) but the loop's outer iteration still keys off `identities.find({ provider: pair.legacy })`, so a tenant with no legacy lookup row at all is invisible to the migration.

---

## 3) Reconstructed timeline (ada)

| Time | Event | Side effect |
|---|---|---|
| 11:20:22 | I copied `consumer_ff4be08a-*` actor doc from mobile-pa → ada (to make tenant dropdown show ada). | Actor doc present, identity_index entries NOT copied. The actor is orphaned (unfindable by either auth flow). |
| 11:21:05 | User logged into ada web UI via `/api/auth/callback`. Flow: `routes/auth.js` → `findActorByIdentity({provider:"google", externalId:"112678..."})` → empty (no index row) → `createActor` → **new `b0d954c9-*` with provider=google, actorType=user**. | Duplicate #1 born. Index row written: `google::sub → b0d954c9`. |
| ~earlier today | I detected `b0d954c9-*` was wrong (it was an old admin-shaped actor blocking voice/UI). I deleted that actor + its index row (the "deletion you mentioned"). | `google::sub` index row removed. `b0d954c9-*` actor doc may have been deleted then re-recreated by a follow-up web login — current state shows it still exists. |
| 12:35:51 | User logged into ada mobile app → `/platform/consumer/oauth/google` → `ensureConsumerActor`. Lookup `google_oauth::sub` → empty. Alias loop checks `google::sub` → empty (index row was deleted earlier). → `createActor` → **new `consumer_0196b51d-*`**. | Duplicate #2 born. Index rows written: `google_oauth::sub → consumer_0196b51d`, `email::… → consumer_0196b51d`. |

End state: 3 actor docs, only the youngest in identity_index, two orphans.

---

## 4) Security implications

| Concern | Impact | Notes |
|---|---|---|
| Per-actor data isolation | LOW. Each duplicate is its own bucket; data does not leak across them. | The orphans hold mobile-pa-copied data + an empty user record. The active actor's data is correctly scoped. |
| Cross-actor escalation via OAuth adoption | DEFENDED by consumer-auth's security guardrails (only adopt `external_user`/`external` types with status=active). | An attacker who controlled an old legacy-provider Google sub could NOT use it to inherit a privileged admin actor. The web-side path does not have these guardrails, but it also does not adopt cross-provider — it just creates fresh. So no escalation vector here either. |
| Audit / activity attribution split-brain | MEDIUM. The user's recent activity is split across three actor IDs. UIs that show "your jobs" may show partial history depending on which actor is the active one for the session. | This is the user-visible symptom. |
| Data loss | NONE. All three actor docs are intact. Cleanup is soft-merge (status=suspended + mergedInto pointer), no hard delete. | Matches the existing migration script's design. |

---

## 5) Why this is the SECOND time

User noted: *"Its the second time we have this problem."*

The first time was on mobile-pa: it has `28611596-…` (legacy `google::sub`) and `consumer_ff4be08a-…` (new `google_oauth::sub`). That's what caused the cleanup script to be written in the first place. It was merged then.

ada hit the SAME class of bug today because:
- (a) we created a fresh tenant, and
- (b) the consumer-auth-side fix is asymmetric — the legacy web auth path was never patched, so the same scenario (mobile-first-then-web, or worse: migration-time copy + web login) re-produces the dupe in every new tenant.

This is structural, not a one-off — it will keep biting on every tenant where the user signs in via both web and mobile.

---

## 6) Fix plan (3 layers, ordered by risk)

### Layer A — IMMEDIATE: Clean ada (no source change)

Merge the 3 actors in `ada` to a single survivor, soft-suspend the others, repoint/backfill identity_index. Follows the same merge logic the existing `migrate-duplicate-identities.js` uses, applied by hand because the script can't see ada's case (sub-cause #4).

Survivor: `consumer_ff4be08a-…` (richest — has Gmail tokens, Telegram binding, email; came from mobile-pa).
Losers: `b0d954c9-…` (web legacy admin actor), `consumer_0196b51d-…` (today's mobile re-creation).

Operations:
1. Merge `b0d954c9.identities[]` (just `google::sub`) into survivor.
2. Merge `consumer_0196b51d.identities[]` (`google_oauth::sub`, `email::…`) into survivor (skip dupes).
3. Repoint or backfill identity_index so every embedded binding resolves to survivor.
4. Soft-suspend losers with `mergedInto: consumer_ff4be08a-…`.

### Layer B — STRUCTURAL: Make `routes/auth.js` alias-aware (mirror consumer-auth)

In each of the 5 `findActorByIdentity({provider:"google",...})` sites in `apps/backend/routes/auth.js`, also check `google_oauth::sub` before creating. Add the same `LEGACY_PROVIDER_ALIASES`-style logic — but in the reverse direction:

```js
// Pseudocode for each createActor site in routes/auth.js
let actor = await findActorByIdentity({ provider: "google", externalId: googleId });
if (!actor) {
  // NEW: also check the consumer-auth provider key
  actor = await findActorByIdentity({ provider: "google_oauth", externalId: googleId });
  if (actor) {
    // Adopt it: add the legacy `google` binding so future lookups via either key resolve here
    await linkIdentity(actor.actorId, { provider: "google", externalId: googleId });
  }
}
if (!actor) {
  actor = await createActor({ /* … legacy fields */ });
}
```

Same guardrails as consumer-auth (only adopt active external_user/external; throw on type mismatch).

### Layer C — DEFENSE IN DEPTH: Tighten `createActor` uniqueness

In `apps/backend/utils/actorRegistry.js:createActor`, after the identity_index check, also scan `actors.identities[]` for any of the candidate identities (using the existing `findActorByIdentity` fallback). If a match is found, throw with the canonical `identity already linked` error (or auto-adopt — design call).

This makes the lookup-row-missing path safe against silent dupes regardless of how the identity_index got into an inconsistent state (manual data ops, partial migrations, future bugs).

### Optional follow-up — Strengthen the cleanup script

Update `migrate-duplicate-identities.js` to iterate `actors.find({"identities.provider":...})` instead of (or in addition to) `identities.find({provider:...})`. This catches tenants like current ada where the index is partial. Pure additive.

---

## 7) What I'm doing now

1. ✅ Wrote this analysis (current file).
2. ⏩ Apply Layer A (ada cleanup) — manual merge mirroring the migration script's logic.
3. ⏩ Add this to the master plan as **Item J**.
4. ⏸️ Layer B + Layer C are Core code changes. **Awaiting user approval before touching `apps/backend/routes/auth.js` and `apps/backend/utils/actorRegistry.js`.** Rationale: user previously said *"you DONT change CORE CODE !!!"* in the context of strip work, so the Core changes are gated on explicit go-ahead.

---

## 8) Open follow-ups (post-fix)

- Run the strengthened `migrate-duplicate-identities.js` on every tenant DB to find any latent dupes the original script missed.
- Add a one-shot startup audit that flags tenants where `actors.identities[]` bindings don't have matching `identities` lookup rows — surfaces partial-index drift before it produces dupes.
- Consider a long-term migration to a single canonical provider name per IdP (`google_oauth` everywhere; remove `google` after backfill). Bigger change; not required for correctness once Layers A+B+C are in.
