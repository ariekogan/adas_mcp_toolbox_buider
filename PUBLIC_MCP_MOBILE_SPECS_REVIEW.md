# Public MCP Mobile Development Specifications — Comprehensive Review

**Date:** March 15, 2026
**Status:** ✅ COMPLETE & UP-TO-DATE

---

## Overview

The public A-Team MCP now has **THREE comprehensive mobile development specifications** available via HTTP endpoints. Developers can read all of these without authentication.

---

## 1️⃣ Mobile Connector Specification

**Endpoint:** `GET /spec/mobile-connector`

### What It Is
Guide for building **functional connectors** (background services) that run in ateam-mobile app without UI.

### Key Content

| Topic | Details |
|-------|---------|
| **Overview** | What is a connector, when to build, execution model |
| **Interface** | Required fields: id, name, version, onStart |
| **Optional Hooks** | onSync, onForeground, onAction, onStop |
| **Bridge APIs** | 13 namespaces: calendar, contacts, location, battery, network, notifications, sms, maps, http, storage, permissions, device, log |
| **Declaration** | How to declare in solution.json functional_connectors[] |
| **Build/Deploy** | Compile → Publish to npm → Declare → Deploy |
| **References** | MOBILE_CONNECTOR_DEVELOPER_GUIDE.md, NATIVE_BRIDGE_SDK_SPEC.md, working examples |
| **Learning Path** | 6-step path from reading spec to deployment |

### Example Fields Documented
```json
{
  "id": "device-bridge",
  "type": "service",
  "package": "@mobile-pa/device-bridge",
  "capabilities": ["calendar", "contacts", "location"],
  "config_keys": ["relay_url", "device_id", "api_key"],
  "sync_interval": 60000
}
```

### Learning Path
```
1. Read /spec/mobile-connector
2. Read MOBILE_CONNECTOR_DEVELOPER_GUIDE.md
3. Study device-bridge working example
4. Build connector using bridge.* APIs
5. Test with mobile app
6. Declare in solution.json and deploy
```

---

## 2️⃣ UI Plugins Specification

**Endpoint:** `GET /spec/ui-plugins`

### What It Is
Guide for building **interactive UI plugins** for web (iframe) and mobile (React Native).

### Key Sections

#### A. Overview
- What is a plugin
- Three render modes: iframe (web), react-native (mobile), adaptive (both)
- Unified API across platforms

#### B. Manifest Schema
Complete JSON schema for plugin definitions:
- id, name, version, description
- type (ui, service, hybrid)
- render (polymorphic by mode)
- capabilities (device permissions)
- channels (communication)
- commands (virtual tools)

#### C. React Native Plugin Guide

**Plugin SDK:**
- Registration: `PluginSDK.register("name", { component })`
- API calls: `const api = useApi(bridge); await api.call("tool", {...})`
- Available exports:
  - `PluginSDK`, `useApi`
  - RN primitives: View, Text, ScrollView, FlatList, etc.
  - UI components: Card, Badge, TabBar, ListItem, etc.
- Props: `bridge`, `native`, `theme`

**Component Template:**
```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { PluginSDK, useApi } from '@adas/plugin-sdk';

function MyDashboard({ bridge, native, theme }) {
  const api = useApi(bridge);
  const [data, setData] = useState([]);

  useEffect(() => {
    api.call('myConnector.listItems', {}).then(setData);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList data={data} ... />
    </View>
  );
}

export default PluginSDK.register('my-dashboard', { component: MyDashboard });
```

#### D. Bundle Build Pipeline

**6-step process:**
```
1. Write RN component in rn-src/index.tsx
2. Add esbuild config → rn-bundle/index.bundle.js
3. Add "build" script to package.json
4. Deploy via ateam_build_and_run
5. Core auto-runs npm install + npm run build
6. Mobile app downloads from /api/ui-plugins/{id}/bundle.js
```

**esbuild Config (Required):**
```javascript
{
  entryPoints: ['rn-src/index.tsx'],
  bundle: true,
  outfile: 'rn-bundle/index.bundle.js',
  format: 'cjs',  // ← MUST be CommonJS
  platform: 'neutral',
  target: 'es2020',
  external: ['react', 'react-native', '@adas/plugin-sdk'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  minify: false,
}
```

**Critical Rules:**
- ✅ format MUST be "cjs" (CommonJS)
- ✅ external MUST include react, react-native, @adas/plugin-sdk
- ✅ jsx MUST be "transform"
- ✅ platform MUST be "neutral"
- ✅ outfile MUST be rn-bundle/index.bundle.js

#### E. Mobile Loading Flow

```
1. Mobile app fetches plugin list from GET /api/solutions/{id}/ui-plugins
2. Checks pre-bundled registry (instant, <100ms)
3. For remote: fetches from /api/ui-plugins/{pluginId}/bundle.js
4. Downloads and caches locally (7-day TTL)
5. Evaluates bundle using CommonJS module loader
6. Renders natively in app
```

---

## 3️⃣ Solution Specification (Mobile Sections)

**Endpoint:** `GET /spec/solution`

### Mobile-Specific Fields

#### A. UI Plugins Array
Complete schema for deploying UI plugins (web + mobile):
```json
{
  "ui_plugins": [
    {
      "id": "mcp:connector:plugin",
      "name": "Plugin Name",
      "version": "1.0.0",
      "render": {
        "mode": "adaptive|iframe|react-native",
        "iframeUrl": "/ui/plugin/1.0.0/index.html",
        "reactNative": {
          "component": "MyPlugin",
          "bundleUrl": "auto-generated"  // ← Set by Core
        }
      },
      "capabilities": {
        "haptics": true,
        "camera": true,
        "location": true,
        "storage": true,
        "notifications": true
      },
      "channels": ["order-updates", "payment-status"],
      "commands": [{
        "name": "highlight_order",
        "description": "Highlight an order in the dashboard",
        "input_schema": { ... }
      }]
    }
  ]
}
```

**Key Concepts Documented:**
- `unified_plugin_spec` — Same API for web and mobile
- `render_modes` — Three modes with clear use cases
- `same_backend_apis` — Identical skill-plugin contract
- `unified_deployment` — Deploy both together
- `bundle_serving` — Core API serves bundles, no CDN needed
- `mobile_bundle_flow` — 4-step loading process
- `developer_guides` — Links to all documentation

#### B. Functional Connectors Array
Complete schema for background services:
```json
{
  "functional_connectors": [
    {
      "id": "device-bridge",
      "name": "Device Bridge",
      "description": "Collects device data...",
      "module": "@mobile-pa/device-bridge",
      "type": "background|service",
      "autoStart": true,
      "permissions": ["calendar", "contacts", "location", "battery", "connectivity"],
      "backgroundSync": true,
      "config": {
        "relay_url": "https://...",
        "device_id": "unique-id",
        "api_key": "..."
      }
    }
  ]
}
```

**Fields:**
- `id` — Unique connector ID
- `module` — NPM package (must be pre-installed)
- `type` — "background" (continuous) or "service" (on-demand)
- `autoStart` — Auto-start on tenant selection
- `permissions` — Native capabilities required
- `backgroundSync` — Enable background task registration
- `config` — Runtime configuration

#### C. Mobile Capability Warnings

**mcpProxy Limitation (Important!):**
```
CRITICAL: Mobile apps do NOT relay mcpProxy calls from plugin iframes.
Plugins that depend on live MCP calls will timeout on mobile.

The A-Team mobile app renders plugin iframes but does NOT support
the postMessage → mcpProxy relay that the web PluginHost provides.

Solution: Plugins must embed fallback data and gracefully degrade
when live data is unavailable.
```

**Recommended Pattern:**
```typescript
// Option 1: Embedded fallback data
const [data, setData] = useState(EMBEDDED_DEFAULT_DATA);
useEffect(() => {
  try {
    fetchLiveData().then(setData);  // Desktop/web
  } catch {
    // Silent — mobile will hit this, that's OK
    // User sees embedded data instead
  }
}, []);

// Option 2: Show cached data while loading
useEffect(() => {
  // Try to fetch live data on desktop
  // Mobile sees loading state but can still use app
}, []);
```

---

## 🎯 What Developers Can Learn

### Via `/spec/mobile-connector`
✅ How to build background services
✅ Bridge API reference (13 namespaces)
✅ Lifecycle hooks (onStart, onSync, onForeground, etc.)
✅ Build/deploy/publish workflow
✅ Configuration management

### Via `/spec/ui-plugins`
✅ How to build React Native components
✅ Plugin SDK API (register, useApi)
✅ Bundle build pipeline (esbuild config)
✅ Component template with examples
✅ Loading flow (cache, fallbacks)
✅ RN primitives and UI components available

### Via `/spec/solution` (mobile sections)
✅ How to declare plugins in solution definition
✅ How to declare functional connectors
✅ UI plugin manifest schema (all fields)
✅ Functional connector schema (all fields)
✅ Capability declarations (permissions)
✅ Channel routing (communication)
✅ Mobile limitations and workarounds

---

## 📚 Linked Documentation

The specs reference these documents:

| Document | Purpose | Format |
|----------|---------|--------|
| `MOBILE_CONNECTOR_DEVELOPER_GUIDE.md` | Quick start for building connectors | Human-friendly |
| `NATIVE_BRIDGE_SDK_SPEC.md` | Complete bridge API reference | Technical |
| `REACT_NATIVE_UI_PLUGINS_ARCHITECTURE.md` | Plugin architecture deep dive | Technical |
| `UI_PLUGIN_QUICK_START.md` | 5-minute plugin tutorial | Human-friendly |
| `DYNAMIC_PLUGIN_LOADING_INTEGRATION.md` | Mobile app integration guide | For mobile host developers |
| `PLUGIN_BUNDLE_SERVING_GUIDE.md` | Bundle serving architecture | Architectural |

---

## 🔗 Public API Endpoints (Mobile Relevant)

```bash
# Specifications
GET /spec/mobile-connector          # Functional connector spec
GET /spec/ui-plugins               # UI plugin spec
GET /spec/solution                 # Solution spec (includes ui_plugins, functional_connectors)

# Examples
GET /spec/examples/mobile-connector # Working connector examples
GET /spec/examples/ui-plugin        # Working plugin examples

# Deployment
POST /deploy/solution               # Deploy solution (with mobile sections)

# Runtime
GET /api/solutions/{id}/ui-plugins  # Fetch available plugins
GET /api/ui-plugins/{id}/bundle.js  # Download plugin bundle (Core serves)
```

---

## ✅ Verification Checklist

### What's Documented

- ✅ **Mobile Connectors** — Spec + learning path + interface + bridge APIs
- ✅ **UI Plugins (RN)** — Spec + SDK + template + build pipeline + esbuild config
- ✅ **Solution Spec** — ui_plugins + functional_connectors + mobile limitations
- ✅ **Bundle Serving** — How Core serves bundles, how mobile loads/caches
- ✅ **Plugin Loading** — Three paths (pre-bundled, cached, fresh remote)
- ✅ **Capabilities** — Device permissions (calendar, location, camera, etc.)
- ✅ **Error Handling** — Mobile limitations, fallback patterns
- ✅ **Developer Guides** — Links to complete documentation
- ✅ **Working Examples** — Reference implementations

### What's Clear

- ✅ **Where to start** — /spec/mobile-connector or /spec/ui-plugins
- ✅ **How to build** — Step-by-step guides with code examples
- ✅ **How to deploy** — ateam_build_and_run handles everything
- ✅ **How to test** — Mobile app loads automatically after deploy
- ✅ **What can break** — Mobile limitations clearly documented
- ✅ **How to fix it** — Fallback patterns provided

---

## 🚀 Summary

**The public MCP spec now provides everything needed for developers to:**

1. **Build functional connectors** (background services)
   - Bridge API reference
   - Lifecycle hooks
   - Working examples

2. **Build UI plugins** (React Native)
   - Plugin SDK documentation
   - Component template
   - Complete build pipeline
   - esbuild configuration

3. **Deploy both** together
   - Solution specification
   - Manifest schema
   - Deployment verification

4. **Understand limitations**
   - Mobile-specific constraints
   - mcpProxy limitations
   - Fallback patterns

**All specs are:**
- ✅ Complete with examples
- ✅ Up-to-date with current implementation
- ✅ Accessible via public HTTP endpoints
- ✅ No authentication required
- ✅ Linked to implementation guides
- ✅ Clear on limitations and workarounds

**Developers can now:**
- Read spec → Study example → Build → Deploy → Test
- All without needing to contact anyone or read scattered docs
- Everything in one consistent public API

---

## 🎓 Learning Path for External Developers

```
1. GET /spec/mobile-connector
   ↓
2. GET /spec/examples/mobile-connector
   ↓
3. Read MOBILE_CONNECTOR_DEVELOPER_GUIDE.md
   ↓
4. Build and publish connector to npm
   ↓
5. GET /spec/ui-plugins
   ↓
6. GET /spec/examples/ui-plugin
   ↓
7. Read REACT_NATIVE_UI_PLUGINS_ARCHITECTURE.md
   ↓
8. Build React Native component with SDK
   ↓
9. GET /spec/solution
   ↓
10. Add ui_plugins and functional_connectors to solution.json
    ↓
11. POST /deploy/solution (ateam_build_and_run)
    ↓
12. Test in mobile app
    ↓
13. Done! 🎉
```

---

**Status: COMPLETE & READY FOR EXTERNAL DEVELOPMENT** ✅
