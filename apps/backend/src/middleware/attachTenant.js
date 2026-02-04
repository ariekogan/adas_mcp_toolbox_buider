// middleware/attachTenant.js
// Lightweight tenant middleware for Skill Builder — reads X-ADAS-TENANT header.
// Validates against fixed allow-list. Default: SB_TENANT env var or "main".

const VALID_TENANTS = ["main", "testing", "dev"];
const DEFAULT_TENANT = (process.env.SB_TENANT || "main").trim().toLowerCase();

/**
 * Express middleware: sets req.tenant from X-ADAS-TENANT header.
 * Falls back to SB_TENANT env var (default: "main").
 */
export function attachTenant(req, res, next) {
  const raw = req.headers["x-adas-tenant"];
  const requested = raw ? raw.trim().toLowerCase() : "";
  req.tenant = VALID_TENANTS.includes(requested) ? requested : DEFAULT_TENANT;
  next();
}

export { VALID_TENANTS, DEFAULT_TENANT };
export default attachTenant;
