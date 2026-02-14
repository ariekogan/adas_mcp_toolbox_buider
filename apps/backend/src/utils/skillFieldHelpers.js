/**
 * Shared helpers for skill YAML / JSON generation.
 *
 * Extracted from export.js + exportAdasCore.js to provide a single source of
 * truth for field-level serialization. Each YAML block function returns a
 * string[] that callers push onto their `lines` array.
 */

// ── String helpers ──────────────────────────────────────────────────────────

export function escapeString(str) {
  return (str || "").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function toSlug(str) {
  return (str || "toolbox")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export function yamlString(str) {
  if (str === null || str === undefined) return '""';
  const s = String(str);
  if (s.includes(':') || s.includes('#') || s.includes('\n') || s.includes('"') || s.includes("'") || s.startsWith(' ') || s.endsWith(' ')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return s || '""';
}

// ── YAML block generators ───────────────────────────────────────────────────
// Each returns string[] of YAML lines. Callers: lines.push(...block(data));

/**
 * Connectors block — extracts unique connector IDs from tools with mcp_bridge source.
 * @param {Array} tools - skill.tools array
 */
export function yamlConnectorsBlock(tools) {
  const lines = [];
  const connectorIds = new Set();
  for (const tool of (tools || [])) {
    if (tool.source?.type === 'mcp_bridge' && tool.source.connection_id) {
      connectorIds.add(tool.source.connection_id);
    }
  }
  if (connectorIds.size > 0) {
    lines.push(`# Connectors - MCP servers managed by ADAS MCPGateway`);
    lines.push(`connectors:`);
    for (const connectorId of connectorIds) {
      lines.push(`  - ${yamlString(connectorId)}`);
    }
    lines.push(``);
  }
  return lines;
}

/**
 * UI Plugins block — agent-to-plugin command declarations for UI-capable skills.
 * @param {Array} plugins - skill.ui_plugins array
 */
export function yamlUiPluginsBlock(plugins) {
  const lines = [];
  if (Array.isArray(plugins) && plugins.length > 0) {
    lines.push(`# UI Plugins - agent-to-plugin commands for UI-capable skills`);
    lines.push(`ui_plugins:`);
    for (const plugin of plugins) {
      lines.push(`  - id: ${yamlString(plugin.id)}`);
      if (plugin.short_id) {
        lines.push(`    short_id: ${yamlString(plugin.short_id)}`);
      }
    }
    lines.push(``);
  }
  return lines;
}

/**
 * Grant Mappings block — identity & access control grant extraction rules.
 * @param {Array} mappings - skill.grant_mappings array
 */
export function yamlGrantMappingsBlock(mappings) {
  const lines = [];
  if (mappings?.length > 0) {
    lines.push(`# Identity & Access Control`);
    lines.push(`grant_mappings:`);
    for (const mapping of mappings) {
      lines.push(`  - tool: ${yamlString(mapping.tool || '')}`);
      if (mapping.on_success !== undefined) {
        lines.push(`    on_success: ${mapping.on_success}`);
      }
      if (mapping.grants?.length > 0) {
        lines.push(`    grants:`);
        for (const grant of mapping.grants) {
          lines.push(`      - key: ${yamlString(grant.key || '')}`);
          if (grant.value_from) {
            lines.push(`        value_from: ${yamlString(grant.value_from)}`);
          }
          if (grant.ttl_seconds !== undefined) {
            lines.push(`        ttl_seconds: ${grant.ttl_seconds}`);
          }
        }
      }
    }
    lines.push(``);
  }
  return lines;
}

/**
 * Access Policy block — grant-based access rules for tools.
 * @param {Object} policy - skill.access_policy object
 */
export function yamlAccessPolicyBlock(policy) {
  const lines = [];
  if (policy?.rules?.length > 0) {
    lines.push(`access_policy:`);
    lines.push(`  rules:`);
    for (const rule of policy.rules) {
      if (rule.tools?.length > 0) {
        lines.push(`    - tools: [${rule.tools.map(t => yamlString(t)).join(', ')}]`);
      } else {
        lines.push(`    - tools: []`);
      }
      if (rule.when) {
        lines.push(`      when:`);
        for (const [key, value] of Object.entries(rule.when)) {
          lines.push(`        ${key}: ${yamlString(value)}`);
        }
      }
      if (rule.require) {
        lines.push(`      require:`);
        for (const [key, value] of Object.entries(rule.require)) {
          lines.push(`        ${key}: ${yamlString(value)}`);
        }
      }
      if (rule.effect) {
        lines.push(`      effect: ${yamlString(rule.effect)}`);
      }
      if (rule.constrain) {
        lines.push(`      constrain:`);
        if (rule.constrain.inject_args) {
          lines.push(`        inject_args:`);
          for (const [key, value] of Object.entries(rule.constrain.inject_args)) {
            lines.push(`          ${key}: ${yamlString(value)}`);
          }
        }
        if (rule.constrain.response_filter) {
          lines.push(`        response_filter: ${yamlString(rule.constrain.response_filter)}`);
        }
      }
    }
    lines.push(``);
  }
  return lines;
}

/**
 * Response Filters block — field-level response redaction rules.
 * @param {Array} filters - skill.response_filters array
 */
export function yamlResponseFiltersBlock(filters) {
  const lines = [];
  if (filters?.length > 0) {
    lines.push(`response_filters:`);
    for (const filter of filters) {
      lines.push(`  - id: ${yamlString(filter.id || '')}`);
      if (filter.description) {
        lines.push(`    description: ${yamlString(filter.description)}`);
      }
      if (filter.unless_grant) {
        lines.push(`    unless_grant: ${yamlString(filter.unless_grant)}`);
      }
      if (filter.strip_fields?.length > 0) {
        lines.push(`    strip_fields:`);
        for (const field of filter.strip_fields) {
          lines.push(`      - ${yamlString(field)}`);
        }
      }
      if (filter.mask_fields?.length > 0) {
        lines.push(`    mask_fields:`);
        for (const mf of filter.mask_fields) {
          lines.push(`      - field: ${yamlString(mf.field || '')}`);
          if (mf.mask) {
            lines.push(`        mask: ${yamlString(mf.mask)}`);
          }
        }
      }
    }
    lines.push(``);
  }
  return lines;
}

/**
 * Context Propagation block — grant propagation rules for handoffs.
 * @param {Object} propagation - skill.context_propagation object
 */
export function yamlContextPropagationBlock(propagation) {
  const lines = [];
  if (propagation?.on_handoff) {
    lines.push(`context_propagation:`);
    lines.push(`  on_handoff:`);
    const handoff = propagation.on_handoff;
    if (handoff.propagate_grants?.length > 0) {
      lines.push(`    propagate_grants:`);
      for (const grant of handoff.propagate_grants) {
        lines.push(`      - ${yamlString(grant)}`);
      }
    }
    if (handoff.drop_grants?.length > 0) {
      lines.push(`    drop_grants:`);
      for (const grant of handoff.drop_grants) {
        lines.push(`      - ${yamlString(grant)}`);
      }
    }
    lines.push(``);
  }
  return lines;
}

// ── JSON field compiler ─────────────────────────────────────────────────────

/**
 * Compile ui_plugins array for JSON payloads (import/deploy).
 * Returns undefined when there are no plugins (so callers can use spread).
 * @param {Array} plugins - skill.ui_plugins array
 */
export function compileUiPlugins(plugins) {
  if (!Array.isArray(plugins) || plugins.length === 0) return undefined;
  return plugins.map(p => ({
    id: p.id,
    ...(p.short_id && { short_id: p.short_id }),
  }));
}
