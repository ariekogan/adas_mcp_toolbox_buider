/**
 * A-Team Examples API routes
 *
 * Serves complete, validated examples that external agents can study
 * and use as templates for building their own A-Team skills and solutions.
 *
 * GET /spec/examples                — Index of available examples
 * GET /spec/examples/skill          — Complete order support skill
 * GET /spec/examples/connector      — Standard stdio MCP connector
 * GET /spec/examples/connector-ui   — UI-capable HTTP connector
 * GET /spec/examples/solution       — Full multi-skill solution
 */

import { Router } from 'express';

const router = Router();
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400' };

// ═══════════════════════════════════════════════════════════════════════════
// BUILD EXAMPLES AT MODULE LOAD (static data — compute once)
// ═══════════════════════════════════════════════════════════════════════════

export const EXAMPLE_SKILL = buildExampleSkill();
export const EXAMPLE_CONNECTOR = buildExampleConnector();
export const EXAMPLE_CONNECTOR_UI = buildExampleConnectorUI();
export const EXAMPLE_SOLUTION = buildExampleSolution();

const INDEX = {
  description: 'Complete, runnable examples for building A-Team skills and solutions. Each example passes validation.',
  examples: {
    '/spec/examples/skill': {
      method: 'GET',
      description: 'Complete "Order Support Agent" skill — passes all 5 validation stages',
    },
    '/spec/examples/connector': {
      method: 'GET',
      description: 'Standard stdio MCP connector for order management',
    },
    '/spec/examples/connector-ui': {
      method: 'GET',
      description: 'UI-capable connector with dashboard plugins (ui_capable: true)',
    },
    '/spec/examples/solution': {
      method: 'GET',
      description: 'Full "E-Commerce Customer Service" solution — 3 skills, grants, handoffs, routing',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', (_req, res) => res.set(CACHE_HEADERS).json(INDEX));
router.get('/skill', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_SKILL));
router.get('/connector', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_CONNECTOR));
router.get('/connector-ui', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_CONNECTOR_UI));
router.get('/solution', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_SOLUTION));

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildExampleSkill() {
  return {
    _note: 'This example passes all 5 validation stages (schema, references, completeness, security, export readiness). Use POST /validate/skill to verify.',

    id: 'order-support',
    name: 'Order Support Agent',
    description: 'Handles customer order inquiries — status checks, order lookups, and issue escalation for an e-commerce platform.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['orders-mcp'],

    // ── Problem ──
    problem: {
      statement: 'Customers need quick, accurate answers about their orders without waiting for a human support agent.',
      context: 'E-commerce platform processing 10,000+ daily orders across multiple fulfillment centers.',
      goals: [
        'Resolve order status inquiries in under 30 seconds',
        'Reduce human support queue by handling routine order questions',
        'Escalate complex issues (refunds, disputes) to human agents',
      ],
    },

    // ── Scenarios ──
    scenarios: [
      {
        id: 'check-order-status',
        title: 'Customer checks order status',
        description: 'A customer provides their order ID and wants to know where their package is.',
        steps: [
          'Customer asks "Where is my order #12345?"',
          'Agent extracts order_id from message',
          'Agent calls orders.order.get to fetch order details',
          'Agent responds with order status, tracking info, and estimated delivery',
        ],
        expected_outcome: 'Customer receives current order status with tracking link.',
      },
      {
        id: 'search-by-email',
        title: 'Customer searches orders by email',
        description: 'A customer wants to find their recent orders using their email address.',
        steps: [
          'Customer says "I need to find my recent orders, my email is jane@example.com"',
          'Agent extracts email from message',
          'Agent calls orders.order.search to find matching orders',
          'Agent presents a summary list of matching orders',
        ],
        expected_outcome: 'Customer sees a list of their recent orders with status for each.',
      },
      {
        id: 'escalate-refund',
        title: 'Customer requests a refund',
        description: 'A customer wants a refund — agent cannot process refunds, must escalate.',
        steps: [
          'Customer says "I want a refund for order #12345"',
          'Agent looks up the order to verify it exists',
          'Agent explains that refund requests require human review',
          'Agent escalates to the returns support queue',
        ],
        expected_outcome: 'Customer is informed and the case is escalated to a human agent.',
      },
    ],

    // ── Role ──
    role: {
      name: 'Order Support Specialist',
      persona: 'You are a helpful, efficient order support specialist for an e-commerce platform. You quickly resolve order inquiries using available tools. You are transparent about what you can and cannot do — if a request requires human intervention (refunds, disputes, address changes), you escalate promptly rather than making promises you cannot keep.',
      goals: [
        'Answer order status questions accurately and quickly',
        'Help customers find their orders by ID or email',
        'Escalate complex issues to human agents when appropriate',
      ],
      limitations: [
        'Cannot process refunds or issue credits',
        'Cannot modify order details (address, items, payment)',
        'Cannot access payment or billing information',
      ],
      communication_style: {
        tone: 'casual',
        verbosity: 'concise',
      },
    },

    // ── Intents ──
    intents: {
      supported: [
        {
          id: 'check_order_status',
          description: 'Customer wants to know the status of a specific order',
          examples: [
            'Where is my order?',
            'What is the status of order #12345?',
            'Track my package',
            'Has my order shipped yet?',
            'When will my order arrive?',
          ],
          maps_to_workflow: 'order_lookup_flow',
          entities: [
            { name: 'order_id', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'search_orders',
          description: 'Customer wants to find orders by email or other criteria',
          examples: [
            'Find my orders',
            'I need to look up my recent orders',
            'Can you search for orders under jane@example.com?',
            'Show me all my orders from last month',
          ],
          maps_to_workflow: 'order_search_flow',
          entities: [
            { name: 'email', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'request_refund',
          description: 'Customer wants a refund or return — must be escalated',
          examples: [
            'I want a refund',
            'Can I return this item?',
            'I need my money back for order #12345',
            'This product is defective, I want a refund',
          ],
        },
      ],
      thresholds: { accept: 0.85, clarify: 0.6, reject: 0.4 },
      out_of_domain: {
        action: 'redirect',
        message: 'I can only help with order inquiries. Let me connect you with the right team.',
        suggest_domains: [],
      },
    },

    // ── Tools ──
    tools: [
      {
        id: 'tool-orders-get',
        id_status: 'permanent',
        name: 'orders.order.get',
        description: 'Retrieve full order details by order ID, including status, items, shipping info, and tracking.',
        inputs: [
          { name: 'order_id', type: 'string', required: true, description: 'The order ID to look up (e.g., "ORD-12345")' },
        ],
        output: {
          type: 'object',
          description: 'Complete order object with status, line_items, shipping_address, tracking, and timestamps',
        },
        source: { type: 'mcp_bridge', connection_id: 'orders-mcp', mcp_tool: 'order.get' },
        policy: { allowed: 'always' },
        mock: {
          enabled: true,
          mode: 'examples',
          examples: [
            {
              id: 'shipped-order',
              input: { order_id: 'ORD-12345' },
              output: {
                order_id: 'ORD-12345',
                status: 'shipped',
                customer_email: 'jane@example.com',
                items: [{ name: 'Wireless Mouse', qty: 1, price: 29.99 }],
                tracking: { carrier: 'UPS', tracking_number: '1Z999AA10123456784', url: 'https://ups.com/track?num=1Z999AA10123456784' },
                created_at: '2026-02-10T14:30:00Z',
                estimated_delivery: '2026-02-14',
              },
              description: 'A shipped order with tracking info',
            },
          ],
        },
        security: { classification: 'pii_read' },
      },
      {
        id: 'tool-orders-search',
        id_status: 'permanent',
        name: 'orders.order.search',
        description: 'Search orders by customer email, date range, or status. Returns a paginated list of order summaries.',
        inputs: [
          { name: 'email', type: 'string', required: false, description: 'Customer email to filter by' },
          { name: 'status', type: 'string', required: false, description: 'Order status filter (pending, shipped, delivered, cancelled)' },
          { name: 'limit', type: 'number', required: false, description: 'Max results to return (default: 10)' },
        ],
        output: {
          type: 'object',
          description: 'Paginated list of order summaries with order_id, status, total, and created_at',
        },
        source: { type: 'mcp_bridge', connection_id: 'orders-mcp', mcp_tool: 'order.search' },
        policy: { allowed: 'always' },
        mock: {
          enabled: true,
          mode: 'examples',
          examples: [
            {
              id: 'search-by-email',
              input: { email: 'jane@example.com' },
              output: {
                orders: [
                  { order_id: 'ORD-12345', status: 'shipped', total: 29.99, created_at: '2026-02-10T14:30:00Z' },
                  { order_id: 'ORD-12300', status: 'delivered', total: 59.98, created_at: '2026-02-05T09:15:00Z' },
                ],
                total_count: 2,
              },
              description: 'Search results for a customer email',
            },
          ],
        },
        security: { classification: 'pii_read' },
      },
      {
        id: 'tool-customers-lookup',
        id_status: 'permanent',
        name: 'orders.customer.lookup',
        description: 'Look up customer profile by email. Returns verified customer ID and basic profile.',
        inputs: [
          { name: 'email', type: 'string', required: true, description: 'Customer email address' },
        ],
        output: {
          type: 'object',
          description: 'Customer profile with customer_id, name, email, and account_status',
        },
        source: { type: 'mcp_bridge', connection_id: 'orders-mcp', mcp_tool: 'customer.lookup' },
        policy: { allowed: 'always' },
        mock: {
          enabled: true,
          mode: 'examples',
          examples: [
            {
              id: 'found-customer',
              input: { email: 'jane@example.com' },
              output: {
                customer_id: 'CUST-9876',
                name: 'Jane Doe',
                email: 'jane@example.com',
                account_status: 'active',
              },
              description: 'Customer found by email',
            },
          ],
        },
        security: { classification: 'pii_read' },
      },
    ],

    // ── Policy ──
    policy: {
      guardrails: {
        never: [
          'Process refunds or issue credits directly',
          'Share one customer\'s order information with another customer',
          'Reveal internal system IDs, database details, or API endpoints',
          'Make delivery promises beyond what tracking data shows',
        ],
        always: [
          'Verify order details before sharing with the customer',
          'Offer to escalate if the request is beyond your capabilities',
          'Include tracking links when available',
        ],
      },
      workflows: [
        {
          id: 'order_lookup_flow',
          name: 'Order Lookup',
          description: 'Look up a specific order by ID and present details to customer',
          trigger: 'check_order_status',
          steps: ['orders.order.get'],
          required: true,
          on_deviation: 'warn',
        },
        {
          id: 'order_search_flow',
          name: 'Order Search',
          description: 'Search for customer orders by email and present results',
          trigger: 'search_orders',
          steps: ['orders.customer.lookup', 'orders.order.search'],
          required: false,
          on_deviation: 'warn',
        },
      ],
      approvals: [],
      escalation: {
        enabled: true,
        conditions: ['Customer requests refund', 'Customer reports missing package after delivery'],
        target: 'returns-support',
      },
    },

    // ── Engine ──
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

    // ── Grant Mappings ──
    grant_mappings: [
      {
        tool: 'orders.customer.lookup',
        on_success: true,
        grants: [
          {
            key: 'ecom.customer_id',
            value_from: '$.customer_id',
            condition: '$.account_status == "active"',
            ttl_seconds: 3600,
          },
        ],
      },
    ],

    // ── Access Policy ──
    access_policy: {
      rules: [
        { tools: ['*'], effect: 'allow' },
      ],
    },

    // ── Response Filters ──
    response_filters: [
      {
        id: 'strip-sensitive-fields',
        strip_fields: ['customer.payment_methods', 'customer.ssn'],
        mask_fields: ['customer.email'],
      },
    ],

    // ── Triggers ──
    triggers: [
      {
        id: 'daily-order-summary',
        type: 'schedule',
        enabled: false,
        concurrency: 1,
        prompt: 'Generate a summary of all open support tickets related to orders from the last 24 hours.',
        every: 'P1D',
      },
    ],
  };
}

function buildExampleConnector() {
  return {
    _note: 'A standard stdio MCP connector. This is what A-Team Core manages as a child process.',

    _entry_point_resolution: {
      _note: 'command and args are OPTIONAL when deploying with mcp_store. The system auto-detects the entry point from uploaded files.',
      auto_detection_priority: [
        '1. package.json "main" field',
        '2. server.js',
        '3. index.js',
        '4. server.py → python3',
        '5. main.py → python3',
        '6. server.ts → npx tsx',
      ],
      explicit_override: 'You can always provide command + args to override auto-detection.',
    },

    _storage: {
      _note: 'A-Team Core automatically provides a DATA_DIR environment variable to every stdio connector. Use it to store persistent data (SQLite databases, files, etc.).',
      how_to_use: 'const DATA_DIR = process.env.DATA_DIR || "./data"; // A-Team Core auto-sets DATA_DIR per tenant+connector',
      resolves_to: '/tenants/<tenant>/connector-data/<connector-id>/',
      isolation: 'Each connector gets its own directory. Data is tenant-scoped and persisted across restarts.',
    },

    _runtime_compatibility: {
      _note: 'A-Team Core runs connectors on Node.js 22.x with full ESM support. The @modelcontextprotocol/sdk works great.',
      recommended_approach: 'Use the official @modelcontextprotocol/sdk with StdioServerTransport. This is the simplest and most reliable approach.',
      boilerplate: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-mcp",
  version: "1.0.0",
});

server.tool("my.tool", "Does something", { arg1: z.string() }, async ({ arg1 }) => {
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, arg1 }) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);`,
      package_json_note: 'Use "type": "module" in package.json when using ESM imports. List @modelcontextprotocol/sdk and zod as dependencies.',
      alternative_approach: 'You can also implement raw JSON-RPC over stdio without the SDK — useful if you want zero dependencies.',
      raw_boilerplate: `import { createInterface } from "readline";
const rl = createInterface({ input: process.stdin });

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\\n"); }
function result(id, data) { send({ jsonrpc: "2.0", id, result: data }); }

const TOOLS = [
  { name: "my.tool", description: "Does something", inputSchema: { type: "object", properties: { arg1: { type: "string" } } } }
];

async function handleCall(name, args) {
  switch (name) {
    case "my.tool": return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
    default: throw new Error("Unknown tool: " + name);
  }
}

rl.on("line", async (line) => {
  const req = JSON.parse(line);
  if (req.method === "initialize") return result(req.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "my-mcp", version: "1.0.0" } });
  if (req.method === "tools/list") return result(req.id, { tools: TOOLS });
  if (req.method === "tools/call") {
    try { return result(req.id, await handleCall(req.params.name, req.params.arguments || {})); }
    catch (e) { return result(req.id, { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true }); }
  }
});`,
    },

    id: 'orders-mcp',
    name: 'Orders MCP',
    description: 'E-commerce order management — CRUD operations for orders, customers, shipments, and returns tracking.',
    transport: 'stdio',
    // command and args omitted — auto-resolved from mcp_store files (server.js → node)
    env: {
      ORDERS_DB_URL: 'postgresql://orders:secret@db:5432/orders',
      NODE_ENV: 'production',
    },
    requiresAuth: true,
    authInstructions: 'You need a PostgreSQL connection string for the orders database.',
    envRequired: ['ORDERS_DB_URL'],
    envHelp: {
      ORDERS_DB_URL: {
        label: 'Database URL',
        placeholder: 'postgresql://user:pass@host:5432/dbname',
        hint: 'PostgreSQL connection string for the orders database',
      },
    },
    category: 'ecommerce',
    layer: 'tenant',
    ui_capable: false,

    // Tools this connector exposes (for reference — discovered at runtime via MCP tools/list)
    _tools_reference: [
      { name: 'order.get', description: 'Get order by ID' },
      { name: 'order.search', description: 'Search orders by criteria' },
      { name: 'order.list', description: 'List orders with pagination' },
      { name: 'customer.lookup', description: 'Look up customer by email' },
      { name: 'customer.get', description: 'Get customer by ID' },
      { name: 'shipment.track', description: 'Get tracking info for a shipment' },
    ],
  };
}

function buildExampleConnectorUI() {
  return {
    _note: 'A UI-capable connector serves both MCP tools AND visual dashboard plugins. Must implement ui.listPlugins and ui.getPlugin tools.',

    id: 'ecommerce-dashboard-mcp',
    name: 'E-Commerce Dashboard',
    description: 'Analytics dashboard with interactive charts — serves both MCP tools for data access and UI plugins for visual dashboards.',
    transport: 'stdio',
    // command and args omitted — auto-resolved from mcp_store files (server.js → node)
    env: {
      ANALYTICS_DB_URL: 'postgresql://analytics:secret@db:5432/analytics',
    },
    requiresAuth: true,
    envRequired: ['ANALYTICS_DB_URL'],
    envHelp: {
      ANALYTICS_DB_URL: {
        label: 'Analytics Database URL',
        placeholder: 'postgresql://user:pass@host:5432/dbname',
        hint: 'PostgreSQL connection string for the analytics database',
      },
    },
    category: 'analytics',
    layer: 'tenant',

    // This is the key flag — marks the connector as UI-capable
    ui_capable: true,

    // Tools this connector exposes (for reference)
    _tools_reference: [
      { name: 'analytics.orders.summary', description: 'Get order summary stats (revenue, count, avg)' },
      { name: 'analytics.customers.top', description: 'Get top customers by order volume' },
      { name: 'analytics.fulfillment.metrics', description: 'Get fulfillment performance metrics' },
      // UI-specific tools (required for ui_capable connectors):
      { name: 'ui.listPlugins', description: 'List available UI plugins' },
      { name: 'ui.getPlugin', description: 'Get manifest for a specific UI plugin' },
    ],

    // UI plugin info (for reference — discovered at runtime via ui.listPlugins)
    _ui_plugins_reference: [
      {
        id: 'ecom-overview',
        name: 'E-Commerce Overview',
        version: '1.0.0',
        description: 'Real-time order volume, revenue, and fulfillment metrics dashboard',
        render: {
          mode: 'iframe',
          iframeUrl: '/ui/ecom-overview/1.0.0/index.html',
        },
      },
    ],

    // ── REQUIRED RESPONSE FORMATS for ui.listPlugins and ui.getPlugin ──
    // These are the exact response formats your MCP server must return.
    // The response MUST be wrapped in MCP content format: { content: [{ type: "text", text: JSON.stringify(data) }] }
    _ui_tool_response_formats: {
      'ui.listPlugins': {
        _note: 'MUST return { plugins: [...] } wrapped in an object. Do NOT return a bare array.',
        correct_example: {
          plugins: [
            { id: 'ecom-overview', name: 'E-Commerce Overview', version: '1.0.0', description: 'Dashboard for order analytics' },
          ],
        },
        wrong_example: [
          { id: 'ecom-overview', name: 'E-Commerce Overview', version: '1.0.0' },
        ],
        _wrong_note: 'WRONG: bare array without { plugins: } wrapper. A-Team Core will NOT discover these plugins.',
        code_example: 'case "ui.listPlugins":\n  return { content: [{ type: "text", text: JSON.stringify({ plugins: [{ id: "ecom-overview", name: "E-Commerce Overview", version: "1.0.0" }] }) }] };',
      },
      'ui.getPlugin': {
        _note: 'Returns the full manifest for one plugin. iframeUrl uses /ui/ prefix — A-Team Core resolves it to /mcp-ui/<connector-id>/.',
        correct_example: {
          id: 'ecom-overview',
          name: 'E-Commerce Overview',
          version: '1.0.0',
          render: { mode: 'iframe', iframeUrl: '/ui/ecom-overview/1.0.0/index.html' },
          channels: ['command'],
          capabilities: { commands: [] },
        },
        code_example: 'case "ui.getPlugin":\n  return { content: [{ type: "text", text: JSON.stringify({ id: "ecom-overview", name: "E-Commerce Overview", version: "1.0.0", render: { mode: "iframe", iframeUrl: "/ui/ecom-overview/1.0.0/index.html" }, channels: ["command"], capabilities: { commands: [] } }) }] };',
      },
    },

    // File structure for a UI-capable connector:
    _file_structure_reference: {
      '/mcp-store/ecommerce-dashboard-mcp/': [
        'server.js          — MCP server (exposes tools + ui.listPlugins/ui.getPlugin)',
        'package.json',
        'ui-dist/            — Static UI assets served by A-Team Core',
        'ui-dist/ecom-overview/1.0.0/index.html  — Self-contained dashboard',
      ],
    },
  };
}

function buildExampleSolution() {
  return {
    _note: 'This example passes validateSolution(). It shows a 3-skill e-commerce customer service system with grant economy, handoffs, and routing. To deploy, use POST /deploy/solution with the deploy_body shown at the bottom.',

    id: 'ecom-customer-service',
    name: 'E-Commerce Customer Service',
    version: '1.0.0',
    description: 'Multi-agent customer service for an e-commerce platform. Identity verification gates access to order data. Separate skills handle order inquiries and returns.',

    // ── Identity ──
    identity: {
      actor_types: [
        { key: 'customer', label: 'Customer', description: 'End customer contacting support', default_channel: 'telegram' },
        { key: 'support_agent', label: 'Support Agent', description: 'Human support agent for escalations' },
      ],
      default_actor_type: 'customer',
      admin_roles: ['support_agent'],
    },

    // ── Skills ──
    skills: [
      {
        id: 'identity-assurance',
        name: 'Identity Assurance',
        role: 'gateway',
        description: 'Verifies customer identity via email lookup before granting access to order data. Entry point for all customer interactions.',
        entry_channels: ['telegram', 'email'],
        connectors: ['identity-mcp'],
      },
      {
        id: 'order-support',
        name: 'Order Support',
        role: 'worker',
        description: 'Handles order status inquiries, tracking, and search. Requires verified customer identity.',
        connectors: ['orders-mcp'],
      },
      {
        id: 'returns-support',
        name: 'Returns & Refunds',
        role: 'worker',
        description: 'Processes return requests and refund inquiries. Requires verified customer identity and order ownership.',
        connectors: ['orders-mcp', 'returns-mcp'],
      },
    ],

    // ── Grants ──
    grants: [
      {
        key: 'ecom.customer_id',
        description: 'Verified customer identifier — proves the user is who they claim to be',
        issued_by: ['identity-assurance'],
        consumed_by: ['order-support', 'returns-support'],
        issued_via: 'grant_mapping',
        source_tool: 'identity.verify',
        source_field: '$.customer_id',
        ttl_seconds: 3600,
      },
      {
        key: 'ecom.assurance_level',
        description: 'Identity assurance level (L0=unverified, L1=email, L2=multi-factor)',
        values: ['L0', 'L1', 'L2'],
        issued_by: ['identity-assurance'],
        consumed_by: ['order-support', 'returns-support'],
        issued_via: 'grant_mapping',
        source_tool: 'identity.verify',
        source_field: '$.assurance_level',
      },
    ],

    // ── Handoffs ──
    handoffs: [
      {
        id: 'identity-to-orders',
        from: 'identity-assurance',
        to: 'order-support',
        trigger: 'Customer verified and intent is order inquiry',
        grants_passed: ['ecom.customer_id', 'ecom.assurance_level'],
        grants_dropped: [],
        mechanism: 'handoff-controller-mcp',
      },
      {
        id: 'identity-to-returns',
        from: 'identity-assurance',
        to: 'returns-support',
        trigger: 'Customer verified and intent is return/refund',
        grants_passed: ['ecom.customer_id', 'ecom.assurance_level'],
        grants_dropped: [],
        mechanism: 'handoff-controller-mcp',
      },
    ],

    // ── Routing ──
    routing: {
      telegram: { default_skill: 'identity-assurance', description: 'All Telegram messages start at identity verification' },
      email: { default_skill: 'identity-assurance', description: 'All emails start at identity verification' },
    },

    // ── Platform Connectors ──
    platform_connectors: [
      {
        id: 'handoff-controller-mcp',
        required: true,
        description: 'Platform connector that manages live conversation handoffs between skills',
        used_by: ['identity-assurance', 'order-support', 'returns-support'],
      },
    ],

    // ── Security Contracts ──
    security_contracts: [
      {
        name: 'Order access requires verified customer',
        consumer: 'order-support',
        requires_grants: ['ecom.customer_id', 'ecom.assurance_level'],
        required_values: { 'ecom.assurance_level': ['L1', 'L2'] },
        provider: 'identity-assurance',
        for_tools: ['orders.order.get', 'orders.order.search'],
        validation: 'Customer must be verified (L1+) before accessing order data',
      },
      {
        name: 'Returns require verified customer',
        consumer: 'returns-support',
        requires_grants: ['ecom.customer_id'],
        provider: 'identity-assurance',
        for_tools: ['returns.request.create', 'returns.refund.initiate'],
        validation: 'Customer identity must be verified before processing returns',
      },
    ],

    // ═══════════════════════════════════════════════════════════════════════
    // DEPLOY BODY EXAMPLE
    // ═══════════════════════════════════════════════════════════════════════
    // POST /deploy/solution with this body. No slug or Python MCP code needed.
    // The Skill Builder auto-generates MCP servers from skill tool definitions.
    _deploy_body_example: {
      _note: 'POST /deploy/solution — the Skill Builder handles slug generation, MCP server creation, and A-Team Core deployment. You only provide definitions.',
      solution: {
        id: 'ecom-customer-service',
        name: 'E-Commerce Customer Service',
        description: 'Multi-agent customer service for an e-commerce platform',
        identity: {
          actor_types: [
            { key: 'customer', label: 'Customer', description: 'End customer contacting support', default_channel: 'telegram' },
            { key: 'support_agent', label: 'Support Agent', description: 'Human support agent' },
          ],
          default_actor_type: 'customer',
          admin_roles: ['support_agent'],
        },
        skills: [
          { id: 'identity-assurance', name: 'Identity Assurance', role: 'gateway' },
          { id: 'order-support', name: 'Order Support', role: 'worker' },
          { id: 'returns-support', name: 'Returns & Refunds', role: 'worker' },
        ],
        grants: [
          { key: 'ecom.customer_id', issued_by: ['identity-assurance'], consumed_by: ['order-support', 'returns-support'] },
        ],
        handoffs: [
          { id: 'identity-to-orders', from: 'identity-assurance', to: 'order-support', grants_passed: ['ecom.customer_id'] },
        ],
        routing: {
          telegram: { default_skill: 'identity-assurance' },
        },
      },
      skills: [
        '... full skill definitions (same format as POST /validate/skill) — see GET /spec/examples/skill ...',
      ],
      connectors: [
        { id: 'orders-mcp', name: 'Orders MCP', transport: 'stdio' },
        { id: 'identity-mcp', name: 'Identity MCP', transport: 'stdio' },
        // command + args auto-resolved from mcp_store files
      ],
      mcp_store: {
        _note: 'Optional: connector source code. Key = connector id, value = array of { path, content }',
      },
    },
  };
}
