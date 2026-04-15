#!/usr/bin/env node
/**
 * repair-missing-skill.mjs
 *
 * One-time repair: restore a skill's skill.json to the Builder FS by pulling
 * it from the solution's GitHub repo. Also ensures the skill slug is present
 * in solution.linked_skills so the Builder's skills listing picks it up.
 *
 * Context: the Builder FS (a per-tenant local cache) can drift from the
 * authoritative GitHub repo — a skill may exist in the repo (and on Core)
 * while the FS copy is missing. That breaks any code path that reads from
 * FS, notably `ateam_build_and_run`. This script is the one-shot manual
 * fix; PR-2 (gitSyncBootstrap) is the permanent auto-heal on server start.
 *
 * Idempotent: re-running with the same args is safe. Overwrites local
 * skill.json with the GitHub version (authoritative) and de-duplicates
 * linked_skills.
 *
 * Usage:
 *   node apps/backend/scripts/repair-missing-skill.mjs <tenant> <solutionId> <skillSlug> [slug2 ...]
 *
 * Example:
 *   node apps/backend/scripts/repair-missing-skill.mjs mobile-pa personal-adas linkedin-agent
 *
 * Environment:
 *   GITHUB_PAT        — required; fine-grained PAT with repo scope
 *   GITHUB_OWNER      — GitHub user/org (default: ariekogan)
 *   TENANTS_ROOT      — root of tenant dirs (default: <cwd>/data/tenants)
 *   MEMORY_PATH       — legacy single-tenant override; if set, used directly
 *
 * Exit codes:
 *   0 — all slugs processed successfully
 *   1 — argument error
 *   2 — GitHub auth missing
 *   3 — one or more repairs failed
 */

import fs from 'node:fs';
import path from 'node:path';
import { readFile, repoName, isEnabled } from '@adas/skill-validator/src/services/githubService.js';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node apps/backend/scripts/repair-missing-skill.mjs <tenant> <solutionId> <skillSlug> [slug2 ...]');
  process.exit(1);
}

const [tenant, solutionId, ...slugs] = args;

if (!isEnabled()) {
  console.error('[repair] GitHub integration disabled (GITHUB_PAT missing or GITHUB_ENABLED=false). Aborting.');
  process.exit(2);
}

// Resolve Builder FS root without booting the tenantContext ALS system.
// Mirrors the logic in apps/backend/src/utils/tenantContext.js:getMemoryRoot.
const TENANTS_ROOT = process.env.TENANTS_ROOT || path.join(process.cwd(), 'data', 'tenants');
function memoryRoot() {
  if (process.env.MEMORY_PATH) return process.env.MEMORY_PATH;
  return path.join(TENANTS_ROOT, tenant, '_builder');
}

// Matches writeJson() in apps/backend/src/store/{solutions,skills}.js
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

async function repairSkill(slug) {
  console.log(`[repair] → ${slug}`);

  // 1. Fetch authoritative skill.json from GitHub
  const ghPath = `skills/${slug}/skill.json`;
  let skill;
  try {
    const { content } = await readFile(tenant, solutionId, ghPath);
    skill = JSON.parse(content);
  } catch (err) {
    console.error(`  FAIL: cannot read ${ghPath} from ${repoName(tenant, solutionId)}: ${err.message}`);
    return false;
  }

  if (skill.id && skill.id !== slug) {
    console.warn(`  WARN: skill.id (${skill.id}) != slug (${slug}). Using slug for FS path.`);
  }

  // 2. Write to Builder FS (matches skillsStore.save layout: <memoryRoot>/<slug>/skill.json + exports/)
  const slugDir = path.join(memoryRoot(), slug);
  fs.mkdirSync(slugDir, { recursive: true });
  fs.mkdirSync(path.join(slugDir, 'exports'), { recursive: true });

  const skillJsonPath = path.join(slugDir, 'skill.json');
  const existed = fs.existsSync(skillJsonPath);
  writeJsonAtomic(skillJsonPath, skill);
  console.log(`  ${existed ? 'OVERWROTE' : 'CREATED '} ${skillJsonPath}`);

  // 3. Ensure slug is in solution.linked_skills (Builder FS-only field; drives skills listing)
  const solutionJsonPath = path.join(memoryRoot(), 'solutions', solutionId, 'solution.json');
  if (!fs.existsSync(solutionJsonPath)) {
    console.warn(`  WARN: solution.json missing at ${solutionJsonPath}; skipping linked_skills update.`);
    return true;
  }
  try {
    const solution = JSON.parse(fs.readFileSync(solutionJsonPath, 'utf-8'));
    const linked = Array.isArray(solution.linked_skills) ? [...solution.linked_skills] : [];
    if (!linked.includes(slug)) {
      linked.push(slug);
      solution.linked_skills = linked;
      solution.updated_at = new Date().toISOString();
      writeJsonAtomic(solutionJsonPath, solution);
      console.log(`  UPDATED  solution.linked_skills (+${slug})`);
    } else {
      console.log(`  OK       solution.linked_skills already contains ${slug}`);
    }
  } catch (err) {
    console.warn(`  WARN: failed to update linked_skills: ${err.message}`);
    // skill.json itself was restored, so this is a partial success
    return true;
  }

  return true;
}

(async () => {
  console.log(`[repair] Tenant:     ${tenant}`);
  console.log(`[repair] Solution:   ${solutionId}`);
  console.log(`[repair] Repo:       ${repoName(tenant, solutionId)}`);
  console.log(`[repair] Builder FS: ${memoryRoot()}`);
  console.log(`[repair] Slugs:      ${slugs.join(', ')}`);
  console.log('');

  let ok = 0;
  let failed = 0;
  for (const slug of slugs) {
    const success = await repairSkill(slug);
    if (success) ok++;
    else failed++;
    console.log('');
  }

  console.log(`[repair] Done. OK: ${ok}, Failed: ${failed}`);
  if (failed > 0) process.exit(3);
})();
