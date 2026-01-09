# MCP Toolbox Builder - Design Specification

**Version:** 1.0  
**Date:** January 2025  
**Status:** Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [Conversation Flow](#4-conversation-flow)
5. [System Prompt Specification](#5-system-prompt-specification)
6. [UI Specification](#6-ui-specification)
7. [LLM Adapter Layer](#7-llm-adapter-layer)
8. [Persistence Layer](#8-persistence-layer)
9. [Mock System](#9-mock-system)
10. [Export System](#10-export-system)
11. [Technical Stack](#11-technical-stack)
12. [Open Questions](#12-open-questions)

---

## 1. Overview

### 1.1 Problem Statement

Non-technical users want to create custom AI tools (MCP servers) but lack the technical knowledge to write code. They need a guided, conversational experience that helps them define what they need and produces working, deployable tools.

### 1.2 Solution

A web application that combines:
- **Guided conversational interface** - An AI chatbot that persistently guides users through tool definition, never giving up until all details are captured
- **Visual toolbox panel** - Real-time display of the toolbox being built, showing progress and allowing interaction
- **Mock-first development** - Every tool works in simulation mode before export
- **MCP export** - Generates real, deployable MCP servers (Python/FastMCP)

### 1.3 Target Users

- Freelancers wanting to automate workflows
- Small business owners
- Non-technical professionals who use AI assistants (Claude, ChatGPT)
- Anyone who can describe what they want but cannot code it

### 1.4 Key Principles

1. **Never give up** - The chatbot insists on completing each phase before moving forward
2. **Always give examples** - Every question includes concrete examples to help users understand
3. **UI focus drives conversation** - What the user clicks on determines conversation context
4. **Mock before real** - All tools must work in simulation before export
5. **Scenarios before tools** - Understand the problem through real examples before proposing solutions

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Vite)                   │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Project List   │   Chat Panel    │   Toolbox Visual Panel      │
│                 │                 │                             │
│  - New project  │  - Messages     │  - Problem statement        │
│  - Load project │  - Input        │  - Scenarios list           │
│  - Delete       │  - Typing ind.  │  - Tools list               │
│                 │                 │  - Mock testing             │
│                 │                 │  - Export button            │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         │                 ▼                       │
         │    ┌─────────────────────────┐          │
         │    │     Backend (Node/Express)        │
         │    ├─────────────────────────┤          │
         │    │  POST /api/chat         │◄─────────┘
         │    │  POST /api/mock/:toolId │
         │    │  GET  /api/projects     │
         │    │  POST /api/projects     │
         │    │  GET  /api/export/:id   │
         │    └───────────┬─────────────┘
         │                │
         │                ▼
         │    ┌─────────────────────────┐
         │    │    LLM Adapter Layer    │
         │    ├─────────────────────────┤
         │    │  - Claude (Anthropic)   │
         │    │  - OpenAI (GPT-4)       │
         │    │  - Others (pluggable)   │
         │    └───────────┬─────────────┘
         │                │
         ▼                ▼
┌─────────────────────────────────────────┐
│        /memory (Mounted Volume)         │
├─────────────────────────────────────────┤
│  /projects                              │
│    /{project_id}                        │
│      ├── project.json                   │
│      ├── toolbox.json                   │
│      ├── conversation.json              │
│      └── /exports                       │
│          ├── /v1                        │
│          └── /v2                        │
└─────────────────────────────────────────┘
```

### 2.2 Request Flow

```
User types message
        │
        ▼
Frontend sends to /api/chat:
{
  project_id: "...",
  message: "...",
  ui_focus: { type: "TOOL", tool_id: "..." }
}
        │
        ▼
Backend loads project state from /memory
        │
        ▼
Backend constructs LLM request:
- System prompt (with all rules)
- Current toolbox state (JSON)
- Conversation history
- User message
        │
        ▼
LLM Adapter sends to configured provider
        │
        ▼
LLM returns structured response:
{
  message: "...",
  state_update: { ... },
  suggested_focus: { ... }
}
        │
        ▼
Backend applies state_update to toolbox
Backend saves to /memory
        │
        ▼
Frontend receives response
Updates chat + visual panel
```

---

## 3. Data Models

### 3.1 Project

```json
{
  "id": "proj_abc123",
  "name": "Invoice Manager",
  "created_at": "2025-01-09T10:00:00Z",
  "updated_at": "2025-01-09T15:30:00Z",
  "settings": {
    "llm_provider": "anthropic",
    "llm_model": "claude-sonnet-4-20250514"
  }
}
```

### 3.2 Toolbox

```json
{
  "id": "proj_abc123",
  "status": "SCENARIO_EXPLORATION",
  "version": 1,
  
  "problem": {
    "statement": "Managing invoices for my freelance business",
    "target_user": "Me, a freelance designer",
    "systems_involved": ["Gmail", "Google Sheets", "PDF generation"],
    "confirmed": true
  },
  
  "scenarios": [
    {
      "id": "scenario_1",
      "title": "New client invoice request",
      "description": "Client emails asking for an invoice after project completion",
      "steps": [
        "Receive email from client",
        "Look up client in Google Sheet",
        "Determine hourly rate and hours worked",
        "Generate invoice PDF",
        "Email invoice to client",
        "Log invoice in tracking sheet"
      ],
      "pain_points": [
        "Manual lookup takes 5+ minutes",
        "Often forget to log in tracking sheet",
        "PDF generation is tedious"
      ],
      "data_involved": ["email", "client_sheet", "tracking_sheet"],
      "status": "CONFIRMED"
    },
    {
      "id": "scenario_2",
      "title": "Overdue payment followup",
      "description": "Invoice is past due, need to send reminder",
      "steps": [
        "Check tracking sheet for overdue invoices",
        "Look up client contact info",
        "Send polite reminder email",
        "Update tracking sheet with followup date"
      ],
      "pain_points": [
        "Easy to miss overdue invoices",
        "Writing reminder emails is awkward"
      ],
      "data_involved": ["tracking_sheet", "email"],
      "status": "CONFIRMED"
    }
  ],
  
  "proposed_tools": [
    {
      "name": "lookup_client",
      "purpose": "Find client information from Google Sheet",
      "covers_scenarios": ["scenario_1", "scenario_2"],
      "accepted": true
    },
    {
      "name": "create_invoice",
      "purpose": "Generate invoice PDF with client and project details",
      "covers_scenarios": ["scenario_1"],
      "accepted": true
    },
    {
      "name": "send_email",
      "purpose": "Send email to client with optional attachment",
      "covers_scenarios": ["scenario_1", "scenario_2"],
      "accepted": true
    },
    {
      "name": "log_invoice",
      "purpose": "Add invoice record to tracking sheet",
      "covers_scenarios": ["scenario_1"],
      "accepted": true
    },
    {
      "name": "get_overdue_invoices",
      "purpose": "List invoices past their due date",
      "covers_scenarios": ["scenario_2"],
      "accepted": true
    }
  ],
  
  "tools": [
    {
      "id": "tool_1",
      "name": "lookup_client",
      "status": "COMPLETE",
      "purpose": "Find client information by name or email from the client database",
      "inputs": [
        {
          "name": "search_term",
          "type": "string",
          "description": "Client name or email to search for",
          "required": true
        }
      ],
      "output": {
        "type": "object",
        "description": "Client record with contact and billing info",
        "schema": {
          "client_id": "string",
          "name": "string",
          "email": "string",
          "hourly_rate": "number",
          "address": "string"
        }
      },
      "mock": {
        "enabled": true,
        "mode": "example",
        "examples": [
          {
            "input": { "search_term": "Acme Corp" },
            "output": {
              "client_id": "client_001",
              "name": "Acme Corp",
              "email": "billing@acme.com",
              "hourly_rate": 150,
              "address": "123 Main St, NYC"
            }
          },
          {
            "input": { "search_term": "bob@email.com" },
            "output": {
              "client_id": "client_002",
              "name": "Bob Smith",
              "email": "bob@email.com",
              "hourly_rate": 100,
              "address": "456 Oak Ave, LA"
            }
          }
        ],
        "rules": [
          "Returns null if client not found",
          "Search is case-insensitive",
          "Matches partial names"
        ]
      },
      "test_results": [
        {
          "timestamp": "2025-01-09T14:00:00Z",
          "input": { "search_term": "Acme" },
          "output": { "client_id": "client_001", "name": "Acme Corp", "..." },
          "user_approved": true
        }
      ]
    }
  ],
  
  "workflows": [
    {
      "id": "workflow_1",
      "name": "Invoice a client",
      "scenario_id": "scenario_1",
      "steps": ["lookup_client", "create_invoice", "send_email", "log_invoice"]
    }
  ]
}
```

### 3.3 Tool Status State Machine

```
DRAFT
  │ name provided
  ▼
NAME_SET
  │ purpose confirmed
  ▼
PURPOSE_SET
  │ all inputs defined and confirmed
  ▼
INPUTS_DEFINED
  │ output structure confirmed
  ▼
OUTPUT_DEFINED
  │ mock examples provided
  ▼
MOCK_DEFINED
  │ mock tested and approved
  ▼
MOCK_TESTED
  │ ready for export
  ▼
COMPLETE
```

### 3.4 Toolbox Status State Machine

```
PROBLEM_DISCOVERY
  │ problem statement confirmed
  ▼
SCENARIO_EXPLORATION
  │ minimum 2 scenarios confirmed
  ▼
TOOLS_PROPOSAL
  │ tool list accepted
  ▼
TOOL_DEFINITION
  │ all tools complete
  ▼
INTEGRATION_TESTING
  │ workflow tests pass
  ▼
READY_TO_EXPORT
  │ exported
  ▼
EXPORTED
```

### 3.5 Conversation

```json
{
  "project_id": "proj_abc123",
  "messages": [
    {
      "id": "msg_001",
      "role": "assistant",
      "content": "Hi! I'm here to help you build a custom toolbox...",
      "timestamp": "2025-01-09T10:00:00Z"
    },
    {
      "id": "msg_002",
      "role": "user",
      "content": "I need help managing invoices for my freelance work",
      "timestamp": "2025-01-09T10:00:30Z"
    },
    {
      "id": "msg_003",
      "role": "assistant",
      "content": "Great! Invoice management is a common need...",
      "timestamp": "2025-01-09T10:00:35Z",
      "state_update": {
        "problem.statement": "Managing invoices for freelance work"
      }
    }
  ]
}
```

### 3.6 UI Focus

```json
{
  "type": "TOOLBOX | SCENARIO | TOOL | NEW_TOOL | TESTING | WORKFLOW",
  "id": "optional - scenario_id, tool_id, or workflow_id"
}
```

---

## 4. Conversation Flow

### 4.1 Phase Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 1: PROBLEM DISCOVERY                                  │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Understand the core problem                               │    │
│  │ - Identify target user                                      │    │
│  │ - Discover systems/data involved                            │    │
│  │                                                             │    │
│  │ Exit criteria:                                              │    │
│  │ - Problem statement written and confirmed                   │    │
│  │ - Target user identified                                    │    │
│  │ - At least 1 system/data source mentioned                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 2: SCENARIO EXPLORATION                               │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Collect real-world usage scenarios                        │    │
│  │ - Understand step-by-step workflows                         │    │
│  │ - Identify pain points                                      │    │
│  │                                                             │    │
│  │ Exit criteria:                                              │    │
│  │ - MINIMUM 2 scenarios fully defined                         │    │
│  │ - Each scenario has steps and pain points                   │    │
│  │ - User confirmed each scenario                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 3: TOOLS PROPOSAL                                     │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Analyze scenarios to propose tools                        │    │
│  │ - Explain reasoning (which scenario each tool addresses)    │    │
│  │ - Get user buy-in on tool list                              │    │
│  │                                                             │    │
│  │ Exit criteria:                                              │    │
│  │ - Tool list proposed with reasoning                         │    │
│  │ - User accepted/modified/confirmed list                     │    │
│  │ - Each tool mapped to scenarios                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 4: TOOL DEFINITION (per tool)                         │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Define name, purpose, inputs, output for each tool        │    │
│  │ - Create mock examples using scenario data                  │    │
│  │ - Confirm each detail                                       │    │
│  │                                                             │    │
│  │ Exit criteria (per tool):                                   │    │
│  │ - Name confirmed                                            │    │
│  │ - Purpose confirmed                                         │    │
│  │ - All inputs defined with types                             │    │
│  │ - Output structure defined                                  │    │
│  │ - At least 2 mock examples                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 5: MOCK TESTING                                       │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Test each tool with mock data                             │    │
│  │ - Replay scenarios using tools                              │    │
│  │ - Validate tools work together                              │    │
│  │                                                             │    │
│  │ Exit criteria:                                              │    │
│  │ - Each tool tested at least once                            │    │
│  │ - At least one full scenario replayed                       │    │
│  │ - User approved results                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ PHASE 6: EXPORT                                             │    │
│  │                                                             │    │
│  │ Goals:                                                      │    │
│  │ - Generate MCP server code                                  │    │
│  │ - Provide deployment instructions                           │    │
│  │ - Enable download                                           │    │
│  │                                                             │    │
│  │ Deliverables:                                               │    │
│  │ - Python FastMCP server                                     │    │
│  │ - Dockerfile                                                │    │
│  │ - README with setup instructions                            │    │
│  │ - Claude Desktop config snippet                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Focus Rules

The UI focus determines conversation context:

| UI Focus | Conversation Behavior |
|----------|----------------------|
| `TOOLBOX` | High-level discussion, can work on any phase |
| `SCENARIO` | Locked to specific scenario until complete or explicit switch |
| `TOOL` | Locked to specific tool definition until complete or explicit switch |
| `NEW_TOOL` | Creating a new tool |
| `TESTING` | Testing specific tool with mock |
| `WORKFLOW` | Testing tool chain |

**Soft focus rule:** The LLM stays on the focused item unless:
- User explicitly requests a switch ("let's work on something else")
- User asks a question clearly about another item
- Current item is complete

If ambiguous, the LLM asks: "I want to make sure we finish [current item] first. Should we continue here, or switch to [detected new topic]?"

### 4.3 Version Control

To prevent scope creep:

- After tools proposal is accepted, toolbox gets `version: 1`
- User can always add more tools, but LLM suggests: "Let's complete v1 first, then we can add this to v2"
- Visual panel shows version badge
- Export is per-version

---

## 5. System Prompt Specification

### 5.1 Core System Prompt

```
You are a Toolbox Builder assistant. Your job is to help non-technical users create a custom set of AI tools (an MCP server) through conversation.

## YOUR PERSONALITY

- Patient and encouraging
- Persistent - you never give up until details are complete
- Clear - you use simple language, no jargon
- Concrete - you always give examples

## CRITICAL RULES

### Rule 1: NEVER ask a question without an example

WRONG:
"What inputs does this tool need?"

RIGHT:
"What inputs does this tool need?

For example, a lookup tool might need:
- `search_term` (text) - what to search for
- `limit` (number, optional) - max results to return

What would YOUR tool need?"

### Rule 2: NEVER proceed without confirmation

After capturing any information, summarize and ask for confirmation:
"Let me make sure I got this right: [summary]. Is that correct?"

### Rule 3: Respect UI focus

Check the `ui_focus` field in each request:
- If focused on a specific tool, keep conversation on that tool
- Only switch topics if user EXPLICITLY asks
- If user seems to mention something else casually, acknowledge but return to focus:
  "Good thought - let's note that for later. For now, let's finish [focused item]."

### Rule 4: Detect stuck users

Signs of a stuck user:
- Short responses: "idk", "not sure", "um"
- Repeating themselves
- Questions back: "what do you mean?"

When stuck:
1. Don't repeat the same question
2. Offer multiple choice: "Would it be more like A, B, or C?"
3. Offer to show a complete example
4. Simplify: "Let's start smaller - just one thing"

### Rule 5: Reference scenarios

When defining tools, connect back to scenarios:
"In Scenario 1, you mentioned looking up client info. This tool handles that step."

### Rule 6: Mock-first mindset

Every tool must have mock examples before it's complete. Guide users to provide realistic test data based on their scenarios.

## PHASES

You guide users through these phases IN ORDER:

### Phase 1: PROBLEM_DISCOVERY
Goal: Understand the core problem
Ask about:
- What problem are you trying to solve?
- Who will use this toolbox?
- What systems or data do you work with?

Exit when: Problem statement confirmed, target user identified, systems known

### Phase 2: SCENARIO_EXPLORATION  
Goal: Collect real-world usage scenarios (MINIMUM 2)
Ask about:
- "Walk me through a recent time this problem came up"
- "What steps did you take?"
- "What was painful or slow?"

For each scenario, capture:
- Title
- Step-by-step workflow
- Pain points
- Systems/data involved

Exit when: At least 2 scenarios fully confirmed

### Phase 3: TOOLS_PROPOSAL
Goal: Propose tools based on scenarios
Do:
- Analyze scenarios for common actions
- Propose tool list with clear reasoning
- Map each tool to scenarios it addresses
- Ask user to accept, modify, or reject

Exit when: Tool list confirmed

### Phase 4: TOOL_DEFINITION
Goal: Define each tool in detail
For each tool:
- Confirm name
- Confirm purpose
- Define each input (name, type, required, description)
- Define output structure
- Create mock examples (at least 2)

Exit when: All tools have status COMPLETE

### Phase 5: MOCK_TESTING
Goal: Validate tools work correctly
Do:
- Test each tool with sample inputs
- Replay at least one scenario using tools
- Get user approval on outputs

Exit when: All tools tested, one scenario replayed

### Phase 6: EXPORT
Goal: Generate deployable MCP server
Do:
- Generate code
- Provide download
- Show setup instructions

## RESPONSE FORMAT

Always respond with valid JSON:

{
  "message": "Your conversational response to the user",
  "state_update": {
    // Optional: changes to apply to toolbox state
    // Use dot notation for nested updates: "problem.statement": "..."
    // Use array notation for list operations: "scenarios[0].status": "CONFIRMED"
  },
  "suggested_focus": {
    // Optional: suggest UI should focus on something
    "type": "TOOL",
    "id": "tool_1"
  }
}

## CURRENT STATE

The current toolbox state and UI focus will be provided with each request. Use this to:
- Know what phase you're in
- Know what's complete vs pending
- Know what the user is focused on
- Tailor your response accordingly
```

### 5.2 Phase-Specific Prompts

Additional context injected based on current phase:

**PROBLEM_DISCOVERY additions:**
```
You are in PROBLEM_DISCOVERY phase.

Checklist:
- [ ] Problem statement captured
- [ ] Target user identified  
- [ ] Systems/data sources known

Do not proceed to scenarios until all items are confirmed.
```

**SCENARIO_EXPLORATION additions:**
```
You are in SCENARIO_EXPLORATION phase.

Current scenarios: {count}
Minimum required: 2

For each scenario, ensure you have:
- [ ] Clear title
- [ ] Step-by-step workflow (at least 3 steps)
- [ ] Pain points identified
- [ ] Systems/data involved
- [ ] User confirmation

If user tries to move forward with fewer than 2 confirmed scenarios, gently insist:
"I want to make sure we really understand your needs. Let's capture one more scenario - maybe a time when something went wrong, or a different type of request you handle?"
```

**TOOL_DEFINITION additions:**
```
You are in TOOL_DEFINITION phase.

Current tool: {tool_name}
Tool status: {status}

Status checklist:
- [ ] NAME_SET: Name confirmed
- [ ] PURPOSE_SET: Purpose confirmed
- [ ] INPUTS_DEFINED: All inputs defined with types
- [ ] OUTPUT_DEFINED: Output structure confirmed
- [ ] MOCK_DEFINED: At least 2 mock examples
- [ ] MOCK_TESTED: User tested and approved

You must complete each status in order.
```

---

## 6. UI Specification

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  MCP Toolbox Builder                    [Settings] [API Key: ****] │
├───────────┬─────────────────────────────────────────────────────────┤
│           │                                                         │
│  PROJECTS │                    MAIN AREA                            │
│           │                                                         │
│  [+ New]  │  ┌─────────────────────┬───────────────────────────┐   │
│           │  │                     │                           │   │
│  ────────-│  │    CHAT PANEL       │   TOOLBOX PANEL           │   │
│           │  │    (60% width)      │   (40% width)             │   │
│  > Invoice│  │                     │                           │   │
│    Manager│  │                     │                           │   │
│           │  │                     │                           │   │
│    Customer│ │                     │                           │   │
│    Tracker│  │                     │                           │   │
│           │  │                     │                           │   │
│           │  │                     │                           │   │
│           │  │                     │                           │   │
│           │  │                     │                           │   │
│           │  └─────────────────────┴───────────────────────────┘   │
│           │                                                         │
└───────────┴─────────────────────────────────────────────────────────┘
```

### 6.2 Project List Panel

```
┌─────────────────┐
│ My Projects [+] │
├─────────────────┤
│ ┌─────────────┐ │
│ │📦 Invoice   │ │  ← Selected (highlighted)
│ │Manager      │ │
│ │3 tools · v1 │ │
│ │✓ Complete   │ │
│ └─────────────┘ │
│ ┌─────────────┐ │
│ │📦 Customer  │ │
│ │Tracker      │ │
│ │Draft        │ │
│ │○ In progress│ │
│ └─────────────┘ │
└─────────────────┘
```

### 6.3 Chat Panel

```
┌────────────────────────────────────────────┐
│ ┌────────────────────────────────────────┐ │
│ │ 🤖 Hi! I'm here to help you build...   │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ 👤 I need help managing invoices       │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ 🤖 Great! Let me understand better...  │ │
│ │                                        │ │
│ │ For example, some people need help     │ │
│ │ with:                                  │ │
│ │ - Creating invoices from templates     │ │
│ │ - Tracking which are paid/unpaid       │ │
│ │ - Sending reminders                    │ │
│ │                                        │ │
│ │ What's YOUR main challenge?            │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ Type your message...            [Send] │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### 6.4 Toolbox Panel States

**During PROBLEM_DISCOVERY:**
```
┌─────────────────────────────────────┐
│ 📦 New Toolbox              [v1]   │
├─────────────────────────────────────┤
│ Status: Understanding problem       │
│ ━━━━━━━━━━░░░░░░░░░░░ 15%          │
├─────────────────────────────────────┤
│                                     │
│ Problem:                            │
│ ┌─────────────────────────────────┐ │
│ │ "Managing invoices for my       │ │
│ │  freelance business"            │ │
│ │                     [Confirm ✓] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Target User:                        │
│ ┌─────────────────────────────────┐ │
│ │ ◯ Not yet defined               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Systems:                            │
│ ┌─────────────────────────────────┐ │
│ │ ◯ Not yet defined               │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**During SCENARIO_EXPLORATION:**
```
┌─────────────────────────────────────┐
│ 📦 Invoice Manager          [v1]   │
├─────────────────────────────────────┤
│ Status: Gathering scenarios (1/2)   │
│ ━━━━━━━━━━━━━━░░░░░░░ 35%          │
├─────────────────────────────────────┤
│                                     │
│ Problem: ✓ Confirmed                │
│                                     │
│ Scenarios:                          │
│ ┌─────────────────────────────────┐ │
│ │ ✓ 1. New client invoice         │ │◄─ Clickable (sets focus)
│ │   6 steps · 3 pain points       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ◐ 2. Overdue followup           │ │◄─ Currently defining
│ │   Defining steps...             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ + Add another scenario          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Tools: (waiting for scenarios)      │
│                                     │
└─────────────────────────────────────┘
```

**During TOOL_DEFINITION:**
```
┌─────────────────────────────────────┐
│ 📦 Invoice Manager          [v1]   │
├─────────────────────────────────────┤
│ Status: Defining tools (2/5)        │
│ ━━━━━━━━━━━━━━━━━━░░░ 60%          │
├─────────────────────────────────────┤
│                                     │
│ Problem: ✓ | Scenarios: ✓ 2         │
│                                     │
│ Tools:                              │
│ ┌─────────────────────────────────┐ │
│ │ ✓ lookup_client                 │ │
│ │   Ready for testing             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ◐ create_invoice        [FOCUS] │ │◄─ Highlighted (focused)
│ │   Defining inputs...            │ │
│ │   ━━━━━━━━░░░░ 50%              │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ○ send_email                    │ │
│ │   Not started                   │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ○ log_invoice                   │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ○ get_overdue_invoices          │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Tool Detail View (when tool is focused):**
```
┌─────────────────────────────────────┐
│ 🔧 create_invoice           [MOCK] │◄─ Toggle mock mode
├─────────────────────────────────────┤
│ Status: INPUTS_DEFINED              │
│ ━━━━━━━━━━━━░░░░ 60%               │
├─────────────────────────────────────┤
│                                     │
│ Purpose:                            │
│ Generate invoice PDF for a client   │
│                                     │
│ Inputs:                             │
│ ┌─────────────────────────────────┐ │
│ │ client_id (string) required     │ │
│ │ amount (number) required        │ │
│ │ description (string) required   │ │
│ │ due_date (string) optional      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Output:                             │
│ ┌─────────────────────────────────┐ │
│ │ ◯ Not yet defined               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Mock Examples:                      │
│ ┌─────────────────────────────────┐ │
│ │ ◯ None yet                      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [← Back to Tools List]              │
│                                     │
└─────────────────────────────────────┘
```

**Mock Testing View:**
```
┌─────────────────────────────────────┐
│ 🧪 Test: lookup_client      [MOCK] │
├─────────────────────────────────────┤
│                                     │
│ Input:                              │
│ ┌─────────────────────────────────┐ │
│ │ search_term: [Acme Corp    ]    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [▶ Run Mock]                        │
│                                     │
│ Output:                             │
│ ┌─────────────────────────────────┐ │
│ │ {                               │ │
│ │   "client_id": "client_001",    │ │
│ │   "name": "Acme Corp",          │ │
│ │   "email": "billing@acme.com",  │ │
│ │   "hourly_rate": 150            │ │
│ │ }                               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Does this look correct?             │
│ [👍 Yes] [👎 No, adjust]            │
│                                     │
└─────────────────────────────────────┘
```

### 6.5 Settings Modal

```
┌─────────────────────────────────────────┐
│ Settings                          [×]  │
├─────────────────────────────────────────┤
│                                         │
│ LLM Provider:                           │
│ ┌─────────────────────────────────────┐ │
│ │ ○ Anthropic (Claude)                │ │
│ │ ● OpenAI (GPT-4)                    │ │
│ │ ○ Other                             │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ API Key:                                │
│ ┌─────────────────────────────────────┐ │
│ │ sk-••••••••••••••••••••       [👁] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Model:                                  │
│ ┌─────────────────────────────────────┐ │
│ │ gpt-4-turbo                     [▼] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│                            [Save]       │
└─────────────────────────────────────────┘
```

---

## 7. LLM Adapter Layer

### 7.1 Interface

```typescript
interface LLMAdapter {
  // Send a chat completion request
  chat(request: ChatRequest): Promise<ChatResponse>;
  
  // Validate API key
  validateKey(key: string): Promise<boolean>;
  
  // Get available models
  getModels(): Promise<string[]>;
}

interface ChatRequest {
  model: string;
  systemPrompt: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

interface ChatResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}
```

### 7.2 Implementations

**AnthropicAdapter:**
```typescript
class AnthropicAdapter implements LLMAdapter {
  constructor(apiKey: string) { ... }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemPrompt,
        messages: request.messages,
        max_tokens: request.maxTokens || 4096
      })
    });
    // ... parse response
  }
}
```

**OpenAIAdapter:**
```typescript
class OpenAIAdapter implements LLMAdapter {
  constructor(apiKey: string) { ... }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          ...request.messages
        ],
        max_tokens: request.maxTokens || 4096
      })
    });
    // ... parse response
  }
}
```

### 7.3 Factory

```typescript
function createLLMAdapter(provider: string, apiKey: string): LLMAdapter {
  switch (provider) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey);
    case 'openai':
      return new OpenAIAdapter(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

---

## 8. Persistence Layer

### 8.1 File Structure

```
/memory (mounted volume)
└── /projects
    └── /{project_id}
        ├── project.json        # Project metadata
        ├── toolbox.json        # Current toolbox state
        ├── conversation.json   # Full chat history
        └── /exports
            ├── /v1
            │   ├── mcp_server.py
            │   ├── requirements.txt
            │   ├── Dockerfile
            │   └── README.md
            └── /v2
                └── ...
```

### 8.2 Operations

```typescript
interface ProjectStore {
  // List all projects
  list(): Promise<ProjectSummary[]>;
  
  // Create new project
  create(name: string, settings: ProjectSettings): Promise<Project>;
  
  // Load project
  load(id: string): Promise<{
    project: Project;
    toolbox: Toolbox;
    conversation: Conversation;
  }>;
  
  // Save toolbox state
  saveToolbox(id: string, toolbox: Toolbox): Promise<void>;
  
  // Append message to conversation
  appendMessage(id: string, message: Message): Promise<void>;
  
  // Save export
  saveExport(id: string, version: number, files: ExportFile[]): Promise<string>;
  
  // Delete project
  delete(id: string): Promise<void>;
}
```

### 8.3 Auto-save

- Toolbox state saved after every LLM response
- Conversation saved after every message (user and assistant)
- No manual save button needed
- Debounce writes to prevent excessive I/O

---

## 9. Mock System

### 9.1 Mock Modes

**Example-based Mock:**
- Uses predefined input/output pairs
- Returns exact match if found
- Returns closest match otherwise
- Fast, deterministic, free

**LLM-simulated Mock:**
- LLM generates realistic output based on tool definition and rules
- Can handle any input
- More realistic, better for edge cases
- Uses API calls (costs tokens)

### 9.2 Mock Execution Flow

```
User clicks "Run Mock"
        │
        ▼
Frontend sends to /api/mock/:toolId
{
  project_id: "...",
  tool_id: "...",
  input: { ... },
  mode: "example" | "llm"
}
        │
        ▼
Backend loads tool definition
        │
        ├─── mode: "example" ───┐
        │                       ▼
        │              Find matching example
        │              Return output or closest match
        │
        └─── mode: "llm" ──────┐
                               ▼
                      Build LLM prompt:
                      "Given this tool definition:
                       {tool}
                       And this input:
                       {input}
                       Generate a realistic output
                       following these rules:
                       {rules}"
                               │
                               ▼
                      LLM returns simulated output
        │
        ▼
Return mock result to frontend
```

### 9.3 Mock Prompt (for LLM mode)

```
You are simulating a tool for testing purposes.

TOOL DEFINITION:
Name: {name}
Purpose: {purpose}
Inputs: {inputs}
Output: {output}
Rules: {rules}

EXAMPLE OUTPUTS:
{examples}

USER INPUT:
{input}

Generate a realistic output that:
1. Matches the output schema exactly
2. Follows all the rules
3. Is consistent with the examples
4. Uses plausible/realistic data

Return ONLY the JSON output, no explanation.
```

---

## 10. Export System

### 10.1 Generated Files

**mcp_server.py:**
```python
"""
MCP Server: Invoice Manager
Generated by MCP Toolbox Builder
Version: 1
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Invoice Manager")


@mcp.tool()
def lookup_client(search_term: str) -> dict:
    """
    Find client information by name or email from the client database.
    
    Args:
        search_term: Client name or email to search for
    
    Returns:
        Client record with contact and billing info
    """
    # TODO: Implement actual logic
    # Mock implementation for testing:
    mock_clients = {
        "acme": {
            "client_id": "client_001",
            "name": "Acme Corp",
            "email": "billing@acme.com",
            "hourly_rate": 150,
            "address": "123 Main St, NYC"
        }
    }
    
    search_lower = search_term.lower()
    for key, client in mock_clients.items():
        if key in search_lower or search_lower in client["email"].lower():
            return client
    
    return {"error": "Client not found"}


@mcp.tool()
def create_invoice(client_id: str, amount: float, description: str, due_date: str = None) -> dict:
    """
    Generate invoice PDF for a client.
    
    Args:
        client_id: The client's ID
        amount: Invoice amount
        description: What the invoice is for
        due_date: Optional due date (YYYY-MM-DD)
    
    Returns:
        Invoice object with ID and status
    """
    # TODO: Implement actual logic
    import uuid
    from datetime import datetime, timedelta
    
    invoice_id = f"INV-{uuid.uuid4().hex[:6].upper()}"
    
    if due_date is None:
        due_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    
    return {
        "invoice_id": invoice_id,
        "client_id": client_id,
        "amount": amount,
        "description": description,
        "due_date": due_date,
        "status": "created"
    }


# Additional tools...


if __name__ == "__main__":
    mcp.run()
```

**requirements.txt:**
```
mcp>=0.1.0
fastmcp>=0.1.0
```

**Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mcp_server.py .

EXPOSE 8000

CMD ["python", "mcp_server.py"]
```

**README.md:**
```markdown
# Invoice Manager - MCP Server

Generated by MCP Toolbox Builder.

## Tools Included

1. **lookup_client** - Find client information by name or email
2. **create_invoice** - Generate invoice PDF for a client
3. **send_email** - Send email to client with optional attachment
4. **log_invoice** - Add invoice record to tracking sheet
5. **get_overdue_invoices** - List invoices past their due date

## Setup

### Option 1: Run Locally

```bash
pip install -r requirements.txt
python mcp_server.py
```

### Option 2: Run with Docker

```bash
docker build -t invoice-manager-mcp .
docker run -p 8000:8000 invoice-manager-mcp
```

### Option 3: Add to Claude Desktop

Add to your Claude Desktop config (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "invoice-manager": {
      "command": "python",
      "args": ["/path/to/mcp_server.py"]
    }
  }
}
```

## Customization

The generated code includes TODO comments where you should add your actual implementation logic. The mock data is included for testing.
```

**claude_desktop_config.json:**
```json
{
  "mcpServers": {
    "invoice-manager": {
      "command": "python",
      "args": ["mcp_server.py"]
    }
  }
}
```

### 10.2 Export API

```
POST /api/export/:projectId

Response:
{
  "version": 1,
  "files": [
    { "name": "mcp_server.py", "path": "/exports/v1/mcp_server.py" },
    { "name": "requirements.txt", "path": "/exports/v1/requirements.txt" },
    { "name": "Dockerfile", "path": "/exports/v1/Dockerfile" },
    { "name": "README.md", "path": "/exports/v1/README.md" }
  ],
  "download_url": "/api/export/:projectId/download/v1"
}

GET /api/export/:projectId/download/:version

Response: ZIP file containing all export files
```

---

## 11. Technical Stack

### 11.1 Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 18 |
| Build | Vite |
| Styling | CSS (minimal, inline or CSS modules) |
| State | React hooks (useState, useReducer, useContext) |
| HTTP | fetch API |

### 11.2 Backend

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20 |
| Framework | Express |
| Module system | ESM |

### 11.3 Infrastructure

| Component | Technology |
|-----------|------------|
| Container | Docker |
| Orchestration | Docker Compose |
| Web server | nginx (production frontend) |
| Persistence | File system (/memory volume) |

### 11.4 Development

| Component | Technology |
|-----------|------------|
| Package manager | pnpm |
| Hot reload | Vite (frontend), Node --watch (backend) |

---

## 12. Open Questions

### 12.1 Resolved

- ✅ LLM provider: Configurable (Claude, OpenAI, others)
- ✅ API key: User provides their own
- ✅ State machine: Prompt-driven, not code-driven
- ✅ Persistence: File system with mounted volume
- ✅ Mock system: Example-based + LLM-simulated
- ✅ Minimum scenarios: 2 required

### 12.2 To Decide During Implementation

1. **Session timeout** - How long before inactive project auto-saves and closes?

2. **Concurrent editing** - What if user opens same project in two tabs?

3. **Export format options** - Should we offer TypeScript MCP in addition to Python?

4. **Tool import** - Should users be able to import existing MCP tools?

5. **Collaboration** - Future feature: share projects with others?

6. **Usage tracking** - Should we track token usage per project?

---

## Appendix A: Example Conversation

```
[Project: New]
[Phase: PROBLEM_DISCOVERY]
[UI Focus: TOOLBOX]

🤖: Hi! I'm here to help you build a custom AI toolbox. 

    A toolbox is a set of tools that an AI assistant (like Claude) 
    can use to help you with specific tasks.

    For example, someone might build a toolbox for:
    - Managing customer emails
    - Tracking expenses
    - Scheduling appointments

    What problem would YOU like to solve?

👤: I do freelance design work and invoicing is a nightmare

🤖: Got it - invoicing for freelance work! That's a common pain point.

    Let me make sure I understand:
    
    **Problem:** Managing invoices for freelance design business
    
    A few quick questions:
    
    Who will use this toolbox - just you, or do you have a team?

👤: just me

🤖: Perfect, solo freelancer.

    What systems do you currently use for invoicing? For example:
    - Spreadsheets (Excel, Google Sheets)
    - Accounting software (QuickBooks, FreshBooks)
    - Email
    - Something else

👤: I use google sheets to track clients and another sheet for invoices. I email invoices as PDFs

🤖: Great, clear picture forming:

    **Problem:** Managing invoices for freelance design business
    **User:** Solo freelancer (you)
    **Systems:** Google Sheets (2: clients + invoices), Email, PDFs

    Does this summary look right? Anything to add or change?

👤: yeah thats right

🤖: Perfect! ✓ Problem captured.

    Now I'd like to understand HOW you actually deal with invoices 
    day-to-day. Real examples help me figure out exactly what 
    tools you need.

    Think of a recent time you had to create or send an invoice. 
    Walk me through what happened, step by step.

    For example: "A client emailed me, then I had to look them up, 
    then I created the invoice..."

[Phase changes to: SCENARIO_EXPLORATION]

👤: ok so last week a client finished a project and asked for an invoice. I had to go to my clients sheet, find their info, figure out how many hours I worked, create a PDF invoice, email it to them, then add it to my invoices sheet so I remember to follow up

🤖: Great example! Let me capture this:

    **Scenario 1: Client requests invoice after project**
    
    Steps:
    1. Receive request from client
    2. Look up client in Google Sheet
    3. Calculate hours worked
    4. Create invoice PDF
    5. Email invoice to client
    6. Log in invoices sheet for followup

    What's the most annoying part of this process?

👤: finding the client info takes forever because my sheet is a mess. and I always forget to log it in the tracking sheet

🤖: Noted! Pain points:
    - Client lookup is slow (messy sheet)
    - Forgetting to log for followup

    **Scenario 1: ✓ Captured**

    I need at least one more scenario to really understand your 
    workflow. 

    What about when something goes WRONG? Like:
    - A client doesn't pay on time
    - You need to send a reminder
    - An invoice has an error

    Any of those happen recently?

👤: oh yeah I had to chase someone for payment last month

🤖: Tell me about that - what did you do?

👤: I checked my invoices sheet and saw they were overdue, then I had to find their email, write a reminder, and then update the sheet that I followed up

🤖: Perfect, second scenario:

    **Scenario 2: Chasing overdue payment**
    
    Steps:
    1. Check invoices sheet for overdue items
    2. Look up client contact info
    3. Write and send reminder email
    4. Update sheet with followup date

    Pain points?

👤: remembering to check for overdue invoices. and writing the reminder email is awkward

🤖: Got it:
    - Easy to miss overdue invoices
    - Reminder emails are uncomfortable to write

    **Scenario 2: ✓ Captured**

    Excellent! I now have a clear picture:

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    📋 SCENARIOS SUMMARY
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    1. **New invoice request**
       Client asks for invoice → lookup → create → send → log
       Pain: slow lookup, forget to log
    
    2. **Overdue payment followup**  
       Check overdue → lookup → remind → update
       Pain: miss overdue, awkward emails
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Does this capture your main workflows? Or is there another 
    important scenario I'm missing?

👤: no that covers it

🤖: Great! Now I can propose tools.

[Phase changes to: TOOLS_PROPOSAL]

    Based on your scenarios, I recommend these 5 tools:

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    📦 PROPOSED TOOLS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    1. **lookup_client**
       Find client info by name or email
       → Used in: Scenario 1 (step 2), Scenario 2 (step 2)
       → Solves: "lookup takes forever"

    2. **create_invoice**
       Generate invoice with client/project details
       → Used in: Scenario 1 (step 4)

    3. **send_email**
       Send email to client (with optional attachment)
       → Used in: Scenario 1 (step 5), Scenario 2 (step 3)
       → Can include pre-written reminder templates

    4. **log_invoice**
       Add record to your tracking sheet
       → Used in: Scenario 1 (step 6), Scenario 2 (step 4)
       → Solves: "forget to log"

    5. **get_overdue_invoices**
       List all unpaid invoices past due date
       → Used in: Scenario 2 (step 1)
       → Solves: "miss overdue invoices"

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    What do you think? Should I add, remove, or change any tools?

👤: that looks good actually

🤖: Perfect! ✓ Tool list confirmed.

    Now let's define each tool in detail. I'll start with 
    **lookup_client** since it's used in both scenarios.

[Phase changes to: TOOL_DEFINITION]
[UI Focus changes to: TOOL (lookup_client)]

    **lookup_client** - Find client information

    What should you be able to search by? For example:
    - Client name ("Acme Corp")
    - Email ("john@acme.com")  
    - Both

👤: both would be good

🤖: Great. So the input is:

    - `search_term` (text, required) - client name OR email

    When you find a client, what info do you need back? 
    
    Looking at your scenarios, you need:
    - Contact info (for emailing)
    - Rate info (for invoicing)

    What fields are in your client sheet?

👤: name, email, hourly rate, address

🤖: Perfect. So the output would be:

    ```
    {
      "client_id": "...",
      "name": "Acme Corp",
      "email": "john@acme.com",
      "hourly_rate": 150,
      "address": "123 Main St"
    }
    ```

    Does that look right?

👤: yeah

🤖: Great! Now let's create a mock example so we can test it.

    Give me a real (or realistic) client from your sheet:

👤: Webflow Agency, hello@webflow.agency, $175/hr

🤖: Got it. And what about a second example? Maybe a smaller client 
    with a different rate?

👤: Bob's Bakery, bob@bobsbakery.com, $100/hr, 456 Oak Ave

🤖: Perfect! I've set up the mock:

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    🔧 lookup_client - READY TO TEST
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    Purpose: Find client by name or email
    Input: search_term (text)
    Output: client record
    
    Mock examples:
    ✓ "Webflow" → Webflow Agency, $175/hr
    ✓ "bob@bobsbakery.com" → Bob's Bakery, $100/hr
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Try it out in the panel on the right! Click "Run Mock" with 
    different search terms.

    Once you're happy with it, we'll move to the next tool.

[... conversation continues for each tool ...]
```

---

## Appendix B: File Checklist for Implementation

```
project_mcp_toolbox_builder/
├── README.md
├── .env.example
├── .dockerignore
├── docker-compose.yml
├── docker-compose.dev.yml
│
├── apps/
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.js              # Express app entry
│   │       ├── routes/
│   │       │   ├── chat.js            # POST /api/chat
│   │       │   ├── projects.js        # CRUD /api/projects
│   │       │   ├── mock.js            # POST /api/mock/:toolId
│   │       │   └── export.js          # GET /api/export/:id
│   │       ├── services/
│   │       │   ├── llm/
│   │       │   │   ├── adapter.js     # LLM interface
│   │       │   │   ├── anthropic.js   # Claude implementation
│   │       │   │   └── openai.js      # OpenAI implementation
│   │       │   ├── conversation.js    # Build LLM requests
│   │       │   ├── state.js           # Apply state updates
│   │       │   └── export.js          # Generate MCP code
│   │       ├── store/
│   │       │   └── projects.js        # File system persistence
│   │       └── prompts/
│   │           ├── system.js          # Main system prompt
│   │           └── phases.js          # Phase-specific additions
│   │
│   └── frontend/
│       ├── Dockerfile
│       ├── package.json
│       ├── vite.config.js
│       ├── index.html
│       ├── nginx.conf
│       └── src/
│           ├── main.jsx
│           ├── App.jsx
│           ├── index.css
│           ├── components/
│           │   ├── ProjectList.jsx
│           │   ├── ChatPanel.jsx
│           │   ├── ToolboxPanel.jsx
│           │   ├── ToolDetail.jsx
│           │   ├── MockTester.jsx
│           │   ├── SettingsModal.jsx
│           │   └── ScenarioCard.jsx
│           ├── hooks/
│           │   ├── useProject.js
│           │   ├── useChat.js
│           │   └── useSettings.js
│           └── api/
│               └── client.js          # API calls
│
└── memory/                            # Mounted volume (not in repo)
    └── projects/
```

---

*End of Design Specification*
