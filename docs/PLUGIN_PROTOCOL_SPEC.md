# ADAS Plugin Protocol Specification

**Date:** February 2026
**Status:** Active

> This document is the authoritative reference for building UI plugins that communicate
> with the ADAS host. It covers the postMessage protocol, the iframe URL convention,
> and the tool naming bridge between MCP servers and ADAS skills.

---

## 1. Plugin postMessage Protocol

Plugins run inside sandboxed iframes (`allow-scripts allow-same-origin`).
All communication between the host application and the plugin iframe happens via
`window.postMessage`. There are **no direct function calls** between host and plugin.

### 1.1 Message Envelope

Every message in both directions uses this envelope:

```
{
  source: "adas-host" | "adas-plugin",
  pluginId: "<plugin-id>",
  message: {
    type: "<message-type>",
    payload: { ... }
  }
}
```

- `source` — identifies the sender. The host always sends `"adas-host"`, plugins always send `"adas-plugin"`.
- `pluginId` — the full plugin identifier (e.g., `"mcp:fleet-mcp:fleet-dashboard"`).
- `message.type` — the message type (see sections below).
- `message.payload` — type-specific payload.

### 1.2 Host → Plugin Messages

#### `init`

Sent by the host after the iframe loads. Contains context for the plugin to initialize.

```json
{
  "source": "adas-host",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "init",
    "payload": {
      "slug": "fleet-command",
      "skillSlug": "fleet-command",
      "connectorId": "fleet-mcp",
      "mcpEndpoint": null
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Current skill slug |
| `skillSlug` | string\|null | Same as slug (legacy compat) |
| `connectorId` | string\|null | The MCP connector this plugin belongs to |
| `mcpEndpoint` | string\|null | Direct MCP endpoint URL (if HTTP transport) |

**Timing:** The host sends `init` immediately on iframe load, then retries at 150ms and 500ms
to handle the race condition where the iframe's JS hasn't mounted its message listener yet.

#### `plugin.command`

A semantic command dispatched from the ADAS agent (via the backend) to the plugin.
The plugin must execute the command and return a result.

```json
{
  "source": "adas-host",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "plugin.command",
    "payload": {
      "command": "highlight_vehicle",
      "args": { "vehicle_id": "VH-003" },
      "correlationId": "pcmd_a1b2c3d4e5f6"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Command name (must match a registered handler) |
| `args` | object | Arguments for the command |
| `correlationId` | string | Unique ID — must be echoed back in the result |

**Timeout:** The backend waits 15 seconds for a result (configurable via `PLUGIN_TOOL_TIMEOUT_MS`).
If no result arrives, the agent receives `{ ok: false, error: "Plugin command timeout..." }`.

#### `job-started`

Informational — notifies the plugin that a new job was started for the current skill.

```json
{
  "source": "adas-host",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "job-started",
    "payload": {
      "jobId": "job_abc123",
      "skillSlug": "fleet-command",
      "goal": "Where is VH-005?",
      "timestamp": "2026-02-15T10:30:00.000Z"
    }
  }
}
```

### 1.3 Plugin → Host Messages

#### `plugin.command.result`

Response to a `plugin.command`. Must include the original `correlationId`.

```json
{
  "source": "adas-plugin",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "plugin.command.result",
    "payload": {
      "correlationId": "pcmd_a1b2c3d4e5f6",
      "result": { "ok": true, "vehicle_id": "VH-003", "highlighted": true },
      "error": null
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `correlationId` | string | Must match the incoming command's correlationId |
| `result` | object\|null | Success payload (null on error) |
| `error` | string\|null | Error message (null on success) |

#### `plugin.event`

Semantic event emitted by the plugin (informational in Tier-0, will be routed to agent in Tier-1).

```json
{
  "source": "adas-plugin",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "plugin.event",
    "payload": {
      "event": "vehicle_selected",
      "data": { "vehicle_id": "VH-003" }
    }
  }
}
```

#### `plugin.ready`

Signals that the plugin has mounted and is ready to receive messages.

```json
{
  "source": "adas-plugin",
  "pluginId": "mcp:fleet-mcp:fleet-dashboard",
  "message": {
    "type": "plugin.ready",
    "payload": { "pluginId": "mcp:fleet-mcp:fleet-dashboard" }
  }
}
```

### 1.4 MCP Proxy (Plugin → Connector)

Plugins can call MCP tools on their parent connector via a proxy mechanism:

**Request (plugin → host):**
```json
{
  "source": "adas-plugin",
  "action": "mcp-call",
  "payload": {
    "requestId": "req_123",
    "toolName": "cp.fe_api",
    "args": {
      "params": {
        "connectorId": "fleet-mcp",
        "tool": "vehicle.get",
        "args": { "vehicle_id": "VH-003" }
      }
    }
  }
}
```

**Response (host → plugin):**
```json
{
  "source": "adas-host",
  "message": {
    "type": "mcp-result",
    "payload": {
      "requestId": "req_123",
      "result": { "vehicle_id": "VH-003", "status": "active" },
      "error": null
    }
  }
}
```

### 1.5 End-to-End Command Flow

```
1. Backend pluginTools.js creates virtual tool (e.g., ui.fleet_dash.highlight_vehicle)
2. Skill agent calls the virtual tool during execution
3. pluginTools.js → emitPluginCommand(jobId, payload) → SSE to frontend
4. ChatLayout.jsx receives SSE → dispatches CustomEvent "adas-plugin-command"
5. PluginHost.jsx receives CustomEvent → postMessage to iframe
6. Iframe message handler → executes command → postMessage result back
7. PluginHost.jsx receives result → POST /api/plugin-command-result
8. Backend pluginCommandPending.js resolves the Promise
9. Virtual tool returns result to skill agent
```

### 1.6 Using the SDK

The recommended way to integrate is via `adas-plugin-sdk.js`:

```javascript
import { registerCommand, emitEvent, onInit } from "./adas-plugin-sdk.js";

// Called when the host sends the init message
onInit((payload) => {
  console.log("Plugin initialized:", payload.skillSlug);
});

// Register a command handler
registerCommand("highlight_vehicle", async (args) => {
  // args.vehicle_id is available
  highlightOnMap(args.vehicle_id);
  return { ok: true, highlighted: true };
});

// Emit a semantic event
emitEvent("vehicle_selected", { vehicle_id: "VH-003" });
```

**SDK exports:**
| Function | Signature | Description |
|----------|-----------|-------------|
| `registerCommand` | `(name, handler) → void` | Register a command handler (sync or async) |
| `emitEvent` | `(eventName, data) → void` | Emit a semantic event to the host |
| `onInit` | `(callback) → void` | Register an init callback |
| `getPluginId` | `() → string\|null` | Get the current plugin ID (set after init) |

---

## 2. iframeUrl Path Mapping Convention

There is a three-way mapping between the URL the MCP server declares, the files in
`mcp-store`, and the URL the browser loads. This must be exact — any mismatch results
in a blank iframe with no error.

### 2.1 The Three Layers

| Layer | Format | Example |
|-------|--------|---------|
| **MCP server declares** | `/<pluginId>/<version>/index.html` (NO prefix) | `/fleet-dashboard/0.1.0/index.html` |
| **mcp-store files** | `ui-dist/<pluginId>/<version>/*` | `mcp-store/fleet-mcp/ui-dist/fleet-dashboard/0.1.0/index.html` |
| **Browser loads** | `/mcp-ui/<connectorId>/<pluginId>/<version>/index.html` | `/mcp-ui/fleet-mcp/fleet-dashboard/0.1.0/index.html` |

### 2.2 How It Works

1. The MCP server's `ui.getPlugin` tool returns `iframeUrl: "/fleet-dashboard/0.1.0/index.html"`.
2. The backend `cp.getContextPlugin` prepends `/mcp-ui/<connectorId>/` to produce the final URL.
3. The backend route `GET /mcp-ui/:connectorId/*` serves static files from the tenant's `mcp-store/<connectorId>/ui-dist/*` directory.

### 2.3 Checklist

When deploying a UI plugin, verify:

- [ ] MCP server `ui.getPlugin` returns `iframeUrl` **without** the `/mcp-ui/<connectorId>/` prefix
- [ ] Files exist at `mcp-store/<connectorId>/ui-dist/<pluginId>/<version>/index.html`
- [ ] `index.html` references JS/CSS assets with **relative paths** (e.g., `./main.js`, not `/main.js`)
- [ ] The connector is started and in `"connected"` status

### 2.4 Plugin ID Format

Full plugin IDs follow the pattern: `mcp:<connectorId>:<pluginId>`

Example: `mcp:fleet-mcp:fleet-dashboard`

- `mcp:` — prefix indicating this is an MCP-based plugin
- `fleet-mcp` — the connector ID
- `fleet-dashboard` — the plugin ID within that connector

---

## 3. Tool Naming: MCP ↔ ADAS Bridge

When a connector exposes MCP tools, those tools become available to the ADAS skill agent.
The naming follows a specific mapping that developers must understand.

### 3.1 How Tool Names Flow

```
MCP Server (tools/list)     →   ConnectorManager     →   ADAS Agent Prompt
tool.name = "vehicle.get"       stored as-is              tool name = "vehicle.get"
```

**By default, the ADAS-facing tool name equals the raw MCP tool name.**

The connector tools are loaded via `ConnectorManager.getTools()`, and each tool is registered
in the agent's tool map under its original MCP name.

### 3.2 Tool Name Conventions

| Component | Convention | Example |
|-----------|-----------|---------|
| MCP tool name | `<domain>.<action>` | `vehicle.get`, `order.cancel` |
| UI plugin virtual tool | `ui.<shortId>.<command>` | `ui.fleet_dash.highlight_vehicle` |
| Core platform tool | `cp.<name>` | `cp.fe_api`, `cp.listContextPlugins` |
| Skill JS tool | `<name>` | `searchCode`, `readFile` |

### 3.3 Skill YAML Tool Declarations

The skill.yaml `tools[]` section declares which tools the agent can use. For connector tools,
the `name` field must exactly match the MCP tool name:

```yaml
tools:
  - name: vehicle.get          # Must match MCP server's tools/list name
    description: Get vehicle details by ID
    inputs:
      - name: vehicle_id
        type: string
        required: true

connectors:
  - id: fleet-mcp              # Connector that provides the tool
    type: custom
    tools:
      - name: vehicle.get      # Same name as above
        description: Get vehicle details
```

### 3.4 Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| MCP tool name `vehicle.get` but skill YAML declares `fleet.vehicle.get` | Agent sees the tool but calls fail silently | Use the exact MCP tool name |
| Connector ID mismatch between skill YAML and deployed connector | `tools: 0` in connector status | Verify IDs match exactly |
| Tool registered in MCP but not declared in skill YAML `tools[]` | Agent doesn't know about the tool | Add it to the tools section |

### 3.5 Debugging Tool Resolution

1. Check connector tools: `GET /api/connectors/<id>/tools` — lists raw MCP tool names
2. Check agent's tool map: look at the planner's `available_tools` in job state
3. Compare: the names must match exactly (case-sensitive, dot-delimited)

---

## References

- SDK source: `apps/mcp-server/plugins-ui/src/shared/adas-plugin-sdk.js`
- PluginHost: `apps/frontend/src/context/PluginHost.jsx`
- Virtual tool factory: `apps/backend/tools/impl/ui/pluginTools.js`
- Command pending store: `apps/backend/tools/impl/ui/pluginCommandPending.js`
- Connector tool loading: `apps/backend/tools/impl/runtimeMap.js`
- Backend MCP-UI route: `apps/backend/routes/mcpStore.js`
