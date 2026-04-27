/**
 * Platform Connector Registry — single source of truth for "is X a
 * platform-managed connector?".
 *
 * Platform connectors are MCP services managed at the platform level
 * (`ai-dev-assistant/connectors/<id>/`), shared across all tenants, and
 * NEVER part of solution source code. Solution developers reference them
 * by id from `solution.platform_connectors[]` and `skill.connectors[]`,
 * but never include their source.
 *
 * This module is the authoritative list. Use it from:
 *   - the deploy pipeline (skip platform connectors when pushing source to GitHub)
 *   - the GitHub pull path (skip restoring platform-connector source to Builder FS / Core)
 *   - the validator (skip parsing platform-connector source as if it were user code)
 *   - the spec routes (catalog + recipes for solution developers)
 *
 * Brief #2 — "platform connectors out of repos" — uses this module to
 * filter user-repo content. Migration phases:
 *   A. Deploy pipeline filters platform connectors out of writes (this module)
 *   B. Feature-flag rollout
 *   C. One-shot cleanup script removes sentinel files from existing repos
 *   D. Validator unconditionally skips platform-connector source
 *
 * Adding a new platform connector? Add it to PLATFORM_CONNECTOR_IDS below
 * AND to PLATFORM_CONNECTOR_META in routes/spec.js (keep both in sync).
 */

// Canonical list of connector IDs the platform manages. Keep alphabetized.
const PLATFORM_CONNECTOR_IDS = new Set([
  'browser-mcp',
  'cloud-docs-mcp',
  'docs-index-mcp',
  'gmail-mcp',
  'handoff-controller-mcp',
  'internal-comm-mcp',
  'memory-mcp',
  'mobile-device-mcp',
  'telegram-mcp',
  'whatsapp-mcp',
]);

/** @returns {boolean} true if `id` is a platform-managed connector. */
export function isPlatformConnector(id) {
  if (!id || typeof id !== 'string') return false;
  return PLATFORM_CONNECTOR_IDS.has(id);
}

/** @returns {string[]} all platform-connector ids as a sorted array. */
export function listPlatformConnectorIds() {
  return [...PLATFORM_CONNECTOR_IDS].sort();
}

/**
 * Filter a `connectors/<id>/<file>`-style repo path: returns true if the
 * file belongs to a PLATFORM connector and should be excluded from user-
 * repo writes / reads.
 */
export function isPlatformConnectorRepoPath(repoPath) {
  if (typeof repoPath !== 'string') return false;
  const m = repoPath.match(/^connectors\/([^/]+)\//);
  return m ? isPlatformConnector(m[1]) : false;
}
