# Solution Builder - Architecture Document

**Version:** 1.0
**Date:** February 2026
**Status:** Active
**Last Updated:** 2026-02-05

---

## Table of Contents

1. [Overview](#1-overview)
   - 1.1 [Problem Statement](#11-problem-statement)
   - 1.2 [Solution](#12-solution)
   - 1.3 [Relationship to Skill Builder](#13-relationship-to-skill-builder)
2. [Architecture](#2-architecture)
   - 2.1 [High-Level Architecture](#21-high-level-architecture)
   - 2.2 [Request Flow](#22-request-flow)
   - 2.3 [Responsibility Boundaries](#23-responsibility-boundaries)
3. [Data Models](#3-data-models)
   - 3.1 [Solution Schema](#31-solution-schema)
   - 3.2 [Skills Array](#32-skills-array)
   - 3.3 [Grants Array](#33-grants-array)
   - 3.4 [Handoffs Array](#34-handoffs-array)
   - 3.5 [Routing Object](#35-routing-object)
   - 3.6 [Platform Connectors](#36-platform-connectors)
   - 3.7 [Security Contracts](#37-security-contracts)
   - 3.8 [Phase State Machine](#38-phase-state-machine)
4. [Solution Bot Conversation Flow](#4-solution-bot-conversation-flow)
   - 4.1 [Phase Diagram](#41-phase-diagram)
   - 4.2 [Phase Details](#42-phase-details)
   - 4.3 [State Update Commands](#43-state-update-commands)
   - 4.4 [Conversation Compression](#44-conversation-compression)
5. [Validation Rules](#5-validation-rules)
   - 5.1 [Validation Checks Table](#51-validation-checks-table)
   - 5.2 [Validation Algorithms](#52-validation-algorithms)
6. [Frontend Integration](#6-frontend-integration)
   - 6.1 [App Routing Logic](#61-app-routing-logic)
   - 6.2 [Unified Sidebar Tree](#62-unified-sidebar-tree)
   - 6.3 [SolutionPanel Tabs](#63-solutionpanel-tabs)
   - 6.4 [ChatPanel Reuse](#64-chatpanel-reuse)
7. [API Reference](#7-api-reference)
   - 7.1 [CRUD Endpoints](#71-crud-endpoints)
   - 7.2 [Chat Endpoint](#72-chat-endpoint)
   - 7.3 [Validation and Topology](#73-validation-and-topology)
8. [File Map](#8-file-map)
   - 8.1 [Backend Files](#81-backend-files)
   - 8.2 [Frontend Files](#82-frontend-files)

---

## 1. Overview

### 1.1 Problem Statement

Individual skills define what happens *inside* a single AI agent -- its intents, tools, policies, and identity rules. But production deployments rarely consist of a single skill. Real solutions involve multiple skills that must:

- **Hand off conversations** between each other (e.g., identity verification transfers to customer support)
- **Pass verified claims (grants)** so downstream skills can trust upstream decisions (e.g., `customer_id` verified by identity-assurance)
- **Route inbound channels** to the correct entry-point skill (e.g., Telegram goes to identity gateway first)
- **Enforce security contracts** ensuring that sensitive tools only execute when required grants are present

Without a cross-skill architecture layer, these inter-skill relationships are ad-hoc, undocumented, and error-prone.

### 1.2 Solution

The **Solution Builder** is a guided, conversational tool that helps users design the cross-skill architecture of a multi-skill AI agent deployment. It produces a `solution.json` definition that captures:

- Skill topology with roles (gateway, worker, orchestrator, approval)
- Grant economy -- the vocabulary of verified claims flowing between skills
- Handoff flows -- how and when conversations transfer between skills
- Channel routing -- which skill handles which inbound channel
- Security contracts -- formal cross-skill grant requirements

The Solution Builder runs alongside the existing Skill Builder. Where the Skill Builder defines what happens *inside* each skill, the Solution Builder defines what happens *between* skills.

### 1.3 Relationship to Skill Builder

```
┌─────────────────────────────────────────────────────────────────┐
│                    Skill Builder (DAL-Agent)                     │
│                                                                  │
│  Defines INTERNAL skill structure:                               │
│  - Intents, tools, policies, identity, role, connectors         │
│  - Produces: skill.yaml / domain.json per skill                 │
│                                                                  │
│  Prompt: dalSystem.js                                           │
│  Service: conversation.js                                       │
│  Store: /memory/<tenant>/domains/<id>/domain.json               │
└─────────────────────────────────────────────────────────────────┘
                              │
                    skills are composed into
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Solution Builder (Solution Bot)               │
│                                                                  │
│  Defines CROSS-SKILL architecture:                               │
│  - Skill topology, grants, handoffs, routing, security          │
│  - Produces: solution.json per solution                         │
│                                                                  │
│  Prompt: solutionSystem.js                                      │
│  Service: solutionConversation.js                               │
│  Store: /memory/<tenant>/solutions/<id>/solution.json           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Frontend (React / Vite)                          │
├────────────┬──────────────────────────┬──────────────────────────────────┤
│            │                          │                                  │
│  SkillList │     ChatPanel            │   SkillPanel / SolutionPanel     │
│  (Sidebar) │     (Reused)             │   (Contextual)                  │
│            │                          │                                  │
│  Solutions │  - Same component for    │  IF selectedType === 'solution': │
│  ★ E-com   │    skill + solution chat │    SolutionPanel (7 tabs):      │
│   ├─ s1    │  - Messages + input      │    Topology | Skills | Grants   │
│   ├─ s2    │  - inputHint / selection │    Handoffs | Routing           │
│  ─────────-│  - Markdown rendering    │    Security | Validation        │
│  Skills    │                          │                                  │
│   support  │                          │  IF selectedType === 'skill':    │
│   finance  │                          │    SkillPanel (existing)         │
│            │                          │                                  │
└─────┬──────┴────────────┬─────────────┴───────────────┬──────────────────┘
      │                   │                             │
      │     selectedType  │                             │
      │     routing       ▼                             │
      │       ┌────────────────────────────────┐        │
      │       │    Backend (Node / Express)     │        │
      │       ├────────────────────────────────┤        │
      │       │                                │◄───────┘
      │       │  /api/solutions                │  CRUD + chat + validate
      │       │    routes/solutions.js          │
      │       │                                │
      │       │  solutionConversation.js        │  Process messages
      │       │    → buildSolutionSystemPrompt  │  Build prompt with phase
      │       │    → LLM adapter                │  Send to Claude/OpenAI
      │       │    → Parse JSON response        │  Extract state_update
      │       │                                │
      │       │  solutionValidator.js           │  7 cross-skill checks
      │       │                                │
      │       └──────────────┬─────────────────┘
      │                      │
      ▼                      ▼
┌──────────────────────────────────────────────────────┐
│              /memory/<tenant>/solutions/              │
│                                                      │
│  /<solutionId>/                                      │
│    solution.json    Full solution definition          │
│                     (metadata + skills + grants       │
│                      + handoffs + routing             │
│                      + security_contracts             │
│                      + conversation history)          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 2.2 Request Flow

```
User sends message in Solution chat
        │
        ▼
App.jsx detects selectedType === 'solution'
  → calls handleSendSolutionMessage()
        │
        ▼
Frontend sends POST /api/solutions/:id/chat
  { message: "..." }
  Header: X-ADAS-TENANT: <tenant>
        │
        ▼
routes/solutions.js
  1. Load solution from store
  2. Push user message to conversation
  3. Call processSolutionMessage()
        │
        ▼
solutionConversation.js
  1. Compress conversation history (keep 10 recent, summarize older)
  2. Build system prompt via buildSolutionSystemPrompt(solution)
     - Injects: SOLUTION_SYSTEM_PROMPT + phase-specific context + current state
  3. Send to LLM adapter (Anthropic/OpenAI)
  4. Parse JSON response: { message, state_update, suggested_focus, input_hint }
        │
        ▼
routes/solutions.js (continued)
  5. Apply state_update to solution object
     - _push: Add/upsert to array (skills, grants, handoffs, etc.)
     - _delete: Remove from array by id/key/name
     - _update: Merge into existing array item
     - Direct property: Set via dot notation
  6. Push assistant message to conversation
  7. Save updated solution to store
  8. Run validateSolution() deterministically
        │
        ▼
Return to frontend:
{
  message: "...",
  solution: { ...updated },
  suggested_focus: { panel: "topology" },
  input_hint: { mode: "selection", options: [...] },
  validation: { valid: bool, errors: [], warnings: [] },
  usage: { inputTokens, outputTokens }
}
```

### 2.3 Responsibility Boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│                  RESPONSIBILITY MATRIX                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SOLUTION ARCHITECT (Human User)                                  │
│  ├── Describes the overall solution purpose and shape             │
│  ├── Names skills and assigns roles                               │
│  ├── Decides which grants flow between which skills               │
│  ├── Confirms handoff triggers and routing                        │
│  └── NEVER reasons about: phases, validation, state commands      │
│                                                                   │
│  SOLUTION BOT (solutionSystem.js + solutionConversation.js)       │
│  ├── Guides through 7 phases sequentially                         │
│  ├── Suggests skill topology based on discovery answers           │
│  ├── Proposes grant vocabulary with examples                      │
│  ├── Emits state_update commands in JSON response                 │
│  ├── Never asks a question without providing an example           │
│  └── Enforces one-topic-at-a-time to avoid overwhelming user     │
│                                                                   │
│  VALIDATOR (solutionValidator.js)                                 │
│  ├── Runs deterministically after every chat turn                 │
│  ├── Checks 7 cross-skill integrity rules                        │
│  ├── Returns errors (blocking) and warnings (advisory)            │
│  └── Uses BFS for handoff path analysis, DFS for cycle detection  │
│                                                                   │
│  STORE (store/solutions.js)                                       │
│  ├── File-based persistence at /memory/<tenant>/solutions/        │
│  ├── Handles _push/_delete/_update array operations               │
│  ├── Supports importFromYaml for pre-built solutions              │
│  └── Auto-saves after every LLM response                         │
│                                                                   │
│  UI (React Frontend)                                              │
│  ├── Unified sidebar with solutions (★) and skills               │
│  ├── Reuses ChatPanel for solution conversation                   │
│  ├── SolutionPanel with 7-tab topology viewer                     │
│  └── Routes via selectedType: 'skill' | 'solution'               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Models

### 3.1 Solution Schema

The complete solution object stored in `solution.json`:

```json
{
  "id": "sol_a1b2c3d4",
  "name": "E-Commerce Support",
  "version": "1.0.0",
  "description": "Multi-skill customer support with identity verification",
  "phase": "SKILL_TOPOLOGY",

  "skills": [],
  "grants": [],
  "handoffs": [],
  "routing": {},
  "platform_connectors": [],
  "security_contracts": [],

  "conversation": [],
  "linked_domains": [],

  "created_at": "2026-02-01T10:00:00.000Z",
  "updated_at": "2026-02-01T15:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (`sol_` prefix + 8-char UUID) |
| `name` | string | Human-readable solution name |
| `version` | string | Semantic version |
| `description` | string | Solution purpose (populated during discovery) |
| `phase` | string | Current conversation phase (see 3.8) |
| `skills` | array | Skill topology (see 3.2) |
| `grants` | array | Grant economy vocabulary (see 3.3) |
| `handoffs` | array | Skill-to-skill transfer definitions (see 3.4) |
| `routing` | object | Channel-to-skill mapping (see 3.5) |
| `platform_connectors` | array | Required platform MCPs (see 3.6) |
| `security_contracts` | array | Cross-skill grant requirements (see 3.7) |
| `conversation` | array | Full chat history with Solution Bot |
| `linked_domains` | array | Domain IDs linked from Skill Builder (import only) |
| `created_at` | ISO 8601 | Creation timestamp |
| `updated_at` | ISO 8601 | Last modification timestamp |

### 3.2 Skills Array

Each entry in the `skills` array defines a skill participating in the solution:

```json
{
  "id": "identity-assurance",
  "role": "gateway",
  "description": "Verifies customer identity before granting access to support tools",
  "entry_channels": ["telegram", "email"],
  "connectors": ["identity-mcp"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique skill identifier (kebab-case) |
| `role` | enum | Yes | `gateway`, `worker`, `orchestrator`, or `approval` |
| `description` | string | No | What this skill does in the solution |
| `entry_channels` | string[] | No | Channels this skill listens on |
| `connectors` | string[] | No | MCP connectors this skill needs |

**Role definitions:**

| Role | Purpose | Example |
|------|---------|---------|
| `gateway` | Entry point + security verification | identity-assurance |
| `worker` | Domain-specific task execution | support-tier-1, returns-ops |
| `orchestrator` | Routing, monitoring, scheduled tasks | ecom-orchestrator |
| `approval` | Human-in-the-loop decisions | finance-ops |

### 3.3 Grants Array

Each entry defines a verified claim that flows between skills:

```json
{
  "key": "ecom.customer_id",
  "description": "Verified customer identifier",
  "issued_by": ["identity-assurance"],
  "consumed_by": ["support-tier-1", "returns-ops"],
  "issued_via": "grant_mapping",
  "ttl_seconds": 3600,
  "values": { "type": "string", "example": "cust_abc123" },
  "internal": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Namespaced identifier (e.g., `ecom.customer_id`) |
| `description` | string | No | Human-readable explanation |
| `issued_by` | string[] | Yes | Skill IDs that create this grant |
| `consumed_by` | string[] | Yes | Skill IDs that require this grant |
| `issued_via` | string | No | How it is issued: `grant_mapping`, `handoff`, `platform` |
| `ttl_seconds` | number | No | Time-to-live in seconds |
| `values` | object | No | Value type and example |
| `internal` | boolean | No | If true, internal-only (no consumers required) |

### 3.4 Handoffs Array

Each entry defines a conversation transfer between two skills:

```json
{
  "id": "identity-to-support",
  "from": "identity-assurance",
  "to": "support-tier-1",
  "trigger": "User identity verified at assurance level L1 or higher",
  "grants_passed": ["ecom.customer_id", "ecom.assurance_level"],
  "grants_dropped": ["ecom.session_token"],
  "mechanism": "handoff-controller-mcp",
  "ttl_seconds": 300
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique handoff identifier |
| `from` | string | Yes | Source skill ID |
| `to` | string | Yes | Target skill ID |
| `trigger` | string | Yes | When this handoff occurs |
| `grants_passed` | string[] | No | Grant keys transferred to target |
| `grants_dropped` | string[] | No | Grant keys NOT transferred (stay internal) |
| `mechanism` | string | No | `handoff-controller-mcp` (live transfer) or `internal-message` (async) |
| `ttl_seconds` | number | No | Time limit for the handoff |

**Mechanism types:**

| Mechanism | Description |
|-----------|-------------|
| `handoff-controller-mcp` | Live conversation transfer. User keeps chatting but a different skill answers. Seamless. |
| `internal-message` | Async structured message. One skill sends data to another without transferring the live conversation. |

### 3.5 Routing Object

Maps inbound channels to their default entry-point skill:

```json
{
  "telegram": {
    "default_skill": "identity-assurance",
    "description": "Telegram messages go to identity gateway first"
  },
  "email": {
    "default_skill": "identity-assurance",
    "description": "Email inquiries start with identity verification"
  },
  "api": {
    "default_skill": "ecom-orchestrator",
    "description": "API webhooks handled by orchestrator"
  }
}
```

Each channel entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `default_skill` | string | Skill ID that handles new conversations on this channel |
| `description` | string | Why this routing makes sense |

### 3.6 Platform Connectors

Declares platform-level MCPs required by the solution:

```json
{
  "id": "handoff-controller-mcp",
  "required": true,
  "description": "Manages live conversation handoffs between skills",
  "used_by": ["identity-assurance", "support-tier-1"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Connector identifier |
| `required` | boolean | Whether the solution fails without it |
| `description` | string | What this connector does |
| `used_by` | string[] | Skills that depend on this connector |

### 3.7 Security Contracts

Formal declarations of cross-skill grant requirements:

```json
{
  "name": "Identity required for order operations",
  "consumer": "support-tier-1",
  "provider": "identity-assurance",
  "requires_grants": ["ecom.customer_id", "ecom.assurance_level"],
  "for_tools": ["orders.order.get", "orders.order.cancel"],
  "validation": "Order operations require verified customer identity at L1+"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable contract name |
| `consumer` | string | Skill ID that calls the protected tools |
| `provider` | string | Skill ID that issues the required grants |
| `requires_grants` | string[] | Grant keys that must be present |
| `for_tools` | string[] | Tool names protected by this contract |
| `validation` | string | Description of the requirement for error messages |

### 3.8 Phase State Machine

```
SOLUTION_DISCOVERY
  │  Solution shape understood
  ▼
SKILL_TOPOLOGY
  │  At least 2 skills defined with roles
  ▼
GRANT_ECONOMY
  │  At least 1 grant defined
  ▼
HANDOFF_DESIGN
  │  All inter-skill flows have handoff definitions
  ▼
ROUTING_CONFIG
  │  All declared channels have routing
  ▼
SECURITY_CONTRACTS
  │  At least 1 security contract for main consumer
  ▼
VALIDATION
  │  No errors (warnings OK)
  ▼
  Done
```

---

## 4. Solution Bot Conversation Flow

### 4.1 Phase Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 1: SOLUTION_DISCOVERY                                       │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Understand the overall solution purpose                         │  │
│  │ - How many skills / agents will it need?                          │  │
│  │ - What types of users interact? (customers, admins, operators)    │  │
│  │ - What channels does it serve? (chat, email, API, scheduled)      │  │
│  │ - Is there an identity / security gateway?                        │  │
│  │                                                                   │  │
│  │ Exit criteria: Basic solution shape is understood                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 2: SKILL_TOPOLOGY                                           │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Define each skill with: id, role, description                   │  │
│  │ - Assign entry_channels and connectors                            │  │
│  │ - Suggest topology based on discovery answers                     │  │
│  │                                                                   │  │
│  │ Exit criteria: At least 2 skills defined with roles               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 3: GRANT_ECONOMY                                            │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Define the verified claims vocabulary                           │  │
│  │ - For each grant: key, issued_by, consumed_by, issued_via         │  │
│  │ - Guide by examining which skills need to trust info from others  │  │
│  │                                                                   │  │
│  │ Exit criteria: At least 1 grant defined                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 4: HANDOFF_DESIGN                                           │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Define skill-to-skill conversation transfers                    │  │
│  │ - For each: from, to, trigger, grants_passed, mechanism           │  │
│  │ - Explain handoff-controller-mcp vs internal-message              │  │
│  │                                                                   │  │
│  │ Exit criteria: All inter-skill flows have handoff definitions     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 5: ROUTING_CONFIG                                           │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Map each channel to its default entry-point skill               │  │
│  │ - Explain: "When a new Telegram message arrives, which skill      │  │
│  │   should answer first?"                                           │  │
│  │                                                                   │  │
│  │ Exit criteria: All declared channels have routing                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 6: SECURITY_CONTRACTS                                       │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Define cross-skill grant requirements for high-risk tools       │  │
│  │ - For each: consumer, provider, requires_grants, for_tools        │  │
│  │                                                                   │  │
│  │ Exit criteria: At least 1 contract for the main consumer skill    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 7: VALIDATION                                               │  │
│  │                                                                   │  │
│  │ Goals:                                                            │  │
│  │ - Run all 7 validation checks                                     │  │
│  │ - Show results to user                                            │  │
│  │ - Help fix errors: missing providers, broken chains, orphans      │  │
│  │                                                                   │  │
│  │ Exit criteria: No errors (warnings OK)                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Phase Details

**Phase-specific context injection**: The `buildSolutionSystemPrompt()` function in `solutionSystem.js` injects a phase-specific block into the system prompt. This block includes:

- Current phase name
- Counts of defined entities (skills, grants, handoffs, contracts)
- Phase-specific guidance text
- List of already-defined items to avoid re-asking

For example, during `GRANT_ECONOMY`:

```
## CURRENT PHASE: GRANT_ECONOMY

Skills: identity-assurance, support-tier-1, returns-ops
Grants defined: 0

Define the verified claims vocabulary. What information needs to flow
between skills?
```

**Solution state summary**: The prompt also includes a compact JSON summary of the current solution state (skills with IDs and roles, grants with keys and issuers/consumers, handoffs with from/to/grants_passed, routing map, security contracts with consumer/provider).

### 4.3 State Update Commands

The Solution Bot emits state updates in its JSON response. The backend applies these using three array mutation commands plus direct property setting:

| Command Suffix | Operation | Example |
|----------------|-----------|---------|
| `_push` | Add to array (upsert by id/key/name) | `skills_push: { id: "s1", role: "worker" }` |
| `_delete` | Remove from array by id/key/name | `skills_delete: "s1"` |
| `_update` | Merge into existing array item | `skills_update: { id: "s1", role: "gateway" }` |
| (none) | Direct property set (dot notation) | `phase: "SKILL_TOPOLOGY"` |

**Push behavior (upsert):** If an item with the same `id`, `key`, or `name` already exists in the array, `_push` merges the new fields into the existing item rather than creating a duplicate.

**Routing updates:** The `routing` object supports both full replacement (`"routing": { ... }`) and partial dot-notation updates (`"routing.telegram": { ... }`).

**Examples from the system prompt:**

```json
// Adding a skill
{ "skills_push": { "id": "support-tier-1", "role": "worker", "description": "Customer-facing support" } }

// Adding a grant
{ "grants_push": { "key": "ecom.customer_id", "issued_by": ["identity-assurance"], "consumed_by": ["support-tier-1"] } }

// Adding a handoff
{ "handoffs_push": { "id": "identity-to-support", "from": "identity-assurance", "to": "support-tier-1", "trigger": "Identity verified", "grants_passed": ["ecom.customer_id"] } }

// Setting routing
{ "routing.telegram": { "default_skill": "identity-assurance", "description": "Telegram goes to identity first" } }

// Adding a security contract
{ "security_contracts_push": { "name": "Identity required for orders", "consumer": "support-tier-1", "requires_grants": ["ecom.customer_id"], "provider": "identity-assurance" } }

// Changing phase
{ "phase": "GRANT_ECONOMY" }
```

### 4.4 Conversation Compression

The `solutionConversation.js` service compresses long conversations before sending them to the LLM:

- **Keep recent**: The last 10 messages are sent verbatim
- **Summarize older**: Messages beyond the recent 10 are grouped into packets of 20 and summarized (user messages truncated to 100 chars, assistant messages reduced to their state_update keys)
- **Max summaries**: At most 10 summary blocks are kept

This prevents context window overflow while preserving the conversational thread.

---

## 5. Validation Rules

### 5.1 Validation Checks Table

| # | Check ID | Description | Severity | Details |
|---|----------|-------------|----------|---------|
| 1 | `grant_provider_exists` | Every grant issuer references an existing skill | Error | Also checks `grant_consumer_exists` for consumers |
| 2 | `grant_provider_missing` | Every consumed grant has at least one issuer | Error | Grants with consumers but no issuers are broken |
| 3 | `handoff_target_exists` | Handoff `from` and `to` skills exist in the solution | Error | Checks both `handoff_source_exists` and `handoff_target_exists` |
| 4 | `grants_passed_match` | Security contract grants flow through all handoffs in the path | Error | Uses BFS to find path from provider to consumer, then verifies every hop passes the required grants |
| 5 | `routing_covers_channels` | Skills with `entry_channels` have corresponding routing rules | Warning | Also checks `routing_target_exists` (error if route points to missing skill) |
| 6 | `platform_connectors_declared` | Handoff mechanisms reference declared platform connectors | Warning | Skips `internal-message` mechanism |
| 7 | `no_orphan_skills` | All skills are reachable via routing or handoffs | Warning | Combines routed skills + handoff sources + handoff targets |
| 8 | `circular_handoffs` | No cycles in the handoff graph | Error | DFS-based cycle detection |

**Notes:**
- Security contract checks also validate `contract_consumer_exists` and `contract_provider_exists` (both errors)
- `contract_handoff_path` is a warning when no handoff path exists between provider and consumer

### 5.2 Validation Algorithms

**Handoff path finding** (`findHandoffPath`): Uses BFS (breadth-first search) to find the shortest sequence of handoffs from a provider skill to a consumer skill. Returns the array of handoff objects forming the path, or `null` if no path exists.

**Cycle detection** (`detectCycles`): Uses DFS (depth-first search) with an in-stack tracking set to detect back-edges in the handoff graph. Returns all detected cycles as arrays of skill IDs.

**Validation return format:**

```json
{
  "valid": false,
  "errors": [
    {
      "check": "grants_passed_match",
      "message": "Security contract \"Identity required for orders\": grant \"ecom.customer_id\" is not passed through all handoffs from \"identity-assurance\" to \"support-tier-1\"",
      "contract": "Identity required for orders",
      "grant": "ecom.customer_id"
    }
  ],
  "warnings": [
    {
      "check": "routing_covers_channels",
      "message": "Skill \"support-tier-1\" declares entry channel \"api\" but no routing rule exists for it",
      "skill": "support-tier-1",
      "channel": "api"
    }
  ],
  "summary": {
    "skills": 3,
    "grants": 2,
    "handoffs": 2,
    "channels": 2,
    "platform_connectors": 1,
    "security_contracts": 1,
    "error_count": 1,
    "warning_count": 1
  }
}
```

---

## 6. Frontend Integration

### 6.1 App Routing Logic

The `App.jsx` component uses a `selectedType` state variable (`'skill'` | `'solution'`) to determine which view to render:

```
App.jsx render logic:

IF currentView !== 'skills':
  → Render admin pages (ConnectorsPage, TenantChannelsPage, etc.)

ELSE:
  ├── SkillList sidebar (always visible)
  │
  ├── IF selectedType === 'solution' && currentSolution:
  │     ├── ChatPanel (messages = solutionMessages, onSend = handleSendSolutionMessage)
  │     └── SolutionPanel (solution = currentSolution)
  │
  ├── ELSE IF currentSkill:
  │     ├── ChatPanel (messages = skillMessages, onSend = handleSendMessage)
  │     └── SkillPanel (skill = currentSkill)
  │
  └── ELSE:
        └── Welcome screen ("Select a skill or solution")
```

Key state variables in App.jsx:

| Variable | Type | Purpose |
|----------|------|---------|
| `selectedType` | `'skill'` \| `'solution'` | Determines which panel to show |
| `currentSolution` | object \| null | Currently loaded solution |
| `solutionMessages` | array | Messages from `currentSolution.conversation` |
| `solutionGreetingData` | object | Initial greeting for new solutions |
| `inputHint` | object | Shared between skill and solution chat |

### 6.2 Unified Sidebar Tree

The `SkillList.jsx` component renders a unified sidebar with solutions and skills:

```
┌─────────────────────┐
│  Builder       [+]  │
├─────────────────────┤
│                     │
│  ★ E-Commerce       │ ← Solution (accent color, ★ prefix)
│    3 skills · 4 gra │
│    ├─ support-t1    │ ← Child skill (indented, matched by ID)
│    ├─ identity-as   │
│    └─ returns-ops   │
│                     │
│  ★ + New Solution   │ ← Create solution button
│                     │
│  ─────────────────  │ ← Separator
│                     │
│  Standalone Skill   │ ← Skills not in any solution
│  Another Skill      │
│                     │
└─────────────────────┘
```

**Skill grouping logic**: The sidebar builds a `solutionSkillIds` set from all `solution.skills[].id` values. Skills whose `original_skill_id` or name (kebab-case) matches are shown indented under their solution. All other skills appear below the separator as standalone.

**Selection behavior**:
- Clicking a solution sets `selectedType = 'solution'` and loads it
- Clicking a skill (standalone or under a solution) sets `selectedType = 'skill'` and loads it
- The active item is highlighted with `bg-tertiary`

### 6.3 SolutionPanel Tabs

The `SolutionPanel.jsx` component provides a 7-tab viewer:

```
┌──────────────────────────────────────────────────────────────────┐
│  ★ E-Commerce Support                                            │
│  3 skills · 4 grants · 2 handoffs                                │
├──────────────────────────────────────────────────────────────────┤
│  Topology | Skills | Grants | Handoffs | Routing | Security | V  │
│  ─────────                                                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  (Tab content area)                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Tab | Component | Shows |
|-----|-----------|-------|
| Topology | `TopologyView` | Visual skill boxes with role badges, handoff arrows, channel entry points |
| Skills | `SkillsView` | Card list of skills with role, description, channels, connectors |
| Grants | `GrantsView` | Card list of grants with key, issuer/consumer, TTL |
| Handoffs | `HandoffsView` | Card list with from/to arrows, mechanism badge, trigger, grants passed/dropped |
| Routing | `RoutingView` | Channel cards mapping to default skills |
| Security | `SecurityView` | Contract cards with consumer, provider, required grants, protected tools |
| Validation | `ValidationView` | Summary + errors (red) + warnings (amber) + success state (green) |

**Validation tab**: Automatically fetches validation results when selected (`GET /api/solutions/:id/validate`).

**Role colors in topology**:

| Role | Background | Text |
|------|------------|------|
| gateway | `#f59e0b20` | `#f59e0b` (amber) |
| worker | `#3b82f620` | `#60a5fa` (blue) |
| orchestrator | `#8b5cf620` | `#a78bfa` (purple) |
| approval | `#10b98120` | `#34d399` (green) |

### 6.4 ChatPanel Reuse

The same `ChatPanel` component is used for both skill and solution conversations. The difference is only in the props passed from App.jsx:

| Prop | Skill Mode | Solution Mode |
|------|------------|---------------|
| `messages` | `currentSkill.conversation` | `currentSolution.conversation` |
| `onSendMessage` | `handleSendMessage` | `handleSendSolutionMessage` |
| `skillName` | `currentSkill.name` | `currentSolution.name` |
| `inputHint` | From skill LLM response | From solution LLM response |
| `domain` | `currentSkill` | `currentSolution` |
| `onFileUpload` | `handleFileUpload` | Not passed (file upload N/A for solutions) |
| `onFocusChange` | `setUiFocus` | Not passed (no ui_focus for solutions) |

---

## 7. API Reference

### 7.1 CRUD Endpoints

All endpoints are prefixed with `/api/solutions` and require the `X-ADAS-TENANT` header.

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| `GET` | `/api/solutions` | List all solutions | -- | `{ solutions: [{ id, name, phase, created_at, updated_at, skills_count, grants_count, handoffs_count }] }` |
| `POST` | `/api/solutions` | Create new solution | `{ name: string }` | `{ solution: { ...full object } }` |
| `GET` | `/api/solutions/:id` | Get solution by ID | -- | `{ solution: { ...full object } }` |
| `PATCH` | `/api/solutions/:id` | Update solution state | `{ state_update: { ...commands } }` | `{ solution: { ...updated object } }` |
| `DELETE` | `/api/solutions/:id` | Delete solution | -- | `{ success: true }` |

### 7.2 Chat Endpoint

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| `POST` | `/api/solutions/:id/chat` | Send message to Solution Bot | `{ message: string }` | `{ message, solution, suggested_focus, input_hint, validation, usage }` |
| `GET` | `/api/solutions/:id/greeting` | Get initial greeting | -- | `{ message, input_hint }` |

**Chat response structure:**

```json
{
  "message": "Great! Let me suggest a skill topology...",
  "solution": { "...updated solution object..." },
  "suggested_focus": { "panel": "topology" },
  "input_hint": {
    "mode": "selection",
    "options": [
      "Add another skill",
      "Looks good, let's define grants",
      "Change a skill role"
    ]
  },
  "validation": {
    "valid": false,
    "errors": [],
    "warnings": [],
    "summary": { "skills": 3, "grants": 0, "..." }
  },
  "usage": {
    "inputTokens": 2847,
    "outputTokens": 512
  }
}
```

**Greeting response**: Returns a welcome message with 4 starter options:

1. Customer support with identity verification
2. Multi-department workflow (support, fulfillment, finance)
3. API-driven automation with scheduled tasks
4. Something else -- I'll describe my use case

### 7.3 Validation and Topology

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/api/solutions/:id/validate` | Run cross-skill validation | `{ validation: { valid, errors, warnings, summary } }` |
| `GET` | `/api/solutions/:id/topology` | Get topology graph | `{ topology: { nodes, edges, channels } }` |

**Topology response:**

```json
{
  "topology": {
    "nodes": [
      { "id": "identity-assurance", "role": "gateway", "description": "...", "entry_channels": ["telegram"], "connectors": [] }
    ],
    "edges": [
      { "id": "identity-to-support", "from": "identity-assurance", "to": "support-tier-1", "trigger": "...", "grants_passed": ["ecom.customer_id"], "mechanism": "handoff-controller-mcp" }
    ],
    "channels": [
      { "channel": "telegram", "default_skill": "identity-assurance", "description": "..." }
    ]
  }
}
```

---

## 8. File Map

### 8.1 Backend Files

| File | Purpose |
|------|---------|
| `apps/backend/src/routes/solutions.js` | Express router: CRUD, chat, validation, topology endpoints. Contains inline state update helper (`applyInlineUpdates`). |
| `apps/backend/src/store/solutions.js` | File-based persistence. Handles create, load, save, remove, list, appendMessage, updateState. Supports `_push/_delete/_update` array operations. Includes `importFromYaml` for pre-built solutions. |
| `apps/backend/src/prompts/solutionSystem.js` | Solution Bot system prompt. Defines `SOLUTION_PHASES` array, `SOLUTION_SYSTEM_PROMPT` template, `buildSolutionSystemPrompt()` (injects phase context + state summary), and phase-specific prompt builders. |
| `apps/backend/src/services/solutionConversation.js` | Processes solution chat messages. Compresses conversation history, builds LLM request, sends to adapter, parses JSON response. Follows same pattern as `conversation.js` for skills. |
| `apps/backend/src/validators/solutionValidator.js` | Deterministic validation of cross-skill contracts. 7 checks covering grants, handoffs, routing, security, orphans, and cycles. Uses BFS for path finding, DFS for cycle detection. |
| `apps/backend/src/server.js` | Mounts solutions router at `/api/solutions`. |
| `apps/backend/src/services/llm/adapter.js` | LLM adapter factory (shared with Skill Builder). |
| `apps/backend/src/services/llm/anthropic.js` | Anthropic Claude adapter (shared). |
| `apps/backend/src/services/llm/openai.js` | OpenAI adapter (shared). |
| `apps/backend/src/utils/tenantContext.js` | Provides `getMemoryRoot()` for tenant-scoped storage paths. |
| `apps/backend/src/middleware/attachTenant.js` | Reads `X-ADAS-TENANT` header, sets tenant context. |

### 8.2 Frontend Files

| File | Purpose |
|------|---------|
| `apps/frontend/src/App.jsx` | Main application. Routes between skill and solution views using `selectedType` state. Manages solution lifecycle (create, load, chat, delete). |
| `apps/frontend/src/components/SkillList.jsx` | Unified sidebar. Renders solutions with ★ prefix and indented child skills. Standalone skills shown below separator. Handles both skill and solution selection/creation. |
| `apps/frontend/src/components/SolutionPanel.jsx` | 7-tab solution viewer. Topology, Skills, Grants, Handoffs, Routing, Security, Validation tabs. Each tab is a separate internal component. |
| `apps/frontend/src/components/ChatPanel.jsx` | Reusable chat panel. Same component for both skill and solution conversations. Renders messages, input area, and inputHint (text or selection mode). |
| `apps/frontend/src/hooks/useSolution.js` | React hook for solution state management. Manages `solutions` list, `currentSolution`, CRUD operations, and `addMessage`. |
| `apps/frontend/src/api/client.js` | API client functions: `listSolutions`, `createSolution`, `getSolution`, `updateSolution`, `deleteSolution`, `sendSolutionMessage`, `getSolutionGreeting`, `validateSolution`, `getSolutionTopology`. |

---

*End of Solution Builder Architecture Document*
