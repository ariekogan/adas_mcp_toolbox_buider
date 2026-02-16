/**
 * Solution Validator Tests
 *
 * Tests all 7 cross-skill validation checks:
 *   1. Grant provider exists
 *   2. Handoff targets exist
 *   3. Grants passed match
 *   4. Routing covers channels
 *   5. Platform connectors declared
 *   6. No orphan skills
 *   7. Circular handoff detection
 *
 * Run with: node src/validators/solutionValidator.test.js
 */

import { validateSolution } from './solutionValidator.js';

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

function assertIncludes(arr, predicate, message) {
  const found = arr.some(predicate);
  if (found) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Array: ${JSON.stringify(arr.map(e => e.message || e), null, 2)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════

function makeEmptySolution() {
  return {
    id: 'test-solution',
    name: 'Test Solution',
    skills: [],
    grants: [],
    handoffs: [],
    routing: {},
    platform_connectors: [],
    security_contracts: [],
  };
}

function makeEcommerceSolution() {
  return {
    id: 'ecommerce',
    name: 'E-Commerce',
    skills: [
      { id: 'identity-assurance', role: 'gateway', description: 'Verifies identity', entry_channels: ['telegram', 'email'] },
      { id: 'support-tier-1', role: 'worker', description: 'Customer support' },
      { id: 'returns-ops', role: 'worker', description: 'Returns processing' },
      { id: 'finance-ops', role: 'approval', description: 'Finance approval' },
      { id: 'ecom-orchestrator', role: 'orchestrator', description: 'Orchestrates webhooks', entry_channels: ['api'] },
    ],
    grants: [
      { key: 'ecom.customer_id', issued_by: ['identity-assurance'], consumed_by: ['support-tier-1', 'returns-ops', 'finance-ops'] },
      { key: 'ecom.assurance_level', issued_by: ['identity-assurance'], consumed_by: ['support-tier-1', 'returns-ops'], values: ['L0', 'L1', 'L2'] },
      { key: 'ecom.verified_scope', issued_by: ['identity-assurance'], consumed_by: ['support-tier-1'], ttl_seconds: 900 },
    ],
    handoffs: [
      { id: 'identity-to-support', from: 'identity-assurance', to: 'support-tier-1', trigger: 'Identity verified', grants_passed: ['ecom.customer_id', 'ecom.assurance_level', 'ecom.verified_scope'], mechanism: 'handoff-controller-mcp' },
      { id: 'support-to-returns', from: 'support-tier-1', to: 'returns-ops', trigger: 'Return requested', grants_passed: ['ecom.customer_id', 'ecom.assurance_level'], mechanism: 'internal-message' },
      { id: 'returns-to-finance', from: 'returns-ops', to: 'finance-ops', trigger: 'Refund > $500', grants_passed: ['ecom.customer_id'], mechanism: 'internal-message' },
    ],
    routing: {
      telegram: { default_skill: 'identity-assurance', description: 'All Telegram → identity' },
      email: { default_skill: 'identity-assurance', description: 'All email → identity' },
      api: { default_skill: 'ecom-orchestrator', description: 'Webhooks → orchestrator' },
    },
    platform_connectors: [
      { id: 'handoff-controller-mcp', required: true, description: 'Handoff sessions' },
    ],
    security_contracts: [
      { name: 'Identity required for orders', consumer: 'support-tier-1', requires_grants: ['ecom.customer_id', 'ecom.assurance_level'], provider: 'identity-assurance' },
      { name: 'Identity required for returns', consumer: 'returns-ops', requires_grants: ['ecom.customer_id'], provider: 'identity-assurance' },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Solution Validator Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────────────────────────────────────────────────────
// Empty Solution
// ───────────────────────────────────────────────────────────────

console.log('Empty Solution');
console.log('──────────────');

{
  const result = validateSolution(makeEmptySolution());
  assertEqual(result.valid, true, 'Empty solution is valid');
  assertEqual(result.errors.length, 0, 'No errors');
  assertEqual(result.warnings.length, 1, 'One warning (identity_actor_types)');
  assertEqual(result.summary.skills, 0, 'Summary shows 0 skills');
  assertEqual(result.summary.grants, 0, 'Summary shows 0 grants');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Valid E-Commerce Solution
// ───────────────────────────────────────────────────────────────

console.log('Valid E-Commerce Solution');
console.log('─────────────────────────');

{
  const result = validateSolution(makeEcommerceSolution());
  assertEqual(result.valid, true, 'E-commerce solution is valid');
  assertEqual(result.errors.length, 0, 'No errors');
  assertEqual(result.summary.skills, 5, 'Summary shows 5 skills');
  assertEqual(result.summary.grants, 3, 'Summary shows 3 grants');
  assertEqual(result.summary.handoffs, 3, 'Summary shows 3 handoffs');
  assertEqual(result.summary.channels, 3, 'Summary shows 3 channels');
  assertEqual(result.summary.security_contracts, 2, 'Summary shows 2 contracts');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 1: Grant Provider / Consumer Exists
// ───────────────────────────────────────────────────────────────

console.log('Check 1: Grant Provider / Consumer Exists');
console.log('─────────────────────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'worker-a', role: 'worker' }];
  sol.grants = [
    { key: 'token', issued_by: ['ghost-skill'], consumed_by: ['worker-a'] },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid when issuer does not exist');
  assertIncludes(result.errors, e => e.check === 'grant_provider_exists', 'Error: grant_provider_exists');
  assertIncludes(result.errors, e => e.skill === 'ghost-skill', 'Error references ghost-skill');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'gateway', role: 'gateway' }];
  sol.grants = [
    { key: 'token', issued_by: ['gateway'], consumed_by: ['ghost-consumer'] },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid when consumer does not exist');
  assertIncludes(result.errors, e => e.check === 'grant_consumer_exists', 'Error: grant_consumer_exists');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'worker-a', role: 'worker' }];
  sol.grants = [
    { key: 'token', issued_by: [], consumed_by: ['worker-a'] },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid when grant has consumers but no issuer');
  assertIncludes(result.errors, e => e.check === 'grant_provider_missing', 'Error: grant_provider_missing');
}

{
  // Internal grants should skip consumer checks
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'gateway', role: 'gateway' }];
  sol.grants = [
    { key: 'internal.session', issued_by: ['gateway'], consumed_by: [], internal: true },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, true, 'Internal grants skip consumer checks');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 2: Handoff Targets Exist
// ───────────────────────────────────────────────────────────────

console.log('Check 2: Handoff Targets Exist');
console.log('──────────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'skill-a', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-ghost', from: 'skill-a', to: 'ghost-skill', trigger: 'test' },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid when handoff target does not exist');
  assertIncludes(result.errors, e => e.check === 'handoff_target_exists', 'Error: handoff_target_exists');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'skill-b', role: 'worker' }];
  sol.handoffs = [
    { id: 'ghost-to-b', from: 'ghost-skill', to: 'skill-b', trigger: 'test' },
  ];

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid when handoff source does not exist');
  assertIncludes(result.errors, e => e.check === 'handoff_source_exists', 'Error: handoff_source_exists');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'skill-a', role: 'worker' }, { id: 'skill-b', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-b', from: 'skill-a', to: 'skill-b', trigger: 'test' },
  ];

  const result = validateSolution(sol);
  const handoffErrors = result.errors.filter(e =>
    e.check === 'handoff_source_exists' || e.check === 'handoff_target_exists'
  );
  assertEqual(handoffErrors.length, 0, 'No errors when both from/to exist');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 3: Grants Passed Match (Security Contracts)
// ───────────────────────────────────────────────────────────────

console.log('Check 3: Grants Passed Match Security Contracts');
console.log('───────────────────────────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'provider', role: 'gateway' },
    { id: 'consumer', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'p-to-c', from: 'provider', to: 'consumer', trigger: 'done', grants_passed: ['token_a'] },
  ];
  sol.security_contracts = [
    { name: 'Consumer needs token_a', consumer: 'consumer', provider: 'provider', requires_grants: ['token_a'] },
  ];

  const result = validateSolution(sol);
  const grantErrors = result.errors.filter(e => e.check === 'grants_passed_match');
  assertEqual(grantErrors.length, 0, 'No error when required grant is passed in handoff');
}

{
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'provider', role: 'gateway' },
    { id: 'consumer', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'p-to-c', from: 'provider', to: 'consumer', trigger: 'done', grants_passed: ['token_a'] },
  ];
  sol.security_contracts = [
    { name: 'Consumer needs token_b', consumer: 'consumer', provider: 'provider', requires_grants: ['token_b'] },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'grants_passed_match', 'Error when required grant NOT passed in handoff');
}

{
  // Contract with non-existent consumer
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'provider', role: 'gateway' }];
  sol.security_contracts = [
    { name: 'Ghost consumer', consumer: 'ghost', provider: 'provider', requires_grants: ['x'] },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'contract_consumer_exists', 'Error: contract_consumer_exists');
}

{
  // Contract with non-existent provider
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'consumer', role: 'worker' }];
  sol.security_contracts = [
    { name: 'Ghost provider', consumer: 'consumer', provider: 'ghost', requires_grants: ['x'] },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'contract_provider_exists', 'Error: contract_provider_exists');
}

{
  // Multi-hop handoff chain: provider → middle → consumer
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'provider', role: 'gateway' },
    { id: 'middle', role: 'worker' },
    { id: 'consumer', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'p-to-m', from: 'provider', to: 'middle', trigger: 'step1', grants_passed: ['token'] },
    { id: 'm-to-c', from: 'middle', to: 'consumer', trigger: 'step2', grants_passed: ['token'] },
  ];
  sol.security_contracts = [
    { name: 'Consumer needs token via chain', consumer: 'consumer', provider: 'provider', requires_grants: ['token'] },
  ];

  const result = validateSolution(sol);
  const grantErrors = result.errors.filter(e => e.check === 'grants_passed_match');
  assertEqual(grantErrors.length, 0, 'Multi-hop: grant passed through chain satisfies contract');
}

{
  // Multi-hop with broken chain (middle drops grant)
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'provider', role: 'gateway' },
    { id: 'middle', role: 'worker' },
    { id: 'consumer', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'p-to-m', from: 'provider', to: 'middle', trigger: 'step1', grants_passed: ['token'] },
    { id: 'm-to-c', from: 'middle', to: 'consumer', trigger: 'step2', grants_passed: [] }, // middle drops token!
  ];
  sol.security_contracts = [
    { name: 'Consumer needs token', consumer: 'consumer', provider: 'provider', requires_grants: ['token'] },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'grants_passed_match', 'Multi-hop: broken chain detected when middle drops grant');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 4: Routing Covers Channels
// ───────────────────────────────────────────────────────────────

console.log('Check 4: Routing Covers Channels');
console.log('────────────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'gateway', role: 'gateway', entry_channels: ['telegram'] }];
  sol.routing = {};

  const result = validateSolution(sol);
  assertIncludes(result.warnings, w => w.check === 'routing_covers_channels', 'Warning when skill has entry_channel but no routing rule');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'gateway', role: 'gateway', entry_channels: ['telegram'] }];
  sol.routing = { telegram: { default_skill: 'gateway' } };

  const result = validateSolution(sol);
  const routingWarnings = result.warnings.filter(w => w.check === 'routing_covers_channels');
  assertEqual(routingWarnings.length, 0, 'No warning when routing covers all entry_channels');
}

{
  // Routing target doesn't exist
  const sol = makeEmptySolution();
  sol.skills = [];
  sol.routing = { slack: { default_skill: 'ghost-skill' } };

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'routing_target_exists', 'Error when routing targets non-existent skill');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 5: Platform Connectors Declared
// ───────────────────────────────────────────────────────────────

console.log('Check 5: Platform Connectors Declared');
console.log('─────────────────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'a', role: 'worker' }, { id: 'b', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'test', mechanism: 'custom-mcp' },
  ];
  sol.platform_connectors = [];

  const result = validateSolution(sol);
  assertIncludes(result.warnings, w => w.check === 'platform_connectors_declared', 'Warning when handoff mechanism not in platform_connectors');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'a', role: 'worker' }, { id: 'b', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'test', mechanism: 'internal-message' },
  ];

  const result = validateSolution(sol);
  const connectorWarnings = result.warnings.filter(w => w.check === 'platform_connectors_declared');
  assertEqual(connectorWarnings.length, 0, 'No warning for internal-message mechanism');
}

{
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'a', role: 'worker' }, { id: 'b', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'test', mechanism: 'handoff-controller-mcp' },
  ];
  sol.platform_connectors = [
    { id: 'handoff-controller-mcp', required: true },
  ];

  const result = validateSolution(sol);
  const connectorWarnings = result.warnings.filter(w => w.check === 'platform_connectors_declared');
  assertEqual(connectorWarnings.length, 0, 'No warning when mechanism is declared in platform_connectors');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 6: No Orphan Skills
// ───────────────────────────────────────────────────────────────

console.log('Check 6: No Orphan Skills');
console.log('─────────────────────────');

{
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'connected', role: 'worker' },
    { id: 'orphan', role: 'worker' },
  ];
  sol.routing = { email: { default_skill: 'connected' } };

  const result = validateSolution(sol);
  assertIncludes(result.warnings, w => w.check === 'no_orphan_skills' && w.skill === 'orphan', 'Warning for orphan skill not reachable via routing or handoffs');
}

{
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'gateway', role: 'gateway' },
    { id: 'worker', role: 'worker' },
  ];
  sol.routing = { email: { default_skill: 'gateway' } };
  sol.handoffs = [
    { id: 'g-to-w', from: 'gateway', to: 'worker', trigger: 'done' },
  ];

  const result = validateSolution(sol);
  const orphanWarnings = result.warnings.filter(w => w.check === 'no_orphan_skills');
  assertEqual(orphanWarnings.length, 0, 'No orphan warning when all skills are reachable');
}

{
  // Skill reachable as handoff source (not target)
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'sender', role: 'gateway' },
    { id: 'receiver', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 's-to-r', from: 'sender', to: 'receiver', trigger: 'done' },
  ];

  const result = validateSolution(sol);
  const orphanWarnings = result.warnings.filter(w => w.check === 'no_orphan_skills');
  assertEqual(orphanWarnings.length, 0, 'No orphan warning for handoff source or target');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Check 7: Circular Handoff Detection
// ───────────────────────────────────────────────────────────────

console.log('Check 7: Circular Handoff Detection');
console.log('───────────────────────────────────');

{
  // Simple cycle: A → B → A
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'a', role: 'worker' },
    { id: 'b', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'step1' },
    { id: 'b-to-a', from: 'b', to: 'a', trigger: 'step2' },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'circular_handoffs', 'Error: circular handoff A → B → A detected');
}

{
  // Longer cycle: A → B → C → A
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'a', role: 'worker' },
    { id: 'b', role: 'worker' },
    { id: 'c', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'step1' },
    { id: 'b-to-c', from: 'b', to: 'c', trigger: 'step2' },
    { id: 'c-to-a', from: 'c', to: 'a', trigger: 'step3' },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'circular_handoffs', 'Error: circular handoff A → B → C → A detected');
}

{
  // No cycle: linear chain A → B → C
  const sol = makeEmptySolution();
  sol.skills = [
    { id: 'a', role: 'worker' },
    { id: 'b', role: 'worker' },
    { id: 'c', role: 'worker' },
  ];
  sol.handoffs = [
    { id: 'a-to-b', from: 'a', to: 'b', trigger: 'step1' },
    { id: 'b-to-c', from: 'b', to: 'c', trigger: 'step2' },
  ];

  const result = validateSolution(sol);
  const cycleErrors = result.errors.filter(e => e.check === 'circular_handoffs');
  assertEqual(cycleErrors.length, 0, 'No cycle error for linear chain');
}

{
  // Self-loop: A → A
  const sol = makeEmptySolution();
  sol.skills = [{ id: 'a', role: 'worker' }];
  sol.handoffs = [
    { id: 'a-to-a', from: 'a', to: 'a', trigger: 'retry' },
  ];

  const result = validateSolution(sol);
  assertIncludes(result.errors, e => e.check === 'circular_handoffs', 'Error: self-loop A → A detected');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// E-Commerce Full Validation (integration)
// ───────────────────────────────────────────────────────────────

console.log('E-Commerce Full Validation (Integration)');
console.log('────────────────────────────────────────');

{
  const sol = makeEcommerceSolution();
  const result = validateSolution(sol);

  assertEqual(result.valid, true, 'E-commerce solution passes all checks');
  assertEqual(result.errors.length, 0, 'Zero errors');
  assert(result.summary.skills === 5, 'Correct skill count');
  assert(result.summary.grants === 3, 'Correct grant count');
  assert(result.summary.handoffs === 3, 'Correct handoff count');
  assert(result.summary.channels === 3, 'Correct channel count');
  assert(result.summary.security_contracts === 2, 'Correct contract count');
}

{
  // Break e-commerce: remove identity-assurance (should cascade errors)
  const sol = makeEcommerceSolution();
  sol.skills = sol.skills.filter(s => s.id !== 'identity-assurance');

  const result = validateSolution(sol);
  assertEqual(result.valid, false, 'Invalid after removing gateway skill');
  assert(result.errors.length >= 3, `Multiple errors from removing gateway (got ${result.errors.length})`);

  // Should flag: grant issuers missing, handoff source missing, routing target missing
  assertIncludes(result.errors, e => e.check === 'grant_provider_exists', 'Error: grant issuer (identity-assurance) missing');
  assertIncludes(result.errors, e => e.check === 'handoff_source_exists', 'Error: handoff source (identity-assurance) missing');
  assertIncludes(result.errors, e => e.check === 'routing_target_exists', 'Error: routing target (identity-assurance) missing');
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
