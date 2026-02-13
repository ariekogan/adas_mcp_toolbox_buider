# Solution YAML Schema Reference

This document describes the schema for `solution.yaml` files used by ADAS Solution Packs.

## Overview

A **solution** is a collection of skills that work together as a cohesive system. The `solution.yaml` file defines the cross-skill architecture:

- **Skill topology** — which skills exist and their roles (gateway, worker, orchestrator, approval)
- **Grant economy** — the shared vocabulary of verified claims that flow between skills
- **Handoff flows** — how conversations transfer between skills with grant propagation
- **Channel routing** — which skill answers which inbound channel
- **Platform connectors** — infrastructure MCPs the solution depends on
- **Security contracts** — cross-skill grant requirements that can be validated

## Why solution.yaml?

Without a solution-level spec, cross-skill concerns are scattered across individual skill YAMLs with no single source of truth. This makes it impossible to:
- Validate that grant providers match consumer requirements
- Detect broken handoff chains or orphan skills
- Understand the full security posture of a multi-skill deployment
- Generate correct channel routing configuration

## Schema

```yaml
# =============================================================================
# METADATA
# =============================================================================
id: string                    # Unique solution identifier (slug)
name: string                  # Human-readable name
version: string               # Semantic version (e.g., "1.0.0")
description: string           # What this solution does

# =============================================================================
# SKILLS — the autonomous agents in this solution
# =============================================================================
skills:
  - id: string                # Must match the skill's own id field
    role: string              # gateway | worker | orchestrator | approval
    description: string       # Brief role description
    entry_channels: [string]  # Optional. Channels this skill receives (telegram, email, api)
    connectors: [string]      # MCP connectors this skill uses
    ui_capable: boolean       # Optional. If true, this skill includes a UI dashboard connector

# Skill Roles:
#   gateway       — Entry point that gates access (e.g., identity verification)
#   worker        — Handles domain-specific tasks (e.g., order support, returns)
#   orchestrator  — Routes events and runs system-wide checks
#   approval      — Reviews and approves high-value or risky operations

# =============================================================================
# GRANT ECONOMY — the shared vocabulary of verified claims
# =============================================================================
grants:
  - key: string               # Grant key (e.g., "ecom.customer_id")
    description: string       # What this grant represents
    values: [string]          # Optional. Enumerated allowed values
    issued_by: [string]       # Skill IDs that can issue this grant
    consumed_by: [string]     # Skill IDs that use this grant
    issued_via: string        # How the grant is issued:
                              #   grant_mapping — auto-extracted from tool response
                              #   handoff       — passed during conversation handoff
                              #   platform      — issued by platform infrastructure
    source_tool: string       # Optional. Tool that produces this grant value
    source_field: string      # Optional. JSONPath to the value in tool response
    ttl_seconds: number       # Optional. How long the grant is valid
    internal: boolean         # Optional. If true, grant is internal to issuing skill

# Grant Lifecycle:
#   1. Skill calls a tool → platform extracts value via grant_mapping
#   2. Grant is stored in conversation context
#   3. On handoff, grants listed in context_propagation.on_handoff.propagate_grants
#      are passed to the target skill
#   4. Target skill's access_policy checks for required grants before tool execution
#   5. Grants expire after ttl_seconds (if set)

# =============================================================================
# HANDOFF FLOWS — skill-to-skill conversation transfers
# =============================================================================
handoffs:
  - id: string                # Unique handoff identifier
    from: string              # Source skill ID
    to: string                # Target skill ID
    trigger: string           # Human-readable description of when this fires
    grants_passed: [string]   # Grant keys transferred to target skill
    grants_dropped: [string]  # Grant keys NOT transferred (kept internal)
    mechanism: string         # How the handoff happens:
                              #   handoff-controller-mcp — platform handoff via MCP
                              #   internal-message       — skill-to-skill message
    ttl_seconds: number       # Optional. Handoff session expiry

# Handoff Mechanics:
#   handoff-controller-mcp:
#     - Used for live conversation transfers (e.g., identity → support)
#     - Source skill calls handoff.transfer with target_skill, grants, context
#     - Platform routes subsequent messages to target skill
#     - Supports conversation context (original_goal, summary, grants)
#
#   internal-message:
#     - Used for async skill-to-skill communication
#     - Source skill sends a structured message to target skill
#     - Does not redirect the user's conversation

# =============================================================================
# CHANNEL ROUTING — which skill answers which channel
# =============================================================================
routing:
  <channel_name>:             # telegram | email | api | slack | etc.
    default_skill: string     # Skill ID that receives messages on this channel
    description: string       # Why this routing exists

# Channel routing determines the FIRST skill that handles a new conversation.
# After that, handoffs can transfer to other skills.

# =============================================================================
# PLATFORM CONNECTORS — infrastructure MCPs the solution needs
# =============================================================================
platform_connectors:
  - id: string                # Connector ID (e.g., "handoff-controller-mcp")
    required: boolean         # Is this connector required for the solution?
    description: string       # What this connector provides
    used_by: [string]         # Which skills reference this connector

# Platform connectors are infrastructure MCPs provided by ADAS Core,
# not domain-specific MCPs bundled in the solution pack.

# =============================================================================
# SOLUTION CONNECTORS — domain-specific MCPs bundled in the solution pack
# =============================================================================
# Solution connectors are declared in the manifest.json of the solution pack.
# They run as stdio child processes in ADAS Core (never HTTP, never Docker).
#
# UI-capable connectors provide visual dashboard plugins:
#   - Marked with ui_capable: true in manifest.json
#   - MUST use transport: stdio
#   - MUST implement ui.listPlugins and ui.getPlugin MCP tools
#   - Include static UI assets in ui-dist/ directory
#   - ADAS Core serves static files at /mcp-ui/<connector-id>/<path>
#   - Dashboard renders in ADAS Context Panel as an iframe
#   - Iframe communicates with ADAS via postMessage protocol
#
# Example manifest entry for a UI-capable connector:
#   {
#     "id": "ecommerce-ui-mcp",
#     "name": "E-Commerce UI Dashboard",
#     "command": "node",
#     "args": ["/mcp-store/ecommerce-ui-mcp/server.js"],
#     "transport": "stdio",
#     "ui_capable": true
#   }

# =============================================================================
# SECURITY CONTRACTS — cross-skill grant requirements
# =============================================================================
security_contracts:
  - name: string              # Human-readable contract name
    consumer: string          # Skill ID that requires the grants
    requires_grants: [string] # Grant keys that must be present
    required_values:          # Optional. Specific values required
      <grant_key>: [string]   #   e.g., ecom.assurance_level: [L1, L2]
    provider: string          # Skill ID that issues the required grants
    for_tools: [string]       # Optional. Which tools this contract protects
    validation: string        # Human-readable validation description
    response_filter: string   # Optional. Response filter applied when grant is missing
```

## Validation Rules

The solution validator checks these contracts:

| Check | Description | Severity |
|-------|-------------|----------|
| Grant provider exists | Every `consumed_by` skill has a matching `issued_by` skill | Error |
| Handoff target exists | Every handoff `to` skill exists in the solution | Error |
| Grants passed match | Handoff `grants_passed` covers what the consumer's `access_policy` requires | Error |
| Routing covers channels | Every skill with `entry_channels` has a routing entry | Warning |
| Platform connectors declared | Connectors referenced by skills are declared in `platform_connectors` | Warning |
| No orphan skills | Every skill is reachable via routing or handoff | Warning |
| No circular handoffs | Handoff chain has no infinite loops | Error |
| Security contracts satisfied | Every contract's `requires_grants` are issued by the `provider` skill | Error |

## Relationship to Skill YAMLs

The `solution.yaml` provides a **birds-eye view** of cross-skill architecture. Each individual skill YAML contains the **detailed implementation**:

| Concern | solution.yaml | skill.yaml |
|---------|--------------|------------|
| Grant definitions | Key, issuer, consumer mapping | `grant_mappings` with tool/field bindings |
| Access rules | Security contracts (what grants are needed) | `access_policy` with full rule logic |
| Handoff config | Flow direction, grants passed/dropped | `context_propagation.on_handoff` details |
| Channel routing | Channel → default skill mapping | `channels` with inbound config |
| Connectors | Which skills use which connectors | Full `connectors` list with tool definitions |

The solution validator cross-references both levels to ensure consistency.

## Deployment Notes

When deploying a solution, the deploy process works in phases:

1. **Identity Config** — `actor_types`, `admin_roles`, etc. are pushed to ADAS Core first
2. **Connectors** — Each connector is registered, code uploaded, and started
3. **Skills** — Each skill gets a `skillSlug` derived from its name, an MCP server is generated (if missing), and deployed

### Critical: skillSlug

ADAS Core requires skill slugs matching `/^[a-z0-9]+(-[a-z0-9]+)*$/`.

The slug is derived from `skill.name`:
- `"Identity Assurance Manager"` → `"identity-assurance-manager"`
- `"Customer Support Tier 1"` → `"customer-support-tier-1"`

**No underscores, no uppercase, no special characters.**

### Critical: mcpServer

Each skill deployment requires Python MCP server source code. This is auto-generated from the skill definition during deploy if `server.py` doesn't exist in the export directory. The generated server:
- Uses `mcp.server.fastmcp.FastMCP`
- Exposes each tool via `@mcp.tool()` decorators
- Includes discovery endpoints (`get_skill_info`, `list_capabilities`)

### Critical: solution_id

Almost all API endpoints require `solution_id`. Skills belong to solutions, and deploy operations need the solution context for identity config and connector linking.

## Example

See `/solution.yaml` in the e-commerce solution pack for a complete example with:
- 6 skills (gateway + 4 workers + 1 approval)
- 5 grants flowing from identity verification to support/returns/finance
- 3 handoff flows with grant propagation
- 3 channel routes (telegram, email, api)
- 5 security contracts protecting sensitive operations

## Deploy-Ready Example

A minimal `solution.yaml` ready for deployment:

```yaml
id: ecommerce-support
name: "E-Commerce Customer Support"
version: "1.0.0"
description: "Multi-skill customer support with identity verification"

# Identity config (deployed in Phase 0)
identity:
  actor_types:
    - name: customer
      label: Customer
      fields: [email, name, customer_id]
    - name: agent
      label: Support Agent
      fields: [email, name, employee_id]
  admin_roles: [admin, support_lead]
  default_actor_type: customer
  default_roles: [user]

# Skills (deployed in Phase 2)
skills:
  - id: identity-assurance
    role: gateway
    description: "Verifies customer identity before granting access"
    entry_channels: [telegram, email, api]
    connectors: [identity-mcp]

  - id: support-tier-1
    role: worker
    description: "Handles common support requests"
    connectors: [orders-mcp, returns-mcp]

# Grant economy
grants:
  - key: ecom.customer_id
    description: "Verified customer ID"
    issued_by: [identity-assurance]
    consumed_by: [support-tier-1]
    issued_via: grant_mapping
    source_tool: verify_customer
    source_field: result.customer_id
    ttl_seconds: 3600

# Handoffs
handoffs:
  - id: identity-to-support
    from: identity-assurance
    to: support-tier-1
    trigger: "Customer identity verified"
    grants_passed: [ecom.customer_id]
    mechanism: handoff-controller-mcp

# Routing
routing:
  telegram:
    default_skill: identity-assurance
    description: "All Telegram users start with identity verification"
  api:
    default_skill: identity-assurance
    description: "API callers start with identity verification"
```

See also: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the complete deployment workflow and API reference.
