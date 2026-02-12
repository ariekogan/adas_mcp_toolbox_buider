/**
 * Shared test fixtures for validator tests.
 * makeValidSkill() returns a minimal skill that passes all 5 validation stages.
 * Use spread + override to create broken variants for negative tests.
 */

/**
 * Returns a fresh deep-copy of a minimal valid skill.
 * @returns {import('../../src/types/DraftSkill.js').DraftSkill}
 */
export function makeValidSkill() {
  return structuredClone({
    id: 'test-skill',
    name: 'Test Skill',
    phase: 'TOOL_DEFINITION',
    version: '1.0.0',

    problem: {
      statement: 'Customers need help with order status inquiries and basic support.',
      context: 'E-commerce platform with 10k daily orders.',
      goals: ['Resolve order inquiries quickly', 'Reduce support queue time'],
    },

    scenarios: [
      {
        id: 'order-status',
        title: 'Check order status',
        description: 'Customer asks where their order is.',
        steps: ['Look up order', 'Return status'],
        expected_outcome: 'Customer gets their order status.',
      },
    ],

    role: {
      name: 'Support Agent',
      persona: 'You are a helpful customer support agent for an e-commerce platform.',
      goals: ['Resolve queries quickly'],
      limitations: ['Cannot process refunds over $500'],
      communication_style: {
        tone: 'casual',
        verbosity: 'concise',
      },
    },

    intents: {
      supported: [
        {
          id: 'order_status',
          description: 'Customer asking about order status',
          examples: ['Where is my order?', 'Track my package'],
          maps_to_workflow: 'order_tracking_flow',
        },
      ],
      thresholds: { accept: 0.85, clarify: 0.6, reject: 0.4 },
      out_of_domain: { action: 'reject', message: 'I can only help with orders.' },
    },

    tools: [
      {
        id: 'tool-orders-get',
        name: 'orders.order.get',
        description: 'Get order details by order ID',
        inputs: [
          { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        ],
        output: { type: 'object', description: 'Order details' },
        source: { type: 'mcp_bridge', connection_id: 'orders-mcp' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples' },
        security: { classification: 'pii_read' },
      },
    ],

    policy: {
      guardrails: {
        never: ['Share other customers information'],
        always: ['Verify order details before responding'],
      },
      workflows: [
        {
          id: 'order_tracking_flow',
          name: 'Order Tracking',
          trigger: 'order_status',
          steps: ['orders.order.get'],
          required: true,
          on_deviation: 'warn',
        },
      ],
      approvals: [],
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      rv2: {
        max_iterations: 8,
        iteration_timeout_ms: 30000,
        allow_parallel_tools: false,
        on_max_iterations: 'fail',
      },
      hlr: {
        enabled: true,
        critic: { enabled: false, strictness: 'medium' },
        reflection: { enabled: false, depth: 'shallow' },
      },
      autonomy: { level: 'autonomous' },
    },

    access_policy: {
      rules: [
        { tools: ['*'], effect: 'allow' },
      ],
    },

    response_filters: [
      {
        id: 'strip-pii',
        strip_fields: ['customer.ssn', 'customer.payment_methods'],
      },
    ],
  });
}
