/**
 * MCP Connector Service
 *
 * Connects to MCP servers, discovers available tools, and provides a bridge
 * for DAL to use external MCP tools.
 *
 * MCP Protocol: JSON-RPC 2.0 over stdio
 * Spec: https://modelcontextprotocol.io/specification
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Represents a connection to an MCP server
 */
class MCPConnection extends EventEmitter {
  constructor(id, config) {
    super();
    this.id = id;
    this.config = config;
    this.process = null;
    this.buffer = '';
    this.pendingRequests = new Map();
    this.serverInfo = null;
    this.tools = [];
    this.connected = false;
  }

  /**
   * Start the MCP server and establish connection
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const { command, args = [], env = {} } = this.config;

      // Spawn the MCP server process
      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        shell: true
      });

      this.process.stdout.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[MCP ${this.id}] stderr:`, data.toString());
      });

      this.process.on('error', (err) => {
        console.error(`[MCP ${this.id}] Process error:`, err);
        this.connected = false;
        reject(err);
      });

      this.process.on('close', (code) => {
        console.log(`[MCP ${this.id}] Process exited with code ${code}`);
        this.connected = false;
        this.emit('close', code);
      });

      // Handle stdin errors (EPIPE when process dies)
      this.process.stdin.on('error', (err) => {
        console.error(`[MCP ${this.id}] stdin error:`, err.message);
        // Reject any pending requests
        for (const [id, { reject }] of this.pendingRequests) {
          reject(new Error('MCP server process terminated unexpectedly'));
        }
        this.pendingRequests.clear();
      });

      // Initialize the connection
      this.initialize()
        .then((result) => {
          this.connected = true;
          resolve(result);
        })
        .catch(reject);
    });
  }

  /**
   * Handle incoming data from MCP server
   */
  handleData(data) {
    this.buffer += data;

    // MCP uses newline-delimited JSON
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        console.error(`[MCP ${this.id}] Failed to parse message:`, line, err);
      }
    }
  }

  /**
   * Handle a parsed JSON-RPC message
   */
  handleMessage(message) {
    // Response to a request we made
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'MCP error'));
      } else {
        resolve(message.result);
      }
    }
    // Notification from server (no id)
    else if (!message.id && message.method) {
      this.emit('notification', message);
    }
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  async request(method, params = {}) {
    return new Promise((resolve, reject) => {
      // Check if process is still alive and connected
      if (!this.connected || !this.process || this.process.killed || !this.process.stdin.writable) {
        reject(new Error(`MCP server process is not running. The server may have failed to start or disconnected.`));
        return;
      }

      const id = randomUUID();
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      try {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to send request: ${err.message}`));
      }
    });
  }

  /**
   * Initialize the MCP connection (required handshake)
   */
  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'DAL-Connector',
        version: '1.0.0'
      }
    });

    this.serverInfo = result;

    // Send initialized notification
    this.process.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    return result;
  }

  /**
   * Discover available tools from the MCP server
   */
  async discoverTools() {
    const result = await this.request('tools/list');
    this.tools = result.tools || [];
    return this.tools;
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name, args = {}) {
    const result = await this.request('tools/call', {
      name,
      arguments: args
    });
    return result;
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
  }
}

/**
 * MCP Connector Manager
 * Manages multiple MCP connections
 */
class MCPConnectorManager {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Connect to an MCP server
   *
   * @param {object} config - Connection configuration
   * @param {string} config.command - Command to run (e.g., 'npx', 'python')
   * @param {string[]} config.args - Command arguments
   * @param {object} config.env - Environment variables
   * @param {string} config.name - Display name for this connector
   * @returns {Promise<object>} Connection info with discovered tools
   */
  async connect(config) {
    const id = config.id || randomUUID();

    // Check if already connected
    if (this.connections.has(id)) {
      const existing = this.connections.get(id);
      if (existing.connected) {
        return {
          id,
          alreadyConnected: true,
          serverInfo: existing.serverInfo,
          tools: existing.tools
        };
      }
      // Clean up stale connection
      existing.disconnect();
    }

    const connection = new MCPConnection(id, config);

    try {
      const serverInfo = await connection.connect();
      const tools = await connection.discoverTools();

      this.connections.set(id, connection);

      return {
        id,
        connected: true,
        serverInfo,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    } catch (err) {
      connection.disconnect();
      throw err;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  disconnect(id) {
    const connection = this.connections.get(id);
    if (connection) {
      connection.disconnect();
      this.connections.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get connection status
   */
  getStatus(id) {
    const connection = this.connections.get(id);
    if (!connection) {
      return { connected: false, exists: false };
    }
    return {
      exists: true,
      connected: connection.connected,
      serverInfo: connection.serverInfo,
      tools: connection.tools
    };
  }

  /**
   * List all connections
   */
  listConnections() {
    const result = [];
    for (const [id, connection] of this.connections) {
      result.push({
        id,
        name: connection.config.name || id,
        connected: connection.connected,
        toolCount: connection.tools.length
      });
    }
    return result;
  }

  /**
   * Call a tool on a connected MCP server
   */
  async callTool(connectionId, toolName, args) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`No connection found: ${connectionId}. Available connections: ${Array.from(this.connections.keys()).join(', ') || 'none'}`);
    }
    if (!connection.connected) {
      throw new Error(`Connection not active: ${connectionId}. The MCP server may have crashed.`);
    }

    console.log(`[MCP] Calling tool ${toolName} on connection ${connectionId} with args:`, JSON.stringify(args));

    try {
      const result = await connection.callTool(toolName, args);
      console.log(`[MCP] Tool ${toolName} returned:`, JSON.stringify(result).substring(0, 200));
      return result;
    } catch (err) {
      console.error(`[MCP] Tool ${toolName} failed:`, err.message);
      throw err;
    }
  }

  /**
   * Disconnect all connections
   */
  disconnectAll() {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }
}

// Singleton instance
const mcpManager = new MCPConnectorManager();

export { MCPConnection, MCPConnectorManager, mcpManager };
export default mcpManager;
