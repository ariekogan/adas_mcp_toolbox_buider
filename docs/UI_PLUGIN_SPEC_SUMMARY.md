# UI Plugin Specification Summary for AI Agents

**Date:** March 2026
**Status:** Complete and ready for AI agent use

> This document summarizes everything an AI agent needs to know to build UI plugins using the public A-Team MCP.

---

## What's Available via the Public API

### 1. **Complete Specification** (`GET /spec/solution`)

The solution specification now includes a full `ui_plugins` schema covering:

```javascript
ui_plugins: {
  type: 'array',
  // Fields:
  // - id: "mcp:<connector-id>:<plugin-name>"
  // - name: Display name
  // - version: Semantic version (X.Y.Z)
  // - render: Polymorphic (iframe | react-native | adaptive)
  // - capabilities: Native features (haptics, camera, location, storage, notifications)
  // - channels: Communication channels
  // - commands: Virtual tools visible to AI planner
}
```

**Key Concept:** Plugins can render on **three modes**:
- `iframe` — Web-only, HTML+JavaScript, uses postMessage protocol
- `react-native` — Mobile-only, TypeScript component, uses Plugin SDK
- `adaptive` — Both platforms, declare both configs

### 2. **Working Examples** (NEW)

#### **Web/Iframe Plugin** (`GET /spec/examples/ui-plugin-iframe`)
- Complete HTML+JavaScript task board example
- Demonstrates postMessage protocol for tool calling
- Shows error handling, loading states, and UI rendering
- **Ready to copy and customize**

#### **Mobile/Native Plugin** (`GET /spec/examples/ui-plugin-native`)
- Complete React Native TypeScript example
- Shows PluginSDK.register() pattern
- Demonstrates useApi(bridge).call() for tool invocation
- Includes haptic feedback, theme integration, error handling
- **Ready to copy and customize**

### 3. **Complete Documentation** (Git-hosted)

All documentation is in `/docs/` of this repository:

| Document | Purpose | Audience |
|----------|---------|----------|
| `UI_PLUGIN_MANIFEST_SCHEMA.md` | Validation rules, patterns, error messages | Validators, spec readers |
| `UI_PLUGIN_DEVELOPMENT_GUIDE.md` | Step-by-step build tutorial | Developers building plugins |
| `PLUGIN_SDK_API_REFERENCE.md` | Complete API reference (mobile) | Mobile plugin developers |
| `UI_PLUGIN_DEPLOYMENT_TROUBLESHOOTING.md` | Common errors and fixes | Troubleshooters |
| `examples/simple-iframe-plugin.html` | Minimal iframe example | Quick-start learners |
| `examples/simple-native-plugin.tsx` | Minimal native example | Quick-start learners |

---

## Unified API Layer (The Critical Feature)

**The key innovation:** Both iframe and native plugins use **exactly the same API** to call connector tools.

### Web Plugins (postMessage)
```javascript
// Send tool call
window.parent.postMessage({
  source: 'adas-plugin',
  pluginId: 'mcp:connector:plugin',
  message: {
    type: 'tool.call',
    toolName: 'connector.tool',
    args: { param: 'value' },
    correlationId: 'req_abc123'
  }
}, '*');

// Receive response
window.addEventListener('message', (event) => {
  if (event.data.source === 'adas-host' &&
      event.data.message.type === 'tool.response') {
    const { result, error } = event.data.message.payload;
  }
});
```

### Mobile Plugins (Plugin SDK)
```typescript
const api = useApi(bridge);
try {
  const result = await api.call('connector.tool', { param: 'value' });
  // Result is auto-unwrapped (no MCP envelope)
} catch (err) {
  // Error handling
}
```

**Result:** The same connector tool works identically from both platforms — no platform-specific API differences, no translation layers needed.

---

## How AI Agents Should Use This

### Phase 1: Learn the Schema
```
GET /spec/solution
→ Read solution.ui_plugins schema
→ Review model.ui_plugins key_concepts
```

### Phase 2: Study Working Examples
```
GET /spec/examples/ui-plugin-iframe
GET /spec/examples/ui-plugin-native
→ Copy HTML or TypeScript source
→ Understand manifest structure
→ Note error handling patterns
```

### Phase 3: Build and Validate
```
POST /validate/solution
→ Check manifest against ui_plugins schema
→ Fix validation errors
→ Verify file paths (ui-dist/... for iframe)
→ Confirm component registration (native)
```

### Phase 4: Deploy
```
POST /deploy/solution
→ Include plugin files in mcp_store
→ Platform auto-serves at /mcp-ui/...
→ Plugins become available in UI/mobile app
```

---

## Reference URLs

Once deployed to production, these endpoints are available:

```
GET /spec/solution                    — Read full solution spec with ui_plugins schema
GET /spec/examples                    — Index of examples
GET /spec/examples/ui-plugin-iframe   — Working iframe example + source
GET /spec/examples/ui-plugin-native   — Working native example + source
```

---

## Next Steps for Agents

1. **Build your first plugin** using the examples as templates
2. **Test locally** by running the iframe in a browser or native component in dev environment
3. **Validate** using POST /validate/solution before deploying
4. **Deploy** with POST /deploy/solution
5. **Monitor** using GET /deploy/solutions/{id}/health to confirm plugins are discovered

---

## Key Constraints to Remember

✅ **Iframe plugins must:**
- Have `render.iframeUrl` pointing to HTML file in `ui-dist/{pluginId}/{version}/index.html`
- Listen for `message.source === 'adas-host'` and `message.type === 'init'`
- Call tools via `window.parent.postMessage()` with correlationId for response matching
- Handle 15-second timeout on tool calls

✅ **Native plugins must:**
- Register with `PluginSDK.register(componentName, { Component })`
- Accept `PluginProps` with `{ bridge, native, theme }`
- Use `const api = useApi(bridge)` for all tool calls
- Always wrap api.call() in try/catch
- Use theme tokens from `theme` object for styling

✅ **Manifest validation:**
- `id` format: `mcp:<connector-id>:<plugin-name>` (lowercase, hyphens only)
- `version` format: Semantic version X.Y.Z (numeric only)
- `render.mode` must be one of: `iframe`, `react-native`, `adaptive`
- For adaptive: must include BOTH `iframe` and `reactNative` configs

---

## Support & Documentation

- **Manifest validation errors** → See `UI_PLUGIN_MANIFEST_SCHEMA.md` for specific error messages and solutions
- **Deployment issues** → See `UI_PLUGIN_DEPLOYMENT_TROUBLESHOOTING.md` for common problems and fixes
- **API reference** → See `PLUGIN_SDK_API_REFERENCE.md` for complete mobile SDK documentation
- **Step-by-step tutorial** → See `UI_PLUGIN_DEVELOPMENT_GUIDE.md` for full walkthrough

All documents are available at: https://github.com/ariekogan/adas_mcp_toolbox_builder/tree/main/docs/
