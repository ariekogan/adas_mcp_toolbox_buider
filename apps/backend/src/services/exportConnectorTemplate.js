/**
 * Connector Template Generator
 *
 * Generates connector.yaml and .env.example files for connectors
 * linked to a skill. These files describe how to configure, deploy,
 * and UI-enable connectors in ADAS Core.
 */

import yaml from 'js-yaml';
import { getAllPrebuiltConnectors } from '../routes/connectors.js';

// ── Icon / color heuristics ────────────────────────────────────────────

const CATEGORY_META = {
  communication: { icon: 'mail', color: '#EA4335' },
  development:   { icon: 'code', color: '#24292F' },
  data:          { icon: 'database', color: '#336791' },
  utilities:     { icon: 'tool', color: '#6B7280' },
  search:        { icon: 'search', color: '#FB542B' },
  automation:    { icon: 'zap', color: '#4A90D9' },
  storage:       { icon: 'folder', color: '#0F9D58' },
  location:      { icon: 'map-pin', color: '#4285F4' },
  media:         { icon: 'image', color: '#8B5CF6' },
  reasoning:     { icon: 'brain', color: '#6366F1' },
};

// ── Single connector YAML ──────────────────────────────────────────────

/**
 * Generate a connector.yaml for a single connector.
 *
 * @param {string} connectorId - e.g. "gmail"
 * @param {object} def - Connector definition from PREBUILT_CONNECTORS (or minimal fallback)
 * @returns {string} YAML string
 */
export function generateConnectorYaml(connectorId, def) {
  const catMeta = CATEGORY_META[def.category] || CATEGORY_META.utilities;

  const doc = {
    id: connectorId,
    name: def.name || connectorId,
    description: def.description || `MCP connector: ${connectorId}`,
    type: 'mcp',
    transport: def.transport || (def.endpoint ? 'http' : 'stdio'),
    enabled: true,
    autoStart: true,
  };

  // stdio transport config
  if (doc.transport === 'stdio') {
    doc.command = def.command || 'npx';
    doc.args = def.args || [];
  } else {
    doc.endpoint = def.endpoint;
  }

  // Auth
  doc.requires_auth = !!def.requiresAuth;
  if (def.authInstructions) {
    doc.auth_instructions = def.authInstructions;
  }

  // Env required - rich descriptors for docs & UI
  if (def.envRequired?.length) {
    doc.env_required = def.envRequired.map(envName => {
      const help = def.envHelp?.[envName] || {};
      const entry = {
        name: envName,
        label: help.label || envName,
        type: envName.toLowerCase().includes('pass') || envName.toLowerCase().includes('token') || envName.toLowerCase().includes('secret') || envName.toLowerCase().includes('key') ? 'password' : 'string',
        required: true,
      };
      if (help.placeholder) entry.placeholder = help.placeholder;
      if (help.hint) entry.hint = help.hint;
      if (help.link) entry.link = help.link;
      if (help.linkText) entry.link_text = help.linkText;
      return entry;
    });
  }

  // Default env values (non-secret)
  if (def.envDefaults && Object.keys(def.envDefaults).length > 0) {
    doc.env_defaults = { ...def.envDefaults };
  }

  // UI enablement section
  doc.ui = {
    icon: catMeta.icon,
    color: catMeta.color,
    category: def.category || 'utilities',
    settings_schema: [],
  };

  // Build settings_schema from envRequired + envHelp
  if (def.envRequired?.length) {
    for (const envName of def.envRequired) {
      const help = def.envHelp?.[envName] || {};
      const isSecret = envName.toLowerCase().includes('pass') || envName.toLowerCase().includes('token') || envName.toLowerCase().includes('secret') || envName.toLowerCase().includes('key');
      doc.ui.settings_schema.push({
        field: envName,
        type: isSecret ? 'password' : 'string',
        required: true,
        label: help.label || envName,
        ...(help.placeholder && { placeholder: help.placeholder }),
        ...(help.hint && { hint: help.hint }),
      });
    }
  }

  // Also add non-secret defaults as optional settings
  if (def.envDefaults) {
    for (const [key, value] of Object.entries(def.envDefaults)) {
      // Skip if already in required
      if (def.envRequired?.includes(key)) continue;
      doc.ui.settings_schema.push({
        field: key,
        type: 'string',
        required: false,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        default: value,
      });
    }
  }

  // UI plugin section for ui_capable connectors
  if (def.ui_capable) {
    doc.ui_capable = true;
    doc.ui_plugin = {
      description: 'This connector provides UI plugins that render in the ADAS Context Panel.',
      transport_note: 'UI-capable connectors MUST use transport: stdio. ADAS Core serves static UI files directly.',
      required_tools: {
        'ui.listPlugins': {
          description: 'Returns available UI plugins. Called live by ADAS Core (no caching).',
          returns: '{ plugins: [{ id, name, version, description }] }',
        },
        'ui.getPlugin': {
          description: 'Returns the manifest for a specific plugin, including iframeUrl.',
          args: '{ id: string }',
          returns: '{ id, name, version, render: { mode: "iframe", iframeUrl: "/ui/<plugin-id>/<version>/index.html" }, channels: { events: [...], actions: [...] } }',
        },
      },
      static_assets: {
        directory: 'ui-dist/',
        description: 'Place static HTML/JS/CSS files under ui-dist/<plugin-id>/<version>/. ADAS Core serves them via GET /mcp-ui/<connector-id>/<path>.',
        example: 'ui-dist/ecom-dashboard/0.1.0/index.html',
      },
      iframe_communication: {
        protocol: 'postMessage',
        description: 'The iframe communicates with ADAS via window.parent.postMessage(). ADAS PluginHost proxies MCP tool calls to any connected connector.',
        send_format: '{ type: "mcp-call", connectorId: "<target>", tool: "<tool-name>", args: {...} }',
        receive_format: '{ type: "mcp-result", result: {...} }',
      },
      plugin_id_format: 'mcp:<connector-id>:<plugin-id>',
    };
  }

  // Header comment + YAML dump
  const header = [
    '# Connector Configuration for ADAS Core',
    `# Connector: ${def.name || connectorId}`,
    '# Generated by ADAS MCP Toolbox Builder',
    '#',
    '# This file describes how to configure and deploy this connector.',
    '# The "ui" section below defines the Skill Builder admin UI settings form.',
    '#',
    ...(def.ui_capable ? [
      '# UI PLUGIN CONNECTOR',
      '# This connector provides UI plugins that render inside the ADAS Context Panel.',
      '# It MUST use transport: stdio (not http). ADAS Core spawns it as a child process.',
      '# It MUST implement ui.listPlugins and ui.getPlugin MCP tools.',
      '# Static UI assets go in ui-dist/ and are served by ADAS Core at /mcp-ui/<connector-id>/.',
      '# See the ui_plugin section below for the full contract.',
      '#',
    ] : []),
    '# To register this connector with ADAS Core:',
    '#   POST /api/connectors  with this file as JSON body',
    '#   (or use the Skill Builder Deploy UI)',
    '',
  ].join('\n');

  return header + yaml.dump(doc, { lineWidth: 120, noRefs: true, quotingType: '"' });
}

// ── .env.example ───────────────────────────────────────────────────────

/**
 * Generate a .env.example file for a connector.
 *
 * @param {string} connectorId
 * @param {object} def
 * @returns {string} env file content
 */
export function generateConnectorEnvExample(connectorId, def) {
  const lines = [
    `# ${def.name || connectorId} Connector - Environment Variables`,
    '# Copy this file to .env and fill in your values',
    '',
  ];

  // Required vars
  if (def.envRequired?.length) {
    lines.push('# Required');
    for (const envName of def.envRequired) {
      const help = def.envHelp?.[envName] || {};
      if (help.hint) lines.push(`# ${help.hint}`);
      if (help.link) lines.push(`# Setup: ${help.link}`);
      lines.push(`${envName}=${help.placeholder || ''}`);
      lines.push('');
    }
  }

  // Default vars
  if (def.envDefaults && Object.keys(def.envDefaults).length > 0) {
    lines.push('# Defaults (usually no changes needed)');
    for (const [key, value] of Object.entries(def.envDefaults)) {
      if (def.envRequired?.includes(key)) continue;
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── All connector files for a skill ────────────────────────────────────

/**
 * Generate connector template files for all connectors linked to a skill.
 *
 * @param {object} skill - Skill object
 * @returns {Array<{name: string, content: string}>} Files to include in export
 */
export function generateAllConnectorFiles(skill) {
  // Collect unique connector IDs from skill.connectors and tools
  const connectorIds = new Set();

  if (skill.connectors?.length) {
    for (const id of skill.connectors) connectorIds.add(id);
  }

  for (const tool of (skill.tools || [])) {
    if (tool.source?.type === 'mcp_bridge' && tool.source.connection_id) {
      connectorIds.add(tool.source.connection_id);
    }
  }

  if (connectorIds.size === 0) return [];

  const allConnectors = getAllPrebuiltConnectors();
  const files = [];

  for (const connectorId of connectorIds) {
    const def = allConnectors[connectorId] || {
      name: connectorId,
      description: `Custom connector: ${connectorId}`,
      command: 'npx',
      args: [],
      category: 'utilities',
    };

    files.push({
      name: `connectors/${connectorId}/connector.yaml`,
      content: generateConnectorYaml(connectorId, def),
    });

    files.push({
      name: `connectors/${connectorId}/.env.example`,
      content: generateConnectorEnvExample(connectorId, def),
    });
  }

  return files;
}
