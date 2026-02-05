/**
 * Solution System Prompt Tests
 *
 * Tests the prompt builder, phase definitions, and state injection
 * for the Solution Bot system prompt.
 *
 * Run with: node src/prompts/solutionSystem.test.js
 */

import { SOLUTION_PHASES, buildSolutionSystemPrompt, SOLUTION_SYSTEM_PROMPT } from './solutionSystem.js';

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const condition = actual === expected;
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Solution System Prompt Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────────────────────────────────────────────────────
// Phase Definitions
// ───────────────────────────────────────────────────────────────

console.log('Phase Definitions');
console.log('─────────────────');

assertEqual(SOLUTION_PHASES.length, 7, 'There are 7 solution phases');
assertEqual(SOLUTION_PHASES[0], 'SOLUTION_DISCOVERY', 'First phase is SOLUTION_DISCOVERY');
assertEqual(SOLUTION_PHASES[1], 'SKILL_TOPOLOGY', 'Second phase is SKILL_TOPOLOGY');
assertEqual(SOLUTION_PHASES[2], 'GRANT_ECONOMY', 'Third phase is GRANT_ECONOMY');
assertEqual(SOLUTION_PHASES[3], 'HANDOFF_DESIGN', 'Fourth phase is HANDOFF_DESIGN');
assertEqual(SOLUTION_PHASES[4], 'ROUTING_CONFIG', 'Fifth phase is ROUTING_CONFIG');
assertEqual(SOLUTION_PHASES[5], 'SECURITY_CONTRACTS', 'Sixth phase is SECURITY_CONTRACTS');
assertEqual(SOLUTION_PHASES[6], 'VALIDATION', 'Seventh phase is VALIDATION');

console.log('');

// ───────────────────────────────────────────────────────────────
// System Prompt Content
// ───────────────────────────────────────────────────────────────

console.log('System Prompt Content');
console.log('─────────────────────');

assert(SOLUTION_SYSTEM_PROMPT.length > 1000, `System prompt is substantial (${SOLUTION_SYSTEM_PROMPT.length} chars)`);
assert(SOLUTION_SYSTEM_PROMPT.includes('Solution Architect'), 'Prompt identifies as Solution Architect');
assert(SOLUTION_SYSTEM_PROMPT.includes('Skill Topology'), 'Prompt covers Skill Topology');
assert(SOLUTION_SYSTEM_PROMPT.includes('Grant Economy'), 'Prompt covers Grant Economy');
assert(SOLUTION_SYSTEM_PROMPT.includes('Handoff Flows'), 'Prompt covers Handoff Flows');
assert(SOLUTION_SYSTEM_PROMPT.includes('Channel Routing'), 'Prompt covers Channel Routing');
assert(SOLUTION_SYSTEM_PROMPT.includes('Security Contracts'), 'Prompt covers Security Contracts');
assert(SOLUTION_SYSTEM_PROMPT.includes('state_update'), 'Prompt mentions state_update');
assert(SOLUTION_SYSTEM_PROMPT.includes('_push'), 'Prompt documents _push operations');
assert(SOLUTION_SYSTEM_PROMPT.includes('JSON'), 'Prompt requires JSON responses');
assert(SOLUTION_SYSTEM_PROMPT.includes('gateway'), 'Prompt mentions gateway role');
assert(SOLUTION_SYSTEM_PROMPT.includes('worker'), 'Prompt mentions worker role');
assert(SOLUTION_SYSTEM_PROMPT.includes('orchestrator'), 'Prompt mentions orchestrator role');
assert(SOLUTION_SYSTEM_PROMPT.includes('approval'), 'Prompt mentions approval role');

console.log('');

// ───────────────────────────────────────────────────────────────
// buildSolutionSystemPrompt — Empty Solution
// ───────────────────────────────────────────────────────────────

console.log('buildSolutionSystemPrompt — Empty Solution');
console.log('───────────────────────────────────────────');

{
  const emptySolution = {
    id: 'test',
    name: 'Test Solution',
    phase: 'SOLUTION_DISCOVERY',
    skills: [],
    grants: [],
    handoffs: [],
    routing: {},
    platform_connectors: [],
    security_contracts: [],
  };

  const prompt = buildSolutionSystemPrompt(emptySolution);

  assert(typeof prompt === 'string', 'Returns a string');
  assert(prompt.length > SOLUTION_SYSTEM_PROMPT.length, 'Built prompt is longer than base prompt (includes state)');
  assert(prompt.includes(SOLUTION_SYSTEM_PROMPT), 'Built prompt includes the base system prompt');
  assert(prompt.includes('SOLUTION_DISCOVERY'), 'Built prompt includes current phase');
  assert(prompt.includes('Test Solution'), 'Built prompt includes solution name');
  assert(prompt.includes('"skills": []'), 'Built prompt shows empty skills array in JSON state');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// buildSolutionSystemPrompt — Populated Solution
// ───────────────────────────────────────────────────────────────

console.log('buildSolutionSystemPrompt — Populated Solution');
console.log('───────────────────────────────────────────────');

{
  const populatedSolution = {
    id: 'ecom',
    name: 'E-Commerce Solution',
    phase: 'HANDOFF_DESIGN',
    skills: [
      { id: 'identity', role: 'gateway', description: 'ID verification', entry_channels: ['telegram'] },
      { id: 'support', role: 'worker', description: 'Customer support' },
      { id: 'orchestrator', role: 'orchestrator', description: 'Webhook handler', entry_channels: ['api'] },
    ],
    grants: [
      { key: 'customer_id', issued_by: ['identity'], consumed_by: ['support'] },
      { key: 'assurance_level', issued_by: ['identity'], consumed_by: ['support'], values: ['L0', 'L1', 'L2'] },
    ],
    handoffs: [
      { id: 'id-to-support', from: 'identity', to: 'support', trigger: 'verified', grants_passed: ['customer_id'] },
    ],
    routing: {
      telegram: { default_skill: 'identity' },
      api: { default_skill: 'orchestrator' },
    },
    platform_connectors: [
      { id: 'handoff-controller-mcp', required: true },
    ],
    security_contracts: [
      { name: 'ID needed for support', consumer: 'support', requires_grants: ['customer_id'], provider: 'identity' },
    ],
  };

  const prompt = buildSolutionSystemPrompt(populatedSolution);

  assert(prompt.includes('HANDOFF_DESIGN'), 'Built prompt shows current phase');
  assert(prompt.includes('"identity"') && prompt.includes('"support"'), 'Built prompt includes skill IDs in state summary');
  assert(prompt.includes('identity'), 'Prompt includes identity skill');
  assert(prompt.includes('support'), 'Prompt includes support skill');
  assert(prompt.includes('gateway'), 'Prompt includes gateway role');
  assert(prompt.includes('customer_id'), 'Prompt includes customer_id grant');
  assert(prompt.includes('assurance_level'), 'Prompt includes assurance_level grant');
  assert(prompt.includes('id-to-support'), 'Prompt includes handoff ID');
  assert(prompt.includes('telegram'), 'Prompt includes telegram routing');
  assert(prompt.includes('handoff-controller-mcp'), 'Prompt includes platform connector');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Phase-Specific Prompt Content
// ───────────────────────────────────────────────────────────────

console.log('Phase-Specific Prompt Content');
console.log('────────────────────────────');

{
  const makeSolutionAtPhase = (phase) => ({
    id: 'test',
    name: 'Test',
    phase,
    skills: [{ id: 'skill-a', role: 'worker' }],
    grants: [],
    handoffs: [],
    routing: {},
    platform_connectors: [],
    security_contracts: [],
  });

  // Each phase should appear in the built prompt
  for (const phase of SOLUTION_PHASES) {
    const prompt = buildSolutionSystemPrompt(makeSolutionAtPhase(phase));
    assert(prompt.includes(phase), `Phase ${phase} appears in built prompt`);
  }
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Edge Cases
// ───────────────────────────────────────────────────────────────

console.log('Edge Cases');
console.log('──────────');

{
  // Missing fields should not crash
  const minimal = { id: 'x', name: 'X' };
  let threw = false;
  try {
    const prompt = buildSolutionSystemPrompt(minimal);
    assert(typeof prompt === 'string', 'Handles solution with missing arrays');
  } catch (err) {
    threw = true;
    console.log(`  ✗ Threw on minimal solution: ${err.message}`);
    testsFailed++;
  }
}

{
  // Null/undefined solution fields
  const withNulls = {
    id: 'test',
    name: 'Test',
    phase: 'SOLUTION_DISCOVERY',
    skills: null,
    grants: undefined,
    handoffs: [],
    routing: null,
    platform_connectors: undefined,
    security_contracts: [],
  };

  let threw = false;
  try {
    const prompt = buildSolutionSystemPrompt(withNulls);
    assert(typeof prompt === 'string', 'Handles null/undefined fields gracefully');
  } catch (err) {
    threw = true;
    console.log(`  ✗ Threw on null fields: ${err.message}`);
    testsFailed++;
  }
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (testsFailed > 0) {
  process.exit(1);
}
