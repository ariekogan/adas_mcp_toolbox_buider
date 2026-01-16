/**
 * Validation API Routes
 *
 * Hybrid validation: deterministic checks + LLM-based analysis.
 * - Naming convention: deterministic (no false positives)
 * - Duplicates, ambiguity, overlap: LLM-based
 */

import { Router } from 'express';
import { createAdapter } from '../services/llm/adapter.js';
import domainsStore from '../store/domains.js';

/**
 * Coverage metadata for auto-generating documentation
 * @type {Array<{section: string, field: string, check: string, type: string, method: string}>}
 */
export const COVERAGE = [
  // Tools consistency (on-demand)
  { section: 'tools', field: 'tools[].name', check: 'Naming convention consistency', type: 'consistency', method: 'deterministic' },
  { section: 'tools', field: 'tools[].name', check: 'Similar/duplicate names', type: 'consistency', method: 'llm' },
  { section: 'tools', field: 'tools[].description', check: 'Ambiguous descriptions', type: 'consistency', method: 'llm' },
  { section: 'tools', field: 'tools', check: 'Overlapping functionality', type: 'consistency', method: 'llm' },

  // Policy consistency (on-demand)
  { section: 'policy', field: 'policy.guardrails', check: 'Conflicting never/always rules', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.guardrails', check: 'Duplicate rules', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.guardrails', check: 'Vague guardrails', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.workflows', check: 'Incomplete workflows', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.workflows[].steps', check: 'Steps reference non-existent tools', type: 'consistency', method: 'llm' },
];

/**
 * Known gaps - checks that should be implemented
 * @type {Array<{section: string, check: string, priority: string, suggestedMethod: string}>}
 */
export const COVERAGE_GAPS = [
  { section: 'intents', check: 'Overlapping intent examples', priority: 'high', suggestedMethod: 'llm' },
  { section: 'intents', check: 'Duplicate intent descriptions', priority: 'medium', suggestedMethod: 'llm' },
  { section: 'intents', check: 'Intent naming consistency', priority: 'medium', suggestedMethod: 'deterministic' },
  { section: 'cross-section', check: 'Intent → Tool mapping (can intent be fulfilled?)', priority: 'high', suggestedMethod: 'llm' },
  { section: 'cross-section', check: 'Scenario → Intent coverage', priority: 'medium', suggestedMethod: 'llm' },
  { section: 'cross-section', check: 'Guardrails vs Tool capabilities conflict', priority: 'high', suggestedMethod: 'llm' },
  { section: 'policy', check: 'Workflow circular references', priority: 'medium', suggestedMethod: 'deterministic' },
  { section: 'engine', check: 'Settings compatibility', priority: 'low', suggestedMethod: 'deterministic' },
];

// Add identity consistency coverage
COVERAGE.push(
  { section: 'identity', field: 'problem.statement', check: 'Problem statement quality', type: 'consistency', method: 'llm' },
  { section: 'identity', field: 'problem.goals', check: 'Goals alignment with statement', type: 'consistency', method: 'llm' },
  { section: 'identity', field: 'role', check: 'Role/persona clarity', type: 'consistency', method: 'llm' },
  { section: 'identity', field: 'scenarios', check: 'Scenarios completeness', type: 'consistency', method: 'llm' },
  { section: 'identity', field: 'scenarios', check: 'Scenarios alignment with problem', type: 'consistency', method: 'llm' }
);

const router = Router();

/**
 * Detect naming convention of a string
 * @param {string} name - Tool name to analyze
 * @returns {'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case' | 'SCREAMING_SNAKE' | 'mixed' | 'unknown'}
 */
function detectNamingConvention(name) {
  if (!name || typeof name !== 'string') return 'unknown';

  // SCREAMING_SNAKE_CASE: all uppercase with underscores
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name)) {
    return 'SCREAMING_SNAKE';
  }

  // snake_case: lowercase with underscores
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) {
    return 'snake_case';
  }

  // kebab-case: lowercase with hyphens
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return 'kebab-case';
  }

  // PascalCase: starts with uppercase, no separators
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && /[a-z]/.test(name)) {
    return 'PascalCase';
  }

  // camelCase: starts with lowercase, has uppercase letters, no separators
  if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) {
    return 'camelCase';
  }

  // Single word lowercase (could be snake_case without underscores)
  if (/^[a-z][a-z0-9]*$/.test(name)) {
    return 'snake_case'; // Treat single lowercase words as snake_case
  }

  // Mixed or unrecognized
  return 'mixed';
}

/**
 * Check tools for naming convention consistency (deterministic)
 * @param {Array} tools - Array of tool objects with 'name' property
 * @returns {Object|null} - Issue object if inconsistency found, null otherwise
 */
function checkNamingConsistency(tools) {
  if (!tools || tools.length < 2) return null;

  // Detect convention for each tool
  const conventions = tools.map(t => ({
    name: t.name,
    convention: detectNamingConvention(t.name)
  }));

  // Filter out unknown/mixed (we can't judge those)
  const knownConventions = conventions.filter(c =>
    c.convention !== 'unknown' && c.convention !== 'mixed'
  );

  if (knownConventions.length < 2) return null;

  // Get unique conventions
  const uniqueConventions = [...new Set(knownConventions.map(c => c.convention))];

  // If all tools use the same convention, no issue
  if (uniqueConventions.length === 1) return null;

  // Group tools by convention
  const byConvention = {};
  for (const c of knownConventions) {
    if (!byConvention[c.convention]) {
      byConvention[c.convention] = [];
    }
    byConvention[c.convention].push(c.name);
  }

  // Build description
  const conventionDescriptions = Object.entries(byConvention)
    .map(([conv, names]) => `${conv}: ${names.join(', ')}`)
    .join('; ');

  return {
    type: 'naming_inconsistency',
    severity: 'suggestion',
    tools: knownConventions.map(c => c.name),
    description: `Tools use different naming conventions: ${conventionDescriptions}`,
    suggestion: `Standardize all tool names to use the same convention (${uniqueConventions[0]} is most common)`
  };
}

/**
 * Cross-tool consistency check
 * POST /api/validate/tools-consistency
 *
 * Hybrid validation:
 * - Naming convention: DETERMINISTIC (no false positives)
 * - Duplicates, ambiguity, overlap: LLM-based
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

    // Collect all issues
    const allIssues = [];

    // 1. DETERMINISTIC: Check naming convention consistency
    const toolsToCheck = new_tool ? [...tools, new_tool] : tools;
    const namingIssue = checkNamingConsistency(toolsToCheck);
    if (namingIssue) {
      allIssues.push(namingIssue);
      log.debug('Naming inconsistency detected (deterministic):', namingIssue.description);
    }

    // Need at least 2 tools to check other consistency issues
    if (tools.length < 2) {
      return res.json({
        issues: allIssues,
        message: allIssues.length === 0 ? 'Not enough tools to check consistency' : undefined
      });
    }

    // 2. LLM-BASED: Check for duplicates, ambiguity, overlap
    // Build prompt for LLM (excluding naming check - we do that deterministically)
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
      "type": "duplicate" | "ambiguous" | "overlap",
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
- "overlap": Tools have overlapping functionality that could cause confusion

Severity levels:
- "blocker": Must be fixed (e.g., exact duplicate names)
- "warning": Should be fixed (e.g., very similar names/purposes)
- "suggestion": Consider fixing (e.g., minor overlap)

IMPORTANT: Do NOT check for naming convention issues (snake_case vs CamelCase) - that is handled separately.

If no issues are found, return: { "issues": [] }

IMPORTANT: Only return the JSON object, no other text.`;

    const userPrompt = `Analyze these tools for consistency issues:

${JSON.stringify(toolsSummary, null, 2)}

${new_tool ? `\nA new tool is being added: ${JSON.stringify(new_tool)}` : ''}

Check for:
1. Duplicate or near-duplicate tool names
2. Ambiguous tool descriptions that overlap
3. Tools with overlapping functionality

Do NOT check for naming convention (snake_case vs CamelCase) - that is handled separately.

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
    let llmResult;
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

      llmResult = JSON.parse(content);
    } catch (parseErr) {
      log.error('Failed to parse LLM response:', parseErr);
      log.debug('Raw response:', response.content);
      // Return just the deterministic issues if LLM fails
      return res.json({
        issues: allIssues,
        error: 'Failed to parse LLM validation response'
      });
    }

    // Filter out any naming_inconsistency from LLM (in case it still returns one)
    const llmIssues = (llmResult.issues || []).filter(
      issue => issue.type !== 'naming_inconsistency'
    );

    // Combine deterministic and LLM issues
    allIssues.push(...llmIssues);

    log.debug(`Found ${allIssues.length} total consistency issues (${namingIssue ? 1 : 0} deterministic, ${llmIssues.length} LLM)`);

    res.json({ issues: allIssues });
  } catch (err) {
    next(err);
  }
});

/**
 * Intents consistency check
 * POST /api/validate/intents-consistency
 *
 * Hybrid validation:
 * - Naming convention: DETERMINISTIC (no false positives)
 * - Overlapping examples, duplicate descriptions: LLM-based
 *
 * Body: { domain_id: string }
 */
router.post('/intents-consistency', async (req, res, next) => {
  try {
    const { domain_id } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }

    log.debug(`Intents consistency check for domain ${domain_id}`);

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

    const intents = domain.intents?.supported || [];

    // Collect all issues
    const allIssues = [];

    // 1. DETERMINISTIC: Check naming convention consistency
    const namingIssue = checkNamingConsistency(
      intents.map(i => ({ name: i.id })) // Use intent ID as "name" for consistency check
    );
    if (namingIssue) {
      // Reformat for intents context
      allIssues.push({
        ...namingIssue,
        type: 'naming_inconsistency',
        description: namingIssue.description.replace('Tools', 'Intents').replace('tool names', 'intent IDs'),
        suggestion: namingIssue.suggestion.replace('tool names', 'intent IDs')
      });
      log.debug('Intent naming inconsistency detected (deterministic):', namingIssue.description);
    }

    // Need at least 2 intents to check other consistency issues
    if (intents.length < 2) {
      return res.json({
        issues: allIssues,
        message: allIssues.length === 0 ? 'Not enough intents to check consistency' : undefined
      });
    }

    // 2. LLM-BASED: Check for overlapping examples, duplicate descriptions
    const intentsSummary = intents.map((intent, idx) => ({
      index: idx,
      id: intent.id,
      description: intent.description,
      examples: intent.examples || []
    }));

    const systemPrompt = `You are an intent consistency analyzer. Your job is to detect issues with intents defined for an AI agent.

Analyze the intents and report any issues found. Return a JSON response with the following structure:
{
  "issues": [
    {
      "type": "overlapping_examples" | "duplicate_description" | "ambiguous",
      "severity": "blocker" | "warning" | "suggestion",
      "intents": [<intent_ids_involved>],
      "description": "Brief description of the issue",
      "suggestion": "How to fix this"
    }
  ]
}

Issue types:
- "overlapping_examples": Two or more intents have examples that could trigger either one (e.g., "check my order" could be "order_status" or "order_tracking")
- "duplicate_description": Intents have nearly identical descriptions
- "ambiguous": Intent descriptions are too similar, making it unclear which should handle a given user input

Severity levels:
- "blocker": Must be fixed (e.g., exact duplicate descriptions or highly overlapping examples)
- "warning": Should be fixed (e.g., very similar examples that could cause confusion)
- "suggestion": Consider fixing (e.g., minor overlap)

IMPORTANT: Do NOT check for naming convention issues (snake_case vs CamelCase) - that is handled separately.

If no issues are found, return: { "issues": [] }

IMPORTANT: Only return the JSON object, no other text.`;

    const userPrompt = `Analyze these intents for consistency issues:

${JSON.stringify(intentsSummary, null, 2)}

Check for:
1. Overlapping examples between intents (examples that could match multiple intents)
2. Duplicate or near-duplicate intent descriptions
3. Ambiguous intents that would be hard to distinguish

Do NOT check for naming convention (snake_case vs CamelCase) - that is handled separately.

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
    let llmResult;
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

      llmResult = JSON.parse(content);
    } catch (parseErr) {
      log.error('Failed to parse LLM response:', parseErr);
      log.debug('Raw response:', response.content);
      // Return just the deterministic issues if LLM fails
      return res.json({
        issues: allIssues,
        error: 'Failed to parse LLM validation response'
      });
    }

    // Filter out any naming_inconsistency from LLM (in case it still returns one)
    const llmIssues = (llmResult.issues || []).filter(
      issue => issue.type !== 'naming_inconsistency'
    );

    // Combine deterministic and LLM issues
    allIssues.push(...llmIssues);

    log.debug(`Found ${allIssues.length} total intent consistency issues (${namingIssue ? 1 : 0} deterministic, ${llmIssues.length} LLM)`);

    res.json({ issues: allIssues });
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

/**
 * Identity consistency check
 * POST /api/validate/identity-consistency
 *
 * Uses LLM to analyze identity (problem, role, scenarios) for:
 * - Problem statement quality and clarity
 * - Goals alignment with the problem statement
 * - Role/persona clarity and relevance
 * - Scenarios completeness and alignment
 *
 * Body: { domain_id: string }
 */
router.post('/identity-consistency', async (req, res, next) => {
  try {
    const { domain_id } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }

    log.debug(`Identity consistency check for domain ${domain_id}`);

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

    const problem = domain.problem || {};
    const role = domain.role || {};
    const scenarios = domain.scenarios || [];

    // Need at least a problem statement to check
    if (!problem.statement && !role.name && scenarios.length === 0) {
      return res.json({
        issues: [],
        message: 'No identity content to validate (add problem, role, or scenarios first)'
      });
    }

    // Build summary for LLM
    const identitySummary = {
      problem: {
        statement: problem.statement || '',
        context: problem.context || '',
        goals: problem.goals || []
      },
      role: {
        name: role.name || '',
        persona: role.persona || ''
      },
      scenarios: scenarios.map(s => ({
        title: s.title,
        description: s.description || '',
        steps: (s.steps || []).length
      }))
    };

    const systemPrompt = `You are an AI agent identity analyzer. Your job is to review the "identity" section of an AI agent skill definition:
- Problem: The core problem this agent solves
- Role/Persona: Who the agent is and how it behaves
- Scenarios: User scenarios the agent handles

Analyze the identity for quality issues. Return a JSON response with the following structure:
{
  "issues": [
    {
      "type": "vague_problem" | "missing_goals" | "goals_misaligned" | "unclear_role" | "missing_persona" | "incomplete_scenario" | "scenario_misaligned" | "limited_scenarios",
      "severity": "blocker" | "warning" | "suggestion",
      "items": [<affected_items>],
      "description": "Brief description of the issue",
      "suggestion": "How to fix this"
    }
  ]
}

Issue types:
- "vague_problem": Problem statement is too vague or generic to guide the agent
- "missing_goals": No explicit goals defined (OPTIONAL - only suggest if it would genuinely help)
- "goals_misaligned": Goals don't clearly relate to the problem statement
- "unclear_role": Role name is unclear or too generic
- "missing_persona": No persona defined for the role
- "incomplete_scenario": Scenario lacks description or steps
- "scenario_misaligned": Scenario doesn't clearly relate to the problem
- "limited_scenarios": Only 1-2 scenarios defined, could benefit from more coverage

Severity levels:
- "blocker": Must be fixed (e.g., no problem statement at all)
- "warning": Should be fixed (e.g., vague problem that needs clarification)
- "suggestion": Optional enhancement (e.g., adding goals, more scenarios)

IMPORTANT GUIDELINES:
- Goals are OPTIONAL. Only flag "missing_goals" as a SUGGESTION if explicit goals would genuinely help guide the agent's priorities. Many agents work fine without explicit goals.
- Be helpful but not overly strict. Focus on issues that would genuinely hurt the agent's effectiveness.
- Don't flag missing scenarios if at least one good scenario exists - instead suggest "limited_scenarios" as a suggestion.
- A clear problem statement + role + 1 scenario is a valid minimal identity.

If no significant issues are found, return: { "issues": [] }

IMPORTANT: Only return the JSON object, no other text.`;

    const userPrompt = `Analyze this AI agent identity for quality issues:

${JSON.stringify(identitySummary, null, 2)}

Check for:
1. Is the problem statement clear and specific enough to guide the agent?
2. Is the role/persona clear and appropriate?
3. Do the scenarios cover realistic use cases for this problem?
4. Are there any significant gaps or misalignments?

Note: Goals are optional. Only suggest adding them if explicit goals would genuinely help prioritize the agent's behavior.

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

    log.debug(`Found ${result.issues?.length || 0} identity issues`);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
