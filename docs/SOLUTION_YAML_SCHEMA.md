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

## Example

See `/solution.yaml` in the e-commerce solution pack for a complete example with:
- 6 skills (gateway + 4 workers + 1 approval)
- 5 grants flowing from identity verification to support/returns/finance
- 3 handoff flows with grant propagation
- 3 channel routes (telegram, email, api)
- 5 security contracts protecting sensitive operations
