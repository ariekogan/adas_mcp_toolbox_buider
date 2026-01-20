/**
 * Port Utility Module
 *
 * Provides utilities for detecting port availability and resolving port conflicts
 * for MCP connectors that require network ports.
 */

import net from 'net';

/**
 * Check if a port is available (not in use)
 *
 * @param {number} port - Port number to check
 * @param {string} host - Host to check (default: '127.0.0.1')
 * @returns {Promise<boolean>} True if port is available
 */
export async function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors - assume port is available but may have issues
        resolve(true);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port within a range
 *
 * @param {number} startPort - Starting port number
 * @param {number} endPort - Ending port number (default: startPort + 100)
 * @param {string} host - Host to check (default: '127.0.0.1')
 * @returns {Promise<number|null>} Available port or null if none found
 */
export async function findAvailablePort(startPort, endPort = null, host = '127.0.0.1') {
  const end = endPort || startPort + 100;

  for (let port = startPort; port <= end; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  return null;
}

/**
 * Resolve port for a connector configuration
 *
 * If the connector has a portConfig and the default port is in use,
 * this will find an available port and return updated env/args.
 *
 * @param {object} connectorConfig - Connector configuration
 * @param {object} connectorConfig.portConfig - Port configuration (optional)
 * @param {number} connectorConfig.portConfig.port - Default port
 * @param {string} connectorConfig.portConfig.envVar - Env var to set port
 * @param {string} connectorConfig.portConfig.argFlag - CLI flag for port (optional)
 * @param {number[]} connectorConfig.portConfig.range - [start, end] port range
 * @param {object} env - Current environment variables
 * @param {string[]} args - Current command arguments
 * @returns {Promise<object>} { env, args, portInfo }
 */
export async function resolvePort(connectorConfig, env = {}, args = []) {
  const { portConfig } = connectorConfig;

  // No port config - nothing to resolve
  if (!portConfig) {
    return { env, args, portInfo: null };
  }

  const {
    port: defaultPort,
    envVar = 'PORT',
    argFlag = null,
    range = [defaultPort, defaultPort + 100]
  } = portConfig;

  // Check if default port is available
  const defaultAvailable = await isPortAvailable(defaultPort);

  if (defaultAvailable) {
    // Default port is free - use it
    const updatedEnv = { ...env };
    if (envVar) {
      updatedEnv[envVar] = String(defaultPort);
    }

    let updatedArgs = [...args];
    if (argFlag) {
      updatedArgs = [...args, argFlag, String(defaultPort)];
    }

    return {
      env: updatedEnv,
      args: updatedArgs,
      portInfo: {
        port: defaultPort,
        wasAutoAssigned: false,
        message: null
      }
    };
  }

  // Default port is in use - find an available one
  const [rangeStart, rangeEnd] = range;
  const availablePort = await findAvailablePort(rangeStart, rangeEnd);

  if (!availablePort) {
    // No available ports in range
    throw new Error(
      `Port conflict: port ${defaultPort} is in use and no available ports found in range ${rangeStart}-${rangeEnd}`
    );
  }

  // Update env and args with new port
  const updatedEnv = { ...env };
  if (envVar) {
    updatedEnv[envVar] = String(availablePort);
  }

  let updatedArgs = [...args];
  if (argFlag) {
    updatedArgs = [...args, argFlag, String(availablePort)];
  }

  return {
    env: updatedEnv,
    args: updatedArgs,
    portInfo: {
      port: availablePort,
      originalPort: defaultPort,
      wasAutoAssigned: true,
      message: `Port ${defaultPort} was in use, auto-assigned port ${availablePort}`
    }
  };
}

/**
 * Get list of ports currently in use by our connectors
 * (For future use - tracking ports across multiple connectors)
 */
const allocatedPorts = new Set();

export function trackPort(port) {
  allocatedPorts.add(port);
}

export function releasePort(port) {
  allocatedPorts.delete(port);
}

export function getAllocatedPorts() {
  return Array.from(allocatedPorts);
}

export default {
  isPortAvailable,
  findAvailablePort,
  resolvePort,
  trackPort,
  releasePort,
  getAllocatedPorts
};
