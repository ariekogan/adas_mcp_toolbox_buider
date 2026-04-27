#!/usr/bin/env node
/**
 * cleanup-platform-connector-sentinels.mjs
 *
 * Brief #2 Phase C — one-shot cleanup that removes sentinel platform-
 * connector directories from EXISTING user repos.
 *
 * Background: until Phase A (which filters platform connectors at the
 * deploy/pull touchpoints), every solution deploy pushed sentinel files
 * for platform-managed connectors into the user's GitHub repo, e.g.
 *   connectors/browser-mcp/server.js  → "PLATFORM CONNECTOR — managed at..."
 *   connectors/memory-mcp/package.json → { "_note": "PLATFORM CONNECTOR..." }
 * Some of those sentinels were valid JS comments / JSON; some were bare
 * text. The bare-text ones broke the validator and blocked unrelated
 * deploys (today's `Unexpected identifier 'CONNECTOR'` failure).
 *
 * Phase A stops new sentinels from being written. This script removes
 * existing ones from all known user repos.
 *
 * Usage:
 *   # Dry run — list what WOULD be deleted, no changes
 *   node apps/backend/scripts/cleanup-platform-connector-sentinels.mjs
 *
 *   # Apply — actually delete
 *   node apps/backend/scripts/cleanup-platform-connector-sentinels.mjs --apply
 *
 *   # Specific tenants (otherwise scans all)
 *   node apps/backend/scripts/cleanup-platform-connector-sentinels.mjs --apply mobile-pa fleet-managment
 *
 * Environment:
 *   GITHUB_PAT      — required, fine-grained PAT with repo scope
 *   GITHUB_OWNER    — default: ariekogan
 *   ADAS_CORE_URL   — default: http://localhost:4100
 *   CORE_MCP_SECRET — service-to-service shared secret (used to list tenants)
 *
 * Exit codes:
 *   0 — clean run (anything found was either dry-run-listed or applied)
 *   2 — GitHub auth missing
 *   3 — at least one delete failed (non-fatal — others continued)
 */

import {
  isEnabled as githubEnabled,
  listTenantRepos,
  listFiles,
  deleteDirectory,
} from '@adas/skill-validator/src/services/githubService.js';
import { listPlatformConnectorIds } from '@adas/skill-validator/src/services/platformConnectorRegistry.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const tenantsArg = args.filter(a => !a.startsWith('--'));

if (!githubEnabled()) {
  console.error('[cleanup] GitHub integration disabled (GITHUB_PAT missing or GITHUB_ENABLED=false). Aborting.');
  process.exit(2);
}

const PLATFORM_IDS = new Set(listPlatformConnectorIds());

async function listAllTenants() {
  if (tenantsArg.length > 0) return tenantsArg;
  const url = `${process.env.ADAS_CORE_URL || 'http://localhost:4100'}/api/tenants/list`;
  const headers = process.env.CORE_MCP_SECRET ? { 'x-adas-token': process.env.CORE_MCP_SECRET } : {};
  const res = await fetch(url, { headers });
  const json = await res.json();
  if (!json.ok || !Array.isArray(json.tenants)) {
    throw new Error(`Cannot list tenants from ${url}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.tenants.map(t => t.id);
}

async function cleanupRepo(tenant, solutionId) {
  const targets = []; // platform-connector dirs that exist in this repo
  let allFiles;
  try {
    allFiles = await listFiles(tenant, solutionId);
  } catch (err) {
    return { repo: `${tenant}/${solutionId}`, error: `listFiles failed: ${err.message}` };
  }

  // Collect connector ids that have at least one file in the repo
  const seenIds = new Set();
  for (const f of allFiles) {
    const m = f.path.match(/^connectors\/([^/]+)\//);
    if (m && PLATFORM_IDS.has(m[1])) seenIds.add(m[1]);
  }
  for (const id of seenIds) {
    targets.push({ id, dirPath: `connectors/${id}` });
  }

  if (targets.length === 0) {
    return { repo: `${tenant}/${solutionId}`, clean: true };
  }

  if (!apply) {
    return {
      repo: `${tenant}/${solutionId}`,
      dry_run: true,
      would_delete: targets.map(t => t.dirPath),
    };
  }

  // Apply mode — actually delete
  const results = [];
  for (const { id, dirPath } of targets) {
    try {
      const result = await deleteDirectory(tenant, solutionId, dirPath, `[platform-cleanup] remove sentinel platform-connector dir: ${id}`);
      results.push({ dirPath, deleted: result.total_files_deleted });
    } catch (err) {
      results.push({ dirPath, error: err.message });
    }
  }
  return { repo: `${tenant}/${solutionId}`, applied: true, results };
}

(async () => {
  const tenants = await listAllTenants();
  console.log(`[cleanup] mode: ${apply ? 'APPLY (will delete)' : 'DRY RUN (no changes)'}`);
  console.log(`[cleanup] platform connectors to scrub: ${[...PLATFORM_IDS].sort().join(', ')}`);
  console.log(`[cleanup] tenants: ${tenants.join(', ')}`);
  console.log('');

  let okCount = 0;
  let cleanCount = 0;
  let dirtyCount = 0;
  let errCount = 0;

  for (const tenant of tenants) {
    let repos;
    try {
      repos = await listTenantRepos(tenant);
    } catch (err) {
      console.warn(`[cleanup] ${tenant}: listTenantRepos failed: ${err.message}`);
      errCount++;
      continue;
    }
    if (repos.length === 0) {
      console.log(`[cleanup] ${tenant}: no repos`);
      continue;
    }
    for (const { solutionId } of repos) {
      const result = await cleanupRepo(tenant, solutionId);
      if (result.error) {
        console.warn(`[cleanup] ${result.repo}: ERROR — ${result.error}`);
        errCount++;
      } else if (result.clean) {
        console.log(`[cleanup] ${result.repo}: clean (no platform-connector sentinels found)`);
        cleanCount++;
      } else if (result.dry_run) {
        console.log(`[cleanup] ${result.repo}: WOULD DELETE — ${result.would_delete.join(', ')}`);
        dirtyCount++;
      } else if (result.applied) {
        const total = result.results.reduce((sum, r) => sum + (r.deleted || 0), 0);
        const errors = result.results.filter(r => r.error);
        if (errors.length > 0) {
          console.warn(`[cleanup] ${result.repo}: PARTIAL — deleted ${total} file(s), errors: ${errors.map(e => `${e.dirPath}: ${e.error}`).join('; ')}`);
          errCount++;
        } else {
          console.log(`[cleanup] ${result.repo}: DELETED ${total} file(s) across ${result.results.length} platform-connector dir(s)`);
          okCount++;
        }
      }
    }
  }

  console.log('');
  console.log(`[cleanup] Summary: ${apply ? `${okCount} repo(s) cleaned` : `${dirtyCount} repo(s) need cleanup`}, ${cleanCount} already clean, ${errCount} error(s)`);
  if (!apply && dirtyCount > 0) {
    console.log('[cleanup] Re-run with --apply to actually delete the listed paths.');
  }
  process.exit(errCount > 0 ? 3 : 0);
})().catch(err => {
  console.error('[cleanup] FATAL:', err.message);
  process.exit(1);
});
