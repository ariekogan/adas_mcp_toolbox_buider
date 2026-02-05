/**
 * Solutions Store Tests
 *
 * Tests CRUD operations and state update logic for the Solutions store.
 * Uses a temporary MEMORY_PATH to avoid polluting real data.
 *
 * Run with: MEMORY_PATH=/tmp/sb-test-solutions node src/store/solutions.test.js
 */

import fs from 'fs/promises';
import path from 'path';

// ═══════════════════════════════════════════════════════════════
// SETUP: Set MEMORY_PATH before importing store (must use a temp dir)
// ═══════════════════════════════════════════════════════════════

const TEST_DIR = `/tmp/sb-test-solutions-${Date.now()}`;
process.env.MEMORY_PATH = TEST_DIR;

// Now import store (it reads MEMORY_PATH at call time via getMemoryRoot)
const { default: store } = await import('./solutions.js');

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

function assertDeepEqual(actual, expected, message) {
  const condition = JSON.stringify(actual) === JSON.stringify(expected);
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${JSON.stringify(expected, null, 2)}`);
    console.log(`    Actual:   ${JSON.stringify(actual, null, 2)}`);
  }
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Solutions Store Tests');
console.log(`Memory Path: ${TEST_DIR}`);
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────────────────────────────────────────────────────
// CRUD Operations
// ───────────────────────────────────────────────────────────────

console.log('CRUD Operations');
console.log('───────────────');

let createdId;

{
  // List (empty)
  const solutions = await store.list();
  assertEqual(solutions.length, 0, 'List returns empty array initially');
}

{
  // Create
  const sol = await store.create('Test Solution');
  assert(sol.id.startsWith('sol_'), `Created solution has sol_ prefix: ${sol.id}`);
  assertEqual(sol.name, 'Test Solution', 'Name matches');
  assertEqual(sol.version, '1.0.0', 'Default version is 1.0.0');
  assertEqual(sol.phase, 'SOLUTION_DISCOVERY', 'Initial phase is SOLUTION_DISCOVERY');
  assertDeepEqual(sol.skills, [], 'Skills array is empty');
  assertDeepEqual(sol.grants, [], 'Grants array is empty');
  assertDeepEqual(sol.handoffs, [], 'Handoffs array is empty');
  assertDeepEqual(sol.routing, {}, 'Routing is empty object');
  assertDeepEqual(sol.conversation, [], 'Conversation is empty array');
  assert(sol.created_at !== undefined, 'created_at is set');
  assert(sol.updated_at !== undefined, 'updated_at is set');
  createdId = sol.id;
}

{
  // List (after create)
  const solutions = await store.list();
  assertEqual(solutions.length, 1, 'List returns 1 solution');
  assertEqual(solutions[0].id, createdId, 'Listed solution has correct ID');
  assertEqual(solutions[0].name, 'Test Solution', 'Listed solution has correct name');
  assertEqual(solutions[0].skills_count, 0, 'Listed solution shows skills_count');
}

{
  // Load
  const loaded = await store.load(createdId);
  assertEqual(loaded.id, createdId, 'Loaded solution has correct ID');
  assertEqual(loaded.name, 'Test Solution', 'Loaded solution has correct name');
  assert(Array.isArray(loaded.conversation), 'Conversation array exists');
}

{
  // Load non-existent
  let threw = false;
  try {
    await store.load('sol_nonexistent');
  } catch (err) {
    threw = true;
    assert(err.message.includes('not found'), 'Error message mentions not found');
  }
  assert(threw, 'Loading non-existent solution throws');
}

{
  // Save (update)
  const sol = await store.load(createdId);
  sol.name = 'Updated Name';
  sol.phase = 'SKILL_TOPOLOGY';
  await store.save(sol);

  const reloaded = await store.load(createdId);
  assertEqual(reloaded.name, 'Updated Name', 'Name updated after save');
  assertEqual(reloaded.phase, 'SKILL_TOPOLOGY', 'Phase updated after save');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Conversation Operations
// ───────────────────────────────────────────────────────────────

console.log('Conversation Operations');
console.log('───────────────────────');

{
  const sol = await store.appendMessage(createdId, {
    role: 'user',
    content: 'Hello Solution Bot',
  });

  assertEqual(sol.conversation.length, 1, 'Conversation has 1 message');
  assertEqual(sol.conversation[0].role, 'user', 'Message role is user');
  assertEqual(sol.conversation[0].content, 'Hello Solution Bot', 'Message content matches');
  assert(sol.conversation[0].id.startsWith('msg_'), 'Message has msg_ prefixed ID');
  assert(sol.conversation[0].timestamp, 'Message has timestamp');
}

{
  const sol = await store.appendMessage(createdId, {
    role: 'assistant',
    content: 'Hello! What solution are you building?',
  });

  assertEqual(sol.conversation.length, 2, 'Conversation has 2 messages');
  assertEqual(sol.conversation[1].role, 'assistant', 'Second message is assistant');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// State Updates: _push
// ───────────────────────────────────────────────────────────────

console.log('State Updates: _push');
console.log('────────────────────');

{
  // Push a skill
  const sol = await store.updateState(createdId, {
    skills_push: { id: 'gateway', role: 'gateway', description: 'Identity verification' },
  });

  assertEqual(sol.skills.length, 1, 'Skills array has 1 item after push');
  assertEqual(sol.skills[0].id, 'gateway', 'Pushed skill has correct ID');
  assertEqual(sol.skills[0].role, 'gateway', 'Pushed skill has correct role');
}

{
  // Push another skill
  const sol = await store.updateState(createdId, {
    skills_push: { id: 'worker', role: 'worker', description: 'Customer support' },
  });

  assertEqual(sol.skills.length, 2, 'Skills array has 2 items after second push');
}

{
  // Push a grant
  const sol = await store.updateState(createdId, {
    grants_push: { key: 'ecom.customer_id', issued_by: ['gateway'], consumed_by: ['worker'] },
  });

  assertEqual(sol.grants.length, 1, 'Grants array has 1 item');
  assertEqual(sol.grants[0].key, 'ecom.customer_id', 'Grant key matches');
}

{
  // Push a handoff
  const sol = await store.updateState(createdId, {
    handoffs_push: { id: 'g-to-w', from: 'gateway', to: 'worker', trigger: 'verified', grants_passed: ['ecom.customer_id'] },
  });

  assertEqual(sol.handoffs.length, 1, 'Handoffs array has 1 item');
  assertEqual(sol.handoffs[0].from, 'gateway', 'Handoff from matches');
  assertEqual(sol.handoffs[0].to, 'worker', 'Handoff to matches');
}

{
  // Push duplicate (upsert by ID)
  const sol = await store.updateState(createdId, {
    skills_push: { id: 'gateway', role: 'gateway', description: 'Updated description' },
  });

  assertEqual(sol.skills.length, 2, 'Skills array still has 2 items (upsert, not duplicate)');
  assertEqual(sol.skills[0].description, 'Updated description', 'Existing skill was updated');
}

{
  // Push array of items
  const sol = await store.updateState(createdId, {
    skills_push: [
      { id: 'orchestrator', role: 'orchestrator', description: 'Orchestrates' },
      { id: 'approval', role: 'approval', description: 'Approves' },
    ],
  });

  assertEqual(sol.skills.length, 4, 'Skills array has 4 items after batch push');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// State Updates: _update
// ───────────────────────────────────────────────────────────────

console.log('State Updates: _update');
console.log('─────────────────────');

{
  const sol = await store.updateState(createdId, {
    skills_update: { id: 'worker', description: 'Updated worker description' },
  });

  const worker = sol.skills.find(s => s.id === 'worker');
  assertEqual(worker.description, 'Updated worker description', 'Skill description updated via _update');
  assertEqual(worker.role, 'worker', 'Other fields preserved during update');
}

{
  // Update by key (for grants)
  const sol = await store.updateState(createdId, {
    grants_update: { key: 'ecom.customer_id', ttl_seconds: 3600 },
  });

  const grant = sol.grants.find(g => g.key === 'ecom.customer_id');
  assertEqual(grant.ttl_seconds, 3600, 'Grant ttl_seconds added via _update');
  assertDeepEqual(grant.issued_by, ['gateway'], 'Grant issued_by preserved');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// State Updates: _delete
// ───────────────────────────────────────────────────────────────

console.log('State Updates: _delete');
console.log('─────────────────────');

{
  const sol = await store.updateState(createdId, {
    skills_delete: 'approval',
  });

  assertEqual(sol.skills.length, 3, 'Skills array has 3 items after delete');
  assert(!sol.skills.some(s => s.id === 'approval'), 'Approval skill was deleted');
}

{
  // Delete multiple
  const sol = await store.updateState(createdId, {
    skills_delete: ['orchestrator'],
  });

  assertEqual(sol.skills.length, 2, 'Skills array has 2 items after array delete');
}

{
  // Delete by key (for grants)
  const sol = await store.updateState(createdId, {
    grants_delete: 'ecom.customer_id',
  });

  assertEqual(sol.grants.length, 0, 'Grants array empty after delete by key');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// State Updates: Direct Property Set
// ───────────────────────────────────────────────────────────────

console.log('State Updates: Direct Property Set');
console.log('──────────────────────────────────');

{
  const sol = await store.updateState(createdId, {
    phase: 'GRANT_ECONOMY',
  });

  assertEqual(sol.phase, 'GRANT_ECONOMY', 'Phase updated via direct set');
}

{
  // Nested property
  const sol = await store.updateState(createdId, {
    'routing.telegram': { default_skill: 'gateway', description: 'Telegram routing' },
  });

  assertEqual(sol.routing.telegram.default_skill, 'gateway', 'Nested routing property set');
  assertEqual(sol.routing.telegram.description, 'Telegram routing', 'Nested routing description set');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Import from YAML
// ───────────────────────────────────────────────────────────────

console.log('Import from YAML');
console.log('────────────────');

{
  const yamlData = {
    id: 'imported-solution',
    name: 'Imported E-Commerce',
    version: '2.0.0',
    description: 'Imported from solution.yaml',
    skills: [
      { id: 'identity', role: 'gateway' },
      { id: 'support', role: 'worker' },
    ],
    grants: [
      { key: 'customer_id', issued_by: ['identity'], consumed_by: ['support'] },
    ],
    handoffs: [
      { id: 'id-to-sup', from: 'identity', to: 'support', trigger: 'verified', grants_passed: ['customer_id'] },
    ],
    routing: {
      email: { default_skill: 'identity' },
    },
  };

  const sol = await store.importFromYaml(yamlData, ['domain-1', 'domain-2']);

  assertEqual(sol.id, 'imported-solution', 'Imported ID matches yaml');
  assertEqual(sol.name, 'Imported E-Commerce', 'Imported name matches');
  assertEqual(sol.version, '2.0.0', 'Version preserved');
  assertEqual(sol.phase, 'VALIDATION', 'Imported solutions start in VALIDATION phase');
  assertEqual(sol.skills.length, 2, 'Skills imported');
  assertEqual(sol.grants.length, 1, 'Grants imported');
  assertEqual(sol.handoffs.length, 1, 'Handoffs imported');
  assertEqual(sol.routing.email.default_skill, 'identity', 'Routing imported');
  assertDeepEqual(sol.linked_domains, ['domain-1', 'domain-2'], 'Linked domains set');
  assertDeepEqual(sol.conversation, [], 'Conversation is fresh (empty)');

  // Verify persisted
  const loaded = await store.load('imported-solution');
  assertEqual(loaded.name, 'Imported E-Commerce', 'Imported solution persisted to disk');
}

console.log('');

// ───────────────────────────────────────────────────────────────
// Delete Solution
// ───────────────────────────────────────────────────────────────

console.log('Delete Solution');
console.log('───────────────');

{
  await store.remove(createdId);

  let threw = false;
  try {
    await store.load(createdId);
  } catch {
    threw = true;
  }
  assert(threw, 'Deleted solution cannot be loaded');

  const solutions = await store.list();
  const found = solutions.find(s => s.id === createdId);
  assert(!found, 'Deleted solution not in list');
}

{
  // Delete non-existent (should not throw)
  let threw = false;
  try {
    await store.remove('sol_nonexistent');
  } catch {
    threw = true;
  }
  assert(!threw, 'Deleting non-existent solution does not throw');
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// CLEANUP & SUMMARY
// ═══════════════════════════════════════════════════════════════

await cleanup();

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (testsFailed > 0) {
  process.exit(1);
}
