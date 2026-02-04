// middleware/attachTenant.js
// Multi-tenant middleware for Skill Builder — reads X-ADAS-TENANT header,
// validates against fixed allow-list, and wraps request in ALS context
// so downstream code can resolve tenant-specific paths via getMemoryRoot().

import { runWithTenant } from "../utils/tenantContext.js";

const VALID_TENANTS = ["main", "testing", "dev"];
const DEFAULT_TENANT = (process.env.SB_TENANT || "main").trim().toLowerCase();

/**
 * Express middleware: sets req.tenant from X-ADAS-TENANT header
 * and wraps the rest of the request in tenant-scoped ALS context.
 */
export function attachTenant(req, res, next) {
  const raw = req.headers["x-adas-tenant"];
  const requested = raw ? raw.trim().toLowerCase() : "";
  req.tenant = VALID_TENANTS.includes(requested) ? requested : DEFAULT_TENANT;

  // Wrap the rest of the request in tenant-scoped ALS context
  runWithTenant(req.tenant, () => next());
}

export { VALID_TENANTS, DEFAULT_TENANT };
export default attachTenant;
