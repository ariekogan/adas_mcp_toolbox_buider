/**
 * gitSync — write-coupling between Builder FS, GitHub, and the read-back
 * boot sync. F3 plan PR-3 (with the loose-by-default safety profile from
 * the post-revert design — see /Users/arie/.claude/plans/peaceful-dazzling-dijkstra.md).
 *
 * Goal: every solutionsStore.save() / skillsStore.save() also pushes the
 * same content to GitHub in the same logical operation, so FS and GH cannot
 * silently drift. If the GH push fails, the FS write still happens (loose
 * mode) — boot sync (gitSyncBootstrap.js) reconciles on next backend start.
 *
 * Mode (env GITSYNC_MODE):
 *   loose  (default) — best-effort GH push. On failure, log + fall back to
 *                      FS-only. Boot sync reconciles later. Safe for prod —
 *                      no operation breaks because of a GH hiccup.
 *   strict          — every write must succeed on GH. Failures throw.
 *                      Use only after a few weeks of loose-mode observation
 *                      shows GH push is reliable in your deployment.
 *   off             — never call GH. Identical to GITHUB_ENABLED=false.
 *                      Useful for offline dev or known-broken GH outages.
 *
 * When github.isEnabled() returns false (no GITHUB_PAT, GITHUB_ENABLED=false),
 * gitSync auto-degrades to FS-only regardless of mode.
 */

import {
  isEnabled as githubEnabled,
  pushFiles,
  repoName,
} from '@adas/skill-validator/src/services/githubService.js';
import { getCurrentTenant, getCurrentTenantOrNull } from '../utils/tenantContext.js';

// ─────────────────────────────────────────────────────────────────────────────

const VALID_MODES = new Set(['strict', 'loose', 'off']);
function resolveMode() {
  const raw = (process.env.GITSYNC_MODE || 'loose').toLowerCase();
  return VALID_MODES.has(raw) ? raw : 'loose';
}

function shouldPush() {
  if (resolveMode() === 'off') return false;
  if (!githubEnabled()) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Push a single file (path + content) to the tenant's solution repo, then
 * run the FS write. Errors from the GH push are handled per-mode.
 *
 * @param {string} solutionId
 * @param {string} repoPath          repo-relative path (e.g. "solution.json")
 * @param {string} content           serialized content
 * @param {string} commitMessage
 * @param {() => Promise<void>} fsWrite  the FS-side write (always runs in loose mode)
 * @returns {Promise<{ok: true, commit_sha?: string, ghWarning?: string, fsOk: boolean}>}
 */
async function pushAndWrite(solutionId, repoPath, content, commitMessage, fsWrite) {
  if (!shouldPush()) {
    // GH disabled / mode off — FS only
    await fsWrite();
    return { ok: true, fsOk: true, gh: 'skipped' };
  }

  const tenant = getCurrentTenant();
  const mode = resolveMode();
  let commitSha = null;
  let ghError = null;

  try {
    const r = await pushFiles(tenant, solutionId, [{ path: repoPath, content }], commitMessage);
    commitSha = r?.commit_sha;
  } catch (err) {
    ghError = err.message;
    if (mode === 'strict') {
      // Strict: GH must succeed. Throw — caller decides what to do.
      throw new Error(`gitSync: GitHub push failed for ${repoName(tenant, solutionId)}/${repoPath}: ${err.message}`);
    }
    // Loose: log and fall through to FS write.
    console.warn(`[gitSync] ${repoName(tenant, solutionId)}/${repoPath} GH push failed (loose mode, FS write proceeds): ${err.message}`);
  }

  // FS write always happens in loose / off / disabled modes. In strict mode
  // we already threw on GH failure; success path falls through here too.
  let fsError = null;
  try {
    await fsWrite();
  } catch (err) {
    fsError = err.message;
    console.error(`[gitSync] CRITICAL: FS write failed AFTER GH ${commitSha ? 'success' : 'attempt'} for ${tenant}/${solutionId}/${repoPath}: ${err.message}`);
    // Don't rethrow — FS failure with GH success is recoverable via boot sync.
  }

  return {
    ok: true,
    fsOk: !fsError,
    ...(commitSha && { commit_sha: commitSha }),
    ...(ghError && { ghWarning: ghError }),
    ...(fsError && { fsWarning: fsError }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a solution to FS + push solution.json to GH. Use as a wrapper around
 * the existing solutionsStore.save() FS logic.
 *
 * @param {Object} solution    must have { id, ... }
 * @param {Object} opts
 * @param {() => Promise<void>} opts.fsWrite  the existing FS-side write
 */
export async function saveSolutionWithSync(solution, { fsWrite } = {}) {
  if (!solution?.id) throw new Error('gitSync.saveSolutionWithSync: solution.id required');
  return await pushAndWrite(
    solution.id,
    'solution.json',
    JSON.stringify(solution, null, 2),
    `update solution.json (${solution.id})`,
    fsWrite,
  );
}

/**
 * Save a skill to FS + push skills/<id>/skill.json to GH. The skill must
 * carry solution_id (so we know which repo to push to). If it doesn't,
 * fall back to FS-only with a warning.
 *
 * @param {Object} skill          must have { id, solution_id?, ... }
 * @param {Object} opts
 * @param {() => Promise<void>} opts.fsWrite
 * @param {string} [opts.solutionId]   override (for stores that have it externally)
 */
export async function saveSkillWithSync(skill, { fsWrite, solutionId } = {}) {
  if (!skill?.id) throw new Error('gitSync.saveSkillWithSync: skill.id required');

  const effectiveSolutionId = solutionId || skill.solution_id;
  if (!effectiveSolutionId) {
    // Without a solution id we can't pick a repo. FS write still happens.
    if (shouldPush()) {
      console.warn(`[gitSync] saveSkillWithSync: skill "${skill.id}" has no solution_id; GH push skipped, FS write proceeds.`);
    }
    if (typeof fsWrite === 'function') await fsWrite();
    return { ok: true, fsOk: true, gh: 'skipped_no_solution_id' };
  }

  return await pushAndWrite(
    effectiveSolutionId,
    `skills/${skill.id}/skill.json`,
    JSON.stringify(skill, null, 2),
    `update skills/${skill.id}/skill.json`,
    fsWrite,
  );
}

/**
 * Public: report current mode + whether GH is reachable. Used by
 * /api/health/gitsync (future) and ad-hoc diagnostic calls.
 */
export function describeGitSyncState() {
  return {
    mode: resolveMode(),
    github_enabled: githubEnabled(),
    will_push: shouldPush(),
    tenant: getCurrentTenantOrNull(),
  };
}

export default {
  saveSolutionWithSync,
  saveSkillWithSync,
  describeGitSyncState,
};
