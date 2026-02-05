# Security Authoring in Skill Builder — Implementation Plan

## Goal
Embed Identity & Access Control configuration into the Skill Builder so the BOT dialog guides users through security setup, a dedicated Security tab provides visual editing, and consistency checks validate everything before export.

---

## What Gets Built (3 layers)

### Layer 1: BOT Dialog Integration (backend)
The bot proactively suggests security configuration after tools are defined.

### Layer 2: Security Tab (frontend)
A new "Security" tab in SkillPanel showing tool classifications, access policies, grant mappings, response filters, and context propagation — all read-only (authored via bot).

### Layer 3: Validation Endpoint (backend)
A new `/api/validate/security-consistency` endpoint that runs deterministic + LLM checks.

---

## Files to Create (3 new)

| # | File | What |
|---|------|------|
| 1 | `apps/frontend/src/components/SecurityPanel.jsx` | New tab panel — read-only cards for tool classifications, access policy rules, grant mappings, response filters, context propagation |
| 2 | (none — SecurityValidator already exists) | — |
| 3 | (none — completenessChecker already updated) | — |

## Files to Modify (6 existing)

| # | File | What Changes |
|---|------|-------------|
| 1 | `apps/backend/src/prompts/dalSystem.js` | Add security guidance to POLICY_DEFINITION phase + state_update examples for security arrays + security-aware Rule 6 |
| 2 | `apps/backend/src/data/helpDocs.js` | Add 5 help doc entries: 'security', 'tool classification', 'access policy', 'grant mappings', 'response filters' |
| 3 | `apps/backend/src/services/state.js` | Add `grant_mappings`, `access_policy.rules`, `response_filters` to PROTECTED_ARRAYS |
| 4 | `apps/backend/src/routes/validate.js` | Add `POST /api/validate/security-consistency` endpoint |
| 5 | `apps/backend/src/prompts/dalSystem.js` → `buildDALSystemPrompt()` | Include security state in domain summary (grant_mappings count, access_rules count, filters count, unclassified tools) |
| 6 | `apps/frontend/src/components/SkillPanel.jsx` | Add 'Security' tab, SecurityPanel rendering, security badge computation |

---

## Detailed Implementation

### Step 1: Protected Arrays for Security (state.js)

Add to `PROTECTED_ARRAYS`:
```javascript
const PROTECTED_ARRAYS = [
  'tools', 'intents.supported', 'policy.guardrails.always',
  'policy.guardrails.never', 'scenarios',
  // Security arrays — prevent accidental overwrite by LLM
  'grant_mappings', 'access_policy.rules', 'response_filters'
];
```

This enables the bot to use:
- `grant_mappings_push` / `grant_mappings_delete`
- `access_policy.rules_push` / `access_policy.rules_delete`
- `response_filters_push` / `response_filters_delete`

### Step 2: DAL System Prompt — Security Guidance (dalSystem.js)

**2a. Add to POLICY_DEFINITION phase prompt** (after guardrails/workflows):

New guidance block teaching the bot to:
- After guardrails are defined, ask: "Now let's configure security for your high-risk tools"
- Walk through tool classification: public → pii_read → pii_write → financial → destructive
- For each high-risk tool, suggest access policy rules
- For PII tools, suggest response filters
- Suggest grant mappings based on verification tools
- Use selection mode for classification choices

**2b. Add state_update examples** for security:

```
Adding tool security classification:
{ "tools_update": { "name": "get_order", "security": { "classification": "pii_read", "data_owner_field": "customer_id" } } }

Adding grant mapping:
{ "grant_mappings_push": { "tool": "identity.candidates.search", "grants": [{ "key": "ecom.customer_id", "value_from": "$.candidates[0].customer_id", "condition": "$.candidates.length == 1" }] } }

Adding access policy rule:
{ "access_policy.rules_push": { "tools": ["orders.order.get"], "when": { "root_origin_type": "channel" }, "require": { "has_grant": "ecom.customer_id" }, "effect": "constrain", "constrain": { "inject_args": { "customer_id": "$grant:ecom.customer_id" }, "response_filter": "pii_mask" } } }

Adding response filter:
{ "response_filters_push": { "id": "pii_mask", "description": "Mask PII unless verified", "unless_grant": "ecom.assurance_level", "strip_fields": ["$.customer.email", "$.customer.phone"], "mask_fields": [{ "field": "$.customer.name", "mask": "*** (verification required)" }] } }

Setting context propagation:
{ "context_propagation.on_handoff.propagate_grants": ["ecom.customer_id", "ecom.assurance_level"] }
{ "context_propagation.on_handoff.drop_grants": ["ecom.session_token"] }
```

**2c. Update buildDALSystemPrompt()** — add security counts to stateSummary:

```javascript
security: {
  classified_tools: domain.tools?.filter(t => t.security?.classification).length || 0,
  unclassified_tools: domain.tools?.filter(t => !t.security?.classification).length || 0,
  high_risk_tools: domain.tools?.filter(t => ['pii_write','financial','destructive'].includes(t.security?.classification)).length || 0,
  grant_mappings: domain.grant_mappings?.length || 0,
  access_rules: domain.access_policy?.rules?.length || 0,
  response_filters: domain.response_filters?.length || 0,
},
```

Also include `grant_mappings`, `access_policy`, `response_filters`, `context_propagation` in `domainForPrompt`.

### Step 3: Help Docs (helpDocs.js)

Add 5 entries to `HELP_DOCS`:

1. **'security'** — Overview: what security config is, why it matters, the 4 primitives
2. **'tool classification'** — The 5 risk levels, when to use each, examples
3. **'access policy'** — Rules, when/require/effect, constrain with inject_args
4. **'grant mappings'** — How tools produce grants, JSONPath, conditions, TTL
5. **'response filters'** — PII masking/stripping, unless_grant, field paths

### Step 4: Validation Endpoint (validate.js)

Add `POST /api/validate/security-consistency`:

**Deterministic checks** (no LLM needed):
- All high-risk tools have access policy coverage
- All grant mapping tool references exist
- All access policy tool references exist (or wildcard)
- Response filter field paths are syntactically valid
- Tools with `data_owner_field` have constrain policies
- No duplicate response filter IDs

**LLM-based checks** (optional, deeper analysis):
- Are access policies too permissive for the business context?
- Do grant mappings cover the tools that need them?
- Are response filters sufficient for the PII data?

### Step 5: SecurityPanel.jsx (frontend)

New component following the PolicyPanel pattern:

**Sections:**
1. **Tool Security Classifications** — Table of all tools with their classification badge (public/pii_read/pii_write/financial/destructive) + risk level + data_owner_field. Unclassified tools highlighted.

2. **Access Policy Rules** — Cards showing each rule: tools covered, when conditions, require conditions, effect (color-coded: green=allow, red=deny, blue=constrain), constrain details.

3. **Grant Mappings** — Cards showing tool → grants issued, with value_from paths, conditions, TTL.

4. **Response Filters** — Cards showing filter ID, description, unless_grant condition, stripped fields, masked fields.

5. **Context Propagation** — Simple list of propagated vs dropped grants for handoffs.

**Each section has:**
- ExplainButton (sends "Tell me about the 'X' section" to chat)
- ValidateButton (calls security-consistency endpoint)
- Empty state message: "No rules defined yet. Ask the bot to help you configure security."

### Step 6: SkillPanel.jsx Integration

**6a. Add tab:**
```javascript
const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'intents', label: 'Intents' },
  { id: 'tools', label: 'Tools' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'policy', label: 'Policy' },
  { id: 'security', label: 'Security' },  // NEW
  { id: 'engine', label: 'Engine' },
  { id: 'triggers', label: 'Triggers' }
];
```

**6b. Badge computation:**
- Count: `classifiedTools / totalTools`
- Green: all tools classified + high-risk covered by policies
- Yellow: some classified but gaps
- Red: high-risk tools without policies
- Gray: no tools defined yet

**6c. Tab content rendering:**
```jsx
{activeTab === 'security' && (
  <SecurityPanel
    skill={skill}
    onAskAbout={handleAskAbout}
    focus={focus?.tab === 'security' ? focus : null}
  />
)}
```

---

## Bot Dialog Flow (how the conversation works)

After the user has defined tools and policies (Phase 6: POLICY_DEFINITION), the bot transitions to security:

```
BOT: "Great, your guardrails look solid! Now let's configure security
     for your tools. I see you have 7 tools defined.

     Let me classify each one by risk level:
     - orders.order.get → reads customer data → pii_read
     - orders.update_shipping_address → modifies customer data → pii_write
     - orders.cancel → destructive action → destructive
     - identity.candidates.search → reads masked data → public
     ...

     Does this classification look right?"

     [Yes, looks good] [No, let me adjust]
```

```
BOT: "Now for the high-risk tools (pii_write + destructive), we need
     access policies. I recommend:

     1. orders.update_shipping_address → require identity verification (L1+)
     2. orders.cancel → require strong verification (L2)
     3. orders.order.get → require customer_id grant

     Should I set these up?"

     [Yes, set them up] [Let me customize] [Skip security for now]
```

```
BOT: "Done! I've configured:
     - 7 tool classifications
     - 4 access policy rules
     - 2 grant mappings
     - 1 response filter (PII masking)

     You can review everything in the Security tab."
```

---

## Execution Order

1. **state.js** — Add protected arrays (5 min, enables everything else)
2. **helpDocs.js** — Add 5 security help docs (standalone, no deps)
3. **dalSystem.js** — Add security guidance + state_update examples + summary (core integration)
4. **validate.js** — Add security-consistency endpoint (standalone)
5. **SecurityPanel.jsx** — Create frontend panel (standalone)
6. **SkillPanel.jsx** — Wire up tab + badge + rendering (ties everything together)
