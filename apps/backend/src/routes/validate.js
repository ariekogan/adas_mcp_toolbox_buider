/**
 * Validation API Routes
 *
 * LLM-based validation endpoints for cross-tool consistency checks.
 */

import { Router } from 'express';
import { createAdapter } from '../services/llm/adapter.js';
import domainsStore from '../store/domains.js';

const router = Router();

/**
 * Cross-tool consistency check
 * POST /api/validate/tools-consistency
 *
 * Uses LLM to analyze tools for:
 * - Duplications (same/similar names)
 * - Ambiguity (overlapping purposes)
 * - Naming inconsistencies
 *
 * Body: { domain_id: string, new_tool?: object }
 */
router.post('/tools-consistency', async (req, res, next) => {
  try {
    const { domain_id, new_tool } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }

    log.debug(`Tools consistency check for domain ${domain_id}`);

    // Load domain
    let domain;
    try {
      domain = await domainsStore.load(domain_id);
    } catch (err) {
      if (err.message?.includes('not found') || err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Domain not found' });
      }
      throw err;
    }

    const tools = domain.tools || [];

    // Need at least 2 tools to check consistency
    if (tools.length < 2) {
      return res.json({
        issues: [],
        message: 'Not enough tools to check consistency'
      });
    }

    // Build prompt for LLM
    const toolsSummary = tools.map((t, idx) => ({
      index: idx,
      name: t.name,
      description: t.description,
      inputs: (t.inputs || []).map(i => i.name).join(', ')
    }));

    const systemPrompt = `You are a tool consistency analyzer. Your job is to detect issues with a set of tools defined for an AI agent.

Analyze the tools and report any issues found. Return a JSON response with the following structure:
{
  "issues": [
    {
      "type": "duplicate" | "ambiguous" | "naming_inconsistency" | "overlap",
      "severity": "blocker" | "warning" | "suggestion",
      "tools": [<tool_names_involved>],
      "description": "Brief description of the issue",
      "suggestion": "How to fix this"
    }
  ]
}

Issue types:
- "duplicate": Two or more tools have the same or nearly identical names
- "ambiguous": Tool descriptions are too similar, unclear which to use when
- "naming_inconsistency": Tools use different naming conventions (snake_case vs CamelCase)
- "overlap": Tools have overlapping functionality that could cause confusion

Severity levels:
- "blocker": Must be fixed (e.g., exact duplicate names)
- "warning": Should be fixed (e.g., very similar names/purposes)
- "suggestion": Consider fixing (e.g., naming convention differences)

If no issues are found, return: { "issues": [] }

IMPORTANT: Only return the JSON object, no other text.`;

    const userPrompt = `Analyze these tools for consistency issues:

${JSON.stringify(toolsSummary, null, 2)}

${new_tool ? `\nA new tool is being added: ${JSON.stringify(new_tool)}` : ''}

Check for:
1. Duplicate or near-duplicate tool names
2. Ambiguous tool descriptions that overlap
3. Naming convention inconsistencies (some snake_case, some CamelCase, some with spaces)
4. Tools with overlapping functionality

Return ONLY the JSON response.`;

    // Get LLM adapter
    const settings = domain._settings || {};
    const provider = settings.llm_provider || process.env.LLM_PROVIDER || 'anthropic';
    const adapter = createAdapter(provider, {
      apiKey: settings.api_key,
      model: settings.llm_model
    });

    // Call LLM
    const response = await adapter.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.3 // Lower temperature for more consistent analysis
    });

    // Parse response
    let result;
    try {
      let content = response.content.trim();
      // Strip markdown code blocks if present
      if (content.startsWith('```json')) {
        content = content.slice(7);
      }
      if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }
      content = content.trim();

      // Find JSON object
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        content = content.slice(jsonStart, jsonEnd + 1);
      }

      result = JSON.parse(content);
    } catch (parseErr) {
      log.error('Failed to parse LLM response:', parseErr);
      log.debug('Raw response:', response.content);
      return res.json({
        issues: [],
        error: 'Failed to parse validation response'
      });
    }

    log.debug(`Found ${result.issues?.length || 0} consistency issues`);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Policy consistency check
 * POST /api/validate/policy-consistency
 *
 * Uses LLM to analyze policy for:
 * - Conflicting guardrails (never vs always contradictions)
 * - Duplicate rules
 * - Incomplete workflows (missing tools)
 * - Escalation issues
 *
 * Body: { domain_id: string }
 */
router.post('/policy-consistency', async (req, res, next) => {
  try {
    const { domain_id } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }

    log.debug(`Policy consistency check for domain ${domain_id}`);

    // Load domain
    let domain;
    try {
      domain = await domainsStore.load(domain_id);
    } catch (err) {
      if (err.message?.includes('not found') || err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Domain not found' });
      }
      throw err;
    }

    const policy = domain.policy || {};
    const tools = domain.tools || [];
    const guardrails = policy.guardrails || {};
    const workflows = policy.workflows || [];

    // Need at least some policy content to check
    const neverCount = guardrails.never?.length || 0;
    const alwaysCount = guardrails.always?.length || 0;
    const workflowCount = workflows.length;

    if (neverCount + alwaysCount + workflowCount === 0) {
      return res.json({
        issues: [],
        message: 'No policy content to validate'
      });
    }

    // Build prompt for LLM
    const policySummary = {
      guardrails: {
        never: guardrails.never || [],
        always: guardrails.always || []
      },
      workflows: workflows.map(w => ({
        name: w.name,
        trigger: w.trigger,
        steps: w.steps || []
      })),
      escalation: policy.escalation || {}
    };

    const toolNames = tools.map(t => t.name);

    const systemPrompt = `You are a policy consistency analyzer for AI agent configuration. Your job is to detect issues with policy definitions.

Analyze the policy and report any issues found. Return a JSON response with the following structure:
{
  "issues": [
    {
      "type": "conflict" | "duplicate" | "missing_tool" | "vague" | "incomplete",
      "severity": "blocker" | "warning" | "suggestion",
      "items": [<affected_items>],
      "description": "Brief description of the issue",
      "suggestion": "How to fix this"
    }
  ]
}

Issue types:
- "conflict": A "never" rule conflicts with an "always" rule (e.g., "never share personal data" vs "always include customer name")
- "duplicate": Same or nearly identical rules appear multiple times
- "missing_tool": A workflow step references a tool that doesn't exist
- "vague": A guardrail is too vague to be actionable (e.g., "be helpful")
- "incomplete": A workflow is missing required steps or configuration

Severity levels:
- "blocker": Must be fixed (e.g., conflicting rules)
- "warning": Should be fixed (e.g., vague rules that need clarification)
- "suggestion": Consider fixing (e.g., duplicate rules)

Available tools in this domain: ${JSON.stringify(toolNames)}

If no issues are found, return: { "issues": [] }

IMPORTANT: Only return the JSON object, no other text.`;

    const userPrompt = `Analyze this policy configuration for consistency issues:

${JSON.stringify(policySummary, null, 2)}

Available tools: ${JSON.stringify(toolNames)}

Check for:
1. Conflicting guardrails (a "never" that contradicts an "always")
2. Duplicate or near-duplicate rules
3. Workflow steps that reference non-existent tools
4. Vague or unactionable rules
5. Incomplete workflows

Return ONLY the JSON response.`;

    // Get LLM adapter
    const settings = domain._settings || {};
    const provider = settings.llm_provider || process.env.LLM_PROVIDER || 'anthropic';
    const adapter = createAdapter(provider, {
      apiKey: settings.api_key,
      model: settings.llm_model
    });

    // Call LLM
    const response = await adapter.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.3
    });

    // Parse response
    let result;
    try {
      let content = response.content.trim();
      // Strip markdown code blocks if present
      if (content.startsWith('```json')) {
        content = content.slice(7);
      }
      if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }
      content = content.trim();

      // Find JSON object
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        content = content.slice(jsonStart, jsonEnd + 1);
      }

      result = JSON.parse(content);
    } catch (parseErr) {
      log.error('Failed to parse LLM response:', parseErr);
      log.debug('Raw response:', response.content);
      return res.json({
        issues: [],
        error: 'Failed to parse validation response'
      });
    }

    log.debug(`Found ${result.issues?.length || 0} policy issues`);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
