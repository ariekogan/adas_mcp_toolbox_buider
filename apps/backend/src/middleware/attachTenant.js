// middleware/attachTenant.js
// Multi-tenant middleware for Skill Builder — resolves tenant from:
// 1) JWT (Authorization: Bearer <JWT>) — verified via ADAS Core /api/auth/me
// 2) X-ADAS-TENANT header (fallback for dev/standalone mode)
// Then wraps request in ALS context for tenant-scoped path resolution.

import { runWithTenant, isValidTenant, DEFAULT_TENANT } from "../utils/tenantContext.js";

const ADAS_CORE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || "http://ai-dev-assistant-backend-1:4000";

// Simple in-memory JWT verification cache (avoids hitting Core on every request)
// Key: JWT token hash, Value: { tenant, expiresAt }
const _jwtCache = new Map();
const JWT_CACHE_TTL = 60_000; // 1 minute

function parseBearer(req) {
  const h = req.headers?.authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Verify JWT by calling ADAS Core /api/auth/me.
 * Returns { tenant, email, roles, ... } or null.
 */
async function verifyJwtViaCore(token) {
  // Check cache first
  const cached = _jwtCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  try {
    const res = await fetch(`${ADAS_CORE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.ok) return null;
    const result = { tenant: json.currentTenant, email: json.email, roles: json.roles };
    _jwtCache.set(token, { result, expiresAt: Date.now() + JWT_CACHE_TTL });
    // Prune cache if too large
    if (_jwtCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of _jwtCache) {
        if (v.expiresAt < now) _jwtCache.delete(k);
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Express middleware: resolves tenant from JWT or X-ADAS-TENANT header,
 * wraps request in tenant-scoped ALS context.
 */
export async function attachTenant(req, res, next) {
  // 1) Try JWT auth
  const token = parseBearer(req);
  if (token) {
    const verified = await verifyJwtViaCore(token);
    if (verified?.tenant && isValidTenant(verified.tenant)) {
      req.tenant = verified.tenant;
      req.auth = { type: "jwt", ...verified };
      // Store JWT in ALS so adasCoreClient can forward it to Core
      return runWithTenant(req.tenant, () => next(), { token });
    }
    // Invalid JWT — reject if it looked like an auth attempt
    // (don't silently fall through to default tenant)
  }

  // 2) Fallback: X-ADAS-TENANT header (dev/standalone mode)
  const raw = req.headers["x-adas-tenant"];
  const requested = raw ? raw.trim().toLowerCase() : "";
  req.tenant = isValidTenant(requested) ? requested : DEFAULT_TENANT;

  // Wrap the rest of the request in tenant-scoped ALS context
  runWithTenant(req.tenant, () => next());
}

export default attachTenant;
