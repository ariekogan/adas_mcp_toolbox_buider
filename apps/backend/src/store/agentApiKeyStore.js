/**
 * Agent API Key Store - file-based persistence for tenant-scoped API keys
 *
 * Storage structure:
 *   /memory/<tenant>/_agent-api/keys.json
 *
 * Keys are used to authenticate external AI agents calling the
 * skill-validator (External Agent API) through the ngrok tunnel.
 *
 * @module store/agentApiKeyStore
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getTenantRoot, getCurrentTenant } from '../utils/tenantContext.js';

const AGENT_API_DIR = '_agent-api';
const KEYS_FILE = 'keys.json';

/**
 * Parse a tenant-embedded API key.
 * Format: adas_<tenant>_<32hex>
 * Also supports legacy format: adas_<32hex> (no tenant embedded).
 * @returns {{ tenant: string|null, isValid: boolean }}
 */
export function parseApiKey(key) {
  if (!key || typeof key !== 'string') return { tenant: null, isValid: false };
  // New format: adas_<tenant>_<32hex>
  const match = key.match(/^adas_([a-z0-9][a-z0-9-]{0,28}[a-z0-9])_([0-9a-f]{32})$/);
  if (match) return { tenant: match[1], isValid: true };
  // Legacy format: adas_<32hex> (no tenant)
  const legacy = key.match(/^adas_([0-9a-f]{32})$/);
  if (legacy) return { tenant: null, isValid: true };
  return { tenant: null, isValid: false };
}

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

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function getKeysDir() {
  return path.join(getTenantRoot(), AGENT_API_DIR);
}

function getKeysPath() {
  return path.join(getTenantRoot(), AGENT_API_DIR, KEYS_FILE);
}

/**
 * Generate a new API key with embedded tenant: "adas_<tenant>_<32hex>"
 * The tenant is encoded into the key so external clients only need one value.
 */
function generateKey() {
  const tenant = getCurrentTenant();
  return `adas_${tenant}_${crypto.randomBytes(16).toString('hex')}`;
}

// ═══════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the current API key, or null if none exists.
 * @returns {Promise<string|null>}
 */
async function getKey() {
  try {
    const data = await readJson(getKeysPath());
    return data.apiKey || null;
  } catch {
    return null;
  }
}

/**
 * Get the current API key, creating one if it doesn't exist.
 * @returns {Promise<string>}
 */
async function getOrCreateKey() {
  const existing = await getKey();
  if (existing) return existing;

  const apiKey = generateKey();
  const now = new Date().toISOString();

  await ensureDir(getKeysDir());
  await writeJson(getKeysPath(), {
    version: 1,
    apiKey,
    createdAt: now,
    rotatedAt: now
  });

  console.log('[AgentApiKeyStore] Created new API key for tenant');
  return apiKey;
}

/**
 * Rotate the API key — generates a new one and replaces the old.
 * @returns {Promise<string>} The new API key
 */
async function rotateKey() {
  const apiKey = generateKey();
  const now = new Date().toISOString();

  // Preserve createdAt if file exists
  let createdAt = now;
  try {
    const existing = await readJson(getKeysPath());
    createdAt = existing.createdAt || now;
  } catch {
    // No existing file — that's fine
  }

  await ensureDir(getKeysDir());
  await writeJson(getKeysPath(), {
    version: 1,
    apiKey,
    createdAt,
    rotatedAt: now
  });

  console.log('[AgentApiKeyStore] Rotated API key for tenant');
  return apiKey;
}

/**
 * Validate a candidate key against the stored key (constant-time comparison).
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
async function validateKey(candidate) {
  const stored = await getKey();
  if (!stored || !candidate) return false;

  try {
    const a = Buffer.from(stored, 'utf-8');
    const b = Buffer.from(candidate, 'utf-8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export default {
  getKey,
  getOrCreateKey,
  rotateKey,
  validateKey
};
