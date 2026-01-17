# DAL-Agent Responsibility & Skill Builder Contract
Generated: 2026-01-17
Updated: 2026-01-18 - Added implementation mapping

## Purpose of this document
This document defines clear responsibility boundaries between:
- Skill Builders (humans using the Toolbox Builder UI)
- The DAL-Agent (the LLM conversation system)
- The Orchestration Layer (state management, phases, validation)
- The UI (React frontend)

It exists to ensure that skill builders never need to understand pause logic, DAL state, or iteration control, while the platform remains robust, policy-driven, and scalable.

---

## Implementation Mapping

> **IMPORTANT FOR AI ASSISTANTS:** The DAL-Agent is NOT a separate service. It IS the existing conversation system in the Toolbox Builder.

| Concept | Implementation | File(s) |
|---------|----------------|---------|
| **DAL-Agent** | LLM conversation system | `prompts/dalSystem.js`, `services/conversation.js` |
| **Skill Builder** | Human user | (interacts via UI) |
| **Orchestration** | State & phase management | `services/state.js` |
| **UI** | React frontend | `apps/frontend/` |

### How the DAL-Agent Works

The DAL-Agent is the LLM (Claude) running with the `dalSystem.js` prompt. It:

1. **Detects missing info** by analyzing the current DraftDomain state
2. **Asks the user** by returning a message with `input_hint` (selection options or text prompt)
3. **"Pauses"** implicitly - the conversation is stateless; it waits for the next user message
4. **"Resumes"** when the user responds - processes their input and updates state
5. **Enforces policy** via prompt rules (never proceed without confirmation, always give examples)

There is no explicit pause/resume mechanism because the conversation naturally pauses between messages.

---

## Core Principle (Invariant)

Skill builders must never reason about job pausing, iteration budgets, DAL states, or UI rendering.

Those are platform concerns, owned by the DAL-Agent and orchestration layer.

---

## High-Level Architecture Overview

Skill Builder:
- declares requirements
- defines business logic
- calls domain tools

DAL-Agent (built-in):
- detects missing inputs
- asks the user
- pauses and resumes jobs
- deduplicates prompts
- enforces policy

Orchestration / RV2 Engine:
- iteration control
- loop breaking
- worker lifecycle

UI:
- renders user-input widget
- submits structured input

---

## What Skill Builders MUST Do

Skill builders only describe what is required, never how to obtain it.

Allowed responsibilities:
- Define required inputs (schema-level)
- Define business rules
- Define tool calls assuming required inputs exist

Example (conceptual):
```yaml
required_fields:
  - identity.full_name
  - identity.email_or_phone
```

---

## What Skill Builders MUST NOT Do

Skill builders must NOT:
- call askUser directly
- manage pause or resume logic
- handle iteration limits
- inspect DAL state
- depend on internal flags like _meta.deferred
- reason about job status
- emit or interpret INTERNAL_ERROR or USER_ACTION_REQUIRED

All of the above is strictly platform-owned.

---

## DAL-Agent Responsibilities (Authoritative)

The DAL-Agent owns the full lifecycle of user-input requirements.

Detection:
- inspects tool schemas and skill requirements
- detects missing required fields before execution

Asking the user:
- generates a user prompt
- assigns a WAIT_REASON_CODE
- lists requested_fields
- deduplicates repeated asks

Pausing the job:
- persists job state:
  - status = paused
  - outcome_class = USER_ACTION_REQUIRED
  - waiting object
- signals orchestration to stop iterating immediately

Resuming the job:
- validates user response
- updates job context
- clears waiting state
- re-queues the job for execution

Policy enforcement:
- no iteration burn while waiting
- no worker blocking
- consistent UX across skills

---

## Job State Contract (DAL to Engine to UI)

When waiting for user input, the DAL-Agent persists:

```json
{
  "status": "paused",
  "outcome_class": "USER_ACTION_REQUIRED",
  "waiting": {
    "reason_code": "IDENTITY_VERIFICATION_REQUIRED",
    "requested_fields": ["full_name", "email_or_phone"],
    "prompt_message": "Please provide your details to continue",
    "correlation_id": "<uuid>",
    "created_at": "<timestamp>",
    "last_prompt_at": "<timestamp>"
  }
}
```

This contract is explicit and stable.

---

## UI Contract

The UI must render the user-input widget if and only if:
- job.status == paused
- job.outcome_class == USER_ACTION_REQUIRED
- job.waiting.reason_code exists

The UI renders fields from requested_fields and submits structured input.

---

## Why Skill Builders Should NOT Call askUser

Direct calls expose control-flow semantics and leak orchestration concepts.

Instead:
- DAL-Agent owns prompting
- Skill builders remain declarative

This guarantees no busy loops, no budget exhaustion, and consistent behavior.

---

## Error Classification Boundary

Waiting for user input is not an error.

- USER_ACTION_REQUIRED is normal and expected
- INTERNAL_ERROR is reserved for platform failures

Skill builders never emit or handle these.

---

## Acceptance Criteria

This design is correct if:
- No skill code references pause or resume mechanics
- No skill can cause ENGINE_BUDGET_EXHAUSTED by missing input
- All user-input flows pause deterministically
- UI widget appears consistently
- Jobs resume cleanly on user input

---

## Skill Author Guide

### The One Rule

> **"Define what you need; the platform asks for it."**

Skill authors never call `askUser`. They declare requirements, and the platform handles the rest.

### Mental Model

When building a skill, think:

| Think This | NOT This |
|------------|----------|
| "My tool requires `order_id`" | "I need to ask the user for the order ID" |
| "Identity must be verified first" | "I need to pause and wait for identity" |
| "Refund requires reason + photos" | "I need to handle missing photos gracefully" |

The platform will:
1. Detect missing required inputs
2. Pause the job
3. Show the user an input UI
4. Collect structured input
5. Resume with fields populated

You never worry about iteration loops, budgets, or UI rendering.

### Example: Order Status Check

**What the skill author defines:**

```yaml
tools:
  - name: check_order_status
    inputs:
      - name: order_id
        type: string
        required: true
        description: "Order number to look up"

policy:
  guardrails:
    always:
      - "Verify customer identity before accessing order details"
```

**What happens at runtime:**

1. User: "What's my order status?"
2. Platform detects: `order_id` is required but missing
3. Platform pauses job, shows input UI: "Please provide your order number"
4. User enters: "ORD-12345"
5. Platform resumes job with `order_id = "ORD-12345"`
6. Skill executes `check_order_status` with populated input

The skill author never wrote any pause/resume logic.

### Example: Identity Verification

**What the skill author defines:**

```yaml
policy:
  guardrails:
    always:
      - "Always verify customer identity before accessing account details"

# Optional: hint for better UX (platform can use this)
required_inputs:
  - path: identity.email_or_phone
    prompt: "Please provide your email or phone number for verification"
```

**What happens at runtime:**

1. User: "Can you check my account balance?"
2. Platform detects: guardrail requires identity verification
3. Platform pauses, asks for email/phone
4. User provides: "john@example.com"
5. Platform resumes with identity populated
6. Skill proceeds with verified identity

### What If I Want Custom Prompt Text?

You can provide **declarative hints** (optional):

```yaml
required_inputs:
  - path: order_id
    prompt: "What's your order number? You can find it in your confirmation email."
  - path: refund_reason
    prompt: "Please describe why you'd like a refund"
    input_type: text  # vs "choice" for multiple choice
```

But you still don't control WHEN or HOW the platform asks. You just provide the copy.

### Summary for Skill Authors

| Do | Don't |
|----|-------|
| Define tool inputs with `required: true` | Call `askUser` or `sys.askUser` |
| Define guardrails (always/never) | Write pause/resume logic |
| Define approval rules | Check job status |
| Optionally hint prompt text | Manage iteration budgets |
| Trust the platform | Reason about DAL state |

---

## Summary

Skill builders describe what they need.
The DAL-Agent decides how to get it.
The engine decides when to run.
The UI decides how to render.

This separation is intentional and must not be violated.
