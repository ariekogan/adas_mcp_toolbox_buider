# Connector Deployment Pipeline & UI Plugin Discovery

**Date:** February 2026
**Status:** Active
**Last Updated:** 2026-02-11

---

## 1. Three-Repo Architecture

```
PB (Source)          Skill Builder (Design Time)       ADAS Core (Runtime)
  manifest.json  -->   import / deploy-all         -->   ConnectorManager
  mcp-store/           connectorPayload.js               _startStdio()
  skills/*.yaml        adasConnectorSync.js
```

- **PB** (or any external project): Packages MCPs + skills into a solution pack
- **Skill Builder**: Imports the pack, registers connectors in catalog, deploys to ADAS Core
- **ADAS Core**: Spawns stdio processes, connects to MCPs, discovers tools and UI plugins

---

## 2. Manifest as Source of Truth

The PB manifest declares **what** each connector is. It does NOT know where or how it will be deployed.

```json
{
  "id": "orders-mcp",
  "name": "Orders Management",
  "command": "node",
  "args": ["/mcp-store/orders-mcp/server.js"],
  "transport": "stdio"
}
```

UI-capable connectors include a `ui-dist/` directory with static assets and implement
`ui.listPlugins` / `ui.getPlugin` tools:

```json
{
  "id": "ecommerce-ui-mcp",
  "name": "E-Commerce UI Dashboard",
  "command": "node",
  "args": ["/mcp-store/ecommerce-ui-mcp/server.js"],
  "transport": "stdio"
}
```

Key fields:
- `transport`: `"stdio"` — all solution connectors run as stdio
- `command` + `args`: How to spawn the process
- Docker compose is **fixed infrastructure** — runtime connectors are never added to it

---

## 3. Skill Builder: Clean Passthrough

The Skill Builder passes manifest data through faithfully. No hardcoded filenames, no path reconstruction.

### Shared Utilities (`utils/connectorPayload.js`)

```
isStdioTransport(mcp)     — Transport detection (explicit field wins)
buildCatalogEntry(mcp)    — For Skill Builder's internal connector registry
buildConnectorPayload(mcp) — For syncConnectorToADAS() calls to ADAS Core
```

### Deployment Flow

```
1. POST /api/import (or /api/import/solution-pack)
   - buildCatalogEntry(mcp) -> registerImportedConnector()
   - Stores in Skill Builder catalog

2. POST /api/import/packages/:name/deploy-all
   - Upload MCP code to ADAS Core's /mcp-store (if mcp_store_included)
   - buildConnectorPayload(mcp) -> syncConnectorToADAS()
   - startConnectorInADAS() -> ADAS Core spawns + connects

3. Deploy individual skill (exportDeploy.js)
   - For each linked connector: buildConnectorPayload(connector)
   - syncConnectorToADAS() + startConnectorInADAS()
```

---

## 4. ADAS Core: Connector Startup

### All connectors run as stdio (`_startStdio`)
1. Spawn child process via `command` + `args`
2. JSON-RPC over stdin/stdout
3. `tools/list` → discover tools
4. Set runtime state (status, tools, toolSchemas)

No caching of UI plugin data at startup — discovery is done live (see Section 5).

---

## 5. UI-Capable Skills

A **UI-capable skill** owns a visual dashboard that renders inside the ADAS platform as an iframe. It is backed by a **UI-capable connector** — an MCP that serves both the plugin manifest and the static UI assets.

There are two layers to a UI-capable skill:

1. **Passive rendering** — the dashboard iframe loads and fetches data from sibling MCPs via `postMessage` / `mcpProxy`
2. **Agent-to-plugin commands** — the agent sends semantic commands to the iframe (e.g., "highlight this order") and the iframe executes them

### 5.1 What Makes a Connector UI-Capable

A UI-capable connector:
- Implements `ui.listPlugins` and `ui.getPlugin` MCP tools
- Includes a `ui-dist/` directory with static HTML/JS/CSS assets
- Uses `transport: stdio` (like all solution connectors)

```
/mcp-store/ecommerce-ui-mcp/
├── server.js              ← stdio MCP server (ui.listPlugins, ui.getPlugin)
├── package.json
├── node_modules/
└── ui-dist/               ← static UI assets served by backend
    └── ecom-dashboard/
        └── 0.1.0/
            └── index.html ← the actual dashboard (self-contained HTML+JS)
```

The MCP tools return:

```javascript
// ui.listPlugins — returns available plugins
{ plugins: [{ id, name, version, description }] }

// ui.getPlugin — returns manifest for one plugin
{ id, name, version, render: { mode: "iframe", iframeUrl }, channels: { events, actions } }
```

Plugin IDs use the format `mcp:{connectorId}:{pluginId}` (e.g., `mcp:ecommerce-ui-mcp:ecom-dashboard`).

### 5.2 How the Dashboard Renders (Passive UI)

```
Browser (React)              ADAS Backend                  MCP (stdio)
  |                            |                             |
  |-- TopBar mount ----------->|                             |
  |   listContextPlugins()     |                             |
  |                            |-- callTool(connId,          |
  |                            |   "ui.listPlugins", {}) --->|
  |                            |<-- { plugins: [...] } ------|
  |<-- plugin list ------------|                             |
  |                            |                             |
  |-- user selects plugin ---->|                             |
  |   getContextPlugin(id)     |                             |
  |                            |-- callTool(connId,          |
  |                            |   "ui.getPlugin", {id}) --->|
  |                            |<-- manifest (iframeUrl) ----|
  |                            |                             |
  |                            |-- resolve iframeUrl:        |
  |                            |   /ui/X → /mcp-ui/connId/X |
  |<-- resolved manifest ------|                             |
  |                            |                             |
  |-- <iframe src="/mcp-ui/    |                             |
  |    connId/X/index.html"> ->|                             |
  |                            |-- serves static file from   |
  |                            |   /mcp-store/connId/ui-dist/|
  |<-- HTML/JS/CSS ------------|                             |
  |                            |                             |
  |-- iframe postMessage ----->|                             |
  |   { action: "mcp-call" }   |-- cp.fe_api → mcpProxy --->|
  |                            |   callTool on target MCP    | (orders-mcp, etc.)
  |<-- postMessage result -----|<-- tool result -------------|
```

Key points:
- **`cp.listContextPlugins`** calls `ui.listPlugins` **live** on each connected connector that has the tool (no caching)
- **`cp.getContextPlugin`** calls `ui.getPlugin(id)` on the MCP to get the iframe manifest
- **iframeUrl resolution**: MCP returns relative URL (e.g., `/ui/ecom-dashboard/0.1.0/index.html`), backend resolves to `/mcp-ui/{connectorId}/ecom-dashboard/0.1.0/index.html`
- **Static file serving**: Backend route `GET /mcp-ui/:connectorId/*` serves files from `/mcp-store/:connectorId/ui-dist/*`
- **Iframe ↔ host communication**: via `postMessage` — the iframe sends `mcp-call` actions, PluginHost proxies them to backend `cp.fe_api` → `mcpProxy`, which calls tools on any connector

### 5.3 Agent-to-Plugin Commands

Beyond passive rendering, plugins can declare **capabilities** (commands) that the agent can invoke semantically. This is the "agent talks to the UI" feature.

#### Skill YAML Declaration

The skill declares which plugins it controls:

```yaml
ui_capable: true
ui_plugins:
  - id: "mcp:ecommerce-ui-mcp:ecom-dashboard"
    short_id: ecom_dash
```

#### Plugin Manifest Capabilities

The connector's `ui.getPlugin` tool returns a manifest with `capabilities.commands`:

```javascript
{
  id: "ecom-dashboard",
  capabilities: {
    commands: [
      { name: "highlight_order", description: "Highlight an order row",
        input_schema: { type: "object", properties: { orderId: { type: "string" } } } }
    ]
  }
}
```

#### Virtual Tool Generation

ADAS Core generates Tier-4 virtual tools at runtime:
- `runtimeMap.getToolsForJob()` reads `job.__skill.ui_plugins`
- For each plugin, fetches manifest via `getContextPlugin()`
- For each command, creates a virtual tool: `ui.<short_id>.<command_name>`
- Example: `ui.ecom_dash.highlight_order`

#### Command Flow

```
Agent (runtime)             ADAS Backend              Browser (iframe)
  |                            |                          |
  |-- call virtual tool ------>|                          |
  |   ui.ecom_dash.highlight   |                          |
  |                            |-- SSE: plugin_command -->|
  |                            |   { correlationId,       |
  |                            |     pluginId, command,   |
  |                            |     args }               |
  |                            |                          |-- postMessage
  |                            |                          |   to iframe
  |                            |                          |<- iframe result
  |                            |<- POST /api/plugin-      |
  |                            |   command-result         |
  |<-- tool result ------------|   { correlationId,       |
  |                            |     result }             |
```

#### Plugin SDK (iframe side)

Plugins use `adas-plugin-sdk.js` to register command handlers:

```javascript
import { registerCommand } from './adas-plugin-sdk.js';

registerCommand('highlight_order', async ({ orderId }) => {
  // Highlight the order row in the UI
  document.querySelector(`[data-order="${orderId}"]`)?.classList.add('highlighted');
  return { success: true, orderId };
});
```

### 5.4 Deploy → Runtime Flow

```
skill.yaml                              ADAS Core Runtime
┌──────────────┐                       ┌───────────────────────────────┐
│ ui_capable:  │                       │ loadSkillYaml()               │
│ ui_plugins:  │                       │   ↓                          │
│   - id: ...  │  ──(deploy)──>        │ job.__skill.ui_plugins = [..] │
│     short_id │                       │   ↓                          │
└──────────────┘                       │ getToolsForJob(job)           │
                                        │   ↓ Tier 4                   │
                                        │ getPluginToolsForJob()        │
                                        │   ↓                          │
                                        │ getContextPlugin(pluginId)    │
                                        │   ↓ fetches manifest          │
                                        │ manifest.capabilities.commands│
                                        │   ↓                          │
                                        │ virtual tools generated       │
                                        │   ui.ecom_dash.highlight_order│
                                        └───────────────────────────────┘
```

### 5.5 Key Files

| File | Repo | Purpose |
|------|------|---------|
| `pluginTools.js` | ADAS Core | Generates virtual tools from manifest capabilities |
| `pluginCommandPending.js` | ADAS Core | Manages pending command promises with timeout |
| `runtimeMap.js` (Tier 4) | ADAS Core | Injects plugin tools into `getToolsForJob()` |
| `store.js` | ADAS Core | `emitPluginCommand()` SSE channel |
| `PluginHost.jsx` | ADAS Core | Command dispatch + result callback |
| `adas-plugin-sdk.js` | Plugin | iframe SDK for registering command handlers |

---

## 6. What NOT to Do

- **Don't use HTTP transport for solution connectors** — everything is stdio, backend serves static UI files
- **Don't create Docker containers for connectors** — ConnectorManager spawns them as child processes
- **Don't cache uiPlugins at startup** — `cp.listContextPlugins` calls `ui.listPlugins` live
- **Don't hardcode filenames** (`server.js`, `http-wrapper.js`) — manifest `args` has the correct paths
- **Don't reconstruct `/mcp-store/` paths** — PB's `package.sh` already sets them
- **Don't guess transport from `command`** — always check explicit `transport` field first
- **Don't modify docker-compose.yml for runtime connectors** — docker compose is fixed infrastructure
- **Don't add connector-specific UI plugins to the ADAS Core corePlugins list** — they are discovered dynamically at runtime
