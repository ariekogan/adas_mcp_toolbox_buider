/**
 * Help Documentation for Skill Builder sections
 *
 * These docs are injected into explain requests so the LLM can
 * provide context-aware explanations based on the current skill.
 */

export const HELP_DOCS = {
  // === OVERVIEW TAB ===
  'problem statement': {
    title: 'Problem Statement',
    description: `The problem statement defines WHY this skill exists and WHAT problem it solves.`,
    purpose: `It anchors the entire skill design - every intent, tool, and policy should trace back to solving this problem.`,
    bestPractices: [
      'Be specific about the domain (e.g., "customer support for cosmetics" not just "support")',
      'Include the target users (e.g., "customers", "employees", "partners")',
      'Describe the pain points being addressed',
      'Keep it to 2-3 sentences'
    ],
    examples: [
      'Handle customer inquiries about order status, returns, and product information for an e-commerce cosmetics brand.',
      'Automate IT helpdesk ticket triage and provide first-level support for common issues like password resets and VPN setup.'
    ]
  },

  'role and persona': {
    title: 'Role & Persona',
    description: `The role defines WHO the AI agent is - its identity, personality, and behavioral guidelines.`,
    purpose: `It shapes how the agent communicates, what tone it uses, and how it presents itself to users.`,
    bestPractices: [
      'Give the agent a clear role name (e.g., "Customer Support Specialist", "IT Help Assistant")',
      'Define personality traits that match your brand',
      'Set communication style (formal/casual, concise/detailed)',
      'Include limitations the agent should acknowledge'
    ],
    fields: {
      name: 'The agent\'s role title or name',
      persona: 'Detailed description of personality, expertise, and behavior',
      goals: 'What the agent strives to achieve in interactions',
      limitations: 'What the agent should NOT do or claim to do'
    }
  },

  'scenarios': {
    title: 'Scenarios',
    description: `Scenarios are realistic user journeys that the skill should handle.`,
    purpose: `They help validate that all necessary intents, tools, and policies are defined by walking through real use cases.`,
    bestPractices: [
      'Create 3-5 diverse scenarios covering common cases',
      'Include at least one "edge case" or unusual situation',
      'Write step-by-step flows showing user-agent interactions',
      'Define expected outcomes for each scenario'
    ],
    examples: [
      'Customer asks about order status -> Agent retrieves order -> Provides tracking info',
      'User requests refund for damaged item -> Agent verifies order -> Initiates return process -> Confirms with customer'
    ]
  },

  // === INTENTS TAB ===
  'intents': {
    title: 'Intents',
    description: `Intents represent what users are trying to accomplish when they interact with the agent.`,
    purpose: `They map user messages to specific actions or workflows the agent should execute.`,
    bestPractices: [
      'Use clear, action-oriented descriptions (e.g., "Check order status" not "Order stuff")',
      'Provide 3-5 example phrases per intent',
      'Consider variations in how users might express the same intent',
      'Link intents to workflows when they require multi-step processes'
    ],
    fields: {
      description: 'What the user is trying to do',
      examples: 'Sample phrases that indicate this intent',
      maps_to_workflow: 'Optional workflow to execute when intent is detected',
      entities: 'Data to extract from the user message (e.g., order_id, product_name)'
    }
  },

  'intent thresholds': {
    title: 'Intent Thresholds',
    description: `Thresholds control how confident the agent must be before acting on a detected intent.`,
    purpose: `They balance between being responsive (lower thresholds) and being accurate (higher thresholds).`,
    fields: {
      accept: 'Confidence level to proceed (default 0.8 = 80%). If intent confidence >= this, execute it.',
      clarify: 'Confidence level to ask for clarification (default 0.5). Between clarify and accept, agent asks user to confirm.',
      reject: 'Below this level, treat as out-of-domain or unclear.'
    },
    recommendations: {
      'High-stakes actions': 'Use higher thresholds (0.85-0.95) for actions like payments, deletions, or modifications',
      'Informational queries': 'Lower thresholds (0.7-0.8) are fine for read-only operations',
      'New skills': 'Start with higher thresholds and lower them as you gain confidence in the model'
    }
  },

  'out of domain handling': {
    title: 'Out of Domain Handling',
    description: `Defines how the agent responds when a user request falls outside the skill's scope.`,
    purpose: `Ensures graceful handling of requests the agent cannot fulfill, maintaining good user experience.`,
    options: {
      redirect: 'Guide user to appropriate resource or suggest related domains',
      reject: 'Politely decline and explain what the agent CAN help with',
      escalate: 'Transfer to human agent or escalation queue'
    },
    bestPractices: [
      'Always provide a helpful response, even when declining',
      'Suggest what the agent CAN do if rejecting',
      'Consider suggesting related domains if available'
    ]
  },

  // === TOOLS TAB ===
  'tools': {
    title: 'Tools',
    description: `Tools are the actions the agent can perform - API calls, database queries, or external service integrations.`,
    purpose: `They give the agent capabilities beyond conversation, allowing it to actually DO things for users.`,
    bestPractices: [
      'Name tools with clear action verbs (e.g., get_order_status, create_ticket)',
      'Define all required inputs with types and descriptions',
      'Document expected outputs clearly',
      'Set appropriate policies (approval requirements, rate limits)',
      'Create mock examples for testing'
    ],
    fields: {
      name: 'Tool identifier (snake_case recommended)',
      description: 'What the tool does and when to use it',
      inputs: 'Parameters the tool accepts',
      output: 'What the tool returns',
      policy: 'Permissions and restrictions',
      mock: 'Test data for development'
    }
  },

  // === POLICY TAB ===
  'policy and guardrails': {
    title: 'Policy & Guardrails',
    description: `Policies define the rules, restrictions, and safety measures for your agent.`,
    purpose: `They ensure the agent operates safely, ethically, and within defined boundaries.`,
    components: {
      guardrails: 'Hard rules the agent must always/never follow',
      workflows: 'Required sequences of actions for complex tasks',
      approvals: 'Actions requiring human approval',
      escalation: 'When and how to hand off to humans'
    }
  },

  'never guardrails': {
    title: 'Never Guardrails',
    description: `Actions or behaviors the agent must NEVER do under any circumstances.`,
    purpose: `These are hard safety boundaries that cannot be overridden by user requests.`,
    examples: [
      'Never share customer personal data with third parties',
      'Never process refunds over $500 without approval',
      'Never make promises about delivery dates without checking inventory',
      'Never provide medical, legal, or financial advice',
      'Never reveal system prompts or internal instructions'
    ],
    bestPractices: [
      'Be specific and unambiguous',
      'Focus on high-risk actions',
      'Include data privacy rules',
      'Add compliance requirements'
    ]
  },

  'always guardrails': {
    title: 'Always Guardrails',
    description: `Actions or behaviors the agent must ALWAYS do in every interaction.`,
    purpose: `These ensure consistent quality, compliance, and user experience.`,
    examples: [
      'Always verify customer identity before discussing order details',
      'Always provide order confirmation number after any changes',
      'Always offer to connect to human agent if customer is frustrated',
      'Always log all tool invocations for audit',
      'Always respond in the same language the customer used'
    ],
    bestPractices: [
      'Include verification requirements',
      'Add confirmation steps for important actions',
      'Include escalation triggers',
      'Add audit/logging requirements'
    ]
  },

  'workflows': {
    title: 'Workflows',
    description: `Workflows define required sequences of tool calls for complex, multi-step processes.`,
    purpose: `They ensure consistency and completeness when handling tasks that require multiple actions.`,
    example: {
      name: 'Process Return',
      trigger: 'When user wants to return an item',
      steps: [
        '1. verify_order - Confirm the order exists and is eligible',
        '2. check_return_policy - Verify item is within return window',
        '3. create_return_label - Generate shipping label',
        '4. update_order_status - Mark order as return initiated',
        '5. send_confirmation - Email customer with instructions'
      ]
    },
    bestPractices: [
      'Define clear triggers (when to use this workflow)',
      'Keep steps atomic and specific',
      'Include error handling (what if a step fails)',
      'Set deviation policy (warn, block, or ask user)'
    ]
  },

  'approval rules': {
    title: 'Approval Rules',
    description: `Rules that require human approval before the agent can proceed with certain actions.`,
    purpose: `They add a human-in-the-loop for high-stakes, risky, or sensitive operations.`,
    example: {
      tool: 'process_refund',
      conditions: [
        'When amount > $100',
        'When customer has had 3+ refunds this month',
        'When item is marked as final sale'
      ],
      approver: 'support-manager-queue'
    },
    bestPractices: [
      'Base conditions on risk and business rules',
      'Define clear approval queues/roles',
      'Set reasonable thresholds (not too low to bottleneck)',
      'Include bypass rules for trusted users if needed'
    ]
  },

  'escalation': {
    title: 'Escalation',
    description: `Defines when and how the agent should hand off to human agents.`,
    purpose: `Ensures complex issues, frustrated customers, or edge cases reach human support.`,
    triggers: [
      'Customer explicitly requests human agent',
      'Sentiment analysis detects high frustration',
      'Issue is outside defined intents',
      'Maximum conversation turns reached without resolution',
      'High-value customer flag'
    ],
    configuration: {
      enabled: 'Whether escalation is active',
      target: 'Where to route (queue name, email, webhook)',
      conditions: 'Rules for automatic escalation'
    }
  },

  // === ENGINE TAB ===
  'engine settings': {
    title: 'Engine Settings',
    description: `Engine settings control how the AI agent processes requests and makes decisions.`,
    purpose: `They let you tune the agent's behavior, autonomy level, and reasoning capabilities.`,
    components: {
      autonomy: 'How independently the agent can act',
      rv2: 'Core execution engine settings',
      hlr: 'High-level reasoning capabilities'
    }
  },

  'autonomy level': {
    title: 'Autonomy Level',
    description: `Controls how independently the agent can act without human oversight.`,
    purpose: `Balances efficiency (autonomous) against safety and control (restricted).`,
    levels: {
      autonomous: 'Agent executes tools freely within policy. Best for low-risk, high-volume tasks.',
      supervised: 'Agent proposes actions, waits for approval on sensitive operations. Good balance for most skills.',
      restricted: 'Agent requires approval for most tool executions. Best for high-stakes or new deployments.'
    },
    recommendations: {
      'Customer support queries': 'supervised - most queries are safe, but some need oversight',
      'Data modifications': 'restricted - changes should be reviewed',
      'Read-only lookups': 'autonomous - no risk of harmful actions',
      'Financial transactions': 'restricted - high stakes require human approval'
    }
  },

  'RV2 engine': {
    title: 'RV2 Engine',
    description: `RV2 (Reasoning Version 2) is the core execution loop that processes user requests.`,
    purpose: `It controls how many steps the agent can take and how long it can run.`,
    settings: {
      max_iterations: 'Maximum reasoning steps (default: 10). Higher = more complex tasks possible, but slower.',
      iteration_timeout_ms: 'Timeout per step in milliseconds (default: 30000). Prevents hung operations.',
      allow_parallel_tools: 'Whether tools can run simultaneously (default: false). Enable for independent operations.',
      on_max_iterations: 'What to do when limit reached: escalate, fail, or ask_user.'
    },
    recommendations: {
      'Simple Q&A skills': 'max_iterations: 5, timeout: 15000',
      'Multi-step workflows': 'max_iterations: 15, timeout: 45000',
      'Complex research tasks': 'max_iterations: 20+, enable parallel tools'
    }
  },

  'HLR high-level reasoning': {
    title: 'HLR (High-Level Reasoning)',
    description: `HLR enables advanced reasoning capabilities: self-critique, reflection, and replanning.`,
    purpose: `It makes the agent smarter by reviewing its own work and adjusting approach when needed.`,
    components: {
      critic: 'Reviews agent actions periodically to catch mistakes or suboptimal paths',
      reflection: 'Agent thinks about what it learned and how to improve',
      replanning: 'Allows agent to change strategy if initial approach isn\'t working'
    },
    settings: {
      enabled: 'Master switch for HLR (default: true)',
      'critic.check_interval': 'Review every N turns (default: 3)',
      'critic.strictness': 'How critical the review is: low, medium, high',
      'reflection.depth': 'How deep to reflect: shallow (quick), medium, deep (thorough)',
      'replanning.max_replans': 'Maximum strategy changes allowed (default: 2)'
    },
    recommendations: {
      'Simple skills': 'Enable with low strictness, shallow reflection',
      'Complex multi-step': 'Enable with medium strictness, allow 2-3 replans',
      'Critical operations': 'Enable with high strictness, deep reflection',
      'High-volume/low-latency': 'Consider disabling to reduce processing time'
    }
  },

  'finalization gate': {
    title: 'Finalization Gate',
    description: `The finalization gate validates agent responses before they are sent to the user.`,
    purpose: `It ensures response quality by checking that outputs meet defined contracts and standards.`,
    settings: {
      enabled: 'Whether to validate responses before sending (default: true)',
      max_retries: 'How many times to retry if validation fails (default: 2)'
    },
    bestPractices: [
      'Enable for customer-facing skills to ensure quality',
      'Set max_retries based on acceptable latency',
      'Define output contracts for structured responses',
      'Disable for internal/development skills if speed is critical'
    ],
    recommendations: {
      'Customer support': 'Enable with 2 retries for quality assurance',
      'Internal tools': 'Disable or set 1 retry for faster responses',
      'High-stakes operations': 'Enable with 3 retries for maximum reliability'
    }
  },

  'internal error handling': {
    title: 'Internal Error Handling',
    description: `Internal error handling manages situations where the agent cannot complete a task due to missing tools, loops, or other system issues.`,
    purpose: `It ensures graceful degradation when automation fails, providing users with clear explanations, manual workarounds, and escalation paths instead of cryptic errors.`,
    components: {
      tool_not_found: 'Handles cases where a required tool is not available or registered',
      resolution_mode: 'A restricted execution mode that generates human guidance instead of continuing automation',
      loop_detection: 'Detects when the agent is stuck in an infinite loop calling the same tools'
    },
    settings: {
      enabled: 'Master switch for internal error handling (default: true)',
      'tool_not_found.enter_resolution_after': 'Number of failures before entering RESOLUTION mode (default: 1)',
      'tool_not_found.retryable': 'Whether tool-not-found errors can be retried (default: false)',
      'resolution.max_iterations': 'Max iterations allowed in RESOLUTION mode (default: 1)',
      'resolution.allowed_capabilities': 'Capabilities allowed during resolution (default: read, search, document_output)',
      'loop_detection.enabled': 'Whether to detect infinite loops (default: true)',
      'loop_detection.identical_call_threshold': 'Identical tool calls before flagging as loop (default: 2)'
    },
    bestPractices: [
      'Keep enabled to ensure graceful failure handling',
      'Use low enter_resolution_after (1) for fast detection of missing tools',
      'Enable loop detection to prevent runaway iterations',
      'Review resolution artifacts to identify missing capabilities'
    ],
    recommendations: {
      'Production skills': 'Enable all features with default settings',
      'Development/testing': 'May increase thresholds to allow more experimentation',
      'Critical operations': 'Keep strict settings (threshold: 1) for immediate error handling'
    }
  },

  // === SECURITY TAB ===
  'security': {
    title: 'Identity & Access Control',
    description: `Security configuration protects sensitive data and operations by controlling who can call which tools and what data they can see.`,
    purpose: `It ensures that external users (customers, partners) cannot access sensitive operations without proving their identity, and that PII is masked until identity verification is completed.`,
    components: {
      'tool classification': 'Categorize each tool by risk level (public, pii_read, pii_write, financial, destructive)',
      'access policy': 'Rules that gate tool access based on provenance and earned grants',
      'grant mappings': 'Auto-issue context grants from tool responses (e.g., customer_id after identity search)',
      'response filters': 'Strip or mask sensitive fields from tool responses based on verification level',
      'context propagation': 'Control which grants are inherited when handing off to another skill'
    },
    bestPractices: [
      'Start by classifying every tool — this drives all other security decisions',
      'High-risk tools (pii_write, financial, destructive) MUST have access policies',
      'Use grant mappings to connect identity verification to access decisions',
      'Apply response filters to mask PII until the user has verified their identity',
      'Always propagate customer_id and assurance_level to child skills'
    ]
  },

  'tool classification': {
    title: 'Tool Security Classification',
    description: `Every tool should be classified by the sensitivity of the data it accesses or the actions it performs.`,
    purpose: `Classifications drive automatic security enforcement — high-risk tools get access policies, PII tools get response filters.`,
    levels: {
      'public': 'No sensitive data, no side effects. Examples: search FAQ, get store hours, list product categories',
      'pii_read': 'Reads personal data (names, emails, addresses, orders). Examples: get order details, view customer profile',
      'pii_write': 'Modifies personal data. Examples: update shipping address, change email, update profile',
      'financial': 'Handles money or financial data. Examples: process refund, charge card, view payment history',
      'destructive': 'Permanent or high-impact actions. Examples: cancel order, delete account, close ticket permanently'
    },
    bestPractices: [
      'When in doubt, classify higher rather than lower',
      'A tool that reads AND writes PII should be classified as pii_write',
      'Financial tools that also write PII should be classified as financial (higher risk wins)',
      'Set data_owner_field to the field name that identifies whose data this is (e.g., customer_id)',
      'Identity/verification tools should be classified as public — they need to be accessible before verification'
    ]
  },

  'access policy': {
    title: 'Access Policy Rules',
    description: `Access policies are pre-tool gates that check who is calling and what proof they have before allowing a tool to execute.`,
    purpose: `They enforce the principle of least privilege — tools are only accessible when the caller has earned the right through identity verification.`,
    components: {
      'tools': 'Which tools this rule applies to (exact name or "*" for all)',
      'when': 'Provenance conditions — origin_type (channel/trigger/skill_handoff) or root_origin_type',
      'require': 'Grant requirements — has_grant (grant must exist) and grant_value (grant must have specific value)',
      'effect': 'What happens: allow (proceed), deny (block), constrain (proceed with injected args and/or response filtering)'
    },
    bestPractices: [
      'Rules are evaluated in order — first match wins',
      'Put specific rules before general ones (e.g., cancel before all-orders)',
      'Use root_origin_type for trust decisions — even in skill handoffs, the ROOT origin matters',
      'Always allow identity/verification tools — they must be accessible before verification',
      'Use constrain with inject_args to force customer_id from grants (prevents cross-customer access)',
      'Always give trigger-origin and internal tools full access (first rule: tools=["*"], when: origin_type="trigger", effect="allow")'
    ],
    examples: [
      'Order lookup: require customer_id grant, inject it, apply PII filter',
      'Address change: require customer_id + assurance_level L1+',
      'Order cancellation: require customer_id + assurance_level L2'
    ]
  },

  'grant mappings': {
    title: 'Grant Mappings',
    description: `Grant mappings automatically issue context grants from tool responses. When a tool returns data, the platform extracts values and stores them as grants on the job.`,
    purpose: `They connect the identity verification flow to access decisions. For example: identity search → customer_id grant → order lookup becomes possible.`,
    fields: {
      'tool': 'Which tool triggers this mapping (e.g., "identity.candidates.search")',
      'on_success': 'If true, only fires when tool returns ok !== false',
      'grants[].key': 'The grant key to issue (e.g., "ecom.customer_id")',
      'grants[].value_from': 'JSONPath to extract from tool response (e.g., "$.candidates[0].customer_id")',
      'grants[].condition': 'Optional JSONPath condition (e.g., "$.candidates.length == 1" — only issue if exactly one match)',
      'grants[].ttl_seconds': 'Optional time-to-live — grant expires after this many seconds'
    },
    bestPractices: [
      'Use conditions to prevent ambiguous grants (e.g., only issue customer_id on single-match search)',
      'Set TTL on session tokens and temporary grants',
      'Grant keys should use dot notation namespaces (e.g., ecom.customer_id, ecom.assurance_level)',
      'Avoid the "p.*" namespace — it is reserved for platform-only grants'
    ]
  },

  'response filters': {
    title: 'Response Filters',
    description: `Response filters strip or mask sensitive fields from tool responses based on what grants the user has earned.`,
    purpose: `They ensure that even if a tool returns full data, the agent only sees what the caller's verification level allows. This is defense-in-depth.`,
    fields: {
      'id': 'Unique identifier for this filter (e.g., "pii_mask_below_l1")',
      'unless_grant': 'Skip this filter if the caller has this grant (e.g., "ecom.assurance_level")',
      'unless_grant_value': 'Skip if grant has specific value (key + values array)',
      'strip_fields': 'JSONPath fields to completely remove (e.g., "$.customer.email")',
      'mask_fields': 'JSONPath fields to replace with mask string (e.g., field: "$.customer.name", mask: "*** (verification required)")',
      'tools': 'Which tools this filter applies to (empty = all tools)'
    },
    bestPractices: [
      'Strip highly sensitive fields (email, phone, SSN) — dont just mask them',
      'Mask less sensitive fields (name) so the agent knows the data exists but cant see it',
      'Use unless_grant to skip the filter once the user has verified their identity',
      'Apply filters to all pii_read and pii_write tools',
      'Filters never modify the original response — they operate on a deep clone'
    ]
  }
};

/**
 * Get help documentation for a topic
 * @param {string} topic - The topic to get help for
 * @returns {object|null} - Help documentation or null if not found
 */
export function getHelpDoc(topic) {
  const normalizedTopic = topic.toLowerCase().trim();

  // Direct match (case-insensitive)
  for (const [key, doc] of Object.entries(HELP_DOCS)) {
    if (key.toLowerCase() === normalizedTopic) {
      return doc;
    }
  }

  // Partial match (case-insensitive)
  for (const [key, doc] of Object.entries(HELP_DOCS)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedTopic.includes(normalizedKey) || normalizedKey.includes(normalizedTopic)) {
      return doc;
    }
  }

  return null;
}

/**
 * Format help doc for injection into LLM prompt
 * @param {object} doc - Help documentation object
 * @returns {string} - Formatted documentation string
 */
export function formatHelpDoc(doc) {
  let formatted = `## ${doc.title}\n\n`;
  formatted += `**What it is:** ${doc.description}\n\n`;
  formatted += `**Purpose:** ${doc.purpose}\n\n`;

  if (doc.bestPractices) {
    formatted += `**Best Practices:**\n`;
    doc.bestPractices.forEach(bp => {
      formatted += `- ${bp}\n`;
    });
    formatted += '\n';
  }

  if (doc.fields) {
    formatted += `**Fields:**\n`;
    for (const [field, desc] of Object.entries(doc.fields)) {
      formatted += `- **${field}**: ${desc}\n`;
    }
    formatted += '\n';
  }

  if (doc.settings) {
    formatted += `**Settings:**\n`;
    for (const [setting, desc] of Object.entries(doc.settings)) {
      formatted += `- **${setting}**: ${desc}\n`;
    }
    formatted += '\n';
  }

  if (doc.levels) {
    formatted += `**Levels:**\n`;
    for (const [level, desc] of Object.entries(doc.levels)) {
      formatted += `- **${level}**: ${desc}\n`;
    }
    formatted += '\n';
  }

  if (doc.components) {
    formatted += `**Components:**\n`;
    for (const [comp, desc] of Object.entries(doc.components)) {
      formatted += `- **${comp}**: ${desc}\n`;
    }
    formatted += '\n';
  }

  if (doc.recommendations) {
    formatted += `**Recommendations:**\n`;
    for (const [scenario, rec] of Object.entries(doc.recommendations)) {
      formatted += `- ${scenario}: ${rec}\n`;
    }
    formatted += '\n';
  }

  if (doc.examples) {
    if (Array.isArray(doc.examples)) {
      formatted += `**Examples:**\n`;
      doc.examples.forEach(ex => {
        formatted += `- ${ex}\n`;
      });
    } else {
      formatted += `**Example:**\n`;
      formatted += `${JSON.stringify(doc.example, null, 2)}\n`;
    }
    formatted += '\n';
  }

  return formatted;
}
