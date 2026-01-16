#!/usr/bin/env node
/**
 * Validation Coverage Documentation Generator
 *
 * Reads COVERAGE metadata from validator files and generates
 * the VALIDATION_COVERAGE.md documentation file.
 *
 * Usage: node scripts/generate-validation-coverage.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

// Import coverage metadata from all validator sources
import { COVERAGE as SCHEMA_COVERAGE } from '../src/validators/schemaValidator.js';
import { COVERAGE as REFERENCE_COVERAGE } from '../src/validators/referenceResolver.js';
import { COVERAGE as COMPLETENESS_COVERAGE } from '../src/validators/completenessChecker.js';
import { COVERAGE as CONSISTENCY_COVERAGE, COVERAGE_GAPS } from '../src/routes/validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Combine all coverage data
const allCoverage = [
  ...SCHEMA_COVERAGE,
  ...REFERENCE_COVERAGE,
  ...COMPLETENESS_COVERAGE,
  ...CONSISTENCY_COVERAGE,
];

// Group by section
function groupBySection(coverage) {
  const groups = {};
  for (const item of coverage) {
    if (!groups[item.section]) {
      groups[item.section] = [];
    }
    groups[item.section].push(item);
  }
  return groups;
}

// Generate markdown table for a section
function generateSectionTable(section, checks) {
  const lines = [
    `### ${capitalizeFirst(section)}`,
    '',
    '| Field | Check | Type | Method |',
    '|-------|-------|------|--------|',
  ];

  for (const check of checks) {
    const method = check.method || (check.type === 'consistency' ? 'llm' : 'core');
    const methodIcon = method === 'deterministic' ? '🔧' : method === 'llm' ? '🤖' : '⚙️';
    lines.push(`| \`${check.field}\` | ${check.check} | ${check.type} | ${methodIcon} ${method} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// Generate gaps table
function generateGapsTable(gaps) {
  const lines = [
    '## Known Gaps',
    '',
    'These checks should be implemented:',
    '',
    '| Section | Check | Priority | Suggested Method |',
    '|---------|-------|----------|------------------|',
  ];

  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' };

  for (const gap of gaps) {
    lines.push(`| ${gap.section} | ${gap.check} | ${priorityIcon[gap.priority]} ${gap.priority} | ${gap.suggestedMethod} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// Generate coverage matrix
function generateCoverageMatrix(grouped) {
  const sections = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'engine', 'mocks', 'metadata'];
  const types = ['schema', 'reference', 'completeness', 'consistency'];

  const lines = [
    '## Coverage Matrix',
    '',
    '```',
    '┌─────────────────────────────────────────────────────────────────────────────┐',
    '│                         VALIDATION COVERAGE                                 │',
    '├──────────────────┬──────────────┬──────────────┬──────────────┬─────────────┤',
    '│ Section          │ Schema       │ Reference    │ Completeness │ Consistency │',
    '├──────────────────┼──────────────┼──────────────┼──────────────┼─────────────┤',
  ];

  for (const section of sections) {
    const checks = grouped[section] || [];
    const hasSchema = checks.some(c => c.type === 'schema') ? '✅' : '❌';
    const hasRef = checks.some(c => c.type === 'reference') ? '✅' : '❌';
    const hasComplete = checks.some(c => c.type === 'completeness') ? '✅' : '❌';
    const hasConsistency = checks.some(c => c.type === 'consistency') ? '✅' : '❌';

    const sectionPadded = section.padEnd(16);
    lines.push(`│ ${sectionPadded} │ ${hasSchema.padEnd(12)} │ ${hasRef.padEnd(12)} │ ${hasComplete.padEnd(12)} │ ${hasConsistency.padEnd(11)} │`);
  }

  lines.push('└──────────────────┴──────────────┴──────────────┴──────────────┴─────────────┘');
  lines.push('```');
  lines.push('');
  lines.push('Legend: ✅ = Has checks, ❌ = No checks');
  lines.push('');
  return lines.join('\n');
}

// Generate statistics
function generateStats(coverage, gaps) {
  const totalChecks = coverage.length;
  const byType = {};
  for (const c of coverage) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }

  const deterministicCount = coverage.filter(c => c.method === 'deterministic' || !c.method).length;
  const llmCount = coverage.filter(c => c.method === 'llm').length;

  const lines = [
    '## Statistics',
    '',
    `- **Total checks:** ${totalChecks}`,
    `- **Schema checks:** ${byType.schema || 0}`,
    `- **Reference checks:** ${byType.reference || 0}`,
    `- **Completeness checks:** ${byType.completeness || 0}`,
    `- **Consistency checks:** ${byType.consistency || 0}`,
    '',
    `- **Deterministic:** ${deterministicCount - llmCount} checks`,
    `- **LLM-based:** ${llmCount} checks`,
    '',
    `- **Known gaps:** ${gaps.length}`,
    `  - High priority: ${gaps.filter(g => g.priority === 'high').length}`,
    `  - Medium priority: ${gaps.filter(g => g.priority === 'medium').length}`,
    `  - Low priority: ${gaps.filter(g => g.priority === 'low').length}`,
    '',
  ];

  return lines.join('\n');
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Generate full document
function generateDocument() {
  const grouped = groupBySection(allCoverage);
  const timestamp = new Date().toISOString().split('T')[0];

  const sections = [
    '# Validation Coverage Matrix',
    '',
    `> **Auto-generated:** ${timestamp}`,
    '> ',
    '> Do not edit this file directly. It is generated from COVERAGE metadata in validator files.',
    '> ',
    '> Run \`npm run generate:coverage\` to regenerate.',
    '',
    '---',
    '',
    generateCoverageMatrix(grouped),
    generateStats(allCoverage, COVERAGE_GAPS),
    '---',
    '',
    '## Detailed Coverage by Section',
    '',
  ];

  // Add each section
  const sectionOrder = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'engine', 'mocks', 'metadata', 'cross-section'];
  for (const section of sectionOrder) {
    if (grouped[section]) {
      sections.push(generateSectionTable(section, grouped[section]));
    }
  }

  // Add gaps
  sections.push('---');
  sections.push('');
  sections.push(generateGapsTable(COVERAGE_GAPS));

  // Add source files reference
  sections.push('---');
  sections.push('');
  sections.push('## Source Files');
  sections.push('');
  sections.push('Coverage metadata is defined in:');
  sections.push('');
  sections.push('| File | Type |');
  sections.push('|------|------|');
  sections.push('| `validators/schemaValidator.js` | Schema checks |');
  sections.push('| `validators/referenceResolver.js` | Reference checks |');
  sections.push('| `validators/completenessChecker.js` | Completeness checks |');
  sections.push('| `routes/validate.js` | Consistency checks (on-demand) |');
  sections.push('');

  return sections.join('\n');
}

// Main
const outputPath = join(__dirname, '../../../docs/VALIDATION_COVERAGE.md');
const content = generateDocument();
writeFileSync(outputPath, content);

console.log(`✅ Generated ${outputPath}`);
console.log(`   - ${allCoverage.length} checks documented`);
console.log(`   - ${COVERAGE_GAPS.length} gaps identified`);
