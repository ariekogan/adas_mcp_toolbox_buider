# UI Plugin Deployment Troubleshooting Guide

**Status:** Active
**Date:** March 2026

> Common issues when deploying UI plugins via the public A-Team MCP and how to fix them.

---

## Quick Checklist Before Deploying

### Iframe Plugins (Web)
- [ ] `ui-dist/{pluginId}/{version}/index.html` file exists
- [ ] File is valid HTML (not empty, not minified beyond readability)
- [ ] File size < 10MB
- [ ] Plugin listens for `message.type === 'init'` from host
- [ ] Plugin calls tools via `postMessage` with correct envelope
- [ ] `ui.listPlugins` returns `{ plugins: [...] }` (NOT bare array)
- [ ] `render.iframeUrl` matches actual file path (e.g., `/ui/my-plugin/1.0.0/index.html`)

### Native Mobile Plugins (React Native)
- [ ] Component file exists: `src/plugins/{name}/index.tsx`
- [ ] Component calls `PluginSDK.register(pluginId, { Component })`
- [ ] Component is exported as default export
- [ ] Component accepts `PluginProps` parameter
- [ ] Component uses `useApi(bridge)` to call tools
- [ ] `ui.listPlugins` returns plugin manifest with correct shape
- [ ] `render.component` matches the registered plugin ID or component name
- [ ] `render.mode === "react-native"`

---

## Common Errors & Fixes

### 1. "render.iframeUrl not found in ui-dist/"

**What it means:** The HTML file you declared in the manifest doesn't exist.

**Check:**
```bash
# Should exist at this path
ls -la _builder/{connectorId}/ui-dist/{pluginId}/{version}/index.html
```

**Fix:**
```python
# In server.py, ui.getPlugin returns:
{
  "render": {
    "mode": "iframe",
    "iframeUrl": "/ui/my-dashboard/1.0.0/index.html"  # ← This path must exist
  }
}

# Create the file:
# _builder/my-connector/ui-dist/my-dashboard/1.0.0/index.html
```

**Deploy command:**
```bash
curl -X POST http://localhost:4311/deploy/solution \
  -H "Content-Type: application/json" \
  -d '{
    "solution": {...},
    "skills": [...],
    "connectors": [{
      "id": "my-connector",
      "mcp_store": [
        { "path": "server.py", "content": "..." },
        { "path": "ui-dist/my-dashboard/1.0.0/index.html", "content": "<!DOCTYPE html>..." }  ← Include here
      ]
    }]
  }'
```

---

### 2. "ui.listPlugins returning a bare array instead of { plugins: [...] }"

**What it means:** Your `ui.listPlugins` tool returns `[...]` but ADAS Core expects `{ plugins: [...] }`.

**Wrong:**
```python
@server.call_tool()
async def ui_listPlugins():
    return [
        { "id": "mcp:my-connector:plugin1", "name": "Plugin 1", ... },
        { "id": "mcp:my-connector:plugin2", "name": "Plugin 2", ... }
    ]
```

**Right:**
```python
@server.call_tool()
async def ui_listPlugins():
    return {
        "plugins": [
            { "id": "mcp:my-connector:plugin1", "name": "Plugin 1", ... },
            { "id": "mcp:my-connector:plugin2", "name": "Plugin 2", ... }
        ]
    }
```

---

### 3. "Plugin manifest missing required field: id"

**What it means:** The manifest returned by `ui.getPlugin` or listed in `ui.listPlugins` is missing the `id` field.

**Check all required fields:**
```python
plugin = {
    "id": "mcp:my-connector:my-plugin",      # ← REQUIRED: mcp:<connector>:<name>
    "name": "My Plugin",                      # ← REQUIRED
    "version": "1.0.0",                       # ← REQUIRED
    "description": "...",                     # Optional
    "render": {                               # ← REQUIRED
        "mode": "iframe",                     # ← REQUIRED: "iframe" or "react-native"
        "iframeUrl": "/ui/my-plugin/1.0.0/index.html"  # ← Required for iframe
        # OR
        "component": "MyPluginComponent"      # ← Required for react-native
    },
    "type": "ui",                             # Optional: 'ui', 'service', 'hybrid'
    "capabilities": {},                       # Optional
    "channels": []                            # Optional
}
```

---

### 4. "render.component 'MyPlugin' not registered"

**What it means:** You declared a React Native plugin but the component isn't registered with `PluginSDK.register()`.

**Check that your plugin component calls:**
```typescript
export default PluginSDK.register('my-plugin', {
  // ↑ This ID must match the one in render.component or ui.listPlugins
  Component({ bridge, native, theme }: PluginProps) {
    // ...
  }
});
```

**Check that it's imported correctly:**
```typescript
// In ateam-mobile/src/plugins/registry.ts
import MyPlugin from './my-plugin/index.tsx';  // ← Must be default export

// Plugin is auto-registered during import ✓
```

---

### 5. "Tool timeout calling connector"

**What it means:** A tool call took longer than 15 seconds to complete.

**Fix:**
1. **Check connector logs** — Is the tool hanging or very slow?
   ```bash
   docker logs skill-builder-backend | grep "my-tool"
   ```

2. **Add timeout handling in connector:**
   ```python
   import asyncio

   @server.call_tool()
   async def my_tool():
       try:
           result = await asyncio.wait_for(fetch_data(), timeout=10)
           return result
       except asyncio.TimeoutError:
           return { "error": "Data fetch timed out. Try again later." }
   ```

3. **Optimize the tool** — Profile and speed up slow queries

4. **In the plugin, show loading state:**
   ```typescript
   const api = useApi(bridge);
   const [loading, setLoading] = useState(false);

   async function loadData() {
     setLoading(true);
     try {
       const result = await api.call('slow-tool', {});
     } catch (err) {
       if (err.message.includes('timeout')) {
         setError('Tool took too long. Please try again.');
       }
     } finally {
       setLoading(false);
     }
   }
   ```

---

### 6. "render.mode must be 'iframe' or 'react-native'"

**What it means:** You used an invalid mode in the manifest.

**Wrong:**
```python
"render": {
    "mode": "webview",  # ← Invalid
    ...
}
```

**Right:**
```python
# For web/iframe:
"render": {
    "mode": "iframe",
    "iframeUrl": "..."
}

# For native mobile:
"render": {
    "mode": "react-native",
    "component": "MyPlugin"
}

# For both (adaptive):
"render": {
    "mode": "adaptive",
    "iframe": { "iframeUrl": "..." },
    "reactNative": { "component": "MyPlugin" }
}
```

---

### 7. "Plugin postMessage listener not responding"

**What it means:** Iframe plugin doesn't respond to `init` message from host.

**Check iframe plugin has listener:**
```javascript
// In your HTML file
window.addEventListener('message', (event) => {
  const { source, message } = event.data;

  if (source === 'adas-host' && message.type === 'init') {
    console.log('✓ Init received!');
    // ... initialize plugin
  }
});

console.log('✓ Listener registered');
```

**Common issue:** Listener is set up AFTER host sends init.
- Host sends init immediately (and retries at 150ms, 500ms)
- Plugin code must set up listener synchronously, before other scripts

**Fix:**
```html
<head>
  <!-- Set up listener FIRST, before anything else -->
  <script>
    window.addEventListener('message', (event) => {
      // ...
    });
  </script>
  <!-- Other scripts after -->
</head>
```

---

### 8. "Connector doesn't have ui.listPlugins tool"

**What it means:** Your connector is marked `ui_capable: true` but doesn't implement `ui.listPlugins`.

**Check connector definition:**
```python
# server.py MUST have these tools:

@server.call_tool()
async def ui_listPlugins():
    """List all UI plugins this connector serves"""
    return {
        "plugins": [
            {
                "id": "mcp:my-connector:my-plugin",
                "name": "My Plugin",
                "version": "1.0.0",
                "render": { "mode": "iframe", "iframeUrl": "..." }
            }
        ]
    }

@server.call_tool()
async def ui_getPlugin(plugin_id: str):
    """Get detailed manifest for a specific plugin"""
    return {
        "id": "mcp:my-connector:my-plugin",
        "name": "My Plugin",
        "version": "1.0.0",
        "render": { "mode": "iframe", "iframeUrl": "..." },
        "capabilities": { ... }
    }
```

**Deploy the connector:**
```bash
curl -X POST http://localhost:4311/deploy/connector \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-connector",
    "ui_capable": true,
    "description": "...",
    "mcp_store": [
      { "path": "server.py", "content": "..." },
      { "path": "ui-dist/...", "content": "..." }
    ]
  }'
```

---

### 9. "Plugin HTML doesn't call tools correctly"

**What it means:** Plugin sends tool calls but they're malformed or don't match the protocol.

**Correct postMessage envelope:**
```javascript
window.parent.postMessage({
  source: 'adas-plugin',  // ← Must be 'adas-plugin'
  pluginId: 'mcp:my-connector:my-plugin',  // ← Full plugin ID
  message: {
    type: 'tool.call',  // ← Must be 'tool.call'
    toolName: 'tasks.list',  // ← Connector tool name
    args: { status: 'open' },  // ← Tool arguments
    correlationId: 'req_abc123'  // ← Unique ID for response matching
  }
}, '*');
```

**Common mistakes:**
```javascript
// WRONG: source is lowercase
window.parent.postMessage({
  source: 'adas-plugin',  // ✓
  message: { type: 'tool.call', ... }
}, '*');

// WRONG: Missing correlationId
message: { type: 'tool.call', toolName, args }  // ✗

// WRONG: toolName doesn't match connector tool
toolName: 'my.tool.that.doesnt.exist'  // ✗

// WRONG: args is not an object
args: "{ status: 'open' }"  // ✗ Use object, not JSON string
```

---

### 10. "Native plugin component throws error"

**What it means:** Your React Native plugin has a runtime error.

**Check console logs:**
```bash
# View React Native app logs
cd /Users/arie/Projects/ateam-mobile
# App logs appear in Xcode/Android Studio console
```

**Common issues:**
```typescript
// WRONG: Trying to call bridge directly
const result = bridge.mcpToolCall('tool', {});  // ✗ Use useApi instead

// RIGHT:
const api = useApi(bridge);
const result = await api.call('tool', {});  // ✓

// WRONG: Not handling errors
const result = await api.call('tool', {});  // ✗ Will throw if tool fails

// RIGHT:
try {
  const result = await api.call('tool', {});
} catch (err) {
  setError(err.message);
}

// WRONG: Using hardcoded colors
<Text style={{ color: '#333' }} />  // ✗

// RIGHT: Use theme tokens
<Text style={{ color: theme.colors.text }} />  // ✓
```

---

## Verification Steps

After deployment, verify UI plugins are working:

### 1. Check plugin discovery

```bash
# List all solutions
curl http://localhost:4311/deploy/solutions

# Get solution health (includes plugin status)
curl http://localhost:4311/deploy/solutions/{solutionId}/health

# Look for "ui_plugins" in the response
```

### 2. Check connector health

```bash
curl http://localhost:4311/deploy/solutions/{solutionId}/connectors/health

# Should show:
# {
#   "health": "ok",
#   "ui_capable": true,
#   "ui_plugins": [
#     { "id": "mcp:...:plugin1", "status": "ok" },
#     { "id": "mcp:...:plugin2", "status": "ok" }
#   ]
# }
```

### 3. Test plugin directly (web only)

```bash
# Navigate to plugin URL in browser
http://localhost:3102/mcp-ui/{tenant}/{connectorId}/{pluginId}/{version}/index.html

# Open browser console
# Should see: "✓ Plugin script loaded. Waiting for host init message..."
```

### 4. View logs

```bash
# Skill Builder logs
docker logs skill-builder-backend

# ADAS Core logs
docker logs backend

# Look for errors mentioning plugins or tools
```

---

## Best Practices

### During Development

1. **Test locally first** — Use the simple examples as a template
2. **Check browser console** (iframe) or Xcode console (native)
3. **Log everything** — Debug logging is your friend
4. **Use mock data** — Don't rely on live connector during UI dev
5. **Validate manifest shape** — Use `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md` as reference

### Before Deploying

1. **Run validation** — `POST /validate/solution` before `POST /deploy/solution`
2. **Check all files** — Ensure `ui-dist/` files are included in `mcp_store`
3. **Test tool calls** — Manually call connector tools to ensure they work
4. **Review error handling** — All tool calls should have try/catch
5. **Check permissions** — Ensure plugins have access to required tools

### After Deploying

1. **Verify health** — `GET /deploy/solutions/{id}/health`
2. **Monitor logs** — Watch for errors in both connector and ADAS Core
3. **Test with real data** — Make sure plugins work with live connector
4. **Get feedback** — Test with real users and iterate

---

## See Also

- `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md` — How to build plugins
- `docs/PLUGIN_SDK_API_REFERENCE.md` — SDK API details
- `docs/PLUGIN_PROTOCOL_SPEC.md` — postMessage protocol (web)
- `docs/RFC-native-mobile-plugins.md` — Architecture & design
