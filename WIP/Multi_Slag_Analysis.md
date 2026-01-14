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

### Implemented (2026-01-14)
1. [x] Refactor `projectPaths.js` → `getPaths({ job })` derives slag from skillSlug
2. [x] Refactor `runtimeMap.js` → two-tier cache + `getToolsForJob(job)`
3. [x] Update `mainloop.js` to use `getToolsForJob(job)`
4. [x] Add `skillSlug` to `selectToolsForPlanner` cache key
5. [x] Update `focusCache.js` for per-slag isolation
6. [x] Update `store.js` to store jobs in slag directory
7. [x] Update logging (`callAI.js`) for per-slag log directories
8. [x] Add `mcp_server` field to DraftDomain type and YAML export

### Remaining
1. [ ] Implement actual MCP tool fetching (currently placeholder in `runtimeMap.js`)
2. [ ] Add MCP tool execution path in tool runner
3. [x] Decide: remove `projectPath` or keep as optional? → **DECIDED: Resource-Based Architecture**

---

## Resource-Based Architecture (Clean Design)

**Decision:** Remove `projectPath` entirely. Replace with explicit **resource bindings**.

### Core Concept

Instead of a global `projectPath` setting, skills declare what **resources** they need, and job requests **bind** those resources.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESOURCE-BASED ARCHITECTURE                          │
│                                                                              │
│   Skill YAML declares:           Job Request binds:                         │
│   ┌─────────────────────┐       ┌─────────────────────────────────┐        │
│   │ resources:          │       │ resources:                       │        │
│   │   - name: codebase  │  ──►  │   codebase: "/path/to/project"  │        │
│   │     type: filesystem│       │   config: "/path/to/config"     │        │
│   │     required: true  │       └─────────────────────────────────┘        │
│   └─────────────────────┘                                                   │
│                                           │                                 │
│                                           ▼                                 │
│                              ┌─────────────────────────────────┐           │
│                              │ job.__resources = {             │           │
│                              │   codebase: "/path/to/project", │           │
│                              │   config: "/path/to/config"     │           │
│                              │ }                                │           │
│                              └─────────────────────────────────┘           │
│                                           │                                 │
│                                           ▼                                 │
│                              ┌─────────────────────────────────┐           │
│                              │ Tools access via:               │           │
│                              │   job.__resources.codebase      │           │
│                              └─────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Is Better

| Aspect | Old (`projectPath`) | New (Resources) |
|--------|---------------------|-----------------|
| **Scope** | Global setting | Per-job binding |
| **Multi-skill** | Breaks with parallel | Each job has own resources |
| **Clarity** | Implicit assumption | Explicit declaration |
| **Flexibility** | One path only | Multiple named resources |
| **Validation** | None | Skill defines requirements |

### Skill YAML with Resources

```yaml
# /app/skills/sw-dev-tier-1.yaml
id: sw-dev-tier-1
name: "SW Dev: Tier 1"
mcp_server: "http://localhost:4311"

# Resource declarations - what this skill needs
resources:
  - name: codebase
    type: filesystem
    required: true
    description: "Project source code directory"

  - name: docs
    type: filesystem
    required: false
    description: "Optional documentation directory"

  - name: database
    type: connection_string
    required: false
    description: "Database for schema inspection"

role:
  persona: "Senior software developer..."

policy:
  tools:
    allowed: ["*"]  # Full tool access for SW dev
```

### Resource Types

| Type | Description | Example Binding |
|------|-------------|-----------------|
| `filesystem` | Path to directory/file | `"/Users/dev/myproject"` |
| `connection_string` | Database/service URI | `"postgres://localhost/db"` |
| `api_endpoint` | External API URL | `"https://api.service.com"` |
| `credential` | Secret reference | `"vault:aws/creds/dev"` |

### Job Request with Resource Binding

```javascript
// API Request
POST /api/chat
{
  "goal": "Fix the authentication bug in user service",
  "skillSlug": "sw-dev-tier-1",
  "resources": {
    "codebase": "/Users/dev/myproject",
    "docs": "/Users/dev/myproject/docs"
  }
}
```

### Bootstrap Validation

During skill bootstrap, validate resource bindings:

```javascript
// In skill bootstrap (jobBootstrap.js or similar)
function validateResources(skill, requestResources) {
  const errors = [];

  for (const decl of skill.resources || []) {
    const bound = requestResources?.[decl.name];

    if (decl.required && !bound) {
      errors.push(`Required resource '${decl.name}' not provided`);
      continue;
    }

    if (bound && decl.type === 'filesystem') {
      // Validate path exists and is accessible
      if (!fs.existsSync(bound)) {
        errors.push(`Resource '${decl.name}': path does not exist: ${bound}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ResourceValidationError(errors);
  }

  return true;
}
```

### Job Structure with Resources

```javascript
// Job object structure
{
  id: "job_abc123",
  skillSlug: "sw-dev-tier-1",
  goal: "Fix the authentication bug",

  // Resources bound for this job
  __resources: {
    codebase: "/Users/dev/myproject",
    docs: "/Users/dev/myproject/docs"
  },

  // Skill data (from YAML)
  __skill: {
    id: "sw-dev-tier-1",
    mcp_server: "http://localhost:4311",
    resources: [
      { name: "codebase", type: "filesystem", required: true },
      { name: "docs", type: "filesystem", required: false }
    ],
    // ...
  }
}
```

### Tool Access Pattern

Tools access resources via the job context:

```javascript
// In a tool implementation
async function run({ args, job }) {
  // Get the codebase path from resources
  const codebase = job.__resources?.codebase;

  if (!codebase) {
    return { ok: false, error: "No codebase resource bound to this job" };
  }

  // Use the codebase path
  const files = await glob(`${codebase}/**/*.js`);
  // ...
}
```

### System Prompt Injection

The skill's system prompt can reference resources:

```yaml
# In skill YAML
role:
  persona: |
    You are a senior software developer working on the codebase at {{resources.codebase}}.
    {{#if resources.docs}}
    Documentation is available at {{resources.docs}}.
    {{/if}}
```

### Skills Without Resources

Skills that don't need external resources (like CS agents) simply don't declare any:

```yaml
# /app/skills/cs-tier-1.yaml
id: cs-tier-1
name: "CS: Tier 1"
mcp_server: "http://localhost:4310"

# No resources declared - this skill doesn't need filesystem access

role:
  persona: "Friendly customer service agent..."
```

### Implementation Steps

#### Phase 1: Skill Templates & Bootstrap (Backward Compatible) ✅ IMPLEMENTED

1. **Create Skill Template Directory** ✅
   - Created `/apps/backend/skill-templates/sw-dev-agent.yaml`
   - Template with `codebase` resource (required: true)

2. **Skill Loader Module** ✅
   - Created `/apps/backend/skills/skillLoader.js`
   - `loadOrBootstrapSkill(skillSlug)` - main entry point
   - `bootstrapJobSkill({ skillSlug, resources })` - job bootstrap helper
   - `validateResources(skill, resources)` - resource validation
   - Auto-creates slag directory structure on first use

3. **Job Bootstrap Update** ✅
   - Updated `jobRunner.js` - `startJob()` accepts `{ goal, skillSlug, resources }`
   - Job object now includes: `skillSlug`, `__skill`, `__resources`
   - Auto-binds `projectPath` → `codebase` for sw-dev-agent (backward compat)

4. **API Update** ✅
   - Updated `server.js` - `/api/chat` accepts `skillSlug` and `resources`

5. **Tool Access Pattern**
   - Tools check `job.__resources.codebase` first
   - Fall back to `getPaths().projectPath` for legacy (temporary)

#### Phase 2: Full Resource-Based (Future)

5. **Skill Schema Update**
   - Add `resources` array to skill YAML schema
   - Define resource types: `filesystem`, `connection_string`, `api_endpoint`, `credential`

6. **API Update**
   - Add `resources` object to `/api/chat` request body
   - Validate against skill's resource declarations

7. **System Prompt Templating**
   - Template engine to inject resource values
   - Conditional sections for optional resources

8. **Remove Legacy** (Eventually)
   - Remove `projectPath` from settings
   - Remove auto-binding logic
   - All resources must be explicit in request

### Skill Templates vs Operational Skills

**Key Distinction:**
- **Skill Templates** (in repo) - NOT operational, just starting points
- **Operational Skills** (in `/memory/<slag>/`) - Actually used by the system

#### Directory Structure

```
REPO (templates - not operational)          MEMORY (operational skills)
/app/skill-templates/                       /memory/
    └── sw-dev-agent.yaml                       ├── sw-dev-agent/
                                                │   ├── skill.yaml    ← operational
                                                │   ├── jobs/
                                                │   ├── logs/
                                                │   └── focus-cache/
                                                │
                                                └── cs-tier-1/        ← another slag
                                                    ├── skill.yaml
                                                    ├── jobs/
                                                    └── ...
```

#### Skill Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SKILL LIFECYCLE                                    │
│                                                                              │
│   1. Request comes in (with or without skillSlug)                           │
│                                                                              │
│   2. Resolve slag:                                                          │
│      - If skillSlug provided → use it                                       │
│      - If not → default to "sw-dev-agent"                                   │
│                                                                              │
│   3. Check if slag exists in /memory/:                                      │
│      - /memory/<slag>/skill.yaml exists? → Load operational skill           │
│      - Doesn't exist? → Bootstrap from template                             │
│                                                                              │
│   4. Bootstrap (first time only):                                           │
│      - Create /memory/<slag>/                                               │
│      - Copy template → /memory/<slag>/skill.yaml                           │
│      - Create jobs/, logs/, focus-cache/                                    │
│      - Auto-bind projectPath → codebase resource                           │
│                                                                              │
│   5. Load operational skill from /memory/<slag>/skill.yaml                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Default Skill Template

```yaml
# /app/skill-templates/sw-dev-agent.yaml
# This is a TEMPLATE - copied to /memory/sw-dev-agent/skill.yaml on first use

id: sw-dev-agent
name: "SW Dev Agent"
version: 1

# Resource declarations
resources:
  - name: codebase
    type: filesystem
    required: true
    description: "Project source code directory"

role:
  persona: |
    You are an expert software developer assistant.
    You're working on the codebase at {{resources.codebase}}.

policy:
  tools:
    allowed: ["*"]
```

#### Bootstrap Logic

```javascript
// In skill loader
async function loadOrBootstrapSkill(skillSlug) {
  const slag = skillSlug || "sw-dev-agent";  // Default skill
  const memoryRoot = resolveMemoryRoot();
  const slagDir = path.join(memoryRoot, slag);
  const skillFile = path.join(slagDir, "skill.yaml");

  // Check if operational skill exists
  if (await exists(skillFile)) {
    return loadSkillYaml(skillFile);
  }

  // Bootstrap from template
  const templateFile = path.join(
    resolveAssistantRoot(),
    "skill-templates",
    `${slag}.yaml`
  );

  // Create slag directory structure
  await fs.mkdir(slagDir, { recursive: true });
  await fs.mkdir(path.join(slagDir, "jobs"), { recursive: true });
  await fs.mkdir(path.join(slagDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(slagDir, "focus-cache"), { recursive: true });

  // Copy template or create default
  if (await exists(templateFile)) {
    await fs.copyFile(templateFile, skillFile);
  } else {
    // Create minimal default skill
    await fs.writeFile(skillFile, defaultSkillYaml(slag), "utf8");
  }

  return loadSkillYaml(skillFile);
}
```

#### Backward Compatibility

```javascript
// In job bootstrap
function bootstrapJob(request) {
  const skillSlug = request.skillSlug || "sw-dev-agent";
  const resources = request.resources || {};

  // Auto-bind projectPath as codebase for sw-dev-agent (legacy compat)
  if (skillSlug === "sw-dev-agent" && !resources.codebase) {
    const settings = getAllSettings();
    if (settings.projectPath) {
      resources.codebase = settings.projectPath;
    }
  }

  const skill = await loadOrBootstrapSkill(skillSlug);
  validateResources(skill, resources);

  return {
    id: generateJobId(),
    skillSlug,
    __skill: skill,
    __resources: resources,
    // ...
  };
}
```

#### What This Achieves

| Scenario | Behavior |
|----------|----------|
| **Legacy request** (no skill, has projectPath) | Uses `sw-dev-agent`, bootstraps if needed, auto-binds `codebase` |
| **New request** (explicit skill + resources) | Uses specified skill, bootstraps if needed |
| **Custom skill** (user-created in /memory/) | Loads directly, no template needed |

#### Benefits

1. **Templates are just starting points** - not mixed with operational code
2. **Operational skills live in /memory/** - per-tenant, per-slag
3. **Users can customize** - edit `/memory/<slag>/skill.yaml` directly
4. **Bootstrap is automatic** - first request creates the slag
5. **Backward compatible** - existing deployments just work

### Example: Full SW Dev Skill

```yaml
# /app/skills/sw-dev-senior.yaml
id: sw-dev-senior
name: "SW Dev: Senior Engineer"
mcp_server: "http://localhost:4311"

resources:
  - name: codebase
    type: filesystem
    required: true
    description: "Project source code"

  - name: tests
    type: filesystem
    required: false
    description: "Test directory (defaults to codebase/tests)"

  - name: ci_api
    type: api_endpoint
    required: false
    description: "CI/CD API for build status"

role:
  persona: |
    You are a senior software engineer with 10+ years of experience.
    You're working on the codebase at {{resources.codebase}}.
    Always write clean, tested, maintainable code.

context:
  project_structure: true
  recent_changes: true

policy:
  tools:
    allowed: ["*"]
  guardrails:
    - "Never commit directly to main branch"
    - "Always run tests before suggesting changes are complete"
```

### Example: Job Request

```javascript
// Client request to start SW dev job
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: "Implement user authentication with JWT",
    skillSlug: "sw-dev-senior",
    resources: {
      codebase: "/home/dev/myapp",
      tests: "/home/dev/myapp/tests",
      ci_api: "https://ci.company.com/api"
    }
  })
});
```

### Commits
- Core ADAS: Multi-Slag Architecture implementation (pending commit)
- Toolbox Builder: Added `mcp_server` to DraftDomain type and export

---

## Summary: Clean ADAS Architecture

The Multi-Slag Architecture with Resource-Based design creates a clean, scalable system:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLEAN ADAS ARCHITECTURE                            │
│                                                                              │
│   /memory/ (TENANT)                                                         │
│       │                                                                      │
│       ├── cs-tier-1/          ← CS skill jobs, logs, cache                  │
│       ├── sw-dev-senior/      ← SW Dev skill jobs, logs, cache              │
│       └── devops-tier-1/      ← DevOps skill jobs, logs, cache              │
│                                                                              │
│   Job Request:                                                               │
│   {                                                                          │
│     skillSlug: "sw-dev-senior",                                             │
│     goal: "...",                                                             │
│     resources: { codebase: "/path/to/project" }   ← Resource binding        │
│   }                                                                          │
│                                                                              │
│   Job Object:                                                                │
│   {                                                                          │
│     id, skillSlug, goal,                                                    │
│     __skill: { ... },                              ← From YAML              │
│     __resources: { codebase: "/path/to/project" } ← Bound resources         │
│   }                                                                          │
│                                                                              │
│   Tools:                                                                     │
│   - Core tools (global cache, 5min TTL)                                     │
│   - MCP tools (per-skill URI, 1min TTL)                                     │
│   - Access resources via job.__resources                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- **Parallel-safe:** Multiple skills run simultaneously without interference
- **Explicit:** Resources declared by skill, bound by request
- **Scalable:** Per-skill isolation for jobs, logs, cache
- **Clean:** No global state, everything flows from job context

---

## Related Documents

- `WIP/Handover_Skill_Wiring_2026-01-14.md` - Current integration status
- `WIP/Skill_Wiring_Future_Refinements.md` - Future enhancements
