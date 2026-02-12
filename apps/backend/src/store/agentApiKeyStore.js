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
import { getMemoryRoot } from '../utils/tenantContext.js';

const AGENT_API_DIR = '_agent-api';
const KEYS_FILE = 'keys.json';

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
  return path.join(getMemoryRoot(), AGENT_API_DIR);
}

function getKeysPath() {
  return path.join(getMemoryRoot(), AGENT_API_DIR, KEYS_FILE);
}

/**
 * Generate a new API key: "adas_" + 32 random hex chars
 */
function generateKey() {
  return 'adas_' + crypto.randomBytes(16).toString('hex');
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
