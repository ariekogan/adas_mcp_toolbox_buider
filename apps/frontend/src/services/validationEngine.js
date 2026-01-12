/**
 * Validation Engine - Cascading Validation Rules
 *
 * Runs validation checks when skill components change and generates
 * actionable issues with chat prompts for resolution.
 */

export const VALIDATION_SEVERITY = {
  BLOCKER: 'blocker',
  WARNING: 'warning',
  SUGGESTION: 'suggestion',
  INFO: 'info'
};

export const VALIDATION_CATEGORY = {
  INTENTS: 'intents',
  TOOLS: 'tools',
  POLICY: 'policy',
  SCENARIOS: 'scenarios',
  ENGINE: 'engine'
};

let issueCounter = 0;

function generateIssueId() {
  return `val_${Date.now()}_${++issueCounter}`;
}

/**
 * Run validation based on detected changes
 * @param {Array} changes - Array of change objects { type, item, id, previousItem }
 * @param {Object} skill - Current skill state
 * @returns {Array} - Array of validation issues
 */
export function runValidation(changes, skill) {
  const issues = [];

  changes.forEach(change => {
    switch (change.type) {
      case 'scenario_added':
        issues.push(...validateScenarioAdded(change, skill));
        break;
      case 'intent_added':
        issues.push(...validateIntentAdded(change, skill));
        break;
      case 'intent_modified':
        issues.push(...validateIntentModified(change, skill));
        break;
      case 'tool_added':
        issues.push(...validateToolAdded(change, skill));
        break;
      case 'tool_modified':
        issues.push(...validateToolModified(change, skill));
        break;
      case 'policy_modified':
        issues.push(...validatePolicyModified(change, skill));
        break;
      default:
        break;
    }
  });

  return issues;
}

/**
 * Validation: Scenario Added
 * - Check if intents cover the new scenario
 * - Check if tools are available for scenario actions
 */
function validateScenarioAdded(change, skill) {
  const issues = [];
  const scenario = change.item;
  const scenarioName = scenario?.title || 'New scenario';

  // Suggest reviewing intents for new scenario
  issues.push({
    id: generateIssueId(),
    severity: VALIDATION_SEVERITY.WARNING,
    category: VALIDATION_CATEGORY.INTENTS,
    title: `Review intents for "${scenarioName}"`,
    context: `New scenario added`,
    chatPrompt: `I just added a new scenario: "${scenarioName}". Please review if the existing intents cover this scenario, and suggest any new intents or example updates that might be needed.`,
    triggeredBy: {
      type: 'scenario_added',
      id: change.id,
      timestamp: new Date().toISOString()
    },
    relatedIds: [change.id]
  });

  // Check if scenario mentions tools that don't exist
  const scenarioText = `${scenario?.title || ''} ${scenario?.description || ''} ${(scenario?.steps || []).join(' ')}`.toLowerCase();
  const toolKeywords = ['lookup', 'search', 'get', 'create', 'update', 'delete', 'send', 'check', 'verify'];

  const mentionedActions = toolKeywords.filter(kw => scenarioText.includes(kw));
  if (mentionedActions.length > 0) {
    const existingTools = (skill.tools || []).map(t => t.name?.toLowerCase() || '');
    const potentialMissingTools = mentionedActions.filter(action => {
      return !existingTools.some(tool => tool.includes(action));
    });

    if (potentialMissingTools.length > 0) {
      issues.push({
        id: generateIssueId(),
        severity: VALIDATION_SEVERITY.SUGGESTION,
        category: VALIDATION_CATEGORY.TOOLS,
        title: `Scenario may need new tools`,
        context: `"${scenarioName}" mentions: ${potentialMissingTools.join(', ')}`,
        chatPrompt: `The new scenario "${scenarioName}" seems to require actions like: ${potentialMissingTools.join(', ')}. Please check if any new tools should be defined to support this scenario.`,
        triggeredBy: {
          type: 'scenario_added',
          id: change.id,
          timestamp: new Date().toISOString()
        },
        relatedIds: [change.id]
      });
    }
  }

  return issues;
}

/**
 * Validation: Intent Added
 * - Check if examples are provided
 * - Check if related workflow exists
 */
function validateIntentAdded(change, skill) {
  const issues = [];
  const intent = change.item;
  const intentName = intent?.name || 'New intent';

  // Check for examples
  if (!intent?.examples || intent.examples.length === 0) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.WARNING,
      category: VALIDATION_CATEGORY.INTENTS,
      title: `Intent "${intentName}" needs examples`,
      context: `No example utterances provided`,
      chatPrompt: `The intent "${intentName}" was added but has no example utterances. Please suggest 3-5 example phrases users might say for this intent.`,
      triggeredBy: {
        type: 'intent_added',
        id: change.id,
        timestamp: new Date().toISOString()
      },
      relatedIds: [change.id]
    });
  }

  return issues;
}

/**
 * Validation: Intent Modified
 * - Check if examples still match intent description
 */
function validateIntentModified(change, skill) {
  const issues = [];
  const intent = change.item;
  const intentName = intent?.name || 'Intent';

  // Suggest reviewing examples if description changed significantly
  if (change.previousItem?.description !== intent?.description) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.SUGGESTION,
      category: VALIDATION_CATEGORY.INTENTS,
      title: `Review examples for "${intentName}"`,
      context: `Intent description was updated`,
      chatPrompt: `The description for intent "${intentName}" was updated. Please review if the existing examples still match the new description, and suggest any updates if needed.`,
      triggeredBy: {
        type: 'intent_modified',
        id: change.id,
        timestamp: new Date().toISOString()
      },
      relatedIds: [change.id]
    });
  }

  return issues;
}

/**
 * Validation: Tool Added
 * - Check if policy covers the tool
 * - Check if tool is referenced in any workflow
 */
function validateToolAdded(change, skill) {
  const issues = [];
  const tool = change.item;
  const toolName = tool?.name || 'New tool';

  // Check if tool has policy - accept any non-empty policy object
  const hasPolicy = tool?.policy && Object.keys(tool.policy).length > 0;
  if (!hasPolicy) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.BLOCKER,
      category: VALIDATION_CATEGORY.POLICY,
      title: `Tool "${toolName}" missing policy`,
      context: `No guardrails defined for this tool`,
      chatPrompt: `The tool "${toolName}" was added but has no policy configuration. Please define the guardrails: Is it always allowed? Does it require approval? Are there any restrictions?`,
      triggeredBy: {
        type: 'tool_added',
        id: change.id,
        timestamp: new Date().toISOString()
      },
      relatedIds: [change.id]
    });
  }

  // Check if tool has mock examples
  if (!tool?.mock?.examples || tool.mock.examples.length === 0) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.SUGGESTION,
      category: VALIDATION_CATEGORY.TOOLS,
      title: `Add mock data for "${toolName}"`,
      context: `No mock examples for testing`,
      chatPrompt: `The tool "${toolName}" has no mock examples defined. Please suggest some example input/output pairs so we can test this tool.`,
      triggeredBy: {
        type: 'tool_added',
        id: change.id,
        timestamp: new Date().toISOString()
      },
      relatedIds: [change.id]
    });
  }

  return issues;
}

/**
 * Validation: Tool Modified
 * - Check if policy needs update
 * - Check if mock examples still valid
 */
function validateToolModified(change, skill) {
  const issues = [];
  const tool = change.item;
  const toolName = tool?.name || 'Tool';

  // If inputs changed, suggest updating mock examples
  const prevInputs = JSON.stringify(change.previousItem?.inputs || []);
  const currInputs = JSON.stringify(tool?.inputs || []);

  if (prevInputs !== currInputs) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.WARNING,
      category: VALIDATION_CATEGORY.TOOLS,
      title: `Update mocks for "${toolName}"`,
      context: `Tool inputs were modified`,
      chatPrompt: `The inputs for tool "${toolName}" were changed. Please review and update the mock examples to match the new input structure.`,
      triggeredBy: {
        type: 'tool_modified',
        id: change.id,
        timestamp: new Date().toISOString()
      },
      relatedIds: [change.id]
    });
  }

  return issues;
}

/**
 * Validation: Policy Modified
 * - Check if policy references valid tools
 * - Check for conflicts between guardrails
 */
function validatePolicyModified(change, skill) {
  const issues = [];
  const policy = change.item;

  // Check if any "never" rules conflict with tool requirements
  const neverRules = policy?.guardrails?.never || [];
  const alwaysRules = policy?.guardrails?.always || [];

  // Check for potential conflicts
  const toolNames = (skill.tools || []).map(t => t.name?.toLowerCase() || '');

  neverRules.forEach(rule => {
    const ruleLower = rule.toLowerCase();
    toolNames.forEach(toolName => {
      if (ruleLower.includes(toolName)) {
        issues.push({
          id: generateIssueId(),
          severity: VALIDATION_SEVERITY.WARNING,
          category: VALIDATION_CATEGORY.POLICY,
          title: `Policy may conflict with tool`,
          context: `"Never" rule mentions tool "${toolName}"`,
          chatPrompt: `A policy guardrail says to never "${rule}", but there's a tool named "${toolName}". Please clarify: Is this tool still needed, or should the policy be adjusted?`,
          triggeredBy: {
            type: 'policy_modified',
            timestamp: new Date().toISOString()
          },
          relatedIds: []
        });
      }
    });
  });

  // Suggest review if significant policy changes
  if (neverRules.length !== (change.previousItem?.guardrails?.never || []).length ||
      alwaysRules.length !== (change.previousItem?.guardrails?.always || []).length) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.INFO,
      category: VALIDATION_CATEGORY.POLICY,
      title: `Policy guardrails updated`,
      context: `Review impact on skill behavior`,
      chatPrompt: `The policy guardrails were updated. Please review if the changes align with the skill's intended behavior and if any tools or intents need adjustments.`,
      triggeredBy: {
        type: 'policy_modified',
        timestamp: new Date().toISOString()
      },
      relatedIds: []
    });
  }

  return issues;
}

/**
 * Run full validation on entire skill (for initial load or manual trigger)
 */
export function runFullValidation(skill) {
  const issues = [];

  // Check all tools have policies - accept any non-empty policy object
  (skill.tools || []).forEach(tool => {
    const hasPolicy = tool?.policy && Object.keys(tool.policy).length > 0;
    if (!hasPolicy) {
      issues.push({
        id: generateIssueId(),
        severity: VALIDATION_SEVERITY.BLOCKER,
        category: VALIDATION_CATEGORY.POLICY,
        title: `Tool "${tool.name || 'Unknown'}" missing policy`,
        context: `Required for export`,
        chatPrompt: `The tool "${tool.name}" has no policy defined. Please configure the guardrails for this tool.`,
        triggeredBy: { type: 'full_validation', timestamp: new Date().toISOString() },
        relatedIds: [tool.id || tool.name]
      });
    }
  });

  // Check all intents have examples
  (skill.intents?.supported || []).forEach(intent => {
    if (!intent?.examples || intent.examples.length === 0) {
      issues.push({
        id: generateIssueId(),
        severity: VALIDATION_SEVERITY.WARNING,
        category: VALIDATION_CATEGORY.INTENTS,
        title: `Intent "${intent.name || 'Unknown'}" needs examples`,
        context: `No example utterances`,
        chatPrompt: `The intent "${intent.name}" has no examples. Please add example utterances.`,
        triggeredBy: { type: 'full_validation', timestamp: new Date().toISOString() },
        relatedIds: [intent.id || intent.name]
      });
    }
  });

  // Check problem statement exists
  if (!skill.problem?.statement || skill.problem.statement.length < 10) {
    issues.push({
      id: generateIssueId(),
      severity: VALIDATION_SEVERITY.BLOCKER,
      category: VALIDATION_CATEGORY.SCENARIOS,
      title: `Problem statement missing`,
      context: `Required to define skill scope`,
      chatPrompt: `The skill doesn't have a problem statement defined. Please describe the problem this skill is meant to solve.`,
      triggeredBy: { type: 'full_validation', timestamp: new Date().toISOString() },
      relatedIds: []
    });
  }

  return issues;
}

/**
 * Check if an existing issue is still relevant given current skill state
 * Returns true if issue should be kept, false if it should be removed
 */
export function isIssueStillRelevant(issue, skill) {
  const title = issue.title || '';
  const category = issue.category;
  const triggeredBy = issue.triggeredBy || {};

  // Tool missing policy - check if tool now has policy
  if (title.includes('missing policy')) {
    const toolNameMatch = title.match(/Tool "([^"]+)" missing policy/);
    if (toolNameMatch) {
      const toolName = toolNameMatch[1];
      const tool = (skill.tools || []).find(t => t.name === toolName);
      // If tool was deleted, issue is no longer relevant
      if (!tool) {
        return false;
      }
      // If tool has any policy configuration, consider it resolved
      // Check for: policy.allowed, policy.requires_approval, or any non-empty policy object
      if (tool.policy) {
        const hasAllowed = tool.policy.allowed !== undefined;
        const hasApproval = tool.policy.requires_approval !== undefined;
        const hasConditions = tool.policy.conditions && tool.policy.conditions.length > 0;
        const hasAnyPolicyKey = Object.keys(tool.policy).length > 0;

        if (hasAllowed || hasApproval || hasConditions || hasAnyPolicyKey) {
          return false;
        }
      }
    }
  }

  // Add mock data for tool - check if tool now has mocks
  if (title.includes('Add mock data for')) {
    const toolNameMatch = title.match(/Add mock data for "([^"]+)"/);
    if (toolNameMatch) {
      const toolName = toolNameMatch[1];
      const tool = (skill.tools || []).find(t => t.name === toolName);
      // If tool has mock examples now, issue is no longer relevant
      if (tool?.mock?.examples && tool.mock.examples.length > 0) {
        return false;
      }
      // If tool was deleted, issue is no longer relevant
      if (!tool) {
        return false;
      }
    }
  }

  // Intent needs examples - check if intent now has examples
  if (title.includes('needs examples')) {
    const intentNameMatch = title.match(/Intent "([^"]+)" needs examples/);
    if (intentNameMatch) {
      const intentName = intentNameMatch[1];
      const intent = (skill.intents?.supported || []).find(i => i.name === intentName);
      // If intent has examples now, issue is no longer relevant
      if (intent?.examples && intent.examples.length > 0) {
        return false;
      }
      // If intent was deleted, issue is no longer relevant
      if (!intent) {
        return false;
      }
    }
  }

  // Review intents for scenario - check if scenario was deleted
  if (title.includes('Review intents for')) {
    const scenarioNameMatch = title.match(/Review intents for "([^"]+)"/);
    if (scenarioNameMatch) {
      const scenarioName = scenarioNameMatch[1];
      const scenario = (skill.scenarios || []).find(s => s.title === scenarioName);
      // If scenario was deleted, issue is no longer relevant
      if (!scenario) {
        return false;
      }
    }
  }

  // Scenario may need new tools - check if scenario was deleted
  if (title.includes('Scenario may need new tools')) {
    const triggeredScenarioId = triggeredBy.id;
    if (triggeredScenarioId) {
      const scenario = (skill.scenarios || []).find(s =>
        s.id === triggeredScenarioId || s.title === triggeredScenarioId
      );
      if (!scenario) {
        return false;
      }
    }
  }

  // Review examples for intent - check if intent was deleted
  if (title.includes('Review examples for')) {
    const intentNameMatch = title.match(/Review examples for "([^"]+)"/);
    if (intentNameMatch) {
      const intentName = intentNameMatch[1];
      const intent = (skill.intents?.supported || []).find(i => i.name === intentName);
      if (!intent) {
        return false;
      }
    }
  }

  // Update mocks for tool - check if tool was deleted or inputs unchanged
  if (title.includes('Update mocks for')) {
    const toolNameMatch = title.match(/Update mocks for "([^"]+)"/);
    if (toolNameMatch) {
      const toolName = toolNameMatch[1];
      const tool = (skill.tools || []).find(t => t.name === toolName);
      if (!tool) {
        return false;
      }
    }
  }

  // Problem statement missing - check if problem now exists
  if (title === 'Problem statement missing') {
    if (skill.problem?.statement && skill.problem.statement.length >= 10) {
      return false;
    }
  }

  // Policy guardrails updated - info messages auto-expire (keep for limited time)
  if (title === 'Policy guardrails updated') {
    const createdAt = new Date(issue.createdAt || triggeredBy.timestamp);
    const now = new Date();
    const hoursSinceCreated = (now - createdAt) / (1000 * 60 * 60);
    // Auto-expire info messages after 1 hour
    if (hoursSinceCreated > 1) {
      return false;
    }
  }

  // Default: keep the issue
  return true;
}

export default { runValidation, runFullValidation, isIssueStillRelevant, VALIDATION_SEVERITY, VALIDATION_CATEGORY };
