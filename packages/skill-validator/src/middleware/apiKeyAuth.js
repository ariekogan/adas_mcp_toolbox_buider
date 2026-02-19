/**
 * API Key Authentication Middleware
 *
 * Protects the External Agent API by requiring a valid X-API-KEY header.
 * The key is read from the same file-based store the backend writes to:
 *   /memory/<tenant>/_agent-api/keys.json
 *
 * Key format: adas_<tenant>_<32hex>  (tenant embedded in key)
 * Legacy:     adas_<32hex>           (tenant from X-ADAS-TENANT header)
 *
 * Exemptions:
 *   - GET /health (health check must remain open)
 *   - GET /spec/* (spec/examples must be publicly readable for ChatGPT/Claude)
 *   - POST /validate/* (read-only validation, no side effects)
 *
 * If no key file exists (key never generated), all requests are allowed.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tenant validation: accept any lowercase alphanumeric slug (backend validates via ADAS Core)
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
const DEFAULT_TENANT = process.env.SB_TENANT || 'main';

/**
 * Parse a tenant-embedded API key.
 * Format: adas_<tenant>_<32hex>
 * Legacy: adas_<32hex> (no tenant embedded)
 * @returns {{ tenant: string|null, isValid: boolean }}
 */
function parseApiKey(key) {
  if (!key || typeof key !== 'string') return { tenant: null, isValid: false };
  // New format: adas_<tenant>_<32hex>
  const match = key.match(/^adas_([a-z0-9][a-z0-9-]{0,28}[a-z0-9])_([0-9a-f]{32})$/);
  if (match) return { tenant: match[1], isValid: true };
  // Legacy format: adas_<32hex> (no tenant)
  const legacy = key.match(/^adas_([0-9a-f]{32})$/);
  if (legacy) return { tenant: null, isValid: true };
  return { tenant: null, isValid: false };
}

/**
 * Resolve the memory root for a given tenant.
 * Same logic as backend's tenantContext.js.
 *
 * Resolution order:
 *   1. MEMORY_PATH env var (Docker / explicit config)
 *   2. TENANTS_ROOT env var (Docker compose: /tenants)
 *   3. <project-root>/apps/backend/data/tenants/<tenant>  (local dev)
 *
 * The local-dev fallback uses __dirname to resolve the project root,
 * so it works regardless of cwd (standalone or forked).
 */
function getMemoryRoot(tenant) {
  if (process.env.MEMORY_PATH) {
    return process.env.MEMORY_PATH;
  }
  if (process.env.TENANTS_ROOT) {
    return path.join(process.env.TENANTS_ROOT, tenant);
  }
  // Local dev: resolve from this file → project root → backend data dir
  // __dirname = packages/skill-validator/src/middleware
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  return path.join(projectRoot, 'apps', 'backend', 'data', 'tenants', tenant);
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
 *
 * Resolves tenant in this order:
 *   1. Tenant embedded in the API key (adas_<tenant>_<hex>)
 *   2. X-ADAS-TENANT header (legacy / fallback)
 *   3. Default tenant
 *
 * Sets req.headers['x-adas-tenant'] so downstream routes can read it.
 */
export default async function apiKeyAuth(req, res, next) {
  // Exempt health check and spec endpoints (must be publicly readable)
  if (req.method === 'GET' && (req.path === '/health' || req.path.startsWith('/spec'))) {
    return next();
  }

  // Exempt validation endpoints — they're read-like (no side effects)
  if (req.method === 'POST' && req.path.startsWith('/validate')) {
    return next();
  }

  // Check X-API-KEY header
  const candidateKey = req.headers['x-api-key'];

  // Try to extract tenant from the key itself
  const parsed = parseApiKey(candidateKey);

  // Resolve tenant: key-embedded > header > default
  let tenant;
  if (parsed.tenant) {
    tenant = parsed.tenant;
    // Ensure downstream routes see the correct tenant
    req.headers['x-adas-tenant'] = tenant;
  } else {
    const raw = req.headers['x-adas-tenant'];
    const sanitized = raw ? raw.trim().toLowerCase() : '';
    tenant = (sanitized && TENANT_RE.test(sanitized)) ? sanitized : DEFAULT_TENANT;
  }

  // Load stored key for this tenant
  const storedKey = await readStoredKey(tenant);

  // If no key configured yet, allow all requests (auth not yet set up)
  if (!storedKey) {
    return next();
  }

  if (!candidateKey || !safeCompare(storedKey, candidateKey)) {
    return res.status(401).json({
      error: 'Invalid or missing API key',
      hint: 'Include header: X-API-KEY: adas_<tenant>_<key>. Get your key at https://app.ateam-ai.com/get-api-key'
    });
  }

  next();
}
