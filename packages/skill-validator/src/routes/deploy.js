/**
 * ADAS Deploy API routes
 *
 * Proxy endpoints that deploy skills, connectors, and full solutions
 * to ADAS Core. External agents use these to push their work to the runtime.
 *
 * POST /deploy/connector  — Deploy a connector to ADAS Core
 * POST /deploy/skill      — Deploy a skill MCP server to ADAS Core
 * POST /deploy/solution   — Deploy a full solution (identity + connectors + skills)
 */

import { Router } from 'express';

const router = Router();

const ADAS_CORE_URL = (process.env.ADAS_CORE_URL || 'http://ai-dev-assistant-backend-1:4000').replace(/\/$/, '');
const TENANT = (process.env.SB_TENANT || 'main').trim().toLowerCase();
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function adasHeaders() {
  return { 'Content-Type': 'application/json', 'X-ADAS-TENANT': TENANT };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/connector
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
    const result = await deployConnector(connector);
    res.json(result);
  } catch (err) {
    console.error('[Deploy] Connector error:', err.message);
    res.status(502).json({ ok: false, error: err.message, adas_url: ADAS_CORE_URL });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/skill
// ═══════════════════════════════════════════════════════════════════════════

router.post('/skill', async (req, res) => {
  const { skill } = req.body;

  if (!skill?.slug) {
    return res.status(400).json({ ok: false, error: 'Missing skill.slug' });
  }
  if (!SLUG_REGEX.test(skill.slug)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid skill.slug "${skill.slug}". Must match /^[a-z0-9]+(-[a-z0-9]+)*$/ (lowercase, hyphens only, no leading/trailing hyphens)`,
    });
  }
  if (!skill?.mcpServer) {
    return res.status(400).json({ ok: false, error: 'Missing skill.mcpServer (the MCP server source code)' });
  }

  try {
    const result = await deploySkill(skill);
    res.json(result);
  } catch (err) {
    console.error('[Deploy] Skill error:', err.message);
    res.status(502).json({ ok: false, error: err.message, adas_url: ADAS_CORE_URL });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /deploy/solution
// ═══════════════════════════════════════════════════════════════════════════

router.post('/solution', async (req, res) => {
  const { solution } = req.body;

  if (!solution?.id) {
    return res.status(400).json({ ok: false, error: 'Missing solution.id' });
  }

  const results = { ok: true, solution_id: solution.id, steps: {} };

  try {
    // Step 1: Deploy identity (if present)
    if (solution.identity) {
      try {
        const identityResult = await deployIdentity(solution.identity);
        results.steps.identity = identityResult;
      } catch (err) {
        results.steps.identity = { ok: false, error: err.message };
        // Identity failures are non-fatal — continue
      }
    }

    // Step 2: Deploy connectors (if present)
    if (solution.connectors?.length > 0) {
      results.steps.connectors = [];
      for (const connector of solution.connectors) {
        try {
          const connResult = await deployConnector(connector);
          results.steps.connectors.push(connResult);
        } catch (err) {
          results.steps.connectors.push({ ok: false, connector_id: connector.id, error: err.message });
        }
      }
    }

    // Step 3: Deploy skills (if present)
    if (solution.skills?.length > 0) {
      results.steps.skills = [];
      for (const skill of solution.skills) {
        if (!skill.slug || !SLUG_REGEX.test(skill.slug)) {
          results.steps.skills.push({
            ok: false,
            slug: skill.slug || '(missing)',
            error: `Invalid slug. Must match /^[a-z0-9]+(-[a-z0-9]+)*$/`,
          });
          continue;
        }
        if (!skill.mcpServer) {
          results.steps.skills.push({ ok: false, slug: skill.slug, error: 'Missing mcpServer' });
          continue;
        }
        try {
          const skillResult = await deploySkill(skill);
          results.steps.skills.push(skillResult);
        } catch (err) {
          results.steps.skills.push({ ok: false, slug: skill.slug, error: err.message });
        }
      }
    }

    // Determine overall success
    const connFails = (results.steps.connectors || []).filter(c => !c.ok).length;
    const skillFails = (results.steps.skills || []).filter(s => !s.ok).length;
    results.ok = connFails === 0 && skillFails === 0;

    res.json(results);
  } catch (err) {
    console.error('[Deploy] Solution error:', err.message);
    res.status(502).json({ ok: false, error: err.message, adas_url: ADAS_CORE_URL });
  }
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function deployConnector(connector) {
  const payload = {
    id: connector.id,
    name: connector.name,
    type: 'mcp',
    enabled: true,
    autoStart: true,
  };

  if (connector.layer) payload.layer = connector.layer;
  if (connector.credentials) payload.credentials = connector.credentials;

  // Transport-specific config
  if (connector.transport === 'stdio' || connector.command) {
    payload.transport = 'stdio';
    payload.config = {
      command: connector.command || 'node',
      args: connector.args || [],
      env: connector.env || {},
    };
  } else if (connector.transport === 'http' || connector.endpoint) {
    payload.transport = 'http';
    payload.endpoint = connector.endpoint || `http://${connector.id}:${connector.port || 3000}/mcp`;
    if (connector.command) {
      payload.config = {
        command: connector.command,
        args: connector.args || [],
        env: connector.env || {},
      };
    }
  }

  // Check if connector exists
  let action = 'created';
  try {
    const check = await fetch(`${ADAS_CORE_URL}/api/connectors/${connector.id}`, {
      headers: adasHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (check.ok) action = 'updated';
  } catch {
    // Connector doesn't exist or ADAS unreachable — try to create
  }

  // Create or update
  const method = action === 'updated' ? 'PATCH' : 'POST';
  const url = action === 'updated'
    ? `${ADAS_CORE_URL}/api/connectors/${connector.id}`
    : `${ADAS_CORE_URL}/api/connectors`;

  const syncResp = await fetch(url, {
    method,
    headers: adasHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!syncResp.ok) {
    const errText = await syncResp.text().catch(() => syncResp.statusText);
    throw new Error(`Connector sync failed (${syncResp.status}): ${errText}`);
  }

  // Start the connector
  let started = false;
  let tools = [];
  try {
    const startResp = await fetch(`${ADAS_CORE_URL}/api/connectors/${connector.id}/connect`, {
      method: 'POST',
      headers: adasHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    if (startResp.ok) {
      const startData = await startResp.json();
      started = true;
      tools = startData.tools || [];
    }
  } catch {
    // Start failed — connector synced but not running
  }

  return { ok: true, connector_id: connector.id, action, started, tools_discovered: tools.length };
}

async function deploySkill(skill) {
  const resp = await fetch(`${ADAS_CORE_URL}/api/skills/deploy-mcp`, {
    method: 'POST',
    headers: adasHeaders(),
    body: JSON.stringify({
      skillSlug: skill.slug,
      mcpServer: skill.mcpServer,
      requirements: skill.requirements || null,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Skill deploy failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return {
    ok: true,
    skill_slug: skill.slug,
    mcp_uri: data.mcpUri,
    port: data.port,
    connector_id: data.connectorId,
  };
}

async function deployIdentity(identity) {
  const resp = await fetch(`${ADAS_CORE_URL}/api/identity`, {
    method: 'POST',
    headers: adasHeaders(),
    body: JSON.stringify({
      actor_types: identity.actor_types || [],
      admin_roles: identity.admin_roles || [],
      default_actor_type: identity.default_actor_type || null,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Identity deploy failed (${resp.status}): ${errText}`);
  }

  return { ok: true };
}
