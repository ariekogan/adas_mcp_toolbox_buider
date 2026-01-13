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

export default router;
