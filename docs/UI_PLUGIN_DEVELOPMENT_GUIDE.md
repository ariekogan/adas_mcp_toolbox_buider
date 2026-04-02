# UI Plugin Development Guide

**Status:** Active
**Date:** March 2026

> This guide teaches you how to build UI plugins for A-Team solutions. Plugins are interactive components that run on the user's device (web or mobile) and communicate with backend connectors via a unified API.

---

## Quick Start

### For Web (iframe) Plugins
```html
<!-- index.html — single HTML file -->
<div id="app"></div>
<script>
  // 1. Listen for init message from host
  window.addEventListener('message', async (e) => {
    if (e.data.message?.type === 'init') {
      const { connectorId, pluginId } = e.data.message.payload;
      console.log('Plugin initialized:', pluginId);

      // 2. Call a connector tool
      const result = await callConnectorTool('my-tool', { arg: 'value' });
      console.log('Tool result:', result);
    }
  });

  // Helper to call connector tools
  async function callConnectorTool(toolName, args) {
    return new Promise((resolve) => {
      const correlationId = Math.random().toString(36);
      window.addEventListener('message', (e) => {
        if (e.data.message?.correlationId === correlationId) {
          resolve(e.data.message.payload);
        }
      }, { once: true });

      window.parent.postMessage({
        source: 'adas-plugin',
        message: { type: 'tool.call', toolName, args, correlationId }
      }, '*');
    });
  }
</script>
```

### For Native Mobile (React Native) Plugins
```typescript
// plugin.tsx — single TypeScript/JSX file
import { PluginSDK, useApi } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

export default PluginSDK.register('my-plugin', {
  type: 'ui',
  capabilities: { haptics: true },

  Component({ bridge, theme }: PluginProps) {
    const api = useApi(bridge);
    const [data, setData] = useState(null);

    useEffect(() => {
      // Call connector tool via unified API
      api.call('my-tool', { arg: 'value' }).then(setData);
    }, []);

    return (
      <View>
        <Text>Result: {JSON.stringify(data)}</Text>
      </View>
    );
  }
});
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  A-Team Solution (your skill/connector)              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Backend: MCP Connector                              │
│  ├─ tools: [my-tool, another-tool, ...]             │
│  └─ ui.listPlugins: [] (register your plugins)       │
│                                                      │
│  Frontend: UI Plugins (choose one or both)           │
│  ├─ Web: plugin/index.html (iframe)                  │
│  └─ Native: plugin.plugin.tsx (React Native)         │
│                                                      │
└──────────────────────────────────────────────────────┘
         ↓ Unified API ↓
    Call connector tools identically from both
```

**Key insight:** Both iframe and native plugins use the same bridge protocol to call connector tools. The difference is transport:
- **Iframe plugins:** postMessage serialization (async request/response)
- **Native plugins:** Direct function calls (sync or async)

---

## 1. Iframe-Based Plugins (Web)

### 1.1 Manifest Contract

Your connector's `ui.listPlugins` tool must return:

```json
{
  "plugins": [
    {
      "id": "mcp:my-connector:my-dashboard",
      "name": "My Dashboard",
      "version": "1.0.0",
      "description": "A cool dashboard",
      "render": {
        "mode": "iframe",
        "iframeUrl": "/ui/my-dashboard/1.0.0/index.html"
      }
    }
  ]
}
```

**Required fields:**
- `id` — Full plugin ID (format: `mcp:<connectorId>:<pluginName>`)
- `name` — Display name
- `render.mode` — Must be `"iframe"`
- `render.iframeUrl` — Relative path served from connector's `ui-dist/`

### 1.2 File Structure

```
my-connector/
├─ server.py              # MCP server (defines tools)
├─ ui-dist/               # → Deployed to /mcp-ui/<tenant>/<connectorId>/
│  └─ my-dashboard/
│     └─ 1.0.0/
│        ├─ index.html    # Your plugin UI
│        ├─ styles.css
│        └─ script.js
└─ mcp_store/             # When you deploy via ateam_build_and_run
   ├─ server.js
   └─ ui-dist/...
```

### 1.3 Plugin Lifecycle: postMessage Protocol

**Step 1: Host initializes plugin after iframe loads**

```javascript
// Host sends → Plugin receives
window.postMessage({
  source: 'adas-host',
  pluginId: 'mcp:my-connector:my-dashboard',
  message: {
    type: 'init',
    payload: {
      slug: 'my-skill',
      connectorId: 'my-connector',
      mcpEndpoint: null
    }
  }
}, '*');
```

**Step 2: Plugin listens and calls tools**

```javascript
window.addEventListener('message', (event) => {
  const { source, message } = event.data;

  if (source === 'adas-host' && message.type === 'init') {
    console.log('Initialize with:', message.payload);

    // Now call a tool
    callTool('fetch-tasks', { status: 'open' });
  }
});

function callTool(toolName, args) {
  const correlationId = `req_${Date.now()}`;

  // Set up listener for response
  window.addEventListener('message', (event) => {
    if (event.data.message?.correlationId === correlationId) {
      const result = event.data.message.payload;
      console.log(`Tool "${toolName}" returned:`, result);
    }
  }, { once: true });

  // Send request
  window.parent.postMessage({
    source: 'adas-plugin',
    pluginId: 'mcp:my-connector:my-dashboard',
    message: {
      type: 'tool.call',
      toolName,
      args,
      correlationId,
      timeout: 30000  // 30 seconds
    }
  }, '*');
}
```

**Step 3: Host bridges call to connector tool**

```
Plugin iframe                Host window              MCP Connector
  │                            │                          │
  ├─ postMessage(tool.call) ──→ │                          │
  │                            ├─ MCP call(toolName) ──→  │
  │                            │ ← tool result             │
  │  ← postMessage(response) ──│                          │
  │                            │                          │
```

### 1.4 Complete Example: Simple Task Dashboard

```html
<!DOCTYPE html>
<html>
<head>
  <title>Task Dashboard</title>
  <style>
    body { font-family: system-ui; padding: 20px; }
    .card { border: 1px solid #ddd; padding: 12px; margin: 8px 0; }
    .loading { color: #666; }
    .error { color: #d00; }
  </style>
</head>
<body>
  <h1>My Tasks</h1>
  <div id="app"><p class="loading">Loading...</p></div>

  <script>
    class PluginApp {
      constructor() {
        this.pluginId = null;
        this.connectorId = null;
        this.pendingRequests = new Map();
        this.setupListeners();
      }

      setupListeners() {
        window.addEventListener('message', (e) => {
          const { source, message } = e.data || {};

          if (source === 'adas-host' && message?.type === 'init') {
            this.onInit(message.payload);
          } else if (source === 'adas-host' && message?.type === 'tool.response') {
            this.onToolResponse(message.payload);
          }
        });
      }

      onInit(payload) {
        this.pluginId = payload.pluginId;
        this.connectorId = payload.connectorId;
        console.log('Plugin ready:', this.pluginId);
        this.loadTasks();
      }

      async loadTasks() {
        const result = await this.callTool('tasks.list', { filter: 'open' });
        this.renderTasks(result.tasks || []);
      }

      callTool(toolName, args) {
        return new Promise((resolve, reject) => {
          const correlationId = `req_${Math.random().toString(36).slice(2)}`;

          this.pendingRequests.set(correlationId, { resolve, reject });

          const timeout = setTimeout(() => {
            this.pendingRequests.delete(correlationId);
            reject(new Error(`Tool "${toolName}" timed out`));
          }, 15000);

          window.parent.postMessage({
            source: 'adas-plugin',
            pluginId: this.pluginId,
            message: {
              type: 'tool.call',
              toolName,
              args,
              correlationId
            }
          }, '*');
        });
      }

      onToolResponse(payload) {
        const { correlationId, result, error } = payload;
        const request = this.pendingRequests.get(correlationId);

        if (!request) return;
        this.pendingRequests.delete(correlationId);

        if (error) {
          request.reject(new Error(error));
        } else {
          request.resolve(result);
        }
      }

      renderTasks(tasks) {
        const app = document.getElementById('app');

        if (tasks.length === 0) {
          app.innerHTML = '<p>No tasks</p>';
          return;
        }

        app.innerHTML = tasks.map(task => `
          <div class="card">
            <h3>${task.title}</h3>
            <p>${task.description}</p>
            <small>Status: ${task.status} | Assignee: ${task.assignee || 'Unassigned'}</small>
          </div>
        `).join('');
      }
    }

    // Initialize when page loads
    window.addEventListener('DOMContentLoaded', () => new PluginApp());
  </script>
</body>
</html>
```

---

## 2. Native Mobile Plugins (React Native)

### 2.1 Manifest Contract

Your connector's `ui.listPlugins` tool must return native plugins as:

```json
{
  "plugins": [
    {
      "id": "mcp:my-connector:my-dashboard",
      "name": "My Dashboard",
      "version": "1.0.0",
      "type": "ui",
      "render": {
        "mode": "react-native",
        "component": "DevTeamDashboard"
      }
    }
  ]
}
```

**Required fields:**
- `id`, `name`, `version` — Same as iframe plugins
- `render.mode` — Must be `"react-native"`
- `render.component` — The React component name (must be registered)

### 2.2 File Structure

```
ateam-mobile/
└─ src/plugins/
   └─ my-plugin/
      ├─ index.tsx          # Plugin component (default export)
      ├─ types.ts           # Custom types
      └─ ...other files
```

### 2.3 Plugin Registration & API

```typescript
import { PluginSDK, useApi } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

export default PluginSDK.register('my-plugin', {
  // Metadata
  type: 'ui',  // 'ui', 'service', or 'hybrid'
  description: 'My cool plugin',
  version: '1.0.0',

  // Native capabilities requested
  capabilities: {
    haptics: true,
    camera: false,  // Set true if you use camera
    location: false // Set true if you use GPS
  },

  // The component itself
  Component({ bridge, native, theme }: PluginProps) {
    const api = useApi(bridge);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      loadData();
    }, []);

    async function loadData() {
      try {
        // Call connector tool via unified API
        const result = await api.call('tasks.list', {
          filter: 'open'
        });
        setData(result);
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }

    if (loading) {
      return <ActivityIndicator />;
    }

    return (
      <View>
        <Text>Tasks: {JSON.stringify(data)}</Text>
      </View>
    );
  }
});
```

### 2.4 Plugin SDK API Reference

#### `useApi(bridge)` Hook

```typescript
const api = useApi(bridge);

// Call a connector tool
const result = await api.call(toolName, args);

// Example: fetch tasks
const tasks = await api.call('tasks.list', {
  status: 'open',
  limit: 20
});

// Result is auto-unwrapped (no need to parse MCP response format)
console.log(tasks); // → { tasks: [...], total: 100 }
```

#### `bridge.mcpToolCall(toolName, args)`

Lower-level API (usually not needed):

```typescript
const result = await bridge.mcpToolCall('tasks.list', { status: 'open' });
```

#### `native.haptics` & `native.notifications`

Access to native device capabilities:

```typescript
import * as Haptics from 'expo-haptics';

// Haptic feedback
native.haptics.selection(); // Light tap
native.haptics.success();   // Success buzz
native.haptics.warning();   // Warning vibration
native.haptics.error();     // Error buzz
```

#### `theme` Tokens

Access design system:

```typescript
const { colors, fontSize, borderRadius } = theme;

<Text style={{ color: colors.text, fontSize: fontSize.lg }}>Title</Text>
```

### 2.5 Complete Example: Task Dashboard Native Plugin

See `/Users/arie/Projects/ateam-mobile/src/plugins/devteam-dashboard/index.tsx` for a full production example with:
- Horizontal kanban board (5 columns)
- Nested scrolling (horizontal + vertical)
- Task detail modal
- Markdown content rendering
- Pull-to-refresh
- Theme integration
- Haptic feedback

Key patterns from that plugin:

```typescript
// 1. Always use useApi() for calling connector tools
const api = useApi(bridge);

// 2. Initialize data on mount
useEffect(() => {
  fetchData();
}, []);

// 3. Handle loading/error states
if (loading) return <ActivityIndicator />;
if (error) return <ErrorView message={error} />;

// 4. Use theme tokens for styling
const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border
  }
});

// 5. Provide pull-to-refresh
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => fetchData(true)}
    />
  }
>
  ...
</ScrollView>
```

---

## 3. How Plugins Get Data From Connectors

### 3.1 Connector Tools

A connector defines tools that plugins call:

```python
# server.py (Python MCP)
@server.call_tool()
async def tasks_list(status: str = "all"):
    """Fetch tasks filtered by status"""
    tasks = db.query(Task).filter(Task.status == status).all()
    return { "tasks": tasks, "total": len(tasks) }

@server.call_tool()
async def tasks_get(task_id: str):
    """Get a specific task by ID"""
    task = db.query(Task).filter(Task.id == task_id).one()
    return task.__dict__
```

### 3.2 Exposing Tools to Plugins

The connector must implement `ui.listPlugins()`:

```python
@server.call_tool()
async def ui_listPlugins():
    """List available UI plugins"""
    return {
      "plugins": [
        {
          "id": "mcp:my-connector:my-dashboard",
          "name": "My Dashboard",
          "version": "1.0.0",
          "render": {
            "mode": "react-native",
            "component": "MyPlugin"
          }
        }
      ]
    }
```

### 3.3 Tool Calling Flow

**From iframe plugin:**
```javascript
// Plugin sends postMessage
window.parent.postMessage({
  source: 'adas-plugin',
  message: {
    type: 'tool.call',
    toolName: 'tasks.list',
    args: { status: 'open' },
    correlationId: 'req_123'
  }
}, '*');

// Host receives, calls connector
// MCP Connector executes tasks_list(status='open')
// Host sends response back via postMessage
```

**From React Native plugin:**
```typescript
const api = useApi(bridge);
const result = await api.call('tasks.list', { status: 'open' });

// Internally:
// - bridge.mcpToolCall() → adas-mcp HTTP API
// - adas-mcp forwards to connector
// - Connector executes tasks_list(status='open')
// - Result returned to plugin
```

**The key:** Both use the same tools. Same API, different transport.

---

## 4. Deployment & Validation

### 4.1 Deploy a Plugin (via public ateam MCP)

```bash
# 1. Build your connector with plugins
# Include ui-dist files for iframe plugins, or register React Native components

# 2. Deploy the solution
curl -X POST http://localhost:4311/deploy/solution \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "solution": { ... },
    "skills": [ ... ],
    "connectors": [ ... ]
  }'

# 3. Verify plugins deployed
curl http://localhost:4311/deploy/solutions/:id/connectors/health
# Check the `ui_plugins` field to see what was discovered
```

### 4.2 Validation Rules

**Iframe plugins:**
- `render.iframeUrl` must exist in `ui-dist/` folder
- Must serve on path `/mcp-ui/{tenant}/{connectorId}/{path}`
- HTML file cannot exceed 10MB

**Native plugins:**
- `render.component` must match a registered React Native component
- Component must implement `PluginSDK.register()`
- Must use `PluginProps` types from plugin-sdk

**Both:**
- `id` must follow `mcp:<connectorId>:<pluginName>` format
- `ui.listPlugins` must return `{ plugins: [...] }` (wrapped object)
- If `ui.getPlugin` is called, must return full manifest

### 4.3 Common Deployment Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `render.iframeUrl not found in ui-dist/` | Missing HTML file | Add file to `ui-dist/{pluginId}/index.html` |
| `ui.listPlugins not returning { plugins: [...] }` | Wrong response shape | Return `{ plugins: [{ id, name, render, ... }] }` not bare array |
| `render.component "MyPlugin" not registered` | Component not in registry | Call `PluginSDK.register('my-plugin', { Component })` |
| `Tool timeout calling connector` | Connector tool hangs | Check connector server logs; add timeout handling in tool |
| `Plugin manifest missing required field "id"` | Incomplete manifest | All plugins must have `id`, `name`, `version`, `render` |

---

## 5. Best Practices

### Data Fetching
- **Always** use `useApi()` from plugin-sdk (never make direct HTTP calls)
- Wrap in try/catch to handle connector timeouts (15s limit)
- Show loading spinners while fetching
- Cache results when possible

### Error Handling
```typescript
async function loadData() {
  setLoading(true);
  setError(null);
  try {
    const result = await api.call('fetch-data', {});
    setData(result);
  } catch (err) {
    setError(err.message);
    // Log to console for debugging
    console.error('[Plugin] Failed to load data:', err);
  } finally {
    setLoading(false);
  }
}
```

### State Management
- Use component-local `useState` for simple plugins
- For complex state, use `useReducer` or context
- Avoid Redux/Zustand complexity unless necessary

### Styling
- **Web plugins:** Use inline styles or CSS modules
- **Native plugins:** Use React Native `StyleSheet.create()` + theme tokens
- Always use theme colors for consistency

### Performance
- **Native:** Use `React.memo()` for expensive components
- **Web:** Avoid excessive DOM updates; use event delegation
- Both: Debounce rapid API calls (e.g., search, scroll)

---

## 6. Testing Your Plugin

### iframe Plugin (Web)

```html
<!-- Test HTML file locally -->
<script>
  // Simulate host init message
  window.postMessage({
    source: 'adas-host',
    message: {
      type: 'init',
      payload: {
        pluginId: 'mcp:my-connector:my-plugin',
        connectorId: 'my-connector'
      }
    }
  }, '*');

  // Simulate tool response
  setTimeout(() => {
    window.postMessage({
      source: 'adas-host',
      message: {
        type: 'tool.response',
        correlationId: 'req_123',
        result: { tasks: [...] }
      }
    }, '*');
  }, 1000);
</script>
```

### Native Plugin (React Native)

Test in the ateam-mobile app:

```bash
# 1. Start the dev server
cd /Users/arie/Projects/ateam-mobile
npm run ios

# 2. Navigate to your plugin
# (Host app will auto-discover and render it)

# 3. Use React Native debugger to log
console.log('Plugin state:', data);
```

---

## 7. File Checklist

### Iframe Plugin Checklist
- [ ] `ui-dist/{pluginId}/index.html` exists
- [ ] HTML file is < 10MB
- [ ] Plugin listens for `init` message
- [ ] Plugin calls tools via postMessage
- [ ] `ui.listPlugins` returns correct manifest
- [ ] `render.iframeUrl` matches actual file path

### Native Plugin Checklist
- [ ] Component file: `src/plugins/{name}/index.tsx`
- [ ] Calls `PluginSDK.register(pluginId, { Component })`
- [ ] Component accepts `PluginProps` parameter
- [ ] Uses `useApi(bridge)` to call connector tools
- [ ] Handles loading/error states
- [ ] Uses theme tokens for styling
- [ ] `ui.listPlugins` returns correct manifest
- [ ] `render.component` matches registered name

---

## See Also

- `docs/PLUGIN_PROTOCOL_SPEC.md` — Detailed postMessage protocol
- `docs/RFC-native-mobile-plugins.md` — Architecture & design decisions
- `apps/mcp-server/plugins-ui/src/shared/adas-plugin-sdk.js` — Web SDK source
- `ateam-mobile/src/plugin-sdk/` — Native SDK source
- `/Users/arie/Projects/ai-dev-team/` — Example solution with both plugin types
