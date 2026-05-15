# Design — Plugin Validator Hardening

**Date:** 2026-05-15
**Status:** Design proposal, not implemented
**Motivation:** Yesterday's migration of `mobile-pa → ada` deployed "successfully" with broken plugin manifests. The mobile app silently fell back to iframe HTML instead of rendering the React Native plugins. The deploy pipeline emitted exactly the warnings that would have explained the failure — and proceeded anyway. We need to close the warn-and-ignore gap.

---

## 1. What broke

For ada, the migration produced:

- `solution.ui_plugins[i]` entries with no `surface` block (auto-generated from MCP introspection; mobile-pa had hand-authored `surface: { type: "drawer", placement: "featured", ... }`).
- Coach plugin manifests with an extra `render.reactNative.bundleUrl` field pointing at `/api/ui-plugins/...` that competed with the platform's own bundle serving.
- Other connectors with bundle exports that used `PluginSDK.register()` instead of the canonical plain-object default export.

Each of these was either silently absent (no surface check) or emitted as a non-blocking warning during `ateam_upload_connector`. The deploy succeeded. The user opened the app and saw iframe HTML or plugin content covered by the chat bar.

This is the second time today this kind of "deploy succeeded but the user-visible result is broken" has happened (cf. yesterday's HEIC metadata + relay shared-secret incidents). The pattern is the same: a check exists somewhere, but it produces a soft signal that's allowed to ride through.

---

## 2. Proposed checks

Three mechanical (cheap, should be hard blocks) and one bigger (real end-to-end).

### Check 1 — Every `ui_plugins[i]` MUST declare `surface`

**Where:** `packages/skill-validator` solution validator, OR a new deploy-time pre-flight in `apps/backend/src/services/exportDeploy.js`.

**Rule:** For every entry in `solution.ui_plugins`, the `surface` object must be present with at minimum `type ∈ {drawer, fullscreen, inline}`. Optional fields (`placement`, `icon`, `title`, `subtitle`, `visibility`) are advisory but encouraged.

**Failure mode:** deploy returns a 400 with the offending plugin ids and missing field name. Operator must either declare `surface.type: "inline"` (acknowledge it renders behind chat) or fix the manifest.

**Why not warn:** the host can't render without surface. Today, missing surface produced ada's "plugin behind chat bar" symptom that the user spent the morning debugging.

### Check 2 — RN/adaptive bundles MUST use plain-object default export

**Where:** existing bundle inspector in `ateam_upload_connector` (already emits the warning today).

**Rule:** parse the bundle, look for `module.exports.default` or `exports.default`. If it's a plain object with `{ id, type, version, Component }` → pass. If it's a `PluginSDK.register()` side effect with no default export → fail.

**Failure mode:** upload returns 400. Connector is not deployed. Operator must edit the .tsx, rebuild.

**Why not warn:** `PluginSDK.register()` writes to a shared global registry that doesn't survive plugin lazy-load on mobile. Even when it appears to work in dev (because Metro keeps modules warm), production loads bundle-per-plugin and the register call never fires until the plugin is opened — too late.

### Check 3 — No `render.reactNative.bundleUrl` injection

**Where:** solution validator.

**Rule:** If `render.reactNative.component` is present, `render.reactNative.bundleUrl` must be absent. The platform's bundle API (`/api/ui-plugins/<id>/bundle.js`) is authoritative; injecting a custom URL bypasses cache versioning and signs the manifest with a path that may not resolve in all hosts.

**Failure mode:** validator strips the field and warns once — OR refuses the deploy if `STRICT_PLUGIN_VALIDATION=true`. Either way, the field doesn't survive into the deployed manifest.

**Why this matters:** ada's coach plugins had this stray bundleUrl from the MCP-introspection auto-gen. The mobile loader tried both URLs, picked the wrong one, fell back to iframe HTML.

### Check 4 — End-to-end render harness (bigger)

**Where:** new CI / deploy step. Likely lives in `packages/skill-validator` as `validatePluginRender(manifest, bundlePath)`.

**Rule:** spin up a headless React Native renderer (e.g. `react-native-web` or a sandboxed RN runtime), load each plugin manifest + bundle, assert:
- bundle exports the expected shape (covered by Check 2)
- component mounts without throwing
- no fallback-to-iframe path is taken
- (optional) screenshot the rendered output for regression tracking

**Failure mode:** deploy blocked if any plugin fails to mount. Logs include the actual error.

**Why this matters:** Checks 1–3 catch the categories we know about today. Check 4 catches the next class of bug we haven't named yet — anything that breaks at runtime in the host but passes static validation. It's the only check that simulates "what the user actually sees."

**Trade-off:** higher cost (~30s per plugin), needs an RN runtime in the deploy container. Reasonable to roll out gated behind `STRICT_PLUGIN_VALIDATION=full`.

---

## 3. Meta-fix: stop continuing on warnings

The current pipeline emits warnings and proceeds. That's the upstream root cause — every individual check works, but warnings are noise so operators learn to ignore them.

**Proposed policy:**

- A "warning" in the deploy validator should mean "this is technically OK but worth flagging." If it's actually broken (won't render, won't deploy correctly), it's an ERROR.
- The validator gets a `severity` enum: `info | warn | error`. Today's `PluginSDK.register` finding promotes from `warn` → `error`. Missing-surface promotes from silent → `error`.
- Environment override `STRICT_PLUGIN_VALIDATION=false` (default `true` in production) lets a developer locally deploy a known-warning state for testing, but production NEVER ships with errors silently.

In practice this means a small grep through the validator's warning sources and reclassifying each. ~30 minutes of work, eliminates the entire class of "deploy succeeded but the result is broken."

---

## 4. Where each check lives

| Check | Location | Effort |
|---|---|---|
| 1 — surface block required | `packages/skill-validator` solution schema | ~1h |
| 2 — bundle export shape | already exists, change severity to error | ~30min |
| 3 — no bundleUrl injection | solution validator | ~1h |
| 4 — end-to-end render | new module, opt-in via env | ~1-2 days |
| Meta — warn vs error severity | sweep through validator emits | ~30min |

Total without Check 4: ~3 hours, eliminates today's recurring class of bug.

---

## 5. Rollout

1. **Land Checks 1, 2, 3 + severity sweep** as a Builder package change. Default: `STRICT_PLUGIN_VALIDATION=warn` for one week — log violations across all existing deploys, fix any latent issues this surfaces (likely several across older tenants).
2. **Flip to `STRICT_PLUGIN_VALIDATION=error`** after the warn week. All new deploys must pass.
3. **Check 4** lands in a separate later pass. Opt-in via `STRICT_PLUGIN_VALIDATION=full`. Promote to default once stable.

---

## 6. Out of scope

- Mobile-host validator (the contract on the host side that decides whether to load the plugin or fall back). That's a separate harden — at minimum the host should log loudly when it falls back to iframe so operators learn about silent breakage. Currently the fallback is silent.
- The `_source: mcp_introspection` auto-gen path itself. It produces manifests that fail Check 1 (no surface). Either the auto-gen should populate a default surface, or the introspection path should refuse to produce a manifest and require hand-authoring. Either is fine; both close the loop.
- Version cache busting on the mobile side. Bumping plugin version in the manifest should invalidate mobile's bundle cache. Today it doesn't always — separate work.

---

## 7. Asked, not built

Putting this in `docs/` because the user explicitly said the other agent is handling the immediate coach plugin fix and not to touch code. This is the *next* layer — make sure the bug class can't ship again. Land when there's an owner.
