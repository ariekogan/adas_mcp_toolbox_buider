/**
 * Solutions API Routes
 *
 * Manages Solution definitions — the cross-skill architecture layer
 * that captures handoff flows, grant economy, channel routing, and
 * security contracts between skills.
 */

import { Router } from 'express';
import solutionsStore from '../store/solutions.js';
import skillsStore from '../store/skills.js';
import { processSolutionMessage } from '../services/solutionConversation.js';
import { validateSolution, validateSecurity, validateSolutionQuality } from '@adas/skill-validator';
import { getSkillSlug, deploySkillToADAS } from '../services/exportDeploy.js';
import adasCore from '../services/adasCoreClient.js';
import skillsRouter from './skills.js';
import validationRouter from "./solutionsValidation.js";

const router = Router();

// Mount skills router under /solutions/:solutionId/skills
router.use('/:solutionId/skills', skillsRouter);

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * List all solutions
 * GET /api/solutions
 */
router.get('/', async (req, res, next) => {
  try {
    const solutions = await solutionsStore.list();
    res.json({ solutions });
  } catch (err) {
    next(err);
  }
});

/**
 * Create new solution
 * POST /api/solutions
 * Body: { name: string }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Solution name is required' });
    }

    const solution = await solutionsStore.create(name);
    res.status(201).json({ solution });
  } catch (err) {
    next(err);
  }
});

/**
 * Get solution by ID
 * GET /api/solutions/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    res.json({ solution });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Update solution
 * PATCH /api/solutions/:id
 * Body: { state_update: Object }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { state_update } = req.body;

    if (!state_update || Object.keys(state_update).length === 0) {
      return res.status(400).json({ error: 'state_update is required' });
    }

    const solution = await solutionsStore.updateState(req.params.id, state_update);
    res.json({ solution });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Delete solution
 * DELETE /api/solutions/:id
 *
 * Since only one solution per tenant is supported, this deletes ALL
 * skills and connectors from ADAS Core (best-effort) before removing
 * local files.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const cleanupResults = { skills: null, connectors: null };

    // Best-effort: wipe ADAS Core skills and connectors
    try {
      cleanupResults.connectors = await adasCore.deleteAllConnectors();
      console.log('[solutions/delete] Deleted all ADAS Core connectors:', cleanupResults.connectors);
    } catch (err) {
      console.warn('[solutions/delete] Failed to delete ADAS Core connectors:', err.message);
    }

    try {
      cleanupResults.skills = await adasCore.deleteAllSkills();
      console.log('[solutions/delete] Deleted all ADAS Core skills:', cleanupResults.skills);
    } catch (err) {
      console.warn('[solutions/delete] Failed to delete ADAS Core skills:', err.message);
    }

    // Delete local files
    await solutionsStore.remove(req.params.id);

    res.json({ ok: true, adas_cleanup: cleanupResults });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPLOY STATUS
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregated deploy status for a solution.
 * GET /api/solutions/:id/deploy-status
 *
 * Returns solution metadata + per-skill deploy state + ADAS Core connector health.
 */
router.get('/:id/deploy-status', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    const linkedSkills = solution.skills || [];

    // Load full skill objects in parallel — ref.id IS the skill ID (no remapping)
    const skills = await Promise.all(
      linkedSkills.map(async (ref) => {
        try {
          const skill = await skillsStore.load(req.params.id, ref.id);
          return {
            id: ref.id,
            name: skill.name || ref.name,
            slug: getSkillSlug(skill, ref.id),
            phase: skill.phase || 'UNKNOWN',
            deployedAt: skill.deployedAt || null,
            mcpUri: skill.mcpUri || null,
            tools_count: (skill.tools || []).length,
            connectors: skill.connectors || [],
          };
        } catch {
          return { id: ref.id, name: ref.name, phase: 'NOT_FOUND', error: 'skill not loaded' };
        }
      })
    );

    // Query ADAS Core connector status (best-effort)
    let adasConnectors = [];
    let adasReachable = false;
    try {
      adasConnectors = await adasCore.getConnectors();
      adasReachable = true;
    } catch {
      // ADAS Core unreachable — continue with empty
    }

    // Map connector statuses for connectors referenced by skills
    const usedConnectorIds = [...new Set(skills.flatMap(s => s.connectors || []))];
    const connectors = usedConnectorIds.map(cid => {
      const ac = adasConnectors.find(c => c.id === cid);
      return {
        id: cid,
        status: ac?.status || 'unknown',
        tools: ac?.tools?.length || 0,
      };
    });

    // Identity deployed?
    const identity = solution.identity || {};
    const identityDeployed = (identity.actor_types || []).length > 0;

    res.json({
      ok: true,
      solution: {
        id: solution.id,
        name: solution.name,
        phase: solution.phase || 'UNKNOWN',
        updated_at: solution.updated_at || null,
      },
      identity_deployed: identityDeployed,
      skills,
      connectors,
      adas_reachable: adasReachable,
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ ok: false, error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// CONNECTOR HEALTH
// ═══════════════════════════════════════════════════════════════

/**
 * Get connector health for a solution's connectors.
 * GET /api/solutions/:id/connectors/health
 *
 * Queries ADAS Core for each connector referenced by skills in this solution.
 * Returns status, discovered tools, and error info.
 */
router.get('/:id/connectors/health', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);

    // Collect all connector IDs from the solution's skills
    const linkedSkills = solution.skills || [];

    const connectorIds = new Set();
    // From solution-level platform_connectors
    for (const pc of (solution.platform_connectors || [])) {
      if (pc.id) connectorIds.add(pc.id);
    }
    // From skill-level connectors — ref.id IS the skill ID
    for (const ref of linkedSkills) {
      try {
        const skill = await skillsStore.load(req.params.id, ref.id);
        for (const cid of (skill.connectors || [])) {
          connectorIds.add(cid);
        }
      } catch { /* skip missing skills */ }
    }

    // Query ADAS Core for each connector
    const connectors = [];
    let adasReachable = false;
    for (const cid of connectorIds) {
      try {
        const coreData = await adasCore.getConnector(cid);
        adasReachable = true;
        if (coreData) {
          connectors.push({
            id: cid,
            status: coreData.status || 'unknown',
            transport: coreData.transport || null,
            tools: (coreData.tools || []).map(t => ({ name: t.name, description: t.description })),
            tools_count: (coreData.tools || []).length,
            error: coreData.error || null,
            last_connected: coreData.last_connected || null,
          });
        } else {
          connectors.push({ id: cid, status: 'not_found', tools: [], tools_count: 0, error: 'Not registered in ADAS Core' });
        }
      } catch (err) {
        connectors.push({ id: cid, status: 'unreachable', tools: [], tools_count: 0, error: err.message });
      }
    }

    if (connectorIds.size > 0 && connectors.some(c => c.status !== 'unreachable')) {
      adasReachable = true;
    }

    res.json({
      ok: true,
      solution_id: req.params.id,
      adas_reachable: adasReachable,
      connectors,
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ ok: false, error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// LIVE HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Cross-check definition vs live ADAS Core state.
 * GET /api/solutions/:id/health
 *
 * Returns per-skill and per-connector health with issues list.
 * Issues are problems found: skill not deployed, connector down, grant chain broken, etc.
 */
router.get('/:id/health', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    const linkedSkills = solution.skills || [];
    const grants = solution.grants || [];
    const handoffs = solution.handoffs || [];
    const issues = [];

    // Check each skill — ref.id IS the skill ID (no remapping)
    const skillHealth = [];
    for (const ref of linkedSkills) {
      try {
        const skill = await skillsStore.load(req.params.id, ref.id);
        const deployed = skill.phase === 'DEPLOYED';
        const hasMcpUri = Boolean(skill.mcpUri);
        const hasTools = (skill.tools || []).length > 0;

        if (!deployed) issues.push({ severity: 'error', skill: ref.id, message: `Skill phase is ${skill.phase}, not DEPLOYED` });
        if (!hasMcpUri && deployed) issues.push({ severity: 'warning', skill: ref.id, message: 'Skill is DEPLOYED but has no mcpUri' });
        if (!hasTools) issues.push({ severity: 'warning', skill: ref.id, message: 'Skill has no tools defined' });

        skillHealth.push({
          id: ref.id,
          phase: skill.phase || 'UNKNOWN',
          deployed,
          mcpUri: skill.mcpUri || null,
          tools_count: (skill.tools || []).length,
          connectors: skill.connectors || [],
        });
      } catch {
        issues.push({ severity: 'error', skill: ref.id, message: 'Skill definition not found on disk' });
        skillHealth.push({ id: ref.id, phase: 'NOT_FOUND', deployed: false });
      }
    }

    // Check connectors via ADAS Core
    const connectorIds = new Set();
    for (const sh of skillHealth) {
      for (const cid of (sh.connectors || [])) connectorIds.add(cid);
    }
    for (const pc of (solution.platform_connectors || [])) {
      if (pc.id) connectorIds.add(pc.id);
    }

    const connectorHealth = [];
    let adasReachable = false;
    for (const cid of connectorIds) {
      try {
        const coreData = await adasCore.getConnector(cid);
        adasReachable = true;
        if (coreData) {
          const healthy = coreData.status === 'connected' || coreData.status === 'running';
          if (!healthy) issues.push({ severity: 'warning', connector: cid, message: `Connector status is "${coreData.status}"` });
          connectorHealth.push({
            id: cid,
            status: coreData.status || 'unknown',
            healthy,
            tools_count: (coreData.tools || []).length,
          });
        } else {
          issues.push({ severity: 'error', connector: cid, message: 'Connector not registered in ADAS Core' });
          connectorHealth.push({ id: cid, status: 'not_found', healthy: false, tools_count: 0 });
        }
      } catch (err) {
        connectorHealth.push({ id: cid, status: 'unreachable', healthy: false, tools_count: 0 });
      }
    }

    if (connectorIds.size > 0 && connectorHealth.some(c => c.status !== 'unreachable')) {
      adasReachable = true;
    }

    // Helper: match a skill ref by original ID or internal (remapped) ID
    const findSkill = (sid) => skillHealth.find(s => s.id === sid || s.internal_id === sid);

    // Check grant chains: every consumed grant has at least one issuer skill that's DEPLOYED
    for (const grant of grants) {
      const issuers = grant.issued_by || [];
      const consumers = grant.consumed_by || [];
      const deployedIssuers = issuers.filter(sid => { const s = findSkill(sid); return s && s.deployed; });
      if (consumers.length > 0 && deployedIssuers.length === 0) {
        issues.push({ severity: 'error', grant: grant.key, message: `No deployed issuer for grant "${grant.key}" — consumers: ${consumers.join(', ')}` });
      }
    }

    // Check handoff paths: both source and target should be deployed
    for (const h of handoffs) {
      const fromSkill = findSkill(h.from);
      const toSkill = findSkill(h.to);
      if (!fromSkill || !fromSkill.deployed) issues.push({ severity: 'warning', handoff: h.id, message: `Handoff source "${h.from}" not deployed` });
      if (!toSkill || !toSkill.deployed) issues.push({ severity: 'warning', handoff: h.id, message: `Handoff target "${h.to}" not deployed` });
    }

    // Identity check
    const identity = solution.identity || {};
    const identityDeployed = (identity.actor_types || []).length > 0;
    if (!identityDeployed) issues.push({ severity: 'warning', message: 'No identity actor types defined' });

    // Summary
    const allSkillsDeployed = skillHealth.every(s => s.deployed);
    const allConnectorsHealthy = connectorHealth.every(c => c.healthy);
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    let overall;
    if (errorCount > 0) overall = 'unhealthy';
    else if (warningCount > 0) overall = 'degraded';
    else overall = 'healthy';

    res.json({
      ok: true,
      solution_id: req.params.id,
      overall,
      adas_reachable: adasReachable,
      identity_deployed: identityDeployed,
      all_skills_deployed: allSkillsDeployed,
      all_connectors_healthy: allConnectorsHealthy,
      skills: skillHealth,
      connectors: connectorHealth,
      issues,
      error_count: errorCount,
      warning_count: warningCount,
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ ok: false, error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// REDEPLOY SINGLE SKILL
// ═══════════════════════════════════════════════════════════════

/**
 * Re-deploy a single skill after PATCH updates.
 * POST /api/solutions/:id/skills/:skillId/redeploy
 *
 * Reads the stored skill definition, regenerates the MCP server,
 * and pushes to ADAS Core — without re-deploying the whole solution.
 *
 * Accepts original skill ID (e.g., "e2e-greeter") or internal ID (e.g., "skill_fleet-ui-mcp").
 */
router.post('/:id/skills/:skillId/redeploy', async (req, res, next) => {
  try {
    const solutionId = req.params.id;
    const requestedSkillId = req.params.skillId;
    const log = req.app.locals.log;

    // Skill ID is used directly — no remapping needed
    log.info(`[Redeploy] Redeploying skill ${requestedSkillId} in solution ${solutionId}`);

    const result = await deploySkillToADAS(solutionId, requestedSkillId, log);

    const statusCode = result.ok === false ? 502 : 200;
    res.status(statusCode).json({
      skill_id: requestedSkillId,
      ...result,
    });
  } catch (err) {
    if (err.code === 'NO_EXPORT') {
      return res.status(400).json({ ok: false, error: err.message, hint: 'Skill has no export version. Deploy the full solution first.' });
    }
    if (err.code === 'NO_SERVER') {
      return res.status(400).json({ ok: false, error: err.message, hint: 'No server.py found — MCP auto-generation will be attempted.' });
    }
    if (err.code === 'DEPLOY_FAILED') {
      return res.status(502).json({ ok: false, error: err.message, deploy_log: err.deploy_log || {} });
    }
    if (err.message?.includes('not found') || err.code === 'ENOENT') {
      return res.status(404).json({ ok: false, error: 'Skill not found' });
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'Failed to connect to ADAS Core', details: err.message });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// BULK REDEPLOY
// ═══════════════════════════════════════════════════════════════

/**
 * Re-deploy ALL skills in a solution.
 * POST /api/solutions/:id/redeploy
 *
 * Iterates all linked skills, regenerates MCP servers, pushes to ADAS Core.
 * Returns per-skill results.
 */
router.post('/:id/redeploy', async (req, res, next) => {
  try {
    const solutionId = req.params.id;
    const log = req.app.locals.log;

    const solution = await solutionsStore.load(solutionId);
    const linkedSkills = solution.skills || [];

    if (linkedSkills.length === 0) {
      return res.json({ ok: true, solution_id: solutionId, skills: [], message: 'No skills to redeploy' });
    }

    // Deploy each skill — ref.id IS the skill ID
    const results = [];
    let deployed = 0;
    let failed = 0;
    for (const ref of linkedSkills) {
      try {
        log.info(`[BulkRedeploy] Deploying ${ref.id}`);
        const result = await deploySkillToADAS(solutionId, ref.id, log);
        deployed++;
        results.push({ skill_id: ref.id, ok: true, ...result });
      } catch (err) {
        failed++;
        results.push({ skill_id: ref.id, ok: false, error: err.message, deploy_log: err.deploy_log || undefined });
      }
    }

    // Build post-deploy verification summary across all skills
    const allConnectorResults = results.flatMap(r => r.connectors || []);
    const failedConnectors = allConnectorResults.filter(c => !c.ok);
    const zeroToolConnectors = allConnectorResults.filter(c => c.ok && c.tools === 0);
    const skillsNeedingAttention = results.filter(r => r.verification?.needs_attention);
    // Count skills where deployment succeeded but UI verification failed (ok: false from deploySkillToADAS)
    const uiFailedSkills = results.filter(r => r.ok === false && r.status === 'deployed_with_errors');
    const totalFailed = failed + uiFailedSkills.length;

    const verification = {
      skills_deployed: deployed,
      skills_failed: totalFailed,
      connectors_total: allConnectorResults.length,
      connectors_healthy: allConnectorResults.filter(c => c.ok && c.tools > 0).length,
      connectors_failed: failedConnectors.length,
      connectors_zero_tools: zeroToolConnectors.length,
    };

    if (failed > 0 || failedConnectors.length > 0 || skillsNeedingAttention.length > 0) {
      verification.needs_attention = true;
      verification.issues = [];
      if (failed > 0) {
        verification.issues.push(`${failed} skill(s) failed to deploy`);
      }
      for (const c of failedConnectors) {
        verification.issues.push(`Connector "${c.id}" failed: ${c.error}`);
      }
      for (const s of skillsNeedingAttention) {
        for (const issue of (s.verification?.issues || [])) {
          verification.issues.push(`[${s.skill_id}] ${issue}`);
        }
      }
    }

    const allOk = totalFailed === 0;
    res.status(allOk ? 200 : 502).json({
      ok: allOk,
      solution_id: solutionId,
      deployed,
      failed: totalFailed,
      total: linkedSkills.length,
      skills: results,
      verification,
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ ok: false, error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Export a full solution as a JSON bundle.
 * GET /api/solutions/:id/export
 *
 * Returns the complete solution + all skill definitions + connector metadata
 * in a format compatible with POST /deploy/solution for re-import.
 */
router.get('/:id/export', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    const linkedSkills = solution.skills || [];

    // Load full skill definitions — ref.id IS the skill ID
    const skills = [];
    const connectorIds = new Set();
    for (const ref of linkedSkills) {
      try {
        const skill = await skillsStore.load(req.params.id, ref.id);
        // skill.id is already the canonical developer ID — no remapping needed
        const exportSkill = { ...skill };
        // Remove internal/deployment fields
        delete exportSkill._settings;
        delete exportSkill._fromTemplate;
        delete exportSkill.validation;
        delete exportSkill.conversation;
        delete exportSkill.solution_id;
        delete exportSkill.original_skill_id;
        delete exportSkill.mcpUri;
        delete exportSkill.deployedAt;
        delete exportSkill.deployedTo;
        delete exportSkill.connectorId;
        delete exportSkill.lastExportedAt;
        delete exportSkill.lastExportType;
        skills.push(exportSkill);

        // Collect connector IDs
        for (const cid of (skill.connectors || [])) {
          connectorIds.add(cid);
        }
      } catch {
        // Skip skills that can't be loaded
      }
    }

    // Build connector stubs from solution metadata
    const connectors = [];
    for (const pc of (solution.platform_connectors || [])) {
      if (pc.id) connectors.push({ ...pc, _platform: true });
    }
    // Add any connector IDs referenced by skills but not in platform_connectors
    for (const cid of connectorIds) {
      if (!connectors.find(c => c.id === cid)) {
        connectors.push({ id: cid, name: cid });
      }
    }

    // Build the export bundle (same format as POST /deploy/solution body)
    const bundle = {
      solution: {
        id: solution.id,
        name: solution.name,
        version: solution.version || '1.0.0',
        description: solution.description,
        identity: solution.identity,
        skills: solution.skills,
        grants: solution.grants,
        handoffs: solution.handoffs,
        routing: solution.routing,
        platform_connectors: solution.platform_connectors,
        security_contracts: solution.security_contracts,
      },
      skills,
      connectors,
      exported_at: new Date().toISOString(),
      export_version: '1.0.0',
    };

    res.json(bundle);
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ ok: false, error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════

/**
 * Send message to Solution Bot
 * POST /api/solutions/:id/chat
 * Body: { message: string }
 */
router.post('/:id/chat', async (req, res, next) => {
  try {
    const { message, llm_settings } = req.body;
    const log = req.app.locals.log;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    log.debug(`Solution chat request for ${req.params.id}`);

    // Load solution
    let solution;
    try {
      solution = await solutionsStore.load(req.params.id);
    } catch (err) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Solution not found' });
      }
      throw err;
    }

    // Save user message
    solution.conversation.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Process with LLM
    const response = await processSolutionMessage({ solution, userMessage: message, llmSettings: llm_settings });

    log.debug('Solution LLM response received', { usage: response.usage });

    // Apply state updates
    if (response.stateUpdate && Object.keys(response.stateUpdate).length > 0) {
      log.debug('Applying solution state updates', response.stateUpdate);
      const storeModule = solutionsStore;
      // Apply directly via store's applyUpdates (re-load to get fresh state after user msg save)
      for (const [key, value] of Object.entries(response.stateUpdate)) {
        if (key === 'phase') {
          solution.phase = value;
        } else {
          // Use the store's updateState for proper _push/_delete handling
          // We'll apply inline since we already have the object in memory
          applyInlineUpdates(solution, { [key]: value });
        }
      }
    }

    // Save assistant message
    solution.conversation.push({
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      state_update: response.stateUpdate,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
    });

    // Save updated solution
    await solutionsStore.save(solution);

    // Run validation
    const validation = validateSolution(solution);

    res.json({
      message: response.message,
      solution,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
      validation,
      usage: response.usage,
    });
  } catch (err) {
    req.app.locals.log.error('Solution chat error:', err);
    next(err);
  }
});

/**
 * Suggest user types based on skill names/descriptions
 * Analyzes skills to infer obvious user types for the solution.
 */
function suggestUserTypes(skills) {
  const text = skills.map(s => `${s.name || ''} ${s.description || ''} ${s.id || ''}`).join(' ').toLowerCase();

  // Pattern matching for common domains
  const hasCustomerFacing = /customer|support|shopping|order|cart|checkout|ecommerce|e-commerce|retail/i.test(text);
  const hasSupport = /support|helpdesk|ticket|tier|agent|customer.?service/i.test(text);
  const hasFinance = /finance|payment|refund|billing|accounting|reconciliation/i.test(text);
  const hasFulfillment = /fulfillment|shipping|delivery|logistics|warehouse/i.test(text);
  const hasApproval = skills.some(s => s.role === 'approval');
  const hasGateway = skills.some(s => s.role === 'gateway');

  const types = [];

  if (hasCustomerFacing) {
    types.push({ key: 'customer', label: 'Customer', description: 'End user who contacts support or uses services' });
  }
  if (hasSupport) {
    types.push({ key: 'support_agent', label: 'Support Agent', description: 'Staff handling customer requests and tickets' });
  }
  if (hasFinance || hasApproval) {
    types.push({ key: 'admin', label: 'Admin', description: 'Back-office staff with approval and management access' });
  } else if (hasGateway || skills.length > 2) {
    types.push({ key: 'admin', label: 'Admin', description: 'System administrator with full access' });
  }

  // Fallback: if nothing matched, suggest generic types
  if (types.length === 0) {
    types.push(
      { key: 'user', label: 'User', description: 'Primary user of the solution' },
      { key: 'admin', label: 'Admin', description: 'Administrator with full access' },
    );
  }

  return types;
}

/**
 * Get initial greeting for solution chat
 * GET /api/solutions/:id/greeting
 *
 * State-aware: returns different greeting depending on solution maturity.
 * - New solution (no skills) → discovery greeting
 * - Existing solution → contextual status + suggested next actions
 */
router.get('/:id/greeting', async (req, res) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    const skills = solution.skills || [];
    const grants = solution.grants || [];
    const handoffs = solution.handoffs || [];
    const routing = solution.routing || {};
    const contracts = solution.security_contracts || [];
    const identity = solution.identity || {};
    const phase = solution.phase || 'SOLUTION_DISCOVERY';
    const actorTypes = identity.actor_types || [];

    // ── New solution: no skills yet → discovery greeting ──
    if (skills.length === 0) {
      return res.json({
        message: `Welcome to the Solution Builder! I'll help you design the cross-skill architecture for your solution.

A **solution** is a collection of skills that work together. I'll guide you through:

1. **Skill Topology** — What skills exist and their roles
2. **Grant Economy** — How verified claims flow between skills
3. **Handoff Flows** — How conversations transfer between skills
4. **Channel Routing** — Which skill handles which channel
5. **Security Contracts** — Cross-skill access requirements

---

Let's start! What kind of solution are you building?`,
        input_hint: {
          mode: 'selection',
          options: [
            'Customer support with identity verification',
            'Multi-department workflow (support, fulfillment, finance)',
            'API-driven automation with scheduled tasks',
            'Something else — I\'ll describe my use case',
          ],
        },
      });
    }

    // ── Existing solution: contextual greeting ──
    const channels = Object.keys(routing);
    const skillList = skills.map(s => `**${s.name || s.id}** (${s.role})`).join(', ');

    // Build status summary
    const statusParts = [];
    statusParts.push(`**${skills.length} skills**: ${skillList}`);
    if (grants.length > 0) statusParts.push(`**${grants.length} grants** defined`);
    if (handoffs.length > 0) statusParts.push(`**${handoffs.length} handoffs** configured`);
    if (channels.length > 0) statusParts.push(`**Routing**: ${channels.join(', ')}`);
    if (contracts.length > 0) statusParts.push(`**${contracts.length} security contracts**`);
    if (actorTypes.length > 0) statusParts.push(`**Users & Roles**: ${actorTypes.map(a => a.label).join(', ')}`);

    // Determine suggested actions based on what's missing
    const suggestions = [];

    if (actorTypes.length === 0) {
      // Proactive: suggest user types based on skill analysis
      const suggestedTypes = suggestUserTypes(skills);
      if (suggestedTypes.length > 0) {
        const typeList = suggestedTypes.map(t => `**${t.label}** — ${t.description}`).join('\n- ');
        statusParts.push(`\n\n**Users & Roles** not defined yet. Based on your skills, I'd suggest:\n- ${typeList}`);
        suggestions.push('Use these suggested user types');
        suggestions.push('I want different user types');
      } else {
        suggestions.push('Set up Users & Roles — who are the people using this solution?');
      }
    }
    if (grants.length === 0 && skills.length > 1) {
      suggestions.push('Design the grant economy — what verified claims flow between skills?');
    }
    if (handoffs.length === 0 && skills.length > 1) {
      suggestions.push('Configure handoff flows — how do conversations transfer between skills?');
    }
    if (channels.length === 0) {
      suggestions.push('Set up channel routing — which channels connect to which skills?');
    }
    if (contracts.length === 0 && grants.length > 0) {
      suggestions.push('Add security contracts — which tools require which grants?');
    }

    // Always offer review/validation
    suggestions.push('Run validation and review the solution health');
    suggestions.push('Add or modify skills in the topology');
    if (actorTypes.length > 0) {
      suggestions.push('Review and update Users & Roles');
    }

    // Cap at 4 options for the selection UI
    const options = suggestions.slice(0, 4);

    const message = `Welcome back to **${solution.name || 'your solution'}**! Here's where things stand:

${statusParts.map(p => `- ${p}`).join('\n')}

What would you like to work on?`;

    res.json({
      message,
      input_hint: {
        mode: 'selection',
        options,
      },
    });
  } catch (err) {
    // Fallback to basic greeting if solution can't be loaded
    console.error(`[Greeting] Failed to load solution ${req.params.id}:`, err.message);
    res.json({
      message: `Welcome to the Solution Builder! I'll help you design the cross-skill architecture for your solution.\n\nWhat would you like to work on?`,
      input_hint: {
        mode: 'selection',
        options: [
          'Customer support with identity verification',
          'Multi-department workflow (support, fulfillment, finance)',
          'API-driven automation with scheduled tasks',
          'Something else — I\'ll describe my use case',
        ],
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// EXTERNAL AGENT API — Execution Logs, Testing, Metrics, Connectors
// (Proxied to ADAS Core for fleet developer agents)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/solutions/:id/logs — Execution logs (list jobs or single job detail)
 * Query: ?skill_id=X&limit=10&job_id=X
 */
router.get('/:id/logs', async (req, res, next) => {
  try {
    const { skill_id, job_id, limit = '10' } = req.query;

    // Single job detail
    if (job_id) {
      const data = await adasCore.getJobDetails(job_id, skill_id || null);
      return res.json({ ok: true, ...data });
    }

    // List jobs (optionally filtered by skill)
    // Resolve skill_id to skillSlug if needed
    let skillSlug = skill_id || null;
    if (skillSlug) {
      try {
        const skill = await skillsStore.load(req.params.id, skillSlug);
        skillSlug = skill.slug || skill.id;
      } catch {
        // Use skill_id as-is if lookup fails
      }
    }

    const data = await adasCore.listJobs({ skillSlug, limit: Number(limit) });
    res.json({ ok: true, ...data });
  } catch (err) {
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/** Extract tool call steps from job's __exec state (same data Job Progress UI shows) */
function extractSteps(job) {
  const steps = [];
  const exec = job?.state?.steps?.__exec;
  if (exec && typeof exec === 'object') {
    for (const [, arr] of Object.entries(exec)) {
      if (!Array.isArray(arr)) continue;
      for (const s of arr) {
        if (!s || typeof s.tool !== 'string') continue;
        steps.push({ tool: s.tool, args: s.args || {}, result: s.result, error: s.error || null });
      }
    }
  }
  return steps;
}

/** Check if a job is in a terminal state */
function isJobFinal(job) {
  return job.done || job.status === 'done' || job.status === 'error' || job.status === 'failed';
}

/** Map job.status to a cleaner status string */
function mapJobStatus(job) {
  if (job.status === 'done') return 'completed';
  if (job.status === 'error' || job.status === 'failed') return 'failed';
  return job.status || 'running';
}

/**
 * POST /api/solutions/:id/skills/:skillId/test — Test a skill with a message
 * Body: { message: string, async?: boolean, timeout_ms?: number }
 * async=true: returns job_id immediately. Poll GET .../test/:jobId for progress.
 * async=false (default): starts job, polls until done, returns result.
 */
router.post('/:id/skills/:skillId/test', async (req, res, next) => {
  try {
    const { message, async: asyncMode, timeout_ms } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'message is required' });
    }

    // Resolve skill slug
    let skillSlug;
    try {
      const skill = await skillsStore.load(req.params.id, req.params.skillId);
      skillSlug = skill.slug || skill.id;
    } catch {
      skillSlug = req.params.skillId;
    }

    // Start the job
    const startResult = await adasCore.startChat({ goal: message, skillSlug });
    const jobId = startResult.jobId || startResult.id;

    if (!jobId) {
      return res.status(502).json({ ok: false, error: 'Failed to start job — no job ID returned' });
    }

    // ── ASYNC MODE: return immediately ──
    if (asyncMode === true) {
      return res.json({
        ok: true,
        job_id: jobId,
        skill_slug: skillSlug,
        status: 'running',
        message: 'Job started. Poll GET .../test/' + jobId + ' for progress.',
      });
    }

    // ── SYNC MODE (default, backward compatible) ──
    const TIMEOUT = Math.min(timeout_ms || 60000, 300000);
    const POLL_INTERVAL = 2000;
    const startTime = Date.now();
    let job;

    while (Date.now() - startTime < TIMEOUT) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      try {
        job = await adasCore.getJob(jobId);
        if (isJobFinal(job)) break;
      } catch {
        // Retry on transient errors
      }
    }

    if (!job) {
      return res.json({ ok: false, job_id: jobId, status: 'timeout', error: `Job did not complete within ${TIMEOUT / 1000}s` });
    }

    const steps = extractSteps(job);
    const duration = Date.now() - startTime;
    const status = mapJobStatus(job);

    res.json({
      ok: status === 'completed',
      job_id: jobId,
      skill_slug: skillSlug,
      status,
      result: job.summary || job.outcome || job.result || null,
      steps,
      duration_ms: duration,
      error: job.error || job.state?.internal_error || null,
    });
  } catch (err) {
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/solutions/:id/skills/:skillId/test/:jobId — Poll test progress
 * Returns progress derived from in-memory job snapshot (same data Job Progress UI shows).
 */
router.get('/:id/skills/:skillId/test/:jobId', async (req, res, next) => {
  try {
    const job = await adasCore.getJob(req.params.jobId);

    if (!job || job.status === 'unknown') {
      return res.status(404).json({ ok: false, error: 'Job not found or expired from memory' });
    }

    const done = isJobFinal(job);
    const steps = extractSteps(job);
    const status = mapJobStatus(job);

    res.json({
      ok: done ? status === 'completed' : null,
      job_id: req.params.jobId,
      status,
      done,
      iteration: job.state?.plannerIter || 0,
      steps,
      pending_question: job.state?.pendingQuestion || null,
      result: done ? (job.summary || job.outcome || job.result || null) : null,
      error: job.error || job.state?.internal_error || null,
      elapsed_ms: job.lastUpdate && job.createdAt
        ? job.lastUpdate - job.createdAt
        : null,
    });
  } catch (err) {
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/solutions/:id/skills/:skillId/test/:jobId — Abort a running test
 */
router.delete('/:id/skills/:skillId/test/:jobId', async (req, res, next) => {
  try {
    const result = await adasCore.abortJob(req.params.jobId);
    res.json(result);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/solutions/:id/metrics — Execution metrics (per job or per skill)
 * Query: ?job_id=X or ?skill_id=X&limit=5
 */
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const { job_id, skill_id } = req.query;

    if (job_id) {
      // Single job insight
      const data = await adasCore.getInsightJob(job_id, 0);
      return res.json({ ok: true, ...data });
    }

    if (skill_id) {
      // List recent jobs for the skill, then get insights for the most recent
      let skillSlug = skill_id;
      try {
        const skill = await skillsStore.load(req.params.id, skill_id);
        skillSlug = skill.slug || skill.id;
      } catch {
        // Use as-is
      }

      const jobsData = await adasCore.listJobs({ skillSlug, limit: 5 });
      const jobs = jobsData.jobs || [];

      if (jobs.length === 0) {
        return res.json({ ok: true, jobs: [], message: 'No recent jobs found for this skill' });
      }

      // Get insight for the most recent job
      const recentJobId = jobs[0]?.id;
      let insight = null;
      if (recentJobId) {
        try {
          insight = await adasCore.getInsightJob(recentJobId, 0);
        } catch {
          // Insight may not be available
        }
      }

      return res.json({
        ok: true,
        skill_id,
        recent_jobs: jobs,
        latest_insight: insight,
      });
    }

    return res.status(400).json({ ok: false, error: 'Provide job_id or skill_id' });
  } catch (err) {
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/solutions/:id/connectors/:connectorId/source — Connector source code
 */
router.get('/:id/connectors/:connectorId/source', async (req, res, next) => {
  try {
    const data = await adasCore.getConnectorSource(req.params.connectorId);
    res.json({ ok: true, connector_id: req.params.connectorId, ...data });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ ok: false, error: `Connector source not found: ${req.params.connectorId}` });
    }
    if (err.status === 502 || err.message?.includes('fetch failed')) {
      return res.status(502).json({ ok: false, error: 'ADAS Core unreachable', details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/solutions/:id/diff — Compare Builder definition vs ADAS Core deployed state
 * Query: ?skill_id=X (optional — diff single skill, otherwise diff solution)
 */
router.get('/:id/diff', async (req, res, next) => {
  try {
    const { skill_id } = req.query;
    const solutionId = req.params.id;

    if (skill_id) {
      // Diff a single skill: Builder FS vs Core
      let builderSkill;
      try {
        builderSkill = await skillsStore.load(solutionId, skill_id);
      } catch {
        return res.status(404).json({ ok: false, error: `Skill not found in Builder: ${skill_id}` });
      }

      let coreSkills;
      try {
        coreSkills = await adasCore.getSkills();
      } catch {
        return res.status(502).json({ ok: false, error: 'Cannot reach ADAS Core to compare' });
      }

      const coreSkill = coreSkills.find(s =>
        s.slug === (builderSkill.slug || builderSkill.id) ||
        s.id === (builderSkill.slug || builderSkill.id)
      );

      if (!coreSkill) {
        return res.json({ ok: true, changed: true, status: 'not_deployed', skill_id, message: 'Skill exists in Builder but not in Core' });
      }

      // Compare key fields
      const changes = diffObjects(builderSkill, coreSkill, ['name', 'description', 'version', 'tools', 'intents', 'policy', 'connectors', 'prompt']);
      return res.json({ ok: true, changed: changes.length > 0, skill_id, changes });
    }

    // Diff the solution
    let builderSolution;
    try {
      builderSolution = await solutionsStore.load(solutionId);
    } catch {
      return res.status(404).json({ ok: false, error: 'Solution not found in Builder' });
    }

    // Compare skill count: Builder linked skills vs Core registered skills
    let coreSkills;
    try {
      coreSkills = await adasCore.getSkills();
    } catch {
      return res.status(502).json({ ok: false, error: 'Cannot reach ADAS Core to compare' });
    }

    const builderSkillIds = (builderSolution.skills || []).map(s => s.id);
    const coreSkillSlugs = coreSkills.map(s => s.slug || s.id);
    const inBuilderNotCore = builderSkillIds.filter(id => !coreSkillSlugs.includes(id));
    const inCoreNotBuilder = coreSkillSlugs.filter(slug => !builderSkillIds.includes(slug));

    const changes = [];
    if (inBuilderNotCore.length > 0) {
      changes.push({ path: 'skills', type: 'not_deployed', ids: inBuilderNotCore, message: 'Skills in Builder but not deployed to Core' });
    }
    if (inCoreNotBuilder.length > 0) {
      changes.push({ path: 'skills', type: 'orphaned', ids: inCoreNotBuilder, message: 'Skills in Core but not in Builder solution' });
    }

    res.json({
      ok: true,
      changed: changes.length > 0,
      solution_id: solutionId,
      builder_skills: builderSkillIds,
      core_skills: coreSkillSlugs,
      changes,
    });
  } catch (err) {
    next(err);
  }
});

// Mount validation sub-router
router.use("/", validationRouter);


// ═══════════════════════════════════════════════════════════════
// INLINE STATE UPDATE HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Apply updates inline to a solution object (mirrors store/solutions.js logic)
 */
function applyInlineUpdates(solution, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (key.endsWith('_delete')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const ids = Array.isArray(value) ? value : [value];
        for (const id of ids) {
          const idx = arr.findIndex(item => item.id === id || item.key === id || item.name === id);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }
      continue;
    }

    if (key.endsWith('_push')) {
      const arrayKey = key.slice(0, -5);
      let arr = getNestedValue(solution, arrayKey);
      if (!Array.isArray(arr)) {
        setNestedValue(solution, arrayKey, []);
        arr = getNestedValue(solution, arrayKey);
      }
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        const matchKey = item.id || item.key || item.name;
        if (matchKey) {
          const idx = arr.findIndex(existing =>
            existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
          );
          if (idx !== -1) {
            arr[idx] = { ...arr[idx], ...item };
          } else {
            arr.push(item);
          }
        } else {
          arr.push(item);
        }
      }
      continue;
    }

    if (key.endsWith('_update')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          const matchKey = item.id || item.key || item.name;
          if (matchKey) {
            const idx = arr.findIndex(existing =>
              existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
            );
            if (idx !== -1) {
              arr[idx] = { ...arr[idx], ...item };
            }
          }
        }
      }
      continue;
    }

    setNestedValue(solution, key, value);
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Compare two objects on specific fields, returning a list of changes.
 */
function diffObjects(builderObj, coreObj, fields) {
  const changes = [];
  for (const field of fields) {
    const bVal = builderObj[field];
    const cVal = coreObj[field];
    const bJson = JSON.stringify(bVal ?? null);
    const cJson = JSON.stringify(cVal ?? null);
    if (bJson !== cJson) {
      changes.push({
        path: field,
        builder_value: bVal ?? null,
        core_value: cVal ?? null,
      });
    }
  }
  return changes;
}

export default router;
