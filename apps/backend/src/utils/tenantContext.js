// utils/tenantContext.js
// Tenant-scoped request context using AsyncLocalStorage.
//
// Provides getMemoryRoot() that resolves /tenants/<tenant>/_builder at runtime,
// allowing a single container to serve multiple tenants via X-ADAS-TENANT header.
// The _builder subdirectory keeps Skill Builder data isolated from ADAS Core
// runtime data while sharing the same tenant filesystem mount.
//
// Tenant list fetched dynamically from ADAS Core API with 60s TTL cache.
// Backward compat: If MEMORY_PATH env is set (old single-tenant mode),
// getMemoryRoot() returns that value directly, ignoring tenant context.

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

const als = new AsyncLocalStorage();

const TENANTS_ROOT = process.env.TENANTS_ROOT || path.join(process.cwd(), "data", "tenants");
const DEFAULT_TENANT = "main";
const ADAS_CORE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || "http://ai-dev-assistant-backend-1:4000";
const CACHE_TTL = 60_000; // 60s

// ── Dynamic tenant cache (replaces hardcoded VALID_TENANTS) ──
let _cachedTenantIds = ["main"]; // safe boot default
let _cacheTime = 0;

/**
 * Check if a tenant ID is valid (exists and active).
 */
export function isValidTenant(id) {
  return _cachedTenantIds.includes(id);
}

/**
 * Get the current list of valid tenant IDs.
 */
export function getValidTenants() {
  return [..._cachedTenantIds];
}

/**
 * Refresh the tenant cache from ADAS Core API.
 * Called at startup and periodically.
 */
export async function refreshTenantCache() {
  try {
    const res = await fetch(`${ADAS_CORE_URL}/api/tenants/list`);
    const json = await res.json();
    if (json.ok && Array.isArray(json.tenants)) {
      _cachedTenantIds = json.tenants.map(t => t.id);
      _cacheTime = Date.now();
      console.log(`[tenantContext] Loaded ${_cachedTenantIds.length} tenants from ADAS Core`);
    }
  } catch (err) {
    console.warn(`[tenantContext] Failed to fetch tenants from ADAS Core: ${err.message} (using cached: ${_cachedTenantIds.join(",")})`);
  }
  return _cachedTenantIds;
}

// Start periodic refresh
refreshTenantCache();
setInterval(refreshTenantCache, CACHE_TTL);

/**
 * Run a function within a tenant context.
 * Called by attachTenant middleware to wrap each request.
 * Optionally stores a JWT token for downstream use (e.g. adasCoreClient).
 */
export function runWithTenant(tenant, fn, { token } = {}) {
  const safe = isValidTenant(tenant) ? tenant : DEFAULT_TENANT;
  return als.run({ tenant: safe, token: token || null }, fn);
}

/**
 * Get the current tenant from ALS context.
 * Falls back to DEFAULT_TENANT for background tasks / module-level init.
 */
export function getCurrentTenant() {
  return als.getStore()?.tenant || DEFAULT_TENANT;
}

/**
 * Get the JWT token from ALS context (if present).
 * Used by adasCoreClient to forward auth to ADAS Core.
 */
export function getCurrentToken() {
  return als.getStore()?.token || null;
}

// Subdirectory within each tenant's filesystem where Skill Builder stores its data.
// This keeps Builder data isolated from ADAS Core runtime data.
const BUILDER_SUBDIR = "_builder";

/**
 * Get the memory root path for the current (or specified) tenant.
 * Resolves to: /tenants/{tenant}/_builder/
 *
 * Backward compat: If MEMORY_PATH env is set, returns that directly.
 */
export function getMemoryRoot(tenantOverride) {
  // Backward compat: old single-tenant mode
  if (process.env.MEMORY_PATH) {
    return process.env.MEMORY_PATH;
  }
  const tenant = tenantOverride || getCurrentTenant();
  return path.join(TENANTS_ROOT, tenant, BUILDER_SUBDIR);
}

/**
 * Get the raw tenant root (without _builder suffix).
 * Used when accessing shared tenant-level files (e.g., mcp-store).
 */
export function getTenantRoot(tenantOverride) {
  if (process.env.MEMORY_PATH) {
    return process.env.MEMORY_PATH;
  }
  const tenant = tenantOverride || getCurrentTenant();
  return path.join(TENANTS_ROOT, tenant);
}

// Backward compat: VALID_TENANTS exported as dynamic proxy
export const VALID_TENANTS = new Proxy([], {
  get(target, prop) {
    if (prop === "includes") return (id) => isValidTenant(id);
    if (prop === Symbol.iterator) return () => _cachedTenantIds[Symbol.iterator]();
    if (prop === "length") return _cachedTenantIds.length;
    if (typeof prop === "string" && !isNaN(prop)) return _cachedTenantIds[Number(prop)];
    if (prop === "join") return (sep) => _cachedTenantIds.join(sep);
    if (prop === "map") return (fn) => _cachedTenantIds.map(fn);
    if (prop === "filter") return (fn) => _cachedTenantIds.filter(fn);
    if (prop === "forEach") return (fn) => _cachedTenantIds.forEach(fn);
    return Reflect.get(_cachedTenantIds, prop);
  },
});

export { DEFAULT_TENANT, TENANTS_ROOT };
