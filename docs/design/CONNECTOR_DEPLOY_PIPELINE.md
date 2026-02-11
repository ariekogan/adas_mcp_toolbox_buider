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

## 5. UI Plugin Architecture

### How It Works

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

### Key Points

- **All connectors are stdio** — no HTTP connectors, no Docker containers for MCPs
- **`cp.listContextPlugins`** calls `ui.listPlugins` **live** on each connected connector that has the tool (no caching)
- **`cp.getContextPlugin`** calls `ui.getPlugin(id)` on the MCP to get the iframe manifest
- **iframeUrl resolution**: MCP returns relative URL (e.g., `/ui/ecom-dashboard/0.1.0/index.html`), backend resolves to `/mcp-ui/{connectorId}/ecom-dashboard/0.1.0/index.html`
- **Static file serving**: Backend route `GET /mcp-ui/:connectorId/*` serves files from `/mcp-store/:connectorId/ui-dist/*`
- **Iframe ↔ host communication**: via `postMessage` — the iframe sends `mcp-call` actions, PluginHost proxies them to backend `cp.fe_api` → `mcpProxy`, which calls tools on any connector

### MCP Tools for UI

```javascript
// ui.listPlugins — returns available plugins
{ plugins: [{ id, name, version, description }] }

// ui.getPlugin — returns manifest for one plugin
{ id, name, version, render: { mode: "iframe", iframeUrl }, channels: { events, actions } }
```

### Plugin ID Format

MCP plugins use the format `mcp:{connectorId}:{pluginId}` (e.g., `mcp:ecommerce-ui-mcp:ecom-dashboard`).

### File Structure for UI-Capable Connectors

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
