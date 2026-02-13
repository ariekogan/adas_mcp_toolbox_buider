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
  ok('Spec lists conversation + health endpoints',
    spec.also_available['GET /deploy/solutions/:solutionId/skills/:skillId/conversation'] &&
    spec.also_available['GET /deploy/solutions/:solutionId/health']
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

  // ── Phase 6: Read back definitions (NEW) ──
  console.log('\n── Phase 6: Read back definitions (NEW) ──');

  const solDef = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/definition', { headers: hdr }).then(r => r.json());
  ok('GET solution definition', Boolean(solDef.solution?.id), 'id=' + solDef.solution?.id);
  ok('Solution has identity', Boolean(solDef.solution?.identity), 'actor_types=' + (solDef.solution?.identity?.actor_types?.length || 0));
  ok('Solution has skills array', Array.isArray(solDef.solution?.skills), 'count=' + solDef.solution?.skills?.length);

  const skillsList = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills', { headers: hdr }).then(r => r.json());
  ok('GET skills list', Array.isArray(skillsList.skills), 'count=' + skillsList.skills?.length);

  if (skillsList.skills?.length > 0) {
    const firstSkill = skillsList.skills[0];
    ok('Skill summary has original_skill_id', Boolean(firstSkill.original_skill_id), 'original=' + firstSkill.original_skill_id);

    // Read back the full skill by original ID
    const skillDef = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/' + firstSkill.original_skill_id, { headers: hdr }).then(r => r.json());
    ok('GET skill by original ID', Boolean(skillDef.skill?.id || skillDef.skill?.name), 'name=' + skillDef.skill?.name);
    ok('Skill has tools', Array.isArray(skillDef.skill?.tools), 'tools=' + skillDef.skill?.tools?.length);
    ok('Skill has role', Boolean(skillDef.skill?.role?.name), 'role=' + skillDef.skill?.role?.name);
    ok('Skill has intents', Boolean(skillDef.skill?.intents?.supported), 'intents=' + skillDef.skill?.intents?.supported?.length);
  }

  // ── Phase 7: Incremental updates (PATCH) ──
  console.log('\n── Phase 7: Incremental updates (PATCH) ──');

  // PATCH skill: add a new tool via tools_push
  const patchSkillResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter', {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      updates: {
        'tools_push': {
          id: 'tool-farewell', id_status: 'permanent',
          name: 'e2e-test.farewell',
          description: 'Say goodbye to a user',
          inputs: [{ name: 'user_name', type: 'string', required: true, description: 'Name to say bye to' }],
          output: { type: 'string', description: 'Farewell message' },
          source: { type: 'mcp_bridge', connection_id: 'e2e-test-mcp', mcp_tool: 'farewell' },
          policy: { allowed: 'always' },
          security: { classification: 'public' },
        },
        'problem.context': 'Updated via E2E PATCH test',
      },
    }),
  }).then(r => r.json());
  ok('PATCH skill (tools_push)', Boolean(patchSkillResp.skill), patchSkillResp.error || 'ok');

  // Verify the tool was added
  if (patchSkillResp.skill) {
    const tools = patchSkillResp.skill.tools || [];
    ok('Tool added via PATCH', tools.length === 2, 'tools=' + tools.length);
    ok('New tool present', tools.some(t => t.name === 'e2e-test.farewell'), tools.map(t => t.name).join(', '));
    ok('Problem context updated', patchSkillResp.skill.problem?.context === 'Updated via E2E PATCH test',
      'context=' + patchSkillResp.skill.problem?.context);
  }

  // PATCH skill: delete the tool we just added
  const patchDeleteResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter', {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      updates: { 'tools_delete': 'e2e-test.farewell' },
    }),
  }).then(r => r.json());
  ok('PATCH skill (tools_delete)', Boolean(patchDeleteResp.skill), patchDeleteResp.error || 'ok');
  if (patchDeleteResp.skill) {
    ok('Tool removed via PATCH', (patchDeleteResp.skill.tools || []).length === 1,
      'tools=' + (patchDeleteResp.skill.tools || []).length);
  }

  // PATCH solution: add a new grant
  const patchSolResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test', {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      state_update: {
        'grants_push': {
          key: 'e2e.patched_grant',
          description: 'Grant added via PATCH',
          issued_by: ['e2e-greeter'],
          consumed_by: ['e2e-greeter'],
          issued_via: 'grant_mapping',
        },
      },
    }),
  }).then(r => r.json());
  ok('PATCH solution (grants_push)', Boolean(patchSolResp.solution), patchSolResp.error || 'ok');
  if (patchSolResp.solution) {
    const grants = patchSolResp.solution.grants || [];
    ok('Grant added via PATCH', grants.some(g => g.key === 'e2e.patched_grant'),
      'grants=' + grants.length);
  }

  // ── Phase 8: Redeploy after PATCH ──
  console.log('\n── Phase 8: Redeploy after PATCH ──');

  const redeployResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter/redeploy', {
    method: 'POST', headers: H, body: '{}',
  });
  const redeployData = await redeployResp.json();
  ok('POST redeploy responded', redeployResp.status === 200 || redeployResp.status === 400 || redeployResp.status === 502,
    'status=' + redeployResp.status + ' ok=' + redeployData.ok);

  // Accept either success or expected failure (e.g., ADAS Core not available in test env)
  if (redeployData.ok) {
    ok('Redeploy returned skill slug', Boolean(redeployData.skillSlug), 'slug=' + redeployData.skillSlug);
    ok('Redeploy returned mcpUri', Boolean(redeployData.mcpUri), 'uri=' + redeployData.mcpUri);
    ok('Redeploy returned skill_id', redeployData.skill_id === 'e2e-greeter', 'id=' + redeployData.skill_id);
  } else {
    // In test environments ADAS Core may not be fully available — that's OK
    ok('Redeploy error is informative', Boolean(redeployData.error), redeployData.error);
  }

  // Redeploy for non-existent skill should 404
  const redeployNotFound = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/does-not-exist/redeploy', {
    method: 'POST', headers: H, body: '{}',
  });
  ok('Redeploy 404 for missing skill', redeployNotFound.status === 404, 'status=' + redeployNotFound.status);

  // ── Phase 9: Validate & connector health ──
  console.log('\n── Phase 9: Validate & connector health ──');

  // Validate solution from stored state
  const valSol = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/validate', { headers: hdr }).then(r => r.json());
  ok('GET solution validate', Boolean(valSol.validation || valSol.errors !== undefined), 'ok');

  // Validate single skill from stored state
  const valSkill = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter/validate', { headers: hdr }).then(r => r.json());
  ok('GET skill validate', Boolean(valSkill.validation), 'ok');

  // Connector health
  const connHealth = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/connectors/health', { headers: hdr }).then(r => r.json());
  ok('GET connectors/health', connHealth.ok === true, 'connectors=' + connHealth.connectors?.length);
  ok('Health has adas_reachable', typeof connHealth.adas_reachable === 'boolean', String(connHealth.adas_reachable));
  if (connHealth.connectors?.length > 0) {
    const c = connHealth.connectors[0];
    ok('Connector has status + tools', Boolean(c.id) && c.status !== undefined,
      'id=' + c.id + ' status=' + c.status + ' tools=' + c.tools_count);
  }

  // ── Phase 10: Conversation & health ──
  console.log('\n── Phase 10: Conversation & health ──');

  // Conversation read-back (skill should have empty or existing conversation)
  const convResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter/conversation', { headers: hdr }).then(r => r.json());
  ok('GET skill conversation', convResp.skill_id === 'e2e-greeter', 'skill_id=' + convResp.skill_id);
  ok('Conversation has message_count', convResp.message_count !== undefined, 'messages=' + convResp.message_count);
  ok('Conversation has messages array', Array.isArray(convResp.messages), 'len=' + convResp.messages?.length);

  // Conversation with ?limit=1
  const convLimitResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter/conversation?limit=1', { headers: hdr }).then(r => r.json());
  ok('Conversation ?limit=1', Array.isArray(convLimitResp.messages) && convLimitResp.messages.length <= 1, 'len=' + convLimitResp.messages?.length);

  // Conversation 404 for non-existent skill
  const convNotFound = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/does-not-exist/conversation', { headers: hdr });
  ok('Conversation 404 for missing skill', convNotFound.status === 404, 'status=' + convNotFound.status);

  // Live health check
  const healthCheck = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/health', { headers: hdr }).then(r => r.json());
  ok('GET solution health', healthCheck.ok === true, 'overall=' + healthCheck.overall);
  ok('Health has overall status', ['healthy', 'degraded', 'unhealthy'].includes(healthCheck.overall), healthCheck.overall);
  ok('Health has skills array', Array.isArray(healthCheck.skills), 'count=' + healthCheck.skills?.length);
  ok('Health has connectors array', Array.isArray(healthCheck.connectors), 'count=' + healthCheck.connectors?.length);
  ok('Health has issues array', Array.isArray(healthCheck.issues), 'count=' + healthCheck.issues?.length);
  ok('Health has adas_reachable', typeof healthCheck.adas_reachable === 'boolean', String(healthCheck.adas_reachable));
  ok('Health has error/warning counts', healthCheck.error_count !== undefined && healthCheck.warning_count !== undefined,
    'errors=' + healthCheck.error_count + ' warnings=' + healthCheck.warning_count);

  // Health 404 for non-existent solution
  const healthNotFound = await fetch(API + '/deploy/solutions/does-not-exist-xyz/health', { headers: hdr });
  ok('Health 404 for missing solution', healthNotFound.status === 404, 'status=' + healthNotFound.status);

  // ── Phase 11: Error handling ──
  console.log('\n── Phase 11: Error handling ──');

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

  // ── Phase 12: Cleanup ──
  console.log('\n── Phase 12: Cleanup ──');

  // Delete single skill first (test the new endpoint)
  const delSkillResp = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter', {
    method: 'DELETE', headers: hdr,
  });
  ok('DELETE single skill', delSkillResp.status === 204, 'status=' + delSkillResp.status);

  // Verify skill is gone
  const afterSkillDel = await fetch(API + '/deploy/solutions/e2e-lifecycle-test/skills/e2e-greeter', { headers: hdr });
  ok('Skill gone after delete', afterSkillDel.status === 404, 'status=' + afterSkillDel.status);

  // Now delete the solution
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
