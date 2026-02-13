/**
 * ADAS Deploy API routes — Golden Path
 *
 * All deployments flow through the Skill Builder backend, which:
 *   1. Stores solutions/skills/connectors (visible in Skill Builder UI)
 *   2. Auto-generates Python MCP servers from skill tool definitions
 *   3. Pushes everything to ADAS Core
 *
 * External agents do NOT need to provide slugs or Python MCP code.
 *
 * POST /deploy/connector              — Register + connect a connector via Skill Builder
 * POST /deploy/skill                  — Import a skill definition via Skill Builder
 * POST /deploy/solution               — Import + deploy a full solution via Skill Builder
 * GET  /deploy/solutions              — List all solutions
 * GET  /deploy/status/:solutionId     — Aggregated deploy status (skills, connectors, health)
 * DELETE /deploy/solutions/:solutionId — Remove a solution
 */

import { Router } from 'express';

const router = Router();

const SKILL_BUILDER_URL = (process.env.SKILL_BUILDER_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Build headers for Skill Builder requests, forwarding the tenant from the incoming request */
function sbHeaders(req) {
  const h = { 'Content-Type': 'application/json' };
  const tenant = req.headers['x-adas-tenant'];
  if (tenant) h['X-ADAS-TENANT'] = tenant;
  return h;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/connector
// Register a connector in the Skill Builder and connect it in ADAS Core.
// ═══════════════════════════════════════════════════════════════════════════

router.post('/connector', async (req, res) => {
  const { connector } = req.body;

  if (!connector?.id) {
    return res.status(400).json({ ok: false, error: 'Missing connector.id' });
  }
  if (!connector?.name) {
    return res.status(400).json({ ok: false, error: 'Missing connector.name' });
  }

  try {
    // Build a minimal solution-pack with just this connector
    const manifest = {
      name: `connector-${connector.id}`,
      version: '1.0.0',
      description: `Single connector deploy: ${connector.name}`,
      mcp_store_included: false,
      mcps: [connector],
      skills: [],
    };

    // Import into Skill Builder
    const importResp = await fetch(`${SKILL_BUILDER_URL}/api/import/solution-pack`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify({ manifest }),
      signal: AbortSignal.timeout(30000),
    });

    if (!importResp.ok) {
      const errText = await importResp.text().catch(() => importResp.statusText);
      throw new Error(`Skill Builder import failed (${importResp.status}): ${errText}`);
    }

    // Deploy to ADAS Core via Skill Builder
    const packageName = manifest.name;
    const deployResult = await consumeDeploySSE(packageName, req);

    // Find this connector's result
    const connResult = deployResult.connectorResults?.find(r => r.id === connector.id);

    res.json({
      ok: connResult?.ok ?? false,
      connector_id: connector.id,
      action: 'deployed_via_skill_builder',
      started: connResult?.ok ?? false,
      tools_discovered: connResult?.tools || 0,
      deploy_summary: deployResult,
    });
  } catch (err) {
    console.error('[Deploy] Connector error:', err.message);
    res.status(502).json({ ok: false, error: err.message, skill_builder_url: SKILL_BUILDER_URL });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/skill
// Import a skill definition into the Skill Builder.
// The Skill Builder auto-generates the Python MCP server from tool defs.
// Requires a solution_id — the skill must belong to a solution.
// ═══════════════════════════════════════════════════════════════════════════

router.post('/skill', async (req, res) => {
  const { skill, solution_id } = req.body;

  if (!skill?.id) {
    return res.status(400).json({ ok: false, error: 'Missing skill.id' });
  }
  if (!skill?.name) {
    return res.status(400).json({ ok: false, error: 'Missing skill.name' });
  }
  if (!solution_id) {
    return res.status(400).json({ ok: false, error: 'Missing solution_id. Deploy via POST /deploy/solution to create both the solution and skills at once.' });
  }

  try {
    // Build a solution-pack with just this skill
    const manifest = {
      name: `skill-${skill.id}`,
      version: '1.0.0',
      description: `Single skill deploy: ${skill.name}`,
      mcp_store_included: false,
      mcps: [],
      skills: [{ id: skill.id, name: skill.name, description: skill.description || '' }],
      solution_id,
    };

    // The skills map: skill id → YAML/JSON string
    const skills = { [skill.id]: JSON.stringify(skill) };

    // Import into Skill Builder
    const importResp = await fetch(`${SKILL_BUILDER_URL}/api/import/solution-pack`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify({ manifest, skills }),
      signal: AbortSignal.timeout(30000),
    });

    if (!importResp.ok) {
      const errText = await importResp.text().catch(() => importResp.statusText);
      throw new Error(`Skill Builder import failed (${importResp.status}): ${errText}`);
    }

    const importData = await importResp.json();

    // Deploy to ADAS Core via Skill Builder
    const packageName = manifest.name;
    const deployResult = await consumeDeploySSE(packageName, req);

    const skillResult = deployResult.skillResults?.find(r => r.id === skill.id);

    res.json({
      ok: skillResult?.ok ?? false,
      skill_id: skill.id,
      skill_name: skill.name,
      mcp_uri: skillResult?.mcpUri || null,
      import_result: importData.skills || [],
      deploy_summary: deployResult,
    });
  } catch (err) {
    console.error('[Deploy] Skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message, skill_builder_url: SKILL_BUILDER_URL });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/solution
// Import + deploy an entire solution: identity + connectors + skills.
// The Skill Builder stores everything, generates MCP servers, and pushes
// to ADAS Core. No slug or Python MCP code needed.
// ═══════════════════════════════════════════════════════════════════════════

router.post('/solution', async (req, res) => {
  const { solution, skills, connectors, mcp_store } = req.body;

  if (!solution?.id) {
    return res.status(400).json({ ok: false, error: 'Missing solution.id' });
  }
  if (!solution?.name) {
    return res.status(400).json({ ok: false, error: 'Missing solution.name' });
  }

  try {
    // ── Build the manifest ──
    const manifest = {
      name: solution.id,
      version: solution.version || '1.0.0',
      description: solution.description || solution.name,
      mcp_store_included: !!mcp_store && Object.keys(mcp_store).length > 0,
      mcps: (connectors || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        transport: c.transport || 'stdio',
        command: c.command,
        args: c.args || [],
        env: c.env || {},
        category: c.category || 'domain',
        layer: c.layer || 'domain',
        requiresAuth: c.requiresAuth || false,
        ui_capable: c.ui_capable || false,
        ...(c.endpoint ? { endpoint: c.endpoint } : {}),
        ...(c.credentials ? { credentials: c.credentials } : {}),
        ...(c.envRequired ? { envRequired: c.envRequired } : {}),
        ...(c.envHelp ? { envHelp: c.envHelp } : {}),
        ...(c.authInstructions ? { authInstructions: c.authInstructions } : {}),
      })),
      skills: (skills || []).map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
      })),
    };

    // If the solution has architecture (identity, grants, handoffs, routing),
    // embed it as _solutionYaml so the Skill Builder creates a solution object
    if (solution.identity || solution.grants || solution.handoffs || solution.routing || solution.skills) {
      manifest._solutionYaml = JSON.stringify(solution);
    }

    // Build skills map: skill id → JSON string (YAML-compatible)
    const skillFiles = {};
    for (const s of (skills || [])) {
      skillFiles[s.id] = JSON.stringify(s);
    }

    // Build mcp_store files map (connector source code)
    const mcpStoreFiles = mcp_store || {};

    // ── Import into Skill Builder ──
    const importResp = await fetch(`${SKILL_BUILDER_URL}/api/import/solution-pack`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify({
        manifest,
        skills: skillFiles,
        mcpStore: mcpStoreFiles,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!importResp.ok) {
      const errText = await importResp.text().catch(() => importResp.statusText);
      throw new Error(`Skill Builder import failed (${importResp.status}): ${errText}`);
    }

    const importData = await importResp.json();
    const packageName = importData.package?.name || manifest.name;

    // ── Deploy to ADAS Core via Skill Builder ──
    const deployResult = await consumeDeploySSE(packageName, req);

    res.json({
      ok: deployResult.ok,
      solution_id: solution.id,
      package_name: packageName,
      import: {
        skills: importData.skills || [],
        solution: importData.solution || null,
        connectors: (importData.package?.mcps || []).length,
      },
      deploy: deployResult,
    });
  } catch (err) {
    console.error('[Deploy] Solution error:', err.message);
    res.status(502).json({ ok: false, error: err.message, skill_builder_url: SKILL_BUILDER_URL });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOLUTION LIFECYCLE — proxy to Skill Builder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions — List all solutions
 */
router.get('/solutions', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] List solutions error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/status/:solutionId — Aggregated deploy status
 */
router.get('/status/:solutionId', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/deploy-status`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Status error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /deploy/solutions/:solutionId — Remove a solution
 */
router.delete('/solutions/:solutionId', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}`, {
      method: 'DELETE',
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Delete solution error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// READ BACK — retrieve deployed definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions/:solutionId/definition — Read back the full solution definition
 */
router.get('/solutions/:solutionId/definition', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get solution definition error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/skills — List skills in a solution (summaries)
 */
router.get('/solutions/:solutionId/skills', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/skills`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] List skills error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/skills/:skillId — Read back a full skill definition
 * Accepts either the original skill ID (e.g., "e2e-greeter") or internal ID (e.g., "dom_xxx")
 */
router.get('/solutions/:solutionId/skills/:skillId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get skill definition error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATES — PATCH deployed definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /deploy/solutions/:solutionId — Update solution definition
 * Body: { state_update: { "phase": "DEPLOYED", "grants_push": {...}, ... } }
 *
 * Supports dot notation, _push, _delete, _update operations.
 * See GET /spec for full documentation.
 */
router.patch('/solutions/:solutionId', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Patch solution error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /deploy/solutions/:solutionId/skills/:skillId — Update a skill definition
 * Body: { updates: { "tools_push": {...}, "problem.statement": "...", ... } }
 *
 * Accepts original skill ID (e.g., "e2e-greeter") or internal ID (e.g., "dom_xxx").
 * Supports: dot notation, tools_push, tools_delete, tools_update, tools_rename,
 * intents.supported_push, policy.guardrails.always_push, etc.
 */
router.patch('/solutions/:solutionId/skills/:skillId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Patch skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call the Skill Builder's deploy-all endpoint and consume the SSE stream,
 * collecting all events into a single result object.
 */
async function consumeDeploySSE(packageName, req) {
  const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/packages/${encodeURIComponent(packageName)}/deploy-all`, {
    method: 'POST',
    headers: sbHeaders(req),
    signal: AbortSignal.timeout(300000), // 5 min for large deploys
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Skill Builder deploy-all failed (${resp.status}): ${errText}`);
  }

  // Parse SSE stream
  const text = await resp.text();
  const events = parseSSEEvents(text);

  // Extract final summary from 'complete' event, or build from individual events
  const completeEvent = events.find(e => e.type === 'complete');
  const errorEvent = events.find(e => e.type === 'error');

  if (errorEvent) {
    throw new Error(`Deploy failed: ${errorEvent.error}`);
  }

  if (completeEvent) {
    return {
      ok: (completeEvent.connectors?.failed || 0) === 0 && (completeEvent.skills?.failed || 0) === 0,
      connectors: completeEvent.connectors,
      skills: completeEvent.skills,
      connectorResults: completeEvent.connectorResults || [],
      skillResults: completeEvent.skillResults || [],
    };
  }

  // No complete event — build summary from individual events
  const connectorResults = events
    .filter(e => e.type === 'connector_progress' && (e.status === 'done' || e.status === 'error'))
    .map(e => ({ id: e.connectorId, ok: e.status === 'done', tools: e.tools || 0, error: e.error }));

  const skillResults = events
    .filter(e => e.type === 'skill_progress' && (e.status === 'done' || e.status === 'error'))
    .map(e => ({ id: e.skillId, ok: e.status === 'done', mcpUri: e.mcpUri, error: e.error }));

  return {
    ok: connectorResults.every(r => r.ok) && skillResults.every(r => r.ok),
    connectors: { total: connectorResults.length, deployed: connectorResults.filter(r => r.ok).length, failed: connectorResults.filter(r => !r.ok).length },
    skills: { total: skillResults.length, deployed: skillResults.filter(r => r.ok).length, failed: skillResults.filter(r => !r.ok).length },
    connectorResults,
    skillResults,
  };
}

/**
 * Parse SSE text into an array of event data objects.
 * Each SSE line looks like: data: {"type":"connector_progress",...}
 */
function parseSSEEvents(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ')) {
      try {
        events.push(JSON.parse(trimmed.slice(6)));
      } catch {
        // Skip malformed lines
      }
    }
  }
  return events;
}
