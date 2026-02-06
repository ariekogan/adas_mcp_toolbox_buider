#!/usr/bin/env node
/**
 * Migration Script: Move skills under their owning solutions
 *
 * Old structure:
 *   /memory/<tenant>/skill_<id>/skill.json
 *   /memory/<tenant>/solutions/<solutionId>/solution.json (with skills[] array)
 *
 * New structure:
 *   /memory/<tenant>/solutions/<solutionId>/skills/<skillId>/skill.json
 *   /memory/<tenant>/solutions/<solutionId>/solution.json (no skills[] array)
 *
 * This script:
 * 1. Finds all existing skills in the old location
 * 2. For each skill, finds its owning solution (from solution.skills[] refs)
 * 3. Moves the skill to the new location under the solution
 * 4. Removes the skills[] array from solution.json
 * 5. Cleans up the old skill directories
 *
 * Run with: node scripts/migrate-skills-to-solutions.js [tenant]
 * Default tenant: 'main'
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, '..', '..', '..', 'memory');
const TENANT = process.argv[2] || 'main';

console.log(`\n=== Migration: Skills to Solutions ===`);
console.log(`Tenant: ${TENANT}`);
console.log(`Data root: ${DATA_ROOT}`);
console.log('');

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function main() {
  const tenantDir = path.join(DATA_ROOT, TENANT);

  // Check if tenant directory exists
  if (!await fileExists(tenantDir)) {
    console.log(`No data directory for tenant '${TENANT}'. Nothing to migrate.`);
    return;
  }

  // Step 1: Find all old-style skills (skill_* directories in tenant root)
  const entries = await fs.readdir(tenantDir, { withFileTypes: true });
  const oldSkillDirs = entries
    .filter(e => e.isDirectory() && e.name.startsWith('skill_'))
    .map(e => e.name);

  if (oldSkillDirs.length === 0) {
    console.log('No old-style skills found. Migration may already be complete.');
    return;
  }

  console.log(`Found ${oldSkillDirs.length} old-style skill(s) to migrate:\n`);

  // Step 2: Load all solutions and build a mapping from skill ID to solution ID
  const solutionsDir = path.join(tenantDir, 'solutions');
  const skillToSolution = new Map();
  const solutions = [];

  if (await fileExists(solutionsDir)) {
    const solEntries = await fs.readdir(solutionsDir, { withFileTypes: true });
    for (const entry of solEntries) {
      if (!entry.isDirectory()) continue;

      const solutionPath = path.join(solutionsDir, entry.name, 'solution.json');
      if (!await fileExists(solutionPath)) continue;

      try {
        const solution = await readJson(solutionPath);
        solutions.push({ id: solution.id, path: solutionPath, data: solution });

        // Map skills from solution.skills[] array
        if (Array.isArray(solution.skills)) {
          for (const skillRef of solution.skills) {
            // skillRef could be a string ID or an object with id property
            const skillId = typeof skillRef === 'string' ? skillRef : skillRef?.id;
            if (skillId) {
              skillToSolution.set(skillId, solution.id);
            }
          }
        }
      } catch (err) {
        console.warn(`  Warning: Could not read solution ${entry.name}: ${err.message}`);
      }
    }
  }

  console.log(`Found ${solutions.length} solution(s) with skill references\n`);

  // Step 3: Migrate each skill
  let migratedCount = 0;
  let orphanedCount = 0;
  const orphanedSkills = [];

  for (const skillDirName of oldSkillDirs) {
    const skillId = skillDirName; // e.g., "skill_abc123"
    const oldSkillDir = path.join(tenantDir, skillDirName);
    const oldSkillPath = path.join(oldSkillDir, 'skill.json');

    if (!await fileExists(oldSkillPath)) {
      console.log(`  Skipping ${skillId}: no skill.json found`);
      continue;
    }

    const skill = await readJson(oldSkillPath);
    const solutionId = skillToSolution.get(skillId);

    if (!solutionId) {
      console.log(`  [ORPHAN] ${skillId} (${skill.name || 'unnamed'}) - no solution owns this skill`);
      orphanedSkills.push({ id: skillId, name: skill.name, dir: oldSkillDir });
      orphanedCount++;
      continue;
    }

    // Create new skill directory under solution
    const newSkillDir = path.join(solutionsDir, solutionId, 'skills', skillId);
    const newSkillPath = path.join(newSkillDir, 'skill.json');

    // Check if already migrated
    if (await fileExists(newSkillPath)) {
      console.log(`  [SKIP] ${skillId} (${skill.name || 'unnamed'}) - already exists in ${solutionId}`);
      continue;
    }

    // Migrate: copy entire skill directory
    console.log(`  [MIGRATE] ${skillId} (${skill.name || 'unnamed'}) -> ${solutionId}`);
    await ensureDir(newSkillDir);

    // Copy all files from old skill dir to new skill dir
    const skillFiles = await fs.readdir(oldSkillDir, { withFileTypes: true });
    for (const file of skillFiles) {
      const oldPath = path.join(oldSkillDir, file.name);
      const newPath = path.join(newSkillDir, file.name);

      if (file.isDirectory()) {
        // Copy directory recursively
        await fs.cp(oldPath, newPath, { recursive: true });
      } else {
        await fs.copyFile(oldPath, newPath);
      }
    }

    migratedCount++;
  }

  // Step 4: Remove skills[] array from solution.json files
  console.log('\n--- Updating solution.json files ---\n');
  for (const sol of solutions) {
    if (Array.isArray(sol.data.skills) && sol.data.skills.length > 0) {
      console.log(`  Removing skills[] from ${sol.id} (had ${sol.data.skills.length} refs)`);
      delete sol.data.skills;
      sol.data.updated_at = new Date().toISOString();
      await writeJson(sol.path, sol.data);
    }
  }

  // Step 5: Clean up old skill directories (optional - ask first)
  console.log('\n--- Migration Summary ---\n');
  console.log(`  Migrated: ${migratedCount} skill(s)`);
  console.log(`  Orphaned: ${orphanedCount} skill(s)`);

  if (orphanedSkills.length > 0) {
    console.log('\n  Orphaned skills (not linked to any solution):');
    for (const s of orphanedSkills) {
      console.log(`    - ${s.id}: ${s.name || 'unnamed'}`);
    }
    console.log('\n  These skills were not migrated. You may want to:');
    console.log('    1. Create a solution and link them manually');
    console.log('    2. Or delete them if they are no longer needed');
  }

  if (migratedCount > 0) {
    console.log('\n  Old skill directories can be removed with:');
    console.log('    (After verifying migration was successful)\n');
    for (const skillDirName of oldSkillDirs) {
      if (!orphanedSkills.find(s => s.id === skillDirName)) {
        console.log(`    rm -rf "${path.join(tenantDir, skillDirName)}"`);
      }
    }
  }

  console.log('\n=== Migration Complete ===\n');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
