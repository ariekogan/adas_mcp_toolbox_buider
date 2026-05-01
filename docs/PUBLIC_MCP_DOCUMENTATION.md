# A-Team Public MCP Documentation

**Purpose:** Complete reference for building, deploying, testing, and managing A-Team skills and solutions using the public MCP API.

**Audience:** AI agents, developers, and automation systems building with A-Team.

**Version:** 1.0.0
**Last Updated:** March 11, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Concepts](#core-concepts)
4. [Multi-Agent Routing (System Tools)](#multi-agent-routing-system-tools)
5. [Tool Reference](#tool-reference)
6. [Workflows](#workflows)
7. [Examples](#examples)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Overview

The A-Team Public MCP provides tools to programmatically:
- **Build** skills (intents, tools, connectors, policy, engine config)
- **Deploy** solutions to A-Team Core
- **Test** skills before and after deployment
- **Manage** GitHub repos for connector source code
- **Update** deployed skills and solutions without full redeployment
- **Monitor** solution health and status

### Architecture

```
User/Agent
  ↓
Public MCP Tools (this API)
  ↓
A-Team Core Backend
  ↓
MongoDB (persistent storage)
```

**Key Principle:** Solutions live in Core MongoDB. Connector source code lives in GitHub. Skill definitions live in the Builder. Use the public API to synchronize between these systems.

---

## Authentication

All API calls require an API key. Get your key at: **https://mcp.ateam-ai.com/get-api-key**

**Format:** Keys follow the pattern: `adas_<tenant>_<hex>` or `adas_<hex>` (tenant auto-extracted)

**How to authenticate:**

```python
# In your agent/script, call this FIRST (before any other tools):
ateam_auth(api_key="adas_main_abc123def456...")

# If your key includes tenant info, you can omit the tenant parameter
ateam_auth(api_key="adas_main_abc123def456...")  # tenant="main" auto-extracted

# If your key is global, specify tenant explicitly
ateam_auth(api_key="adas_global_xyz789...", tenant="main")
```

**After authentication:** All subsequent tool calls will use your API key and tenant automatically.

---

## Core Concepts

### Tenant
A tenant is an isolated namespace. One tenant = one solution. Multi-tenant architecture ensures complete data isolation.

**Example:** `tenant="main"` or `tenant="gpt-clinic"` or `tenant="smart-home"`

### Solution
A complete A-Team deployment consisting of:
- **Identity** (name, description, version)
- **Skills** (linked list of intents, tools, policy, engine)
- **Team Map** (handoff structure, delegation)
- **Architecture** (routing, trust rules, security gates)
- **Connectors** (MCP servers for external integrations)
- **UI Plugins** (embedded interfaces)
- **Functional Connectors** (background services, device collectors)

**Storage:** MongoDB in A-Team Core

### Skill
A single autonomous unit with:
- **Identity** (name, slug, description)
- **Problem Statement** (what it solves)
- **Intents** (how to trigger: text patterns, voice commands, schedules, webhooks)
- **Tools** (actions it can take, validated JSON schema)
- **Policy** (constraints, guardrails, authorization)
- **Engine Config** (reasoning strategy, token limits, caching)

**Lifecycle:** Defined in Builder → Deployed to Core → Tested → Updated via PATCH

### Connector
An MCP (Model Context Protocol) server that bridges external systems to A-Team skills.

- **Types:** Stdio (built-in), HTTP/REST, WebSocket
- **Transport:** How A-Team calls the connector (stdio, HTTP, etc.)
- **Tools:** The capabilities the connector exposes (e.g., `gmail_send_email`, `slack_post_message`)

**Storage:** Source code in GitHub, registry in Core

### Export Bundle
A complete snapshot of a solution including:
- Solution definition (JSON)
- All skills (JSON)
- Connector metadata
- Full re-importable state

**Used by:** `ateam_github_push` to create version snapshots, `ateam_github_pull` to restore versions

### Multi-Agent Routing (System Tools)

For complex solutions with 3+ skills, A-Team provides platform-level system tools that enable skills to discover, query, and delegate to each other at runtime. These are **system tools** — do NOT define them in your `tools` array. They are automatically available to all skills.

**When to use:** Solutions where skills need to collaborate, route requests, or query each other's domains. Single-skill solutions should exclude these via `exclude_bootstrap_tools`.

#### `sys.findCapability(query, top_k?, rebuild?)`
Search all skills to find which skill and tools can handle a request. Uses a prebuilt capability index — **zero LLM cost** at query time.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural language (e.g., "delete old emails") |
| `top_k` | number | No | Max results (default: 5, max: 10) |
| `rebuild` | boolean | No | Force rebuild index (expensive) |

**Returns:** `results[{ capability, skill, skillName, tools, intent, confidence, matchScore }]`

The capability index auto-builds from skill definitions (tool names, descriptions, intents) and auto-rebuilds on skill deploy.

#### `sys.askAnySkill(query, target_skill?, exclude_skills?, timeout_seconds?)`
Ask the system to route a request to whichever skill can handle it, run a sub-job there, and wait for the answer. **Non-terminal** — the calling skill continues with the response. Wraps capability lookup + sub-job start into a single call.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural-language request describing what you need |
| `target_skill` | string | No | Optional explicit target slug (skips routing) |
| `exclude_skills` | array | No | Skill slugs to exclude from routing |
| `timeout_seconds` | number | No | Hard ceiling on the wait (default: 300, max: 600). Idle window detection runs in parallel — 60s of complete silence in the chain also fails. |

**Returns:** `{ ok, answer, sub_job_id, skill, elapsed_ms }`

The sub-job inherits the parent's `chainId`, so its tool executions are visible to the parent's effect ledger. Heartbeat-based wait: any descendant tool call keeps the chain alive.

#### `sys.listSkills()`
List all skills in the solution with descriptions, connectors, and supported intents. Zero cost.

**Returns:** `{ ok, count, skills[{ slug, name, description, connectors, intentCount, intents, toolCount }] }`

#### `sys.handoffToSkill(to_skill, grants?, summary?, original_goal?, ttl_seconds?)`
Transfer the conversation entirely to another skill. **Terminal** — the calling skill's job ends.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `to_skill` | string | Yes | Target skill slug |
| `grants` | object | No | Verified claims to pass |
| `summary` | string | No | What happened before handoff |
| `original_goal` | string | No | User's original request |
| `ttl_seconds` | number | No | Session TTL (default: 3600) |

#### Common Patterns

**Discover then delegate:** `sys.findCapability("delete old emails")` finds messaging-agent, then `sys.handoffToSkill("messaging-agent")` transfers the conversation.

**Discover then query:** `sys.findCapability("calendar events")` confirms life-manager handles calendar, then `sys.askAnySkill({ query: "What's on my calendar today?" })` routes the request and returns the answer, and the calling skill continues building its response.

**Direct query:** `sys.askAnySkill({ query: "Check for unread emails from GitHub", target_skill: "messaging-agent" })` when the target skill is already known.

#### Cost Profile

| Tool | LLM Cost | Latency |
|------|----------|---------|
| `sys.findCapability` | Zero (query) | ~5ms |
| `sys.listSkills` | Zero | ~10ms |
| `sys.askAnySkill` | Target skill's execution | 2s–5min (heartbeat-based) |
| `sys.handoffToSkill` | Zero (relay starts async) | ~50ms |

### Skill Tool Naming & Wildcards

Each tool in a skill's `tools` array has a `name` that matches an MCP connector tool. The naming convention is `connector-id.tool-name` (e.g., `gmail.send`, `memory.recall`).

**Wildcard support:** Use `connector-id:*` to grant a skill access to ALL tools from a connector, without listing each one individually.

```json
{
  "tools": [
    { "name": "mobile-device-mcp:*", "description": "All device tools" },
    { "name": "gmail.status", "description": "Check Gmail connection" },
    { "name": "gmail.send", "description": "Send email" },
    { "name": "memory.recall", "description": "Search memories" }
  ]
}
```

**Mixing wildcards and individual tools:** You can combine both in the same skill. A tool passes the filter if it matches EITHER an individual name OR a wildcard connector. In the example above, the skill gets ALL `mobile-device-mcp` tools plus specific `gmail` and `memory` tools.

**When to use wildcards:**
- Connectors with many tools where the skill needs all of them (e.g., device adapters, smart home)
- Rapidly evolving connectors where new tools should auto-expose to the skill

**When NOT to use wildcards:**
- When the skill should only access specific tools for security/policy reasons
- When you need per-tool policy rules (approval, rate limits)

### Home-screen Suggestion Cards

The mobile shell shows a small set of tappable cards as cold-start prompts on the home screen. Tapping a card sends a pre-canned prompt to a SPECIFIC skill — bypassing the conversation-continuity logic and the capability index, so taps route deterministically to the owning skill.

**Cards are 100% LLM-generated from existing skill data — no schema changes needed.**

The platform reads each skill's `name`, `problem.statement`, `role.persona`, `intents`, and `tools`, and emits ~6 cards per solution via one cheap LLM call (`storage/homeCards.js`). The LLM sees all skills together so it picks a punchy, diverse cross-section across domains. Each card is automatically tagged with the owning `skill_slug` (anchored against the live skill list — invalid slugs are rejected).

**To shape the generated cards, edit the skill itself.** Make intent descriptions vivid, add good `examples`, write a clear `role.persona`. The LLM looks at exactly the same fields users would care about — there's no separate "cards override" field on skills, because that would just duplicate the data.

**Cache:** result is stored at the solution level (per-tenant Mongo collection `home_cards_cache`, doc id `current`) and invalidated on any skill change via `saveSkill`. TTL: 7 days (env: `HOME_CARDS_TTL_S`).

**Card limit:** default 6, hard max 12 (env: `HOME_CARDS_MAX`).

**Retrieval (called by the mobile shell):** `cp.fe_api.listHomeCards({ max?: number, lang?: string }) → { cards: [...], count }`

`lang` (e.g., `"Hebrew"`, `"Spanish"`) is optional — when set, LLM-generated card text is in that language. The language is part of the cache key so different users get different localized caches.

**Card shape returned by the API:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Snake_case identifier, unique within the result |
| `icon` | string | Single emoji shown on the card |
| `title` | string | User voice ("Talk to my nutritionist"), not skill voice |
| `subtitle` | string | Hint at the card's value |
| `prompt` | string | Complete sentence sent to the skill when tapped |
| `skill_slug` | string | Owning skill — used by the mobile to bypass conversation-continuity routing |

**LLM design principles (already baked into the prompt):**
- User voice, not skill voice
- Top-of-mind cold-start prompts only — not niche capabilities
- Diverse cross-section across skills (avoid 3 cards from one skill)
- Concrete prompts the skill can act on directly
- Most-engaging cards ordered first

---

## Tool Reference

### 1. Authentication

#### `ateam_auth`
Authenticate with A-Team API.

**Required before any other tool.**

```python
ateam_auth(
  api_key: str,              # Your API key (e.g., "adas_main_abc123...")
  tenant: str = None,        # Optional: explicit tenant (auto-extracted from key if possible)
  url: str = None            # Optional: API URL override (default: https://api.ateam-ai.com)
)
```

**Response:**
```json
{
  "ok": true,
  "tenant": "main",
  "user": "agent-1",
  "authenticated_at": "2026-03-11T10:30:00Z"
}
```

**Errors:**
- `401 Unauthorized` — Invalid API key
- `403 Forbidden` — Key doesn't have access to this tenant

---

### 2. Building & Deployment

#### `ateam_build_and_run`
Build, validate, deploy, and test a solution in one atomic operation.

**Primary deployment tool.** Use this to create or update a solution.

```python
ateam_build_and_run(
  solution: dict,                    # Solution definition (identity, grants, handoffs, routing)
  skills: list[dict],                # Array of skill definitions
  connectors: list[dict] = None,     # Optional: connector metadata
  mcp_store: dict = None,            # Optional: connector source code { connectorId: [{ path, content }] }
  test_message: str = None,          # Optional: send test message after deployment
  test_skill_id: str = None,         # Optional: which skill to test (default: first skill)
  github: bool = False               # Optional: pull connector code from GitHub (after first deploy)
)
```

**Key Parameters:**

**`solution`** — Object with:
- `id` (string) — Unique solution ID (e.g., `"personal-adas"`, `"smart-home"`)
- `name` (string) — Display name
- `description` (string) — What it does
- `version` (string) — Semantic version (e.g., `"1.0.0"`)
- `handoffs` (array) — Skill delegation rules
- `routing` (array) — Intent-to-skill mapping
- `team` (object) — Trust rules, execution gates, etc.
- Optional: `ui_plugins`, `functional_connectors` arrays

**`skills`** — Array of skill definitions. Each skill object includes:
- `id`, `slug`, `name`, `description`
- `identity`, `problem` (problem statement)
- `intents` (trigger patterns)
- `tools` (with JSON schema)
- `policy` (constraints)
- `engine` (reasoning config)

**`connectors`** — Metadata about MCP connectors. Each includes:
- `id` (unique ID)
- `name`, `description`
- `transport` (stdio, http, etc.)

**`mcp_store`** — Source code for connectors (used on first deploy). Key = connector ID, value = array of `{ path, content }` objects.

**`github`** — If `true`, pull connector code from GitHub repo instead of `mcp_store`. Use this after first deploy for faster iteration.

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "skills_deployed": 3,
  "health": {
    "status": "healthy",
    "all_skills_reachable": true,
    "connectors_registered": 2
  },
  "github": {
    "repo_created": true,
    "repo_url": "https://github.com/ariekogan/main--personal-adas",
    "branch": "main"
  },
  "test_result": {
    "message": "show me my calendar",
    "skill_called": "calendar-assistant",
    "status": "success",
    "response": "..."
  },
  "deployment_id": "deploy-20260311-abc123"
}
```

**Errors:**
- `422 Unprocessable Entity` — Validation failed (check solution schema)
- `409 Conflict` — Solution ID already exists (use `ateam_patch` to update)
- `500 Internal Server Error` — Deployment failed

**Example:**

```python
# First deployment with inline connector code
result = ateam_build_and_run(
  solution={
    "id": "personal-adas",
    "name": "Personal AI Assistant",
    "version": "1.0.0",
    "handoffs": [...],
    "routing": [...]
  },
  skills=[
    {
      "id": "calendar-assistant",
      "name": "Calendar Assistant",
      "intents": ["show my calendar", "schedule meeting"],
      "tools": [...]
    }
  ],
  mcp_store={
    "my-connector": [
      { "path": "server.js", "content": "..." },
      { "path": "package.json", "content": "{...}" }
    ]
  }
)

# Redeploy after updating connector code on GitHub
result = ateam_build_and_run(
  solution=...,
  skills=...,
  github=True  # Pull connector code from GitHub, don't include mcp_store
)
```

---

#### `ateam_patch`
Update a deployed skill or solution without full redeployment.

**Faster than `build_and_run` for incremental changes.**

```python
ateam_patch(
  solution_id: str,                  # The solution to update
  target: str,                       # "solution" or "skill"
  skill_id: str = None,              # Required if target="skill"
  updates: dict = None,              # Update payload (dot notation for scalars)
  test_message: str = None           # Optional: re-test after patching
)
```

**Parameters:**

**`updates`** — Change payload. Supports:
- Dot notation for scalar fields: `"problem.statement"`, `"engine.temperature"`
- Array operations: `"tools_push"`, `"tools_delete"`, `"tools_update"`
- Full object replacement: `"intents"`, `"policy"`, etc.

**Example:**

```python
# Update skill problem statement
ateam_patch(
  solution_id="personal-adas",
  target="skill",
  skill_id="calendar-assistant",
  updates={
    "problem.statement": "Manages calendar events and meeting scheduling"
  }
)

# Update intent patterns
ateam_patch(
  solution_id="personal-adas",
  target="skill",
  skill_id="calendar-assistant",
  updates={
    "intents": [
      { "type": "text", "pattern": "what's on my calendar" },
      { "type": "text", "pattern": "schedule {what} for {when}" }
    ]
  }
)

# Add a new tool to a skill (array push)
ateam_patch(
  solution_id="personal-adas",
  target="skill",
  skill_id="calendar-assistant",
  updates={
    "tools_push": [{
      "id": "calendar-get-events",
      "name": "Get Events",
      "description": "Fetch events from a date range",
      "input": { ... }
    }]
  }
)

# Update solution routing
ateam_patch(
  solution_id="personal-adas",
  target="solution",
  updates={
    "routing": [...]
  }
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "skill_id": "calendar-assistant",  // if target="skill"
  "updated_fields": ["problem.statement"],
  "deployed_at": "2026-03-11T10:35:00Z"
}
```

---

### 3. Testing

#### `ateam_test_skill`
Send a test message to a deployed skill and get full execution result.

**Use to verify skill behavior before and after changes.**

```python
ateam_test_skill(
  solution_id: str,                  # Solution containing the skill
  skill_id: str,                     # Skill to test (original or internal ID)
  message: str,                      # Test message (e.g., "show my calendar")
  wait: bool = True                  # If False, return job_id immediately for polling
)
```

**Response (if `wait=True`):**
```json
{
  "ok": true,
  "skill_id": "calendar-assistant",
  "message": "show my calendar",
  "execution": {
    "status": "success",
    "reasoning": "User wants to see calendar events...",
    "tool_calls": [
      {
        "id": "call_1",
        "tool": "calendar_get_events",
        "args": { "days": 7 },
        "result": [...]
      }
    ],
    "response": "You have 5 events this week...",
    "duration_ms": 2341
  }
}
```

**Errors:**
- `404 Not Found` — Solution or skill not found
- `408 Timeout` — Execution took too long
- `500 Internal Server Error` — Skill crashed

---

#### `ateam_test_pipeline`
Test the decision pipeline (intent detection → planning) WITHOUT executing tools.

**Use to debug why a skill classifies intent incorrectly or plans wrong action.**

```python
ateam_test_pipeline(
  solution_id: str,                  # Solution containing the skill
  skill_id: str,                     # Skill to test
  message: str                       # Test message
)
```

**Response:**
```json
{
  "ok": true,
  "skill_id": "calendar-assistant",
  "message": "show my calendar",
  "intent_classification": {
    "matched": true,
    "intent_id": "show-events",
    "confidence": 0.98
  },
  "first_planned_action": {
    "tool": "calendar_get_events",
    "args": { "days": 7 }
  },
  "timing_ms": 145
}
```

---

#### `ateam_test_voice`
Simulate a voice conversation with a deployed solution.

**Use to test multi-turn voice interactions, caller verification, intent routing.**

```python
ateam_test_voice(
  solution_id: str,                  # Solution to test
  messages: list[str],               # Array of user messages (sequential turns)
  phone_number: str = None,          # Optional: simulated caller phone (e.g., "+14155551234")
  skill_slug: str = None,            # Optional: target specific skill (skip routing)
  timeout_ms: int = 60000            # Optional: max wait per execution
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "turns": [
    {
      "user_message": "show me my calendar",
      "routing": {
        "skill_called": "calendar-assistant",
        "confidence": 0.98
      },
      "bot_response": "You have 5 events this week...",
      "verification": {
        "caller_verified": true,
        "phone": "+14155551234"
      }
    },
    {
      "user_message": "schedule a meeting for tomorrow at 2pm",
      "routing": {
        "skill_called": "calendar-assistant"
      },
      "bot_response": "I've scheduled your meeting for tomorrow at 2 PM..."
    }
  ]
}
```

---

### 4. GitHub Integration

#### `ateam_github_push`
Push a deployed solution to GitHub.

**Creates repo on first use. Auto-commits full bundle (solution + skills + connector source).**

```python
ateam_github_push(
  solution_id: str,                  # Solution to push
  message: str = None                # Optional: custom commit message
)
```

**Behavior:**
1. Check if repo exists (`{tenant}--{solutionId}`)
2. If not, create it on GitHub
3. Commit full bundle:
   - `solution.json`
   - `skills/*.json`
   - `connectors/*/source.js` (etc.)
   - `.ateam/export.json` (full re-importable bundle)
   - `.ateam/deployed_at.txt`
   - `README.md` (auto-generated)
4. Push to `main` branch
5. Create version tag: `prod-YYYY-MM-DD-NNN`

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "repo_url": "https://github.com/ariekogan/main--personal-adas",
  "branch": "main",
  "commit_sha": "abc123def456...",
  "commit_url": "https://github.com/ariekogan/main--personal-adas/commit/abc123...",
  "tag": "prod-2026-03-11-001",
  "committed_files": 8
}
```

---

#### `ateam_github_pull`
Deploy a solution FROM its GitHub repo.

**Restores a previous version or deploys from GitHub as source of truth.**

```python
ateam_github_pull(
  solution_id: str                   # Solution ID (must have GitHub repo)
)
```

**Reads:**
- `.ateam/export.json` (full solution state)
- `connectors/*/` (source code)
- Validates against current spec

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "deployed_from_github": true,
  "pulled_at": "2026-03-11T10:40:00Z",
  "commit_sha": "abc123def456...",
  "skills_loaded": 3,
  "connectors_loaded": 2
}
```

---

#### `ateam_github_status`
Check if a solution has a GitHub repo and its status.

```python
ateam_github_status(
  solution_id: str
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "has_repo": true,
  "repo_url": "https://github.com/ariekogan/main--personal-adas",
  "latest_commit_sha": "abc123def456...",
  "latest_commit_message": "Update calendar-assistant",
  "committed_at": "2026-03-11T10:35:00Z"
}
```

---

#### `ateam_github_read`
Read any file from a solution's GitHub repo.

```python
ateam_github_read(
  solution_id: str,                  # Solution
  path: str                          # File path (e.g., "connectors/my-api/server.js")
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "path": "connectors/my-api/server.js",
  "content": "// connector code...",
  "sha": "xyz789...",
  "size": 5234
}
```

---

#### `ateam_github_patch`
Edit a specific file in a solution's GitHub repo and commit.

**Creates file if it doesn't exist.**

```python
ateam_github_patch(
  solution_id: str,                  # Solution
  path: str,                         # File path to create/update
  content: str,                      # Full file content
  message: str = None                # Optional: commit message
)
```

**Example:**

```python
# Edit connector code
ateam_github_patch(
  solution_id="personal-adas",
  path="connectors/my-api/server.js",
  content="// updated connector code...",
  message="fix: handle API errors gracefully"
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "path": "connectors/my-api/server.js",
  "commit_sha": "abc123def456...",
  "commit_url": "https://github.com/ariekogan/main--personal-adas/commit/abc123...",
  "created": false  // false if file existed, true if newly created
}
```

---

#### `ateam_github_log`
View commit history for a solution's GitHub repo.

```python
ateam_github_log(
  solution_id: str,                  # Solution
  limit: int = 10                    # Max commits to return
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "repo_url": "https://github.com/ariekogan/main--personal-adas",
  "commits": [
    {
      "sha": "abc123def456...",
      "full_sha": "abc123def456789...",
      "message": "fix: update calendar skill",
      "date": "2026-03-11T10:35:00Z",
      "author": "Claude Agent",
      "url": "https://github.com/ariekogan/main--personal-adas/commit/abc123..."
    }
  ]
}
```

---

### 4b. Version Promotion & Rollback

#### `ateam_github_promote` (NEW)
Promote a dev version to main (production).

**Use after dev version is tested and ready for production.**

```python
ateam_github_promote(
  solution_id: str,                  # Solution to promote
  tag: str = None                    # Optional: specific dev tag to promote
                                     # If omitted, promotes latest dev tag
)
```

**Behavior:**
1. Find the target commit (from tag or latest dev)
2. Merge dev → main via git merge
3. Create production tag: `prod-YYYY-MM-DD-NNN`
4. Return merge result with URLs

**Response:**
```json
{
  "ok": true,
  "promoted": true,
  "source_tag": "dev-2026-03-11-005",
  "prod_tag": "prod-2026-03-11-001",
  "merge_commit_sha": "abc123def456...",
  "merge_commit_url": "https://github.com/ariekogan/main--personal-adas/commit/abc123...",
  "main_branch_url": "https://github.com/ariekogan/main--personal-adas/tree/main",
  "promoted_at": "2026-03-11T10:50:00Z"
}
```

**Example:**

```python
# Promote latest dev version to main
result = ateam_github_promote(solution_id="personal-adas")
print(f"✅ Promoted {result['source_tag']} → {result['prod_tag']}")

# Promote specific dev version
result = ateam_github_promote(
  solution_id="personal-adas",
  tag="dev-2026-03-10-003"
)
```

---

#### `ateam_github_list_versions` (NEW)
List all available dev versions for a solution.

**Use to see version history before promoting.**

```python
ateam_github_list_versions(
  solution_id: str                   # Solution
)
```

**Response:**
```json
{
  "ok": true,
  "versions": [
    {
      "tag": "dev-2026-03-11-005",
      "date": "2026-03-11",
      "counter": 5,
      "commit_sha": "abc123def456..."
    },
    {
      "tag": "dev-2026-03-11-004",
      "date": "2026-03-11",
      "counter": 4,
      "commit_sha": "xyz789..."
    }
  ]
}
```

**Example:**

```python
versions = ateam_github_list_versions(solution_id="personal-adas")
for v in versions["versions"]:
    print(f"{v['tag']} ({v['date']}) → {v['commit_sha'][:7]}")
```

---

#### `ateam_github_rollback` (NEW)
Rollback main branch to a previous production tag.

**⚠️ DESTRUCTIVE — resets main to a specific commit. Use with caution.**

```python
ateam_github_rollback(
  solution_id: str,                  # Solution
  tag: str,                          # Production tag to rollback to (e.g., "prod-2026-03-10-001")
  confirm: bool = True               # Must be True to prevent accidents
)
```

**Response:**
```json
{
  "ok": true,
  "rolled_back": true,
  "tag": "prod-2026-03-10-001",
  "main_commit_sha": "abc123def456...",
  "main_branch_url": "https://github.com/ariekogan/main--personal-adas/tree/main",
  "rolled_back_at": "2026-03-11T10:55:00Z",
  "warning": "Main branch has been reset. Use with caution."
}
```

**Example:**

```python
# Rollback to a previous production version
result = ateam_github_rollback(
  solution_id="personal-adas",
  tag="prod-2026-03-10-001",
  confirm=True
)
print(f"⚠️ Rolled back to {result['tag']}")

# After rollback, you may want to redeploy from GitHub
ateam_build_and_run(..., github=True)
```

---

### 5. Solution Management

#### `ateam_get_solution`
Read solution state—definition, skills, health, status, or export.

```python
ateam_get_solution(
  solution_id: str,                  # Solution to read
  skill_id: str = None,              # Optional: read specific skill
  view: str = "definition"           # View type: definition|skills|health|status|export|validate|connectors_health
)
```

**View Options:**

- **`definition`** — Full solution definition (identity, grants, handoffs, routing)
- **`skills`** — List of all skills with metadata
- **`health`** — Live health check (all skills reachable?)
- **`status`** — Deployment status, timestamps
- **`export`** — Full re-importable bundle
- **`validate`** — Re-validate from stored state
- **`connectors_health`** — Connector registration and liveness

**Response Example (view="definition"):**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "definition": {
    "id": "personal-adas",
    "name": "Personal AI Assistant",
    "version": "1.0.0",
    "identity": {...},
    "handoffs": [...],
    "routing": [...]
  }
}
```

---

#### `ateam_list_solutions`
List all solutions deployed in the current tenant.

```python
ateam_list_solutions()
```

**Response:**
```json
{
  "ok": true,
  "solutions": [
    {
      "id": "personal-adas",
      "name": "Personal AI Assistant",
      "version": "1.0.0",
      "deployed_at": "2026-03-11T10:30:00Z",
      "skills_count": 3,
      "status": "healthy"
    }
  ],
  "total": 1
}
```

---

#### `ateam_delete_solution`
Delete a deployed solution and all its skills from A-Team.

**⚠️ DESTRUCTIVE OPERATION — Cannot be undone.**

```python
ateam_delete_solution(
  solution_id: str                   # Solution to delete
)
```

**Response:**
```json
{
  "ok": true,
  "solution_id": "personal-adas",
  "deleted_at": "2026-03-11T10:45:00Z",
  "skills_deleted": 3,
  "connectors_unregistered": 2
}
```

---

## Workflows

### Workflow 1: Initial Solution Deployment

**Goal:** Create and deploy a new solution with skills and connectors.

```python
# Step 1: Authenticate
ateam_auth(api_key="adas_main_abc123...")

# Step 2: Define solution
solution = {
  "id": "my-assistant",
  "name": "My AI Assistant",
  "version": "1.0.0",
  "handoffs": [],
  "routing": [
    { "intent_pattern": "calendar", "skill_id": "calendar-assistant" }
  ]
}

# Step 3: Define skills
skills = [
  {
    "id": "calendar-assistant",
    "name": "Calendar Assistant",
    "problem": { "statement": "..." },
    "intents": [
      { "type": "text", "pattern": "show my calendar" }
    ],
    "tools": [...]
  }
]

# Step 4: Build and deploy
result = ateam_build_and_run(
  solution=solution,
  skills=skills,
  mcp_store={
    "my-connector": [
      { "path": "server.js", "content": "..." }
    ]
  },
  test_message="show my calendar"
)

# Step 5: Verify result
assert result["ok"]
print(f"Deployed: {result['solution_id']}")
print(f"GitHub: {result['github']['repo_url']}")
```

---

### Workflow 2: Rapid Iteration (Connector Code Changes)

**Goal:** Update connector code and redeploy quickly.

```python
# Step 1: Update connector code on GitHub
ateam_github_patch(
  solution_id="my-assistant",
  path="connectors/my-connector/server.js",
  content="// new connector code..."
)

# Step 2: Redeploy pulling latest code from GitHub
result = ateam_build_and_run(
  solution=...,
  skills=...,
  github=True  # Pull from GitHub, no mcp_store
)

# Step 3: Test
ateam_test_skill(
  solution_id="my-assistant",
  skill_id="calendar-assistant",
  message="test message"
)
```

---

### Workflow 3: Skill Definition Updates

**Goal:** Change skill intents, tools, or policy without full redeployment.

```python
# Update intent patterns
ateam_patch(
  solution_id="my-assistant",
  target="skill",
  skill_id="calendar-assistant",
  updates={
    "intents": [
      { "type": "text", "pattern": "what's on my calendar" },
      { "type": "text", "pattern": "schedule {what} at {when}" }
    ]
  },
  test_message="what's on my calendar"
)
```

---

### Workflow 4: Version Management

**Goal:** Maintain version history in GitHub.

```python
# Deploy solution
ateam_build_and_run(solution=..., skills=...)

# All deployments auto-push to dev branch with version tags
# Latest: dev-2026-03-11-005
# Old tags auto-cleaned (keep last 10)

# Check commit history
log = ateam_github_log(solution_id="my-assistant")
for commit in log["commits"]:
    print(f"{commit['sha']}: {commit['message']}")

# Restore a previous version
ateam_github_pull(solution_id="my-assistant")  # Pulls latest from GitHub
```

---

### Workflow 5: Voice Solution Testing

**Goal:** Test a voice-enabled solution with multi-turn conversations.

```python
# Test voice interactions
result = ateam_test_voice(
  solution_id="my-assistant",
  messages=[
    "show me my calendar",
    "schedule a meeting with john tomorrow at 2pm",
    "confirm my last action"
  ],
  phone_number="+14155551234"
)

# Check routing for each turn
for turn in result["turns"]:
    print(f"User: {turn['user_message']}")
    print(f"Skill: {turn['routing']['skill_called']}")
    print(f"Bot: {turn['bot_response']}\n")
```

---

## Examples

### Example 1: Create a Calendar Assistant

```python
from ateam import ateam_auth, ateam_build_and_run, ateam_test_skill

ateam_auth(api_key="adas_main_abc123...")

solution = {
  "id": "calendar-app",
  "name": "Calendar App",
  "version": "1.0.0",
  "routing": [
    { "intent_pattern": "calendar|event|schedule", "skill_id": "cal-mgr" }
  ]
}

skills = [{
  "id": "cal-mgr",
  "name": "Calendar Manager",
  "problem": {
    "statement": "Help user manage their calendar: view events, schedule meetings, set reminders"
  },
  "intents": [
    { "type": "text", "pattern": "show|display my calendar" },
    { "type": "text", "pattern": "schedule|book {event_name} for {datetime}" }
  ],
  "tools": [
    {
      "id": "calendar_list_events",
      "name": "List Events",
      "description": "Get calendar events for a date range",
      "input": {
        "type": "object",
        "properties": {
          "days": { "type": "integer", "description": "How many days to show" }
        }
      }
    },
    {
      "id": "calendar_create_event",
      "name": "Create Event",
      "description": "Create a new calendar event",
      "input": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "datetime": { "type": "string", "format": "iso8601" }
        },
        "required": ["title", "datetime"]
      }
    }
  ],
  "policy": {
    "constraints": [
      "Only create events in user's personal calendar",
      "Don't schedule before 8am or after 8pm without explicit confirmation"
    ]
  }
}]

result = ateam_build_and_run(
  solution=solution,
  skills=skills,
  test_message="show me my calendar for the next 7 days"
)

print(f"✅ Deployed: {result['solution_id']}")
print(f"GitHub: {result['github']['repo_url']}")
print(f"Test response: {result['test_result']['response']}")
```

---

### Example 2: Update Skill Intents

```python
ateam_patch(
  solution_id="calendar-app",
  target="skill",
  skill_id="cal-mgr",
  updates={
    "intents": [
      { "type": "text", "pattern": "what's on my calendar" },
      { "type": "text", "pattern": "do i have any events {when}" },
      { "type": "text", "pattern": "book|schedule {event} for {when}" },
      { "type": "schedule", "cron": "0 9 * * *", "message": "Daily calendar briefing" }
    ]
  },
  test_message="what's on my calendar"
)
```

---

### Example 3: Develop with GitHub Iteration Loop

```python
# Initial deployment with connector code
ateam_build_and_run(
  solution=...,
  skills=...,
  mcp_store={
    "google-calendar": [
      { "path": "server.js", "content": "..." },
      { "path": "package.json", "content": "{...}" }
    ]
  }
)

# Make changes to connector code
ateam_github_patch(
  solution_id="calendar-app",
  path="connectors/google-calendar/server.js",
  content="// updated implementation..."
)

# Redeploy from GitHub (much faster)
ateam_build_and_run(
  solution=...,
  skills=...,
  github=True
)

# Test the changes
test_result = ateam_test_skill(
  solution_id="calendar-app",
  skill_id="cal-mgr",
  message="show my events for tomorrow"
)

if not test_result["ok"]:
    print(f"Test failed: {test_result['error']}")
    # Go back to GitHub and fix
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid API key | Check key format, get new key at https://mcp.ateam-ai.com/get-api-key |
| `403 Forbidden` | No access to tenant | Verify tenant matches your key's tenant |
| `404 Not Found` | Solution/skill doesn't exist | Check solution_id, list solutions with `ateam_list_solutions()` |
| `422 Unprocessable Entity` | Validation failed | Review schema errors, read spec.js for correct structure |
| `409 Conflict` | Solution already exists | Use `ateam_patch` to update, not `build_and_run` |
| `500 Internal Server Error` | Deployment/connector failed | Check skill definition, test connector separately |

### Retry Logic

For transient failures (network, timeout), implement exponential backoff:

```python
import time

def call_with_retry(fn, max_retries=3, backoff=2):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = backoff ** attempt
            print(f"Attempt {attempt+1} failed, retrying in {wait_time}s: {e}")
            time.sleep(wait_time)

result = call_with_retry(lambda: ateam_build_and_run(...))
```

---

## Best Practices

### 1. Always Test Before Deploying to Production

```python
# Test pipeline (no tool execution)
ateam_test_pipeline(
  solution_id="my-assistant",
  skill_id="my-skill",
  message="test message"
)

# Full skill test with tools
ateam_test_skill(
  solution_id="my-assistant",
  skill_id="my-skill",
  message="test message"
)

# Then deploy
ateam_build_and_run(...)
```

### 2. Use `ateam_patch` for Quick Updates

```python
# ❌ Don't do this (slow, full redeployment)
ateam_build_and_run(solution, skills)  # for small changes

# ✅ Do this instead (fast, incremental)
ateam_patch(
  solution_id="...",
  target="skill",
  skill_id="...",
  updates={"intents": [...]}
)
```

### 3. Maintain Connector Code in GitHub

```python
# First deployment: include mcp_store
ateam_build_and_run(solution, skills, mcp_store={...})

# Subsequent deployments: use github=True
ateam_build_and_run(solution, skills, github=True)

# To update connector code:
# 1. Edit on GitHub with ateam_github_patch
# 2. Redeploy with github=True
```

### 4. Version Your Solutions

```python
# Include version in solution.id or name
solution = {
  "id": "my-app-v1",
  "version": "1.0.0",
  ...
}

# Check GitHub for version history
ateam_github_log(solution_id="my-app-v1")
```

### 5. Monitor Solution Health

```python
health = ateam_get_solution(
  solution_id="my-assistant",
  view="health"
)

if not health["all_skills_reachable"]:
    print("⚠️ Some skills are offline!")
    # Investigate, redeploy if needed
```

### 6. Document Your Skills

```python
skill = {
  "id": "my-skill",
  "name": "My Skill",
  "problem": {
    "statement": "This skill handles... It solves the problem of..."
  },
  "intents": [
    { "type": "text", "pattern": "...", "description": "..." }
  ],
  ...
}
```

### 7. Error Handling in Connectors

```javascript
// In your MCP connector (server.js)
export async function handleRequest(params) {
  try {
    // Do work
    return { success: true, result: ... };
  } catch (err) {
    console.error("Connector error:", err);
    return {
      success: false,
      error: err.message,
      code: "CONNECTOR_ERROR"
    };
  }
}
```

### 8. Use Defensive Coding

```python
# Always check response status
result = ateam_build_and_run(...)
if not result.get("ok"):
    print(f"Deployment failed: {result.get('error')}")
    raise Exception("Deployment error")

# Validate before deploying
errors = validate_solution(solution)
if errors:
    print(f"Validation errors: {errors}")
    return

# Test before deploying
test = ateam_test_skill(...)
if not test["ok"]:
    print(f"Test failed: {test['error']}")
    return
```

---

## Specification & Schema

For full JSON schema definitions, request the spec:

```python
ateam_get_spec(topic="solution")      # Full solution schema
ateam_get_spec(topic="skill")         # Full skill schema
ateam_get_spec(topic="overview")      # API overview
```

---

## Support & Feedback

- **API Status:** Check health at `/health`
- **Issues:** File issues on GitHub
- **Examples:** See `/docs/examples/` in this repo
- **Community:** Join the A-Team Slack channel

---

## Tool Testing (Automation)

Direct tool invocation for testing — bypasses the AI planner and calls connector tools directly.

### Message Format

```
[tooltest] <tool_name> <json_args>
```

Sent as a regular chat message. The server intercepts the `[tooltest]` prefix, executes the tool, and returns the result as a conversation turn.

### Modes

| Mode | Format | Description |
|------|--------|-------------|
| Real | `[tooltest] tool.name {args}` | Executes against real connector (requires connected device/actor) |
| Mock | `[tooltest:mock] tool.name {args}` | Returns schema example response (no device needed, for CI/CD) |

### Examples

```
[tooltest] device.calendar.today {}
[tooltest] device.calendar.upcoming {"days":3}
[tooltest] device.calendar.create {"title":"Standup","date":"2026-03-28","start":"09:00","end":"09:30"}
[tooltest] device.contacts.search {"query":"Sarah"}
[tooltest] device.battery {}
[tooltest] device.weather.current {}
[tooltest] memory.list {"limit":5}
[tooltest] triggers.list {}
[tooltest] gmail.status {}
[tooltest] sys.focusUiPlugin {"plugin_id":"mcp:personal-assistant-ui-mcp:schedule-panel"}
```

### Generic — Not Hardcoded

The server parses any `[tooltest] <tool_name> <json_args>` and looks up the tool across all connected connectors and system tools. Any tool from any connector works.

### API for Test Automation

```bash
# 1. Send tooltest message
JOB=$(curl -s -X POST https://app.ateam-ai.com/api/chat \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"[tooltest] device.calendar.today {}","tenant":"mobile-pa"}' \
  | jq -r '.jobId')

# 2. Poll for result
curl -s https://app.ateam-ai.com/api/conversation/$JOB \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  | jq '.turn.result'
```

### Server Path

```
[tooltest] prefix → mainloop.js intercepts → callConnectorTool() → sysFinalizePlan() → conversation turn → result
```

### Auth

Same as regular chat messages — requires valid tenant token. The actorId is implicit from the authenticated session.

---

**Last Updated:** March 27, 2026
**Maintained By:** A-Team Core Team
