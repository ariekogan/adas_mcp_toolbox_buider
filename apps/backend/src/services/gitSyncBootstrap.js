/**
 * gitSyncBootstrap — startup reconciliation of Builder FS against GitHub.
 *
 * ARCHITECTURE (F3): GitHub is the authoritative store for solution + skill +
 * connector source. Builder FS is a derived local cache. On boot we walk every
 * tenant's repos, diff against local FS, and reconcile per the table in
 * /Users/arie/.claude/plans/peaceful-dazzling-dijkstra.md:
 *
 *   FS missing, GH exists          → write FS from GH (restore)
 *   FS == GH                        → skip
 *   FS differs, FS older than GH   → overwrite FS with GH (GH is newer)
 *   FS differs, FS newer than GH   → log drift, flag, DO NOT touch FS
 *   FS exists, GH missing           → log drift, DO NOT auto-delete
 *
 * Timestamp comparison: solution.json and skill.json both carry `updated_at`.
 * When both files have a parseable `updated_at`, that is the source of truth.
 * Fallback for files without timestamps (connector source): always prefer GH.
 *
 * This is read-only toward GitHub. Writes only ever land in Builder FS.
 * GitHub-disabled mode: skip entirely with a single log line.
 *
 * Failure isolation: each tenant / repo is independent. A crash on one never
 * blocks the rest or prevents server startup.
 *
 * State: per-process Map of tenant → array of drift records; also written to
 * /tmp/gitsync-drift-<tenant>.json so operators can inspect via docker exec.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  isEnabled as githubEnabled,
  listTenantRepos,
  listFiles,
  readFile as githubReadFile,
  repoName,
} from '@adas/skill-validator/src/services/githubService.js';

import { getValidTenants, runWithTenant, getMemoryRoot } from '../utils/tenantContext.js';
import {
  contentMatches,
  parseIsoOrNull,
  resolveFsTarget,
  readFsIfExists,
  writeFileAtomic,
} from './gitSyncDiff.js';

// In-memory per-tenant drift log, consulted by /api/health etc.
const _driftLog = new Map(); // tenant → { lastSyncAt, summary, drifts: [...] }
const _lastSyncAt = new Map(); // tenant → ISO timestamp

export function getDriftLog() {
  const out = {};
  for (const [tenant, entry] of _driftLog.entries()) out[tenant] = entry;
  return out;
}

export function getLastSyncAt(tenant) {
  return _lastSyncAt.get(tenant) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation primitives — diff helpers live in ./gitSyncDiff.js so the
// pre-deploy guard (gitSync.verifyConsistency) can reuse them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare FS vs GH for a single solution and apply the reconciliation table.
 * Returns { drifts: [...], actions: { restored, overwrote, preservedFs, ghMissing, skipped } }.
 */
async function reconcileSolution(tenant, solutionId) {
  const repo = repoName(tenant, solutionId);
  const log = (level, msg) => console[level](`[GitSync] ${tenant}/${solutionId}: ${msg}`);
  const drifts = [];
  const actions = { restored: 0, overwrote: 0, preservedFs: 0, ghMissing: 0, skipped: 0 };

  // 1. List every file in the GH repo
  let ghFiles;
  try {
    ghFiles = await listFiles(tenant, solutionId);
  } catch (err) {
    log('warn', `listFiles failed (${err.message}); skipping reconciliation`);
    return { drifts: [{ kind: 'repo_unreachable', error: err.message }], actions };
  }

  // 2. Pre-read solution.json from GH so we know the solution.name (used for connector pack dir name)
  let solutionName = null;
  try {
    const solJson = await githubReadFile(tenant, solutionId, 'solution.json');
    const parsed = JSON.parse(solJson.content);
    solutionName = parsed.name || null;
  } catch { /* will be handled as a normal file below */ }

  // 3. Walk each GH file
  for (const gf of ghFiles) {
    const targets = resolveFsTarget(gf.path, solutionId, solutionName);
    if (!targets) {
      actions.skipped++;
      continue;
    }

    let ghContent;
    try {
      const data = await githubReadFile(tenant, solutionId, gf.path);
      ghContent = data.content;
    } catch (err) {
      log('warn', `read ${gf.path} failed: ${err.message}`);
      drifts.push({ path: gf.path, kind: 'gh_read_error', error: err.message });
      continue;
    }

    const isJson = gf.path.endsWith('.json');
    let ghUpdatedAt = null;
    if (isJson) {
      try { ghUpdatedAt = parseIsoOrNull(JSON.parse(ghContent).updated_at); } catch { /* non-JSON or missing field */ }
    }

    for (const fsTarget of targets) {
      const fsContent = await readFsIfExists(fsTarget);

      // Case A: FS missing → restore
      if (fsContent === null) {
        await writeFileAtomic(fsTarget, ghContent);
        actions.restored++;
        drifts.push({ path: gf.path, fsTarget, kind: 'fs_missing_restored' });
        log('log', `restored ${gf.path} → ${fsTarget}`);
        continue;
      }

      // Case B: identical → skip
      if (contentMatches(fsContent, ghContent, isJson)) {
        actions.skipped++;
        continue;
      }

      // Case C: differ — decide by timestamp
      let fsUpdatedAt = null;
      if (isJson) {
        try { fsUpdatedAt = parseIsoOrNull(JSON.parse(fsContent).updated_at); } catch { /* ignore */ }
      }

      // C1: Both have timestamps — compare
      if (fsUpdatedAt != null && ghUpdatedAt != null) {
        if (fsUpdatedAt > ghUpdatedAt) {
          // FS is newer than GH — someone edited Builder FS without pushing. Preserve.
          actions.preservedFs++;
          drifts.push({
            path: gf.path,
            fsTarget,
            kind: 'fs_newer_preserved',
            fs_updated_at: new Date(fsUpdatedAt).toISOString(),
            gh_updated_at: new Date(ghUpdatedAt).toISOString(),
          });
          log('warn', `FS newer than GH for ${gf.path} — preserving FS (pending push?)`);
          continue;
        }
        // FS older or equal timestamp but different content → GH wins
        await writeFileAtomic(fsTarget, ghContent);
        actions.overwrote++;
        drifts.push({ path: gf.path, fsTarget, kind: 'fs_older_overwrote' });
        log('log', `overwrote ${fsTarget} (GH is newer)`);
        continue;
      }

      // C2: No reliable timestamps (connector source, missing updated_at) — GH wins
      await writeFileAtomic(fsTarget, ghContent);
      actions.overwrote++;
      drifts.push({ path: gf.path, fsTarget, kind: 'differs_no_ts_overwrote' });
      log('log', `overwrote ${fsTarget} (no timestamp; GH authoritative)`);
    }
  }

  // 4. Detect FS-only files for this solution (for solution.json and each slug from linked_skills)
  //    We do not auto-delete; we only log.
  try {
    const solAbs = path.join(getMemoryRoot(), 'solutions', solutionId, 'solution.json');
    const solContent = await readFsIfExists(solAbs);
    if (solContent) {
      const sol = JSON.parse(solContent);
      // linked_skills can contain mixed types in the wild — pure slug strings
      // and partial-object entries like {id, description, ...}. Normalize.
      const linked = Array.isArray(sol.linked_skills)
        ? sol.linked_skills
            .map(s => (typeof s === 'string' ? s : s?.id))
            .filter(s => typeof s === 'string' && s.length > 0)
        : [];
      const ghSkillSlugs = new Set(
        ghFiles
          .map(f => f.path.match(/^skills\/([^/]+)\/skill\.json$/))
          .filter(Boolean)
          .map(m => m[1])
      );
      for (const slug of linked) {
        if (!ghSkillSlugs.has(slug)) {
          drifts.push({ path: `skills/${slug}/skill.json`, kind: 'gh_missing_fs_has' });
          actions.ghMissing++;
          log('warn', `FS has skill "${slug}" but GH does not; preserving FS (manual review)`);
        }
      }
    }
  } catch (err) {
    log('warn', `FS-only detection failed: ${err.message}`);
  }

  return { drifts, actions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

async function syncOneTenant(tenant, { log }) {
  let repos;
  try {
    repos = await listTenantRepos(tenant);
  } catch (err) {
    log.warn(`[GitSync] listTenantRepos(${tenant}) failed: ${err.message}`);
    return { ok: false, error: err.message };
  }

  if (repos.length === 0) {
    log.info(`[GitSync] ${tenant}: no repos found (new tenant or non-Builder tenant)`);
    return { ok: true, repos: 0 };
  }

  const tenantSummary = { repos: repos.length, actions: {}, drifts: [] };
  for (const { solutionId } of repos) {
    try {
      const { drifts, actions } = await reconcileSolution(tenant, solutionId);
      tenantSummary.drifts.push({ solutionId, drifts });
      for (const [k, v] of Object.entries(actions)) {
        tenantSummary.actions[k] = (tenantSummary.actions[k] || 0) + v;
      }
      log.info(
        `[GitSync] ${tenant}/${solutionId}: ` +
          `restored=${actions.restored} overwrote=${actions.overwrote} ` +
          `preservedFs=${actions.preservedFs} ghMissing=${actions.ghMissing} skipped=${actions.skipped}`
      );
    } catch (err) {
      log.error(`[GitSync] reconcileSolution(${tenant}/${solutionId}) crashed: ${err.message}`);
      tenantSummary.drifts.push({ solutionId, error: err.message });
    }
  }

  // Persist drift log: in-memory + best-effort tmp file for inspection
  const summary = { lastSyncAt: new Date().toISOString(), ...tenantSummary };
  _driftLog.set(tenant, summary);
  _lastSyncAt.set(tenant, summary.lastSyncAt);

  if (tenantSummary.drifts.some(d => Array.isArray(d.drifts) && d.drifts.length > 0)) {
    try {
      const tmpPath = path.join(os.tmpdir(), `gitsync-drift-${tenant}.json`);
      await fsp.writeFile(tmpPath, JSON.stringify(summary, null, 2));
      log.info(`[GitSync] ${tenant}: drift details written to ${tmpPath}`);
    } catch (err) {
      log.warn(`[GitSync] could not write drift file: ${err.message}`);
    }
  }

  return { ok: true, ...tenantSummary };
}

/**
 * Entry point. Fire-and-forget safe — exceptions are caught.
 * Does NOT block server startup on failure.
 */
export async function syncAllTenantsFromGitHub({ log = console } = {}) {
  if (!githubEnabled()) {
    log.info('[GitSync] GitHub integration disabled (GITHUB_PAT missing or GITHUB_ENABLED=false); skipping boot sync');
    return { ok: true, skipped: true };
  }

  const tenants = getValidTenants();
  if (!tenants || tenants.length === 0) {
    log.info('[GitSync] No tenants in cache yet; skipping boot sync (will retry on next scheduled run)');
    return { ok: true, skipped: true, reason: 'empty_tenant_cache' };
  }

  log.info(`[GitSync] Starting boot sync for ${tenants.length} tenant(s): ${tenants.join(', ')}`);
  const started = Date.now();

  // Sequential per tenant (keeps logs readable; GitHub rate limit is 5000/hour so fine).
  // Inside a single tenant, reconcileSolution is already sequential.
  for (const tenant of tenants) {
    try {
      await runWithTenant(tenant, () => syncOneTenant(tenant, { log }));
    } catch (err) {
      log.error(`[GitSync] Tenant ${tenant} sync failed: ${err.message}`);
    }
  }

  log.info(`[GitSync] Boot sync finished in ${Date.now() - started}ms`);
  return { ok: true };
}
