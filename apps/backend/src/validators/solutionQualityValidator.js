/**
 * Solution Quality Validator
 *
 * LLM-based intelligent validation that provides fuzzy quality estimation
 * (bad/fair/good/excellent) by comparing what the solution is supposed to do
 * against what it actually implements.
 *
 * Uses dual-analysis approach:
 * - Option A: Full holistic LLM analysis (single call with complete context)
 * - Option C: Hybrid structured extraction + LLM evaluation
 * - Synthesis: Combines both for robust final score
 *
 * @module validators/solutionQualityValidator
 */

import { createAdapter } from '../services/llm/adapter.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const GRADE_THRESHOLDS = {
  excellent: 80,
  good: 60,
  fair: 40,
  bad: 0,
};

const DIMENSION_WEIGHTS = {
  goal_coverage: 0.25,
  scenario_completeness: 0.20,
  skill_coherence: 0.15,
  integration_quality: 0.15,
  security_posture: 0.15,
  operational_readiness: 0.10,
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTION C: DETERMINISTIC EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract structured data for hybrid analysis
 * @param {Object} solution - Solution object
 * @param {Array} skills - Array of skill objects with full tool data
 * @returns {Object} Structured extraction for LLM analysis
 */
function extractStructuredData(solution, skills) {
  const extraction = {
    // Solution identity
    name: solution.name,
    description: solution.description || '',
    phase: solution.phase || 'unknown',

    // Problem & Goals
    problem: {
      statement: solution.problem?.statement || '',
      context: solution.problem?.context || '',
      goals: solution.problem?.goals || [],
    },

    // Skills summary
    skills: skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      role: skill.role?.name || '',
      persona: skill.role?.persona?.substring(0, 200) || '',
      tool_count: (skill.tools || []).length,
      tools: (skill.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        classification: t.security?.classification || t.classification || 'unclassified',
        input_count: (t.inputs || []).length,
      })),
      intent_count: (skill.intents?.supported || []).length,
      scenario_count: (skill.scenarios || []).length,
      has_guardrails: Boolean(skill.policy?.guardrails?.never?.length || skill.policy?.guardrails?.always?.length),
      workflow_count: (skill.policy?.workflows || []).length,
    })),

    // Integration
    grants: (solution.grants || []).map(g => ({
      key: g.key,
      description: g.description || '',
      issued_by: g.issued_by || [],
      consumed_by: g.consumed_by || [],
    })),

    handoffs: (solution.handoffs || []).map(h => ({
      id: h.id,
      from: h.from,
      to: h.to,
      trigger: h.trigger || '',
      grants_passed: h.grants_passed || [],
    })),

    routing: Object.entries(solution.routing || {}).map(([channel, config]) => ({
      channel,
      default_skill: config.default_skill,
    })),

    // Security
    security_contracts: (solution.security_contracts || []).map(c => ({
      name: c.name,
      consumer: c.consumer,
      provider: c.provider,
      requires_grants: c.requires_grants || [],
    })),

    // Stats
    stats: {
      total_skills: skills.length,
      total_tools: skills.reduce((sum, s) => sum + (s.tools?.length || 0), 0),
      total_grants: (solution.grants || []).length,
      total_handoffs: (solution.handoffs || []).length,
      total_channels: Object.keys(solution.routing || {}).length,
      skills_with_guardrails: skills.filter(s =>
        s.policy?.guardrails?.never?.length || s.policy?.guardrails?.always?.length
      ).length,
      high_risk_tools: skills.reduce((sum, s) =>
        sum + (s.tools || []).filter(t =>
          ['financial', 'destructive', 'pii_write'].includes(
            t.security?.classification || t.classification
          )
        ).length, 0
      ),
    },
  };

  // Coverage matrix: which goals are covered by which skills/tools
  extraction.coverage_matrix = buildCoverageMatrix(extraction);

  return extraction;
}

/**
 * Build a coverage matrix showing goal → skill → tool relationships
 */
function buildCoverageMatrix(extraction) {
  const matrix = {
    goals: extraction.problem.goals.map(goal => ({
      goal,
      potential_skills: [],
      coverage_hints: [],
    })),
    uncovered_areas: [],
    redundant_areas: [],
  };

  // Simple keyword matching to hint at coverage
  for (const goalEntry of matrix.goals) {
    const goalLower = goalEntry.goal.toLowerCase();
    for (const skill of extraction.skills) {
      const skillText = `${skill.name} ${skill.description} ${skill.role}`.toLowerCase();
      const toolText = skill.tools.map(t => `${t.name} ${t.description}`).join(' ').toLowerCase();

      // Check for keyword overlap
      const goalWords = goalLower.split(/\s+/).filter(w => w.length > 3);
      const matchingWords = goalWords.filter(w =>
        skillText.includes(w) || toolText.includes(w)
      );

      if (matchingWords.length > 0) {
        goalEntry.potential_skills.push({
          skill_id: skill.id,
          skill_name: skill.name,
          matching_keywords: matchingWords,
          tool_count: skill.tool_count,
        });
      }
    }

    if (goalEntry.potential_skills.length === 0) {
      goalEntry.coverage_hints.push('No skills appear to directly address this goal');
    }
  }

  return matrix;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION A: FULL HOLISTIC LLM ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run full holistic analysis with complete solution context
 * @param {Object} solution - Solution object
 * @param {Array} skills - Array of skill objects
 * @param {Object} settings - LLM settings
 * @returns {Object} Holistic analysis result
 */
async function runHolisticAnalysis(solution, skills, settings = {}) {
  const adapter = createAdapter(settings.llm_provider || 'openai', {
    apiKey: settings.api_key,
    model: settings.llm_model || 'gpt-4.1-2025-04-14',
  });

  // Build comprehensive context
  const solutionContext = JSON.stringify({
    name: solution.name,
    description: solution.description,
    problem: solution.problem,
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      role: s.role,
      tools: (s.tools || []).map(t => ({
        name: t.name,
        description: t.description,
        classification: t.security?.classification || t.classification,
      })),
      scenarios: s.scenarios,
      intents: s.intents?.supported?.map(i => ({
        id: i.id,
        description: i.description,
        examples: i.examples,
      })),
      guardrails: s.policy?.guardrails,
      workflows: s.policy?.workflows,
    })),
    grants: solution.grants,
    handoffs: solution.handoffs,
    routing: solution.routing,
    security_contracts: solution.security_contracts,
  }, null, 2);

  const systemPrompt = `You are an expert AI solution architect reviewing a multi-skill AI agent solution.

Analyze the solution holistically and rate its quality across these dimensions (0-100):

1. **Goal Coverage** (25%): Do the skills and tools actually address the stated goals?
2. **Scenario Completeness** (20%): Can all defined scenarios be executed with available tools?
3. **Skill Coherence** (15%): Do skills have clear boundaries? No overlaps or gaps?
4. **Integration Quality** (15%): Are grants/handoffs properly connecting skills?
5. **Security Posture** (15%): Are high-risk operations properly gated?
6. **Operational Readiness** (10%): Error handling, escalation paths, edge cases?

Provide your analysis as JSON:
{
  "dimensions": {
    "goal_coverage": { "score": <0-100>, "reasoning": "<brief explanation>", "gaps": ["<gap1>", ...] },
    "scenario_completeness": { "score": <0-100>, "reasoning": "<brief>", "missing_capabilities": ["..."] },
    "skill_coherence": { "score": <0-100>, "reasoning": "<brief>", "overlaps": ["..."], "gaps": ["..."] },
    "integration_quality": { "score": <0-100>, "reasoning": "<brief>", "issues": ["..."] },
    "security_posture": { "score": <0-100>, "reasoning": "<brief>", "risks": ["..."] },
    "operational_readiness": { "score": <0-100>, "reasoning": "<brief>", "missing": ["..."] }
  },
  "strengths": ["<strength1>", "<strength2>", ...],
  "critical_issues": ["<issue1>", ...],
  "suggestions": [
    { "priority": "high|medium|low", "category": "<category>", "description": "<what to do>", "impact": "<expected improvement>" }
  ],
  "summary": "<2-3 sentence overall assessment>"
}

Be specific and actionable. Reference actual skill/tool names when possible.`;

  const userPrompt = `Analyze this AI agent solution:\n\n${solutionContext}`;

  try {
    const response = await adapter.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.3,
      enableTools: false,
    });

    // Parse JSON response
    let content = response.content.trim();
    // Remove markdown code blocks if present
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      content = content.slice(jsonStart, jsonEnd + 1);
    }

    const result = JSON.parse(content);
    result._analysis_type = 'holistic';
    result._tokens = response.usage;
    return result;
  } catch (err) {
    console.error('Holistic analysis failed:', err.message);
    return {
      _analysis_type: 'holistic',
      _error: err.message,
      dimensions: {},
      strengths: [],
      critical_issues: ['Analysis failed: ' + err.message],
      suggestions: [],
      summary: 'Unable to complete holistic analysis',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION C: HYBRID ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run hybrid analysis: structured extraction + LLM evaluation
 * @param {Object} solution - Solution object
 * @param {Array} skills - Array of skill objects
 * @param {Object} settings - LLM settings
 * @returns {Object} Hybrid analysis result
 */
async function runHybridAnalysis(solution, skills, settings = {}) {
  // Phase 1: Deterministic extraction
  const extraction = extractStructuredData(solution, skills);

  // Phase 2: LLM evaluation of structured data
  const adapter = createAdapter(settings.llm_provider || 'openai', {
    apiKey: settings.api_key,
    model: settings.llm_model || 'gpt-4.1-2025-04-14',
  });

  const systemPrompt = `You are an AI solution quality assessor. You will receive a structured analysis of an AI agent solution.

Based on the pre-extracted data, evaluate the solution quality. The extraction includes:
- Problem statement and goals
- Skills with their tools, intents, and scenarios
- Integration (grants, handoffs, routing)
- Coverage matrix (goal → skill mapping hints)
- Stats (counts, high-risk tools, etc.)

Rate each dimension (0-100) and identify specific issues:

{
  "dimensions": {
    "goal_coverage": { "score": <0-100>, "reasoning": "<based on coverage_matrix>", "gaps": ["..."] },
    "scenario_completeness": { "score": <0-100>, "reasoning": "<based on tool availability>", "missing": ["..."] },
    "skill_coherence": { "score": <0-100>, "reasoning": "<based on skill descriptions>", "issues": ["..."] },
    "integration_quality": { "score": <0-100>, "reasoning": "<based on grants/handoffs>", "issues": ["..."] },
    "security_posture": { "score": <0-100>, "reasoning": "<based on classifications & guardrails>", "risks": ["..."] },
    "operational_readiness": { "score": <0-100>, "reasoning": "<based on workflows & escalation>", "gaps": ["..."] }
  },
  "key_observations": ["<observation1>", ...],
  "suggestions": [
    { "priority": "high|medium|low", "category": "<category>", "description": "<action>", "effort": "low|medium|high" }
  ],
  "summary": "<1-2 sentence assessment based on data>"
}

Focus on what the data reveals. Be data-driven.`;

  const userPrompt = `Evaluate this solution based on extracted data:\n\n${JSON.stringify(extraction, null, 2)}`;

  try {
    const response = await adapter.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 3000,
      temperature: 0.2,
      enableTools: false,
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

    const result = JSON.parse(content);
    result._analysis_type = 'hybrid';
    result._extraction = extraction;
    result._tokens = response.usage;
    return result;
  } catch (err) {
    console.error('Hybrid analysis failed:', err.message);
    return {
      _analysis_type: 'hybrid',
      _error: err.message,
      _extraction: extraction,
      dimensions: {},
      key_observations: [],
      suggestions: [],
      summary: 'Unable to complete hybrid analysis',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHESIS: COMBINE BOTH ANALYSES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Synthesize holistic and hybrid analyses into final result
 * @param {Object} holistic - Result from runHolisticAnalysis
 * @param {Object} hybrid - Result from runHybridAnalysis
 * @returns {Object} Synthesized quality assessment
 */
function synthesizeResults(holistic, hybrid) {
  const dimensions = {};

  // Combine dimension scores (average when both available)
  const allDimensions = [
    'goal_coverage', 'scenario_completeness', 'skill_coherence',
    'integration_quality', 'security_posture', 'operational_readiness'
  ];

  for (const dim of allDimensions) {
    const hScore = holistic.dimensions?.[dim]?.score;
    const yScore = hybrid.dimensions?.[dim]?.score;

    if (hScore !== undefined && yScore !== undefined) {
      // Both available: weighted average (holistic 60%, hybrid 40%)
      dimensions[dim] = {
        score: Math.round(hScore * 0.6 + yScore * 0.4),
        holistic_score: hScore,
        hybrid_score: yScore,
        reasoning: holistic.dimensions[dim]?.reasoning || hybrid.dimensions[dim]?.reasoning,
        issues: [
          ...(holistic.dimensions[dim]?.gaps || holistic.dimensions[dim]?.issues || holistic.dimensions[dim]?.risks || holistic.dimensions[dim]?.missing || []),
          ...(hybrid.dimensions[dim]?.gaps || hybrid.dimensions[dim]?.issues || hybrid.dimensions[dim]?.risks || hybrid.dimensions[dim]?.missing || []),
        ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
      };
    } else if (hScore !== undefined) {
      dimensions[dim] = { score: hScore, source: 'holistic', ...holistic.dimensions[dim] };
    } else if (yScore !== undefined) {
      dimensions[dim] = { score: yScore, source: 'hybrid', ...hybrid.dimensions[dim] };
    } else {
      dimensions[dim] = { score: 50, source: 'default', reasoning: 'Unable to assess' };
    }
  }

  // Calculate weighted overall score
  let overallScore = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    overallScore += (dimensions[dim]?.score || 50) * weight;
  }
  overallScore = Math.round(overallScore);

  // Determine grade
  let grade = 'bad';
  if (overallScore >= GRADE_THRESHOLDS.excellent) grade = 'excellent';
  else if (overallScore >= GRADE_THRESHOLDS.good) grade = 'good';
  else if (overallScore >= GRADE_THRESHOLDS.fair) grade = 'fair';

  // Combine suggestions (prioritize high-priority, dedupe similar)
  const allSuggestions = [
    ...(holistic.suggestions || []),
    ...(hybrid.suggestions || []),
  ];
  const topSuggestions = prioritizeSuggestions(allSuggestions);

  // Combine insights
  const strengths = holistic.strengths || [];
  const criticalIssues = [
    ...(holistic.critical_issues || []),
    ...(hybrid.key_observations?.filter(o => o.toLowerCase().includes('missing') || o.toLowerCase().includes('lack')) || []),
  ];

  // Create synthesis summary
  const summaryParts = [holistic.summary, hybrid.summary].filter(Boolean);
  const summary = summaryParts.length > 0
    ? summaryParts.join(' ')
    : `Solution scored ${overallScore}/100 (${grade}). See dimension scores for details.`;

  return {
    overall_score: overallScore,
    grade,
    grade_label: getGradeLabel(grade),
    dimensions,
    strengths,
    critical_issues: criticalIssues,
    top_suggestions: topSuggestions.slice(0, 5),
    all_suggestions: topSuggestions,
    summary,
    _analysis: {
      holistic: {
        completed: !holistic._error,
        error: holistic._error,
        tokens: holistic._tokens,
      },
      hybrid: {
        completed: !hybrid._error,
        error: hybrid._error,
        tokens: hybrid._tokens,
        stats: hybrid._extraction?.stats,
      },
    },
  };
}

/**
 * Get human-readable grade label
 */
function getGradeLabel(grade) {
  const labels = {
    excellent: '🌟 Excellent - Production Ready',
    good: '✅ Good - Minor Improvements Needed',
    fair: '⚠️ Fair - Significant Gaps',
    bad: '❌ Poor - Major Rework Required',
  };
  return labels[grade] || grade;
}

/**
 * Prioritize and dedupe suggestions
 */
function prioritizeSuggestions(suggestions) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  // Sort by priority
  const sorted = [...suggestions].sort((a, b) =>
    (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
  );

  // Simple deduplication based on description similarity
  const seen = new Set();
  const deduped = [];
  for (const s of sorted) {
    const key = s.description?.toLowerCase().substring(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(s);
    }
  }

  return deduped;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run complete quality validation on a solution
 * @param {Object} solution - Solution object
 * @param {Array} skills - Array of skill objects with full tool data
 * @param {Object} options - Options
 * @param {Object} options.settings - LLM settings (llm_provider, api_key, llm_model)
 * @returns {Object} Quality assessment with score, grade, and suggestions
 */
export async function validateSolutionQuality(solution, skills, options = {}) {
  const settings = options.settings || {};

  console.log(`[Quality] Starting quality validation for solution: ${solution.name}`);
  console.log(`[Quality] Skills: ${skills.length}, Total tools: ${skills.reduce((s, sk) => s + (sk.tools?.length || 0), 0)}`);

  // Run both analyses in parallel
  const [holistic, hybrid] = await Promise.all([
    runHolisticAnalysis(solution, skills, settings),
    runHybridAnalysis(solution, skills, settings),
  ]);

  console.log(`[Quality] Holistic analysis: ${holistic._error ? 'FAILED' : 'OK'}`);
  console.log(`[Quality] Hybrid analysis: ${hybrid._error ? 'FAILED' : 'OK'}`);

  // Synthesize results
  const result = synthesizeResults(holistic, hybrid);

  console.log(`[Quality] Final score: ${result.overall_score}/100 (${result.grade})`);

  return result;
}

export default { validateSolutionQuality };
