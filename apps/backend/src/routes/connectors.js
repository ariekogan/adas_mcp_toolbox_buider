/**
 * Connector Routes
 *
 * API endpoints for managing MCP server connections and discovering tools.
 *
 * When a connector is created/connected in DAL, it is also synced to ADAS
 * so that ADAS Core can spawn the connector at runtime via MCPGateway.
 */

import { Router } from 'express';
import mcpManager from '../services/mcpConnector.js';
import { classifyError, formatErrorResponse, getStatusFromError } from '../services/connectorValidator.js';
import { resolvePort, trackPort, releasePort } from '../utils/portUtils.js';
import {
  syncConnectorToADAS,
  startConnectorInADAS,
  stopConnectorInADAS,
  isADASAvailable,
  getConnectorsFromADAS
} from '../services/adasConnectorSync.js';
import connectorState from '../store/connectorState.js';
import skills from '../store/skills.js';
import { getCurrentTenant } from '../utils/tenantContext.js';

const router = Router();

/**
 * GET /api/connectors
 * List all active connections
 */
router.get('/', (_req, res) => {
  const connections = mcpManager.listConnections();
  res.json({ connections });
});

/**
 * POST /api/connectors/connect
 * Connect to an MCP server and discover its tools
 *
 * Body:
 *   - command: string (e.g., "npx", "python", "node")
 *   - args: string[] (command arguments)
 *   - env: object (environment variables)
 *   - name: string (display name)
 *   - id: string (optional, auto-generated if not provided)
 */
router.post('/connect', async (req, res) => {
  const { command, args, env, name, id, type, syncToADAS = true } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  try {
    const result = await mcpManager.connect({
      id,
      command,
      args: args || [],
      env: env || {},
      name: name || command
    });

    // Sync to ADAS if enabled (allows ADAS to run the connector at runtime)
    let adasSynced = false;
    if (syncToADAS) {
      try {
        const adasAvailable = await isADASAvailable();
        if (adasAvailable) {
          await syncConnectorToADAS({
            id: result.id,
            name: result.name || name || command,
            type: type || 'mcp',
            config: {
              command,
              args: args || [],
              env: {} // Don't include credentials in config, they go separately
            },
            credentials: env || {} // Credentials are encrypted by ADAS
          });

          // Also start it in ADAS
          await startConnectorInADAS(result.id);
          adasSynced = true;
          console.log(`[Connectors] Synced connector ${result.id} to ADAS`);
        } else {
          console.log(`[Connectors] ADAS not available, skipping sync for ${result.id}`);
        }
      } catch (syncErr) {
        // Don't fail the request if ADAS sync fails
        console.error(`[Connectors] Failed to sync to ADAS:`, syncErr.message);
      }
    }

    // Save connector state for persistence across restarts
    await connectorState.saveConnector({
      id: result.id,
      name: name || command,
      prebuiltId: null, // custom connector
      command,
      args: args || [],
      env: env || {},
      syncedToADAS: adasSynced
    });

    res.json({
      success: true,
      connection: result,
      adasSynced
    });
  } catch (err) {
    console.error('Failed to connect to MCP server:', err);
    const classified = classifyError(err, { connector: name || command });
    res.status(500).json(formatErrorResponse(classified));
  }
});

/**
 * POST /api/connectors/disconnect/:id
 * Disconnect from an MCP server
 */
router.post('/disconnect/:id', async (req, res) => {
  const { id } = req.params;
  const { removeFromADAS = false } = req.body || {};

  const disconnected = mcpManager.disconnect(id);

  // Remove from saved state
  await connectorState.removeConnector(id);

  // Optionally also stop/remove from ADAS
  if (removeFromADAS) {
    try {
      const adasAvailable = await isADASAvailable();
      if (adasAvailable) {
        await stopConnectorInADAS(id);
        console.log(`[Connectors] Stopped connector ${id} in ADAS`);
      }
    } catch (err) {
      console.error(`[Connectors] Failed to stop in ADAS:`, err.message);
    }
  }

  if (disconnected) {
    res.json({ success: true, message: `Disconnected from ${id}` });
  } else {
    // Still return success since we cleaned up state
    res.json({ success: true, message: `Cleaned up ${id}` });
  }
});

/**
 * GET /api/connectors/adas-status
 * Get connector status from ADAS Core with skill usage info
 *
 * Returns:
 *   - adasAvailable: boolean - Whether ADAS Core is reachable
 *   - statuses: { [connectorId]: { installed, status, usedBySkills } }
 */
router.get('/adas-status', async (_req, res) => {
  try {
    // 1. Check if ADAS is reachable
    const adasAvailable = await isADASAvailable();

    // 2. Get all connectors from ADAS (returns [] if unavailable)
    let adasConnectors = [];
    if (adasAvailable) {
      adasConnectors = await getConnectorsFromADAS();
    }

    // 3. Build lookup map: connectorId -> ADAS data
    const adasMap = new Map();
    for (const ac of adasConnectors) {
      adasMap.set(ac.id, {
        installed: true,
        status: ac.status || ac.state || 'unknown',
        toolCount: ac.tools?.length || 0,
        autoStart: ac.autoStart || false
      });
    }

    // 4. Scan all skills to find which skills use each connector
    const skillsByConnector = new Map(); // connectorId -> [{ id, name }]
    try {
      const skillList = await skills.list();
      for (const skillSummary of skillList) {
        try {
          const skill = await skills.load(skillSummary.id);
          for (const tool of (skill.tools || [])) {
            if (tool.source?.type === 'mcp_bridge' && tool.source.connection_id) {
              const connId = tool.source.connection_id;
              if (!skillsByConnector.has(connId)) {
                skillsByConnector.set(connId, []);
              }
              // Avoid duplicates
              const existing = skillsByConnector.get(connId);
              if (!existing.some(s => s.id === skill.id)) {
                existing.push({ id: skill.id, name: skill.name });
              }
            }
          }
        } catch (err) {
          // Skip skills that fail to load
        }
      }
    } catch (err) {
      console.error('[Connectors] Failed to scan skills for connector usage:', err.message);
    }

    // 5. Build response: keyed by connector ID
    const statuses = {};

    // Include all prebuilt connector IDs
    for (const [id] of Object.entries(PREBUILT_CONNECTORS)) {
      const adas = adasMap.get(id);
      statuses[id] = {
        installed: adas?.installed || false,
        status: adas?.status || 'not_installed',
        toolCount: adas?.toolCount || 0,
        autoStart: adas?.autoStart || false,
        usedBySkills: skillsByConnector.get(id) || []
      };
    }

    // Include any ADAS connectors not in prebuilt list (custom ones)
    for (const ac of adasConnectors) {
      if (!statuses[ac.id]) {
        statuses[ac.id] = {
          installed: true,
          status: ac.status || ac.state || 'unknown',
          toolCount: ac.tools?.length || 0,
          autoStart: ac.autoStart || false,
          usedBySkills: skillsByConnector.get(ac.id) || []
        };
      }
    }

    res.json({ adasAvailable, statuses });
  } catch (err) {
    console.error('[Connectors] Failed to get ADAS status:', err);
    res.json({ adasAvailable: false, statuses: {}, error: err.message });
  }
});

/**
 * GET /api/connectors/saved
 * List saved connector configurations (for debugging/info)
 */
router.get('/saved', async (_req, res) => {
  try {
    const saved = await connectorState.listSavedConnectors();
    res.json({ saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/connectors/:id/status
 * Get connection status and available tools
 */
router.get('/:id/status', (req, res) => {
  const { id } = req.params;

  const status = mcpManager.getStatus(id);
  res.json(status);
});

/**
 * GET /api/connectors/:id/tools
 * Get list of tools from a connected MCP server
 */
router.get('/:id/tools', (req, res) => {
  const { id } = req.params;

  const status = mcpManager.getStatus(id);

  if (!status.exists) {
    return res.status(404).json({ error: 'Connection not found' });
  }

  if (!status.connected) {
    return res.status(400).json({ error: 'Connection not active' });
  }

  res.json({ tools: status.tools });
});

/**
 * POST /api/connectors/:id/call
 * Call a tool on a connected MCP server
 *
 * Body:
 *   - tool: string (tool name)
 *   - args: object (tool arguments)
 */
router.post('/:id/call', async (req, res) => {
  const { id } = req.params;
  const { tool, args } = req.body;

  if (!tool) {
    return res.status(400).json({ error: 'Tool name is required' });
  }

  try {
    const result = await mcpManager.callTool(id, tool, args || {});
    res.json({ success: true, result });
  } catch (err) {
    console.error('Failed to call tool:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connectors/:id/import-to-skill
 * Import discovered tools into a DAL skill
 *
 * Body:
 *   - skillId: string
 *   - tools: string[] (tool names to import, or empty for all)
 *   - policies: object (optional default policies)
 */
router.post('/:id/import-to-skill', async (req, res) => {
  const { id } = req.params;
  const { skillId, tools: toolsToImport, policies } = req.body;

  if (!skillId) {
    return res.status(400).json({ error: 'Skill ID is required' });
  }

  const status = mcpManager.getStatus(id);

  if (!status.exists || !status.connected) {
    return res.status(400).json({ error: 'Connection not active' });
  }

  // Filter tools if specific ones requested
  let toolsToAdd = status.tools;
  if (toolsToImport && toolsToImport.length > 0) {
    toolsToAdd = status.tools.filter(t => toolsToImport.includes(t.name));
  }

  // Convert MCP tools to DAL tool format
  const dalTools = toolsToAdd.map(mcpTool => convertMCPToolToDAL(mcpTool, id, policies));

  res.json({
    success: true,
    importedTools: dalTools,
    message: `Ready to import ${dalTools.length} tools into skill ${skillId}`
  });
});

/**
 * Convert an MCP tool definition to DAL tool format
 */
function convertMCPToolToDAL(mcpTool, connectionId, defaultPolicies = {}) {
  const { name, description, inputSchema } = mcpTool;

  // Convert JSON Schema inputs to DAL format
  const inputs = [];
  if (inputSchema && inputSchema.properties) {
    const required = inputSchema.required || [];

    for (const [propName, propSchema] of Object.entries(inputSchema.properties)) {
      inputs.push({
        name: propName,
        type: propSchema.type || 'string',
        required: required.includes(propName),
        description: propSchema.description || '',
        ...(propSchema.enum && { enum: propSchema.enum }),
        ...(propSchema.default !== undefined && { default: propSchema.default })
      });
    }
  }

  return {
    id: `tool-mcp-${connectionId}-${name}`,
    id_status: 'permanent',
    name: name,
    description: description || `Tool from MCP server: ${name}`,
    inputs,
    output: {
      type: 'object',
      description: 'Tool result from MCP server'
    },
    source: {
      type: 'mcp_bridge',
      connection_id: connectionId,
      mcp_tool: name
    },
    policy: {
      allowed: defaultPolicies.allowed || 'always',
      requires_approval: defaultPolicies.requires_approval || 'never'
    },
    mock: {
      enabled: false,
      mode: 'passthrough' // Calls the real MCP tool
    }
  };
}

/**
 * Pre-built connector configurations
 *
 * These are popular MCP servers that can be connected with minimal setup.
 * Each connector specifies the command to run and any authentication requirements.
 *
 * Port Configuration (optional):
 * Some MCP servers start internal HTTP servers on specific ports.
 * Add `portConfig` to enable automatic port conflict resolution:
 *
 * portConfig: {
 *   port: 4000,           // Default port the connector uses
 *   envVar: 'PORT',       // Env var to override port (optional)
 *   argFlag: '--port',    // CLI flag to override port (optional)
 *   range: [4000, 4100]   // Allowed port range for auto-assignment (optional)
 * }
 */
const PREBUILT_CONNECTORS = {
  gmail: {
    name: 'Gmail',
    description: 'Read and send emails via Gmail (IMAP/SMTP)',
    command: 'npx',
    args: ['-y', 'mcp-mail-server'],
    requiresAuth: true,
    authInstructions: 'You need a Gmail App Password (not your regular password)',
    envRequired: ['EMAIL_USER', 'EMAIL_PASS'],
    envDefaults: {
      IMAP_HOST: 'imap.gmail.com',
      IMAP_PORT: '993',
      IMAP_SECURE: 'true',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true'
    },
    envHelp: {
      EMAIL_USER: {
        label: 'Gmail Address',
        placeholder: 'you@gmail.com',
        hint: 'Your full Gmail email address'
      },
      EMAIL_PASS: {
        label: 'App Password',
        placeholder: 'xxxx xxxx xxxx xxxx',
        hint: 'Generate at: Google Account → Security → 2-Step Verification → App Passwords',
        link: 'https://myaccount.google.com/apppasswords',
        linkText: 'Get App Password →'
      }
    },
    category: 'communication'
  },
  slack: {
    name: 'Slack',
    description: 'Send messages and manage Slack channels',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiresAuth: true,
    authInstructions: 'You need a Slack Bot Token and Team ID',
    envRequired: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    envHelp: {
      SLACK_BOT_TOKEN: {
        label: 'Bot Token',
        placeholder: 'xoxb-...',
        hint: 'Create a Slack App and get the Bot User OAuth Token',
        link: 'https://api.slack.com/apps',
        linkText: 'Create Slack App →'
      },
      SLACK_TEAM_ID: {
        label: 'Team ID',
        placeholder: 'T0123456789',
        hint: 'Found in Slack workspace settings or URL'
      }
    },
    category: 'communication'
  },
  github: {
    name: 'GitHub',
    description: 'Manage repositories, issues, and pull requests',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresAuth: true,
    authInstructions: 'You need a GitHub Personal Access Token',
    envRequired: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    envHelp: {
      GITHUB_PERSONAL_ACCESS_TOKEN: {
        label: 'Personal Access Token',
        placeholder: 'ghp_...',
        hint: 'Create a token with repo, read:org scopes',
        link: 'https://github.com/settings/tokens/new',
        linkText: 'Create Token →'
      }
    },
    category: 'development'
  },
  filesystem: {
    name: 'Filesystem',
    description: 'Read and write local files',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    requiresAuth: false,
    category: 'utilities'
  },
  git: {
    name: 'Git',
    description: 'Git repository operations',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    requiresAuth: false,
    category: 'development'
  },
  postgres: {
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiresAuth: true,
    authInstructions: 'You need a PostgreSQL connection string',
    envRequired: ['POSTGRES_CONNECTION_STRING'],
    envHelp: {
      POSTGRES_CONNECTION_STRING: {
        label: 'Connection String',
        placeholder: 'postgresql://user:pass@host:5432/dbname',
        hint: 'Format: postgresql://username:password@host:port/database'
      }
    },
    category: 'data'
  },
  sqlite: {
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    requiresAuth: false,
    category: 'data'
  },
  memory: {
    name: 'Memory',
    description: 'Persistent key-value storage for context',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    requiresAuth: false,
    category: 'utilities'
  },
  fetch: {
    name: 'Web Fetch',
    description: 'Fetch and parse web content',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    requiresAuth: false,
    category: 'utilities'
  },
  brave_search: {
    name: 'Brave Search',
    description: 'Web and local search via Brave',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiresAuth: true,
    authInstructions: 'You need a Brave Search API key',
    envRequired: ['BRAVE_API_KEY'],
    envHelp: {
      BRAVE_API_KEY: {
        label: 'API Key',
        placeholder: 'BSA...',
        hint: 'Get a free API key from Brave Search',
        link: 'https://brave.com/search/api/',
        linkText: 'Get API Key →'
      }
    },
    category: 'search'
  },
  puppeteer: {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    requiresAuth: false,
    category: 'automation'
  },
  google_drive: {
    name: 'Google Drive',
    description: 'Manage files in Google Drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    requiresAuth: true,
    authInstructions: 'Set up OAuth credentials for Google Drive API',
    category: 'storage'
  },
  google_maps: {
    name: 'Google Maps',
    description: 'Location, directions, and places search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    requiresAuth: true,
    authInstructions: 'Set GOOGLE_MAPS_API_KEY environment variable',
    envRequired: ['GOOGLE_MAPS_API_KEY'],
    category: 'location'
  },
  everart: {
    name: 'EverArt',
    description: 'AI image generation',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everart'],
    requiresAuth: true,
    authInstructions: 'Set EVERART_API_KEY environment variable',
    envRequired: ['EVERART_API_KEY'],
    category: 'media'
  },
  sequential_thinking: {
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning and problem solving',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    requiresAuth: false,
    category: 'reasoning'
  },
  // Test connector with port config - for testing port conflict resolution
  _test_port_connector: {
    name: 'Test Port Connector',
    description: 'Test connector for verifying port conflict resolution (dev only)',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    requiresAuth: false,
    category: 'utilities',
    // Port config enables automatic port conflict resolution
    portConfig: {
      port: 4000,           // Default port (likely to conflict)
      envVar: 'PORT',       // Env var to override port
      range: [4000, 4100]   // Auto-assign range if conflict
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CUSTOM CONNECTORS
  // ═══════════════════════════════════════════════════════════════
  // Custom connectors (e.g., e-commerce MCPs) are now imported via:
  //   POST /api/import with manifest.json from external projects (e.g., PB)
  //
  // This enables the production workflow:
  //   1. Develop MCPs in external project
  //   2. Package with scripts/package.sh
  //   3. Import via Skill Builder UI
  //   4. Deploy to ADAS Core
  //
  // See GET /api/import/connectors for imported connectors
  // ═══════════════════════════════════════════════════════════════

  // NOTE: internal-comm-mcp, gmail-mcp, telegram-mcp are system-layer connectors
  // and are NOT included in the prebuilt catalog (they're platform infrastructure)
};

// Export for use by export.js (connector sync to ADAS Core)
export { PREBUILT_CONNECTORS };

// Per-tenant store for imported connectors (populated via /api/import)
// Each tenant gets its own Map so connectors don't leak across tenants
const importedConnectorsByTenant = new Map();

export function getImportedConnectorsForTenant(tenant) {
  if (!importedConnectorsByTenant.has(tenant)) {
    importedConnectorsByTenant.set(tenant, new Map());
  }
  return importedConnectorsByTenant.get(tenant);
}

/**
 * Register imported connector for a specific tenant (called by import.js)
 * @param {string} id - Connector ID
 * @param {object} config - Connector config
 * @param {string} [tenant] - Tenant override; defaults to current ALS tenant
 */
export function registerImportedConnector(id, config, tenant) {
  const t = tenant || getCurrentTenant();
  getImportedConnectorsForTenant(t).set(id, config);
  console.log(`[Connectors] Registered imported connector: ${id} (tenant: ${t})`);
}

/**
 * Unregister imported connector for a specific tenant (called by import.js)
 * @param {string} id - Connector ID
 * @param {string} [tenant] - Tenant override; defaults to current ALS tenant
 */
export function unregisterImportedConnector(id, tenant) {
  const t = tenant || getCurrentTenant();
  getImportedConnectorsForTenant(t).delete(id);
  console.log(`[Connectors] Unregistered imported connector: ${id} (tenant: ${t})`);
}

/**
 * Get all connectors (prebuilt + imported for current tenant)
 */
export function getAllPrebuiltConnectors() {
  const tenant = getCurrentTenant();
  const all = { ...PREBUILT_CONNECTORS };
  for (const [id, config] of getImportedConnectorsForTenant(tenant)) {
    all[id] = config;
  }
  return all;
}

/**
 * GET /api/connectors/prebuilt
 * List available pre-built connectors (includes imported connectors)
 */
router.get('/prebuilt', (_req, res) => {
  const allConnectors = getAllPrebuiltConnectors();
  const connectors = Object.entries(allConnectors).map(([id, config]) => ({
    id,
    ...config
  }));
  res.json({ connectors });
});

/**
 * POST /api/connectors/prebuilt/:connectorId/connect
 * Connect using a pre-built connector configuration
 */
router.post('/prebuilt/:connectorId/connect', async (req, res) => {
  const { connectorId } = req.params;
  const { extraArgs = [], extraEnv = {} } = req.body;

  // Check both prebuilt and imported connectors
  const allConnectors = getAllPrebuiltConnectors();
  const prebuilt = allConnectors[connectorId];
  if (!prebuilt) {
    return res.status(404).json({ error: `Connector not found: ${connectorId}` });
  }

  try {
    // Merge default env vars with user-provided ones
    const mergedEnv = {
      ...(prebuilt.envDefaults || {}),
      ...extraEnv
    };

    // Resolve port conflicts if connector has portConfig
    let finalEnv = mergedEnv;
    let finalArgs = [...(prebuilt.args || []), ...extraArgs];
    let portInfo = null;

    if (prebuilt.portConfig) {
      const resolved = await resolvePort(
        { portConfig: prebuilt.portConfig },
        mergedEnv,
        finalArgs
      );
      finalEnv = resolved.env;
      finalArgs = resolved.args;
      portInfo = resolved.portInfo;

      // Track the allocated port for cleanup
      if (portInfo && portInfo.port) {
        trackPort(portInfo.port);
      }
    }

    const result = await mcpManager.connect({
      id: connectorId,
      command: prebuilt.command,
      args: finalArgs,
      env: finalEnv,
      name: prebuilt.name
    });

    // Save connector state for persistence across restarts
    await connectorState.saveConnector({
      id: connectorId,
      name: prebuilt.name,
      prebuiltId: connectorId,
      command: prebuilt.command,
      args: finalArgs,
      env: finalEnv,
      syncedToADAS: false, // prebuilt connect doesn't sync by default
      portInfo: portInfo || null
    });

    // Include port info in response if auto-assigned
    const response = {
      success: true,
      connection: result
    };

    if (portInfo && portInfo.wasAutoAssigned) {
      response.portInfo = portInfo;
    }

    res.json(response);
  } catch (err) {
    console.error(`Failed to connect to ${connectorId}:`, err);

    // Classify the error and provide structured response
    const classified = classifyError(err, {
      connector: prebuilt.name,
      connectorId
    });

    // Add connector-specific auth info if relevant
    const response = formatErrorResponse(classified);
    if (prebuilt.requiresAuth) {
      response.error.authInstructions = prebuilt.authInstructions;
      response.error.envRequired = prebuilt.envRequired;
      response.error.envHelp = prebuilt.envHelp;
    }

    // Set status based on error type
    response.status = getStatusFromError(classified);

    res.status(500).json(response);
  }
});

export default router;
