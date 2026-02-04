// utils/tenantContext.js
// Tenant-scoped request context using AsyncLocalStorage.
//
// Provides getMemoryRoot() that resolves /tenants/<tenant> at runtime,
// allowing a single container to serve multiple tenants via X-ADAS-TENANT header.
//
// Backward compat: If MEMORY_PATH env is set (old single-tenant mode),
// getMemoryRoot() returns that value directly, ignoring tenant context.

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

const als = new AsyncLocalStorage();

const TENANTS_ROOT = process.env.TENANTS_ROOT || "/tenants";
const DEFAULT_TENANT = "main";
const VALID_TENANTS = ["main", "testing", "dev"];

/**
 * Run a function within a tenant context.
 * Called by attachTenant middleware to wrap each request.
 */
export function runWithTenant(tenant, fn) {
  const safe = VALID_TENANTS.includes(tenant) ? tenant : DEFAULT_TENANT;
  return als.run({ tenant: safe }, fn);
}

/**
 * Get the current tenant from ALS context.
 * Falls back to DEFAULT_TENANT for background tasks / module-level init.
 */
export function getCurrentTenant() {
  return als.getStore()?.tenant || DEFAULT_TENANT;
}

/**
 * Get the memory root path for the current (or specified) tenant.
 *
 * Backward compat: If MEMORY_PATH env is set, returns that directly.
 */
export function getMemoryRoot(tenantOverride) {
  // Backward compat: old single-tenant mode
  if (process.env.MEMORY_PATH) {
    return process.env.MEMORY_PATH;
  }
  const tenant = tenantOverride || getCurrentTenant();
  return path.join(TENANTS_ROOT, tenant);
}

export { VALID_TENANTS, DEFAULT_TENANT, TENANTS_ROOT };
