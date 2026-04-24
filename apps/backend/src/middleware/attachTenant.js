// middleware/attachTenant.js
// Multi-tenant middleware for Skill Builder — resolves tenant from:
// 1) JWT (Authorization: Bearer <JWT>) — verified via ADAS Core /api/auth/me
// 2) PAT (Authorization: Bearer <PAT>) — verified via ADAS Core /api/auth/verify-pat
// In dev mode only: X-ADAS-TENANT header fallback (when SB_AUTH_SKIP=true or NODE_ENV=development)
// Then wraps request in ALS context for tenant-scoped path resolution.

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { runWithTenant, isValidTenant, DEFAULT_TENANT, TENANTS_ROOT, refreshTenantCache } from "../utils/tenantContext.js";
import { parseApiKey } from "../store/agentApiKeyStore.js";

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

  // 3) Try X-API-KEY auth (tenant-embedded ADAS API key)
  const apiKey = req.headers["x-api-key"];
  if (apiKey) {
    const parsed = parseApiKey(apiKey);
    if (parsed.isValid && parsed.tenant) {
      if (!isValidTenant(parsed.tenant)) await refreshTenantCache();
      if (isValidTenant(parsed.tenant)) {
        // Read stored key directly (can't use agentApiKeyStore — ALS not set yet)
        const keysPath = path.join(TENANTS_ROOT, parsed.tenant, "_agent-api", "keys.json");
        try {
          const data = JSON.parse(await fs.readFile(keysPath, "utf-8"));
          const stored = data.apiKey;
          if (stored && stored.length === apiKey.length) {
            const match = crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(apiKey));
            if (match) {
              req.tenant = parsed.tenant;
              req.auth = { type: "api-key", tenant: parsed.tenant };
              req.headers["x-adas-tenant"] = parsed.tenant;
              // Store API key in ALS so adasCoreClient can forward it to Core
              return runWithTenant(req.tenant, () => next(), { token: apiKey });
            }
          }
        } catch {
          // keys.json not found or unreadable — skip API key auth
        }
      }
    }
  }

  // 4) Try shared-secret auth (x-adas-token header — used by master key / cross-tenant ops)
  const sharedToken = req.headers["x-adas-token"];
  if (sharedToken && CORE_MCP_SECRET && sharedToken.length === CORE_MCP_SECRET.length) {
    const match = crypto.timingSafeEqual(Buffer.from(sharedToken), Buffer.from(CORE_MCP_SECRET));
    if (match) {
      const requestedTenant = (req.headers["x-adas-tenant"] || "").trim().toLowerCase();
      if (!requestedTenant) {
        return res.status(400).json({ error: "x-adas-token requires X-ADAS-TENANT header" });
      }
      if (!isValidTenant(requestedTenant)) await refreshTenantCache();
      if (isValidTenant(requestedTenant)) {
        req.tenant = requestedTenant;
        req.auth = { type: "master", tenant: requestedTenant };
        return runWithTenant(req.tenant, () => next());
      }
    }
  }

  // No valid JWT/PAT/API-key/master auth.
  //
  // Before round 015: dev-mode (NODE_ENV=development or SB_AUTH_SKIP=true)
  // let unauthenticated callers pick any tenant via X-ADAS-TENANT header. The
  // production downstream auth guard in server.js blocked protected routes, so
  // no data was leaked — but the path existed and could be turned on via env.
  //
  // Round 015: removed entirely. Unauthenticated requests always fall through
  // to DEFAULT_TENANT with req.auth unset (blocked by the auth guard). If a
  // standalone dev environment truly needs no auth, mint a PAT for the dev
  // tenant and use that — no environment-driven bypass is permitted.
  req.tenant = DEFAULT_TENANT;
  return runWithTenant(req.tenant, () => next());
}

export default attachTenant;
