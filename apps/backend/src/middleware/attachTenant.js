// middleware/attachTenant.js
// Multi-tenant middleware for Skill Builder — resolves tenant from:
// 1) JWT (Authorization: Bearer <JWT>) — verified via ADAS Core /api/auth/me
// 2) PAT (Authorization: Bearer <PAT>) — verified via ADAS Core /api/auth/verify-pat
// 3) X-ADAS-TENANT header (fallback for dev/standalone mode)
// Then wraps request in ALS context for tenant-scoped path resolution.

import { runWithTenant, isValidTenant, DEFAULT_TENANT, refreshTenantCache } from "../utils/tenantContext.js";

const ADAS_CORE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || "http://ai-dev-assistant-backend-1:4000";
const CORE_MCP_SECRET = process.env.CORE_MCP_SECRET || process.env.MCP_SHARED_SECRET || "";

// Simple in-memory verification cache (avoids hitting Core on every request)
// Key: token string, Value: { result, expiresAt }
const _authCache = new Map();
const AUTH_CACHE_TTL = 60_000; // 1 minute

function parseBearer(req) {
  const h = req.headers?.authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Check if a token looks like a JWT (3 dot-separated base64 segments).
 */
function isJwtFormat(token) {
  const parts = token.split(".");
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Cache-aware auth verification. Caches successful results for AUTH_CACHE_TTL.
 */
function getCachedAuth(token) {
  const cached = _authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  return null;
}

function setCachedAuth(token, result) {
  _authCache.set(token, { result, expiresAt: Date.now() + AUTH_CACHE_TTL });
  // Prune cache if too large
  if (_authCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _authCache) {
      if (v.expiresAt < now) _authCache.delete(k);
    }
  }
}

/**
 * Verify JWT by calling ADAS Core /api/auth/me.
 * Returns { type: "jwt", tenant, email, roles, ... } or null.
 */
async function verifyJwtViaCore(token) {
  const cached = getCachedAuth(token);
  if (cached) return cached;

  try {
    const res = await fetch(`${ADAS_CORE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.ok) return null;
    const result = { type: "jwt", tenant: json.currentTenant, email: json.email, roles: json.roles };
    setCachedAuth(token, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Verify PAT by calling ADAS Core /api/auth/verify-pat.
 * Returns { type: "pat", tenant, actorId, scopes } or null.
 */
async function verifyPatViaCore(token) {
  const cached = getCachedAuth(token);
  if (cached) return cached;

  try {
    const res = await fetch(`${ADAS_CORE_URL}/api/auth/verify-pat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-adas-token": CORE_MCP_SECRET,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.ok) return null;
    const result = { type: "pat", tenant: json.tenant, actorId: json.actorId, scopes: json.scopes };
    setCachedAuth(token, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Express middleware: resolves tenant from JWT, PAT, or X-ADAS-TENANT header,
 * wraps request in tenant-scoped ALS context.
 */
export async function attachTenant(req, res, next) {
  const token = parseBearer(req);

  if (token) {
    // 1) Try JWT auth (3-segment base64 format)
    if (isJwtFormat(token)) {
      const verified = await verifyJwtViaCore(token);
      if (verified?.tenant && isValidTenant(verified.tenant)) {
        req.tenant = verified.tenant;
        req.auth = verified;
        return runWithTenant(req.tenant, () => next(), { token });
      }
    } else {
      // 2) Try PAT auth (not JWT format)
      const patResult = await verifyPatViaCore(token);
      if (patResult?.tenant) {
        // Refresh tenant cache if this is a new tenant we don't know about yet
        if (!isValidTenant(patResult.tenant)) {
          await refreshTenantCache();
        }
        if (isValidTenant(patResult.tenant)) {
          req.tenant = patResult.tenant;
          req.auth = patResult;
          // Store PAT in ALS — adasCoreClient.js forwards it to Core
          return runWithTenant(req.tenant, () => next(), { token });
        }
      }
    }
  }

  // 3) Fallback: X-ADAS-TENANT header (dev/standalone mode)
  const raw = req.headers["x-adas-tenant"];
  const requested = raw ? raw.trim().toLowerCase() : "";
  req.tenant = isValidTenant(requested) ? requested : DEFAULT_TENANT;

  // Wrap the rest of the request in tenant-scoped ALS context
  runWithTenant(req.tenant, () => next());
}

export default attachTenant;
