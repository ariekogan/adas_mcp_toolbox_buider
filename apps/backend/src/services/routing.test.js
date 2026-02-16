/**
 * Routing Service Tests
 *
 * Test harness based on the routing decision tables in:
 * docs/TENANT_CHANNELS_SKILL_IDENTITY.md
 *
 * Run with: node src/services/routing.test.js
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!existsSync(path.join(__dirname, 'routing.js'))) {
  console.log('⏭  routing.js not yet implemented — skipping routing tests');
  process.exit(0);
}

const {
  routeByToAddress,
  routeByMention,
  routeByChannel,
  extractSlackMentions,
  conversationKey,
  addEmailRoute,
  addSlackMentionRoute,
  addSlackChannelRoute,
  registerSkillActor,
  initializeTenantConfig,
  buildJobMetadata,
  _testing,
} = await import('./routing.js');

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

function assertArrayEqual(actual, expected, message) {
  const condition = JSON.stringify(actual) === JSON.stringify(expected);
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

function beforeEach() {
  _testing.clearAllTables();
}

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Routing Service Tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────────────────────────────────────────────────────
// Gmail Routing Tests
// ───────────────────────────────────────────────────────────────

console.log('Gmail Routing (routeByToAddress)');
console.log('─────────────────────────────────');

beforeEach();

// Setup routing table
addEmailRoute('swdev2@yourdomain.com', 'swdev2');
addEmailRoute('hr@yourdomain.com', 'hr');
addEmailRoute('finance@yourdomain.com', 'finance');

assertEqual(
  routeByToAddress('swdev2@yourdomain.com'),
  'swdev2',
  'Routes swdev2@yourdomain.com → swdev2'
);

assertEqual(
  routeByToAddress('hr@yourdomain.com'),
  'hr',
  'Routes hr@yourdomain.com → hr'
);

assertEqual(
  routeByToAddress('finance@yourdomain.com'),
  'finance',
  'Routes finance@yourdomain.com → finance'
);

assertEqual(
  routeByToAddress('unknown@yourdomain.com'),
  null,
  'Returns null for unknown address'
);

assertEqual(
  routeByToAddress('SWDEV2@YOURDOMAIN.COM'),
  'swdev2',
  'Case-insensitive routing'
);

assertEqual(
  routeByToAddress(null),
  null,
  'Handles null input'
);

assertEqual(
  routeByToAddress(''),
  null,
  'Handles empty string'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Slack Mention Routing Tests
// ───────────────────────────────────────────────────────────────

console.log('Slack Mention Routing (routeByMention)');
console.log('──────────────────────────────────────');

beforeEach();

// Setup routing table
addSlackMentionRoute('@swdev2', 'swdev2');
addSlackMentionRoute('@hr', 'hr');
addSlackMentionRoute('@finance', 'finance');

assertEqual(
  routeByMention('@swdev2'),
  'swdev2',
  'Routes @swdev2 → swdev2'
);

assertEqual(
  routeByMention('swdev2'),
  'swdev2',
  'Routes swdev2 (without @) → swdev2'
);

assertEqual(
  routeByMention('@HR'),
  'hr',
  'Case-insensitive routing'
);

assertEqual(
  routeByMention('@unknown'),
  null,
  'Returns null for unknown mention'
);

assertEqual(
  routeByMention(null),
  null,
  'Handles null input'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Slack Channel Routing Tests
// ───────────────────────────────────────────────────────────────

console.log('Slack Channel Routing (routeByChannel)');
console.log('──────────────────────────────────────');

beforeEach();

// Setup routing table
addSlackChannelRoute('C_SWDEV2', 'swdev2');
addSlackChannelRoute('C_HR', 'hr');

assertEqual(
  routeByChannel('C_SWDEV2'),
  'swdev2',
  'Routes C_SWDEV2 → swdev2'
);

assertEqual(
  routeByChannel('C_HR'),
  'hr',
  'Routes C_HR → hr'
);

assertEqual(
  routeByChannel('C_UNKNOWN'),
  null,
  'Returns null for unknown channel'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Slack Mention Extraction Tests
// ───────────────────────────────────────────────────────────────

console.log('Slack Mention Extraction (extractSlackMentions)');
console.log('───────────────────────────────────────────────');

beforeEach();

assertArrayEqual(
  extractSlackMentions('@swdev2 help me with this'),
  ['@swdev2'],
  'Extracts raw @mention'
);

assertArrayEqual(
  extractSlackMentions('<@U123ABC>'),
  ['U123ABC'],
  'Extracts Slack user ID mention'
);

assertArrayEqual(
  extractSlackMentions('<@U123ABC|username>'),
  ['U123ABC'],
  'Extracts Slack user ID with display name'
);

assertArrayEqual(
  extractSlackMentions('@swdev2 and @finance please help'),
  ['@swdev2', '@finance'],
  'Extracts multiple mentions'
);

assertArrayEqual(
  extractSlackMentions('no mentions here'),
  [],
  'Returns empty array for no mentions'
);

assertArrayEqual(
  extractSlackMentions(null),
  [],
  'Handles null input'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Conversation Key Tests
// ───────────────────────────────────────────────────────────────

console.log('Conversation Key Generation');
console.log('───────────────────────────');

beforeEach();

assertEqual(
  conversationKey('gmail', { threadId: 'thread123', messageId: 'msg456' }),
  'gmail::thread123',
  'Gmail: uses threadId'
);

assertEqual(
  conversationKey('gmail', { messageId: 'msg456' }),
  'gmail::msg456',
  'Gmail: falls back to messageId'
);

assertEqual(
  conversationKey('slack', { channelId: 'C123', threadTs: '1234567890.123456', ts: '1234567890.000000' }),
  'slack::C123::1234567890.123456',
  'Slack: uses channelId + threadTs'
);

assertEqual(
  conversationKey('slack', { channelId: 'C123', ts: '1234567890.000000' }),
  'slack::C123::1234567890.000000',
  'Slack: falls back to ts for non-threaded'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Tenant Config Initialization Tests
// ───────────────────────────────────────────────────────────────

console.log('Tenant Config Initialization');
console.log('────────────────────────────');

beforeEach();

const testTenantConfig = {
  tenant_id: 'test-tenant',
  name: 'Test Tenant',
  channels: {
    email: {
      enabled: true,
      connector_id: 'gmail',
      routing: {
        mode: 'dedicated_mailbox',
        rules: [
          { address: 'support@test.com', skill_slug: 'support' },
          { address: 'sales@test.com', skill_slug: 'sales' },
        ],
      },
    },
    slack: {
      enabled: true,
      connector_id: 'slack',
      workspace_id: 'W123',
      routing: {
        mode: 'mention_based',
        rules: [
          { mention_handle: '@support', skill_slug: 'support' },
          { mention_handle: '@sales', skill_slug: 'sales' },
        ],
      },
    },
  },
  policies: {
    allow_external_users: true,
  },
};

initializeTenantConfig(testTenantConfig);

assertEqual(
  routeByToAddress('support@test.com'),
  'support',
  'Email routing initialized from tenant config'
);

assertEqual(
  routeByToAddress('sales@test.com'),
  'sales',
  'Multiple email routes initialized'
);

assertEqual(
  routeByMention('@support'),
  'support',
  'Slack mention routing initialized from tenant config'
);

assertEqual(
  routeByMention('@sales'),
  'sales',
  'Multiple Slack mention routes initialized'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Job Metadata Builder Tests
// ───────────────────────────────────────────────────────────────

console.log('Job Metadata Builder');
console.log('────────────────────');

beforeEach();

const mockInboundEvent = {
  provider: 'gmail',
  senderIdentity: { provider: 'gmail', externalId: 'alice@company.com' },
  senderActorId: 'actor-alice-123',
  targetSkillSlug: 'swdev2',
  skillActorId: 'actor-swdev2-456',
  conversationKey: 'gmail::thread123',
  messageText: 'Help me with this',
  replyContext: {
    type: 'email',
    to: 'alice@company.com',
    threadId: 'thread123',
  },
};

const jobMetadata = buildJobMetadata('job-789', mockInboundEvent);

assertEqual(
  jobMetadata.jobId,
  'job-789',
  'Job ID set correctly'
);

assertEqual(
  jobMetadata.ownerActorId,
  'actor-alice-123',
  'Owner is sender actor (invariant: ownerActorId = senderActorId)'
);

assertEqual(
  jobMetadata.skillActorId,
  'actor-swdev2-456',
  'Skill actor set correctly'
);

assertEqual(
  jobMetadata.channel,
  'gmail',
  'Channel set correctly'
);

assertEqual(
  jobMetadata.onBehalfOfActorId,
  null,
  'No delegation by default'
);

// Test with delegation
const jobMetadataWithDelegation = buildJobMetadata('job-999', mockInboundEvent, {
  onBehalfOfActorId: 'actor-bob-111',
  delegationChain: ['actor-bob-111', 'actor-alice-123'],
});

assertEqual(
  jobMetadataWithDelegation.ownerActorId,
  'actor-alice-123',
  'Owner unchanged with delegation (invariant: owner = sender)'
);

assertEqual(
  jobMetadataWithDelegation.onBehalfOfActorId,
  'actor-bob-111',
  'onBehalfOfActorId recorded for audit'
);

assertArrayEqual(
  jobMetadataWithDelegation.delegationChain,
  ['actor-bob-111', 'actor-alice-123'],
  'Delegation chain preserved'
);

console.log('');

// ───────────────────────────────────────────────────────────────
// Test Harness Matrix - Scenario A1: Human → Skill (Gmail)
// ───────────────────────────────────────────────────────────────

console.log('Test Harness: A1 - Human → Skill (Gmail)');
console.log('────────────────────────────────────────');

beforeEach();

addEmailRoute('swdev2@yourdomain.com', 'swdev2');

const a1SkillSlug = routeByToAddress('swdev2@yourdomain.com');
assertEqual(a1SkillSlug, 'swdev2', 'Skill resolved: swdev2');

// Simulate: senderActorId would be resolved by resolveActor('gmail', 'alice@company.com')
// For pure routing tests, we verify the routing logic works

const a1Event = {
  provider: 'gmail',
  senderActorId: 'alice-actor-id',
  targetSkillSlug: a1SkillSlug,
  skillActorId: 'swdev2-actor-id',
  conversationKey: conversationKey('gmail', { threadId: 'thread-a1' }),
  replyContext: { type: 'email', to: 'alice@company.com', threadId: 'thread-a1' },
};

const a1JobMeta = buildJobMetadata('job-a1', a1Event);
assertEqual(a1JobMeta.ownerActorId, 'alice-actor-id', 'Job owner is Alice (human sender)');
assertEqual(a1JobMeta.skillActorId, 'swdev2-actor-id', 'Skill actor is swdev2');
assertEqual(a1JobMeta.replyContext.to, 'alice@company.com', 'Reply to: alice@company.com');

console.log('');

// ───────────────────────────────────────────────────────────────
// Test Harness Matrix - Scenario B1: Agent → Skill (Gmail)
// ───────────────────────────────────────────────────────────────

console.log('Test Harness: B1 - Agent → Skill (Gmail)');
console.log('────────────────────────────────────────');

beforeEach();

addEmailRoute('hr@yourdomain.com', 'hr');

const b1SkillSlug = routeByToAddress('hr@yourdomain.com');
assertEqual(b1SkillSlug, 'hr', 'Skill resolved: hr');

// Agent-A sends email to HR skill
const b1Event = {
  provider: 'gmail',
  senderActorId: 'agent-a-actor-id', // Agent actor, not human
  targetSkillSlug: b1SkillSlug,
  skillActorId: 'hr-actor-id',
  conversationKey: conversationKey('gmail', { threadId: 'thread-b1' }),
  replyContext: { type: 'email', to: 'agent-a@yourdomain.com', threadId: 'thread-b1' },
};

const b1JobMeta = buildJobMetadata('job-b1', b1Event);
assertEqual(b1JobMeta.ownerActorId, 'agent-a-actor-id', 'Job owner is Agent-A (sender is agent)');
assertEqual(b1JobMeta.skillActorId, 'hr-actor-id', 'Skill actor is hr');

console.log('');

// ───────────────────────────────────────────────────────────────
// Test Harness Matrix - Scenario C1: Human → Skill (Slack)
// ───────────────────────────────────────────────────────────────

console.log('Test Harness: C1 - Human → Skill (Slack mention)');
console.log('────────────────────────────────────────────────');

beforeEach();

addSlackMentionRoute('@swdev2', 'swdev2');

const c1Mentions = extractSlackMentions('@swdev2 help me');
assertEqual(c1Mentions.length, 1, 'One mention extracted');

const c1SkillSlug = routeByMention(c1Mentions[0]);
assertEqual(c1SkillSlug, 'swdev2', 'Skill resolved: swdev2');

const c1Event = {
  provider: 'slack',
  senderActorId: 'alice-actor-id',
  targetSkillSlug: c1SkillSlug,
  skillActorId: 'swdev2-actor-id',
  conversationKey: conversationKey('slack', { channelId: 'C123', ts: '1234567890.000' }),
  replyContext: { type: 'slack', channelId: 'C123', threadTs: '1234567890.000' },
};

const c1JobMeta = buildJobMetadata('job-c1', c1Event);
assertEqual(c1JobMeta.ownerActorId, 'alice-actor-id', 'Job owner is Alice');
assertEqual(c1JobMeta.channel, 'slack', 'Channel is slack');

console.log('');

// ───────────────────────────────────────────────────────────────
// Test Harness Matrix - Scenario E1: Delegation
// ───────────────────────────────────────────────────────────────

console.log('Test Harness: E1 - Delegation (Agent acting for Human)');
console.log('───────────────────────────────────────────────────────');

beforeEach();

addSlackMentionRoute('@finance', 'finance');

// Agent-A contacts finance skill on behalf of Alice
const e1Event = {
  provider: 'slack',
  senderActorId: 'agent-a-actor-id', // Agent is the actual sender
  targetSkillSlug: 'finance',
  skillActorId: 'finance-actor-id',
  conversationKey: conversationKey('slack', { channelId: 'C_FIN', ts: '9999.000' }),
  replyContext: { type: 'slack', channelId: 'C_FIN', threadTs: '9999.000' },
};

const e1JobMeta = buildJobMetadata('job-e1', e1Event, {
  onBehalfOfActorId: 'alice-actor-id',
  delegationChain: ['alice-actor-id', 'agent-a-actor-id'],
});

assertEqual(e1JobMeta.ownerActorId, 'agent-a-actor-id', 'Owner = Agent-A (actual sender)');
assertEqual(e1JobMeta.onBehalfOfActorId, 'alice-actor-id', 'onBehalfOf = Alice (audit)');
assertArrayEqual(
  e1JobMeta.delegationChain,
  ['alice-actor-id', 'agent-a-actor-id'],
  'Delegation chain preserved for ACL checks'
);

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
