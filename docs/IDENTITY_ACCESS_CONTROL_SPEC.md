# ADAS Identity & Access Control Specification

**Version:** 2.0.0-draft
**Date:** 2026-02-03
**Status:** Design Approved (with review feedback incorporated)
**Authors:** Solution Architecture Team, External Review: ChatGPT

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Architecture Overview](#3-architecture-overview)
4. [Layer Separation: Platform vs. Solution](#4-layer-separation-platform-vs-solution)
5. [Platform Primitives](#5-platform-primitives)
   - 5.1 Job Provenance
   - 5.2 Grants
   - 5.3 Grant Mappings
   - 5.4 Channel Authentication
   - 5.5 Access Policies
   - 5.6 Response Filtering
   - 5.7 Context Propagation (Skill-to-Skill)
   - 5.8 Post-Validation
6. [Solution-Level Configuration (E-Commerce Example)](#6-solution-level-configuration-e-commerce-example)
   - 6.1 Grant Definitions
   - 6.2 Identity MCP Grant Mappings
   - 6.3 Access Policies Per Tool
   - 6.4 Response Filter Rules
   - 6.5 Channel Definitions
7. [End-to-End Scenarios](#7-end-to-end-scenarios)
   - 7.1 External Customer: Order Tracking (Low Risk)
   - 7.2 External Customer: Address Change (High Risk)
   - 7.3 Admin: Look Up Any Order
   - 7.4 Timer: Automated Safety Net
   - 7.5 Skill-to-Skill: Return Escalation
   - 7.6 Failed Verification: Lockout
   - 7.7 Customer Tries to Access Another Customer's Order
8. [Platform Data Model](#8-platform-data-model)
9. [Access Policy Language Reference](#9-access-policy-language-reference)
10. [Grant Mapping Language Reference](#10-grant-mapping-language-reference)
11. [Security Properties](#11-security-properties)
12. [Implementation Phases](#12-implementation-phases)
13. [Open Questions](#13-open-questions)
14. [Skill Builder Integration](#14-skill-builder-integration)

---

## 1. Executive Summary

This specification defines how ADAS Core (the platform) provides **generic identity and access control primitives** that any solution built on the platform can use. The platform knows nothing about specific domains (e-commerce, healthcare, etc.) — it provides generic mechanisms for tracking who initiated a request, what has been proven about them, and what they are allowed to do.

The key insight is that access control requires two layers:

- **Platform layer (ADAS Core):** Provides job provenance, a grants system, declarative access policies, and response filtering. Domain-agnostic. Enforces rules it doesn't understand the meaning of.
- **Solution layer (e.g., e-commerce pack):** Defines what grants mean, when they are issued, and what access policies apply to each tool. Domain-specific. Configures the platform.

This separation means the same platform can host an e-commerce solution (with "customers" and "assurance levels"), a healthcare solution (with "patients" and "HIPAA consent"), or any other domain — using the same access control primitives.

---

## 2. Problem Statement

### Current State

In the current ADAS architecture:

- **MCPs are open.** Any skill with a connector can call any tool with any parameters. `orders.order.get(org_id, order_id)` returns full data to any caller.
- **Access control is soft.** The only protection is the skill's persona/guardrails (LLM prompt instructions). A prompt injection, hallucination, or misconfigured skill could leak data.
- **No caller context.** MCPs have no idea who initiated the request — a customer, an admin, or an automated timer. They treat all callers identically.
- **No provenance tracking.** When a skill calls a tool, there is no record of whether the original request came from an external untrusted actor or an internal system process.

### Risks This Creates

| Risk | Example |
|------|---------|
| **Data leakage across customers** | Customer A asks about order #ORD-456 which belongs to Customer B. The skill fetches it and reveals details. |
| **Privilege escalation** | An external customer's request flows through skill-to-skill communication. The receiving skill treats it as "internal" and grants full access. |
| **Missing audit trail** | No way to trace a data access back to the original external actor who triggered it. |
| **Admin/customer confusion** | No mechanism to differentiate admin access from customer access at the tool level. |
| **Social engineering** | Attacker provides someone else's order number. Without identity verification gates, the skill returns the data. |

### Desired State

- Every tool call carries **immutable provenance** (who initiated the chain, through which channel).
- Access to data is **scoped by default** — external actors can only access their own data.
- High-risk operations require **earned authorization** (verification grants).
- The platform enforces these rules **before the call reaches the MCP** — the MCP doesn't need to implement access control.
- Admins get broad access **through authenticated channels**, not through the same channels as customers.
- The entire system is **auditable** — every grant issuance and access decision is logged.

---

## 3. Architecture Overview

```
                     +-------------------------------------+
                     |           EXTERNAL ACTORS            |
                     |                                      |
                     |  Customer        Admin      Webhook  |
                     |  (email/tg)    (dashboard)  (Shopify)|
                     +------+-----------+-----------+------+
                            |           |           |
                     +------v-----------v-----------v------+
                     |          CHANNEL LAYER               |
                     |                                      |
                     |  email    admin_api    api    trigger |
                     |  (public) (SSO/auth)  (key)  (timer) |
                     +------+-----------+-----------+------+
                            |           |           |
                     +------v-----------v-----------v------+
                     |           ADAS CORE                  |
                     |                                      |
                     |  +-----------------------------+     |
                     |  |      JOB CREATION            |     |
                     |  |  - Stamp provenance          |     |
                     |  |  - Set principal_id           |     |
                     |  |  - Pre-issue channel grants   |     |
                     |  |  - Create job for skill       |     |
                     |  +-------------+---------------+     |
                     |                |                      |
                     |  +-------------v---------------+     |
                     |  |      SKILL EXECUTION         |     |
                     |  |  - Skill calls MCP tools      |     |
                     |  |  - Grant mappings evaluate     |     |
                     |  |  - Grants accumulate on job    |     |
                     |  +-------------+---------------+     |
                     |                |                      |
                     |  +-------------v---------------+     |
                     |  |      ACCESS ENFORCEMENT       |     |
                     |  |  - Check access policy         |     |
                     |  |  - Verify required grants      |     |
                     |  |  - Constrain query scope       |     |
                     |  |  - Post-validate response      |     |
                     |  |  - Filter response fields      |     |
                     |  +-------------+---------------+     |
                     |                |                      |
                     +----------------+--------------------+
                                      |
                               +------v------+
                               |    MCPs      |
                               | (dumb stores)|
                               +-------------+
```

### Key Principle

**MCPs never implement access control.** They are dumb data stores. The platform sits between the skill and the MCP, enforcing access policies, scoping queries, post-validating responses, and filtering fields. If the platform blocks a call, the MCP never sees it.

---

## 4. Layer Separation: Platform vs. Solution

This is the most important design principle. Everything that follows depends on this separation being clean.

### Platform Layer (ADAS Core)

The platform provides **generic mechanisms**. It does not know what "a customer" is, what "L2 assurance" means, or what "change_address" implies. It provides:

| Primitive | What It Does |
|-----------|-------------|
| **Job provenance** | Stamps every job with immutable metadata: who triggered it, through which channel, from what origin. Tracks `principal_id` (who is calling) and `subject_id` (whose data is being accessed). |
| **Grants** | An append-only set of key-value claims attached to a job. Think of them as "things that have been proven during this job." Supports TTL-based expiry and deny grants. |
| **Grant mappings** | Rules that say "when MCP tool X returns Y, automatically issue grant Z on the job." Defined by the solution, evaluated by the platform. |
| **Channel authentication** | The platform knows which channels require authentication and what role/grants to pre-issue for authenticated channels. |
| **Access policies** | Declarative rules on each tool: what grants are required, how to scope queries, what fields to filter. Supports matching on root provenance (original trigger). Defined by the solution, enforced by the platform. |
| **Response filtering** | Strips fields from MCP responses based on current grants. Supports JSONPath-style selectors for nested field filtering. The platform applies filters mechanically — the solution defines what to filter. |
| **Context propagation** | When a skill messages another skill, the platform controls which grants carry over to the new job. `root_job_id` traces back to the original external trigger for full provenance. |
| **Post-validation** | After tool execution, verifies response data against access constraints as a safety net complementing pre-call injection. |

### Solution Layer (e.g., E-Commerce Pack)

The solution **defines the meaning** of everything through configuration:

| Concern | How It's Defined |
|---------|-----------------|
| What "actor_id" means (it's a customer_id) | Grant mapping on identity-mcp tools |
| What "assurance:L2" means | A grant name used in access policies |
| What "scope:change_address" means | A grant name issued by verification and required by mutation tools |
| Which fields to show at different assurance levels | Response filter rules in skill YAML |
| Which tools need which grants | Access policies per tool in skill YAML |
| How verification works (OTP, magic-link) | identity-mcp implementation (solution code) |
| What an admin channel looks like | Channel definition with auth config |

### Why This Matters

Tomorrow, someone builds a **healthcare solution** on ADAS. They define:
- `actor_id` = a patient_id
- `assurance:hipaa_verified` = patient has completed HIPAA identity verification
- `scope:view_records` = patient consented to share medical records
- Response filters that mask diagnosis codes at low assurance

They use the **exact same platform primitives**. No platform changes needed. The platform doesn't know it's healthcare — it just enforces grants and policies.

---

## 5. Platform Primitives

### 5.1 Job Provenance

Every job created by the platform carries immutable provenance metadata, including principal and subject identity tracking.

#### Schema

```
JobProvenance {
  job_id:           string    # Unique, platform-generated (e.g., "job_abc123")
  skill_id:         string    # Which skill this job is assigned to
  organization_id:  string    # Multi-tenant scope

  origin: {
    type:           enum      # "channel" | "trigger" | "skill_message"
    channel:        string?   # Channel name (if type = channel). e.g., "email", "admin_api"
    sender_ref:     string?   # Raw sender identity from transport (if type = channel)
                              # e.g., "david@gmail.com", "admin@company.com"
    trigger_id:     string?   # Trigger ID (if type = trigger)
    sender_skill:   string?   # Sending skill ID (if type = skill_message)
    sender_job_id:  string?   # Sending job ID (if type = skill_message)
  }

  principal_id:     string?   # Who is calling -- the actor making the request.
                              # Set from the actor system: channel auth identity,
                              # trigger service account, or inherited from parent job.
                              # For channel origins, this is the authenticated user identity.
                              # For triggers, this is the trigger's service principal.
                              # For skill_message, inherited from the sending job's principal_id.

  subject_id:       string?   # Whose data is being accessed or acted upon.
                              # Set when an actor_id grant is issued (e.g., via identity
                              # resolution). For customer-facing jobs, this is the resolved
                              # customer_id. For admin jobs, this may differ from principal_id
                              # (admin is the principal, customer is the subject).
                              # Updated by the platform when actor_id grant is issued.

  parent_job_id:    string?   # If this job originated from another job (via skill message)
  root_job_id:      string?   # The ultimate origin job in the chain (for full traceability)

  created_at:       timestamp
}
```

#### Principal vs. Subject Identity

The distinction between `principal_id` and `subject_id` is critical for audit and access control:

- **`principal_id`** answers "who is making this request?" It comes from the actor system -- the authenticated identity of the caller. For channel-originated jobs, this is set from channel authentication (e.g., SSO user ID, email sender). For triggers, it is the trigger's service account. For skill-to-skill messages, it is inherited from the parent job.

- **`subject_id`** answers "whose data is being accessed?" It is set by the platform when an `actor_id` grant is issued (via grant mappings). For example, when `identity.candidates.search` resolves a customer, the platform sets `subject_id` to the resolved `customer_id`. In customer self-service, `principal_id` and `subject_id` are the same person. In admin scenarios, they differ: the admin is the principal, the customer whose data is being viewed is the subject.

This separation enables:
- **Audit clarity:** Logs show both who performed the action and whose data was affected.
- **Access policy precision:** Policies can distinguish "is the caller the data owner?" from "does the caller have permission to view this data?"
- **Cross-actor operations:** Admin looking up a customer's order has `principal_id=admin_sarah` and `subject_id=cus_42`.

#### Immutability Rules

- All provenance fields are **set at job creation** and **never modified**, except `subject_id` which is updated by the platform when an `actor_id` grant is first issued.
- No skill, MCP, or API can change provenance after creation (other than the platform setting `subject_id`).
- The platform generates `job_id` — skills cannot choose their own.
- `principal_id` is set once at job creation and never changes.

#### Examples

**Customer emails support:**
```json
{
  "job_id": "job_001",
  "skill_id": "support-tier-1",
  "organization_id": "org_acme",
  "origin": {
    "type": "channel",
    "channel": "email",
    "sender_ref": "david@gmail.com"
  },
  "principal_id": "david@gmail.com",
  "subject_id": null,
  "parent_job_id": null,
  "root_job_id": "job_001",
  "created_at": "2026-02-03T10:00:00Z"
}
```

Note: `subject_id` starts as null and is set to `"cus_42"` when the `actor_id` grant is issued after identity resolution.

**Timer fires for daily reconciliation:**
```json
{
  "job_id": "job_002",
  "skill_id": "finance-ops",
  "organization_id": "org_acme",
  "origin": {
    "type": "trigger",
    "trigger_id": "daily_reconciliation"
  },
  "principal_id": "trigger:daily_reconciliation",
  "subject_id": null,
  "parent_job_id": null,
  "root_job_id": "job_002",
  "created_at": "2026-02-03T00:00:00Z"
}
```

**support-tier-1 escalates to returns-ops:**
```json
{
  "job_id": "job_003",
  "skill_id": "returns-ops",
  "organization_id": "org_acme",
  "origin": {
    "type": "skill_message",
    "sender_skill": "support-tier-1",
    "sender_job_id": "job_001"
  },
  "principal_id": "david@gmail.com",
  "subject_id": "cus_42",
  "parent_job_id": "job_001",
  "root_job_id": "job_001",
  "created_at": "2026-02-03T10:05:00Z"
}
```

Note: `principal_id` is inherited from the parent job. `subject_id` is inherited because the `actor_id` grant was already resolved in the parent.

**Admin uses dashboard:**
```json
{
  "job_id": "job_004",
  "skill_id": "admin-dashboard",
  "organization_id": "org_acme",
  "origin": {
    "type": "channel",
    "channel": "admin_api",
    "sender_ref": "admin@acme.com"
  },
  "principal_id": "admin_sarah",
  "subject_id": null,
  "parent_job_id": null,
  "root_job_id": "job_004",
  "created_at": "2026-02-03T11:00:00Z"
}
```

Note: When the admin looks up customer `cus_99`, the platform sets `subject_id` to `"cus_99"` -- showing that the admin (principal) is accessing the customer's (subject) data.

---

### 5.2 Grants

Grants are **claims that have been proven or earned** during a job's execution. They are the core mechanism for progressive trust building.

#### Schema

```
Grant {
  key:            string      # Grant identifier (e.g., "actor_id", "scope:change_address")
  value:          string      # Grant value (e.g., "cus_42", "true")
  issued_by:      string      # Who issued this grant ("platform" or an MCP name)
  issued_tool:    string?     # Which tool call produced this grant (if MCP-issued)
  issued_at:      timestamp   # When the grant was issued
  reason:         string?     # Human-readable reason (for audit)
  metadata: {
    ttl_seconds:  integer?    # Optional: time-to-live in seconds from issued_at
    expires_at:   timestamp?  # Optional: absolute expiration time (computed from ttl_seconds
                              # at issuance, or set explicitly). If both ttl_seconds and
                              # expires_at are provided, expires_at takes precedence.
  }
}
```

#### Rules

| Rule | Description |
|------|-------------|
| **Append-only** | Grants can be added to a job but never removed or modified. |
| **No skill-direct-write** | Skills cannot directly write grants. Grants are issued by: (a) the platform (channel auth, trigger role), or (b) MCP tool responses (via grant mappings). |
| **No downgrade** | If a grant mapping would issue a "lower" version of an existing grant, the existing grant is preserved and the new one is added alongside it. The access policy decides which one matters. |
| **Scoped to job** | Grants exist only for the lifetime of a job. They do not persist across jobs (unless explicitly propagated via context propagation rules). |
| **Auditable** | Every grant issuance is logged with full context (which tool call, what response triggered it). |
| **TTL expiry** | Grants with `ttl_seconds` or `expires_at` are treated as expired once the current time exceeds `expires_at`. Expired grants are ignored during policy evaluation (as if they do not exist). They remain in the grant log for audit purposes but are not considered "present" when checking `require_grants` or `has_grant`. |
| **Deny grants** | Grants with the `deny:` prefix (e.g., `deny:ecom.assurance_level`) are deny/override grants. During policy evaluation, deny grants take precedence over their positive counterparts. If both `scope:change_address` and `deny:scope:change_address` exist on a job, the grant `scope:change_address` is considered not present for access decisions. |

#### Grant Naming Conventions

The platform enforces the reserved `p.` namespace and validates MCP grant namespaces. Solutions should follow standard naming patterns:

| Pattern | Example | Usage |
|---------|---------|-------|
| `actor_id` | `actor_id: "cus_42"` | Identifies the external actor this job is about |
| `role` | `role: "admin"` | Pre-issued by platform for authenticated channels |
| `assurance:<level>` | `assurance:L2: "true"` | Earned through verification flows |
| `scope:<action>` | `scope:change_address: "true"` | Earned through scoped verification |
| `deny:<grant_key>` | `deny:scope:change_address: "true"` | Deny/override grant -- negates the corresponding positive grant |
| `p.<name>` | `p.verified_channel: "true"` | **Reserved:** platform-only grants (see namespace rules below) |

#### Reserved Grant Namespaces

Grants with the prefix `p.` are **reserved for platform-only issuance**. This ensures that security-critical grants cannot be forged by solution-level MCPs.

| Rule | Description |
|------|-------------|
| **`p.*` is platform-only** | Only the platform can write grants whose key starts with `p.`. Any grant mapping that attempts to issue a `p.*` grant from an MCP response is rejected at configuration validation time. |
| **MCP namespace isolation** | MCPs can only write grants within their registered namespace. For example, `identity-mcp` can write grants prefixed with `identity.` or generic grants like `actor_id` and `assurance:*` as configured in its grant mappings. An MCP cannot issue grants in another MCP's namespace. |
| **Namespace validation** | The platform validates grant namespaces at two points: (1) **Configuration time** -- when grant mappings are loaded, the platform verifies that no MCP mapping issues `p.*` grants and that MCPs only issue grants in their allowed namespaces. (2) **Runtime** -- when a grant is about to be issued from an MCP response, the platform verifies the key is within the MCP's allowed namespace before appending it. |
| **Platform-issued grants** | The platform uses the `p.` namespace for internal security claims. Examples: `p.channel_authenticated`, `p.provenance_verified`, `p.rate_limit_ok`. These cannot be spoofed by any MCP or grant mapping. |

#### Deny Grant Rules

Deny grants provide a mechanism to override or negate existing grants without violating the append-only constraint:

1. **Deny grant format:** A deny grant has the key `deny:<original_grant_key>` with any non-empty value (typically `"true"`).
2. **Precedence:** During policy evaluation, if a deny grant exists for a given key, the corresponding positive grant is treated as absent. Deny grants always win.
3. **Issuance:** Deny grants can be issued by the platform (e.g., in response to a lockout event) or by MCP tool responses (via grant mappings), following the same namespace rules as positive grants.
4. **Use cases:** Revoking a scope after suspicious activity, platform-level lockout overrides, time-limited access revocation.
5. **Audit:** Deny grants are logged identically to positive grants, with the `deny:` prefix making the intent explicit in audit logs.

**Example: Lockout issues a deny grant**
```yaml
grant_mappings:
  - mcp: identity-mcp
    tool: identity.challenge.verify
    when:
      success: false
      locked: true
    issues:
      - key: "deny:assurance:L0"
        value: "true"
        reason: "Account locked due to max verification attempts"
```

#### TTL Grant Rules

TTL provides time-bound grants within a job's lifetime:

1. **Setting TTL:** Grant mappings can specify `ttl_seconds` in the grant metadata. The platform computes `expires_at = issued_at + ttl_seconds`.
2. **Checking expiry:** On every access policy evaluation, the platform checks whether each relevant grant has expired. Expired grants are treated as absent.
3. **No renewal:** Expired grants cannot be renewed. A new grant with the same key can be issued (append-only), which effectively replaces the expired one for policy evaluation.
4. **Audit retention:** Expired grants remain in the grant log with their original `issued_at` and `expires_at` for audit reconstruction.

**Example: Scoped grant with TTL**
```yaml
grant_mappings:
  - mcp: identity-mcp
    tool: identity.challenge.verify
    when:
      success: true
    issues:
      - key_template: "scope:{{ request.purpose }}"
        value: "true"
        reason: "Scoped authorization via verification"
        metadata:
          ttl_seconds: 900    # Valid for 15 minutes
```

---

### 5.3 Grant Mappings

Grant mappings are **rules that automatically issue grants** when an MCP tool returns specific results. They are defined by the solution and evaluated by the platform.

#### Schema

```yaml
grant_mappings:
  - mcp: <mcp-name>
    tool: <tool-name>
    when:                        # Conditions on the tool response
      <response_field>: <expected_value>
    issues:                      # Grants to issue when conditions match
      - key: <grant_key>
        value: <literal or response_path>
        reason: <human-readable>
        metadata:                # Optional
          ttl_seconds: <integer> # Optional: grant expires after this many seconds
```

#### Evaluation Rules

1. After every MCP tool call, the platform checks all grant mappings for that MCP+tool combination.
2. If the `when` conditions match the response, the specified grants are appended to the job.
3. Grant mappings are evaluated **by the platform** — the MCP and skill are not involved.
4. If a grant with the same key already exists, the new one is added alongside (append-only).
5. The platform validates that the issued grant key is within the MCP's allowed namespace and is not in the reserved `p.*` namespace.
6. When a grant mapping issues an `actor_id` grant, the platform also sets `subject_id` on the job provenance.

#### Value Resolution

Grant values can be:
- **Literal:** `value: "true"` — always this exact string.
- **From response:** `value_from_response: "candidates[0].customer_id"` — extracted from the MCP response using a dot-path.
- **From request:** `value_from_request: "purpose"` — extracted from the tool call's input arguments.
- **Template:** `value_template: "scope:{{ request.purpose }}"` — composed from request/response fields.

#### Example (E-Commerce)

```yaml
grant_mappings:

  # When identity.candidates.search returns a single unambiguous match,
  # issue an actor_id grant linking the job to that customer.
  - mcp: identity-mcp
    tool: identity.candidates.search
    when:
      ambiguous: false
      candidates_count_gte: 1
    issues:
      - key: actor_id
        value_from_response: "candidates[0].customer_id"
        reason: "Candidate resolved from identity search (single match)"

  # When identity.challenge.verify succeeds, issue assurance and scope grants.
  - mcp: identity-mcp
    tool: identity.challenge.verify
    when:
      success: true
    issues:
      - key_template: "assurance:{{ response.assurance_level }}"
        value: "true"
        reason: "Identity verification succeeded"
      - key_template: "scope:{{ request.purpose }}"
        value: "true"
        reason: "Scoped authorization earned via verification"
        metadata:
          ttl_seconds: 900    # Scoped grants expire after 15 minutes
```

---

### 5.4 Channel Authentication

Channels can be configured with authentication requirements. When a message arrives on an authenticated channel, the platform **pre-issues grants** based on the authentication result.

#### Schema

```yaml
channels:
  - id: <channel-id>
    type: email | telegram | api | admin_api | cli
    authentication:
      method: none | api_key | sso | oauth
      required: true | false
    pre_issued_grants:           # Grants issued automatically for authenticated senders
      - key: <grant_key>
        value: <literal or from_auth>
        reason: <human-readable>
```

#### Examples

**Public email channel (no auth):**
```yaml
channels:
  - id: customer_email
    type: email
    authentication:
      method: none
      required: false
    pre_issued_grants: []        # No grants -- actor is unknown
```

**Admin API channel (SSO required):**
```yaml
channels:
  - id: admin_api
    type: admin_api
    authentication:
      method: sso
      required: true
    pre_issued_grants:
      - key: role
        value: "admin"
        reason: "Authenticated via admin SSO"
      - key: actor_id
        value_from_auth: "user_id"
        reason: "Admin user identity from SSO token"
```

**Webhook channel (API key):**
```yaml
channels:
  - id: shopify_webhook
    type: api
    authentication:
      method: api_key
      required: true
    pre_issued_grants:
      - key: role
        value: "system"
        reason: "Authenticated webhook source"
```

#### How It Works

1. Message arrives on a channel.
2. Platform checks the channel's authentication config.
3. If authentication is required and fails -> message rejected (no job created).
4. If authentication succeeds (or not required) -> job created with provenance + pre-issued grants.
5. Pre-issued grants appear in the job's grant list with `issued_by: "platform"`.
6. `principal_id` is set from the authentication result (or `sender_ref` for unauthenticated channels).

---

### 5.5 Access Policies

Access policies are **declarative rules** that the platform evaluates before every MCP tool call. They are defined per tool in the solution's skill YAML. The platform uses both **pre-call injection** (constraining the query before it reaches the MCP) and **post-call validation** (verifying response data after tool execution) as a dual enforcement strategy.

#### Schema

```yaml
access_policy:
  rules:
    - name: <rule-name>                   # Human-readable label
      description: <what this rule does>

      match:                              # When does this rule apply?
        origin_type: channel | trigger | skill_message | any
        channel: <channel-id>             # Optional: specific channel
        has_grant: <grant_key>            # Optional: only if this grant exists
        root_origin_type: channel | trigger | skill_message  # Optional: match on the
                                          # origin type of the ROOT job (original trigger),
                                          # not just the immediate job's origin
        root_channel: <channel-id>        # Optional: match on the channel of the root job

      effect: allow | deny | constrain    # What happens?

      # If effect = allow:
      access: unrestricted | filtered

      # If effect = deny:
      deny_message: <error message>

      # If effect = constrain:
      require_grants:                     # Grants that must be present
        - key: <grant_key>
          value: <expected>               # Optional: specific value required
      constrain_query:                    # Scope the MCP query (pre-call injection)
        - field: <mcp_input_field>
          must_equal_grant: <grant_key>   # Field must match a grant's value
      post_validate:                      # Verify response data (post-call validation)
        - response_field: <field_path>    # Field in the MCP response to check
          must_equal_grant: <grant_key>   # Must match the value of this grant
          on_violation: block | filter    # block = reject entire response,
                                          # filter = remove non-matching records
      response_filter: <filter_id>        # Apply a response filter (see 5.6)

  default_effect: deny                    # What if no rule matches? (should always be deny)
```

#### Dual Scoping: Inject + Validate

**Resolved design decision:** The platform uses both pre-call injection AND post-call validation as complementary enforcement mechanisms:

1. **Pre-call injection** (`constrain_query`): Before the MCP tool call, the platform injects constraint parameters into the call (e.g., adding `customer_id: "cus_42"` to the query). This prevents the MCP from ever seeing or processing unauthorized data.

2. **Post-call validation** (`post_validate`): After the MCP returns its response, the platform verifies that all returned records satisfy the access constraints. This serves as a safety net for cases where pre-call injection is insufficient (e.g., the MCP ignores the constraint, returns denormalized data, or the constraint field is not a direct query parameter).

Both mechanisms can be used together on the same rule. When both are present, pre-call injection runs first, then post-call validation runs on the response. See Section 5.8 for detailed post-validation behavior.

#### Evaluation Order

1. Rules are evaluated **top to bottom**.
2. The **first matching rule** is applied.
3. If no rule matches, the `default_effect` is applied (should be `deny`).
4. Deny grants are evaluated before checking `has_grant` -- if a deny grant exists for a required grant, the grant is considered absent.
5. Grant TTL is checked -- expired grants are treated as absent.

#### Root Provenance Matching

Access policies can match on the **root origin** of the job chain, not just the immediate job's origin. This is critical for skill-to-skill scenarios where the immediate origin is `skill_message` but the security decision should depend on how the chain was originally triggered.

- `root_origin_type`: Matches the `origin.type` of the root job (the job identified by `root_job_id`). The platform resolves this by looking up the root job's provenance.
- `root_channel`: Matches the `origin.channel` of the root job. Only meaningful when `root_origin_type` is `channel`.

This enables policies like "allow full access for skill messages, but only if the original trigger was an authenticated admin channel" or "deny mutations on skill messages that trace back to a public channel."

#### Example (E-Commerce: orders.order.get)

```yaml
access_policy:
  rules:
    # Rule 1: Admin has full access
    - name: admin_full_access
      description: Authenticated admins can view any order
      match:
        has_grant: role
        grant_value: admin
      effect: allow
      access: unrestricted

    # Rule 2: System/trigger has full access
    - name: system_full_access
      description: Timer-triggered jobs have full access
      match:
        origin_type: trigger
      effect: allow
      access: unrestricted

    # Rule 3: Internal skill messages have full access
    - name: skill_message_access
      description: Skill-to-skill messages have full access
      match:
        origin_type: skill_message
      effect: allow
      access: unrestricted

    # Rule 4: External actor must be identified, scoped to their data
    - name: customer_scoped_access
      description: Identified external actors can view only their own orders
      match:
        origin_type: channel
      effect: constrain
      require_grants:
        - key: actor_id
      constrain_query:
        - field: customer_id
          must_equal_grant: actor_id
      post_validate:
        - response_field: customer_id
          must_equal_grant: actor_id
          on_violation: block
      response_filter: assurance_based

  default_effect: deny
```

---

### 5.6 Response Filtering

Response filters strip or mask fields from MCP responses based on the current job's grants. This prevents PII leakage even when the MCP returns full data. Filters support JSONPath-style selectors for nested field access.

#### Schema

```yaml
response_filters:
  - id: <filter-id>
    rules:
      - when_grant: <grant_key>       # Which grant to check
        grant_present: true | false
        fields:
          include: [field1, field2]    # Allowlist (only these fields pass through)
          # OR
          exclude: [field3, field4]    # Denylist (these fields are stripped)
          # OR
          mask: { field5: "<mask_pattern>" }  # Mask specific fields
    default:
      include: [<minimal safe fields>]  # Fallback if no rule matches
```

#### JSONPath-Style Selectors

**Resolved design decision:** Response filters support JSONPath-style selectors for nested field access, enabling fine-grained control over complex response structures.

Supported selector syntax:

| Selector | Description | Example |
|----------|-------------|---------|
| `$.field` | Top-level field | `$.order_id` |
| `$.nested.field` | Nested object field | `$.shipping_address.city` |
| `$.array[*].field` | Field within all array elements | `$.items[*].title` |
| `$.array[*].nested.field` | Nested field within array elements | `$.items[*].product.name` |
| `$.deep.*.field` | Wildcard at any nesting level | `$.customer.*.verified` |

When a selector is used in an `include` list, only the specified paths are retained in the response. The response structure is preserved (objects and arrays keep their shape) but only matched paths contain data.

#### Example (E-Commerce)

```yaml
response_filters:
  - id: assurance_based
    rules:
      # Verified to L2: full data
      - when_grant: "assurance:L2"
        grant_present: true
        fields:
          include: all

      # Verified to L1: most data, no payment details
      - when_grant: "assurance:L1"
        grant_present: true
        fields:
          include:
            - $.order_id
            - $.status
            - $.created_at
            - $.updated_at
            - $.items[*].title
            - $.items[*].quantity
            - $.items[*].price_cents
            - $.items[*].sku
            - $.shipping_address
            - $.tracking_number
            - $.tracking_url
            - $.estimated_delivery
            - $.currency
            - $.total_cents
          exclude:
            - $.billing_address
            - $.payment_method
            - $.payment_details
            - $.internal_notes
            - $.metadata
            - $.customer.email      # use masked version
            - $.customer.phone      # use masked version

      # L0 (identified but not verified): minimal safe data
      - when_grant: "assurance:L0"
        grant_present: true
        fields:
          include:
            - $.order_id
            - $.status
            - $.created_at
            - $.items[*].title      # just names, not prices/SKUs
            - $.items[*].quantity
            - $.currency

    # Fallback: should never reach here (access policy blocks unidentified actors)
    default:
      include:
        - $.order_id
        - $.status
```

---

### 5.7 Context Propagation (Skill-to-Skill)

When a skill sends a message to another skill, the platform creates a new job. Context propagation rules determine which grants carry over. The `root_job_id` field traces the entire chain back to the original external trigger, enabling root provenance matching in access policies.

#### Schema

```yaml
context_propagation:
  defaults:
    inherit_grants:               # These grant keys are copied to the new job
      - <grant_key_pattern>
    drop_grants:                  # These grant keys are NOT copied
      - <grant_key_pattern>
    provenance:                   # How the origin chain is preserved
      preserve_root: true         # root_job_id traces back to the original external trigger
```

#### Root Job Tracing

The `root_job_id` field is critical for full provenance tracing:

- When a job is created from a channel or trigger (no parent), `root_job_id` is set to the job's own `job_id`.
- When a job is created via skill-to-skill message, `root_job_id` is inherited from the parent job's `root_job_id`.
- This means `root_job_id` always points to the **original** job that started the entire chain, regardless of how many skill-to-skill hops have occurred.
- Access policies can use `root_origin_type` and `root_channel` to match against the root job's provenance, enabling security decisions based on the original trigger rather than the immediate hop.
- The platform resolves root provenance by looking up the root job's record using `root_job_id`.

**Example chain:**
```
Customer email -> job_001 (root_job_id: job_001, origin: channel/email)
  -> skill_message -> job_030 (root_job_id: job_001, origin: skill_message)
    -> skill_message -> job_045 (root_job_id: job_001, origin: skill_message)
```

All three jobs share the same `root_job_id`, and `root_origin_type` resolves to `channel` with `root_channel` resolving to `email` for all of them.

#### Design Rationale

When support-tier-1 (handling an external customer) escalates to returns-ops:

- **Inherit `actor_id`:** returns-ops should know which customer this is about, so its queries are scoped correctly.
- **Drop `scope:*`:** Scoped authorizations don't transfer. If returns-ops needs to do high-risk operations, it must earn its own scoped grants (or it operates as an internal agent with its own access policies).
- **Preserve root_job_id:** For audit -- you can always trace back to the original customer email. Access policies in downstream skills can match on `root_origin_type` to enforce security based on the original trigger.
- **Inherit `principal_id`:** The new job inherits the principal identity from the parent, maintaining the audit trail of who originated the request.
- **Inherit `subject_id`:** If the parent job had a resolved subject, the child job inherits it.

#### Example

```yaml
context_propagation:
  defaults:
    inherit_grants:
      - actor_id                  # Who this job is about
    drop_grants:
      - "scope:*"                 # Scoped auth doesn't transfer
      - "assurance:*"             # Assurance level doesn't transfer
      - "deny:*"                  # Deny grants don't transfer
    provenance:
      preserve_root: true

  overrides:                      # Per-skill overrides
    - from_skill: "*"
      to_skill: "finance-ops"
      inherit_grants: []          # Finance-ops gets NO customer context -- it works with order IDs
      additional_grants:
        - key: role
          value: "internal_agent"
          reason: "Skill-to-skill escalation to finance"
```

---

### 5.8 Post-Validation

Post-validation is the complementary enforcement mechanism to pre-call query injection. After a tool call executes and the MCP returns a response, the platform verifies that the response data satisfies the access constraints defined in the access policy.

#### Why Both Injection and Validation

Pre-call injection alone is insufficient in several scenarios:

1. **MCP ignores constraints:** The MCP may not support the injected filter parameter, or may interpret it differently than expected.
2. **Denormalized data:** The response may contain embedded records from other entities (e.g., an order response includes `related_orders` belonging to other customers).
3. **Aggregation queries:** Search or list endpoints may return mixed results despite query constraints.
4. **Schema evolution:** MCP response shapes may change, and post-validation catches constraint violations even when the query parameter mapping is stale.

#### Post-Validation Behavior

When `post_validate` is specified on a constrain rule:

1. The platform executes the MCP tool call (with any `constrain_query` injection applied).
2. The platform receives the MCP response.
3. For each `post_validate` entry, the platform checks the specified `response_field` against the grant value.
4. Violation handling depends on the `on_violation` setting:
   - **`block`**: If any record in the response violates the constraint, the entire response is rejected and the tool call returns an access error. This is the safe default for single-record lookups (e.g., `order.get`).
   - **`filter`**: Non-matching records are silently removed from the response. This is appropriate for list/search endpoints where partial results are acceptable (e.g., `order.search` returns only the caller's orders).
5. Post-validation runs **before** response filtering (Section 5.6). The response filter then applies to the validated (and possibly filtered) response.

#### Schema

```yaml
post_validate:
  - response_field: <jsonpath>      # Field in the response to check
    must_equal_grant: <grant_key>   # Must match the value of this grant
    on_violation: block | filter    # How to handle violations
```

#### Example

```yaml
# Single-record lookup: block on violation
post_validate:
  - response_field: $.customer_id
    must_equal_grant: actor_id
    on_violation: block

# List endpoint: filter out non-matching records
post_validate:
  - response_field: $.orders[*].customer_id
    must_equal_grant: actor_id
    on_violation: filter
```

#### Logging

Every post-validation check is logged in the access decision log:

```
post_validation_results {
  decision_id:      TEXT         # References the access_decisions record
  response_field:   TEXT         # The field that was checked
  grant_key:        TEXT         # The grant it was checked against
  grant_value:      TEXT         # The grant's value at evaluation time
  violation_found:  BOOLEAN      # Whether a violation was detected
  action_taken:     TEXT         # "none" | "blocked" | "filtered"
  records_filtered: INTEGER?     # Number of records removed (if action=filtered)
}
```

---

## 6. Solution-Level Configuration (E-Commerce Example)

This section shows how the e-commerce solution pack uses the platform primitives. Everything here is defined by the solution author, not by the platform.

### 6.1 Grant Definitions

The e-commerce solution uses these grant keys:

| Grant Key | Issued When | Meaning | Example Value |
|-----------|-------------|---------|---------------|
| `role` | Platform pre-issues on authenticated channels | The actor's role | `"admin"`, `"system"` |
| `actor_id` | identity.candidates.search returns unambiguous match | The resolved customer ID | `"cus_42"` |
| `assurance:L0` | identity.candidates.search returns unambiguous match | Soft-linked (no proof of control) | `"true"` |
| `assurance:L1` | identity.challenge.verify succeeds (basic) | Proof of channel control | `"true"` |
| `assurance:L2` | identity.challenge.verify succeeds (step-up) | Step-up verification complete | `"true"` |
| `scope:change_address` | identity.challenge.verify with purpose=change_address | Authorized to change address (TTL: 900s) | `"true"` |
| `scope:cancel_order` | identity.challenge.verify with purpose=cancel_order | Authorized to cancel order (TTL: 900s) | `"true"` |
| `scope:view_order` | identity.challenge.verify with purpose=view_order | Authorized to view full order details (TTL: 900s) | `"true"` |
| `deny:assurance:L0` | identity.challenge.verify fails with lockout | Revokes L0 assurance after lockout | `"true"` |

### 6.2 Identity MCP Grant Mappings

```yaml
grant_mappings:

  # Candidate resolution -> actor_id + L0
  - mcp: identity-mcp
    tool: identity.candidates.search
    when:
      ambiguous: false
      "candidates.length_gte": 1
    issues:
      - key: actor_id
        value_from_response: "candidates[0].customer_id"
        reason: "Single candidate resolved"
      - key: "assurance:L0"
        value: "true"
        reason: "Soft-linked via candidate resolution"

  # Successful verification -> assurance level + scope (with TTL)
  - mcp: identity-mcp
    tool: identity.challenge.verify
    when:
      success: true
    issues:
      - key_template: "assurance:{{ response.assurance_level }}"
        value: "true"
        reason: "Verification succeeded"
      - key_template: "scope:{{ request.purpose }}"
        value: "true"
        reason: "Scoped authorization via verification"
        metadata:
          ttl_seconds: 900

  # Lockout -> deny grant to revoke assurance
  - mcp: identity-mcp
    tool: identity.challenge.verify
    when:
      success: false
      locked: true
    issues:
      - key: "deny:assurance:L0"
        value: "true"
        reason: "Account locked due to max verification attempts"
```

### 6.3 Access Policies Per Tool

#### Low-Risk Read: orders.order.get

```yaml
tools:
  - name: orders.order.get
    access_policy:
      rules:
        - name: admin_access
          match: { has_grant: role, grant_value: admin }
          effect: allow
          access: unrestricted

        - name: trigger_access
          match: { origin_type: trigger }
          effect: allow
          access: unrestricted

        - name: internal_skill_access
          match: { origin_type: skill_message }
          effect: allow
          access: unrestricted

        - name: identified_customer
          match: { origin_type: channel }
          effect: constrain
          require_grants: [{ key: actor_id }]
          constrain_query:
            - field: customer_id
              must_equal_grant: actor_id
          post_validate:
            - response_field: $.customer_id
              must_equal_grant: actor_id
              on_violation: block
          response_filter: assurance_based

      default_effect: deny
```

#### High-Risk Mutation: orders.order.update_shipping_address

```yaml
tools:
  - name: orders.order.update_shipping_address
    access_policy:
      rules:
        - name: admin_access
          match: { has_grant: role, grant_value: admin }
          effect: allow
          access: unrestricted

        - name: deny_trigger
          match: { origin_type: trigger }
          effect: deny
          deny_message: "Automated triggers cannot change shipping addresses"

        - name: verified_customer
          match: { origin_type: channel }
          effect: constrain
          require_grants:
            - { key: actor_id }
            - { key: "scope:change_address" }
            - { key: "assurance:L2" }
          constrain_query:
            - field: customer_id
              must_equal_grant: actor_id

        - name: internal_with_scope
          match: { origin_type: skill_message }
          effect: constrain
          require_grants:
            - { key: "scope:change_address" }

      default_effect: deny
```

#### High-Risk Mutation: orders.order.cancel

```yaml
tools:
  - name: orders.order.cancel
    access_policy:
      rules:
        - name: admin_access
          match: { has_grant: role, grant_value: admin }
          effect: allow
          access: unrestricted

        - name: deny_trigger
          match: { origin_type: trigger }
          effect: deny
          deny_message: "Automated triggers cannot cancel orders"

        - name: verified_customer
          match: { origin_type: channel }
          effect: constrain
          require_grants:
            - { key: actor_id }
            - { key: "scope:cancel_order" }
            - { key: "assurance:L2" }
          constrain_query:
            - field: customer_id
              must_equal_grant: actor_id

        - name: internal_with_scope
          match: { origin_type: skill_message }
          effect: constrain
          require_grants:
            - { key: "scope:cancel_order" }

      default_effect: deny
```

#### Safe Identity Tool: identity.candidates.search

```yaml
tools:
  - name: identity.candidates.search
    access_policy:
      rules:
        - name: always_allowed
          match: { origin_type: any }
          effect: allow
          access: unrestricted   # This tool only returns masked data by design
      default_effect: allow
```

### 6.4 Response Filter Rules

```yaml
response_filters:
  - id: assurance_based
    description: Filter order data based on verified assurance level
    rules:
      - when_grant: "assurance:L2"
        grant_present: true
        fields:
          include: all

      - when_grant: "assurance:L1"
        grant_present: true
        fields:
          include:
            - $.order_id
            - $.status
            - $.created_at
            - $.updated_at
            - $.items[*].title
            - $.items[*].quantity
            - $.items[*].price_cents
            - $.items[*].sku
            - $.shipping_address
            - $.tracking_number
            - $.tracking_url
            - $.estimated_delivery
            - $.currency
            - $.total_cents
          exclude:
            - $.billing_address
            - $.payment_method
            - $.payment_details
            - $.internal_notes
            - $.metadata
            - $.customer.email      # use masked version
            - $.customer.phone      # use masked version

      - when_grant: "assurance:L0"
        grant_present: true
        fields:
          include:
            - $.order_id
            - $.status
            - $.created_at
            - $.items[*].title      # just names, not prices/SKUs
            - $.items[*].quantity
            - $.currency

    default:
      include:
        - $.order_id
        - $.status
```

### 6.5 Channel Definitions

```yaml
channels:
  # Public customer channels -- no pre-issued grants
  - id: customer_email
    type: email
    skills: [support-tier-1]
    authentication:
      method: none
    pre_issued_grants: []

  - id: customer_telegram
    type: telegram
    skills: [support-tier-1]
    authentication:
      method: none
    pre_issued_grants: []

  # Admin channel -- SSO authenticated
  - id: admin_api
    type: api
    skills: [admin-dashboard]
    authentication:
      method: sso
      required: true
      provider: okta
    pre_issued_grants:
      - key: role
        value: "admin"
        reason: "SSO-authenticated admin"
      - key: actor_id
        value_from_auth: user_id
        reason: "Admin identity from SSO"

  # Webhook channel -- API key authenticated
  - id: shopify_webhook
    type: api
    skills: [ecom-orchestrator]
    authentication:
      method: api_key
      required: true
    pre_issued_grants:
      - key: role
        value: "system"
        reason: "Authenticated external system"

  # Trigger (not really a channel, but for completeness)
  # Triggers are always internal -- platform auto-issues role:system
```

---

## 7. End-to-End Scenarios

### 7.1 External Customer: Order Tracking (Low Risk)

**Actor:** Customer David, emails "Where is my order #ORD-123?"

```
STEP 1: ADAS Core receives email on customer_email channel
+----------------------------------------------------------+
| JOB CREATED:                                             |
|   job_id: job_001                                        |
|   skill_id: support-tier-1                               |
|   origin: { type: channel, channel: customer_email,      |
|             sender_ref: "david@gmail.com" }              |
|   principal_id: "david@gmail.com"                        |
|   subject_id: null                                       |
|   grants: []  <- empty, public channel                   |
+----------------------------------------------------------+

STEP 2: Skill wants to call orders.order.get(ORD-123)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   origin_type = channel                                  |
|   Rule "identified_customer" matches                     |
|   require_grants: [actor_id] -> NOT PRESENT              |
|   BLOCKED: "Grant 'actor_id' required"                   |
+----------------------------------------------------------+

STEP 3: Skill calls identity.candidates.search(email: "david@gmail.com", order_id: "ORD-123")
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   Rule "always_allowed" matches                          |
|   ALLOWED                                                |
|                                                          |
| MCP RETURNS:                                             |
|   { candidates: [{ customer_id: "cus_42",               |
|     email_masked: "d***@gmail.com", score: 0.95 }],     |
|     ambiguous: false }                                   |
|                                                          |
| PLATFORM EVALUATES GRANT MAPPINGS:                       |
|   ambiguous=false, candidates.length=1 -> MATCH          |
|   ISSUES: actor_id="cus_42", assurance:L0="true"        |
|   SETS: subject_id="cus_42" on job provenance            |
|                                                          |
| JOB GRANTS NOW:                                          |
|   [{ key: actor_id, value: "cus_42" },                  |
|    { key: "assurance:L0", value: "true" }]               |
+----------------------------------------------------------+

STEP 4: Skill retries orders.order.get(ORD-123)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   Rule "identified_customer" matches                     |
|   require_grants: [actor_id] -> PRESENT                  |
|   constrain_query: customer_id must equal "cus_42"       |
|                                                          |
| PRE-CALL INJECTION: adds customer_id="cus_42" to call   |
|                                                          |
| MCP RETURNS response                                     |
|                                                          |
| POST-VALIDATION: $.customer_id == "cus_42" -> PASS      |
|                                                          |
| PLATFORM APPLIES RESPONSE FILTER: assurance_based        |
|   Current: assurance:L0                                  |
|   -> Include only: $.order_id, $.status, $.created_at,   |
|     $.items[*].title, $.items[*].quantity, $.currency    |
|                                                          |
| SKILL RECEIVES (filtered):                               |
|   { order_id: "ORD-123", status: "in_transit",          |
|     created_at: "2026-01-28",                            |
|     items: [{ title: "Blue Running Shoes",               |
|               quantity: 1 }],                            |
|     currency: "USD" }                                    |
+----------------------------------------------------------+

STEP 5: Skill replies to customer
+----------------------------------------------------------+
| "Hi David! Your order ORD-123 (Blue Running Shoes) is   |
|  currently in transit. Would you like me to look up the  |
|  detailed tracking information? I'll need to verify your |
|  identity first."                                        |
+----------------------------------------------------------+
```

**Key observations:**
- Customer never saw shipping address, payment info, or other customer's data.
- The skill didn't have to implement any access control logic -- the platform handled it.
- Even at L0, the customer got useful information (order status, item names).
- Both pre-call injection and post-validation were applied for defense in depth.

---

### 7.2 External Customer: Address Change (High Risk)

**Actor:** Same David, continuing the conversation: "I moved. Change delivery to 5 Herzl St, Tel Aviv."

```
STEP 6: Skill wants to call orders.order.update_shipping_address
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   origin_type = channel                                  |
|   Rule "verified_customer" matches                       |
|   require_grants: [actor_id, scope:change_address,       |
|                    assurance:L2]                          |
|   BLOCKED: "Grants 'scope:change_address' and            |
|             'assurance:L2' required"                      |
+----------------------------------------------------------+

STEP 7: Skill initiates step-up verification
  Calls: identity.challenge.create({
    customer_id: "cus_42",
    preferred_method: "sms_otp",
    purpose: "change_address"
  })
+----------------------------------------------------------+
| MCP RETURNS:                                             |
|   { challenge_id: "ch_99", method: "sms_otp",           |
|     delivery_hint: "+972******32",                       |
|     expires_in_seconds: 300 }                            |
|                                                          |
| (No grant mappings for challenge.create -- creating a    |
|  challenge doesn't prove anything yet)                   |
+----------------------------------------------------------+

STEP 8: Skill asks customer for the code
+----------------------------------------------------------+
| "For security, I've sent a verification code to your     |
|  phone ending in **32. Please reply with the code."      |
+----------------------------------------------------------+

STEP 9: Customer replies "483921"
  Skill calls: identity.challenge.verify({
    challenge_id: "ch_99",
    proof: { code: "483921" },
    purpose: "change_address"     <- passed through from the challenge
  })
+----------------------------------------------------------+
| MCP RETURNS:                                             |
|   { success: true, assurance_level: "L2",                |
|     customer_id: "cus_42" }                              |
|                                                          |
| PLATFORM EVALUATES GRANT MAPPINGS:                       |
|   success=true -> MATCH                                  |
|   ISSUES: assurance:L2="true",                           |
|           scope:change_address="true" (TTL: 900s)        |
|                                                          |
| JOB GRANTS NOW:                                          |
|   [{ key: actor_id, value: "cus_42" },                  |
|    { key: "assurance:L0", value: "true" },               |
|    { key: "assurance:L2", value: "true" },               |
|    { key: "scope:change_address", value: "true",         |
|      metadata: { ttl_seconds: 900,                       |
|                  expires_at: "2026-02-03T10:20:00Z" } }] |
+----------------------------------------------------------+

STEP 10: Skill retries the address change
  Calls: orders.order.update_shipping_address({
    order_id: "ORD-123",
    new_address: { line1: "5 Herzl St", city: "Tel Aviv",
                   postal_code: "6100000", country: "IL" }
  })
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   Rule "verified_customer" matches                       |
|   require_grants: [actor_id, scope:change_address,       |
|                    assurance:L2] -> ALL PRESENT           |
|   TTL check: scope:change_address expires at 10:20,      |
|              current time 10:06 -> NOT EXPIRED            |
|   constrain_query: customer_id must equal "cus_42"       |
|   ALLOWED                                                |
|                                                          |
| MCP executes the mutation.                               |
+----------------------------------------------------------+

STEP 11: Skill confirms to customer
+----------------------------------------------------------+
| "Done! Your shipping address for ORD-123 has been        |
|  updated to 5 Herzl St, Tel Aviv. Is there anything      |
|  else I can help with?"                                  |
+----------------------------------------------------------+
```

---

### 7.3 Admin: Look Up Any Order

**Actor:** Admin Sarah, authenticated via SSO, uses admin dashboard.

```
STEP 1: Admin opens dashboard and looks up ORD-456 (belongs to customer cus_99)
+----------------------------------------------------------+
| JOB CREATED:                                             |
|   job_id: job_010                                        |
|   skill_id: admin-dashboard                              |
|   origin: { type: channel, channel: admin_api,           |
|             sender_ref: "sarah@acme.com" }               |
|   principal_id: "admin_sarah"                            |
|   subject_id: null (will be set when viewing cus_99)     |
|   grants: [                                              |
|     { key: role, value: "admin",                         |
|       issued_by: "platform", reason: "SSO auth" },      |
|     { key: actor_id, value: "admin_sarah",               |
|       issued_by: "platform", reason: "SSO identity" }   |
|   ]  <- pre-issued by platform because admin_api channel |
+----------------------------------------------------------+

STEP 2: Skill calls orders.order.get(ORD-456)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   has_grant: role=admin -> YES                           |
|   Rule "admin_access" matches FIRST                      |
|   effect: allow, access: unrestricted                    |
|   ALLOWED -- no query scoping, no response filtering     |
|                                                          |
| PLATFORM SETS: subject_id="cus_99" (data owner)         |
|                                                          |
| SKILL RECEIVES (full data):                              |
|   { order_id: "ORD-456", customer_id: "cus_99",         |
|     status: "completed",                                 |
|     shipping_address: { full address },                  |
|     billing_address: { full address },                   |
|     payment_details: { ... },                            |
|     items: [ full details ],                             |
|     ... everything }                                     |
+----------------------------------------------------------+
```

**Key difference from customer scenario:**
- Admin didn't need to prove they own this order.
- Admin didn't need step-up verification.
- All data returned unfiltered.
- The **only difference** is which channel they came through and what grants were pre-issued.
- Audit log shows `principal_id=admin_sarah`, `subject_id=cus_99` -- clear record of who accessed whose data.

---

### 7.4 Timer: Automated Safety Net

**Actor:** System timer (ecom-orchestrator safety net, every 5 minutes).

```
STEP 1: Timer fires
+----------------------------------------------------------+
| JOB CREATED:                                             |
|   job_id: job_020                                        |
|   skill_id: ecom-orchestrator                            |
|   origin: { type: trigger, trigger_id: "safety_net" }    |
|   principal_id: "trigger:safety_net"                     |
|   subject_id: null                                       |
|   grants: [                                              |
|     { key: role, value: "system",                        |
|       issued_by: "platform",                             |
|       reason: "Timer-triggered job" }                    |
|   ]                                                      |
+----------------------------------------------------------+

STEP 2: Skill calls orders.order.search({ status: "processing", older_than: "2h" })
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   origin_type = trigger                                  |
|   Rule "trigger_access" matches                          |
|   effect: allow, access: unrestricted                    |
|   ALLOWED -- full access to search across all orders     |
+----------------------------------------------------------+

STEP 3: Skill calls orders.order.update_shipping_address (for a stuck order)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   origin_type = trigger                                  |
|   Rule "deny_trigger" matches                            |
|   effect: deny                                           |
|   BLOCKED: "Automated triggers cannot change             |
|             shipping addresses"                          |
|                                                          |
| (The safety net can READ anything, but certain MUTATIONS |
|  are explicitly denied even for system triggers)         |
+----------------------------------------------------------+
```

---

### 7.5 Skill-to-Skill: Return Escalation

**Actor:** Customer emailed about a return -> support-tier-1 escalates to returns-ops.

```
STEP 1: support-tier-1 (job_001) sends message to returns-ops
  "Process return for customer cus_42, order ORD-123, reason: item doesn't fit"

+----------------------------------------------------------+
| JOB CREATED (for returns-ops):                           |
|   job_id: job_030                                        |
|   skill_id: returns-ops                                  |
|   origin: { type: skill_message,                         |
|             sender_skill: "support-tier-1",              |
|             sender_job_id: "job_001" }                   |
|   principal_id: "david@gmail.com"  <- inherited          |
|   subject_id: "cus_42"            <- inherited           |
|   parent_job_id: "job_001"                               |
|   root_job_id: "job_001"  <- traces to the customer email|
|                                                          |
| ROOT PROVENANCE (resolved from root_job_id):             |
|   root_origin_type: "channel"                            |
|   root_channel: "customer_email"                         |
|                                                          |
| CONTEXT PROPAGATION:                                     |
|   inherit_grants: [actor_id]  -> copied                  |
|   drop_grants: [scope:*, assurance:*] -> dropped         |
|                                                          |
|   grants: [                                              |
|     { key: actor_id, value: "cus_42",                    |
|       inherited_from: "job_001" }                        |
|   ]                                                      |
+----------------------------------------------------------+

STEP 2: returns-ops calls orders.order.get(ORD-123)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   origin_type = skill_message                            |
|                                                          |
|   Root provenance check available:                       |
|     root_origin_type = "channel"                         |
|     root_channel = "customer_email"                      |
|                                                          |
|   Rule "skill_message_access" matches                    |
|   effect: allow, access: unrestricted                    |
|   ALLOWED -- internal skill gets full data               |
|                                                          |
| (returns-ops needs full order details to process the     |
|  return -- items, prices, addresses. It's an internal    |
|  agent acting on a structured request, not a customer    |
|  proxy.)                                                 |
+----------------------------------------------------------+

STEP 3: returns-ops calls returns.refund.execute(ORD-123, amount: 8500)
+----------------------------------------------------------+
| (Access policy for refund execution might require        |
|  different grants -- e.g., amount > $500 requires        |
|  finance-ops approval. But that's solution-level policy, |
|  using the same platform primitives.)                    |
+----------------------------------------------------------+
```

**Example: Root provenance matching in access policy**

For tools that should behave differently based on the original trigger, access policies can match on root provenance:

```yaml
tools:
  - name: returns.refund.execute
    access_policy:
      rules:
        # Admin-initiated chains: allow high-value refunds
        - name: admin_origin_refund
          description: Refunds from admin-originated chains have higher limits
          match:
            origin_type: skill_message
            root_origin_type: channel
            root_channel: admin_api
          effect: allow
          access: unrestricted

        # Customer-initiated chains: limit refund amount
        - name: customer_origin_refund
          description: Refunds from customer-originated chains need approval above $500
          match:
            origin_type: skill_message
            root_origin_type: channel
            root_channel: customer_email
          effect: constrain
          require_grants:
            - key: "scope:refund_approved"

        # Trigger-initiated chains: automated refunds OK within limits
        - name: trigger_origin_refund
          match:
            origin_type: skill_message
            root_origin_type: trigger
          effect: allow
          access: filtered

      default_effect: deny
```

---

### 7.6 Failed Verification: Lockout

**Actor:** Attacker pretending to be David, can't provide the correct OTP.

```
STEP 1-3: Same as Scenario 7.1 -- attacker provides David's email and order number.
           identity.candidates.search resolves to cus_42.
           Grants: [actor_id: cus_42, assurance:L0]

STEP 4: Attacker asks to change the address.
  Skill calls identity.challenge.create -> OTP sent to David's real phone.

STEP 5: Attacker guesses "000000"
  Skill calls identity.challenge.verify({ proof: { code: "000000" } })
+----------------------------------------------------------+
| MCP RETURNS:                                             |
|   { success: false, remaining_attempts: 4,               |
|     reason: "invalid_code" }                             |
|                                                          |
| PLATFORM EVALUATES GRANT MAPPINGS:                       |
|   success=false, locked not present -> NO MATCH          |
|   No grants issued.                                      |
+----------------------------------------------------------+

STEPS 6-9: Attacker tries 4 more times, all fail.

STEP 10: 5th failure
+----------------------------------------------------------+
| MCP RETURNS:                                             |
|   { success: false, remaining_attempts: 0,               |
|     locked: true, lockout_minutes: 30,                   |
|     reason: "max_attempts_exceeded" }                    |
|                                                          |
| PLATFORM EVALUATES GRANT MAPPINGS:                       |
|   success=false, locked=true -> MATCH (lockout rule)     |
|   ISSUES: deny:assurance:L0="true"                       |
|                                                          |
| JOB GRANTS NOW:                                          |
|   [actor_id: cus_42, assurance:L0,                       |
|    deny:assurance:L0]                                    |
|                                                          |
| EFFECTIVE GRANTS (after deny evaluation):                |
|   [actor_id: cus_42]                                     |
|   (assurance:L0 is negated by deny:assurance:L0)         |
|                                                          |
| With no assurance level, the attacker gets only the      |
| default response filter: order_id and status.            |
| Cannot perform any mutations.                            |
+----------------------------------------------------------+

STEP 11: Skill escalates
+----------------------------------------------------------+
| "We were unable to verify your identity. For your        |
|  security, verification has been temporarily locked.     |
|  Please try again in 30 minutes or contact us through    |
|  another channel."                                       |
|                                                          |
| Skill logs audit event via identity.audit.log:           |
|   { event_type: "verification_lockout",                  |
|     customer_id: "cus_42",                               |
|     principal_id: "david@gmail.com",                     |
|     reason_codes: ["max_attempts_exceeded"] }            |
+----------------------------------------------------------+
```

**Key security property:** Even though the attacker knew the order number and email, they could never access the address, phone, or payment data. The platform's response filtering limited what L0 can see, and the deny grant issued on lockout further restricted access. The access policy blocked all mutations.

---

### 7.7 Customer Tries to Access Another Customer's Order

**Actor:** Customer David (cus_42) tries to look up order ORD-999 (belongs to cus_88).

```
STEP 1-3: David identified as cus_42 via identity flow.
           Grants: [actor_id: cus_42, assurance:L0]

STEP 4: David says "Can you also check on order ORD-999?"
  Skill calls orders.order.get(ORD-999)
+----------------------------------------------------------+
| PLATFORM CHECKS ACCESS POLICY:                           |
|   Rule "identified_customer" matches                     |
|   constrain_query: customer_id must equal "cus_42"       |
|                                                          |
|   PRE-CALL INJECTION: adds customer_id="cus_42"         |
|                                                          |
|   MCP returns: ORD-999.customer_id = "cus_88"           |
|                                                          |
|   POST-VALIDATION: $.customer_id "cus_88" != "cus_42"   |
|   on_violation: block                                    |
|                                                          |
|   BLOCKED: "Access denied: order does not belong to      |
|             the identified actor"                        |
|                                                          |
|   (Defense in depth: even if the MCP ignored the         |
|    pre-call constraint, post-validation catches it.)     |
+----------------------------------------------------------+

STEP 5: Skill tells customer
+----------------------------------------------------------+
| "I'm sorry, I can only look up orders associated with    |
|  your account. Could you double-check the order number?" |
|                                                          |
| (Skill does NOT say "that order belongs to someone       |
|  else" -- that would leak information.)                  |
+----------------------------------------------------------+
```

---

## 8. Platform Data Model

### Jobs Table

```
jobs {
  job_id              TEXT PRIMARY KEY
  organization_id     TEXT NOT NULL
  skill_id            TEXT NOT NULL
  origin_type         TEXT NOT NULL        -- "channel" | "trigger" | "skill_message"
  origin_channel      TEXT                 -- channel ID (if type=channel)
  origin_sender_ref   TEXT                 -- raw sender (if type=channel)
  origin_trigger_id   TEXT                 -- trigger ID (if type=trigger)
  origin_sender_skill TEXT                 -- sending skill (if type=skill_message)
  origin_sender_job   TEXT                 -- sending job (if type=skill_message)
  principal_id        TEXT                 -- who is calling (authenticated identity)
  subject_id          TEXT                 -- whose data is being accessed
  parent_job_id       TEXT                 -- immediate parent job
  root_job_id         TEXT NOT NULL        -- ultimate origin job
  status              TEXT NOT NULL        -- "running" | "completed" | "failed"
  created_at          TIMESTAMP NOT NULL
  completed_at        TIMESTAMP
}
```

### Grants Table

```
grants {
  id                  TEXT PRIMARY KEY
  job_id              TEXT NOT NULL REFERENCES jobs
  key                 TEXT NOT NULL
  value               TEXT NOT NULL
  issued_by           TEXT NOT NULL        -- "platform" or MCP name
  issued_tool         TEXT                 -- tool name (if MCP-issued)
  issued_reason       TEXT
  inherited_from_job  TEXT                 -- if propagated from parent job
  ttl_seconds         INTEGER              -- optional TTL in seconds
  expires_at          TIMESTAMP            -- optional absolute expiry
  created_at          TIMESTAMP NOT NULL

  INDEX (job_id, key)
}
```

### Access Decision Log

```
access_decisions {
  id                  TEXT PRIMARY KEY
  job_id              TEXT NOT NULL REFERENCES jobs
  tool_name           TEXT NOT NULL
  rule_matched        TEXT                 -- which access policy rule matched
  effect              TEXT NOT NULL        -- "allow" | "deny" | "constrain"
  grants_checked      JSON                -- which grants were evaluated
  grants_present      JSON                -- which grants were present
  grants_missing      JSON                -- which grants were missing
  grants_expired      JSON                -- which grants were expired (TTL)
  grants_denied       JSON                -- which grants were negated by deny grants
  query_constraints   JSON                -- applied query constraints
  response_filter     TEXT                -- applied response filter ID
  post_validation     JSON                -- post-validation results (if applicable)
  decided_at          TIMESTAMP NOT NULL

  INDEX (job_id)
}
```

### Post-Validation Results

```
post_validation_results {
  id                  TEXT PRIMARY KEY
  decision_id         TEXT NOT NULL REFERENCES access_decisions
  response_field      TEXT NOT NULL        -- the field that was checked
  grant_key           TEXT NOT NULL        -- the grant it was checked against
  grant_value         TEXT NOT NULL        -- the grant's value at evaluation time
  violation_found     BOOLEAN NOT NULL     -- whether a violation was detected
  action_taken        TEXT NOT NULL        -- "none" | "blocked" | "filtered"
  records_filtered    INTEGER              -- number of records removed (if action=filtered)
  checked_at          TIMESTAMP NOT NULL

  INDEX (decision_id)
}
```

---

## 9. Access Policy Language Reference

### Match Conditions

| Condition | Type | Description |
|-----------|------|-------------|
| `origin_type` | string | Matches job origin: `channel`, `trigger`, `skill_message`, `any` |
| `channel` | string | Matches specific channel ID (only when origin_type=channel) |
| `has_grant` | string | Matches if the job has a non-expired, non-denied grant with this key |
| `grant_value` | string | Combined with `has_grant` -- matches if the grant's value equals this |
| `root_origin_type` | string | Matches the origin type of the **root job** (traced via `root_job_id`). Values: `channel`, `trigger`, `skill_message`. Enables policies based on original trigger. |
| `root_channel` | string | Matches the channel of the root job (only when root_origin_type=channel). Enables policies like "only allow if originally triggered from admin_api". |

### Effects

| Effect | Description |
|--------|-------------|
| `allow` | Tool call is permitted |
| `deny` | Tool call is rejected with an error message |
| `constrain` | Tool call is permitted but scoped/filtered with both pre-call injection and post-call validation |

### Constraint Types

| Constraint | Description |
|------------|-------------|
| `require_grants` | List of grants that must be present (non-expired, non-denied). If any are missing, the call is blocked. |
| `constrain_query` | Pre-call injection: modifies the MCP call to scope it. `field` is the MCP input parameter, `must_equal_grant` is the grant key whose value it must match. |
| `post_validate` | Post-call validation: verifies response data after tool execution. `response_field` is a JSONPath selector into the response, `must_equal_grant` is the grant key to match against, `on_violation` determines the action (block or filter). See Section 5.8. |
| `response_filter` | ID of a response filter to apply to the MCP response. |

### Principal and Subject Identity Fields

| Field | Type | Description |
|-------|------|-------------|
| `principal_id` | string | Who is making the request. Set from channel authentication, trigger service account, or inherited from parent job. Immutable after job creation. |
| `subject_id` | string | Whose data is being accessed. Set by the platform when an `actor_id` grant is issued. May differ from `principal_id` in admin scenarios. |

### Grant Evaluation Rules

During policy evaluation, grants are checked with the following precedence:

1. **Deny grants:** If `deny:<grant_key>` exists on the job, the corresponding positive grant is treated as absent.
2. **TTL expiry:** If a grant has `expires_at` and the current time exceeds it, the grant is treated as absent.
3. **Presence check:** After deny and TTL filtering, the remaining grants are checked for `has_grant` and `require_grants` conditions.

### Examples

**Require a specific grant value:**
```yaml
require_grants:
  - key: "assurance:L2"           # grant must exist (non-expired, non-denied)
  - key: role
    value: admin                   # grant must exist with this specific value
```

**Constrain a query (pre-call injection):**
```yaml
constrain_query:
  - field: customer_id             # MCP input parameter name
    must_equal_grant: actor_id     # must match the value of this grant
```

**Post-call validation:**
```yaml
post_validate:
  - response_field: $.customer_id  # JSONPath into the response
    must_equal_grant: actor_id     # must match the value of this grant
    on_violation: block            # reject entire response if violated
```

**Root provenance matching:**
```yaml
match:
  origin_type: skill_message
  root_origin_type: channel
  root_channel: admin_api          # only match if root job came from admin_api
```

---

## 10. Grant Mapping Language Reference

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `<field>: <value>` | Exact match | `success: true` |
| `<field>_gte: <value>` | Greater than or equal | `candidates_count_gte: 1` |
| `<field>_lte: <value>` | Less than or equal | `remaining_attempts_lte: 0` |
| `<field>_in: [values]` | Value is in list | `assurance_level_in: [L1, L2]` |
| `<field>_exists: true` | Field exists in response | `customer_id_exists: true` |

### Value Resolution

| Source | Syntax | Description |
|--------|--------|-------------|
| Literal | `value: "true"` | Fixed string value |
| Response path | `value_from_response: "candidates[0].customer_id"` | Dot-path into MCP response |
| Request path | `value_from_request: "purpose"` | Dot-path into tool call arguments |
| Template | `key_template: "scope:{{ request.purpose }}"` | Jinja-style template with request/response vars |

### Grant Metadata

| Field | Type | Description |
|-------|------|-------------|
| `ttl_seconds` | integer | Optional: grant expires this many seconds after issuance |
| `expires_at` | timestamp | Optional: absolute expiration time (computed or explicit) |

### Namespace Validation

| Rule | Description |
|------|-------------|
| `p.*` keys | Rejected at configuration time if issued by any MCP. Platform-only. |
| MCP namespace | Each MCP has a registered namespace. Grant mappings can only issue grants within that namespace or in the common namespace (`actor_id`, `assurance:*`, `scope:*`). |
| `deny:*` keys | Follow the same namespace rules as their positive counterparts. An MCP that can issue `scope:change_address` can also issue `deny:scope:change_address`. |

---

## 11. Security Properties

This design provides the following security guarantees:

### 11.1 Provenance Integrity

- **Guarantee:** No skill can fabricate or modify job provenance.
- **Mechanism:** Provenance is stamped by the platform at job creation and stored immutably. `principal_id` and `subject_id` provide clear audit of who accessed whose data.
- **Implication:** You can always trace a data access back to the original external trigger, identifying both the actor and the data subject.

### 11.2 Grant Integrity

- **Guarantee:** Skills cannot directly create grants. Grants can only be issued by the platform (channel auth) or by MCP responses (via grant mappings). Platform-reserved grants (`p.*`) cannot be forged by any MCP.
- **Mechanism:** The grant mapping system evaluates MCP responses and issues grants automatically. Skills have no write API for grants. Namespace validation prevents cross-MCP grant spoofing.
- **Implication:** A compromised or misconfigured skill cannot forge grants to escalate privileges.

### 11.3 Query Scoping

- **Guarantee:** When access policy includes `constrain_query`, the platform ensures the MCP only returns data belonging to the identified actor. `post_validate` provides a safety net.
- **Mechanism:** Platform uses dual scoping: pre-call injection rewrites the MCP query to include the constraint, and post-call validation verifies the response. Both must pass.
- **Implication:** Customer A cannot access Customer B's data, even if the skill's LLM is tricked into requesting it, and even if the MCP ignores query constraints.

### 11.4 Response Filtering

- **Guarantee:** The response filter strips fields before they reach the skill (and by extension, the customer). Supports nested field filtering via JSONPath selectors.
- **Mechanism:** Platform applies the filter after receiving the MCP response (and after post-validation) and before returning it to the skill.
- **Implication:** Even if the MCP returns full data, the skill only sees what the current grants allow.

### 11.5 Mutation Protection

- **Guarantee:** High-risk mutations require specific scoped grants that can only be earned through verification. Scoped grants can have TTL for time-bounded authorization.
- **Mechanism:** Access policies with `require_grants` for scope-specific grants. TTL ensures scoped grants expire after a configured duration.
- **Implication:** No address change without L2 verification + scope:change_address. No cancellation without L2 + scope:cancel_order. Scoped grants expire after 15 minutes even within the same job.

### 11.6 Cross-Customer Isolation

- **Guarantee:** An external actor's job is scoped to their identity. Queries for other actors' data are blocked by both pre-call injection and post-call validation.
- **Mechanism:** `constrain_query` + `must_equal_grant: actor_id` + `post_validate`.
- **Implication:** Even if the customer provides another customer's order ID, the platform blocks access.

### 11.7 Admin Separation

- **Guarantee:** Admin access is only available through authenticated admin channels. A customer cannot escalate to admin by any means.
- **Mechanism:** The `role: admin` grant is pre-issued by the platform based on channel authentication. No grant mapping or verification flow can issue it.
- **Implication:** The only way to get admin access is to authenticate through an admin channel.

### 11.8 Audit Completeness

- **Guarantee:** Every grant issuance and every access decision is logged with full context, including principal and subject identity, TTL status, and deny grant evaluation.
- **Mechanism:** Platform writes to `grants`, `access_decisions`, and `post_validation_results` tables for every operation.
- **Implication:** Full reconstruction of what happened, who accessed what, and why it was allowed or denied. Both principal (who acted) and subject (whose data) are tracked.

---

## 12. Implementation Phases

### Phase 1: Job Provenance + Basic Grants

**Scope:** Platform stamps jobs with provenance including `principal_id` and `subject_id`. Grants table exists. Channel auth pre-issues grants.

**Deliverables:**
- Job provenance schema and stamping logic (with `principal_id`, `subject_id`)
- Grants table and append-only API (internal, platform use only)
- Channel authentication configuration
- Pre-issued grants for admin and system channels
- Reserved `p.*` namespace enforcement

**What this enables:**
- Jobs carry origin metadata with principal and subject tracking
- Admin vs. customer vs. system jobs are distinguishable
- Audit trail for job creation with clear actor/subject separation

### Phase 2: Access Policies

**Scope:** Platform evaluates access policies before MCP tool calls, including root provenance matching and deny grant evaluation.

**Deliverables:**
- Access policy schema and YAML configuration
- Policy evaluation engine (match -> effect -> constrain)
- `require_grants` enforcement (with TTL and deny grant awareness)
- `constrain_query` enforcement (pre-call injection)
- Root provenance matching (`root_origin_type`, `root_channel`)
- Access decision logging

**What this enables:**
- External actors blocked from accessing other actors' data
- High-risk tools blocked without required grants
- Root provenance-based policies for skill-to-skill chains
- Every access decision is logged

### Phase 3: Grant Mappings

**Scope:** Platform evaluates grant mappings after MCP tool responses and auto-issues grants with TTL and deny support.

**Deliverables:**
- Grant mapping schema and YAML configuration
- Mapping evaluation engine (condition matching + value resolution)
- Automatic grant issuance after matching tool responses
- TTL support for time-bounded grants
- Deny grant issuance support
- Namespace validation (MCP isolation, `p.*` reservation)
- Grant issuance logging
- `subject_id` auto-population on `actor_id` grant issuance

**What this enables:**
- Identity verification flows automatically produce grants
- Skills don't need to manage grants -- the platform handles it
- Progressive trust building works end-to-end
- Scoped grants expire after configured duration
- Lockout events can issue deny grants to revoke access

### Phase 4: Response Filtering + Post-Validation

**Scope:** Platform filters MCP responses based on current grants and validates responses against access constraints.

**Deliverables:**
- Response filter schema and YAML configuration with JSONPath selector support
- Filter evaluation engine (grant-based field inclusion/exclusion/masking)
- Post-validation engine (`post_validate` with block/filter modes)
- Integration with access policy (filter and post-validate referenced from constrain rules)
- Post-validation result logging

**What this enables:**
- PII protection based on assurance level with nested field granularity
- Different data views for different trust levels
- Defense in depth: post-validation catches constraint violations even if MCP ignores pre-call injection
- Full audit trail of post-validation results

### Phase 5: Context Propagation

**Scope:** Platform handles grant propagation for skill-to-skill messages with root provenance tracing.

**Deliverables:**
- Context propagation configuration (inherit/drop rules)
- Per-skill override configuration
- Root job ID tracing across skill chains
- `principal_id` and `subject_id` inheritance
- Root provenance resolution for access policy matching

**What this enables:**
- Proper access scoping across skill boundaries
- Full audit trail from external trigger through skill chains
- Configurable trust inheritance
- Access policies that differentiate based on the original trigger

---

## 13. Open Questions

The following items need further discussion and design decisions:

### Q4: Multi-Actor Jobs

Can a single job involve multiple external actors? Example: "merge these two customer accounts" requires identity verification of both.

Current design assumes one `actor_id` per job (and therefore one `subject_id`). If multi-actor is needed, the grant key would need to be more specific (e.g., `actor_id:primary`, `actor_id:secondary`), and `subject_id` would need to support multiple values or be scoped per operation.

### Q5: Rate Limiting at the Platform Level

Should the platform enforce rate limits on grant-issuing tool calls? For example, limit identity.challenge.create to 3 calls per customer per hour (to prevent OTP spam).

Current approach: rate limiting is in the identity-mcp implementation. Should any rate limiting live at the platform level?

### Q6: Skill-to-Skill Message Content

When support-tier-1 escalates to returns-ops, what goes in the message? Should the platform enforce that the message content doesn't contain raw PII if the original job's assurance level is low?

### Q7: Grant Revocation

The current design uses deny grants for access override (append-only semantics preserved). Should there be a stronger mechanism for the platform to fully revoke grants? Example: if a lockout event occurs (5 failed OTP attempts), the deny grant mechanism negates existing grants, but the positive grants remain in the log. Is this sufficient, or should hard revocation be supported?

Current approach: deny grants provide effective revocation while maintaining append-only audit integrity. The `deny:assurance:L0` grant issued on lockout prevents the attacker from using their L0 access. This seems acceptable because the audit log retains the full history.

---

## 14. Skill Builder Integration

The Skill Builder is the primary authoring environment for creating and deploying skills on the ADAS platform. It enforces security by guiding skill authors to define access control configurations and validating completeness before deployment.

### 14.1 MCP Tool Security Schema

Every MCP tool registered in the platform has a `security_schema` that describes its security characteristics. This schema is used by the Skill Builder to guide access policy creation.

```yaml
security_schema:
  classification: <data_classification>   # What kind of data this tool handles
  data_owner_field: <field_name>          # Which input/output field identifies the data owner
  risk: <risk_level>                      # How risky is this operation
  required_scopes: [<scope_names>]        # What scoped grants are needed for external actors
```

#### Data Classifications

| Classification | Description | Examples |
|---------------|-------------|---------|
| `public` | Non-sensitive, publicly available data | Product catalog, store hours, FAQ content |
| `pii_read` | Reads personally identifiable information | Order details, customer profile, shipping address |
| `pii_write` | Modifies personally identifiable information | Update address, change email, update phone |
| `financial` | Involves financial data or transactions | Payment details, refund execution, billing info |
| `destructive` | Irreversible operations | Cancel order, delete account, purge data |

#### Risk Levels

| Risk | Description | Typical Requirements |
|------|-------------|---------------------|
| `low` | Read-only, non-sensitive | No special grants required |
| `medium` | PII read or low-value mutations | `actor_id` required, response filtering |
| `high` | PII write, financial, or destructive | `actor_id` + scoped grant + step-up verification (L2) |
| `critical` | Irreversible financial or destructive operations | `actor_id` + scoped grant + L2 + additional approval |

#### Example Security Schemas

```yaml
# Low risk: product catalog
tools:
  - name: catalog.product.get
    security_schema:
      classification: public
      data_owner_field: null
      risk: low
      required_scopes: []

# Medium risk: order read
tools:
  - name: orders.order.get
    security_schema:
      classification: pii_read
      data_owner_field: customer_id
      risk: medium
      required_scopes: []

# High risk: address change
tools:
  - name: orders.order.update_shipping_address
    security_schema:
      classification: pii_write
      data_owner_field: customer_id
      risk: high
      required_scopes: [change_address]

# Critical risk: refund execution
tools:
  - name: returns.refund.execute
    security_schema:
      classification: financial
      data_owner_field: customer_id
      risk: critical
      required_scopes: [refund_approved]
```

### 14.2 Guided Access Policy Creation

The Skill Builder uses the `security_schema` to guide skill authors through access policy creation:

1. **Classification-based suggestions:** When a skill author adds a tool to their skill, the Skill Builder reads the tool's `classification` and suggests appropriate access policy templates.

2. **Data owner field mapping:** If `data_owner_field` is set, the Skill Builder automatically suggests `constrain_query` and `post_validate` rules that scope queries to the actor's identity.

3. **Required scopes:** The Skill Builder ensures that tools with `required_scopes` have corresponding `require_grants` entries in their access policies for external actor rules.

4. **Risk-based templates:** Based on the `risk` level, the Skill Builder provides pre-built access policy templates:
   - `low`: Allow for all origin types.
   - `medium`: Allow for admin/trigger/skill_message, constrain for channel with `actor_id` requirement and response filtering.
   - `high`: Allow for admin, deny for trigger, constrain for channel with `actor_id` + scoped grant + L2 assurance, constrain for skill_message with scoped grant.
   - `critical`: Same as high but with additional approval grants and root provenance restrictions.

### 14.3 Security Validation Pipeline

Before a skill can be exported or deployed, the Skill Builder runs a **security validation stage** that checks for gaps in access control configuration.

#### Validation Checks

| Check | Description | Severity |
|-------|-------------|----------|
| **Missing access policy** | Tool has a `security_schema` but no access policy defined in the skill | Error (blocks export) |
| **Unscoped PII access** | Tool with `classification: pii_read` or `pii_write` has no `constrain_query` for channel-originated requests | Error (blocks export) |
| **Missing response filter** | Tool with `classification: pii_read` has no response filter for channel-originated requests | Warning |
| **Missing post-validation** | Tool with `data_owner_field` has `constrain_query` but no `post_validate` | Warning |
| **Missing scope requirement** | Tool has `required_scopes` but the access policy doesn't include corresponding `require_grants` for channel rules | Error (blocks export) |
| **Unrestricted financial** | Tool with `classification: financial` allows unrestricted access from any origin | Error (blocks export) |
| **Missing TTL on scopes** | Scoped grants for high-risk tools don't have `ttl_seconds` configured | Warning |
| **No default deny** | Access policy doesn't have `default_effect: deny` | Error (blocks export) |
| **Namespace violation** | Grant mappings attempt to issue `p.*` grants or grants outside the MCP's namespace | Error (blocks export) |

#### Validation Behavior

- **Errors** block the skill from being exported or deployed. The author must fix them.
- **Warnings** are displayed but do not block export. The author is encouraged to address them.
- The validation report is stored as part of the skill's build artifact for audit purposes.

### 14.4 Security Completeness Check

The Skill Builder provides an overall **security completeness score** for each skill, based on:

1. **Coverage:** What percentage of MCP tools used by the skill have access policies defined?
2. **Depth:** Do high-risk tools have all recommended protections (constrain_query + post_validate + response_filter + TTL)?
3. **Consistency:** Are access policies consistent across tools with the same classification?
4. **Deny-default:** Do all access policies have `default_effect: deny`?

The completeness check produces a summary:

```
Security Completeness Report: support-tier-1
---------------------------------------------
Tools with access policies:    5/5  (100%)
High-risk tools fully secured: 2/2  (100%)
Response filters defined:      3/3  (100%)
Post-validation configured:    3/3  (100%)
TTL on scoped grants:          2/2  (100%)
Default deny on all policies:  5/5  (100%)

Status: COMPLETE -- ready for deployment
```

Skills with incomplete security cannot be deployed to production environments.

---

*End of specification.*
