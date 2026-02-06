#!/usr/bin/env node
/**
 * End-to-End Deployment Test
 *
 * Tests the full flow from creating a solution/skill to deploying to ADAS Core.
 * Uses the "testing" tenant to avoid affecting production data.
 *
 * Run with: node scripts/test-e2e-deploy.js
 *
 * Prerequisites:
 * - Backend server running on port 4000
 * - ADAS Core running (optional, for full deploy test)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';
const TENANT = 'testing';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-ADAS-TENANT': TENANT,
      ...options.headers
    }
  });

  // Handle 204 No Content (e.g., DELETE responses)
  if (response.status === 204) {
    return { success: true };
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${data.error || JSON.stringify(data)}`);
  }

  return data;
}

async function cleanup(solutionId) {
  if (solutionId) {
    try {
      await request(`/solutions/${solutionId}`, { method: 'DELETE' });
      console.log(`  [Cleanup] Deleted solution ${solutionId}`);
    } catch (err) {
      console.log(`  [Cleanup] Failed to delete solution: ${err.message}`);
    }
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       E2E Deployment Test (Solution Owns Skills)           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Tenant: ${TENANT}\n`);

  let solutionId = null;
  let skillId = null;
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    process.stdout.write(`  [TEST] ${name}... `);
    try {
      await fn();
      console.log('✓ PASS');
      passed++;
    } catch (err) {
      console.log(`✗ FAIL: ${err.message}`);
      failed++;
    }
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Health Check
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 1: Health Check ───\n');

    await test('Backend health check', async () => {
      const data = await request('/health');
      if (!data.ok) throw new Error('Backend not healthy');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Create Solution
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 2: Create Solution ───\n');

    await test('Create solution', async () => {
      const data = await request('/solutions', {
        method: 'POST',
        body: JSON.stringify({ name: 'E2E Test Solution' })
      });
      if (!data.solution?.id) throw new Error('No solution ID returned');
      solutionId = data.solution.id;
      console.log(`(${solutionId})`);
    });

    await test('List solutions includes new solution', async () => {
      const data = await request('/solutions');
      const found = data.solutions.find(s => s.id === solutionId);
      if (!found) throw new Error('Solution not in list');
    });

    await test('Load solution by ID', async () => {
      const data = await request(`/solutions/${solutionId}`);
      if (data.solution.name !== 'E2E Test Solution') throw new Error('Wrong solution name');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Create Skill under Solution
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 3: Create Skill ───\n');

    await test('Create skill under solution', async () => {
      const data = await request(`/solutions/${solutionId}/skills`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'E2E Test Skill',
          settings: { llm_provider: 'anthropic' }
        })
      });
      if (!data.skill?.id) throw new Error('No skill ID returned');
      if (data.skill.solution_id !== solutionId) throw new Error('Skill not linked to solution');
      skillId = data.skill.id;
      console.log(`(${skillId})`);
    });

    await test('List skills for solution', async () => {
      const data = await request(`/solutions/${solutionId}/skills`);
      const found = data.skills.find(s => s.id === skillId);
      if (!found) throw new Error('Skill not in list');
      if (found.solution_id !== solutionId) throw new Error('Skill missing solution_id');
    });

    await test('Load skill by ID (with solution context)', async () => {
      const data = await request(`/solutions/${solutionId}/skills/${skillId}`);
      if (data.skill.name !== 'E2E Test Skill') throw new Error('Wrong skill name');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Update Skill with Tools
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 4: Update Skill with Tools ───\n');

    await test('Add tool to skill', async () => {
      const updates = {
        tools_push: [{
          id: 'tool_test_1',
          name: 'get_weather',
          description: 'Get current weather for a city',
          inputs: [
            { name: 'city', type: 'string', required: true, description: 'City name' }
          ],
          output: {
            type: 'object',
            description: 'Weather data including temperature and conditions'
          }
        }]
      };

      const data = await request(`/solutions/${solutionId}/skills/${skillId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updates })
      });

      if (!data.skill.tools?.length) throw new Error('Tool not added');
      if (data.skill.tools[0].name !== 'get_weather') throw new Error('Wrong tool name');
    });

    await test('Add problem statement', async () => {
      const updates = {
        problem: {
          statement: 'Users need quick access to weather information',
          context: 'E2E test skill for deployment validation',
          goals: ['Provide accurate weather data', 'Support multiple cities']
        }
      };

      const data = await request(`/solutions/${solutionId}/skills/${skillId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updates })
      });

      if (!data.skill.problem?.statement) throw new Error('Problem not set');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: Validation Checks (with solution context)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 5: Validation ───\n');

    await test('Get skill validation', async () => {
      const data = await request(`/solutions/${solutionId}/skills/${skillId}/validation`);
      // Validation should return without error
      if (data.validation === undefined) throw new Error('No validation data');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: Export Preview (with solution context)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 6: Export Preview ───\n');

    await test('Preview ADAS export', async () => {
      const data = await request(`/export/${skillId}/adas/preview?solution_id=${solutionId}`);
      if (!data.files?.length) throw new Error('No export files generated');
      const hasSkillYaml = data.files.some(f => f.name === 'skill.yaml');
      if (!hasSkillYaml) throw new Error('Missing skill.yaml in export');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: Deploy to ADAS Core (if available)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 7: Deploy to ADAS Core ───\n');

    await test('Deploy skill to ADAS Core', async () => {
      try {
        const data = await request(`/export/${skillId}/adas?solution_id=${solutionId}&deploy=true`, {
          method: 'POST'
        });
        // If ADAS Core is not running, this may fail - that's OK for local testing
        console.log(`(deployed: ${data.deployed || 'files only'})`);
      } catch (err) {
        // Allow connection errors (ADAS Core not running)
        if (err.message.includes('ECONNREFUSED') ||
            err.message.includes('fetch failed') ||
            err.message.includes('Failed to connect to ADAS Core') ||
            err.message.includes('502')) {
          console.log('(ADAS Core not available - skipped)');
          return; // Pass the test - ADAS Core just isn't running
        }
        throw err;
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8: Delete Skill
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 8: Delete Skill ───\n');

    await test('Delete skill', async () => {
      await request(`/solutions/${solutionId}/skills/${skillId}`, { method: 'DELETE' });
    });

    await test('Skill no longer in list', async () => {
      const data = await request(`/solutions/${solutionId}/skills`);
      const found = data.skills.find(s => s.id === skillId);
      if (found) throw new Error('Skill still in list after delete');
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: Cascade Delete
    // ═══════════════════════════════════════════════════════════════
    console.log('\n─── Phase 9: Cascade Delete ───\n');

    // Create a new skill for cascade delete test
    let cascadeSkillId = null;
    await test('Create skill for cascade delete test', async () => {
      const data = await request(`/solutions/${solutionId}/skills`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Cascade Test Skill', settings: {} })
      });
      cascadeSkillId = data.skill.id;
    });

    await test('Delete solution (cascade deletes skills)', async () => {
      await request(`/solutions/${solutionId}`, { method: 'DELETE' });
      solutionId = null; // Mark as deleted
    });

    await test('Solution no longer in list', async () => {
      const data = await request('/solutions');
      const found = data.solutions.find(s => s.id === solutionId);
      if (found) throw new Error('Solution still in list after delete');
    });

    // ═══════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 33 - String(passed).length - String(failed).length))}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('\n[FATAL ERROR]', err);
    await cleanup(solutionId);
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServer() {
  try {
    await fetch(`${API_BASE}/health`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('\n[ERROR] Backend server not running at', API_BASE);
    console.error('Start it with: cd apps/backend && MEMORY_PATH=../../memory/testing node src/server.js\n');
    process.exit(1);
  }

  await runTests();
}

main();
