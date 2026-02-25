/**
 * ADAS Connector Sync Service
 *
 * Syncs connector configurations from DAL Toolbox Builder to ADAS Core.
 * This enables connectors created in DAL to be available at ADAS runtime.
 *
 * Flow:
 * 1. User connects a connector in DAL (via mcpConnector.js)
 * 2. DAL syncs the config to ADAS (via this service)
 * 3. ADAS stores config in ConnectorRegistry
 * 4. On ADAS startup or connect, MCPGateway spawns the MCP process
 * 5. Skills reference connector IDs, tools are loaded at runtime
 *
 * All ADAS Core HTTP calls are delegated to adasCoreClient.js.
 */

import adasCore from './adasCoreClient.js';

/**
 * Sync a connector configuration to ADAS.
 * Creates or updates the connector in ADAS ConnectorRegistry.
 *
 * Supports both transport types:
 * - stdio: Uses config.command, config.args, config.env
 * - http: Uses endpoint URL
 *
 * @param {object} connector - Connector config from DAL
 * @returns {Promise<object>} ADAS response
 */
export async function syncConnectorToADAS(connector) {
  const { id, name, type, transport, endpoint, config, credentials, layer } = connector;

  if (!id) {
    throw new Error('[ADASSync] Cannot sync connector without an id');
  }

  // Build payload based on transport type
  const payload = {
    id,
    name,
    type: type || 'mcp',
    enabled: true,
    autoStart: true,
    credentials: credentials || {}
  };

  if (layer) {
    payload.layer = layer;
  }

  // HTTP transport: uses endpoint
  if (transport === 'http' || endpoint) {
    payload.transport = 'http';
    payload.endpoint = endpoint;
    if (config?.command) {
      payload.config = {
        command: config.command,
        args: config.args || [],
        env: config.env || {}
      };
    }
  }
  // stdio transport: uses command/args/env
  else {
    payload.transport = 'stdio';
    let args = config?.args || [];
    args = args.map(arg =>
      typeof arg === 'string' ? arg.replace(/\/http-wrapper\.js$/, '/server.js') : arg
    );
    payload.config = {
      command: config?.command,
      args,
      env: config?.env || {}
    };
  }

  try {
    const result = await adasCore.syncConnector(payload);
    console.log(`[ADASSync] Synced connector ${id} in ADAS`);
    return result;
  } catch (err) {
    console.error(`[ADASSync] Failed to sync connector ${id}:`, err.message);
    throw err;
  }
}

/**
 * Start a connector in ADAS (trigger MCPGateway to spawn it).
 *
 * Enhanced: detects silent failures (ok:true but 0 tools for stdio connectors).
 * When 0 tools are discovered, fetches diagnostics from ADAS Core to capture
 * stderr, error messages, and config details so the developer can debug.
 *
 * @param {string} connectorId
 * @param {object} [opts] - Options
 * @param {string} [opts.transport] - Transport type ('stdio'|'http'). If 'stdio' and 0 tools, treated as failure.
 * @returns {Promise<object>} Start result with tools array and optional diagnostics
 */
export async function startConnectorInADAS(connectorId, opts = {}) {
  try {
    const data = await adasCore.startConnector(connectorId);
    const toolCount = data.tools?.length || 0;
    console.log(`[ADASSync] Started connector ${connectorId} in ADAS: ${toolCount} tools`);

    // Detect silent failure: stdio connector with 0 tools is almost always broken
    if (toolCount === 0) {
      console.warn(`[ADASSync] Connector "${connectorId}" started with 0 tools — fetching diagnostics`);

      // Fetch diagnostics to get stderr, error, and config details
      const diag = await adasCore.getConnectorDiagnostics(connectorId);

      // Determine transport from diagnostics or caller hint
      const transport = opts.transport || diag.transport || 'unknown';
      const isStdio = transport === 'stdio';

      // Build diagnostic info
      const diagnostic = {
        tools_discovered: 0,
        transport,
        status: diag.status,
        error: diag.error || data.error || null,
        stderr: diag.stderr || data.stderr || null,
        config: diag.config ? {
          command: diag.config.command,
          args: diag.config.args,
        } : null,
      };

      if (isStdio) {
        // For stdio connectors, 0 tools = failure
        const errMsg = diagnostic.stderr || diagnostic.error || 'No tools discovered';
        console.error(`[ADASSync] Connector "${connectorId}" FAILED (stdio, 0 tools): ${errMsg}`);

        return {
          ...data,
          ok: false,
          tools: [],
          error: 'connector_start_failed',
          message: `Connector "${connectorId}" started but discovered 0 tools. ` +
            `This usually means the MCP server crashed on startup or the entry point is missing.`,
          diagnostic,
        };
      } else {
        // For HTTP connectors, 0 tools might be temporary (server still starting)
        console.warn(`[ADASSync] Connector "${connectorId}" has 0 tools (transport: ${transport}) — may still be starting`);
        return {
          ...data,
          warning: 'zero_tools',
          message: `Connector "${connectorId}" is running but reports 0 tools. It may still be initializing.`,
          diagnostic,
        };
      }
    }

    return data;
  } catch (err) {
    // Connection-level failure (HTTP error, timeout, etc.)
    console.error(`[ADASSync] Failed to start connector ${connectorId}:`, err.message);

    // Enrich with diagnostics if possible
    let diagnostic = null;
    try {
      diagnostic = await adasCore.getConnectorDiagnostics(connectorId);
    } catch { /* ignore — diagnostics are best-effort */ }

    const enriched = new Error(err.message);
    enriched.code = 'CONNECTOR_START_FAILED';
    enriched.diagnostic = diagnostic;
    enriched.data = err.data || {};
    throw enriched;
  }
}

/**
 * Stop a connector in ADAS.
 */
export async function stopConnectorInADAS(connectorId) {
  try {
    const result = await adasCore.stopConnector(connectorId);
    console.log(`[ADASSync] Stopped connector ${connectorId} in ADAS`);
    return result;
  } catch (err) {
    console.error(`[ADASSync] Failed to stop connector ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Delete a connector from ADAS.
 */
export async function deleteConnectorFromADAS(connectorId) {
  try {
    const result = await adasCore.deleteConnector(connectorId);
    console.log(`[ADASSync] Deleted connector ${connectorId} from ADAS`);
    return result;
  } catch (err) {
    console.error(`[ADASSync] Failed to delete connector ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Get all connectors from ADAS.
 */
export async function getConnectorsFromADAS() {
  try {
    return await adasCore.getConnectors();
  } catch (err) {
    console.error(`[ADASSync] Failed to get connectors from ADAS:`, err.message);
    return [];
  }
}

/**
 * Call a tool on a connector in ADAS.
 */
export async function callConnectorTool(connectorId, toolName, args = {}) {
  try {
    return await adasCore.callConnectorTool(connectorId, toolName, args);
  } catch (err) {
    console.error(`[ADASSync] Failed to call tool ${toolName} on ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Upload connector MCP code files to ADAS Core's /mcp-store.
 *
 * @param {string} connectorId - Connector ID
 * @param {string} sourceDir - Path to directory containing connector source files
 * @returns {Promise<object>} ADAS response
 */
export async function uploadMcpCodeToADAS(connectorId, sourceDir) {
  const fs = await import('fs');
  const path = await import('path');

  // Recursively read all files (skip node_modules)
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(path.join(dir, entry.name), relPath);
      } else {
        const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
        files.push({ path: relPath, content });
      }
    }
  }

  walk(sourceDir);

  if (files.length === 0) {
    throw new Error(`No files found in ${sourceDir}`);
  }

  console.log(`[ADASSync] Uploading ${files.length} files for connector ${connectorId} to ADAS mcp-store`);

  try {
    const data = await adasCore.uploadMcpCode(connectorId, files);
    const parts = [`${data.filesWritten?.length || 0} files`, `deps=${data.depsInstalled}`];
    if (data.buildRan) parts.push('build=ok');
    if (data.buildError) parts.push(`buildError=${data.buildError}`);
    console.log(`[ADASSync] Uploaded connector ${connectorId}: ${parts.join(', ')}`);
    return data;
  } catch (err) {
    console.error(`[ADASSync] Failed to upload MCP code for ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Wipe all connectors from ADAS Core.
 * Used before deploy-all since we support one solution per tenant.
 */
export async function deleteAllConnectorsFromADAS() {
  try {
    const result = await adasCore.deleteAllConnectors();
    console.log('[ADASSync] Deleted all connectors from ADAS');
    return result;
  } catch (err) {
    console.error('[ADASSync] Failed to delete all connectors:', err.message);
    throw err;
  }
}

/**
 * Wipe all skills from ADAS Core.
 * Used before deploy-all since we support one solution per tenant.
 */
export async function deleteAllSkillsFromADAS() {
  try {
    const result = await adasCore.deleteAllSkills();
    console.log('[ADASSync] Deleted all skills from ADAS');
    return result;
  } catch (err) {
    console.error('[ADASSync] Failed to delete all skills:', err.message);
    throw err;
  }
}

/**
 * Check if ADAS is reachable.
 */
export async function isADASAvailable() {
  return adasCore.isAvailable();
}
