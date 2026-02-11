#!/usr/bin/env node

/**
 * CLI for ADAS Skill Validator
 *
 * Usage:
 *   npx @adas/skill-validator ./path/to/skill.json
 *   node packages/skill-validator/bin/validate.js ./memory/main/skills/finance-ops/skill.json
 *
 * Exit codes:
 *   0 — valid (no errors)
 *   1 — validation errors found
 *   2 — file/usage error
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateDraftSkill } from '../src/index.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
ADAS Skill Validator

Usage:
  skill-validator <skill.json> [skill2.json ...]

Options:
  --json     Output raw JSON instead of formatted text
  --help     Show this help
`);
  process.exit(0);
}

const jsonOutput = args.includes('--json');
const files = args.filter(a => !a.startsWith('--'));

let hasErrors = false;

for (const file of files) {
  const filePath = resolve(file);

  let skill;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    skill = JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${file}: ${err.message}`);
    process.exit(2);
  }

  const result = validateDraftSkill(skill);

  if (jsonOutput) {
    console.log(JSON.stringify({ file, ...result }, null, 2));
  } else {
    const name = skill.name || skill.skill_name || file;
    const icon = result.valid ? '\u2705' : '\u274c';

    console.log(`\n${icon} ${name}`);
    console.log(`   Valid: ${result.valid} | Export-ready: ${result.ready_to_export}`);

    if (result.errors.length > 0) {
      console.log(`   Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        console.log(`     - [${err.code}] ${err.message}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`   Warnings (${result.warnings.length}):`);
      for (const warn of result.warnings) {
        console.log(`     - [${warn.code}] ${warn.message}`);
      }
    }

    const c = result.completeness;
    const complete = Object.entries(c).filter(([, v]) => v).length;
    const total = Object.keys(c).length;
    console.log(`   Completeness: ${complete}/${total}`);
  }

  if (!result.valid) hasErrors = true;
}

process.exit(hasErrors ? 1 : 0);
