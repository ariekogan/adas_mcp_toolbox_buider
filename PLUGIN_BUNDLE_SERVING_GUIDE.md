# Plugin Bundle Serving — Architecture Guide

**For:** All developers building/deploying React Native UI plugins
**Purpose:** Clarify where plugin bundles come from and how they're served

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLUTION DEFINITION (JSON)                                      │
│  ui_plugins[0].render.reactNative.bundleUrl = ???               │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ateam_build_and_run deploys
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  CORE DATABASE (MongoDB)                                         │
│  Stores: Plugin metadata + Bundle code                          │
│  bundleUrl = "/api/solutions/{id}/ui-plugins/{id}/bundle.js"   │
└────────────────────┬────────────────────────────────────────────┘
                     │
         GET /api/solutions/.../bundle.js
                     │
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  MOBILE APP                                                      │
│  1. Checks pre-bundled registry (instant)                       │
│  2. Downloads bundle from Core (first time)                     │
│  3. Caches locally (next 7 days)                                │
│  4. Renders plugin                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Three Loading Scenarios

### Scenario 1: Pre-Bundled Plugin (Instant ⚡)

**What is it?**
A React Native plugin built into the app binary. No download needed.

**When to use:**
- Core plugins
- Plugins that can't change (app update required)
- Must-have plugins that need instant load

**Loading time:** <100ms (no network)

**Setup:**
```typescript
// In ateam-mobile/src/plugins/registry.ts
register('MyPlugin', {
  name: 'My Plugin',
  type: 'ui',
  Component: MyPluginComponent,
  native: { /* capabilities */ },
});
```

**In solution definition:**
```json
{
  "ui_plugins": [{
    "id": "my-plugin",
    "render": {
      "mode": "react-native",
      "component": "MyPlugin"
      // ← NO bundleUrl (uses pre-bundled)
    }
  }]
}
```

---

### Scenario 2: Remote Plugin — First Load (2-5 seconds ⏳)

**What is it?**
A React Native plugin stored in Core, downloaded when first needed.

**When to use:**
- Optional plugins
- Frequently-updated plugins
- Large plugins that shouldn't be in app binary
- Custom plugins for specific solutions

**Loading time:** 2-5 seconds (download + cache + load)

**Setup:**

**Step 1:** Build plugin
```bash
cd my-plugin/
npm run build
# → produces: dist/my-plugin.bundle.js
```

**Step 2:** Deploy with bundleUrl
```bash
ateam_build_and_run solution.json skills/*
# System auto-generates bundleUrl
```

**Step 3:** In mobile app, bundleUrl is set automatically
```json
{
  "ui_plugins": [{
    "id": "my-plugin",
    "render": {
      "mode": "react-native",
      "component": "MyPlugin",
      "bundleUrl": "https://core.ateam.com/api/solutions/my-solution/ui-plugins/my-plugin/bundle.js"
      // ← Auto-set by system during deployment
    }
  }]
}
```

**Flow:**
1. Mobile app receives plugin metadata from Core
2. Checks pre-bundled registry — NOT FOUND
3. Sees bundleUrl — DOWNLOADS
4. Saves to device cache
5. Loads and renders
6. Future loads are instant (cached)

---

### Scenario 3: Cached Plugin — Reload (Instant 🚀)

**What is it?**
A remote plugin that was already downloaded and cached.

**When:** After first load of a remote plugin

**Loading time:** <200ms (load from disk cache, no network)

**Flow:**
1. Mobile app checks cache
2. Bundle found on disk ✓
3. Loads from cache (no download)
4. Renders

**Cache details:**
- **Location:** Device filesystem (`expo-file-system` cache directory)
- **TTL:** 7 days
- **Cleanup:** Automatic expiration
- **Manual clear:** Available via settings or on tenant switch

---

## Core API Endpoint

### GET /api/solutions/{solutionId}/ui-plugins/{pluginId}/bundle.js

**Purpose:** Serve React Native plugin bundles

**Request:**
```bash
GET /api/solutions/my-solution/ui-plugins/my-plugin/bundle.js
Host: core.ateam.com
```

**Response:**
```
200 OK
Content-Type: application/javascript
Content-Length: 45230

(function(module, exports) {
  // React Native plugin code
  // PluginSDK.register('MyPlugin', { ... })
})()
```

**Error Cases:**
```
404 Not Found
  → Plugin not deployed or not found

400 Bad Request
  → Invalid solutionId or pluginId

500 Internal Server Error
  → Bundle corrupted or not stored
```

---

## Deployment Flow (ateam_build_and_run)

### For React Native Plugins

**Input:** Solution definition with ui_plugins
```json
{
  "ui_plugins": [{
    "id": "my-plugin",
    "version": "1.0.0",
    "render": {
      "mode": "react-native",
      "component": "MyPlugin",
      "bundleUrl": "???"  // ← Will be auto-set
    },
    "bundle": "<raw JavaScript code>"  // ← Plugin source
  }]
}
```

**Process:**
```
1. Validate plugin manifest
   ✓ Check component name registered
   ✓ Check render config valid
   ✓ Check bundle size reasonable

2. Store in Core
   ✓ Save plugin metadata
   ✓ Save bundle code in MongoDB
   ✓ Generate bundleUrl

3. Set bundleUrl
   bundleUrl = `/api/solutions/{solutionId}/ui-plugins/{pluginId}/bundle.js`

4. Return verification
   {
     "ui_plugin_deploy": {
       "status": "success",
       "plugin_id": "my-plugin",
       "version": "1.0.0",
       "bundle_url": "https://core.ateam.com/api/solutions/my-solution/ui-plugins/my-plugin/bundle.js",
       "bundle_size_bytes": 45230,
       "verified": true
     }
   }
```

---

## Summary Table

| Aspect | Pre-bundled | Remote (First) | Remote (Cached) |
|--------|---|---|---|
| **Load time** | <100ms ⚡ | 2-5s ⏳ | <200ms 🚀 |
| **Network needed** | ❌ No | ✅ Yes | ❌ No |
| **Location** | App binary | Core API | Device storage |
| **Cache policy** | N/A | 7-day TTL | Automatic |
| **Setup cost** | App update | Deployment | Automatic |
| **Good for** | Core features | Optional plugins | Popular plugins |

---

## Developer Checklist

### When Building a React Native Plugin

- [ ] Plugin builds to `dist/bundle.js`
- [ ] Bundle exports PluginSDK-registered component
- [ ] Component name matches manifest
- [ ] Test locally with pre-bundled registry first
- [ ] Ready for ateam_build_and_run deployment

### When Deploying Plugin

- [ ] Include in solution definition `ui_plugins` array
- [ ] Run `ateam_build_and_run solution.json skills/*`
- [ ] Verify response includes `bundle_url`
- [ ] Test in mobile app
  - [ ] First load (downloads)
  - [ ] Reload (from cache)
  - [ ] Tenant switch (cache clears)
  - [ ] Network off (uses cache)

### When Mobile App Loads Plugin

- [ ] Check pre-bundled registry first
- [ ] If not found, fetch from Core API
- [ ] Show loading spinner
- [ ] Download and cache
- [ ] Render component
- [ ] Log [PluginLoader] messages for debugging

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "No bundle URL" | Plugin not deployed with bundle | Use ateam_build_and_run |
| "404 from bundleUrl" | Core doesn't have bundle | Redeploy solution |
| "Failed to evaluate" | Bundle has syntax error | Fix plugin code, rebuild, redeploy |
| "Module not found" | Component not registered | Check component name matches |
| "Always downloads" | Cache disabled or expired | Check TTL, re-cache, or pre-bundle |
| "Slow on first load" | Network latency | Expected (2-5s), subsequent loads cached |

---

## Key Takeaways

✅ **Plugin bundles are served by Core API**
- No separate CDN needed
- Automatic during deployment
- Tenant-aware (one solution = one set of plugins)

✅ **Three loading paths work simultaneously**
- Pre-bundled (instant)
- Remote (2-5s first time)
- Cached (instant after first time)

✅ **No skill code changes needed**
- Skills request plugins the same way
- Platform handles which source to use

✅ **Mobile app is intelligent**
- Checks cache first
- Falls back to registry
- Downloads if needed
- No manual intervention

---

## References

- **Public MCP Spec:** `GET /spec/solution` → `ui_plugins` section
- **Mobile App:** `ateam-mobile/DYNAMIC_PLUGIN_LOADING_INTEGRATION.md`
- **Plugin Schema:** Public spec includes full validation schema
- **Examples:** `ateam-mobile/example-plugins/task-list/`

---

**All plugin bundles flow through Core.** No manual URLs or CDN setup needed. The system handles it automatically. 🚀
