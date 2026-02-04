/**
 * Connector State Store - file-based persistence for MCP connector configurations
 *
 * Storage structure:
 *   /memory/_connectors/state.json
 *
 * This module saves connector configurations so they survive backend restarts.
 * On startup, the server can auto-reconnect to previously connected MCP servers.
 *
 * @module store/connectorState
 */

import fs from 'fs/promises';
import path from 'path';

import { getMemoryRoot } from '../utils/tenantContext.js';
const CONNECTORS_DIR = '_connectors';
const STATE_FILE = 'state.json';

/**
 * @typedef {Object} SavedConnector
 * @property {string} id - Connector ID
 * @property {string} name - Display name
 * @property {string|null} prebuiltId - Prebuilt connector ID (null for custom)
 * @property {string} command - Command to run (e.g., "npx")
 * @property {string[]} args - Command arguments
 * @property {Object} env - Environment variables (including credentials)
 * @property {boolean} hasCredentials - Whether env contains sensitive credentials
 * @property {string} connectedAt - ISO timestamp when first connected
 * @property {boolean} syncedToADAS - Whether synced to ADAS Core
 * @property {Object|null} portInfo - Port allocation info if applicable
 */

/**
 * @typedef {Object} ConnectorState
 * @property {number} version - Schema version
 * @property {Object.<string, SavedConnector>} connectors - Map of connector ID to config
 */

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function getStatePath() {
  return path.join(getMemoryRoot(), CONNECTORS_DIR, STATE_FILE);
}

function getConnectorsDir() {
  return path.join(getMemoryRoot(), CONNECTORS_DIR);
}

/**
 * Check if an env var key likely contains credentials
 */
function isSensitiveKey(key) {
  const lower = key.toLowerCase();
  return lower.includes('password') ||
         lower.includes('token') ||
         lower.includes('key') ||
         lower.includes('secret') ||
         lower.includes('pass');
}

/**
 * Create empty state object
 */
function createEmptyState() {
  return {
    version: 1,
    connectors: {}
  };
}

// ═══════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize storage directory
 */
async function init() {
  await ensureDir(getConnectorsDir());
}

/**
 * Load connector state from disk
 * @returns {Promise<ConnectorState>}
 */
async function loadState() {
  const statePath = getStatePath();

  try {
    if (await fileExists(statePath)) {
      const state = await readJson(statePath);
      return state;
    }
  } catch (err) {
    console.error('[ConnectorState] Failed to load state file, starting fresh:', err.message);
  }

  return createEmptyState();
}

/**
 * Save connector state to disk
 * @param {ConnectorState} state
 */
async function saveState(state) {
  await init();
  const statePath = getStatePath();
  await writeJson(statePath, state);
}

/**
 * Save a connector configuration
 * @param {Object} config
 * @param {string} config.id - Connector ID
 * @param {string} config.name - Display name
 * @param {string|null} [config.prebuiltId] - Prebuilt ID if applicable
 * @param {string} config.command - Command to run
 * @param {string[]} config.args - Command arguments
 * @param {Object} config.env - Environment variables
 * @param {boolean} [config.syncedToADAS] - Whether synced to ADAS
 * @param {Object|null} [config.portInfo] - Port info if applicable
 */
async function saveConnector(config) {
  const state = await loadState();

  // Check if any env vars are credentials
  const hasCredentials = Object.keys(config.env || {}).some(isSensitiveKey);

  // Preserve existing connectedAt if updating
  const existing = state.connectors[config.id];
  const connectedAt = existing?.connectedAt || new Date().toISOString();

  state.connectors[config.id] = {
    id: config.id,
    name: config.name,
    prebuiltId: config.prebuiltId || null,
    command: config.command,
    args: config.args || [],
    env: config.env || {},
    hasCredentials,
    connectedAt,
    syncedToADAS: config.syncedToADAS || false,
    portInfo: config.portInfo || null
  };

  await saveState(state);
  console.log(`[ConnectorState] Saved connector: ${config.id}`);
}

/**
 * Remove a connector from state
 * @param {string} id - Connector ID
 */
async function removeConnector(id) {
  const state = await loadState();

  if (state.connectors[id]) {
    delete state.connectors[id];
    await saveState(state);
    console.log(`[ConnectorState] Removed connector: ${id}`);
  }
}

/**
 * Get all connectors that can be reconnected on startup
 * @returns {Promise<SavedConnector[]>}
 */
async function getReconnectableConnectors() {
  const state = await loadState();
  return Object.values(state.connectors);
}

/**
 * List saved connector summaries (without sensitive data)
 * @returns {Promise<Array>}
 */
async function listSavedConnectors() {
  const state = await loadState();

  return Object.values(state.connectors).map(conn => ({
    id: conn.id,
    name: conn.name,
    prebuiltId: conn.prebuiltId,
    hasCredentials: conn.hasCredentials,
    connectedAt: conn.connectedAt,
    syncedToADAS: conn.syncedToADAS
  }));
}

/**
 * Check if a connector is saved
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function hasSavedConnector(id) {
  const state = await loadState();
  return !!state.connectors[id];
}

/**
 * Get a single saved connector config
 * @param {string} id
 * @returns {Promise<SavedConnector|null>}
 */
async function getSavedConnector(id) {
  const state = await loadState();
  return state.connectors[id] || null;
}

export default {
  init,
  loadState,
  saveState,
  saveConnector,
  removeConnector,
  getReconnectableConnectors,
  listSavedConnectors,
  hasSavedConnector,
  getSavedConnector
};
