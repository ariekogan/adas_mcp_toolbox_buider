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
 *
 * Read-back:
 * GET  /deploy/solutions/:id/definition       — Full solution definition
 * GET  /deploy/solutions/:id/skills           — List skills (summaries)
 * GET  /deploy/solutions/:id/skills/:sk       — Full skill definition
 *
 * Updates:
 * PATCH /deploy/solutions/:id                 — Update solution incrementally
 * PATCH /deploy/solutions/:id/skills/:sk      — Update skill incrementally
 * POST  /deploy/solutions/:id/skills/:sk/redeploy — Re-deploy after PATCH
 * DELETE /deploy/solutions/:id/skills/:sk     — Remove a single skill
 *
 * Operate:
 * POST /deploy/solutions/:id/chat             — Send message to Solution Bot
 * POST /deploy/solutions/:id/redeploy         — Re-deploy ALL skills at once
 * POST /deploy/solutions/:id/skills           — Add a new skill to an existing solution
 * GET  /deploy/solutions/:id/export           — Export as re-importable JSON bundle
 *
 * Inspect:
 * GET  /deploy/solutions/:id/validate         — Validate solution from stored state
 * GET  /deploy/solutions/:id/skills/:sk/validate — Validate skill from stored state
 * GET  /deploy/solutions/:id/connectors/health — Connector health from ADAS Core
 * GET  /deploy/solutions/:id/skills/:sk/conversation — Skill chat history
 * GET  /deploy/solutions/:id/health           — Live health check
 */

import { Router } from 'express';
import { validateSolution } from '../validators/solutionValidator.js';

const router = Router();

const SKILL_BUILDER_URL = (process.env.SKILL_BUILDER_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Build headers for Skill Builder requests, forwarding tenant + API key from the incoming request */
function sbHeaders(req) {
  const h = { 'Content-Type': 'application/json' };
  const tenant = req.headers['x-adas-tenant'];
  if (tenant) h['X-ADAS-TENANT'] = tenant;
  const apiKey = req.headers['x-api-key'];
  if (apiKey) h['X-API-KEY'] = apiKey;
  return h;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-resolve connector entry point from mcp_store files
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the runtime command and entry point args for a connector
 * from its mcp_store file list.
 *
 * Priority:
 *   1. package.json "main" field → node /mcp-store/<id>/<main>
 *   2. server.js → node /mcp-store/<id>/server.js
 *   3. index.js → node /mcp-store/<id>/index.js
 *   4. server.py → python3 /mcp-store/<id>/server.py
 *   5. main.py  → python3 /mcp-store/<id>/main.py
 *   6. server.ts → npx tsx /mcp-store/<id>/server.ts
 *   7. index.ts → npx tsx /mcp-store/<id>/index.ts
 *
 * @param {string} connectorId - Connector ID (used for /mcp-store/<id>/ path)
 * @param {string[]} filePaths - Array of relative file paths from mcp_store
 * @param {Array<{path: string, content: string}>} files - Full file objects
 * @returns {{ command: string|null, args: string[] }}
 */
function resolveEntryPoint(connectorId, filePaths, files) {
  const basePath = `/mcp-store/${connectorId}`;

  // 1. Check package.json "main" field
  const pkgFile = files.find(f => f.path === 'package.json');
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      if (pkg.main) {
        return { command: 'node', args: [`${basePath}/${pkg.main}`] };
      }
    } catch { /* ignore parse errors */ }
  }

  // 2. Well-known entry points by priority
  const candidates = [
    { file: 'server.js',  command: 'node' },
    { file: 'index.js',   command: 'node' },
    { file: 'server.py',  command: 'python3' },
    { file: 'main.py',    command: 'python3' },
    { file: 'server.ts',  command: 'npx', extraArgs: ['tsx'] },
    { file: 'index.ts',   command: 'npx', extraArgs: ['tsx'] },
  ];

  for (const { file, command, extraArgs } of candidates) {
    if (filePaths.includes(file)) {
      const args = [...(extraArgs || []), `${basePath}/${file}`];
      return { command, args };
    }
  }

  // 3. Fallback: first .js file at root level
  const rootJs = filePaths.find(p => !p.includes('/') && p.endsWith('.js'));
  if (rootJs) {
    return { command: 'node', args: [`${basePath}/${rootJs}`] };
  }

  return { command: null, args: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP-STORE PRE-UPLOAD — stage large connector files before deploying
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/mcp-store/:connectorId
 * Pre-upload connector source code files that are too large for inline JSON.
 *
 * Body: { files: [{ path: "server.py", content: "..." }, ...] }
 *
 * The files are staged on the Skill Builder. When you next call
 * POST /deploy/solution, they are automatically merged into the
 * solution pack — no need to include them in mcp_store.
 */
router.post('/mcp-store/:connectorId', async (req, res) => {
  const { connectorId } = req.params;
  if (!connectorId) {
    return res.status(400).json({ ok: false, error: 'Missing connectorId' });
  }

  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store/${encodeURIComponent(connectorId)}`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(120000), // 2 min for large files
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] MCP-store pre-upload error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/mcp-store
 * List all pre-staged connector files
 */
router.get('/mcp-store', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] MCP-store list error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /deploy/mcp-store/:connectorId
 * Remove pre-staged files for a connector
 */
router.delete('/mcp-store/:connectorId', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store/${encodeURIComponent(req.params.connectorId)}`, {
      method: 'DELETE',
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] MCP-store delete error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

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
    const toolCount = connResult?.tools || 0;
    const isOk = connResult?.ok ?? false;

    // Build response with clear error signals
    const response = {
      ok: isOk,
      connector_id: connector.id,
      action: 'deployed_via_skill_builder',
      started: isOk,
      tools_discovered: toolCount,
    };

    // Surface error details so the developer can debug
    if (!isOk) {
      response.error = connResult?.error || 'connector_start_failed';
      response.message = connResult?.message ||
        (toolCount === 0
          ? `Connector "${connector.id}" started but discovered 0 tools. Check that the entry point exists and registers at least one tool.`
          : `Connector "${connector.id}" failed to deploy.`);
      if (connResult?.diagnostic) {
        response.diagnostic = connResult.diagnostic;
      }
    } else if (toolCount === 0 && connResult?.warning) {
      response.warning = connResult.warning;
    }

    response.deploy_summary = deployResult;
    res.json(response);
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
    // ── Pre-deploy validation ──
    const validationContext = { skills: skills || [], connectors: connectors || [], mcp_store: mcp_store || {} };
    const preValidation = validateSolution(solution, validationContext);
    if (preValidation.errors?.length > 0) {
      console.log(`[Deploy] Pre-deploy errors for ${solution.id}: ${preValidation.errors.map(e => e.message).join('; ')}`);
    }
    if (preValidation.warnings?.length > 0) {
      console.log(`[Deploy] Pre-deploy warnings for ${solution.id}: ${preValidation.warnings.map(w => w.message).join('; ')}`);
    }

    // ── Check mcp_store for known compatibility issues ──
    // The A-Team Core runtime uses Node.js 18.x. The @modelcontextprotocol/sdk v1.x+
    // is ESM-only and incompatible with Node 18's module resolution. Warn developers
    // so they can either remove the SDK (use raw JSON-RPC) or use a compatible approach.
    if (mcp_store && Object.keys(mcp_store).length > 0) {
      for (const [connId, files] of Object.entries(mcp_store)) {
        const pkgFile = (files || []).find(f => f.path === 'package.json');
        if (pkgFile?.content) {
          try {
            const pkg = JSON.parse(pkgFile.content);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (allDeps['@modelcontextprotocol/sdk']) {
              preValidation.warnings = preValidation.warnings || [];
              preValidation.warnings.push({
                type: 'connector_compatibility',
                connector_id: connId,
                message: `Connector "${connId}" uses @modelcontextprotocol/sdk which is ESM-only and incompatible with the A-Team Core runtime (Node.js 18.x). ` +
                  `The connector will likely fail with MODULE_NOT_FOUND or ERR_MODULE_NOT_FOUND errors. ` +
                  `Recommended fix: remove the SDK dependency and implement the MCP protocol directly using raw JSON-RPC over stdio (readline + JSON.parse + process.stdout.write). ` +
                  `See the connector examples for a working pattern without the SDK.`,
              });
              console.warn(`[Deploy] WARNING: Connector "${connId}" depends on @modelcontextprotocol/sdk — incompatible with Node 18 runtime`);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }

    // ── Auto-resolve connector command/args from mcp_store ──
    // When an agent provides mcp_store code but omits command/args,
    // we auto-detect the entry point and runtime from the uploaded files.
    // Explicit command/args always win (no override).
    const resolvedConnectors = (connectors || []).map(c => {
      const storeFiles = mcp_store?.[c.id];
      const hasExplicitCommand = !!c.command;

      // Only auto-resolve for stdio connectors with mcp_store code and no explicit command
      const isHttp = c.transport === 'http';
      if (hasExplicitCommand || isHttp || !storeFiles || storeFiles.length === 0) {
        return c;
      }

      const filePaths = storeFiles.map(f => f.path);
      const { command, args } = resolveEntryPoint(c.id, filePaths, storeFiles);

      if (command) {
        console.log(`[Deploy] Auto-resolved connector ${c.id}: ${command} ${args.join(' ')}`);
        return { ...c, command, args, transport: c.transport || 'stdio' };
      }

      console.warn(`[Deploy] Could not auto-resolve entry point for connector ${c.id} — files: ${filePaths.join(', ')}`);
      return c;
    });

    // ── Build the manifest ──
    const manifest = {
      name: solution.id,
      version: solution.version || '1.0.0',
      description: solution.description || solution.name,
      mcp_store_included: !!mcp_store && Object.keys(mcp_store).length > 0,
      mcps: resolvedConnectors.map(c => ({
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
        connectors: s.connectors || [],
      })),
    };

    // Always embed the solution definition so the Skill Builder creates a
    // solution object on its filesystem.  Previously this was conditional on
    // having architecture fields, which could leave the Builder FS empty.
    manifest._solutionYaml = JSON.stringify(solution);

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
      ...(preValidation.errors?.length > 0 && { validation_errors: preValidation.errors }),
      ...(preValidation.warnings?.length > 0 && { validation_warnings: preValidation.warnings }),
      _next_steps: [
        `GET /deploy/solutions/${solution.id}/health — verify skills deployed and connectors healthy`,
        `GET /deploy/solutions/${solution.id}/definition — read back the solution definition`,
        `GET /deploy/solutions/${solution.id}/skills — list deployed skills with internal IDs`,
      ],
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
    // Strip internal fields from the response
    if (data.solution) {
      delete data.solution.linked_skills;
      delete data.solution.conversation;
    }
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
 * GET /deploy/solutions/:solutionId/connectors/health — Connector health from ADAS Core
 * Returns status, discovered tools, and errors for each connector.
 */
router.get('/solutions/:solutionId/connectors/health', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/connectors/health`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Connector health error:', err.message);
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

// ═══════════════════════════════════════════════════════════════════════════
// REDEPLOY — regenerate MCP and push to ADAS Core
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/solutions/:solutionId/skills/:skillId/redeploy
 *
 * Re-deploy a single skill after PATCH updates.
 * Reads the stored skill, regenerates the MCP server, pushes to ADAS Core.
 * Accepts original skill ID or internal ID.
 * Longer timeout (60s) because MCP generation + ADAS Core deploy can be slow.
 */
router.post('/solutions/:solutionId/skills/:skillId/redeploy', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/redeploy`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Redeploy skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION & HEALTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions/:solutionId/skills/:skillId/conversation — Skill chat history
 * Optional: ?limit=N for most recent N messages
 */
router.get('/solutions/:solutionId/skills/:skillId/conversation', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const qs = req.query.limit ? `?limit=${encodeURIComponent(req.query.limit)}` : '';
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/conversation${qs}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get conversation error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/health — Live health check
 * Cross-checks definition vs ADAS Core: skills deployed, connectors connected, grant chains intact.
 */
router.get('/solutions/:solutionId/health', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/health`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Health check error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOLUTION CHAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/solutions/:solutionId/chat — Send a message to the Solution Bot
 * Body: { message: string }
 * Returns: { message, solution, suggested_focus, input_hint, validation, usage }
 */
router.post('/solutions/:solutionId/chat', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/chat`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Solution chat error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK REDEPLOY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/solutions/:solutionId/redeploy — Re-deploy ALL skills in a solution
 * Regenerates MCP servers for every skill and pushes to ADAS Core.
 * Returns per-skill results with deployed/failed counts.
 */
router.post('/solutions/:solutionId/redeploy', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/redeploy`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(300000), // 5 min for large solutions
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Bulk redeploy error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADD SKILL TO EXISTING SOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/solutions/:solutionId/skills — Add a new skill to an existing solution
 * Body: { skill: { id, name, ... full skill definition } }
 *
 * Creates the skill in the Skill Builder and links it to the solution.
 * Also updates the solution's skills array if the skill has a role.
 */
router.post('/solutions/:solutionId/skills', async (req, res) => {
  const { skill } = req.body;

  if (!skill?.id) {
    return res.status(400).json({ ok: false, error: 'Missing skill.id in body' });
  }
  if (!skill?.name) {
    return res.status(400).json({ ok: false, error: 'Missing skill.name in body' });
  }

  try {
    const solId = encodeURIComponent(req.params.solutionId);

    // Step 1: Create the skill via the existing create endpoint
    const createResp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skill.name }),
      signal: AbortSignal.timeout(15000),
    });

    if (!createResp.ok) {
      const errData = await createResp.json().catch(() => ({ error: createResp.statusText }));
      return res.status(createResp.status).json({ ok: false, ...errData });
    }

    const createData = await createResp.json();
    const internalId = createData.skill?.id;

    if (!internalId) {
      return res.status(500).json({ ok: false, error: 'Skill created but no ID returned' });
    }

    // Step 2: PATCH the skill with the full definition
    // Set original_skill_id and apply all the fields from the provided skill
    const updates = { original_skill_id: skill.id };

    // Copy scalar fields via dot notation
    const scalarFields = ['description', 'version', 'phase', 'ui_capable', 'prompt'];
    for (const f of scalarFields) {
      if (skill[f] !== undefined) updates[f] = skill[f];
    }

    // Copy object fields
    const objectFields = ['problem', 'role', 'glossary', 'engine', 'access_policy'];
    for (const f of objectFields) {
      if (skill[f] !== undefined) updates[f] = skill[f];
    }

    // Copy intents (but not intents.supported — that's a protected array)
    if (skill.intents) {
      if (skill.intents.thresholds) updates['intents.thresholds'] = skill.intents.thresholds;
      if (skill.intents.out_of_domain) updates['intents.out_of_domain'] = skill.intents.out_of_domain;
      // Push all supported intents at once (backend _push accepts arrays)
      if (Array.isArray(skill.intents.supported) && skill.intents.supported.length > 0) {
        updates['intents.supported_push'] = skill.intents.supported;
      }
    }

    // Copy scenarios, connectors, grant_mappings, response_filters, channels, triggers
    const arrayFields = ['scenarios', 'connectors', 'grant_mappings', 'response_filters', 'channels', 'triggers', 'example_conversations'];
    for (const f of arrayFields) {
      if (skill[f] !== undefined) updates[f] = skill[f];
    }

    // Push all tools at once (backend _push accepts arrays)
    if (Array.isArray(skill.tools) && skill.tools.length > 0) {
      updates['tools_push'] = skill.tools;
    }

    // Push meta_tools (protected array)
    if (Array.isArray(skill.meta_tools) && skill.meta_tools.length > 0) {
      updates['meta_tools_push'] = skill.meta_tools;
    }

    // Push policy guardrails
    if (skill.policy) {
      if (skill.policy.workflows) updates['policy.workflows'] = skill.policy.workflows;
      if (skill.policy.approvals) updates['policy.approvals'] = skill.policy.approvals;
      if (skill.policy.escalation) updates['policy.escalation'] = skill.policy.escalation;
      if (Array.isArray(skill.policy.guardrails?.always) && skill.policy.guardrails.always.length > 0) {
        updates['policy.guardrails.always_push'] = skill.policy.guardrails.always;
      }
      if (Array.isArray(skill.policy.guardrails?.never) && skill.policy.guardrails.never.length > 0) {
        updates['policy.guardrails.never_push'] = skill.policy.guardrails.never;
      }
    }

    const patchResp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${encodeURIComponent(internalId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
      signal: AbortSignal.timeout(15000),
    });

    const patchData = await patchResp.json();

    // Step 3: Update the solution's skills array to include this new skill
    const skillRef = { id: skill.id, name: skill.name, role: skill.role || 'worker', description: skill.description || '' };
    await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify({ state_update: { 'skills_push': skillRef } }),
      signal: AbortSignal.timeout(15000),
    });

    res.status(201).json({
      ok: true,
      skill_id: skill.id,
      internal_id: internalId,
      skill: patchData.skill || createData.skill,
    });
  } catch (err) {
    console.error('[Deploy] Add skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions/:solutionId/export — Export solution as a JSON bundle
 * Returns the full solution + skill definitions + connector metadata
 * in a format compatible with POST /deploy/solution for re-import.
 */
router.get('/solutions/:solutionId/export', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/export`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Export error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE SINGLE SKILL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DELETE /deploy/solutions/:solutionId/skills/:skillId — Remove a single skill
 * Accepts original skill ID or internal ID.
 */
router.delete('/solutions/:solutionId/skills/:skillId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}`, {
      method: 'DELETE',
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    if (resp.status === 204) {
      return res.status(204).send();
    }
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Delete skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATE FROM STORED STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions/:solutionId/validate — Re-validate solution from stored state
 * Runs full validation (structural + cross-skill) on what's already deployed.
 */
router.get('/solutions/:solutionId/validate', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/validation`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Validate solution error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/skills/:skillId/validate — Re-validate a single skill from stored state
 * Accepts original skill ID or internal ID.
 */
router.get('/solutions/:solutionId/skills/:skillId/validate', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/validation`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Validate skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPER TOOLS — Execution Logs, Testing, Metrics, Connector Source, Diff
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /deploy/solutions/:solutionId/logs — Execution logs
 * Query: ?skill_id=X&limit=10&job_id=X
 */
router.get('/solutions/:solutionId/logs', async (req, res) => {
  try {
    const qs = new URLSearchParams();
    if (req.query.skill_id) qs.set('skill_id', req.query.skill_id);
    if (req.query.limit) qs.set('limit', req.query.limit);
    if (req.query.job_id) qs.set('job_id', req.query.job_id);
    const qsStr = qs.toString() ? `?${qs}` : '';
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/logs${qsStr}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get execution logs error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * POST /deploy/solutions/:solutionId/skills/:skillId/test — Test a skill
 * Body: { message: string, async?: boolean, timeout_ms?: number }
 */
router.post('/solutions/:solutionId/skills/:skillId/test', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const isAsync = req.body?.async === true;
    const timeoutMs = isAsync ? 15000 : Math.min((req.body?.timeout_ms || 60000) + 30000, 330000);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/test`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Test skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/skills/:skillId/test/:jobId — Poll test progress
 */
router.get('/solutions/:solutionId/skills/:skillId/test/:jobId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const jobId = encodeURIComponent(req.params.jobId);
    const resp = await fetch(
      `${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/test/${jobId}`,
      { headers: sbHeaders(req), signal: AbortSignal.timeout(15000) }
    );
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Test status error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /deploy/solutions/:solutionId/skills/:skillId/test/:jobId — Abort test
 */
router.delete('/solutions/:solutionId/skills/:skillId/test/:jobId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const jobId = encodeURIComponent(req.params.jobId);
    const resp = await fetch(
      `${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/test/${jobId}`,
      { method: 'DELETE', headers: sbHeaders(req), signal: AbortSignal.timeout(15000) }
    );
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Test abort error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/metrics — Execution metrics
 * Query: ?job_id=X or ?skill_id=X
 */
router.get('/solutions/:solutionId/metrics', async (req, res) => {
  try {
    const qs = new URLSearchParams();
    if (req.query.job_id) qs.set('job_id', req.query.job_id);
    if (req.query.skill_id) qs.set('skill_id', req.query.skill_id);
    if (req.query.limit) qs.set('limit', req.query.limit);
    const qsStr = qs.toString() ? `?${qs}` : '';
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/metrics${qsStr}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get metrics error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/connectors/:connectorId/source — Connector source code
 */
router.get('/solutions/:solutionId/connectors/:connectorId/source', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const connId = encodeURIComponent(req.params.connectorId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/connectors/${connId}/source`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Get connector source error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/diff — Compare Builder vs Core
 * Query: ?skill_id=X (optional)
 */
router.get('/solutions/:solutionId/diff', async (req, res) => {
  try {
    const qs = req.query.skill_id ? `?skill_id=${encodeURIComponent(req.query.skill_id)}` : '';
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(req.params.solutionId)}/diff${qs}`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Diff error:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MCP Store — Pre-upload connector source files
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/mcp-store/:connectorId
 * Pre-upload connector source files before deploying a solution.
 * Proxies to Skill Builder: POST /api/import/mcp-store/:connectorId
 *
 * Body: { files: [{ path: "server.js", content: "..." }, ...] }
 *
 * Use this when mcp_store payload is too large for a single deploy call.
 * Upload files first, then deploy without mcp_store — staged files are
 * automatically merged into the next solution deploy.
 */
router.post('/mcp-store/:connectorId', async (req, res) => {
  const { connectorId } = req.params;
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store/${connectorId}`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error(`[Deploy] mcp-store upload error for ${connectorId}:`, err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/mcp-store
 * List all pre-staged connector files.
 */
router.get('/mcp-store', async (req, res) => {
  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store`, {
      headers: sbHeaders(req),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] mcp-store list error:', err.message);
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
    const cResults = completeEvent.connectorResults || [];
    const sResults = completeEvent.skillResults || [];
    return {
      ok: (completeEvent.connectors?.failed || 0) === 0 && (completeEvent.skills?.failed || 0) === 0,
      connectors: completeEvent.connectors,
      skills: completeEvent.skills,
      connectorResults: cResults,
      skillResults: sResults,
      // Surface any connector diagnostics at top level for easy access
      ...(cResults.some(r => !r.ok) && {
        connector_errors: cResults
          .filter(r => !r.ok)
          .map(r => ({
            id: r.id,
            error: r.error,
            message: r.message,
            diagnostic: r.diagnostic || null,
          })),
      }),
      // Surface any skill errors at top level (parity with connector_errors)
      ...(sResults.some(r => !r.ok) && {
        skill_errors: sResults
          .filter(r => !r.ok)
          .map(r => ({
            id: r.id,
            skillId: r.skillId,
            error: r.error,
            deploy_log: r.deploy_log || null,
          })),
      }),
      // Surface skill warnings (e.g. missing get_skill_definition)
      ...(sResults.some(r => r.warnings?.length) && {
        skill_warnings: sResults
          .filter(r => r.warnings?.length)
          .map(r => ({
            id: r.id,
            tools: r.tools,
            hasGetSkillDefinition: r.hasGetSkillDefinition ?? false,
            warnings: r.warnings,
          })),
      }),
    };
  }

  // No complete event — build summary from individual events
  const connectorResults = events
    .filter(e => e.type === 'connector_progress' && (e.status === 'done' || e.status === 'error' || e.status === 'warning'))
    .map(e => ({
      id: e.connectorId,
      ok: e.status === 'done' || e.status === 'warning',
      tools: e.tools || 0,
      error: e.error || undefined,
      message: e.message || undefined,
      warning: e.warning || undefined,
      diagnostic: e.diagnostic || undefined,
    }));

  const skillResults = events
    .filter(e => e.type === 'skill_progress' && (e.status === 'done' || e.status === 'error'))
    .map(e => ({
      id: e.skillId, ok: e.status === 'done', mcpUri: e.mcpUri,
      tools: e.tools ?? null, toolNames: e.toolNames || [],
      hasGetSkillDefinition: e.hasGetSkillDefinition ?? false,
      warnings: e.warnings || undefined,
      error: e.error, deploy_log: e.deploy_log || undefined,
    }));

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
