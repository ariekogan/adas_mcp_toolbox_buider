# Plan: Add Developer Knowledge Base to AI Dev Team

## Goal
Populate the Dev skill's knowledge base with practical developer documentation so it can reference architecture, build patterns, and workflows when working across all sandbox projects.

## Documents to Create (via `knowledge.update_doc`)

### 1. Platform Overview
- **Title:** "A-Team Platform Architecture"
- **Category:** architecture
- **Tags:** platform, overview, architecture
- **Content:** High-level map of all components — ADAS Core, Skill Builder, MCP Server, ateam-mcp. How they connect (Docker, API, MongoDB, filesystem). Domain routing through Cloudflare → mac1.

### 2. ADAS Core Backend Guide
- **Title:** "ADAS Core Backend Developer Guide"
- **Category:** development
- **Tags:** backend, core, express, node
- **Content:** Key directories (routes/, worker/, tools/, utils/), execution engine (mainloop.js → HLR → tool calls), tenant context (AsyncLocalStorage), MongoDB patterns, connector lifecycle (connectorManager.js, skillMcpRegistry.js). How to add a new route, a new tool, modify the worker loop.

### 3. ADAS Core Frontend Guide
- **Title:** "ADAS Core Frontend Developer Guide"
- **Category:** development
- **Tags:** frontend, core, react, vite
- **Content:** React 18 + Vite + Tailwind, App.jsx state management (no Redux), chat flow (ChatLayout → blocks), API client (utils/api.js + JWT), plugin system (PluginHost, context plugins via postMessage). How to add a new page, modify chat rendering.

### 4. Skill Builder Guide
- **Title:** "Skill Builder Developer Guide"
- **Category:** development
- **Tags:** skill-builder, builder, react
- **Content:** Frontend (App.jsx state, SmartInput, SkillPanel, SolutionPanel, inline styles), Backend (FS store, routes, services, LLM conversation), Validator package (5-stage pipeline). Deploy flow: Builder FS → API → Core Mongo. How to add a new panel tab, a new route, modify chat.

### 5. Docker & Deployment Guide
- **Title:** "Docker Deployment & Operations Guide"
- **Category:** operations
- **Tags:** docker, deployment, mac1, production
- **Content:** Full container inventory (15+ services), port mappings, volume mounts, deploy commands. How to rebuild a service, check logs, restart, troubleshoot 502s and port conflicts. The `deploy.sh` and `make deploy` workflows. CRITICAL: never run docker compose from skill-builder repo on mac1.

### 6. MCP Connector Development Guide
- **Title:** "MCP Connector Development Guide"
- **Category:** development
- **Tags:** mcp, connector, stdio, ui-plugin
- **Content:** How to build an MCP connector (stdio JSON-RPC, zero deps, DATA_DIR env var), tool definition pattern, UI-capable connectors (ui.listPlugins, ui.getPlugin, ui-dist/ directory), the deploy flow (mcp_store upload → health check → activation). Examples from task-board-mcp and dashboard connector.

### 7. Workspace & Git Workflow
- **Title:** "Workspace & Git Workflow"
- **Category:** process
- **Tags:** git, workspace, sandbox
- **Content:** Sandbox architecture (~/sandboxProjects/ → /workspace), each project is a local clone (origin → real ~/Projects/), git push workflow, how to sync. Available projects and their purpose. No PRs — commit directly to main.

## Execution Approach

Use `ateam_test_skill` to send messages to the Dev skill asking it to create each doc via `knowledge.update_doc`. Each doc should be ~500-1000 words of practical, actionable content (not verbose essays).

Alternatively, call `knowledge.update_doc` directly if there's a faster path — but since we need the content to be accurate and complete, I'll write the content myself and have the skill store it.

## Order
1. Platform Overview (sets context for everything else)
2. Workspace & Git Workflow (the skill needs to know where things are)
3. ADAS Core Backend Guide (biggest, most complex project)
4. ADAS Core Frontend Guide
5. Skill Builder Guide
6. Docker & Deployment Guide
7. MCP Connector Development Guide
