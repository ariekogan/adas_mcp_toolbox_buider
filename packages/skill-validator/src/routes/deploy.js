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

import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { validateSolution } from '../validators/solutionValidator.js';
import { expandSkill } from '../services/skillExpander.js';
import * as github from '../services/githubService.js';
import { buildRepoFiles } from '../services/githubRepoBuilder.js';

const router = Router();

const SKILL_BUILDER_URL = (process.env.SKILL_BUILDER_URL || 'http://localhost:4000').replace(/\/$/, '');
const VOICE_BACKEND_URL = (process.env.VOICE_BACKEND_URL || 'http://voice-backend:4000').replace(/\/$/, '');

const TENANT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;

/**
 * Extract and validate tenant from request header. Returns null + sends 400 if invalid.
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {string|null} Tenant slug or null (response already sent)
 */
function requireTenant(req, res) {
  const tenant = req.headers['x-adas-tenant'];
  if (!tenant) {
    res.status(400).json({ ok: false, error: 'X-ADAS-TENANT header required' });
    return null;
  }
  if (!TENANT_SLUG_RE.test(tenant)) {
    res.status(400).json({ ok: false, error: `Invalid tenant slug: "${tenant}"` });
    return null;
  }
  return tenant;
}

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
// Voice Config Push — deploy voice settings to voice-backend
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Push voice configuration from the solution definition to the voice-backend.
 * Called after ADAS Core deploy succeeds.
 *
 * Maps solution.voice fields to voice-backend REST endpoints:
 *   - verification → POST /api/voice-verification/config
 *   - phones       → POST /api/voice-verification/phones (each)
 *   - prompt       → POST /api/voice-prompt
 *   - skills       → POST /api/voice-skills/selection
 *
 * @param {Object} voice - solution.voice config block
 * @param {Array}  skills - expanded skill definitions (for slug mapping)
 * @param {Object} req - Express request (for tenant header)
 * @returns {Object} { summary, warnings }
 */
async function pushVoiceConfig(voice, skills, req) {
  const tenant = req.headers['x-adas-tenant'];
  if (!tenant) throw new Error('X-ADAS-TENANT header required for voice config');
  const headers = { 'Content-Type': 'application/json', 'X-ADAS-TENANT': tenant };
  const warnings = [];
  const summary = { enabled: !!voice.enabled };

  const voiceFetch = (path, body) =>
    fetch(`${VOICE_BACKEND_URL}/api/${path}`, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }).then(r => r.json()).catch(e => {
      warnings.push(`Voice API ${path} failed: ${e.message}`);
      return { ok: false };
    });

  // ── 1. Verification config ──
  if (voice.verification) {
    const verConfig = {
      enabled: voice.verification.enabled !== false,
      method: voice.verification.method || 'phone_lookup',
      maxAttempts: voice.verification.maxAttempts || 3,
      onFailure: voice.verification.onFailure || 'hangup',
      skipRecentMinutes: voice.verification.skipRecentMinutes || 0,
      securityQuestion: voice.verification.securityQuestion || { question: '', answer: '', answerMatchMode: 'smart' },
      customSkill: voice.verification.customSkill || { skillSlug: '' },
    };
    const r = await voiceFetch('voice-verification/config', verConfig);
    summary.verification = r.ok ? 'saved' : 'failed';
  }

  // ── 2. Known phones ──
  if (voice.knownPhones && Array.isArray(voice.knownPhones)) {
    let added = 0;
    for (const phone of voice.knownPhones) {
      const r = await voiceFetch('voice-verification/phones', {
        number: phone.number, label: phone.label || '',
      });
      if (r.ok) added++;
    }
    summary.phones_added = added;
  }

  // ── 3. Prompt customizations (via POST /api/voice-prompt/apply) ──
  const promptPatch = {};
  if (voice.language) promptPatch.language = voice.language;
  if (voice.persona) promptPatch.persona = voice.persona;
  if (voice.welcome) promptPatch.welcome = voice.welcome;
  if (voice.prompt) {
    if (voice.prompt.behaviorRules) promptPatch.behavior_rules = voice.prompt.behaviorRules;
    if (voice.prompt.informationGathering) promptPatch.information_gathering = voice.prompt.informationGathering;
  }
  if (Object.keys(promptPatch).length > 0) {
    const r = await voiceFetch('voice-prompt/apply', { patch: promptPatch });
    summary.prompt = r.ok ? 'saved' : 'failed';
  }

  // ── 4. Skill voice selection/ordering ──
  if (voice.skillOverrides && Array.isArray(voice.skillOverrides)) {
    const enabled = voice.skillOverrides.filter(s => s.voiceEnabled !== false).map(s => s.slug);
    const disabled = voice.skillOverrides.filter(s => s.voiceEnabled === false).map(s => s.slug);
    if (enabled.length > 0 || disabled.length > 0) {
      const r = await voiceFetch('voice-skills/selection', { enabled, disabled });
      summary.skill_selection = r.ok ? 'saved' : 'failed';
    }
  }

  return { summary, warnings };
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
/**
 * Check if file content looks like an MCP server (stays alive on stdin).
 * Returns true if the content contains patterns indicating it reads stdin
 * for JSON-RPC messages (either via SDK or raw implementation).
 */
function looksLikeMcpServer(content) {
  if (!content || typeof content !== 'string') return false;
  const patterns = [
    /process\.stdin/,                           // Raw stdin reading
    /readline.*createInterface/,                // readline over stdin
    /StdioServerTransport/,                     // MCP SDK stdio transport
    /McpServer|createServer/,                   // MCP SDK server creation
    /jsonrpc.*2\.0/,                            // JSON-RPC protocol handling
    /tools\/list|tools\/call/,                  // MCP method handlers
    /method.*initialize/,                       // MCP initialize handler
    /rl\.on\s*\(\s*["']line/,                   // readline line handler
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Detect anti-patterns in connector source code that will cause runtime failures.
 *
 * A-Team Core runs stdio connectors as child processes — they communicate via
 * stdin/stdout JSON-RPC. Code that starts a web server (express, http, fastify,
 * koa, etc.) or binds to a port will crash with EADDRINUSE because ADAS Core's
 * own server already occupies common ports, and the connector is NOT supposed
 * to listen on any port.
 *
 * @param {string} connectorId - Connector ID for error messages
 * @param {Array<{path: string, content: string}>} files - All connector files
 * @returns {{ errors: string[], warnings: string[] }}
 */
function detectConnectorAntiPatterns(connectorId, files) {
  const errors = [];
  const warnings = [];

  for (const file of files) {
    if (!file.content || typeof file.content !== 'string') continue;
    // Only analyze JS/TS/MJS files
    if (!/\.(js|ts|mjs|cjs)$/.test(file.path)) continue;

    const content = file.content;
    const fileName = file.path;

    // ── FATAL: Web server / port binding in a stdio connector ──
    // These patterns indicate the code starts an HTTP server, which will crash.
    const webServerPatterns = [
      { pattern: /\bexpress\s*\(\s*\)/,                  reason: 'creates an Express server' },
      { pattern: /\bapp\.listen\s*\(/,                    reason: 'binds to a network port via app.listen()' },
      { pattern: /\.listen\s*\(\s*(\d+|PORT|port|process\.env\.PORT)/, reason: 'binds to a network port' },
      { pattern: /\bhttp\.createServer\s*\(/,             reason: 'creates an HTTP server' },
      { pattern: /\bhttps\.createServer\s*\(/,            reason: 'creates an HTTPS server' },
      { pattern: /\bfastify\s*\(\s*\)/,                   reason: 'creates a Fastify server' },
      { pattern: /\bnew\s+Koa\s*\(/,                      reason: 'creates a Koa server' },
      { pattern: /\bnew\s+Hapi\.Server\s*\(/,             reason: 'creates a Hapi server' },
      { pattern: /\bnet\.createServer\s*\(/,              reason: 'creates a raw TCP server' },
      { pattern: /\bHttpServerTransport\b/,               reason: 'uses HTTP transport (A-Team connectors MUST use StdioServerTransport)' },
      { pattern: /\bSSEServerTransport\b/,                reason: 'uses SSE transport (A-Team connectors MUST use StdioServerTransport)' },
      { pattern: /\bStreamableHTTPServerTransport\b/,     reason: 'uses HTTP transport (A-Team connectors MUST use StdioServerTransport)' },
    ];

    for (const { pattern, reason } of webServerPatterns) {
      if (pattern.test(content)) {
        errors.push(
          `FATAL: "${fileName}" in connector "${connectorId}" ${reason}. ` +
          `A-Team Core runs stdio connectors as child processes — they MUST communicate via stdin/stdout JSON-RPC, NOT by starting a web server. ` +
          `The connector will crash at runtime with EADDRINUSE (port conflict with ADAS Core). ` +
          `Fix: Remove all HTTP server code. Use StdioServerTransport from @modelcontextprotocol/sdk, or implement raw JSON-RPC over stdin/stdout. ` +
          `See the connector example (ateam_get_examples type="connector") for the correct pattern.`
        );
        break; // One error per file is enough
      }
    }

    // ── WARNING: Suspicious patterns that might cause issues ──
    const suspiciousPatterns = [
      { pattern: /\brequire\s*\(\s*['"]express['"]\s*\)/, reason: 'imports Express (web framework) — stdio connectors should NOT use Express' },
      { pattern: /\bimport\s+.*\bfrom\s+['"]express['"]/, reason: 'imports Express (web framework) — stdio connectors should NOT use Express' },
      { pattern: /\brequire\s*\(\s*['"]koa['"]\s*\)/,     reason: 'imports Koa (web framework) — stdio connectors should NOT use Koa' },
      { pattern: /\brequire\s*\(\s*['"]fastify['"]\s*\)/, reason: 'imports Fastify (web framework) — stdio connectors should NOT use Fastify' },
      { pattern: /process\.exit\s*\(\s*\d/,               reason: 'calls process.exit() — MCP servers should stay alive and handle shutdown gracefully' },
      { pattern: /setTimeout\s*\(\s*.*process\.exit/,      reason: 'schedules process.exit() — MCP servers must stay alive' },
    ];

    for (const { pattern, reason } of suspiciousPatterns) {
      if (pattern.test(content)) {
        warnings.push(`"${fileName}" in connector "${connectorId}" ${reason}.`);
      }
    }
  }

  return { errors, warnings };
}

function resolveEntryPoint(connectorId, filePaths, files, tenant) {
  // Tenant-scoped path: /mcp-store/<tenant>/<connectorId>/
  // Falls back to legacy /mcp-store/<connectorId>/ if no tenant provided
  const basePath = tenant ? `/mcp-store/${tenant}/${connectorId}` : `/mcp-store/${connectorId}`;
  const warnings = [];

  // Helper: get file content by path
  const getContent = (filePath) => files.find(f => f.path === filePath)?.content;

  // 1. Check package.json "main" field
  const pkgFile = files.find(f => f.path === 'package.json');
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      if (pkg.main) {
        const mainContent = getContent(pkg.main);
        if (mainContent && !looksLikeMcpServer(mainContent)) {
          warnings.push(`package.json "main" points to "${pkg.main}" but it doesn't look like an MCP server (no stdin/JSON-RPC handling found). MCP servers must stay alive and read JSON-RPC from stdin.`);
        }
        return { command: 'node', args: [`${basePath}/${pkg.main}`], warnings };
      }
    } catch { /* ignore parse errors */ }
  }

  // 2. Well-known entry points by priority — skip files that don't look like servers
  const candidates = [
    { file: 'server.js',  command: 'node' },
    { file: 'index.js',   command: 'node' },
    { file: 'server.py',  command: 'python3' },
    { file: 'main.py',    command: 'python3' },
    { file: 'server.ts',  command: 'npx', extraArgs: ['tsx'] },
    { file: 'index.ts',   command: 'npx', extraArgs: ['tsx'] },
  ];

  // First pass: find a candidate that looks like an MCP server
  for (const { file, command, extraArgs } of candidates) {
    if (!filePaths.includes(file)) continue;
    const content = getContent(file);
    if (content && looksLikeMcpServer(content)) {
      const args = [...(extraArgs || []), `${basePath}/${file}`];
      return { command, args, warnings };
    }
  }

  // Second pass: fallback to first existing candidate (with warning)
  for (const { file, command, extraArgs } of candidates) {
    if (filePaths.includes(file)) {
      const args = [...(extraArgs || []), `${basePath}/${file}`];
      warnings.push(`Auto-resolved entry point "${file}" but it doesn't look like an MCP server. MCP servers must stay alive and read JSON-RPC messages from stdin. If this file is not your server, set "main" in package.json to point to the correct file.`);
      return { command, args, warnings };
    }
  }

  // 3. Fallback: first .js file at root level
  const rootJs = filePaths.find(p => !p.includes('/') && p.endsWith('.js'));
  if (rootJs) {
    warnings.push(`No standard entry point (server.js/index.js) found — falling back to "${rootJs}". Make sure this file is your MCP server.`);
    return { command: 'node', args: [`${basePath}/${rootJs}`], warnings };
  }

  return { command: null, args: [], warnings };
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

  // ── Early anti-pattern detection on uploaded files ──
  // Catch web-server-in-stdio errors before the files even reach the Skill Builder.
  const uploadedFiles = req.body?.files;
  if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
    const antiPatterns = detectConnectorAntiPatterns(connectorId, uploadedFiles);
    if (antiPatterns.errors.length > 0) {
      console.error(`[Deploy] ✖ Pre-upload rejected for "${connectorId}": ${antiPatterns.errors[0]}`);
      return res.status(400).json({
        ok: false,
        error: 'connector_source_invalid',
        connector_id: connectorId,
        message: antiPatterns.errors[0],
        all_errors: antiPatterns.errors,
        warnings: antiPatterns.warnings,
        fix_hint: 'A-Team connectors use stdio transport (stdin/stdout JSON-RPC). Remove all HTTP server code. See ateam_get_examples(type="connector") for the correct pattern.',
      });
    }
    // Attach warnings to the forwarded response
    if (antiPatterns.warnings.length > 0) {
      console.warn(`[Deploy] ⚠ Pre-upload warnings for "${connectorId}": ${antiPatterns.warnings.join('; ')}`);
    }
  }

  try {
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/import/mcp-store/${encodeURIComponent(connectorId)}`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(120000), // 2 min for large files
    });
    const data = await resp.json();

    // Append anti-pattern warnings to the response
    if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      const { warnings } = detectConnectorAntiPatterns(connectorId, uploadedFiles);
      if (warnings.length > 0) {
        data.connector_warnings = warnings;
      }
    }

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
  const tenant = requireTenant(req, res);
  if (!tenant) return;

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
  const tenant = requireTenant(req, res);
  if (!tenant) return;

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
  const tenant = requireTenant(req, res);
  if (!tenant) return;

  const { solution, skills, connectors, mcp_store } = req.body;

  if (!solution?.id) {
    return res.status(400).json({ ok: false, error: 'Missing solution.id' });
  }
  if (!solution?.name) {
    return res.status(400).json({ ok: false, error: 'Missing solution.name' });
  }

  // Guard against accidental skill wipe: if solution declares skills in topology
  // but the caller passes an empty skills array, reject the deploy.
  const topologySkillCount = (solution.skills || []).length;
  if (Array.isArray(skills) && skills.length === 0 && topologySkillCount > 0) {
    return res.status(400).json({
      ok: false,
      error: `Solution "${solution.id}" declares ${topologySkillCount} skills in topology but skills array is empty. ` +
             `This would wipe all deployed skills. Pass the full skill definitions or omit the skills parameter to update only the solution architecture.`,
    });
  }

  try {
    // Collect deploy-time warnings from entry-point analysis, compatibility checks, etc.
    const deployWarnings = [];

    // ── Auto-expand minimal skills ──
    const expandedSkillsList = [];
    const expandedSkills = (skills || []).map(s => {
      const needsExpand = !s.intents || !s.scenarios || !s.role;
      if (!needsExpand) return s;
      const { skill: expanded, expanded_fields } = expandSkill(s);
      expandedSkillsList.push({ skill_id: s.id, expanded_fields });
      return expanded;
    });

    // ── Pre-deploy validation (on expanded skills) ──
    const validationContext = { skills: expandedSkills, connectors: connectors || [], mcp_store: mcp_store || {} };
    const preValidation = validateSolution(solution, validationContext);
    if (preValidation.errors?.length > 0) {
      console.log(`[Deploy] Pre-deploy errors for ${solution.id}: ${preValidation.errors.map(e => e.message).join('; ')}`);
    }
    if (preValidation.warnings?.length > 0) {
      console.log(`[Deploy] Pre-deploy warnings for ${solution.id}: ${preValidation.warnings.map(w => w.message).join('; ')}`);
    }

    // ── Check mcp_store for known issues ──
    // The A-Team Core runtime uses Node.js 22.x (supports ESM + MCP SDK).
    // Check for missing package.json, missing "type": "module" when using ESM, etc.
    if (mcp_store && Object.keys(mcp_store).length > 0) {
      for (const [connId, files] of Object.entries(mcp_store)) {
        const pkgFile = (files || []).find(f => f.path === 'package.json');
        if (pkgFile?.content) {
          try {
            const pkg = JSON.parse(pkgFile.content);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

            // If using MCP SDK (ESM), ensure package.json has "type": "module"
            if (allDeps['@modelcontextprotocol/sdk'] && pkg.type !== 'module') {
              deployWarnings.push({
                connector_id: connId,
                warning: `Connector "${connId}" uses @modelcontextprotocol/sdk (ESM-only) but package.json is missing "type": "module". ` +
                  `Add \`"type": "module"\` to package.json or rename .js files to .mjs to avoid ERR_REQUIRE_ESM errors.`,
              });
              console.warn(`[Deploy] ⚠ Connector "${connId}" uses MCP SDK but missing "type": "module"`);
            }
          } catch { /* ignore parse errors */ }
        } else {
          // No package.json — check if any JS files use import/export (ESM syntax)
          const jsFiles = (files || []).filter(f => f.path.endsWith('.js'));
          const usesEsm = jsFiles.some(f => f.content && /\b(import\s+.*from\s+|export\s+(default|const|function|class)\s)/.test(f.content));
          if (usesEsm) {
            deployWarnings.push({
              connector_id: connId,
              warning: `Connector "${connId}" uses ESM import/export syntax but has no package.json. ` +
                `Add a package.json with "type": "module" and list dependencies so npm install can run.`,
            });
            console.warn(`[Deploy] ⚠ Connector "${connId}" uses ESM syntax but no package.json`);
          }
        }

        // ── Anti-pattern detection — catch web server code, port binding, etc. ──
        // These would cause EADDRINUSE crashes at runtime. Catch them early.
        const antiPatterns = detectConnectorAntiPatterns(connId, files || []);
        if (antiPatterns.errors.length > 0) {
          // Fatal anti-patterns block deployment
          console.error(`[Deploy] ✖ Connector "${connId}" has fatal anti-patterns: ${antiPatterns.errors.join('; ')}`);
          return res.status(400).json({
            ok: false,
            error: 'connector_source_invalid',
            connector_id: connId,
            message: antiPatterns.errors[0],
            all_errors: antiPatterns.errors,
            fix_hint: 'A-Team connectors use stdio transport (stdin/stdout JSON-RPC). Remove all HTTP server code (express, app.listen, http.createServer, etc.). Use StdioServerTransport or raw JSON-RPC over stdin. See ateam_get_examples(type="connector") for the correct pattern.',
          });
        }
        if (antiPatterns.warnings.length > 0) {
          for (const w of antiPatterns.warnings) {
            deployWarnings.push({ connector_id: connId, warning: w });
            console.warn(`[Deploy] ⚠ ${w}`);
          }
        }
      }
    }

    // ── Anti-pattern detection for connectors WITHOUT mcp_store ──
    // (uploaded via ateam_upload_connector_files earlier — we can't re-check those,
    //  but we CAN check inline mcp_store files above)

    // ── Auto-resolve connector command/args from mcp_store ──
    // When an agent provides mcp_store code but omits command/args,
    // we auto-detect the entry point and runtime from the uploaded files.
    // Explicit command/args always win (no override).
    const resolvedConnectors = (connectors || []).map(c => {
      const storeFiles = mcp_store?.[c.id];
      const hasExplicitCommand = !!c.command;

      // Only auto-resolve for stdio connectors without explicit command
      const isHttp = c.transport === 'http';
      if (hasExplicitCommand || isHttp) {
        return c;
      }

      const tenant = req.headers['x-adas-tenant'];
      let filePaths, filesForDetection;

      if (storeFiles && storeFiles.length > 0) {
        // Case 1: inline mcp_store files provided in this deploy
        filePaths = storeFiles.map(f => f.path);
        filesForDetection = storeFiles;
      } else {
        // Case 2: no inline mcp_store — check if files already exist on disk from a previous deploy
        const MCP_STORE_BASE = '/mcp-store';
        const dirCandidates = [];
        if (tenant) dirCandidates.push(path.join(MCP_STORE_BASE, tenant, c.id));
        dirCandidates.push(path.join(MCP_STORE_BASE, c.id));

        let connectorDir = null;
        for (const dir of dirCandidates) {
          try { if (fs.existsSync(dir)) { connectorDir = dir; break; } } catch { /* ignore */ }
        }

        if (!connectorDir) return c; // no files anywhere — skip

        // Read file names from disk
        try {
          const allFiles = [];
          const readDir = (dir, prefix = '') => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.name === 'node_modules' || entry.name === '.git') continue;
              const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
              if (entry.isDirectory()) { readDir(path.join(dir, entry.name), relPath); }
              else { allFiles.push({ path: relPath, content: fs.readFileSync(path.join(dir, entry.name), 'utf-8') }); }
            }
          };
          readDir(connectorDir);
          filePaths = allFiles.map(f => f.path);
          filesForDetection = allFiles;
          console.log(`[Deploy] Auto-detect for ${c.id}: found ${filePaths.length} files on disk at ${connectorDir}`);
        } catch (e) {
          console.warn(`[Deploy] Could not read disk files for ${c.id}: ${e.message}`);
          return c;
        }
      }

      const resolved = resolveEntryPoint(c.id, filePaths, filesForDetection, tenant);

      if (resolved.warnings?.length) {
        for (const w of resolved.warnings) {
          console.warn(`[Deploy] ⚠ Connector ${c.id}: ${w}`);
        }
        // Attach warnings so they appear in the deploy response
        deployWarnings.push(...resolved.warnings.map(w => ({ connector_id: c.id, warning: w })));
      }

      if (resolved.command) {
        console.log(`[Deploy] Auto-resolved connector ${c.id}: ${resolved.command} ${resolved.args.join(' ')}`);
        return { ...c, command: resolved.command, args: resolved.args, transport: c.transport || 'stdio' };
      }

      console.warn(`[Deploy] Could not auto-resolve entry point for connector ${c.id} — files: ${filePaths.join(', ')}`);
      return c;
    });

    // ── Auto-inject handoff-controller-mcp for handoff source skills ──
    const handoffs = solution.handoffs || [];
    const handoffSourceSkills = new Set();
    for (const h of handoffs) {
      if (h.mechanism === 'handoff-controller-mcp' && h.from) {
        handoffSourceSkills.add(h.from);
      }
    }
    if (handoffSourceSkills.size > 0) {
      for (const s of expandedSkills) {
        if (handoffSourceSkills.has(s.id)) {
          const conns = s.connectors || [];
          if (!conns.includes('handoff-controller-mcp')) {
            s.connectors = [...conns, 'handoff-controller-mcp'];
            console.log(`[Deploy] Auto-injected handoff-controller-mcp into skill "${s.id}" (handoff source)`);
          }
        }
      }
    }

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
      skills: expandedSkills.map(s => ({
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
    for (const s of expandedSkills) {
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

    // ── Verify connectors are registered in ADAS Core (post-deploy) ──
    // Check AFTER deploy-all so connectors from mcp_store are already registered.
    // Only warn about connectors that are genuinely still missing.
    try {
      const adasCoreUrl = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';
      const connectorListResp = await fetch(`${adasCoreUrl}/api/connectors`, {
        headers: sbHeaders(req),
        signal: AbortSignal.timeout(5000),
      });
      if (connectorListResp.ok) {
        const registeredConnectors = await connectorListResp.json();
        const registeredIds = new Set(
          (Array.isArray(registeredConnectors) ? registeredConnectors : registeredConnectors.connectors || [])
            .map(c => c.id)
        );
        // Check all connectors used by skills
        const allSkillConnectors = new Set();
        for (const s of expandedSkills) {
          for (const cId of (s.connectors || [])) {
            allSkillConnectors.add(cId);
          }
        }
        for (const cId of allSkillConnectors) {
          if (!registeredIds.has(cId)) {
            deployWarnings.push({
              connector_id: cId,
              warning: `Connector "${cId}" is used by a skill but is NOT registered in ADAS Core. UI plugins calling this connector will get 404 errors. Register it via POST /api/mcp-store/upload + POST /api/connectors.`,
            });
            console.warn(`[Deploy] ⚠ Connector "${cId}" not registered in ADAS Core`);
          }
        }
      }
    } catch (e) {
      // Non-fatal — don't block deployment if ADAS Core is unreachable
      console.warn(`[Deploy] Could not verify connectors in ADAS Core: ${e.message}`);
    }

    // ── Auto-deploy UI plugin assets directly to ADAS Core ──────────
    // When skills have ui_plugins, ensure mcp_store files (including ui-dist/)
    // are uploaded directly to Core AND connectors are registered/connected.
    // This bypasses the Skill Builder → Core pipeline which can fail to place
    // ui-dist files correctly, eliminating the need for manual uploads.
    let uiPluginDeploy = null;
    const uiPluginSkills = expandedSkills.filter(s => s.ui_plugins?.length > 0);
    if (uiPluginSkills.length > 0 && mcp_store && Object.keys(mcp_store).length > 0) {
      const adasCoreUrl = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';
      const tenant = req.headers['x-adas-tenant'];
      uiPluginDeploy = { connectors: [], assets: [] };

      // Collect connector IDs used by UI plugins
      const uiConnectorIds = new Set();
      for (const skill of uiPluginSkills) {
        for (const plugin of skill.ui_plugins) {
          if (plugin.connector_id) uiConnectorIds.add(plugin.connector_id);
        }
      }

      for (const connId of uiConnectorIds) {
        const files = mcp_store[connId];
        if (!files?.length) continue;

        const hasUiDist = files.some(f => f.path.startsWith('ui-dist/'));
        if (!hasUiDist) {
          console.log(`[Deploy UI] Connector "${connId}" has no ui-dist/ files in mcp_store, skipping direct upload`);
          continue;
        }

        try {
          // Step 1: Upload mcp_store files directly to Core (includes ui-dist/)
          console.log(`[Deploy UI] Uploading ${files.length} files for UI connector "${connId}" directly to Core`);
          const uploadResp = await fetch(`${adasCoreUrl}/api/mcp-store/upload`, {
            method: 'POST',
            headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectorId: connId, files, installDeps: true }),
            signal: AbortSignal.timeout(360000),
          });

          if (!uploadResp.ok) {
            const errText = await uploadResp.text().catch(() => uploadResp.statusText);
            throw new Error(`mcp-store upload failed (${uploadResp.status}): ${errText}`);
          }
          const uploadData = await uploadResp.json().catch(() => ({}));
          console.log(`[Deploy UI] Uploaded files for "${connId}": ${uploadData.filesWritten?.length || '?'} written, build=${uploadData.buildRan || false}`);

          // Step 2: Ensure connector is registered in Core
          const connDef = (connectors || []).find(c => c.id === connId);
          if (connDef) {
            try {
              await fetch(`${adasCoreUrl}/api/connectors`, {
                method: 'POST',
                headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
                body: JSON.stringify(connDef),
                signal: AbortSignal.timeout(10000),
              });
            } catch { /* may already exist */ }
          }

          // Step 3: Connect connector
          try {
            await fetch(`${adasCoreUrl}/api/connectors/${encodeURIComponent(connId)}/connect`, {
              method: 'POST',
              headers: sbHeaders(req),
              signal: AbortSignal.timeout(30000),
            });
          } catch { /* non-fatal */ }

          uiPluginDeploy.connectors.push({ id: connId, ok: true, files_uploaded: files.length });

          // Step 4: Verify UI assets exist on Core
          if (tenant) {
            for (const skill of uiPluginSkills) {
              for (const plugin of (skill.ui_plugins || [])) {
                if (plugin.connector_id !== connId) continue;
                // Check for ui-dist files matching the plugin
                const pluginId = plugin.id?.split(':').pop() || plugin.short_id;
                if (!pluginId) continue;
                const uiDistFile = files.find(f =>
                  f.path.startsWith(`ui-dist/${pluginId}/`) && f.path.endsWith('/index.html')
                );
                if (uiDistFile) {
                  const assetUrl = `${adasCoreUrl}/mcp-ui/${tenant}/${connId}/${uiDistFile.path}`;
                  try {
                    const headResp = await fetch(assetUrl, {
                      method: 'HEAD',
                      signal: AbortSignal.timeout(5000),
                    });
                    uiPluginDeploy.assets.push({
                      plugin: pluginId, connector: connId,
                      ok: headResp.ok, status: headResp.status,
                      path: uiDistFile.path,
                    });
                    if (headResp.ok) {
                      console.log(`[Deploy UI] ✓ Asset verified: ${uiDistFile.path}`);
                    } else {
                      console.warn(`[Deploy UI] ✗ Asset NOT found (${headResp.status}): ${uiDistFile.path}`);
                      deployWarnings.push({
                        connector_id: connId,
                        warning: `UI plugin "${pluginId}" asset uploaded but not accessible at ${uiDistFile.path} (HTTP ${headResp.status}). May need Core restart or path fix.`,
                      });
                    }
                  } catch (e) {
                    console.warn(`[Deploy UI] Could not verify asset ${uiDistFile.path}: ${e.message}`);
                  }
                }
              }
            }
          }

        } catch (err) {
          console.error(`[Deploy UI] Direct Core upload for "${connId}" failed: ${err.message}`);
          uiPluginDeploy.connectors.push({ id: connId, ok: false, error: err.message });
          deployWarnings.push({
            connector_id: connId,
            warning: `Direct Core upload for UI connector "${connId}" failed: ${err.message}. UI plugins may not work.`,
          });
        }
      }

      if (uiPluginDeploy.connectors.length > 0) {
        const ok = uiPluginDeploy.connectors.filter(c => c.ok).length;
        const failed = uiPluginDeploy.connectors.filter(c => !c.ok).length;
        console.log(`[Deploy UI] Direct Core upload complete: ${ok} ok, ${failed} failed`);
      }

      // ── Verification: Test that plugins can actually be loaded ──
      const uiTenant = req.headers['x-adas-tenant'];
      if (uiTenant && uiPluginSkills.length > 0) {
        console.log(`[Deploy UI Verification] Testing plugin loading...`);
        const pluginVerification = [];
        const adasCoreUrl = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';

        try {
          // Fetch plugin list from Core
          const pluginListResp = await fetch(`${adasCoreUrl}/api/solutions/${encodeURIComponent(solution.id)}/ui-plugins`, {
            method: 'GET',
            headers: sbHeaders(req),
            signal: AbortSignal.timeout(10000),
          });

          if (pluginListResp.ok) {
            const pluginList = await pluginListResp.json();
            const plugins = pluginList.plugins || [];

            console.log(`[Deploy UI Verification] Found ${plugins.length} plugins, testing each...`);

            for (const plugin of plugins) {
              try {
                // Attempt to fetch plugin manifest
                const manifestUrl = `${adasCoreUrl}/api/ui-plugins/${encodeURIComponent(plugin.id)}/manifest`;
                const manifestResp = await fetch(manifestUrl, {
                  method: 'GET',
                  headers: sbHeaders(req),
                  signal: AbortSignal.timeout(5000),
                });

                if (manifestResp.ok) {
                  const manifest = await manifestResp.json();
                  // Verify manifest has required fields
                  const hasId = !!manifest.id;
                  const hasName = !!manifest.name;
                  const hasRender = !!manifest.render;
                  const isValid = hasId && hasName && hasRender;

                  pluginVerification.push({
                    id: plugin.id,
                    ok: isValid,
                    manifest_valid: isValid,
                    has_id: hasId,
                    has_name: hasName,
                    has_render: hasRender,
                  });

                  console.log(`[Deploy UI Verification] ✓ Plugin "${plugin.id}" manifest valid`);
                } else {
                  pluginVerification.push({
                    id: plugin.id,
                    ok: false,
                    error: `Manifest fetch failed (${manifestResp.status})`,
                  });
                  console.warn(`[Deploy UI Verification] ✗ Plugin "${plugin.id}" manifest not found (${manifestResp.status})`);
                }
              } catch (err) {
                pluginVerification.push({
                  id: plugin.id,
                  ok: false,
                  error: err.message,
                });
                console.warn(`[Deploy UI Verification] ✗ Plugin "${plugin.id}" test failed: ${err.message}`);
              }
            }

            if (uiPluginDeploy) {
              uiPluginDeploy.verification = pluginVerification;
              uiPluginDeploy.verification_summary = {
                total: pluginVerification.length,
                valid: pluginVerification.filter(p => p.ok).length,
                failed: pluginVerification.filter(p => !p.ok).length,
              };
            }
          } else {
            console.warn(`[Deploy UI Verification] Could not fetch plugin list from Core: ${pluginListResp.status}`);
          }
        } catch (err) {
          console.warn(`[Deploy UI Verification] Test failed: ${err.message}`);
          if (uiPluginDeploy) {
            uiPluginDeploy.verification_error = err.message;
          }
        }
      }
    }

    // ── Push voice config to voice-backend (if solution has voice section) ──
    let voiceDeploy = null;
    if (solution.voice) {
      voiceDeploy = await pushVoiceConfig(solution.voice, expandedSkills, req);
      if (voiceDeploy.warnings?.length) {
        for (const w of voiceDeploy.warnings) {
          deployWarnings.push({ voice: true, warning: w });
        }
      }
      console.log(`[Deploy] Voice config pushed: ${JSON.stringify(voiceDeploy.summary)}`);
    }

    // ── GitHub workflow: ASYNC, non-blocking ──
    // Strategy: Respond to caller immediately, push to GitHub in background.
    // This prevents GitHub API slowness from blocking the deploy response.
    let githubDeploy = { ok: true, async: true, message: 'GitHub push queued in background' };
    const ghTenant = req.headers['x-adas-tenant'];
    if (github.isEnabled() && ghTenant) {
      // Build repo files synchronously (fast, local-only) so we can fire-and-forget the push
      let repoFiles = [];
      try {
        const exportBundle = {
          solution: solution || {},
          skills: Array.isArray(expandedSkills) ? expandedSkills : [],
          connectors: Array.isArray(resolvedConnectors) ? resolvedConnectors : [],
          timestamp: new Date().toISOString(),
        };
        const connectorSources = {};
        if (mcp_store && typeof mcp_store === 'object') {
          for (const [connId, files] of Object.entries(mcp_store)) {
            if (Array.isArray(files)) connectorSources[connId] = files;
          }
        }
        repoFiles = buildRepoFiles(exportBundle, connectorSources);
      } catch (buildErr) {
        console.error(`[GitHub] buildRepoFiles failed: ${buildErr.message}`);
        repoFiles = [];
      }

      if (repoFiles.length > 0) {
        // Fire-and-forget: push to GitHub in background
        const _ghTenant = ghTenant;
        const _solutionId = solution.id;
        const _desc = solution.description || `A-Team solution: ${solution.id}`;
        const _version = solution.version || '1.0.0';
        const _repoFiles = repoFiles;

        (async () => {
          try {
            const repoInfo = await github.ensureRepo(_ghTenant, _solutionId, _desc);
            console.log(`[GitHub BG] Repo ready: ${repoInfo.repo_url}`);

            const devResult = await github.pushToDev(
              _ghTenant, _solutionId, _repoFiles,
              `Staging: ${_solutionId} v${_version} - ${new Date().toISOString()}`,
              10
            );
            console.log(`[GitHub BG] ✓ Pushed to dev: ${devResult.tag} | ${_repoFiles.length} files`);

            if (repoInfo.created) {
              const mainResult = await github.pushFiles(
                _ghTenant, _solutionId, _repoFiles,
                `Initial deployment: ${_solutionId} v${_version}`
              );
              console.log(`[GitHub BG] ✓ First deploy — pushed to main: ${mainResult.commit_sha.substring(0, 7)}`);
            }
          } catch (err) {
            console.error(`[GitHub BG] Background push failed: ${err.message}`);
          }
        })();

        githubDeploy = {
          ok: true,
          async: true,
          message: `GitHub push running in background (${repoFiles.length} files). Check repo status with ateam_github_status().`,
        };
      }
    } else if (!github.isEnabled()) {
      githubDeploy = null;
    } else {
      githubDeploy = null;
      console.warn('[GitHub] No X-ADAS-TENANT header, skipping GitHub integration');
    }

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
      ...(githubDeploy && { github: githubDeploy }),
      ...(voiceDeploy && { voice: voiceDeploy.summary }),
      ...(uiPluginDeploy && { ui_plugin_deploy: uiPluginDeploy }),
      ...(preValidation.errors?.length > 0 && { validation_errors: preValidation.errors }),
      ...(preValidation.warnings?.length > 0 && { validation_warnings: preValidation.warnings }),
      ...(deployWarnings.length > 0 && { deploy_warnings: deployWarnings }),
      ...(expandedSkillsList.length > 0 && { auto_expanded_skills: expandedSkillsList }),
      _next_steps: [
        `GET /deploy/solutions/${solution.id}/health — verify skills deployed and connectors healthy`,
        `GET /deploy/solutions/${solution.id}/definition — read back the solution definition`,
        `GET /deploy/solutions/${solution.id}/skills — list deployed skills with internal IDs`,
        ...(githubDeploy?.ok ? [`View on GitHub: ${githubDeploy.repo_url}`] : []),
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

    // If the patch includes voice config, push it to voice-backend
    const updates = req.body.state_update || req.body.updates || req.body;
    if (updates.voice && typeof updates.voice === 'object') {
      try {
        const voiceResult = await pushVoiceConfig(updates.voice, [], req);
        data.voice = voiceResult.summary;
        if (voiceResult.warnings?.length) {
          data.voice_warnings = voiceResult.warnings;
        }
      } catch (e) {
        console.warn(`[Deploy] Voice config push on PATCH failed: ${e.message}`);
        data.voice_warning = `Voice config push failed: ${e.message}`;
      }
    }

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
// DELETE CONNECTOR FROM SOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DELETE /deploy/solutions/:solutionId/connectors/:connectorId — Remove a connector
 * Stops + deletes from Core, removes from solution + skill definitions, cleans mcp-store.
 */
router.delete('/solutions/:solutionId/connectors/:connectorId', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const cId = encodeURIComponent(req.params.connectorId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/connectors/${cId}`, {
      method: 'DELETE',
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Delete connector error:', err.message);
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
 * POST /deploy/solutions/:solutionId/skills/:skillId/test-pipeline — Test decision pipeline only
 * Body: { message: string }
 */
router.post('/solutions/:solutionId/skills/:skillId/test-pipeline', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const skillId = encodeURIComponent(req.params.skillId);
    const resp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/skills/${skillId}/test-pipeline`, {
      method: 'POST',
      headers: { ...sbHeaders(req), 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[Deploy] Test pipeline error:', err.message);
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
 * GET /deploy/solutions/:solutionId/connectors/:connectorId/tools — Auto-discover tools
 *
 * Reads the tools from a deployed connector and returns them formatted as
 * minimal skill tool definitions. Use this instead of manually defining tools
 * when the connector is already deployed.
 *
 * Returns: { ok, connector_id, tools: MinimalToolDef[] }
 */
router.get('/solutions/:solutionId/connectors/:connectorId/tools', async (req, res) => {
  try {
    const solId = encodeURIComponent(req.params.solutionId);
    const connId = encodeURIComponent(req.params.connectorId);

    // Get connector health (includes discovered tools)
    const healthResp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${solId}/connectors/health`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(15000),
    });
    const healthData = await healthResp.json();

    // Find the specific connector
    const connectors = healthData.connectors || healthData.mcps || [];
    const connector = connectors.find(c => c.id === req.params.connectorId || c.name === req.params.connectorId);

    if (!connector) {
      return res.status(404).json({ ok: false, error: `Connector "${req.params.connectorId}" not found in solution "${req.params.solutionId}"` });
    }

    // Extract tools and format as minimal skill tool definitions
    const discoveredTools = connector.tools || [];
    const minimalTools = discoveredTools.map(t => {
      const tool = {
        name: t.name,
        description: t.description || '',
      };
      // Convert MCP inputSchema to simplified inputs array
      if (t.inputSchema?.properties) {
        const required = t.inputSchema.required || [];
        tool.inputs = Object.entries(t.inputSchema.properties).map(([name, schema]) => ({
          name,
          type: schema.type || 'string',
          required: required.includes(name),
          description: schema.description || '',
        }));
      }
      // Output type hint
      if (t.outputSchema) {
        tool.output = t.outputSchema.description || 'Result object';
      }
      return tool;
    });

    res.json({
      ok: true,
      connector_id: req.params.connectorId,
      connector_status: connector.status,
      tools_count: minimalTools.length,
      tools: minimalTools,
      usage_hint: 'Copy these tools into your minimal skill definition. Add security classifications for PII/financial tools.',
    });
  } catch (err) {
    console.error('[Deploy] Connector tool discovery error:', err.message);
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

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB INTEGRATION — Version control for solutions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/solutions/:solutionId/github/push — Push solution to GitHub
 *
 * Fetches export bundle + connector source, commits atomically.
 * Auto-creates repo on first use.
 */
router.post('/solutions/:solutionId/github/push', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.json({ ok: true, skipped: true, reason: 'GitHub integration disabled' });
    }

    const solId = req.params.solutionId;
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const message = req.body?.message || `Deploy ${solId}`;

    // 1. Fetch export bundle
    const exportResp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(solId)}/export`, {
      headers: sbHeaders(req),
      signal: AbortSignal.timeout(30000),
    });
    if (!exportResp.ok) {
      const text = await exportResp.text().catch(() => '');
      return res.status(exportResp.status).json({ ok: false, error: `Export failed: ${text}` });
    }
    const exportBundle = await exportResp.json();

    // 2. Fetch connector sources
    const connectorSources = {};
    const connectors = exportBundle.connectors || [];
    for (const conn of connectors) {
      const connId = conn.id || conn.name;
      if (!connId) continue;
      try {
        const srcResp = await fetch(`${SKILL_BUILDER_URL}/api/solutions/${encodeURIComponent(solId)}/connectors/${encodeURIComponent(connId)}/source`, {
          headers: sbHeaders(req),
          signal: AbortSignal.timeout(15000),
        });
        if (srcResp.ok) {
          const srcData = await srcResp.json();
          connectorSources[connId] = srcData.files || srcData;
        }
      } catch (err) {
        console.warn(`[GitHub] Could not fetch source for connector ${connId}: ${err.message}`);
      }
    }

    // 3. Build repo files
    const files = buildRepoFiles(exportBundle, connectorSources);

    // 4. Ensure repo exists
    const repoInfo = await github.ensureRepo(tenant, solId,
      exportBundle.solution?.description || `A-Team solution: ${solId}`);

    // 5. Push files
    const result = await github.pushFiles(tenant, solId, files, message);

    res.json({
      ok: true,
      repo_url: repoInfo.repo_url,
      repo_created: repoInfo.created,
      ...result,
    });
  } catch (err) {
    console.error('[GitHub] Push error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/github/status — Repo status
 */
router.get('/solutions/:solutionId/github/status', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.json({ ok: true, enabled: false });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const status = await github.getRepoStatus(tenant, req.params.solutionId);
    res.json({ ok: true, ...status });
  } catch (err) {
    console.error('[GitHub] Status error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/github/read?path=... — Read a file
 */
router.get('/solutions/:solutionId/github/read', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration disabled' });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ ok: false, error: 'Missing ?path= parameter' });

    const file = await github.readFile(tenant, req.params.solutionId, filePath);
    res.json({ ok: true, ...file });
  } catch (err) {
    console.error('[GitHub] Read error:', err.message);
    res.status(err.message.includes('404') ? 404 : 500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /deploy/solutions/:solutionId/github/patch — Edit a file and commit
 * Body: { path, content, message? }
 */
router.post('/solutions/:solutionId/github/patch', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration disabled' });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const { path: filePath, content, message } = req.body || {};
    if (!filePath) return res.status(400).json({ ok: false, error: 'Missing path in body' });
    if (content === undefined) return res.status(400).json({ ok: false, error: 'Missing content in body' });

    const result = await github.patchFile(tenant, req.params.solutionId, filePath, content, message);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[GitHub] Patch error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /deploy/solutions/:solutionId/github/log?limit=N — Commit history
 */
router.get('/solutions/:solutionId/github/log', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration disabled' });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const limit = parseInt(req.query.limit) || 10;
    const log = await github.getLog(tenant, req.params.solutionId, limit);
    res.json({ ok: true, ...log });
  } catch (err) {
    console.error('[GitHub] Log error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /deploy/solutions/:solutionId/github/pull — Deploy FROM GitHub
 * Reads .ateam/export.json from the repo and feeds it into the deploy pipeline.
 */
router.post('/solutions/:solutionId/github/pull', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration disabled' });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const solId = req.params.solutionId;

    // 1. Read export.json from repo
    let exportFile;
    try {
      exportFile = await github.readFile(tenant, solId, '.ateam/export.json');
    } catch (err) {
      return res.status(404).json({
        ok: false,
        error: `Could not read .ateam/export.json from repo: ${err.message}`,
        hint: 'Push the solution to GitHub first with ateam_github_push.',
      });
    }

    let bundle;
    try {
      bundle = JSON.parse(exportFile.content);
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid JSON in .ateam/export.json' });
    }

    // 2. Also read connector source files from repo
    const connectorSources = {};
    try {
      const allFiles = await github.listFiles(tenant, solId);
      const connectorFiles = allFiles.filter(f => f.path.startsWith('connectors/'));

      // Group by connector ID
      for (const f of connectorFiles) {
        // connectors/<connectorId>/<filepath>
        const parts = f.path.split('/');
        if (parts.length < 3) continue;
        const connId = parts[1];
        const filePath = parts.slice(2).join('/');
        if (!connectorSources[connId]) connectorSources[connId] = [];
        // Read file content
        try {
          const fileData = await github.readFile(tenant, solId, f.path);
          connectorSources[connId].push({ path: filePath, content: fileData.content });
        } catch { /* skip unreadable files */ }
      }
    } catch (err) {
      console.warn(`[GitHub] Could not list repo files: ${err.message}`);
    }

    // 3. Upload connector source code directly to ADAS Core mcp-store
    // The deploy pipeline (import.js → exportDeploy.js) doesn't reliably pass mcp_store
    // through to Core, so we upload directly here before deploying skills.
    const adasCoreUrl = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';
    // Build auth headers for Core calls — use shared secret for service-to-service auth
    const coreMcpSecret = process.env.CORE_MCP_SECRET || '';
    const coreHeaders = { 'Content-Type': 'application/json' };
    if (coreMcpSecret) coreHeaders['x-adas-token'] = coreMcpSecret;
    if (req.headers['x-adas-tenant']) coreHeaders['X-ADAS-TENANT'] = req.headers['x-adas-tenant'];
    if (Object.keys(connectorSources).length > 0) {
      for (const [connId, files] of Object.entries(connectorSources)) {
        try {
          // Stop old connector so it picks up new code
          try {
            await fetch(`${adasCoreUrl}/api/connectors/${connId}/stop`, {
              method: 'POST', headers: coreHeaders, signal: AbortSignal.timeout(10000),
            });
            console.log(`[GitHub Pull] Stopped connector "${connId}" before code update`);
          } catch { /* may not be running */ }

          // Upload new code
          const uploadResp = await fetch(`${adasCoreUrl}/api/mcp-store/upload`, {
            method: 'POST',
            headers: coreHeaders,
            body: JSON.stringify({ connectorId: connId, files, installDeps: true }),
            signal: AbortSignal.timeout(360000),
          });
          const uploadResult = await uploadResp.json().catch(() => ({}));
          console.log(`[GitHub Pull] Uploaded ${files.length} files for "${connId}" to Core mcp-store: ${uploadResult.ok !== false ? 'OK' : uploadResult.error || 'failed'}`);

          // Restart connector with new code
          const startResp = await fetch(`${adasCoreUrl}/api/connectors/${connId}/start`, {
            method: 'POST', headers: coreHeaders, signal: AbortSignal.timeout(30000),
          });
          const startResult = await startResp.json().catch(() => ({}));
          console.log(`[GitHub Pull] Restarted connector "${connId}": ${startResult.tools?.length || 0} tools`);
        } catch (err) {
          console.warn(`[GitHub Pull] Failed to update connector "${connId}" in Core: ${err.message}`);
        }
      }
    }

    // 4. Deploy via the solution import endpoint
    const deployBody = {
      solution: bundle.solution,
      skills: bundle.skills,
      connectors: bundle.connectors,
      mcp_store: connectorSources,
    };

    const deployResp = await fetch(`${SKILL_BUILDER_URL}/api/deploy/solution`, {
      method: 'POST',
      headers: sbHeaders(req),
      body: JSON.stringify(deployBody),
      signal: AbortSignal.timeout(300000),
    });

    // Safe JSON parsing — deploy endpoint may return HTML on error
    let deployData;
    const ct = (deployResp.headers.get('content-type') || '');
    if (ct.includes('application/json')) {
      deployData = await deployResp.json().catch(() => ({ ok: false, error: `Deploy returned ${deployResp.status}` }));
    } else {
      const raw = await deployResp.text().catch(() => '');
      deployData = { ok: false, error: `Deploy returned non-JSON (${deployResp.status}): ${raw.slice(0, 200)}` };
    }
    res.status(deployResp.status).json({
      ok: deployData.ok !== false,
      source: 'github',
      repo_url: `https://github.com/${github.repoName(tenant, solId)}`,
      ...deployData,
    });
  } catch (err) {
    console.error('[GitHub] Pull error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /deploy/solutions/:solutionId/github/pull-connectors
 *
 * Reads connector source files from the GitHub repo and returns them
 * as an mcp_store object — ready to merge into a deploy request.
 * This is the backend for build_and_run's github:true flag.
 *
 * Unlike github/pull (which does a full deploy), this just reads files.
 */
router.post('/solutions/:solutionId/github/pull-connectors', async (req, res) => {
  try {
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration disabled' });
    }
    const tenant = req.headers['x-adas-tenant'];
    if (!tenant) return res.status(400).json({ ok: false, error: 'Missing X-ADAS-TENANT header' });

    const solId = req.params.solutionId;

    // List all files in the repo
    let allFiles;
    try {
      allFiles = await github.listFiles(tenant, solId);
    } catch (err) {
      return res.status(404).json({
        ok: false,
        error: `No GitHub repo found for solution "${solId}": ${err.message}`,
        hint: 'Deploy the solution first (with mcp_store) to auto-create the GitHub repo.',
      });
    }

    // Filter to connector files only
    const connectorFiles = allFiles.filter(f => f.path.startsWith('connectors/'));
    if (connectorFiles.length === 0) {
      return res.json({ ok: true, mcp_store: {}, reason: 'No connector files in repo' });
    }

    // Group by connector ID and read content
    const mcpStore = {};
    for (const f of connectorFiles) {
      const parts = f.path.split('/');
      if (parts.length < 3) continue;
      const connId = parts[1];
      const filePath = parts.slice(2).join('/');
      if (!mcpStore[connId]) mcpStore[connId] = [];
      try {
        const fileData = await github.readFile(tenant, solId, f.path);
        mcpStore[connId].push({ path: filePath, content: fileData.content });
      } catch { /* skip unreadable files */ }
    }

    res.json({
      ok: true,
      mcp_store: mcpStore,
      connectors_found: Object.keys(mcpStore).length,
      files_loaded: Object.values(mcpStore).reduce((sum, files) => sum + files.length, 0),
    });
  } catch (err) {
    console.error('[GitHub] Pull connectors error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOICE SIMULATION (text-based E2E testing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /deploy/voice-test
 *
 * Proxy to voice-backend /api/voice-simulate/batch.
 * Runs a full voice conversation simulation with text messages.
 * Returns the complete conversation transcript with verification status,
 * tool calls, and skill execution results.
 *
 * Body: { messages: string[], phone_number?: string, skill_slug?: string, timeout_ms?: number }
 */
router.post('/voice-test', async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const { messages, phone_number, skill_slug, timeout_ms = 60000, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages must be a non-empty array of strings' });
    }

    const body = {
      messages,
      ...(phone_number && { phoneNumber: phone_number }),
      ...(skill_slug && { skillSlug: skill_slug }),
      ...(model && { model }),
      timeout_ms,
    };

    const r = await fetch(`${VOICE_BACKEND_URL}/api/voice-simulate/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ADAS-TENANT': tenant },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(timeout_ms * messages.length + 30000, 600000)),
    });

    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error('[Deploy] voice-test error:', e.message);
    res.status(502).json({ ok: false, error: `Voice simulation failed: ${e.message}` });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GitHub Version Promotion & Management
// ══════════════════════════════════════════════════════════════════════════

/**
 * POST /solutions/:solutionId/promote
 * Promote a dev version to main (production).
 *
 * Request body:
 * {
 *   "tag": "dev-2026-03-11-005"  // Optional: specific dev tag to promote
 *                                 // If omitted, promotes latest dev tag
 * }
 */
router.post('/solutions/:solutionId/promote', async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const { solutionId } = req.params;
    const { tag: specifiedTag } = req.body || {};

    if (!solutionId) {
      return res.status(400).json({ ok: false, error: 'Solution ID required' });
    }

    // Check GitHub is enabled
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration not configured' });
    }

    // Promote dev to main
    const result = await github.promote(tenant, solutionId, specifiedTag);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Deploy] promote error:', e.message);
    res.status(400).json({ ok: false, error: `Promotion failed: ${e.message}` });
  }
});

/**
 * GET /solutions/:solutionId/versions/dev
 * List all available dev versions (tags) for a solution.
 *
 * Response:
 * {
 *   "ok": true,
 *   "versions": [
 *     {"tag": "dev-2026-03-11-005", "date": "2026-03-11", "counter": 5, "commit_sha": "..."},
 *     ...
 *   ]
 * }
 */
router.get('/solutions/:solutionId/versions/dev', async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const { solutionId } = req.params;

    if (!solutionId) {
      return res.status(400).json({ ok: false, error: 'Solution ID required' });
    }

    // Check GitHub is enabled
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration not configured' });
    }

    // List versions
    const result = await github.listDevVersions(tenant, solutionId);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Deploy] list-versions error:', e.message);
    res.status(400).json({ ok: false, error: `Failed to list versions: ${e.message}` });
  }
});

/**
 * POST /solutions/:solutionId/rollback
 * Rollback main branch to a previous production tag.
 *
 * ⚠️ DESTRUCTIVE — resets main to a specific commit.
 *
 * Request body:
 * {
 *   "tag": "prod-2026-03-10-001"  // Required: production tag to rollback to
 * }
 */
router.post('/solutions/:solutionId/rollback', async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const { solutionId } = req.params;
    const { tag } = req.body || {};

    if (!solutionId) {
      return res.status(400).json({ ok: false, error: 'Solution ID required' });
    }

    if (!tag) {
      return res.status(400).json({ ok: false, error: 'Tag required for rollback' });
    }

    // Check GitHub is enabled
    if (!github.isEnabled()) {
      return res.status(503).json({ ok: false, error: 'GitHub integration not configured' });
    }

    // Confirm action (require explicit 'confirm' parameter)
    const { confirm: confirmRollback } = req.body;
    if (confirmRollback !== true) {
      return res.status(400).json({
        ok: false,
        error: 'Rollback requires explicit confirmation. Set confirm: true in request body.',
        destructive: true,
        warning: 'This will reset main branch to the specified tag. Current main will be lost.'
      });
    }

    // Rollback
    const result = await github.rollback(tenant, solutionId, tag);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[Deploy] rollback error:', e.message);
    res.status(400).json({ ok: false, error: `Rollback failed: ${e.message}` });
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
