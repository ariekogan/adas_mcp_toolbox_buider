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
 */

// ADAS Core API base URL (same env var as export.js)
const ADAS_API_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';

/**
 * Sync a connector configuration to ADAS.
 * Creates or updates the connector in ADAS ConnectorRegistry.
 *
 * Supports both transport types:
 * - stdio: Uses config.command, config.args, config.env
 * - http: Uses endpoint URL
 *
 * @param {object} connector - Connector config from DAL
 * @param {string} connector.id - Unique connector ID
 * @param {string} connector.name - Display name
 * @param {string} connector.type - Connector type (e.g., 'gmail', 'github', 'mcp')
 * @param {string} connector.transport - 'stdio' or 'http' (default: 'stdio')
 * @param {string} connector.endpoint - HTTP endpoint URL (for http transport)
 * @param {object} connector.config - { command, args, env } (for stdio transport)
 * @param {object} connector.credentials - Decrypted credentials (env vars)
 * @param {string} connector.layer - 'system' or 'tenant' (default: 'tenant')
 * @returns {Promise<object>} ADAS response
 */
export async function syncConnectorToADAS(connector) {
  const { id, name, type, transport, endpoint, config, credentials, layer } = connector;

  // Build payload based on transport type
  const payload = {
    id,
    name,
    type: type || 'mcp',
    enabled: true,
    autoStart: true,
    credentials: credentials || {}
  };

  // Add layer if specified
  if (layer) {
    payload.layer = layer;
  }

  // HTTP transport: uses endpoint
  if (transport === 'http' || endpoint) {
    payload.transport = 'http';
    payload.endpoint = endpoint;
  }
  // stdio transport: uses command/args/env
  else {
    payload.transport = 'stdio';
    payload.config = {
      command: config?.command,
      args: config?.args || [],
      env: config?.env || {}
    };
  }

  try {
    // Check if connector exists
    const checkRes = await fetch(`${ADAS_API_URL}/api/connectors/${id}`);

    if (checkRes.ok) {
      // Update existing connector
      const updateRes = await fetch(`${ADAS_API_URL}/api/connectors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!updateRes.ok) {
        const error = await updateRes.json().catch(() => ({}));
        throw new Error(error.error || `Failed to update connector: ${updateRes.status}`);
      }

      console.log(`[ADASSync] Updated connector ${id} in ADAS`);
      return updateRes.json();
    } else {
      // Create new connector
      const createRes = await fetch(`${ADAS_API_URL}/api/connectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!createRes.ok) {
        const error = await createRes.json().catch(() => ({}));
        throw new Error(error.error || `Failed to create connector: ${createRes.status}`);
      }

      console.log(`[ADASSync] Created connector ${id} in ADAS`);
      return createRes.json();
    }
  } catch (err) {
    console.error(`[ADASSync] Failed to sync connector ${id}:`, err.message);
    throw err;
  }
}

/**
 * Start a connector in ADAS (trigger MCPGateway to spawn it).
 *
 * @param {string} connectorId - Connector ID
 * @returns {Promise<object>} ADAS response with tools list
 */
export async function startConnectorInADAS(connectorId) {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors/${connectorId}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Failed to start connector: ${res.status}`);
    }

    const data = await res.json();
    console.log(`[ADASSync] Started connector ${connectorId} in ADAS: ${data.tools?.length || 0} tools`);
    return data;
  } catch (err) {
    console.error(`[ADASSync] Failed to start connector ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Stop a connector in ADAS.
 *
 * @param {string} connectorId - Connector ID
 * @returns {Promise<object>} ADAS response
 */
export async function stopConnectorInADAS(connectorId) {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors/${connectorId}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Failed to stop connector: ${res.status}`);
    }

    console.log(`[ADASSync] Stopped connector ${connectorId} in ADAS`);
    return res.json();
  } catch (err) {
    console.error(`[ADASSync] Failed to stop connector ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Delete a connector from ADAS.
 *
 * @param {string} connectorId - Connector ID
 * @returns {Promise<object>} ADAS response
 */
export async function deleteConnectorFromADAS(connectorId) {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors/${connectorId}`, {
      method: 'DELETE'
    });

    if (!res.ok && res.status !== 404) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Failed to delete connector: ${res.status}`);
    }

    console.log(`[ADASSync] Deleted connector ${connectorId} from ADAS`);
    return { ok: true };
  } catch (err) {
    console.error(`[ADASSync] Failed to delete connector ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Get all connectors from ADAS.
 *
 * @returns {Promise<object[]>} Array of connectors
 */
export async function getConnectorsFromADAS() {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors`);

    if (!res.ok) {
      throw new Error(`Failed to get connectors: ${res.status}`);
    }

    const data = await res.json();
    return data.connectors || [];
  } catch (err) {
    console.error(`[ADASSync] Failed to get connectors from ADAS:`, err.message);
    return [];
  }
}

/**
 * Call a tool on a connector in ADAS.
 *
 * @param {string} connectorId - Connector ID
 * @param {string} toolName - Tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool result
 */
export async function callConnectorTool(connectorId, toolName, args = {}) {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors/${connectorId}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, args })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Tool call failed: ${res.status}`);
    }

    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error(`[ADASSync] Failed to call tool ${toolName} on ${connectorId}:`, err.message);
    throw err;
  }
}

/**
 * Check if ADAS is reachable.
 *
 * @returns {Promise<boolean>}
 */
export async function isADASAvailable() {
  try {
    const res = await fetch(`${ADAS_API_URL}/api/connectors`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
