import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import deployRoutes from '../src/routes/deploy.js';

// ═══════════════════════════════════════════════════════════════════════════
// SLUG REGEX TESTS (existing)
// ═══════════════════════════════════════════════════════════════════════════

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('deploy slug validation', () => {
  it('accepts valid slugs', () => {
    expect(SLUG_REGEX.test('order-support')).toBe(true);
    expect(SLUG_REGEX.test('identity-assurance-manager')).toBe(true);
    expect(SLUG_REGEX.test('a')).toBe(true);
    expect(SLUG_REGEX.test('skill1')).toBe(true);
    expect(SLUG_REGEX.test('my-skill-v2')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(SLUG_REGEX.test('Order_Support')).toBe(false);
    expect(SLUG_REGEX.test('order support')).toBe(false);
    expect(SLUG_REGEX.test('-leading')).toBe(false);
    expect(SLUG_REGEX.test('trailing-')).toBe(false);
    expect(SLUG_REGEX.test('')).toBe(false);
    expect(SLUG_REGEX.test('UPPERCASE')).toBe(false);
    expect(SLUG_REGEX.test('has_underscore')).toBe(false);
    expect(SLUG_REGEX.test('has.dots')).toBe(false);
    expect(SLUG_REGEX.test('double--dash')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY ROUTES E2E TESTS (Golden Path)
// Tests the new deploy routes that proxy through the Skill Builder.
// We mock global fetch to simulate Skill Builder responses.
// ═══════════════════════════════════════════════════════════════════════════

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/deploy', deployRoutes);
  return app;
}

function makeRequest(app, method, path, body) {
  return new Promise((resolve) => {
    const req = {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      req.body = JSON.stringify(body);
    }

    // Use supertest-like approach via app.handle
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const options = {
        hostname: 'localhost',
        port,
        path,
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
      };
      const request = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          server.close();
          resolve({
            status: res.statusCode,
            body: JSON.parse(data),
          });
        });
      });
      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  });
}

// SSE response builder
function makeSSE(events) {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

describe('deploy routes (golden path)', () => {
  const originalFetch = global.fetch;
  let fetchCalls;

  beforeEach(() => {
    fetchCalls = [];
    // Mock global fetch
    global.fetch = vi.fn(async (url, options) => {
      fetchCalls.push({ url, options });

      // Route to different mock responses based on URL
      if (url.includes('/api/import/solution-pack')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            package: { name: 'test-package', mcps: [] },
            skills: [{ id: 'test-skill', name: 'Test Skill', status: 'imported' }],
            solution: { id: 'sol-123', name: 'Test Solution', status: 'imported' },
          }),
          text: async () => 'ok',
        };
      }

      if (url.includes('/api/import/packages/') && url.includes('/deploy-all')) {
        const sseBody = makeSSE([
          { type: 'start', packageName: 'test-package', totalConnectors: 1, totalSkills: 1 },
          { type: 'connector_progress', connectorId: 'orders-mcp', status: 'done', step: 'done', tools: 3, message: '3 tools' },
          { type: 'skill_progress', skillId: 'test-skill', status: 'done', step: 'done', mcpUri: 'http://localhost:8100/mcp', message: 'Deployed' },
          {
            type: 'complete',
            connectors: { total: 1, deployed: 1, failed: 0 },
            skills: { total: 1, deployed: 1, failed: 0 },
            connectorResults: [{ id: 'orders-mcp', ok: true, tools: 3 }],
            skillResults: [{ id: 'test-skill', ok: true, mcpUri: 'http://localhost:8100/mcp' }],
          },
        ]);
        return {
          ok: true,
          text: async () => sseBody,
        };
      }

      // Unknown URL
      return { ok: false, status: 404, text: async () => 'Not found', statusText: 'Not Found' };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── POST /deploy/connector ──

  describe('POST /deploy/connector', () => {
    it('returns 400 when connector.id is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/connector', { connector: { name: 'Test' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing connector.id/);
    });

    it('returns 400 when connector.name is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/connector', { connector: { id: 'test-mcp' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing connector.name/);
    });

    it('proxies connector deploy through Skill Builder', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/connector', {
        connector: {
          id: 'orders-mcp',
          name: 'Orders MCP',
          transport: 'stdio',
          command: 'node',
          args: ['/mcp-store/orders-mcp/server.js'],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.connector_id).toBe('orders-mcp');
      expect(res.body.action).toBe('deployed_via_skill_builder');

      // Verify fetch was called with correct URLs
      expect(fetchCalls.length).toBe(2);
      expect(fetchCalls[0].url).toContain('/api/import/solution-pack');
      expect(fetchCalls[1].url).toContain('/api/import/packages/');
      expect(fetchCalls[1].url).toContain('/deploy-all');
    });

    it('sends connector data in manifest.mcps', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/connector', {
        connector: {
          id: 'orders-mcp',
          name: 'Orders MCP',
          transport: 'stdio',
          command: 'node',
          args: ['/mcp-store/orders-mcp/server.js'],
        },
      });

      // Check the import body
      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      expect(body.manifest.mcps).toHaveLength(1);
      expect(body.manifest.mcps[0].id).toBe('orders-mcp');
      expect(body.manifest.mcps[0].transport).toBe('stdio');
      expect(body.manifest.skills).toHaveLength(0);
    });
  });

  // ── POST /deploy/skill ──

  describe('POST /deploy/skill', () => {
    it('returns 400 when skill.id is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/skill', { skill: { name: 'Test' }, solution_id: 'sol-1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing skill.id/);
    });

    it('returns 400 when skill.name is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/skill', { skill: { id: 'test-skill' }, solution_id: 'sol-1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing skill.name/);
    });

    it('returns 400 when solution_id is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/skill', {
        skill: { id: 'test-skill', name: 'Test Skill' },
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing solution_id/);
    });

    it('does NOT require slug or mcpServer', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/skill', {
        skill: {
          id: 'test-skill',
          name: 'Test Skill',
          tools: [{ name: 'orders.order.get', description: 'Get order', inputs: [] }],
        },
        solution_id: 'sol-123',
      });

      expect(res.status).toBe(200);
      // No slug validation error — the golden path doesn't require it
      expect(res.body.ok).toBeDefined();
    });

    it('sends skill as JSON string in skills map', async () => {
      const app = createApp();
      const skillDef = {
        id: 'test-skill',
        name: 'Test Skill',
        tools: [{ name: 'orders.order.get', description: 'Get order', inputs: [] }],
      };

      await makeRequest(app, 'POST', '/deploy/skill', {
        skill: skillDef,
        solution_id: 'sol-123',
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      expect(body.skills['test-skill']).toBeDefined();
      // Should be a JSON string
      const parsed = JSON.parse(body.skills['test-skill']);
      expect(parsed.id).toBe('test-skill');
      expect(parsed.tools).toHaveLength(1);
    });
  });

  // ── POST /deploy/solution ──

  describe('POST /deploy/solution', () => {
    it('returns 400 when solution.id is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', { solution: { name: 'Test' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing solution.id/);
    });

    it('returns 400 when solution.name is missing', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', { solution: { id: 'test-sol' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing solution.name/);
    });

    it('deploys a full solution through the Skill Builder', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', {
        solution: {
          id: 'ecom-support',
          name: 'E-Commerce Support',
          description: 'Customer support solution',
          identity: {
            actor_types: [{ key: 'customer', label: 'Customer' }],
            default_actor_type: 'customer',
          },
          skills: [
            { id: 'order-support', name: 'Order Support', role: 'worker' },
          ],
          grants: [],
          handoffs: [],
          routing: { telegram: { default_skill: 'order-support' } },
        },
        skills: [
          {
            id: 'order-support',
            name: 'Order Support Agent',
            tools: [{ name: 'orders.order.get', description: 'Get order', inputs: [] }],
            connectors: ['orders-mcp'],
          },
        ],
        connectors: [
          {
            id: 'orders-mcp',
            name: 'Orders MCP',
            transport: 'stdio',
            command: 'node',
            args: ['/mcp-store/orders-mcp/server.js'],
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.solution_id).toBe('ecom-support');
      expect(res.body.deploy).toBeDefined();
      expect(res.body.deploy.connectors.deployed).toBe(1);
      expect(res.body.deploy.skills.deployed).toBe(1);
    });

    it('builds correct manifest from solution + skills + connectors', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: {
          id: 'ecom-support',
          name: 'E-Commerce Support',
          identity: { actor_types: [] },
        },
        skills: [
          { id: 'skill-a', name: 'Skill A', description: 'First skill' },
          { id: 'skill-b', name: 'Skill B', description: 'Second skill' },
        ],
        connectors: [
          { id: 'mcp-a', name: 'MCP A', transport: 'stdio', command: 'node', args: ['/a/server.js'] },
        ],
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);

      // Manifest
      expect(body.manifest.name).toBe('ecom-support');
      expect(body.manifest.mcps).toHaveLength(1);
      expect(body.manifest.mcps[0].id).toBe('mcp-a');
      expect(body.manifest.skills).toHaveLength(2);

      // Skills map
      expect(Object.keys(body.skills)).toHaveLength(2);
      expect(body.skills['skill-a']).toBeDefined();
      expect(body.skills['skill-b']).toBeDefined();

      // Solution YAML embedded
      expect(body.manifest._solutionYaml).toBeDefined();
      const solutionData = JSON.parse(body.manifest._solutionYaml);
      expect(solutionData.id).toBe('ecom-support');
    });

    it('passes mcp_store files to Skill Builder', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test Solution' },
        connectors: [{ id: 'my-mcp', name: 'My MCP', transport: 'stdio', command: 'node', args: [] }],
        mcp_store: {
          'my-mcp': [
            { path: 'server.js', content: 'const mcp = require("@modelcontextprotocol/sdk");' },
            { path: 'package.json', content: '{"name":"my-mcp"}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      expect(body.manifest.mcp_store_included).toBe(true);
      expect(body.mcpStore['my-mcp']).toHaveLength(2);
    });

    it('does NOT require slug or mcpServer in request', async () => {
      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test', name: 'Test' },
        skills: [{ id: 's1', name: 'Skill 1', tools: [] }],
      });

      // Should succeed without slug or mcpServer
      expect(res.status).toBe(200);
      expect(res.body.ok).toBeDefined();
    });

    it('handles Skill Builder import failure', async () => {
      // Override fetch to return error for import
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        statusText: 'Internal Server Error',
      }));

      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test', name: 'Test' },
      });

      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Skill Builder import failed');
    });

    // ── AUTO-RESOLVE connector command/args from mcp_store ──

    it('auto-resolves command/args when mcp_store has server.js and connector omits command', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'my-mcp', name: 'My MCP', transport: 'stdio' },
          // No command, no args
        ],
        mcp_store: {
          'my-mcp': [
            { path: 'server.js', content: 'console.log("hello");' },
            { path: 'package.json', content: '{"name":"my-mcp"}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/my-mcp/server.js']);
    });

    it('auto-resolves from package.json main field', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'my-mcp', name: 'My MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'my-mcp': [
            { path: 'dist/index.js', content: 'module.exports = {};' },
            { path: 'package.json', content: '{"name":"my-mcp","main":"dist/index.js"}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/my-mcp/dist/index.js']);
    });

    it('auto-resolves python connector from server.py', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'py-mcp', name: 'Python MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'py-mcp': [
            { path: 'server.py', content: 'import asyncio' },
            { path: 'requirements.txt', content: 'mcp>=0.1.0' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('python3');
      expect(mcp.args).toEqual(['/mcp-store/py-mcp/server.py']);
    });

    it('auto-resolves TypeScript connector from server.ts', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'ts-mcp', name: 'TS MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'ts-mcp': [
            { path: 'server.ts', content: 'import { Server } from "@modelcontextprotocol/sdk/server";' },
            { path: 'package.json', content: '{"name":"ts-mcp"}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('npx');
      expect(mcp.args).toEqual(['tsx', '/mcp-store/ts-mcp/server.ts']);
    });

    it('does NOT override explicit command/args even with mcp_store', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          {
            id: 'my-mcp',
            name: 'My MCP',
            transport: 'stdio',
            command: 'node',
            args: ['/custom/path/app.js'],
          },
        ],
        mcp_store: {
          'my-mcp': [
            { path: 'server.js', content: 'console.log("hello");' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      // Explicit values preserved, NOT overridden by auto-resolve
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/custom/path/app.js']);
    });

    it('does NOT auto-resolve when no mcp_store for connector', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'prebuilt-mcp', name: 'Prebuilt', transport: 'stdio' },
        ],
        // No mcp_store at all
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      // No command/args — connector was not in mcp_store
      expect(mcp.command).toBeUndefined();
      expect(mcp.args).toEqual([]);
    });

    it('auto-resolves index.js when no server.js exists', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'idx-mcp', name: 'Index MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'idx-mcp': [
            { path: 'index.js', content: 'module.exports = {};' },
            { path: 'utils.js', content: 'module.exports = {};' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/idx-mcp/index.js']);
    });

    it('falls back to first root .js file when no well-known entry point', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'custom-mcp', name: 'Custom MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'custom-mcp': [
            { path: 'app.js', content: 'console.log("custom");' },
            { path: 'lib/helper.js', content: '' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/custom-mcp/app.js']);
    });

    it('auto-resolves multiple connectors independently', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'node-mcp', name: 'Node MCP', transport: 'stdio' },
          { id: 'py-mcp', name: 'Python MCP', transport: 'stdio' },
          { id: 'explicit-mcp', name: 'Explicit', transport: 'stdio', command: 'deno', args: ['run', 'server.ts'] },
        ],
        mcp_store: {
          'node-mcp': [{ path: 'server.js', content: '' }],
          'py-mcp': [{ path: 'main.py', content: '' }],
          'explicit-mcp': [{ path: 'server.ts', content: '' }],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);

      // Node auto-resolved
      expect(body.manifest.mcps[0].command).toBe('node');
      expect(body.manifest.mcps[0].args).toEqual(['/mcp-store/node-mcp/server.js']);

      // Python auto-resolved
      expect(body.manifest.mcps[1].command).toBe('python3');
      expect(body.manifest.mcps[1].args).toEqual(['/mcp-store/py-mcp/main.py']);

      // Explicit preserved
      expect(body.manifest.mcps[2].command).toBe('deno');
      expect(body.manifest.mcps[2].args).toEqual(['run', 'server.ts']);
    });

    it('package.json main takes priority over server.js', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'pkg-mcp', name: 'Pkg MCP', transport: 'stdio' },
        ],
        mcp_store: {
          'pkg-mcp': [
            { path: 'server.js', content: 'old entry' },
            { path: 'build/main.js', content: 'compiled' },
            { path: 'package.json', content: '{"name":"pkg-mcp","main":"build/main.js"}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      // package.json main wins over server.js
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/pkg-mcp/build/main.js']);
    });

    it('handles malformed package.json gracefully', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'bad-pkg', name: 'Bad Pkg', transport: 'stdio' },
        ],
        mcp_store: {
          'bad-pkg': [
            { path: 'server.js', content: 'works' },
            { path: 'package.json', content: '{invalid json!!!}' },
          ],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      // Falls through to server.js despite bad package.json
      expect(mcp.command).toBe('node');
      expect(mcp.args).toEqual(['/mcp-store/bad-pkg/server.js']);
    });

    it('handles HTTP transport connectors — no auto-resolve', async () => {
      const app = createApp();
      await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test-sol', name: 'Test' },
        connectors: [
          { id: 'http-mcp', name: 'HTTP MCP', transport: 'http', endpoint: 'http://example.com/mcp' },
        ],
        mcp_store: {
          'http-mcp': [{ path: 'server.js', content: '' }],
        },
      });

      const importCall = fetchCalls[0];
      const body = JSON.parse(importCall.options.body);
      const mcp = body.manifest.mcps[0];
      // HTTP transport — no command should be auto-resolved
      expect(mcp.command).toBeUndefined();
    });

    it('handles deploy-all SSE error event', async () => {
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/api/import/solution-pack')) {
          return {
            ok: true,
            json: async () => ({ ok: true, package: { name: 'test' }, skills: [], solution: null }),
          };
        }
        if (url.includes('/deploy-all')) {
          return {
            ok: true,
            text: async () => makeSSE([
              { type: 'start', packageName: 'test', totalConnectors: 0, totalSkills: 0 },
              { type: 'error', error: 'ADAS Core unreachable' },
            ]),
          };
        }
        return { ok: false, text: async () => 'Not found' };
      });

      const app = createApp();
      const res = await makeRequest(app, 'POST', '/deploy/solution', {
        solution: { id: 'test', name: 'Test' },
      });

      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('ADAS Core unreachable');
    });
  });
});
