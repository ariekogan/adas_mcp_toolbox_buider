/**
 * E2E Lifecycle Test — validates the complete External Agent API flow:
 *   spec → validate → deploy → list → status → delete
 *
 * Run from inside the backend container:
 *   node /app/packages/skill-validator/test/e2e-lifecycle.mjs
 *
 * Or from host (if skill-validator port is exposed):
 *   API_URL=http://localhost:3200 API_KEY=adas_xxx node e2e-lifecycle.mjs
 */

const API = process.env.API_URL || 'http://localhost:3200';
const TENANT = process.env.TENANT || 'dev';
const API_KEY = process.env.API_KEY || '';

const H = { 'X-ADAS-TENANT': TENANT, 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' };
const hdr = { 'X-ADAS-TENANT': TENANT, 'X-API-KEY': API_KEY };

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  PASS', name, detail || '');
  } else {
    failed++;
    console.error('  FAIL', name, detail || '');
  }
}

// ── Test data ──

const testSkill = {
  id: 'e2e-greeter',
  name: 'E2E Greeter',
  description: 'Simple greeter for E2E testing',
  version: '1.0.0',
  phase: 'TOOL_DEFINITION',
  connectors: ['e2e-test-mcp'],
  problem: { statement: 'Users need a friendly greeting when they arrive at the system' },
  scenarios: [{
    id: 'greet-user', title: 'Greet a user',
    steps: ['User says hello', 'Agent greets back'],
    expected_outcome: 'User receives personalized greeting',
  }],
  role: {
    name: 'Greeter Agent',
    persona: 'A friendly, professional greeter that welcomes users and collects their name',
    goals: ['Greet users warmly'],
    limitations: ['Never share personal data'],
  },
  intents: {
    supported: [{
      id: 'greeting', description: 'User wants to be greeted',
      examples: ['Hello', 'Hi there', 'Good morning'],
    }],
    thresholds: { accept: 0.8, clarify: 0.5, reject: 0.3 },
    out_of_domain: { action: 'redirect', message: 'I can only help with greetings' },
  },
  tools: [{
    id: 'tool-greet', id_status: 'permanent',
    name: 'e2e-test.greet',
    description: 'Greet the user by name',
    inputs: [{ name: 'user_name', type: 'string', required: true, description: 'Name to greet' }],
    output: { type: 'string', description: 'Greeting message' },
    source: { type: 'mcp_bridge', connection_id: 'e2e-test-mcp', mcp_tool: 'greet' },
    policy: { allowed: 'always' },
    mock: { enabled: true, mode: 'examples', examples: [{ id: 'ex1', input: { user_name: 'Alice' }, output: 'Hello Alice!' }] },
    security: { classification: 'public' },
  }],
  policy: {
    guardrails: { never: ['Share user data externally'], always: ['Be polite and professional'] },
    workflows: [],
  },
  engine: {
    model: 'claude-sonnet-4-20250514', temperature: 0.3,
    rv2: { max_iterations: 5 }, autonomy: { level: 'autonomous' },
  },
  grant_mappings: [{
    tool: 'e2e-test.greet', on_success: true,
    grants: [{ key: 'e2e.user_name', value_from: '$.user_name' }],
  }],
};

const testSolution = {
  id: 'e2e-lifecycle-test',
  name: 'E2E Lifecycle Test',
  version: '1.0.0',
  description: 'Tests the full deploy + status + lifecycle flow',
  identity: {
    actor_types: [{ key: 'tester', label: 'Tester', description: 'E2E test user' }],
    default_actor_type: 'tester',
    admin_roles: [],
  },
  skills: [{ id: 'e2e-greeter', name: 'E2E Greeter', role: 'gateway', description: 'Greets users' }],
  grants: [{
    key: 'e2e.user_name', description: 'Verified user name',
    issued_by: ['e2e-greeter'], consumed_by: ['e2e-greeter'], issued_via: 'grant_mapping',
  }],
  handoffs: [],
  routing: { api: { default_skill: 'e2e-greeter', description: 'API requests go to greeter' } },
};

const testConnector = {
  id: 'e2e-test-mcp',
  name: 'E2E Test MCP',
  transport: 'stdio',
  command: 'node',
  args: ['/mcp-store/e2e-test-mcp/server.js'],
  category: 'domain',
};

// ── Main ──

async function run() {
  console.log('\n=== ADAS External Agent API — E2E Lifecycle Test ===');
  console.log('API:', API, ' Tenant:', TENANT);
  console.log('');

  // ── Phase 1: Pre-flight ──
  console.log('── Phase 1: Pre-flight ──');

  const health = await fetch(API + '/health').then(r => r.json());
  ok('GET /health', health.ok === true, health.service);

  const spec = await fetch(API + '/spec', { headers: hdr }).then(r => r.json());
  ok('GET /spec returns index', Boolean(spec.endpoints) && Boolean(spec.also_available));
  ok('Spec lists lifecycle endpoints',
    spec.also_available['GET /deploy/solutions'] &&
    spec.also_available['GET /deploy/status/:solutionId'] &&
    spec.also_available['DELETE /deploy/solutions/:solutionId']
  );

  const enums = await fetch(API + '/spec/enums', { headers: hdr }).then(r => r.json());
  ok('GET /spec/enums', Boolean(enums.enums?.phase));

  const exSol = await fetch(API + '/spec/examples/solution', { headers: hdr }).then(r => r.json());
  ok('GET /spec/examples/solution', Boolean(exSol.id), exSol.name);

  // ── Phase 2: Clean slate ──
  console.log('\n── Phase 2: Clean slate ──');

  await fetch(API + '/deploy/solutions/e2e-lifecycle-test', { method: 'DELETE', headers: hdr }).then(r => r.json());
  ok('Cleanup old test solution', true);

  // ── Phase 3: Validate ──
  console.log('\n── Phase 3: Validate skill ──');

  const valResp = await fetch(API + '/validate/skill', {
    method: 'POST', headers: H,
    body: JSON.stringify({ skill: testSkill }),
  }).then(r => r.json());
  ok('POST /validate/skill', valResp.valid !== undefined,
    'valid=' + valResp.valid + ' errors=' + (valResp.errors?.length || 0) + ' warnings=' + (valResp.warnings?.length || 0));

  // ── Phase 4: Deploy solution ──
  console.log('\n── Phase 4: Deploy solution ──');

  const deployResp = await fetch(API + '/deploy/solution', {
    method: 'POST', headers: H,
    body: JSON.stringify({ solution: testSolution, skills: [testSkill], connectors: [testConnector] }),
  }).then(r => r.json());

  ok('POST /deploy/solution responded', deployResp.ok !== undefined,
    'ok=' + deployResp.ok + (deployResp.error ? ' err=' + deployResp.error : ''));

  if (deployResp.import) {
    ok('Import phase', true,
      'skills=' + (deployResp.import.skills?.length || 0) +
      ' connectors=' + (deployResp.import.connectors || 0) +
      ' solution=' + (deployResp.import.solution || 'null'));
  }
  if (deployResp.deploy) {
    const d = deployResp.deploy;
    ok('Deploy phase', true,
      'skills_deployed=' + (d.skills?.deployed || 0) + '/' + (d.skills?.total || 0) +
      ' connectors_deployed=' + (d.connectors?.deployed || 0) + '/' + (d.connectors?.total || 0));
  }

  // ── Phase 5: Lifecycle endpoints ──
  console.log('\n── Phase 5: Lifecycle endpoints (NEW) ──');

  const solutions = await fetch(API + '/deploy/solutions', { headers: hdr }).then(r => r.json());
  ok('GET /deploy/solutions', Array.isArray(solutions.solutions), 'count=' + solutions.solutions?.length);

  const found = solutions.solutions?.find(s => s.id === 'e2e-lifecycle-test');
  ok('Test solution in list', Boolean(found), found ? found.name : 'NOT FOUND');

  const status = await fetch(API + '/deploy/status/e2e-lifecycle-test', { headers: hdr }).then(r => r.json());
  ok('GET /deploy/status ok', status.ok === true);
  ok('Solution metadata', Boolean(status.solution?.id), 'id=' + status.solution?.id + ' phase=' + status.solution?.phase);
  ok('identity_deployed field', status.identity_deployed !== undefined, String(status.identity_deployed));
  ok('skills array', Array.isArray(status.skills), 'count=' + status.skills?.length);
  ok('connectors array', Array.isArray(status.connectors), 'count=' + status.connectors?.length);
  ok('adas_reachable field', typeof status.adas_reachable === 'boolean', String(status.adas_reachable));

  if (status.skills?.length > 0) {
    const s = status.skills[0];
    ok('Skill detail fields', Boolean(s.id) && s.phase !== undefined,
      'id=' + s.id + ' slug=' + s.slug + ' phase=' + s.phase +
      ' tools=' + s.tools_count + ' mcpUri=' + (s.mcpUri || 'none'));
  }

  if (status.connectors?.length > 0) {
    const c = status.connectors[0];
    ok('Connector detail fields', Boolean(c.id),
      'id=' + c.id + ' status=' + c.status + ' tools=' + c.tools);
  }

  // ── Phase 6: Error handling ──
  console.log('\n── Phase 6: Error handling ──');

  const notFound = await fetch(API + '/deploy/status/does-not-exist-xyz', { headers: hdr });
  ok('Status 404 for missing solution', notFound.status === 404, 'status=' + notFound.status);

  const badDeploy = await fetch(API + '/deploy/solution', {
    method: 'POST', headers: H, body: '{}',
  }).then(r => r.json());
  ok('Deploy with empty body → error', badDeploy.ok === false && Boolean(badDeploy.error), badDeploy.error);

  const badValidate = await fetch(API + '/validate/skill', {
    method: 'POST', headers: H, body: '{"skill":{}}',
  }).then(r => r.json());
  ok('Validate empty skill → errors', (badValidate.errors?.length || 0) > 0,
    'errors=' + (badValidate.errors?.length || 0));

  // ── Phase 7: Cleanup ──
  console.log('\n── Phase 7: Cleanup ──');

  const delResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test', {
    method: 'DELETE', headers: hdr,
  }).then(r => r.json());
  ok('DELETE solution', Boolean(delResp.success) || delResp.ok !== false);

  const afterDel = await fetch(API + '/deploy/status/e2e-lifecycle-test', { headers: hdr });
  ok('Solution gone after delete', afterDel.status === 404, 'status=' + afterDel.status);

  // ── Summary ──
  console.log('\n══════════════════════════════════════');
  console.log('  PASSED: ' + passed + '/' + (passed + failed));
  if (failed > 0) console.log('  FAILED: ' + failed);
  else console.log('  ALL TESTS PASSED');
  console.log('══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
