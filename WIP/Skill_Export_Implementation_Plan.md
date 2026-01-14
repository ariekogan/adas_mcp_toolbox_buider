# Skill Export Implementation Plan

**Purpose:** Bridge the gap between Skill Builder export and Core ADAS skill bootstrap requirements.

**Created:** January 14, 2026

---

## 1. Current State Analysis

### Skill Builder Exports (Current)

The `generateDomainYaml()` function in `/apps/backend/src/services/export.js` produces:

```yaml
name: "..."
version: 1
phase: "..."
problem:
  statement: "..."
  context: "..."
  goals: [...]
role:
  name: "..."
  persona: "..."
scenarios: [...]
intents:
  supported: [...]
  out_of_domain: {...}
tools:
  - id: "..."
    name: "..."
    description: "..."
    inputs: [...]
    output: {...}
    policy:
      allowed: "always"
      requires_approval: "conditional"
      condition: "..."
policy:
  guardrails:
    never: [...]
    always: [...]
  escalation: {...}
  workflows: [...]
engine:
  model: "..."
  temperature: 0.7
  max_tokens: 4096
```

### Core ADAS Expects (skillBootstrap.js)

```yaml
# Required fields
policy:
  guardrails:
    never: []    # extractTextGuardrails() reads these
    always: []   # extractTextGuardrails() reads these
  workflows:     # convertWorkflowsToSGs() reads these
    - name: "..."
      steps: []
      required: true/false
  approvals:     # checkApprovalRequired() reads these (MISSING!)
    - tool_id: "..."
      when: "amount > 500"
      approver: "supervisor"

tools:           # buildToolPermissions() reads these
  - name: "..."  # Uses 'name' not 'id'
    policy:
      allowed: "always"
      requires_approval: "conditional"
      condition: "..."

# Missing from current export:
engine:
  finalization_gate:
    enabled: true
    max_retries: 2

output_contract:   # For Finalization Gate
  required_fields: [...]

persona: "..."     # Extracted for Reply Polisher
```

---

## 2. Gap Analysis

| Field | Skill Builder | Core ADAS | Gap |
|-------|--------------|-----------|-----|
| `policy.guardrails` | Yes | Yes | OK |
| `policy.workflows` | Yes | Yes | OK |
| `policy.approvals` | NO | Yes | **MISSING** |
| `tools[].name` | Yes | Yes | OK |
| `tools[].policy` | Yes | Yes | OK |
| `engine.finalization_gate` | NO | Yes | **MISSING** |
| `output_contract` | NO | Yes | **MISSING** |
| `persona` (top-level) | In `role.persona` | Top-level | **NEEDS COPY** |

---

## 3. Implementation Tasks

### Task 1: Add `policy.approvals` to DraftDomain

**File:** `/apps/backend/src/types/DraftDomain.js`

The schema already has `ApprovalRule[]` but we need to ensure export includes it:

```javascript
// ApprovalRule structure (already exists):
{
  id: string,
  tool_id: string,           // Maps to tool name
  tool_id_resolved: boolean,
  conditions: PolicyCondition[],  // Need to convert to "when" string
  approver: string
}
```

**Action:** Convert `conditions[]` to Core ADAS `when` string format.

### Task 2: Add `engine.finalization_gate` to DraftDomain

**File:** `/apps/backend/src/types/DraftDomain.js`

Add to engine schema:

```javascript
engine: {
  // ... existing fields
  finalization_gate: {
    enabled: boolean,      // Default: true
    max_retries: number    // Default: 2
  }
}
```

### Task 3: Add `output_contract` to DraftDomain

**File:** `/apps/backend/src/types/DraftDomain.js`

Add new top-level field:

```javascript
output_contract: {
  required_fields: string[],  // e.g., ["order_id", "status", "next_steps"]
  format: 'text' | 'json' | 'markdown'  // Optional
}
```

### Task 4: Update `generateDomainYaml()` Export

**File:** `/apps/backend/src/services/export.js`

Add these sections:

```javascript
// 1. Add persona at top level
if (domain.role?.persona) {
  lines.push(`persona: ${yamlString(domain.role.persona)}`);
}

// 2. Add policy.approvals
if (domain.policy?.approvals?.length > 0) {
  lines.push(`  approvals:`);
  for (const approval of domain.policy.approvals) {
    lines.push(`    - tool_id: ${approval.tool_id}`);
    if (approval.conditions?.length > 0) {
      // Convert conditions to "when" string
      const when = conditionsToWhenString(approval.conditions);
      lines.push(`      when: ${yamlString(when)}`);
    }
    if (approval.approver) {
      lines.push(`      approver: ${approval.approver}`);
    }
  }
}

// 3. Add engine.finalization_gate
lines.push(`  finalization_gate:`);
lines.push(`    enabled: ${domain.engine?.finalization_gate?.enabled ?? true}`);
lines.push(`    max_retries: ${domain.engine?.finalization_gate?.max_retries ?? 2}`);

// 4. Add output_contract
if (domain.output_contract?.required_fields?.length > 0) {
  lines.push(`output_contract:`);
  lines.push(`  required_fields:`);
  for (const field of domain.output_contract.required_fields) {
    lines.push(`    - ${yamlString(field)}`);
  }
}
```

### Task 5: Update Defaults

**File:** `/apps/backend/src/utils/defaults.js`

Add default values:

```javascript
engine: {
  // ... existing
  finalization_gate: {
    enabled: true,
    max_retries: 2
  }
},
output_contract: {
  required_fields: []
}
```

### Task 6: Update Frontend Types

**File:** `/apps/frontend/src/types/DraftDomain.js`

Mirror the backend type changes.

### Task 7: Add UI for New Fields (Optional Phase)

- Finalization Gate toggle + max_retries input
- Output contract required_fields editor
- This can be deferred - defaults work for now

---

## 4. YAML Export Schema (Target)

```yaml
# Generated by ADAS Skill Builder
# Compatible with Core ADAS skillBootstrap.js

id: "dom_abc12345"
name: "Customer Support Agent"
version: "0.1.0"

# Top-level persona for Reply Polisher
persona: "You are a helpful customer service agent..."

# Problem definition
problem:
  statement: "Handle customer billing inquiries"
  goals:
    - "Resolve billing questions"
    - "Process refunds when appropriate"

# Tools available
tools:
  - name: "get_account"
    description: "Retrieve customer account details"
    inputs:
      - name: "customer_id"
        type: "string"
        required: true
    output:
      type: "object"
    policy:
      allowed: "always"

  - name: "process_refund"
    description: "Process a refund"
    inputs:
      - name: "order_id"
        type: "string"
        required: true
      - name: "amount"
        type: "number"
        required: true
    output:
      type: "object"
    policy:
      allowed: "conditional"
      requires_approval: "conditional"
      condition: "amount > 500"

# Policy & Guardrails
policy:
  guardrails:
    never:
      - "Never share payment card numbers"
      - "Never process refunds over $1000 without manager approval"
    always:
      - "Always verify customer identity first"
      - "Always confirm refund amount before processing"

  workflows:
    - name: "refund_process"
      trigger: "customer requests refund"
      steps:
        - "verify_identity"
        - "check_order"
        - "process_refund"
      required: true

  approvals:
    - tool_id: "process_refund"
      when: "amount > 500"
      approver: "supervisor"

  escalation:
    enabled: true
    conditions:
      - "customer is angry"
      - "issue unresolved after 3 attempts"

# Output contract for Finalization Gate
output_contract:
  required_fields:
    - "resolution_status"
    - "next_steps"

# Engine configuration
engine:
  model: "default"
  temperature: 0.7
  max_tokens: 4096
  finalization_gate:
    enabled: true
    max_retries: 2
```

---

## 5. Implementation Order

| Phase | Task | Priority | Effort |
|-------|------|----------|--------|
| **1** | Update `generateDomainYaml()` to add `policy.approvals` | High | 1 hour |
| **1** | Update `generateDomainYaml()` to add `engine.finalization_gate` | High | 30 min |
| **1** | Update `generateDomainYaml()` to copy `persona` to top level | High | 15 min |
| **2** | Add `output_contract` to DraftDomain type | Medium | 30 min |
| **2** | Update defaults.js | Medium | 15 min |
| **2** | Update frontend types | Medium | 15 min |
| **3** | Add UI for finalization_gate config | Low | 2 hours |
| **3** | Add UI for output_contract editor | Low | 2 hours |

---

## 6. Testing Strategy

### Manual Test Flow

1. Create a domain in Skill Builder with:
   - At least one tool with approval condition
   - Guardrails (never/always)
   - A workflow
   - Persona

2. Export to YAML

3. Place YAML in Core ADAS `/skills/` directory

4. Run Core ADAS with a job that references this skill

5. Verify:
   - `bootstrapSkill()` loads without errors
   - Guardrails appear in agent state
   - Workflow steps become SGs
   - Approval checks work

### Automated Tests

Add test in `/apps/backend/src/services/__tests__/export.test.js`:

```javascript
test('generateDomainYaml includes Core ADAS required fields', () => {
  const domain = {
    name: 'Test',
    role: { persona: 'Test persona' },
    tools: [{ name: 'test_tool', policy: { allowed: 'always' } }],
    policy: {
      guardrails: { never: ['rule1'], always: ['rule2'] },
      approvals: [{ tool_id: 'test_tool', conditions: [...], approver: 'user' }],
      workflows: [{ name: 'wf1', steps: ['s1', 's2'], required: true }]
    },
    engine: { finalization_gate: { enabled: true, max_retries: 2 } },
    output_contract: { required_fields: ['status'] }
  };

  const yaml = generateDomainYaml(domain);

  expect(yaml).toContain('persona:');
  expect(yaml).toContain('approvals:');
  expect(yaml).toContain('finalization_gate:');
  expect(yaml).toContain('output_contract:');
});
```

---

## 7. Migration Notes

- Existing domains without new fields will use defaults
- No database migration needed (file-based storage)
- Export is backward compatible (old domains still work)
- Core ADAS handles missing fields gracefully (null checks everywhere)

---

## 8. Next Steps After Implementation

1. **Test end-to-end** with a real domain
2. **Add logging** in Core ADAS to trace skill loading
3. **Document** the YAML schema for skill authors
4. **Consider** adding YAML validation in Skill Builder before export

---

## Document History

| Date | Change |
|------|--------|
| Jan 14, 2026 | Initial plan created |
