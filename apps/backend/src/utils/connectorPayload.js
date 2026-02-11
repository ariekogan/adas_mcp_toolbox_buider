/**
 * Shared connector payload utilities.
 *
 * The MCP manifest (from PB or any solution pack) is the single source of truth.
 * These helpers pass manifest data through faithfully — no hardcoded filenames,
 * no guessed paths, no reconstructed values.
 *
 * PB has no idea where/how its stuff will be deployed. It declares what it is
 * (transport, command, args, port). Skill Builder passes it through with
 * minimal deployment-specific derivation (endpoint from id+port).
 */

/**
 * Determine whether a connector manifest describes a stdio transport.
 * Explicit `transport` field always wins.
 *
 * @param {object} mcp - Connector manifest entry
 * @returns {boolean}
 */
export function isStdioTransport(mcp) {
  if (mcp.transport === 'http') return false;
  if (mcp.transport === 'stdio') return true;
  return !!mcp.command;
}

/**
 * Derive the HTTP endpoint for a connector.
 * Uses manifest endpoint if provided, otherwise derives from id + port.
 *
 * @param {object} mcp - Connector manifest entry
 * @returns {string|undefined}
 */
export function deriveEndpoint(mcp) {
  if (mcp.endpoint) return mcp.endpoint;
  if (mcp.port) return `http://${mcp.id}:${mcp.port}/mcp`;
  return undefined;
}

/**
 * Build the ADAS-ready connector payload from a manifest entry.
 * Passes through all manifest-provided values as-is.
 *
 * @param {object} mcp - Connector manifest entry
 * @param {object} [opts] - Options
 * @param {object} [opts.credentials] - Credentials to include (default: {})
 * @returns {object} Payload ready for syncConnectorToADAS()
 */
export function buildConnectorPayload(mcp, opts = {}) {
  const stdio = isStdioTransport(mcp);

  // Safety: connectors with command + args should be stdio, not HTTP.
  // HTTP transport requires a reachable network endpoint (Docker service name).
  // All solution connectors run as stdio child processes in ADAS Core.
  if (!stdio && mcp.command) {
    console.warn(`[connectorPayload] WARNING: connector ${mcp.id} has command "${mcp.command}" but transport="${mcp.transport}". Solution connectors should use transport: "stdio".`);
  }

  const payload = {
    id: mcp.id,
    name: mcp.name,
    type: 'mcp',
    transport: stdio ? 'stdio' : 'http',
    credentials: opts.credentials || {}
  };

  if (!stdio) {
    payload.endpoint = deriveEndpoint(mcp);
  }

  // Pass through command/args/env as-is from manifest
  if (mcp.command) {
    payload.config = {
      command: mcp.command,
      args: mcp.args || [],
      env: mcp.envDefaults || mcp.env || {}
    };
  }

  return payload;
}

/**
 * Build a catalog entry for the Skill Builder's prebuilt connector registry.
 * Preserves all manifest fields for downstream consumers.
 *
 * @param {object} mcp - Connector manifest entry
 * @returns {object} Catalog entry for registerImportedConnector()
 */
export function buildCatalogEntry(mcp) {
  const stdio = isStdioTransport(mcp);

  const entry = {
    id: mcp.id,
    name: mcp.name,
    description: mcp.description,
    transport: stdio ? 'stdio' : 'http',
    category: mcp.category || 'custom',
    requiresAuth: mcp.requiresAuth || false,
    layer: mcp.layer || 'tenant'
  };

  if (mcp.command) {
    entry.command = mcp.command;
    entry.args = mcp.args || [];
  }
  entry.env = mcp.env || {};

  if (!stdio) {
    entry.endpoint = deriveEndpoint(mcp);
    if (mcp.port) entry.port = mcp.port;
  }

  // Preserve ui_capable flag for template generation
  if (mcp.ui_capable) {
    entry.ui_capable = true;
  }

  return entry;
}
