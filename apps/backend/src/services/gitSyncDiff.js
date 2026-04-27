/**
 * gitSyncDiff — pure diff/path helpers shared by gitSyncBootstrap (boot-time
 * read-write reconcile) and gitSync (runtime read-only consistency check used
 * by the pre-deploy guard, F3 PR-5).
 *
 * No I/O state. No side effects beyond filesystem reads / writes that the
 * caller explicitly opts into (writeFileAtomic). Callers that resolve FS paths
 * still need an active tenant ALS context because resolveFsTarget calls
 * getMemoryRoot().
 */

import fsp from 'node:fs/promises';
import path from 'node:path';

import { getMemoryRoot } from '../utils/tenantContext.js';

// ─────────────────────────────────────────────────────────────────────────────
// JSON canonicalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fields whose values are local-write-time bookkeeping rather than
 * authoritative content. They get bumped on every save (e.g. by intent
 * enrichment running after a deploy, or by the post-deploy phase update).
 * If two saves happen on FS but only one pushes to GH, the FS file ends up
 * with a slightly newer `updated_at` while every other byte matches. That
 * was producing false-positive drift on mobile-pa: 7 skills flagged
 * content_differs even though the post-push state was byte-identical aside
 * from a 30s difference in `updated_at`.
 *
 * We strip these fields before comparison so verifyConsistency only fires
 * on REAL content drift (a tool was added/removed, intents changed, etc.),
 * not on benign timestamp churn.
 */
const EPHEMERAL_FIELDS = new Set([
  'updated_at',
  'last_modified_at',
  'last_save_at',
  'deployedAt',     // bumped by exportDeploy when a skill ships to Core
  'lastExportedAt', // bumped by the export-bundle build step
  'lastDeployedAt',
  'lastValidatedAt',
]);

/**
 * Re-serialize JSON content with stable formatting and ephemeral fields
 * stripped so whitespace / key-order / timestamp drift doesn't trigger
 * false-positive content differences.
 * Non-JSON inputs are returned unchanged.
 */
export function canonicalizeJson(str) {
  try {
    return JSON.stringify(stripEphemeral(JSON.parse(str)), null, 2);
  } catch {
    return str;
  }
}

function stripEphemeral(value) {
  if (Array.isArray(value)) return value.map(stripEphemeral);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (EPHEMERAL_FIELDS.has(k)) continue;
      out[k] = stripEphemeral(v);
    }
    return out;
  }
  return value;
}

/** Byte-identical comparison after optional JSON canonicalization. */
export function contentMatches(a, b, isJson) {
  if (isJson) return canonicalizeJson(a) === canonicalizeJson(b);
  return a === b;
}

/** ISO date string → epoch ms, or null on parse failure. */
export function parseIsoOrNull(s) {
  if (!s || typeof s !== 'string') return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo-path → FS-path resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the target absolute path on Builder FS for a repo-relative path,
 * or return null if we don't sync this path (README, .ateam/, etc.).
 *
 * Repo layout → Builder FS layout:
 *   solution.json                → <memoryRoot>/solutions/<solId>/solution.json
 *   skills/<slug>/skill.json     → <memoryRoot>/<slug>/skill.json
 *   connectors/<id>/<file>       → <memoryRoot>/solution-packs/<solName>/mcp-store/<id>/<file>
 *
 * Returns an array because in theory a repo path could fan out to multiple
 * FS targets — today there's exactly one per match.
 */
export function resolveFsTarget(repoPath, solutionId, solutionName) {
  if (repoPath === 'solution.json') {
    return [path.join(getMemoryRoot(), 'solutions', solutionId, 'solution.json')];
  }
  const skillMatch = repoPath.match(/^skills\/([^/]+)\/skill\.json$/);
  if (skillMatch) {
    const slug = skillMatch[1];
    return [path.join(getMemoryRoot(), slug, 'skill.json')];
  }
  const connMatch = repoPath.match(/^connectors\/([^/]+)\/(.+)$/);
  if (connMatch) {
    const [, connId, rel] = connMatch;
    const packName = solutionName || solutionId;
    return [path.join(getMemoryRoot(), 'solution-packs', packName, 'mcp-store', connId, rel)];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read FS file → utf-8 string, or null when absent. */
export async function readFsIfExists(absPath) {
  try {
    return await fsp.readFile(absPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Atomic file write (tmp + rename), mkdir -p the parent. */
export async function writeFileAtomic(absPath, content) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${Date.now()}`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, absPath);
}
