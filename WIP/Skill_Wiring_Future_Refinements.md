# Skill Wiring - Future Refinements

**Created:** January 14, 2026
**Status:** Backlog for future iterations

This document accumulates improvements identified during the initial skill wiring design that were deferred to keep v1 simple.

---

## 1. Guardrail Tier Classification

**Source:** ChatGPT review of v2 plan

**Problem:** Currently all guardrails are treated the same (inject to RV2 + check at Finalization Gate), but they have different reliability requirements.

**Proposed Fix:** Split semantic rules into 3 tiers:

| Tier | Type | Enforcement | Reliability |
|------|------|-------------|-------------|
| **1. Hard Safety** | Privacy, secrets, destructive | Mechanical (pre-tool gate, output patterns) | Must be 100% |
| **2. Process Correctness** | Workflow, evidence | Plan/tool gating, HLR SGs, output contract | High |
| **3. Style/Persona** | Tone, UX | Soft guidance (RV2 prompt, Reply Polisher) | Best effort |

**Examples:**

| Rule | Current Tier | Should Be |
|------|--------------|-----------|
| "Never share payment info" | All same | Tier 1 - Hard Safety |
| "Always verify identity first" | All same | Tier 2 - Process |
| "Never be dismissive" | All same | Tier 3 - Style |

**Implementation Options:**

A) New Skill YAML structure:
```yaml
policy:
  safety_rules:      # Tier 1 - mechanical enforcement
    - "Never expose card numbers"
  workflows:          # Tier 2 - process (already exists)
    - steps: [verify_identity, access_account]
  guardrails:         # Tier 3 - style (soft)
    - "Be empathetic"
```

B) Auto-classification at Core ADAS bootstrap based on patterns

C) Let skill author tag each guardrail with tier

**Decision:** Deferred to v2

---

## 2. Output Pattern Scanning for Hard Safety

**Related to:** Tier 1 Hard Safety enforcement

**Idea:** Add mechanical output scanning before Finalization Gate:
- Regex for credit card patterns (`\d{16}`, `\d{4}-\d{4}-\d{4}-\d{4}`)
- Regex for SSN patterns
- Keyword blocklist (configurable per skill)

**Implementation:**
```javascript
// In finalization flow, before Gate LLM call
function scanOutputForSafetyViolations(response, skill) {
  const patterns = skill.policy.safety_patterns || DEFAULT_SAFETY_PATTERNS;
  for (const pattern of patterns) {
    if (pattern.regex.test(response)) {
      return { blocked: true, reason: pattern.message };
    }
  }
  return { blocked: false };
}
```

**Decision:** Deferred to v2

---

## 3. Finalization Gate Strictness Levels

**Source:** Open questions in v2 plan

**Idea:** Allow skill author to configure gate strictness:

```yaml
engine:
  finalization_gate:
    enabled: true
    max_retries: 2
    strictness: medium  # low | medium | high
```

| Level | Behavior |
|-------|----------|
| `low` | Pass unless obvious violation |
| `medium` | Standard checking (default) |
| `high` | Strict, fail on any ambiguity |

**Decision:** Deferred

---

## 4. Gate Model Selection

**Source:** Open questions in v2 plan

**Idea:** Allow skill author to choose gate model:

```yaml
engine:
  finalization_gate:
    enabled: true
    model: claude-3-haiku  # or claude-3-sonnet for stricter
```

**Consideration:** Cost vs accuracy tradeoff

**Decision:** Deferred (hardcoded to Haiku for now)

---

## 5. Custom Reason Codes

**Source:** Open questions in v2 plan

**Idea:** Allow skill-specific reason codes beyond the hardcoded enums:

```yaml
finalization_gate:
  custom_reason_codes:
    - MISSING_ORDER_ID
    - REFUND_POLICY_VIOLATION
```

**Decision:** Deferred (use hardcoded enums for now)

---

## 6. Approval Flow UX

**Source:** Open questions in v2 plan

**Current:** Job pauses, waits for approval

**Future options:**
- Integration with external approval systems (Slack, email)
- Timeout with default action
- Approval delegation rules

**Decision:** Deferred

---

## 7. LLM-Based Compilation with Test Validation (CHANGED FROM v1)

**Source:** ChatGPT review + discussion

**v1 Approach (to be replaced):** Simple regex patterns for compilation:
- "Never use [tool]"
- "[field] > [number]"
- "[tool] requires approval"

**Problem with v1:** Regex parsing is fragile and becomes a "mini-language" accidentally.

**v2 Approach: LLM Compilation + Test Validation**

Instead of regex parsing, use LLM to compile free text rules to executable functions, then validate against mock examples.

**Flow:**
```
Bootstrap (Core ADAS):

1. LLM analyzes free text rule:
   "Refunds over $500 need supervisor approval"
              ↓
2. LLM generates executable check:
   (args) => args.amount > 500
              ↓
3. LLM tests against mock examples from skill:
   - input: { amount: 600 } → should trigger approval ✓
   - input: { amount: 300 } → should NOT trigger ✓
              ↓
4. If tests pass → use compiled function (mechanical enforcement)
   If tests fail → fall back to text (LLM judgment at runtime)
```

**Implementation:**
```javascript
async function compileRuleWithLLM(rule, skill, deps) {
  // 1. Ask LLM to generate function
  const compiled = await deps.llm.call({
    prompt: `Convert this rule to a JavaScript predicate function:
Rule: "${rule}"
Available tool args: ${JSON.stringify(skill.tools)}

Return ONLY the function: (args) => ...`
  });

  // 2. Get test cases from LLM
  const testCases = await deps.llm.call({
    prompt: `Generate 3 test cases for this rule: "${rule}"
Return JSON: [{ input: {...}, shouldTrigger: true/false }, ...]`
  });

  // 3. Run tests
  const fn = new Function('return ' + compiled)();
  for (const test of testCases) {
    const result = fn(test.input);
    if (result !== test.shouldTrigger) {
      // Test failed - fall back to text
      return { compiled: null, fallback: 'text', rule };
    }
  }

  // 4. All tests passed
  return { compiled: fn, fallback: null, rule };
}
```

**Benefits:**

| Aspect | Regex (v1) | LLM + Test (v2) |
|--------|------------|-----------------|
| Handles complex rules | No | Yes |
| Self-validating | No | Yes |
| Fallback on failure | No | Yes |
| DSL creep risk | Yes | No |
| Reliability | Fragile | High |

**Cost:** One-time LLM calls at bootstrap (not per-request)

**Author Experience:** No change - still writes natural language. Compilation is "silent".

**Decision:** Implement in v2, replacing regex approach

---

## 8. Process Guardrails → Workflow Conversion

**Source:** ChatGPT Tier 2 suggestion

**Idea:** Automatically convert process guardrails to workflow SGs:

```
"Always verify identity before account access"
    ↓ (auto-convert at bootstrap)
workflow:
  steps: [verify_identity, access_account]
  required: true
```

**Challenge:** Requires understanding which tools map to which actions

**Decision:** Deferred

---

## 9. Final Alignment Judge Rubric (Catches "Correct But Far Away")

**Source:** ChatGPT detailed rubric for Finalization Gate

**Problem:** Agent responses can be technically correct but fail to match user expectations (wrong abstraction level, wrong artifact type, missing required elements).

**Solution:** A narrow, evidence-based judge that scores alignment, not style.

### 9.1 Judge's Job (Narrow Scope)

The judge evaluates the draft answer against:
1. The initial goal (and latest clarified goal)
2. The chosen intent (from intent phase)
3. The required artifact type (diagram vs patch vs explanation)
4. Evidence of what the system actually did (tools + observations)

**Must produce:** quality_score, verdict, reason codes, fix_mode

**Must NOT:** Rewrite the answer, invent facts, propose broad redesigns

### 9.2 Scoring Dimensions (Weighted)

| Dimension | Weight | What It Checks |
|-----------|--------|----------------|
| **Goal Coverage** | 35% | Does answer address all stated user goals? |
| **Abstraction Match** | 25% | Is answer at the level user asked? (runtime vs repo vs code) |
| **Artifact Match** | 20% | Did it produce requested artifact type? (diagram/patch/etc) |
| **Evidence Fit** | 15% | Are claims supported by what system actually did? |
| **Clarity** | 5% | Organization/readability (minor influence) |

**Verdict Thresholds:**
- `PASS` if score ≥ 0.80 and no hard-fail codes
- `PASS_WITH_CAVEATS` if 0.60–0.79 and fixable via rewrite
- `FAIL` if < 0.60 OR any hard-fail code present

### 9.3 Reason Codes

**Hard-Fail Codes (trigger FAIL automatically):**

| Code | When to Use |
|------|-------------|
| `WRONG_ABSTRACTION_LEVEL` | User asked runtime flow, got repo structure (or vice versa) |
| `WRONG_ARTIFACT_TYPE` | User requested diagram, got text explanation |
| `MISREAD_PRIMARY_GOAL` | Answer focuses on different objective than user stated |
| `UNSUPPORTED_SPECIFICS` | Claims file paths/functions not seen in evidence |
| `SAFETY_OR_POLICY_VIOLATION` | Violates hard guardrails |

**Soft Codes (guide rewrite, don't hard-fail):**

| Code | When to Use |
|------|-------------|
| `MISSING_REQUIRED_ELEMENTS` | Artifact present but missing key components |
| `INSUFFICIENT_DECISION_SUPPORT` | User asked for recommendation, got description |
| `OVERLY_GENERIC` | Generic best practices when system-specific needed |
| `NEEDS_CLARIFICATION` | Goal/constraints missing, need to ask user |
| `STRUCTURE_OR_CLARITY_ISSUES` | Hard to use but content is correct |

### 9.4 Required Elements Per Intent

This is how we reliably catch "far away" without turning policy into code:

**SYSTEM_CONTROL_FLOW:**
- Actors/components
- Signals/events exchanged
- Trigger(s) and sequencing
- Ownership/authority (who decides)
- Loop/state transitions
- At least one failure path

**CODE_FLOW_ANALYSIS:**
- Entry point(s)
- Call chain or step-by-step execution
- Key functions/modules involved
- Conditions/branches that matter

**REPO_ORIENTATION:**
- Major modules/dirs
- Likely entry points
- "Where to look next" guidance

**CHANGE_IMPLEMENTATION:**
- Concrete change plan
- Impacted files/modules (if known)
- Test impact / validation plan
- Risks/rollback note

**DEBUG_AND_DIAGNOSE:**
- Ranked hypotheses
- What evidence would confirm/refute
- Next experiments

### 9.5 Fix Mode (Prevents Replan Thrashing)

| Fix Mode | When to Use |
|----------|-------------|
| `REWRITE_ONLY` | Content mostly there, restructure can fix it |
| `NEEDS_NEW_EVIDENCE` | Missing elements require inspecting code/logs |
| `NEEDS_USER_CLARIFICATION` | Goal is ambiguous, must ask user |

### 9.6 Judge Output Schema

```json
{
  "quality_score": 0.72,
  "verdict": "PASS_WITH_CAVEATS",
  "reason_codes": ["MISSING_REQUIRED_ELEMENTS"],
  "missing_requirements": [
    "No runtime sequence/loop was provided",
    "No signals/events list"
  ],
  "evidence_issues": [
    "Mentions file paths but no repo inspection was performed"
  ],
  "fix_mode": "REWRITE_ONLY",
  "next_actions": [
    { "type": "rewrite", "instruction": "Add actor/signal loop diagram and explain authority." }
  ]
}
```

### 9.7 Replan Wiring (Anti-Loop)

**Replan Trigger:**
- `FAIL` → replan with full capabilities
- `PASS_WITH_CAVEATS` → rewrite-only replan (no tools)

**Anti-Loop Rule:**
- Max retries: 2
- Second retry MUST differ by: new evidence (tool), clarified question, or different artifact type
- Otherwise finalize with explicit limitations

### 9.8 Why This Catches "Correct But Far Away"

The judge is forced to answer:
1. Did you deliver the **requested artifact**?
2. Did you answer at the **requested abstraction level**?
3. What **required elements are missing**?

These three are the exact failure modes observed.

### 9.9 Judge Prompts (Implementation-Ready)

**Input Payload Structure:**
```json
{
  "goal": "User's goal (1-3 sentences)",
  "intent_id": "SYSTEM_CONTROL_FLOW",
  "constraints": ["constraint1", "constraint2"],
  "tool_trace_summary": "Tools used, files opened, evidence gathered (max 5 lines)",
  "draft_answer": "The response to evaluate"
}
```

**Prompt A — Minimal, Strict (Recommended Default):**

```
You are the Final Alignment Judge. Evaluate whether DRAFT_ANSWER satisfies GOAL given INTENT and CONSTRAINTS, and whether the abstraction level and artifact type match what the user asked.

Do NOT rewrite the answer. Do NOT invent facts. Only judge based on provided inputs.

Return ONLY valid JSON with this schema:
{
  "quality_score": number,            // 0..1
  "verdict": "PASS"|"PASS_WITH_CAVEATS"|"FAIL",
  "reason_codes": string[],           // from allowed list
  "missing_requirements": string[],
  "evidence_issues": string[],
  "fix_mode": "REWRITE_ONLY"|"NEEDS_NEW_EVIDENCE"|"NEEDS_USER_CLARIFICATION",
  "next_actions": { "type": "rewrite"|"tool"|"question", "instruction": string }[]
}

Allowed reason_codes:
WRONG_ABSTRACTION_LEVEL, WRONG_ARTIFACT_TYPE, MISREAD_PRIMARY_GOAL, UNSUPPORTED_SPECIFICS,
SAFETY_OR_POLICY_VIOLATION, MISSING_REQUIRED_ELEMENTS, INSUFFICIENT_DECISION_SUPPORT,
OVERLY_GENERIC, NEEDS_CLARIFICATION, STRUCTURE_OR_CLARITY_ISSUES

Hard-fail reason_codes (must set verdict="FAIL"):
WRONG_ABSTRACTION_LEVEL, WRONG_ARTIFACT_TYPE, MISREAD_PRIMARY_GOAL, UNSUPPORTED_SPECIFICS, SAFETY_OR_POLICY_VIOLATION

Scoring:
- Goal Coverage 35%
- Abstraction Match 25%
- Artifact Match 20%
- Evidence Fit 15%
- Clarity 5%
Verdict thresholds: PASS>=0.80 (no hard-fail); PASS_WITH_CAVEATS 0.60-0.79 (no hard-fail); otherwise FAIL.

Intent required elements:
- SYSTEM_CONTROL_FLOW: actors, signals/events, triggers/sequence, authority/ownership, loop/state transitions, failure path
- CODE_FLOW_ANALYSIS: entry points, call chain, key functions/modules, important branches
- REPO_ORIENTATION: major modules/dirs, entry points, where-to-look-next
- CHANGE_IMPLEMENTATION: concrete change plan, validation/tests, risks
- DEBUG_AND_DIAGNOSE: ranked hypotheses, evidence needed, next experiments

Now evaluate this payload:
PAYLOAD_JSON
```

**Prompt B — Richer (Better for Actionable Replans):**

```
Role: Final Alignment Judge (verification only).
Task: Compare GOAL + INTENT + CONSTRAINTS + TOOL_TRACE_SUMMARY vs DRAFT_ANSWER.

Rules:
- Do not rewrite DRAFT_ANSWER.
- Do not add new facts.
- Be strict about WRONG_ABSTRACTION_LEVEL and WRONG_ARTIFACT_TYPE.
- If you fail, specify the minimal fix: rewrite-only vs needs new evidence vs needs user clarification.

Return ONLY JSON:
{
  "quality_score": number,
  "verdict": "PASS"|"PASS_WITH_CAVEATS"|"FAIL",
  "reason_codes": string[],
  "missing_requirements": string[],
  "evidence_issues": string[],
  "fix_mode": "REWRITE_ONLY"|"NEEDS_NEW_EVIDENCE"|"NEEDS_USER_CLARIFICATION",
  "next_actions": { "type": "rewrite"|"tool"|"question", "instruction": string, "priority": "high"|"med"|"low" }[]
}

Hard fail if any of:
WRONG_ABSTRACTION_LEVEL, WRONG_ARTIFACT_TYPE, MISREAD_PRIMARY_GOAL, UNSUPPORTED_SPECIFICS, SAFETY_OR_POLICY_VIOLATION

Intent required elements (if missing >=2 => MISSING_REQUIRED_ELEMENTS):
SYSTEM_CONTROL_FLOW: actors, signals/events, triggers/sequence, authority, loop/transitions, failure path
CODE_FLOW_ANALYSIS: entry, call chain, key funcs, branches
REPO_ORIENTATION: structure, entry points, next steps
CHANGE_IMPLEMENTATION: plan, tests, risks
DEBUG_AND_DIAGNOSE: hypotheses, evidence, experiments

Evaluate this input:
GOAL: <<<...>>>
INTENT: <...>
CONSTRAINTS: <<<...>>>
TOOL_TRACE_SUMMARY: <<<...>>>
DRAFT_ANSWER: <<<...>>>
```

**Prompt A Lite — Minimal Production Version (~70-90 tokens):**

```
You are the Final Alignment Judge.

Check whether DRAFT_ANSWER satisfies GOAL given INTENT.
Be strict about abstraction level and requested artifact.

Do NOT rewrite or add facts.

Return ONLY valid JSON:
{
  "quality_score": number,
  "verdict": "PASS"|"PASS_WITH_CAVEATS"|"FAIL",
  "reason_codes": string[],
  "fix_mode": "REWRITE_ONLY"|"NEEDS_NEW_EVIDENCE"|"NEEDS_USER_CLARIFICATION",
  "missing_requirements": string[]
}

Hard-fail if any:
WRONG_ABSTRACTION_LEVEL, WRONG_ARTIFACT_TYPE, MISREAD_PRIMARY_GOAL, UNSUPPORTED_SPECIFICS.

Intent required elements:
SYSTEM_CONTROL_FLOW: actors, signals, sequence/loop, authority, failure path.
CODE_FLOW_ANALYSIS: entry, call chain, key functions.
REPO_ORIENTATION: structure, entry points.
CHANGE_IMPLEMENTATION: plan, tests.
DEBUG_AND_DIAGNOSE: hypotheses, evidence.

Evaluate:
GOAL: <<<...>>>
INTENT: <...>
DRAFT_ANSWER: <<<...>>>
```

**Why Lite Works:**
- No policy prose, no tool trace required, no workflow logic, no style judging
- Only checks: Did you answer the right question? At the right abstraction level? With the right artifact?
- This directly targets "correct but far away"

**What Lite Does NOT Do (By Design):**
- Judge tone or enforce persona
- Invent missing content
- Decide how to fix things
- Act as a second planner

### 9.10 Token Minimization Tips

1. **Don't include whole conversation** — only latest clarified goal (1-3 sentences)
2. **Keep TOOL_TRACE_SUMMARY to 5 lines max:**
   - Tools used
   - Key files opened (if any)
   - Whether repo was inspected
   - Whether any external lookup happened
3. **Keep reason codes as enums** (short), not paragraphs

### 9.11 Recommended Thresholds

| Threshold | Value |
|-----------|-------|
| PASS | ≥ 0.80 |
| PASS_WITH_CAVEATS | 0.60 - 0.79 |
| FAIL | < 0.60 OR hard-fail code |

**Replan Trigger:**
- `FAIL` → replan
- `PASS_WITH_CAVEATS` AND `fix_mode != REWRITE_ONLY` → replan (needs new evidence)
- Otherwise → proceed to Reply Polisher

### 9.12 Replan Instruction Template

**Design Goals:**
- Turn judge output into a single, deterministic replan directive
- Avoid "judge becomes second planner"
- Ensure replans are bounded and evidence-driven

**Inputs:**
- `judge.reason_codes[]`
- `judge.fix_mode` (REWRITE_ONLY | NEEDS_NEW_EVIDENCE | NEEDS_USER_CLARIFICATION)
- `judge.missing_requirements[]`
- (optional) `intent_id`, `capability_profile`

**Mapping Table (reason_code → replan behavior):**

| Reason Code | Fix Mode | Replan Action |
|-------------|----------|---------------|
| `WRONG_ABSTRACTION_LEVEL` | REWRITE_ONLY | Reframe to correct abstraction; forbid adding new facts |
| `WRONG_ARTIFACT_TYPE` | REWRITE_ONLY | Produce requested artifact format using existing info only |
| `MISREAD_PRIMARY_GOAL` | REWRITE_ONLY or CLARIFY | If goal clear: rewrite. If unclear: ask 1-3 questions |
| `UNSUPPORTED_SPECIFICS` | NEEDS_NEW_EVIDENCE | Add tool step for missing evidence OR remove unsupported claims |
| `MISSING_REQUIRED_ELEMENTS` | REWRITE_ONLY (usually) | Add required sections using existing info; promote to NEEDS_NEW_EVIDENCE if inspection required |
| `NEEDS_CLARIFICATION` | NEEDS_USER_CLARIFICATION | Ask minimal questions; do not proceed |

**Canonical Replan Prompt Template:**

```
You must repair the final answer using the Final Alignment Judge result.

Constraints:
- If fix_mode=REWRITE_ONLY: do not call tools, do not add new facts; only restructure/rewrite to match goal, abstraction level, and artifact type. Fill missing required elements using existing information only.
- If fix_mode=NEEDS_NEW_EVIDENCE: add the minimum tool step(s) needed to obtain missing evidence; then update the answer. Do not guess.
- If fix_mode=NEEDS_USER_CLARIFICATION: ask 1–3 targeted clarifying questions; do not attempt a full solution.

Judge reason_codes: <...>
Missing requirements: <...>

Deliverable:
- Provide a corrected final answer OR clarifying questions (if fix_mode=NEEDS_USER_CLARIFICATION).
- Ensure the corrected answer explicitly satisfies the original GOAL and requested artifact.
```

**Anti-Loop Rule:**
- Max retries: 2
- A retry is valid only if it changes at least one of:
  - Abstraction level
  - Artifact type
  - Evidence base (new tool result)
  - User clarification obtained
- Otherwise finalize with explicit limitations

### 9.13 Metrics Dashboard Spec

**Objective:** Track judge effectiveness and tune the system.

**Core Events:**

**Event: `final_alignment_judge_result`**
- `timestamp`, `job_id`, `session_id`, `user_id_hash`
- `intent_id`, `capability_profile_id`
- `quality_score`, `verdict`, `reason_codes[]`, `fix_mode`
- `attempt_index` (0 for first finalize, 1..n for retries)
- `model_id` (judge model), `token_cost` (optional)

**Event: `finalization_outcome`**
- `timestamp`, `job_id`, `session_id`
- `final_verdict` (pass/fail/caveats)
- `num_retries`, `time_to_finalize_ms`
- `user_feedback` (thumbs up/down if available)

**Dashboard Panels (Minimum Viable):**

| Panel | What It Shows |
|-------|---------------|
| **Verdict Rate** | PASS / PASS_WITH_CAVEATS / FAIL over time, sliced by intent_id |
| **Top Reason Codes** | Frequency of each reason_code, stacked by intent |
| **"Correct But Far Away" Index** | % sessions with WRONG_ABSTRACTION_LEVEL or WRONG_ARTIFACT_TYPE |
| **Replan Effectiveness** | % FAIL→PASS by attempt 1, % still FAIL after max retries |
| **Fix Mode Distribution** | Rewrite-only vs needs-evidence vs needs-clarification |
| **Cost Impact** | Extra judge calls, additional retries, latency/token impact |

**Alerting:**
- Alert if `WRONG_ABSTRACTION_LEVEL` spikes > X% for an intent (regression)
- Alert if replan success rate drops below Y% (judge too strict or plan too weak)
- Alert if average retries > 1.3 (loopiness)

**Tuning Playbook:**

| High Frequency Of | Action |
|-------------------|--------|
| `WRONG_ABSTRACTION_LEVEL` | Improve intent routing + tighten capability profiles |
| `WRONG_ARTIFACT_TYPE` | Strengthen artifact selection + enforce artifact contract earlier |
| `UNSUPPORTED_SPECIFICS` | Require evidence summaries, restrict claims when no tools run |
| Low replan effectiveness | Judge output too vague or replan constraints too loose |

**Decision:** Implement in v2 as the core Finalization Gate logic

---

## 10. Tool Schema Auto-Import from Registry

**Source:** ChatGPT Risk C feedback

**Problem:** Skill author must manually define tool inputs/outputs that may already exist in a tool registry.

**Proposed Fix:** At bootstrap, Core ADAS could:
1. Check if tool exists in MCP registry
2. Auto-import schema (inputs, outputs, descriptions)
3. Only require skill author to define policy/guardrails

**Example:**
```yaml
tools:
  - id: process_refund
    # No need to define inputs/outputs - auto-imported from registry
    policy:
      requires_approval: "amount > 500"
```

**Decision:** Deferred

---

## 11. Workflow Complexity Limits

**Source:** ChatGPT Risk C feedback

**Problem:** Complex workflows with many steps could confuse the HLR or create too many subgoals.

**Proposed Fix:** Add validation at bootstrap:
- Max workflow steps: 5
- Max total workflows: 3
- Warn if workflow steps don't map to known tools

**Decision:** Deferred

---

## Document History

| Date | Change |
|------|--------|
| Jan 14, 2026 | Initial creation with ChatGPT tier classification feedback |
| Jan 14, 2026 | Updated #7: Changed from regex compilation to LLM-based compilation with test validation |
| Jan 14, 2026 | Added #9-11: Narrow gate scope, tool schema auto-import, workflow limits (Risk C feedback) |
| Jan 14, 2026 | Expanded #9: Full alignment judge rubric with scoring dimensions, reason codes, intent contracts |
| Jan 14, 2026 | Added #9.9-9.11: Implementation-ready judge prompts, token tips, recommended thresholds |
| Jan 14, 2026 | Added Prompt A Lite (~70-90 tokens) - minimal production version |
| Jan 14, 2026 | Added #9.12-9.13: Replan instruction template + metrics dashboard spec |
