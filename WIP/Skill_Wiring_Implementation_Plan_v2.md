# Skill Wiring Implementation Plan v2
## DAL (Domain Abstraction Layer) Integration into Core ADAS

**Date:** January 14, 2026
**Version:** 2.0 (Post ChatGPT Review)
**Status:** Final Draft for Implementation

---

## 1. Executive Summary

This document describes how Skills defined in the **Skill Builder** (`adas_mcp_toolbox_builder` repo) wire into **Core ADAS** (the runtime agent / `ai-dev-assistant` repo) at execution time.

### Terminology

| Term | Repo | Description |
|------|------|-------------|
| **Skill Builder** | `adas_mcp_toolbox_builder` | UI for creating skill definitions (domain.yaml) |
| **Core ADAS** | `ai-dev-assistant` | Runtime agent that executes skills |
| **DAL** | N/A | Domain Abstraction Layer - the skill definition format |

### Key Principles (Agreed)

1. **Minimize RV2 prompt pollution** — inject only ~100 tokens for guardrails
2. **Use existing LLM calls** — don't add unnecessary calls
3. **Mechanical enforcement where possible** — JS checks at pre-tool gate
4. **Dedicated Finalization Gate** — separate from Reply Polisher
5. **Compilation in Core bootstrap** — not in Skill Builder
6. **Narrow compilation scope** — only permissions + approvals, not semantic rules

---

## 2. Architecture Overview

### 2.1 Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. DETECT INTENT                                               │
│     Location: detectIntent.js                                   │
│     LLM: Yes (once per job)                                     │
│     Skill data used: intents, entities, out_of_domain           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. BOOTSTRAP                                                   │
│     Location: highLevelPlan.js                                  │
│     LLM: No                                                     │
│     Actions:                                                    │
│       - Load skill YAML                                         │
│       - Convert workflows → SGs                                 │
│       - Compile guardrails (narrow scope)                       │
│       - Prepare tool allow/deny lists                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. RV2 MAIN LOOP                                               │
│     Location: mainloop.js + realPlanner.js                      │
│     LLM: Yes (MANY iterations - EXPENSIVE, PROTECT THIS!)       │
│     Skill data injected: ~100 tokens guardrails only            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. PRE-TOOL GATE                                               │
│     Location: executeToolStep.js (before fn() call)             │
│     LLM: No                                                     │
│     Checks:                                                     │
│       - tool.policy.allowed                                     │
│       - tool.policy.requires_approval                           │
│       - Compiled guardrails (JS)                                │
│       - Approval thresholds                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. FINALIZATION GATE (NEW)                                     │
│     Location: NEW FILE - finalizationGate.js                    │
│     LLM: Yes (once per job, small focused prompt)               │
│     Configurable: enabled/disabled via skill YAML               │
│     Checks:                                                     │
│       - Goal coverage                                           │
│       - Guardrails compliance                                   │
│       - Output contract fields                                  │
│     Retry: max_retries with require_new_evidence                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. REPLY POLISHER                                              │
│     Location: existing reply polisher                           │
│     LLM: Yes (once per job)                                     │
│     Job: Format only                                            │
│       - Apply role.persona                                      │
│       - Make user-friendly                                      │
│     NOT a validator (that's Finalization Gate's job)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                        Output to User
```

### 2.2 LLM Calls Summary

| Stage | LLM Calls | New? |
|-------|-----------|------|
| Detect Intent | 1 | No (exists) |
| Bootstrap | 0 | No |
| RV2 Loop | N iterations | No (exists) |
| Pre-tool Gate | 0 | No |
| Finalization Gate | 1 | **YES (new)** |
| Reply Polisher | 1 | No (exists) |
| **Total new LLM calls** | **1** | |

---

## 3. Skill YAML Structure (What Skill Author Defines)

### 3.1 Complete Relevant Fields

```yaml
# ============================================================
# PROBLEM & ROLE (used by Finalization Gate + Reply Polisher)
# ============================================================
problem:
  statement: "Help customers track orders and process refunds"
  goals:
    - "Reduce response time"
    - "Increase satisfaction"

role:
  name: "Support Agent"
  persona: "Friendly and empathetic customer support specialist"

# ============================================================
# INTENTS (used by Detect Intent)
# ============================================================
intents:
  supported:
    - id: intent_refund
      description: "Customer wants refund"
      examples:
        - "I want my money back"
        - "Refund please"
      entities:
        - name: order_id
          type: string
          required: true
  out_of_domain:
    action: redirect
    message: "I can only help with orders and refunds"

# ============================================================
# TOOLS (used by Pre-tool Gate)
# ============================================================
tools:
  - name: process_refund
    description: "Process a customer refund"
    inputs:
      - name: order_id
        type: string
        required: true
      - name: amount
        type: number
        required: true
    output:
      type: object
      description: "Refund result"
    policy:
      allowed: always          # always | conditional | never
      requires_approval: conditional
      condition: "amount > 500"

# ============================================================
# POLICY (used by Bootstrap + Pre-tool Gate + Finalization Gate)
# ============================================================
policy:
  guardrails:
    never:
      - "Never share customer payment information"
      - "Never process refunds over $500 without supervisor approval"
      - "Never be dismissive to frustrated customers"
    always:
      - "Always verify customer identity before account access"
      - "Always confirm before making changes"

  workflows:
    - name: "Refund Processing"
      steps:
        - "verify_identity"
        - "check_eligibility"
        - "process_refund"
      required: true

  approvals:
    - tool_id: process_refund
      when: "amount > 500"
      action: require_approval
      approver: supervisor

# ============================================================
# OUTPUT CONTRACT (used by Finalization Gate)
# ============================================================
output_contract:
  required_fields:
    - order_id
    - status
    - next_steps

# ============================================================
# ENGINE CONFIG (includes Finalization Gate settings)
# ============================================================
engine:
  model: "claude-3-sonnet"
  temperature: 0.7

  finalization_gate:
    enabled: true       # true = run gate, false = skip
    max_retries: 2      # max replan attempts if gate fails
    # require_new_evidence is HARD-CODED true in Core ADAS
```

### 3.2 What Skill Author Must Define

| Field | Required? | Purpose |
|-------|-----------|---------|
| `problem.statement` | Yes | Goal coverage check |
| `problem.goals` | No | Additional goal validation |
| `role.persona` | No | Reply Polisher formatting |
| `intents.supported[]` | Yes | Intent detection |
| `tools[]` | Yes | Tool registry |
| `tools[].policy` | No | Pre-tool gate checks |
| `policy.guardrails` | No | RV2 injection + Gate validation |
| `policy.workflows` | No | Converts to HLR SGs |
| `policy.approvals` | No | Approval flow triggers |
| `output_contract` | No | Finalization Gate validation |
| `engine.finalization_gate` | No | Gate configuration (defaults to enabled) |

---

## 4. Implementation Details by Component

### 4.1 Bootstrap (Core ADAS)

**File:** `highLevelPlan.js` (modify existing)

**What happens:**

```javascript
async function bootstrapSkill(job, skill) {
  // 1. Convert workflows to SGs
  if (skill.policy?.workflows) {
    job.state.hlr.contract.sgs = convertWorkflowsToSGs(skill.policy.workflows);
  }

  // 2. Compile guardrails (NARROW SCOPE ONLY)
  job.__compiledGuardrails = compileGuardrails(skill.policy?.guardrails);

  // 3. Prepare tool permissions
  job.__toolPermissions = buildToolPermissions(skill.tools);

  // 4. Store text guardrails for RV2 injection
  job.__textGuardrails = extractTextGuardrails(skill.policy?.guardrails);
}
```

**Guardrail Compilation (NARROW SCOPE):**

```javascript
function compileGuardrails(guardrails) {
  const compiled = [];

  for (const rule of [...(guardrails?.never || []), ...(guardrails?.always || [])]) {
    // ONLY compile these patterns:

    // Pattern 1: "Never use [tool]"
    const toolDeny = rule.match(/never use (\w+)/i);
    if (toolDeny) {
      compiled.push({
        type: 'tool_deny',
        tool: toolDeny[1],
        original: rule
      });
      continue;
    }

    // Pattern 2: "[field] > [number]" threshold
    const threshold = rule.match(/(\w+)\s*(>|<|>=|<=)\s*(\d+)/);
    if (threshold) {
      compiled.push({
        type: 'threshold',
        field: threshold[1],
        operator: threshold[2],
        value: parseFloat(threshold[3]),
        original: rule
      });
      continue;
    }

    // Pattern 3: Tool requires approval
    const approval = rule.match(/(\w+).*(?:needs?|requires?)\s*approval/i);
    if (approval) {
      compiled.push({
        type: 'requires_approval',
        tool: approval[1],
        original: rule
      });
      continue;
    }

    // Everything else stays as TEXT for LLM
    // (semantic rules like "never be dismissive")
  }

  return compiled;
}
```

**What compiles vs stays as text:**

| Rule | Compiles? | Type |
|------|-----------|------|
| "Never use deleteFile" | Yes | `tool_deny` |
| "amount > 500 needs approval" | Yes | `threshold` |
| "process_refund requires approval" | Yes | `requires_approval` |
| "Never share payment info" | No | Text → RV2 + Gate |
| "Never be dismissive" | No | Text → RV2 + Gate |
| "Always verify identity first" | No | Text → RV2 + Gate |

---

### 4.2 RV2 Prompt Injection

**File:** `realPlanner.js` or `buildAgentState.js` (modify existing)

**What gets injected:**

```javascript
function buildAgentState(job) {
  return {
    // ... existing fields ...

    job: {
      // ... existing fields ...

      // NEW: Inject text guardrails (~100 tokens max)
      guardrails: job.__textGuardrails?.slice(0, 10) // Cap at 10 rules
    }
  };
}
```

**In the prompt:**

```
SKILL GUARDRAILS:
- Never share customer payment information
- Never be dismissive to frustrated customers
- Always verify customer identity before account access
- Always confirm before making changes
```

**Token budget:** ~10-15 tokens per rule × 10 rules = ~100-150 tokens

---

### 4.3 Pre-Tool Gate

**File:** `executeToolStep.js` (modify existing)

**Add before `fn()` call:**

```javascript
async function executeToolStep(step, job, deps) {
  const { tool, args } = step;

  // ========== PRE-TOOL GATE (NEW) ==========

  // 1. Check tool.policy.allowed
  const toolDef = job.__skill?.tools?.find(t => t.name === tool);
  if (toolDef?.policy?.allowed === 'never') {
    return {
      ok: false,
      error: `Tool "${tool}" is not allowed by skill policy`
    };
  }

  // 2. Check compiled guardrails
  for (const guard of job.__compiledGuardrails || []) {
    if (guard.type === 'tool_deny' && guard.tool === tool) {
      return {
        ok: false,
        error: `Blocked by guardrail: ${guard.original}`
      };
    }

    if (guard.type === 'threshold') {
      const value = args[guard.field];
      if (value !== undefined && !evaluateThreshold(value, guard.operator, guard.value)) {
        return {
          ok: false,
          error: `Threshold exceeded: ${guard.original}`
        };
      }
    }
  }

  // 3. Check approval requirements
  const approvalNeeded = checkApprovalRequired(tool, args, job.__skill);
  if (approvalNeeded.required && !job.approved) {
    return {
      ok: false,
      paused: true,
      approval_request: {
        tool,
        args,
        reason: approvalNeeded.reason,
        approver: approvalNeeded.approver
      }
    };
  }

  // ========== END PRE-TOOL GATE ==========

  // Continue with existing execution...
  const result = await fn(args, job, deps);
  return result;
}

function evaluateThreshold(value, operator, threshold) {
  switch (operator) {
    case '>': return value <= threshold;  // Inverted: rule says "if > X, block"
    case '<': return value >= threshold;
    case '>=': return value < threshold;
    case '<=': return value > threshold;
    default: return true;
  }
}

function checkApprovalRequired(tool, args, skill) {
  // Check policy.approvals[]
  const approvals = skill?.policy?.approvals || [];
  for (const rule of approvals) {
    if (rule.tool_id === tool) {
      // Parse simple condition like "amount > 500"
      const match = rule.when?.match(/(\w+)\s*(>|<|>=|<=)\s*(\d+)/);
      if (match) {
        const [_, field, op, val] = match;
        const argVal = args[field];
        if (argVal !== undefined) {
          const exceeds = evaluateCondition(argVal, op, parseFloat(val));
          if (exceeds) {
            return {
              required: true,
              reason: rule.when,
              approver: rule.approver
            };
          }
        }
      }
    }
  }
  return { required: false };
}
```

---

### 4.4 Finalization Gate (NEW)

**File:** NEW - `finalizationGate.js`

**Location:** `apps/backend/worker/finalizationGate.js`

```javascript
/**
 * Finalization Gate - Validates final response before Reply Polisher
 *
 * Checks:
 * - Goal coverage (does response address problem.statement?)
 * - Guardrails compliance (semantic rules from skill)
 * - Output contract (required_fields present?)
 *
 * Returns structured result with enums + detail text
 */

const REASON_CODES = {
  GOAL_NOT_MET: 'GOAL_NOT_MET',
  GUARDRAIL_VIOLATED: 'GUARDRAIL_VIOLATED',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  OUTPUT_INCOMPLETE: 'OUTPUT_INCOMPLETE',
  TONE_MISMATCH: 'TONE_MISMATCH'
};

const ACTION_CODES = {
  TOOL_CALL: 'TOOL_CALL',
  CLARIFY_USER: 'CLARIFY_USER',
  REWRITE: 'REWRITE',
  ESCALATE: 'ESCALATE'
};

async function runFinalizationGate(draftResponse, job, skill, deps) {
  // Check if gate is enabled
  const gateConfig = skill?.engine?.finalization_gate;
  if (gateConfig?.enabled === false) {
    return { passed: true, skipped: true };
  }

  // Build gate prompt
  const prompt = buildGatePrompt(draftResponse, job, skill);

  // Call LLM (small, focused)
  const result = await deps.llm.call({
    model: 'claude-3-haiku', // Fast, cheap model for gate
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
    response_format: 'json'
  });

  // Parse structured response
  return parseGateResponse(result);
}

function buildGatePrompt(draftResponse, job, skill) {
  const goal = skill?.problem?.statement || job.goal;
  const guardrails = [
    ...(skill?.policy?.guardrails?.never || []).map(r => `NEVER: ${r}`),
    ...(skill?.policy?.guardrails?.always || []).map(r => `ALWAYS: ${r}`)
  ];
  const requiredFields = skill?.output_contract?.required_fields || [];

  return `You are a Finalization Gate. Validate this response before it goes to the user.

GOAL:
${goal}

GUARDRAILS TO CHECK:
${guardrails.map(g => `- ${g}`).join('\n')}

REQUIRED FIELDS IN RESPONSE:
${requiredFields.map(f => `- ${f}`).join('\n')}

DRAFT RESPONSE:
${draftResponse}

VALIDATE and return JSON:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasons": [
    {
      "code": "GOAL_NOT_MET|GUARDRAIL_VIOLATED|MISSING_REQUIRED_FIELD|OUTPUT_INCOMPLETE|TONE_MISMATCH",
      "detail": "Specific explanation"
    }
  ],
  "missing_fields": ["field1", "field2"],
  "suggested_action": "TOOL_CALL|CLARIFY_USER|REWRITE|ESCALATE"
}

Be strict but fair. Only fail if there's a real problem.`;
}

async function runGateWithRetry(draftResponse, job, skill, deps) {
  const maxRetries = skill?.engine?.finalization_gate?.max_retries ?? 2;
  let attempts = 0;
  let lastResult = null;

  while (attempts <= maxRetries) {
    const result = await runFinalizationGate(draftResponse, job, skill, deps);
    lastResult = result;

    if (result.passed) {
      return { passed: true, response: draftResponse };
    }

    attempts++;

    if (attempts > maxRetries) {
      // Max retries exceeded - escalate or return with warning
      return {
        passed: false,
        escalate: true,
        result: lastResult,
        response: draftResponse,
        warning: 'Finalization Gate failed after max retries'
      };
    }

    // HARD-CODED: require_new_evidence = true
    // Replan must call tool or ask user
    const replanResult = await triggerReplan(lastResult, job, deps);

    if (!replanResult.newEvidence) {
      // No new evidence gathered - stop retrying
      return {
        passed: false,
        result: lastResult,
        response: draftResponse,
        warning: 'Replan did not gather new evidence'
      };
    }

    // Get new draft response after replan
    draftResponse = replanResult.newResponse;
  }

  return { passed: false, result: lastResult };
}

module.exports = {
  runFinalizationGate,
  runGateWithRetry,
  REASON_CODES,
  ACTION_CODES
};
```

---

### 4.5 Reply Polisher (Modify Existing)

**File:** existing reply polisher location

**Change:** Remove validation logic, keep only formatting

```javascript
async function polishReply(response, job, skill, deps) {
  const persona = skill?.role?.persona || 'helpful assistant';

  const prompt = `You are a reply formatter.

PERSONA: ${persona}

FORMAT this response to be user-friendly. Apply the persona tone.
Do NOT validate or change the content, only format it.

RESPONSE TO FORMAT:
${response}

Return the formatted response text only.`;

  const result = await deps.llm.call({
    messages: [{ role: 'user', content: prompt }]
  });

  return result;
}
```

---

### 4.6 Workflow → SG Conversion

**File:** `highLevelPlan.js`

```javascript
function convertWorkflowsToSGs(workflows) {
  const sgs = [];

  for (const workflow of workflows) {
    if (!workflow.steps?.length) continue;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      sgs.push({
        id: `sg_${workflow.name}_${i + 1}`,
        intent: step,
        depends_on: i > 0 ? [`sg_${workflow.name}_${i}`] : [],
        status: 'todo',
        from_workflow: workflow.name,
        workflow_required: workflow.required || false
      });
    }
  }

  return sgs;
}
```

---

## 5. Integration Points Summary

### 5.1 What Changes in Core ADAS (ai-dev-assistant repo)

| File | Change | Effort |
|------|--------|--------|
| `highLevelPlan.js` | Add skill bootstrap, compile guardrails, workflow→SG | Medium |
| `buildAgentState.js` | Inject text guardrails to RV2 prompt | Small |
| `executeToolStep.js` | Add pre-tool gate checks | Medium |
| `finalizationGate.js` | **NEW FILE** - Gate logic + retry | Medium |
| Reply Polisher | Remove validation, keep formatting only | Small |

### 5.2 What Changes in Skill Builder (adas_mcp_toolbox_builder repo)

| File | Change | Effort |
|------|--------|--------|
| `DraftDomain.js` (types) | Add `output_contract`, `finalization_gate` fields | Small |
| `export.js` | Export new fields to domain.yaml | Small |
| `dalSystem.js` | Guide user to define output contract | Small |
| Schema validator | Validate new fields | Small |

### 5.3 Skill YAML Schema Additions

```yaml
# NEW: Output Contract
output_contract:
  required_fields:
    - field_name_1
    - field_name_2

# NEW: Finalization Gate Config
engine:
  finalization_gate:
    enabled: true
    max_retries: 2
```

---

## 6. Testing Plan

### 6.1 Unit Tests

| Component | Test |
|-----------|------|
| `compileGuardrails()` | Verify correct patterns compile, others stay text |
| Pre-tool gate | Verify blocks denied tools, triggers approvals |
| Finalization Gate | Verify pass/fail with various responses |
| Workflow→SG | Verify correct SG structure with depends_on |

### 6.2 Integration Tests

| Scenario | Expected |
|----------|----------|
| Skill with `finalization_gate.enabled: false` | Gate skipped |
| Skill with guardrail "never use deleteFile" | Tool blocked at pre-tool |
| Skill with approval rule | Job pauses for approval |
| Finalization Gate fails 3 times | Escalate or return with warning |

---

## 7. Migration Path

### Phase 1: Core Infrastructure (Core ADAS)
1. Add `finalizationGate.js` to Core ADAS
2. Modify `executeToolStep.js` for pre-tool gate
3. Modify `highLevelPlan.js` for skill bootstrap

### Phase 2: Schema Updates (Skill Builder)
1. Add new fields to Skill Builder types
2. Update export to include new fields
3. Update DAL system prompt

### Phase 3: Testing & Refinement
1. Create test skill with all features
2. Test gate behavior
3. Tune compilation patterns

---

## 8. Open Questions / Future Considerations

| Question | Current Decision | Future Option |
|----------|------------------|---------------|
| Gate strictness levels? | Not implemented | Add `strictness: low\|medium\|high` |
| Custom reason codes? | Hard-coded enums | Allow skill-specific codes |
| Gate model selection? | Hard-coded Haiku | Add `gate_model` config |
| Approval UX? | Pause job | Integrate with external systems |

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **Skill Builder** | Toolbox Builder UI - `adas_mcp_toolbox_builder` repo |
| **Core ADAS** | Runtime Agent - `ai-dev-assistant` repo |
| **DAL** | Domain Abstraction Layer - skill definition format |
| **RV2** | Main reasoning loop in Core ADAS |
| **HLR** | High-Level Reasoning - replan/reflection system |
| **Finalization Gate** | New LLM validator before Reply Polisher |
| **Pre-tool Gate** | Mechanical checks before tool execution |
| **Reply Polisher** | Final LLM for formatting (not validation) |
| **Skill YAML** | The domain.yaml file exported from Skill Builder |

---

## 10. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 14, 2026 | Initial draft |
| 2.0 | Jan 14, 2026 | Post ChatGPT review - separated Finalization Gate from Reply Polisher, narrowed compilation scope, added retry bounds |
| 2.1 | Jan 14, 2026 | Fixed terminology - "Skill Builder" instead of incorrect "CODE ADAS" |
