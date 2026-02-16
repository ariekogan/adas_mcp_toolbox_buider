#!/usr/bin/env node
/**
 * migrate-skill-ids.js
 *
 * One-time migration: rename skill_<name> directories to <name> (remove skill_ prefix).
 * Also updates skill.json inside each directory to remove the prefix from the `id` field
 * and drops the now-unnecessary `original_skill_id` field.
 *
 * Usage:
 *   node scripts/migrate-skill-ids.js [--dry-run] [--memory-root /path/to/memory]
 *
 * Default memory root: /memory (Docker) or process.env.MEMORY_ROOT
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const memoryRootArg = args.find((_, i) => args[i - 1] === '--memory-root');
const MEMORY_ROOT = memoryRootArg || process.env.MEMORY_ROOT || '/memory';

console.log(`[migrate] Memory root: ${MEMORY_ROOT}`);
console.log(`[migrate] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log('');

// Find all tenant dirs (or use root if no tenants)
let tenantDirs = [];
try {
  const entries = fs.readdirSync(MEMORY_ROOT, { withFileTypes: true });
  // If there are skill_ dirs or solutions/ at root level, treat root as the tenant dir
  const hasSkillDirs = entries.some(e => e.isDirectory() && e.name.startsWith('skill_'));
  const hasSolutions = entries.some(e => e.isDirectory() && e.name === 'solutions');
  if (hasSkillDirs || hasSolutions) {
    tenantDirs = [MEMORY_ROOT];
  } else {
    // Check each subdir for skill_ directories or solutions/ (multi-tenant)
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const subEntries = fs.readdirSync(path.join(MEMORY_ROOT, e.name), { withFileTypes: true });
      const needsMigration = subEntries.some(s => s.isDirectory() && (s.name.startsWith('skill_') || s.name === 'solutions'));
      if (needsMigration) {
        tenantDirs.push(path.join(MEMORY_ROOT, e.name));
      }
    }
  }
} catch (err) {
  console.error(`[migrate] Cannot read memory root: ${err.message}`);
  process.exit(1);
}

if (tenantDirs.length === 0) {
  console.log('[migrate] No tenant directories found. Nothing to migrate.');
  process.exit(0);
}

let migrated = 0;
let skipped = 0;
let errors = 0;

for (const tenantDir of tenantDirs) {
  console.log(`[migrate] Scanning: ${tenantDir}`);
  const entries = fs.readdirSync(tenantDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('skill_')) continue;

    const oldName = entry.name;
    const newName = oldName.replace(/^skill_/, '');
    const oldPath = path.join(tenantDir, oldName);
    const newPath = path.join(tenantDir, newName);

    // Check if target already exists
    if (fs.existsSync(newPath)) {
      console.log(`  SKIP ${oldName} → ${newName} (target already exists)`);
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? 'WOULD RENAME' : 'RENAME'} ${oldName} → ${newName}`);

    if (!dryRun) {
      try {
        // Rename directory
        fs.renameSync(oldPath, newPath);

        // Update skill.json
        const skillJsonPath = path.join(newPath, 'skill.json');
        if (fs.existsSync(skillJsonPath)) {
          const skill = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));

          // Update id to remove prefix
          if (skill.id && skill.id.startsWith('skill_')) {
            skill.id = skill.id.replace(/^skill_/, '');
          }

          // Remove original_skill_id — no longer needed
          delete skill.original_skill_id;

          fs.writeFileSync(skillJsonPath, JSON.stringify(skill, null, 2), 'utf-8');
        }

        migrated++;
      } catch (err) {
        console.error(`  ERROR ${oldName}: ${err.message}`);
        errors++;
      }
    } else {
      migrated++;
    }
  }

  // Also update solution files to clean up remapped cross-references
  // (Phase 3 remap may have written skill_ prefixed IDs into grants/handoffs/routing)
  // Solutions live at: <tenantDir>/solutions/<solutionId>/solution.json
  const stripPrefix = (val) => {
    if (typeof val === 'string' && val.startsWith('skill_')) {
      return val.replace(/^skill_/, '');
    }
    if (Array.isArray(val)) return val.map(stripPrefix);
    if (val && typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = stripPrefix(v);
      return out;
    }
    return val;
  };

  const solutionsDir = path.join(tenantDir, 'solutions');
  if (fs.existsSync(solutionsDir)) {
    const solEntries = fs.readdirSync(solutionsDir, { withFileTypes: true });
    for (const solEntry of solEntries) {
      if (!solEntry.isDirectory()) continue;
      const solutionPath = path.join(solutionsDir, solEntry.name, 'solution.json');
      if (!fs.existsSync(solutionPath)) continue;

      try {
        const content = fs.readFileSync(solutionPath, 'utf-8');
        if (!content.includes('skill_')) continue;

        const solution = JSON.parse(content);
        let changed = false;

        for (const field of ['grants', 'handoffs', 'routing', 'security_contracts', 'linked_skills', 'skills']) {
          if (solution[field]) {
            const cleaned = stripPrefix(solution[field]);
            if (JSON.stringify(cleaned) !== JSON.stringify(solution[field])) {
              solution[field] = cleaned;
              changed = true;
            }
          }
        }

        if (changed) {
          console.log(`  ${dryRun ? 'WOULD UPDATE' : 'UPDATE'} solution: ${solEntry.name}/solution.json`);
          if (!dryRun) {
            fs.writeFileSync(solutionPath, JSON.stringify(solution, null, 2), 'utf-8');
          }
        }
      } catch {
        // Not a valid solution file — skip
      }
    }
  }
}

console.log('');
console.log(`[migrate] Done. Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
if (dryRun) {
  console.log('[migrate] This was a dry run. Run without --dry-run to apply changes.');
}
