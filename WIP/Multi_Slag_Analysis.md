# Multi-Slag Architecture Analysis

**Date:** January 14, 2026
**Status:** Analysis Phase

---

## Context

The current Core ADAS has a legacy concept of `projectPath` from its SW development origins. This analysis explores what changes are needed to support **multiple slags (skill-level agent contexts)** running in parallel.

### Key Insight
> "The workspace IS the projectPath - it's just legacy naming. The `<slag>` directory can be anything. `projectPath` doesn't make sense for Clean ADAS Core."

---

## Memory Hierarchy

```
/memory/                      ← Volume Mount = TENANT (organization/deployment)
    │
    ├── <slag>/               ← Skilled Agent namespace (e.g., cs-tier-1)
    │   ├── jobs/             ← Job history for this skill
    │   ├── logs/             ← Logs for this skill
    │   └── focus-cache/      ← Cached artifacts for this skill
    │
    ├── <slag>/               ← Another Skilled Agent (e.g., devops-tier-1)
    │   ├── jobs/
    │   ├── logs/
    │   └── focus-cache/
    │
    └── ...
```

### Hierarchy Levels

| Level | Path | Scope | Example |
|-------|------|-------|---------|
| **TENANT** | `/memory/` | Organization/deployment (volume mount) | Company X's ADAS instance |
| **SLAG** | `/memory/<slag>/` | Skilled Agent namespace | `cs-tier-1`, `devops-tier-1` |
| **JOB** | `/memory/<slag>/jobs/<job_id>.json` | Single conversation/task | `job_abc123` |

### What This Replaces

```
OLD (projectPath-based):
  /memory/workspace/jobs/     ← ALL jobs in one "workspace"

NEW (slag-based):
  /memory/cs-tier-1/jobs/     ← CS agent jobs
  /memory/devops-tier-1/jobs/ ← DevOps agent jobs
  /memory/data-analyst/jobs/  ← Data analyst jobs
```

This enables:
- **Multi-tenant** deployments (different `/memory/` mounts)
- **Parallel skills** within a tenant (different `<slag>` directories)
- **Clean isolation** between skilled agents

---

## Current Global State Analysis

### 1. runtimeMap.js - Tools Cache

**Location:** `apps/backend/tools/impl/runtimeMap.js`

```javascript
const TTL_MS = Number(process.env.RUNTIME_TOOLS_TTL_MS || 300_000);
let _cache = null;
let _cacheAt = 0;
```

**Purpose:** Caches all discovered tools for 5 minutes to avoid re-scanning filesystem.

**Impact for Multi-Slag:**
- **NEEDS MAJOR REFACTOR** - Skills CAN define custom tools (core feature!)
- Current cache is a single global object for ALL tools
- Different skills may have different tool sets (core + skill-specific)

**The Problem:**
```
Skill A: core tools + [refund_tool, escalate_tool]
Skill B: core tools + [deploy_tool, rollback_tool]

Current: _cache = { all tools merged }  ← WRONG for parallel
Needed:  _cache[skillSlug] = { tools for that skill }
```

**Recommendation:**
1. **Two-tier cache:**
   - Global cache for core/system tools (shared across all jobs)
   - Per-MCP-URI cache for skill tools (keyed by `skill.mcp_server`)
2. **Tool resolution:** `getToolsForJob(job)` that:
   - Gets core tools from global cache
   - Fetches skill tools from `job.__skill.mcp_server` (with per-URI cache)
   - Merges: `{ ...coreTools, ...mcpTools }`
3. **Cache key for MCP tools:** `mcp_server` URI

---

### 2. selectToolsForPlanner.js - Tool Selection Cache

**Location:** `apps/backend/tools/impl/selectToolsForPlanner.js`

```javascript
const CACHE_TTL_MS = Number(process.env.SELECT_TOOLS_TTL_MS || 600_000);
const _cache = new Map();
```

**Purpose:** Caches LLM tool selection results based on goal + catalog hash.

**Impact for Multi-Slag:**
- **NEEDS ATTENTION** - Cache key currently based on: `goal, intent, userWant, hints, request, max, catalogHash`
- Different skills have different tool catalogs
- Same goal with different skill could return wrong cached selection

**Recommendation:** Add `skillSlug` to cache key.

---

### 3. store.js - Job & Client Storage

**Location:** `apps/backend/store.js`

```javascript
const jobs = new Map();
const clients = new Map();
const pausedJobs = new Map();
```

**Purpose:** In-memory storage for active jobs and SSE clients.

**Impact for Multi-Slag:**
- **ALREADY OK** - Jobs are keyed by `job.id`, not by slag
- Each job carries its own `skillSlug` and skill data
- Multiple jobs with different skills can coexist

**Recommendation:** No changes needed.

---

### 4. focusCache.js - Artifact Cache

**Location:** `apps/backend/context/focusCache.js`

```javascript
const dir = path.join(getPaths().projectRoot, "focus-cache");
```

**Purpose:** Caches focused artifacts (domain-agnostic) with LRU eviction.

**Impact for Multi-Slag:**
- **NEEDS ATTENTION** - Uses `getPaths().projectRoot` which is global
- Currently stores all artifacts in one directory
- Different slags might have conflicting artifact keys

**Recommendation:** Either:
  - Add slag to descriptor hash for isolation
  - Or create per-slag subdirectories: `focus-cache/<slag>/`

---

### 5. projectPaths.js - Path Resolution

**Location:** `apps/backend/utils/projectPaths.js`

```javascript
function resolveProjectPath(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  if (typeof s.projectPath === "string" && s.projectPath.trim()) {
    return s.projectPath.trim();
  }
  // ...falls back to env or default
}
```

**Purpose:** Central path resolution using global settings.

**Impact for Multi-Slag:**
- **CORE ISSUE** - Everything uses `getPaths()` with global settings
- Determines: `slug`, `memoryRoot`, `projectRoot`, `jobsDir`, `logsDir`
- All jobs share same namespace based on global `projectPath`

**Recommendation:** Two options:
  1. **Per-job paths:** Pass job to `getPaths(job)` to derive paths from `job.skillSlug`
  2. **Remove projectPath:** Use `skillSlug` directly as namespace

---

### 6. traceBuffer.js - Debug Logging

**Location:** `apps/backend/utils/traceBuffer.js`

```javascript
const BUFFERS = new Map();
```

**Purpose:** Per-job trace buffers for debugging.

**Impact for Multi-Slag:**
- **ALREADY OK** - Buffers are keyed by `job.id`
- Each job has its own trace buffer

**Recommendation:** No changes needed.

---

## Summary Table

| Component | Current Scope | Multi-Slag Safe? | Action Needed |
|-----------|--------------|------------------|---------------|
| runtimeMap (tools) | Global | **No** | Two-tier cache (core + per-skill) |
| selectToolsForPlanner | Global | **No** | Add skillSlug to cache key |
| store.js (jobs) | Per-job | Yes | None |
| focusCache | Global path | **No** | Add slag isolation |
| projectPaths | Global settings | **No** | Core refactor needed |
| traceBuffer | Per-job | Yes | None |

**Skills CAN define custom tools - this is a core feature!**

---

## Skill-Defined Tools Architecture

Since skills CAN define custom tools, the tool loading architecture needs redesign:

### Current Flow (Broken for Multi-Slag)
```
runtimeMap.js
    ↓
discoverTools() → scans /tools/impl/*.js
    ↓
_cache = { all tools }  ← GLOBAL, SINGLE CACHE
    ↓
loadTools() returns _cache
```

### Proposed Flow (Multi-Slag Safe)

```
                    ┌─────────────────────────────────┐
                    │        Core Tools               │
                    │  (system-level, always loaded)  │
                    │  /tools/impl/*.js               │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────┐
│                    getToolsForJob(job)                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 1. Get core tools (global cache OK)                     │ │
│  │ 2. Get skill tools from job.__skill.tools               │ │
│  │ 3. Merge: { ...coreTools, ...skillTools }               │ │
│  │ 4. Apply skill permissions (job.__toolPermissions)      │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   Per-Job Tool Set              │
                    │   (core + skill-specific)       │
                    └─────────────────────────────────┘
```

### Where Do Skill Tools Come From?

**DECISION: Skill tools are implemented as MCP Servers**

Each skill/slag has an associated MCP server URI that provides its custom tools:

```yaml
# skill YAML
id: cs-tier-1
mcp_server: "http://localhost:4310/cs-tier-1"  # or per-skill port
```

| Source | Description | Cache Strategy |
|--------|-------------|----------------|
| **Core Tools** | System-level tools in `/tools/impl/*.js` | Global cache (shared) |
| **Skill MCP Server** | Skill-specific tools via MCP protocol | Per-slag cache by URI |

### Tool Loading Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        dynamicToolMap                            │
│                                                                  │
│   ┌─────────────────────┐     ┌─────────────────────────────┐   │
│   │     CORE TOOLS      │     │      SKILL MCP TOOLS        │   │
│   │  (global cache)     │  +  │  (per-slag, from MCP URI)   │   │
│   │  /tools/impl/*.js   │     │  skill.mcp_server           │   │
│   └─────────────────────┘     └─────────────────────────────┘   │
│                                                                  │
│   Result: merged tool map for the job                           │
└─────────────────────────────────────────────────────────────────┘
```

### MCP Server Per Skill

```
Skill: cs-tier-1
  └── MCP Server: http://mcp-host:4310/cs-tier-1
        └── Tools: check_order_status, handle_refund, escalate_to_human

Skill: devops-tier-1
  └── MCP Server: http://mcp-host:4310/devops-tier-1
        └── Tools: deploy_service, rollback_deploy, check_health

Skill: data-analyst
  └── MCP Server: http://mcp-host:4310/data-analyst
        └── Tools: run_query, create_chart, export_report
```

### Tool Merging Rules

1. **Core tools always available** (unless explicitly disabled by skill policy)
2. **Skill MCP tools added to toolbox** for that job
3. **Name collision:** Skill tools override core tools with same name
4. **Tool visibility** controlled by skill's `policy.tools`

---

## Implementation Plan: MCP-Based Skill Tools

### Step 1: Skill YAML with MCP Server

```yaml
# /app/skills/cs-tier-1.yaml
id: cs-tier-1
name: "CS:Tier-1"
mcp_server: "http://localhost:4310"  # MCP server for this skill's tools

role:
  persona: "Polite customer service agent..."

# Tools come from MCP server, not defined here
# policy.tools can still restrict which MCP tools are allowed
policy:
  tools:
    allowed: ["check_order_status", "handle_standard_refund"]
    blocked: ["delete_customer"]  # explicitly block dangerous tools
```

### Step 2: runtimeMap.js Changes

```javascript
// Current
let _cache = null;  // single global cache

// New
let _coreCache = null;           // global cache for /tools/impl/*.js
let _mcpCache = new Map();       // per-URI cache: mcp_server -> tools
const MCP_CACHE_TTL_MS = 60_000; // MCP tools cache for 1 minute

async function getCoreTools() {
  if (_coreCache && (Date.now() - _coreCacheAt) < TTL_MS) {
    return _coreCache;
  }
  _coreCache = await discoverTools();  // scan /tools/impl/
  _coreCacheAt = Date.now();
  return _coreCache;
}

async function getMcpTools(mcpServerUri) {
  const cached = _mcpCache.get(mcpServerUri);
  if (cached && (Date.now() - cached.at) < MCP_CACHE_TTL_MS) {
    return cached.tools;
  }
  const tools = await fetchMcpTools(mcpServerUri);  // MCP list_tools call
  _mcpCache.set(mcpServerUri, { tools, at: Date.now() });
  return tools;
}

export async function getToolsForJob(job) {
  const core = await getCoreTools();

  const mcpUri = job?.__skill?.mcp_server;
  if (!mcpUri) {
    return core;  // no skill MCP, just core tools
  }

  const mcpTools = await getMcpTools(mcpUri);
  return { ...core, ...mcpTools };  // skill tools can override core
}
```

### Step 3: mainloop.js Changes

```javascript
// Current
const tools = deps.tools || (await dynamicToolsLoader());

// New
const tools = deps.tools || (await getToolsForJob(job));
```

### Step 4: MCP Tool Execution

When executing a tool from MCP server:

```javascript
async function executeTool(toolName, args, job) {
  const tools = await getToolsForJob(job);
  const tool = tools[toolName];

  if (tool?.source === "mcp") {
    // Call MCP server
    return await mcpCall(tool.mcpServer, toolName, args);
  } else {
    // Execute local tool
    return await tool.run(args);
  }
}
```

---

## Proposed Architecture

### Option A: Per-Job Path Override

Pass job context to getPaths() to derive paths from skill:

```javascript
// Current
const paths = getPaths();  // uses global settings

// Proposed
const paths = getPaths({ job });  // uses job.skillSlug as namespace
```

**Pros:** Minimal changes, backward compatible
**Cons:** Need to pass job through many call sites

---

### Option B: Skill-First Architecture (Clean ADAS)

Remove projectPath entirely. Skills define everything:

```javascript
// API
POST /api/chat { goal, skillSlug }

// Namespace derived from skill
slag = skillSlug  // or skill.namespace from YAML

// Memory paths
/memory/<slag>/jobs/
/memory/<slag>/logs/
/memory/<slag>/focus-cache/
```

**Pros:** Clean separation, truly stateless, parallel-safe
**Cons:** Breaking change, needs migration path

---

## Open Questions

1. ~~**Can skills define custom tools?**~~ **YES - this is core to the skill concept!**

2. ~~**Should slag = skillSlug?**~~ **YES - slag IS the skillSlug namespace**

3. **What about skills that NEED file access?** (DevOps, code assistants)
   - Could add optional `workspace_path` in skill YAML
   - Or pass as request parameter for those skills

4. **Migration path?** How to handle existing jobs in `/memory/workspace/`?
   - Option: Keep `workspace` as default slag for backward compat
   - Option: Migration script to move jobs to new slag dirs

5. ~~**How are skill tools loaded?**~~ **DECIDED: MCP Server per skill**
   - Each skill has an `mcp_server` URI in its YAML
   - dynamicToolMap = CORE tools + MCP server tools
   - MCP tools cached per-URI with shorter TTL

---

## Next Steps

### Decided
- [x] Skill tools via MCP Server (each skill has `mcp_server` URI)
- [x] Two-tier cache: core (global) + MCP tools (per-URI)
- [x] dynamicToolMap = merge(coreTools, mcpTools)

### To Implement
1. [ ] Add `mcp_server` field to skill YAML schema
2. [ ] Refactor `runtimeMap.js` → two-tier cache + `getToolsForJob(job)`
3. [ ] Update `mainloop.js` to use `getToolsForJob(job)`
4. [ ] Add MCP tool execution path in tool runner
5. [ ] Add `skillSlug` to `selectToolsForPlanner` cache key
6. [ ] Design focusCache isolation (per-slag subdirs?)
7. [ ] Decide: remove `projectPath` or keep as optional?

---

## Related Documents

- `WIP/Handover_Skill_Wiring_2026-01-14.md` - Current integration status
- `WIP/Skill_Wiring_Future_Refinements.md` - Future enhancements
