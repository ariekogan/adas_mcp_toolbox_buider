/**
 * API Key Authentication Middleware
 *
 * Protects the External Agent API by requiring a valid X-API-KEY header.
 * The key is read from the same file-based store the backend writes to:
 *   /memory/<tenant>/_agent-api/keys.json
 *
 * Exemptions:
 *   - GET /health (health check must remain open)
 *
 * If no key file exists (key never generated), all requests are allowed.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const VALID_TENANTS = ['main', 'testing', 'dev'];
const DEFAULT_TENANT = process.env.SB_TENANT || 'main';

/**
 * Resolve the memory root for a given tenant.
 * Same logic as backend's tenantContext.js.
 */
function getMemoryRoot(tenant) {
  if (process.env.MEMORY_PATH) {
    return process.env.MEMORY_PATH;
  }
  const tenantsRoot = process.env.TENANTS_ROOT || path.join(process.cwd(), 'data', 'tenants');
  return path.join(tenantsRoot, tenant);
}

/**
 * Read the stored API key for a tenant.
 * Returns null if file doesn't exist or is unreadable.
 */
async function readStoredKey(tenant) {
  const keysPath = path.join(getMemoryRoot(tenant), '_agent-api', 'keys.json');
  try {
    const data = await fs.readFile(keysPath, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.apiKey || null;
  } catch {
    return null;
  }
}

/**
 * Constant-time comparison of two strings.
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Express middleware for API key authentication.
 */
export default async function apiKeyAuth(req, res, next) {
  // Exempt health check
  if (req.path === '/health' && req.method === 'GET') {
    return next();
  }

  // Determine tenant from header
  const raw = req.headers['x-adas-tenant'];
  const tenant = (raw && VALID_TENANTS.includes(raw.trim().toLowerCase()))
    ? raw.trim().toLowerCase()
    : DEFAULT_TENANT;

  // Load stored key
  const storedKey = await readStoredKey(tenant);

  // If no key configured yet, allow all requests (auth not yet set up)
  if (!storedKey) {
    return next();
  }

  // Check X-API-KEY header
  const candidateKey = req.headers['x-api-key'];

  if (!candidateKey || !safeCompare(storedKey, candidateKey)) {
    return res.status(401).json({
      error: 'Invalid or missing API key',
      hint: 'Include header: X-API-KEY: <your-key>'
    });
  }

  next();
}
