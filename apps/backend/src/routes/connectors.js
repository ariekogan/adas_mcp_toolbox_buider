/**
 * Connector Routes
 *
 * API endpoints for managing MCP server connections and discovering tools.
 */

import { Router } from 'express';
import mcpManager from '../services/mcpConnector.js';

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
  const { command, args, env, name, id } = req.body;

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

    res.json({
      success: true,
      connection: result
    });
  } catch (err) {
    console.error('Failed to connect to MCP server:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/connectors/disconnect/:id
 * Disconnect from an MCP server
 */
router.post('/disconnect/:id', (req, res) => {
  const { id } = req.params;

  const disconnected = mcpManager.disconnect(id);

  if (disconnected) {
    res.json({ success: true, message: `Disconnected from ${id}` });
  } else {
    res.status(404).json({ success: false, error: 'Connection not found' });
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
 * POST /api/connectors/:id/import-to-domain
 * Import discovered tools into a DAL domain
 *
 * Body:
 *   - domainId: string
 *   - tools: string[] (tool names to import, or empty for all)
 *   - policies: object (optional default policies)
 */
router.post('/:id/import-to-domain', async (req, res) => {
  const { id } = req.params;
  const { domainId, tools: toolsToImport, policies } = req.body;

  if (!domainId) {
    return res.status(400).json({ error: 'Domain ID is required' });
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
    message: `Ready to import ${dalTools.length} tools into domain ${domainId}`
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
 */
const PREBUILT_CONNECTORS = {
  gmail_docker: {
    name: 'Gmail (App Password)',
    description: 'Read and send emails via Gmail using IMAP/SMTP',
    command: 'docker',
    args: ['run', '-i', '--rm', 'yashtekwani/gmail-mcp'],
    requiresAuth: true,
    authInstructions: 'Set EMAIL_ADDRESS and EMAIL_PASSWORD (Gmail app password) environment variables. Generate app password at Google Account > Security > App Passwords',
    envRequired: ['EMAIL_ADDRESS', 'EMAIL_PASSWORD'],
    category: 'communication'
  },
  gmail: {
    name: 'Gmail (OAuth)',
    description: 'Read and send emails via Gmail with OAuth',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    requiresAuth: true,
    authInstructions: 'Run `npx @gongrzhe/server-gmail-autoauth-mcp auth` first to authenticate',
    category: 'communication'
  },
  slack: {
    name: 'Slack',
    description: 'Send messages and manage Slack channels',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiresAuth: true,
    authInstructions: 'Set SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables',
    envRequired: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    category: 'communication'
  },
  github: {
    name: 'GitHub',
    description: 'Manage repositories, issues, and pull requests',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresAuth: true,
    authInstructions: 'Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable',
    envRequired: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
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
    authInstructions: 'Provide PostgreSQL connection string in POSTGRES_CONNECTION_STRING',
    envRequired: ['POSTGRES_CONNECTION_STRING'],
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
    authInstructions: 'Set BRAVE_API_KEY environment variable',
    envRequired: ['BRAVE_API_KEY'],
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
  }
};

/**
 * GET /api/connectors/prebuilt
 * List available pre-built connectors
 */
router.get('/prebuilt', (_req, res) => {
  const connectors = Object.entries(PREBUILT_CONNECTORS).map(([id, config]) => ({
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

  const prebuilt = PREBUILT_CONNECTORS[connectorId];
  if (!prebuilt) {
    return res.status(404).json({ error: `Pre-built connector not found: ${connectorId}` });
  }

  try {
    const result = await mcpManager.connect({
      id: connectorId,
      command: prebuilt.command,
      args: [...prebuilt.args, ...extraArgs],
      env: extraEnv,
      name: prebuilt.name
    });

    res.json({
      success: true,
      connection: result
    });
  } catch (err) {
    console.error(`Failed to connect to ${connectorId}:`, err);

    // Provide helpful error message
    let helpMessage = err.message;
    if (prebuilt.requiresAuth && err.message.includes('auth')) {
      helpMessage = prebuilt.authInstructions;
    }

    res.status(500).json({
      success: false,
      error: helpMessage,
      requiresAuth: prebuilt.requiresAuth,
      authInstructions: prebuilt.authInstructions
    });
  }
});

export default router;
