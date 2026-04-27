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

import path from 'node:path';

import {
  isEnabled as githubEnabled,
  pushFiles,
  repoName,
  listFiles,
  readFile as githubReadFile,
} from '@adas/skill-validator/src/services/githubService.js';
import {
  getCurrentTenant,
  getCurrentTenantOrNull,
  getMemoryRoot,
} from '../utils/tenantContext.js';
import {
  contentMatches,
  resolveFsTarget,
  readFsIfExists,
} from './gitSyncDiff.js';

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
// Per-repo push serialization
// ─────────────────────────────────────────────────────────────────────────────
//
// When a deploy fans out and saves N skills + 1 solution.json in parallel,
// each save's pushAndWrite races to the same `<tenant>--<solutionId>` repo.
// All N+1 writers read the same HEAD, build commits with the same parent,
// and the ref-update for all but one returns 422 ("Update is not a fast
// forward"). We've fixed githubService.pushFiles to retry on that 422 with
// a fresh HEAD, but each retry costs an extra GH round-trip per loser, and
// under high contention the retries themselves can race. Cheaper to
// serialize at the gitSync layer — one push per repo at a time.
//
// The lock is per `tenant--solutionId`, so different tenants and different
// solutions in the same tenant push concurrently, exactly as before.
//
// Implementation: chained promises. New holders await the current tail,
// then become the new tail. After they release, the next waiter runs.
const _repoLocks = new Map(); // repoName → Promise<void>

async function withRepoLock(tenant, solutionId, fn) {
  const key = repoName(tenant, solutionId);
  const prev = _repoLocks.get(key) || Promise.resolve();
  let release;
  const lock = new Promise(r => { release = r; });
  // Build the new tail ONCE so the identity check below works.
  const myTail = prev.then(() => lock, () => lock);
  _repoLocks.set(key, myTail);
  try {
    await prev;          // wait for the previous holder (ignore its rejection)
    return await fn();
  } finally {
    release();
    // Only clear the map if no later holder chained on top of us.
    if (_repoLocks.get(key) === myTail) {
      _repoLocks.delete(key);
    }
  }
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
    // Per-repo lock — serializes parallel pushes to the same repo so the
    // ref-update step doesn't race. With githubService.pushFiles also
    // retrying on 422, this is belt-and-braces: lock prevents most
    // collisions, retry rescues the unlikely cross-process / cross-pod
    // collision (e.g. ateam_github_patch from an external agent landing
    // mid-deploy). Cost: a single repo's pushes are sequential, but each
    // push is small (~1-3 GH round-trips). Different repos still parallel.
    const r = await withRepoLock(tenant, solutionId, () =>
      pushFiles(tenant, solutionId, [{ path: repoPath, content }], commitMessage)
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// verifyConsistency — read-only drift detector used by the pre-deploy guard
// (F3 PR-5). Walks the GH repo for the given solution, compares each file
// against Builder FS, and returns a list of drifts. Never writes anything.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drift kinds returned by verifyConsistency:
 *   - fs_missing       : file exists in GH but not in FS
 *   - content_differs  : both exist but JSON-canonical content differs
 *   - gh_missing       : skill is referenced in solution.json (linked_skills
 *                        ∪ skills[].id) but no matching skills/<slug>/skill.json
 *                        exists in GH
 *   - gh_read_error    : GitHub Contents API failed for a specific path
 *   - repo_unreachable : listFiles itself failed (network / 404 / auth)
 */

/**
 * Compare Builder FS vs GitHub for a single solution. Returns a small,
 * structured drift report so callers (deploy guard, /api/health) can
 * decide whether to block, warn, or surface to the operator.
 *
 * Performance: ~1 GH list call + N GH file reads + N FS reads per solution
 * (N is typically 5-30 files). GH file reads are not parallelized today —
 * sequential keeps logs readable and stays well inside GitHub's 5000/hour
 * authenticated rate limit.
 *
 * @param {string} solutionId
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string,
 *                     drifts: Array<{ path: string, fsTarget?: string,
 *                                     kind: string, error?: string }> }>}
 */
export async function verifyConsistency(solutionId) {
  if (!solutionId) throw new Error('gitSync.verifyConsistency: solutionId required');

  if (!githubEnabled()) {
    return { ok: true, skipped: true, reason: 'github_disabled', drifts: [] };
  }

  const tenant = getCurrentTenant();
  const drifts = [];

  // 1. Enumerate every file in the GH repo for this solution.
  let ghFiles;
  try {
    ghFiles = await listFiles(tenant, solutionId);
  } catch (err) {
    // 404 = repo doesn't exist yet (initial deploy before first push). There is
    // nothing to be consistent with, so this is "no drift" not "unreachable".
    // The deploy will create the repo as part of the GH push that follows.
    if (err.status === 404) {
      return { ok: true, skipped: true, reason: 'repo_not_created_yet', drifts: [] };
    }
    return {
      ok: false,
      reason: 'repo_unreachable',
      drifts: [{ path: repoName(tenant, solutionId), kind: 'repo_unreachable', error: err.message }],
    };
  }

  // 2. Pre-read solution.json so we know the solution name (used to resolve
  //    connector pack dir on FS). Failure is fine — connector files just
  //    won't resolve, and they'll show up as drift below.
  let solutionName = null;
  try {
    const r = await githubReadFile(tenant, solutionId, 'solution.json');
    solutionName = JSON.parse(r.content).name || null;
  } catch { /* fall through */ }

  // 3. Walk each GH file and check FS counterpart.
  const ghSkillSlugs = new Set();
  for (const gf of ghFiles) {
    const skillMatch = gf.path.match(/^skills\/([^/]+)\/skill\.json$/);
    if (skillMatch) ghSkillSlugs.add(skillMatch[1]);

    const fsTargets = resolveFsTarget(gf.path, solutionId, solutionName);
    if (!fsTargets) continue; // README, .ateam/, metadata — not synced

    let ghContent;
    try {
      const r = await githubReadFile(tenant, solutionId, gf.path);
      ghContent = r.content;
    } catch (err) {
      drifts.push({ path: gf.path, kind: 'gh_read_error', error: err.message });
      continue;
    }

    const isJson = gf.path.endsWith('.json');
    for (const fsTarget of fsTargets) {
      const fsContent = await readFsIfExists(fsTarget);
      if (fsContent === null) {
        drifts.push({ path: gf.path, fsTarget, kind: 'fs_missing' });
        continue;
      }
      if (!contentMatches(fsContent, ghContent, isJson)) {
        drifts.push({ path: gf.path, fsTarget, kind: 'content_differs' });
      }
    }
  }

  // 4. Detect skills the FS knows about (linked_skills ∪ topology) that GH does
  //    not — the inverse drift direction. We never auto-delete; we just report.
  try {
    const solAbs = path.join(getMemoryRoot(), 'solutions', solutionId, 'solution.json');
    const solContent = await readFsIfExists(solAbs);
    if (solContent) {
      const sol = JSON.parse(solContent);
      const linked = Array.isArray(sol.linked_skills) ? sol.linked_skills : [];
      // sol.skills[] can be either string slugs or {id, ...} objects depending
      // on schema version. Pick the id string in either case, drop anything
      // else — without this, an object without .id falls back to the object
      // itself and we end up with "[object Object]" in path strings.
      const fromTopo = Array.isArray(sol.skills)
        ? sol.skills
            .map(s => (typeof s === 'string' ? s : s?.id))
            .filter(s => typeof s === 'string' && s.length > 0)
        : [];
      const allFsSlugs = new Set([...linked.filter(s => typeof s === 'string'), ...fromTopo]);
      for (const slug of allFsSlugs) {
        if (!ghSkillSlugs.has(slug)) {
          drifts.push({ path: `skills/${slug}/skill.json`, kind: 'gh_missing' });
        }
      }
    }
  } catch { /* solution.json missing or unparseable — surfaces above as fs_missing */ }

  return { ok: drifts.length === 0, drifts };
}

export default {
  saveSolutionWithSync,
  saveSkillWithSync,
  describeGitSyncState,
  verifyConsistency,
};
