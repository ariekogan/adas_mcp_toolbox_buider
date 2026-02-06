/**
 * Consistency Validation Service
 *
 * Runs all consistency checks for a skill (same as "Validate All" button).
 * Returns structured results for identity, intents, tools, policy, security.
 */

import { createAdapter } from './llm/adapter.js';
import { validateSecurity } from '../validators/securityValidator.js';

/**
 * Detect naming convention of a string
 * @param {string} name - Name to analyze
 * @returns {'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case' | 'SCREAMING_SNAKE' | 'mixed' | 'unknown'}
 */
function detectNamingConvention(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name)) return 'SCREAMING_SNAKE';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return 'snake_case';
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return 'kebab-case';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && /[a-z]/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9]*$/.test(name)) return 'snake_case';
  return 'mixed';
}

/**
 * Check naming convention consistency
 * @param {Array} items - Array of objects with 'name' property
 * @returns {Object|null} - Issue object if inconsistency found
 */
function checkNamingConsistency(items) {
  if (!items || items.length < 2) return null;

  const conventions = items.map(i => ({
    name: i.name,
    convention: detectNamingConvention(i.name)
  }));

  const knownConventions = conventions.filter(c =>
    c.convention !== 'unknown' && c.convention !== 'mixed'
  );

  if (knownConventions.length < 2) return null;

  const uniqueConventions = [...new Set(knownConventions.map(c => c.convention))];
  if (uniqueConventions.length === 1) return null;

  const byConvention = {};
  for (const c of knownConventions) {
    if (!byConvention[c.convention]) byConvention[c.convention] = [];
    byConvention[c.convention].push(c.name);
  }

  const descriptions = Object.entries(byConvention)
    .map(([conv, names]) => `${conv}: ${names.join(', ')}`)
    .join('; ');

  return {
    type: 'naming_inconsistency',
    severity: 'suggestion',
    tools: knownConventions.map(c => c.name),
    description: `Items use different naming conventions: ${descriptions}`,
    suggestion: `Standardize all names to use the same convention (${uniqueConventions[0]} is most common)`
  };
}

/**
 * Run LLM-based analysis with structured JSON output
 * @param {Object} skill - Skill object
 * @param {string} systemPrompt - System prompt for analysis
 * @param {string} userPrompt - User prompt with data
 * @returns {Object} - Parsed JSON result or empty issues
 */
async function runLLMAnalysis(skill, systemPrompt, userPrompt) {
  try {
    const settings = skill._settings || {};
    const provider = settings.llm_provider || process.env.LLM_PROVIDER || 'anthropic';
    const adapter = createAdapter(provider, {
      apiKey: settings.api_key,
      model: settings.llm_model
    });

    const response = await adapter.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.3
    });

    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      content = content.slice(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(content);
  } catch (err) {
    console.error('LLM analysis failed:', err.message);
    return { issues: [], error: err.message };
  }
}

/**
 * Validate tools consistency
 */
async function validateToolsConsistency(skill) {
  const tools = skill.tools || [];
  const allIssues = [];

  // Deterministic: naming consistency
  const namingIssue = checkNamingConsistency(tools);
  if (namingIssue) allIssues.push(namingIssue);

  if (tools.length < 2) {
    return { issues: allIssues };
  }

  // LLM-based: duplicates, ambiguity, overlap
  const toolsSummary = tools.map((t, idx) => ({
    index: idx,
    name: t.name,
    description: t.description,
    inputs: (t.inputs || []).map(i => i.name).join(', ')
  }));

  const systemPrompt = `You are a tool consistency analyzer. Analyze the tools and report issues as JSON:
{
  "issues": [
    {
      "type": "duplicate" | "ambiguous" | "overlap",
      "severity": "blocker" | "warning" | "suggestion",
      "tools": [<tool_names>],
      "description": "Brief description",
      "suggestion": "How to fix"
    }
  ]
}
Do NOT check naming conventions. If no issues, return { "issues": [] }. Return ONLY JSON.`;

  const userPrompt = `Analyze these tools:\n${JSON.stringify(toolsSummary, null, 2)}\n\nCheck for duplicates, ambiguous descriptions, overlapping functionality.`;

  const result = await runLLMAnalysis(skill, systemPrompt, userPrompt);
  const llmIssues = (result.issues || []).filter(i => i.type !== 'naming_inconsistency');
  allIssues.push(...llmIssues);

  return { issues: allIssues };
}

/**
 * Validate intents consistency
 */
async function validateIntentsConsistency(skill) {
  const intents = skill.intents?.supported || [];
  const allIssues = [];

  // Deterministic: naming consistency
  const namingIssue = checkNamingConsistency(intents.map(i => ({ name: i.id })));
  if (namingIssue) {
    allIssues.push({
      ...namingIssue,
      description: namingIssue.description.replace('Items', 'Intents'),
    });
  }

  if (intents.length < 2) {
    return { issues: allIssues };
  }

  // LLM-based: overlapping examples, duplicate descriptions
  const intentsSummary = intents.map((intent, idx) => ({
    index: idx,
    id: intent.id,
    description: intent.description,
    examples: intent.examples || []
  }));

  const systemPrompt = `You are an intent consistency analyzer. Report issues as JSON:
{
  "issues": [
    {
      "type": "overlapping_examples" | "duplicate_description" | "ambiguous",
      "severity": "blocker" | "warning" | "suggestion",
      "intents": [<intent_ids>],
      "description": "Brief description",
      "suggestion": "How to fix"
    }
  ]
}
Do NOT check naming conventions. If no issues, return { "issues": [] }. Return ONLY JSON.`;

  const userPrompt = `Analyze these intents:\n${JSON.stringify(intentsSummary, null, 2)}\n\nCheck for overlapping examples, duplicate descriptions, ambiguous intents.`;

  const result = await runLLMAnalysis(skill, systemPrompt, userPrompt);
  const llmIssues = (result.issues || []).filter(i => i.type !== 'naming_inconsistency');
  allIssues.push(...llmIssues);

  return { issues: allIssues };
}

/**
 * Validate policy consistency
 */
async function validatePolicyConsistency(skill) {
  const policy = skill.policy || {};
  const tools = skill.tools || [];
  const guardrails = policy.guardrails || {};
  const workflows = policy.workflows || [];

  const neverCount = guardrails.never?.length || 0;
  const alwaysCount = guardrails.always?.length || 0;
  const workflowCount = workflows.length;

  if (neverCount + alwaysCount + workflowCount === 0) {
    return { issues: [], message: 'No policy content' };
  }

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

  const toolDescriptions = tools.map(t => ({
    name: t.name,
    description: t.description || '',
    inputs: (t.inputs || []).map(i => i.name)
  }));

  const systemPrompt = `You are a policy consistency analyzer. Report issues as JSON:
{
  "issues": [
    {
      "type": "conflict" | "duplicate" | "missing_capability" | "vague" | "incomplete",
      "severity": "blocker" | "warning" | "suggestion",
      "items": [<affected_items>],
      "description": "Brief description",
      "suggestion": "How to fix"
    }
  ]
}
IMPORTANT: Workflow steps don't need matching tool names - many are conversational. Only flag missing_capability if NO tool can provide the needed data/action.
If no issues, return { "issues": [] }. Return ONLY JSON.`;

  const userPrompt = `Policy:\n${JSON.stringify(policySummary, null, 2)}\n\nTools:\n${JSON.stringify(toolDescriptions, null, 2)}\n\nCheck for conflicts, duplicates, missing capabilities, vague rules.`;

  const result = await runLLMAnalysis(skill, systemPrompt, userPrompt);

  return { issues: result.issues || [] };
}

/**
 * Validate identity consistency (problem, role, scenarios)
 */
async function validateIdentityConsistency(skill) {
  const problem = skill.problem || {};
  const role = skill.role || {};
  const scenarios = skill.scenarios || [];

  if (!problem.statement && !role.name && scenarios.length === 0) {
    return { issues: [], message: 'No identity content' };
  }

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

  const systemPrompt = `You are an AI agent identity analyzer. Report issues as JSON:
{
  "issues": [
    {
      "type": "vague_problem" | "missing_goals" | "goals_misaligned" | "unclear_role" | "missing_persona" | "incomplete_scenario" | "scenario_misaligned" | "limited_scenarios",
      "severity": "blocker" | "warning" | "suggestion",
      "items": [<affected_items>],
      "description": "Brief description",
      "suggestion": "How to fix"
    }
  ]
}
Goals are OPTIONAL - only flag as suggestion if genuinely helpful.
If no significant issues, return { "issues": [] }. Return ONLY JSON.`;

  const userPrompt = `Identity:\n${JSON.stringify(identitySummary, null, 2)}\n\nCheck for problem clarity, role clarity, scenario coverage.`;

  const result = await runLLMAnalysis(skill, systemPrompt, userPrompt);

  return { issues: result.issues || [] };
}

/**
 * Validate security consistency (deterministic - no LLM)
 */
function validateSecurityConsistency(skill) {
  const issues = validateSecurity(skill);

  // Convert to the format used by other consistency checks
  return {
    issues: issues.map(issue => ({
      type: 'security',
      severity: issue.severity === 'error' ? 'blocker' : issue.severity,
      tools: issue.path ? [issue.path] : [],
      description: issue.message,
      suggestion: issue.suggestion
    }))
  };
}

/**
 * Run all consistency checks for a skill
 * @param {Object} skill - Full skill object
 * @param {string} solutionId - Solution ID
 * @returns {Object} - Results for each category
 */
export async function validateConsistencyForSkill(skill, solutionId) {
  try {
    // Run all checks in parallel (security is sync, others are async)
    const [identity, intents, tools, policy] = await Promise.all([
      validateIdentityConsistency(skill).catch(e => ({ issues: [], error: e.message })),
      validateIntentsConsistency(skill).catch(e => ({ issues: [], error: e.message })),
      validateToolsConsistency(skill).catch(e => ({ issues: [], error: e.message })),
      validatePolicyConsistency(skill).catch(e => ({ issues: [], error: e.message }))
    ]);

    const security = validateSecurityConsistency(skill);

    return {
      identity,
      intents,
      tools,
      policy,
      security
    };
  } catch (err) {
    console.error(`Consistency validation failed for skill ${skill.id}:`, err);
    return {
      identity: { issues: [], error: err.message },
      intents: { issues: [], error: err.message },
      tools: { issues: [], error: err.message },
      policy: { issues: [], error: err.message },
      security: { issues: [], error: err.message }
    };
  }
}

export default { validateConsistencyForSkill };
