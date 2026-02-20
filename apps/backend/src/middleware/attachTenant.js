// middleware/attachTenant.js
// Multi-tenant middleware for Skill Builder — resolves tenant from:
// 1) JWT (Authorization: Bearer <JWT>) — verified via ADAS Core /api/auth/me
// 2) PAT (Authorization: Bearer <PAT>) — verified via ADAS Core /api/auth/verify-pat
// In dev mode only: X-ADAS-TENANT header fallback (when SB_AUTH_SKIP=true or NODE_ENV=development)
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
 * Express middleware: resolves tenant from JWT or PAT.
 * Sets req.auth only for authenticated requests.
 * In dev mode, falls back to X-ADAS-TENANT header (without setting req.auth).
 * In production, unauthenticated requests get DEFAULT_TENANT but no req.auth,
 * so the auth guard in server.js blocks protected routes.
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

  // No valid JWT/PAT — check if dev mode allows X-ADAS-TENANT fallback
  const IS_DEV = process.env.NODE_ENV === "development" || process.env.SB_AUTH_SKIP === "true";

  if (IS_DEV) {
    // Dev/standalone: accept X-ADAS-TENANT header without authentication
    const raw = req.headers["x-adas-tenant"];
    const requested = raw ? raw.trim().toLowerCase() : "";
    req.tenant = isValidTenant(requested) ? requested : DEFAULT_TENANT;
  } else {
    // Production: no auth = default tenant, req.auth stays unset (auth guard will block /api)
    req.tenant = DEFAULT_TENANT;
  }

  // Wrap the rest of the request in tenant-scoped ALS context
  // Note: req.auth is NOT set — the auth guard in server.js will block protected routes
  runWithTenant(req.tenant, () => next());
}

export default attachTenant;
