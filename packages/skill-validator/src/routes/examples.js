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
export const EXAMPLE_UI_PLUGIN_IFRAME = buildExampleUIPluginIframe();
export const EXAMPLE_UI_PLUGIN_NATIVE = buildExampleUIPluginNative();
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
    '/spec/examples/ui-plugin-iframe': {
      method: 'GET',
      description: 'Complete working iframe UI plugin example — HTML+JavaScript with postMessage protocol',
    },
    '/spec/examples/ui-plugin-native': {
      method: 'GET',
      description: 'Complete working React Native UI plugin example — TypeScript with Plugin SDK',
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
router.get('/ui-plugin-iframe', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_UI_PLUGIN_IFRAME));
router.get('/ui-plugin-native', (_req, res) => res.set(CACHE_HEADERS).json(EXAMPLE_UI_PLUGIN_NATIVE));
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
    connectors: ['orders-mcp', 'telegram-mcp'],

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

      // ── Proactive Messaging Tool ──
      // This tool enables the skill to send outbound notifications via Telegram.
      // Used by schedule triggers (below) to alert humans about stale orders or daily summaries.
      {
        id: 'tool-telegram-send',
        id_status: 'permanent',
        name: 'telegram.send_message',
        description: 'Send a Telegram message for proactive notifications. Use during trigger-driven execution for important updates (stale orders, daily summaries). Do NOT use during normal user conversations — replies are handled automatically by the platform.',
        inputs: [
          { name: 'chat_id', type: 'number', required: true, description: 'Telegram chat ID of the recipient' },
          { name: 'text', type: 'string', required: true, description: 'Message text (supports Markdown formatting)' },
          { name: 'parse_mode', type: 'string', required: false, description: 'Message format: "Markdown" or "HTML" (default: plain text)' },
        ],
        output: {
          type: 'object',
          description: 'Telegram API response with ok status and message_id',
        },
        source: { type: 'mcp_bridge', connection_id: 'telegram-mcp', mcp_tool: 'send_message' },
        policy: { allowed: 'always' },
        security: { classification: 'public' },
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
    // max_iterations controls how many tool calls the agent can make per job.
    // Tune based on skill complexity:
    //   Simple CRUD/lookup: 8-12 | Standard workflows: 15-20
    //   Code analysis: 20-30    | Deep research: 30+
    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      rv2: {
        max_iterations: 8,  // Low for this simple order-support skill
        iteration_timeout_ms: 30000,
        allow_parallel_tools: false,
        on_max_iterations: 'fail',  // 'ask_user' for interactive, 'fail' for batch
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

    // ── Triggers (Proactive Messaging Pattern) ──
    // Triggers are the ONLY way a skill can act proactively (without a user message).
    // Pattern: connector (telegram-mcp) + tool (send_message) + trigger (schedule) = outbound notifications
    triggers: [
      {
        id: 'check-stale-orders',
        type: 'schedule',
        enabled: true,
        concurrency: 1,
        prompt: 'Check for orders that may need attention:\n\n1. Call orders.order.search with status="pending" to find pending orders\n2. For each order older than 2 hours: send a Telegram notification to chat_id 12345678 with the order ID, customer email, and how long it has been pending\n3. Use Markdown parse_mode for Telegram messages. Keep messages concise — 2-3 lines per order.\n4. If no stale orders found, do nothing — do NOT send a "no issues" message.',
        every: 'PT15M',
      },
      {
        id: 'daily-order-summary',
        type: 'schedule',
        enabled: true,
        concurrency: 1,
        prompt: 'Generate a daily summary of order activity:\n\n1. Call orders.order.search for each status (pending, shipped, delivered, cancelled) to get counts\n2. Send ONE Telegram message to chat_id 12345678 with the summary: total orders by status, any notable issues\n3. Use Markdown parse_mode. Format as a clean summary with emoji status indicators.\n4. Keep it brief — max 10 lines.',
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

    // ═══════════════════════════════════════════════════════════════════
    // COMMON MISTAKES — READ THIS BEFORE WRITING CONNECTOR CODE
    // ═══════════════════════════════════════════════════════════════════
    _common_mistakes: {
      _note: 'CRITICAL: These are the most common mistakes agents make when building connectors. Avoid them all.',

      '1_FATAL_web_server': {
        mistake: 'Starting an HTTP server (express, fastify, http.createServer) inside a stdio connector',
        why_it_fails: 'A-Team Core spawns your connector as a child process and communicates via stdin/stdout JSON-RPC. If your code calls app.listen(PORT) or http.createServer(), it will crash with EADDRINUSE because ADAS Core already uses those ports. Even if the port were free, ADAS Core cannot communicate with your connector over HTTP — it ONLY reads your stdout.',
        wrong_code: `// ❌ WRONG — DO NOT DO THIS
const express = require("express");
const app = express();
app.post("/tools/call", (req, res) => { ... });
app.listen(4000); // CRASHES — port 4000 is ADAS Core's server`,
        correct_code: `// ✅ CORRECT — Use stdio transport
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);`,
        deploy_check: 'The deploy pipeline now detects express(), app.listen(), http.createServer() and BLOCKS deployment with an actionable error.'
      },

      '2_FATAL_http_transport': {
        mistake: 'Using HttpServerTransport, SSEServerTransport, or StreamableHTTPServerTransport from the MCP SDK',
        why_it_fails: 'A-Team Core ONLY supports StdioServerTransport for connectors. HTTP-based MCP transports start a web server and bind to a port, which crashes in the A-Team runtime.',
        wrong_code: `// ❌ WRONG
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";`,
        correct_code: `// ✅ CORRECT
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";`
      },

      '3_WARNING_missing_package_json': {
        mistake: 'Uploading ESM code (.js files with import/export) without a package.json',
        why_it_fails: 'Without package.json, Node.js defaults to CommonJS mode. import/export syntax will fail with ERR_REQUIRE_ESM. Also, npm install cannot run, so dependencies are missing.',
        fix: 'Always include a package.json with "type": "module" (for ESM) and list all dependencies.'
      },

      '4_WARNING_no_error_handling': {
        mistake: 'Not handling JSON-RPC errors in tool handlers',
        why_it_fails: 'Unhandled exceptions crash the process. ADAS Core will retry 5 times, then mark the connector as permanently failed.',
        fix: 'Wrap all tool handlers in try/catch and return MCP error responses: { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true }'
      },

      '5_WARNING_process_exit': {
        mistake: 'Calling process.exit() in connector code',
        why_it_fails: 'MCP servers must stay alive and continuously process messages from stdin. Calling process.exit() kills the connector.',
        fix: 'Never call process.exit(). Let the ADAS Core runtime manage the connector lifecycle.'
      },

      '6_WARNING_console_log': {
        mistake: 'Using console.log() for debugging in a stdio connector',
        why_it_fails: 'console.log() writes to stdout, which is the JSON-RPC communication channel. Debug output mixed with JSON-RPC messages will corrupt the protocol.',
        fix: 'Use console.error() or process.stderr.write() for debug output. These go to stderr and are captured in connector diagnostics.'
      }
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
        _note: 'Returns the full manifest for one plugin. MUST include render.iframeUrl — this is how A-Team Core loads the UI. iframeUrl uses /ui/ prefix — Core resolves it to /mcp-ui/<connector-id>/.',
        _critical: 'The response MUST have a top-level "render" object with "mode" and "iframeUrl". Without render.iframeUrl, the plugin FAILS to load with "invalid manifest" error. This is validated at deploy time and is a HARD FAILURE.',
        correct_example: {
          id: 'ecom-overview',
          name: 'E-Commerce Overview',
          version: '1.0.0',
          render: { mode: 'iframe', iframeUrl: '/ui/ecom-overview/1.0.0/index.html' },
          channels: ['command'],
          capabilities: { commands: [] },
        },
        wrong_examples: [
          {
            _wrong_note: 'WRONG: Missing render.iframeUrl entirely. Custom ui/component/route fields are NOT recognized. A-Team Core checks manifest.render.iframeUrl — any other shape is rejected.',
            example: { ok: true, plugin: { id: 'ecom-overview', ui: { component: 'ecom-overview', route: '/ecom-overview' } } },
          },
          {
            _wrong_note: 'WRONG: iframeUrl at top level instead of nested in render object. Must be render.iframeUrl, NOT just iframeUrl.',
            example: { id: 'ecom-overview', name: 'E-Commerce Overview', iframeUrl: '/ui/ecom-overview/1.0.0/index.html' },
          },
          {
            _wrong_note: 'WRONG: Wrapping manifest in { plugin: ... }. Return the manifest object DIRECTLY, not wrapped.',
            example: { plugin: { id: 'ecom-overview', render: { mode: 'iframe', iframeUrl: '/ui/ecom-overview/1.0.0/index.html' } } },
          },
        ],
        code_example: 'case "ui.getPlugin":\n  return { content: [{ type: "text", text: JSON.stringify({ id: "ecom-overview", name: "E-Commerce Overview", version: "1.0.0", render: { mode: "iframe", iframeUrl: "/ui/ecom-overview/1.0.0/index.html" }, channels: ["command"], capabilities: { commands: [] } }) }] };',
      },
    },

    // ── CROSS-CONNECTOR DATA ACCESS (UI plugins calling other connectors) ──
    // When a UI plugin needs data from ANOTHER connector (not its own),
    // use the postMessage bridge to call that connector directly.
    //
    // CRITICAL: The target connector MUST be registered in ADAS Core
    // (via POST /api/mcp-store/upload + POST /api/connectors).
    // Deploying only via the Skill Builder API is NOT sufficient — the
    // ADAS frontend app maintains its own connector registry.
    _cross_connector_data_access: {
      _note: 'UI plugins can call ANY connector registered in ADAS Core, not just their own. This is the standard pattern for dashboards that aggregate data from multiple sources.',

      when_to_use: 'Your UI connector serves the dashboard, but the DATA lives in separate connectors (e.g., task-board-mcp, orders-mcp). On the platform, connectors have isolated filesystems — you CANNOT read sibling connector files directly.',

      architecture: {
        ui_connector: 'Serves the dashboard HTML + provides ui.listPlugins/ui.getPlugin tools',
        data_connectors: 'Separate connectors that own the data (e.g., task-board-mcp, orders-mcp)',
        bridge: 'PluginHost relays postMessage calls from iframe → ADAS Core → target connector',
      },

      // ── PostMessage Protocol ──
      // The iframe sends messages to the parent (PluginHost), which proxies
      // them to the ADAS backend's /api/connectors/:id/call endpoint.
      postmessage_protocol: {
        _step_1_wait_for_init: {
          _note: 'PluginHost sends an init message when the iframe is ready. WAIT for this before making any MCP calls.',
          message_format: '{ source: "adas-host", message: { type: "init", payload: { skillSlug, tenant, connectorId } } }',
          code: `window.addEventListener("message", (ev) => {
  const d = ev.data || {};
  if (d.source !== "adas-host") return;
  const msg = d.message;
  if (msg?.type === "init") {
    hostReady = true;
    loadData(); // Now safe to make MCP calls
  }
});`,
        },

        _step_2_send_mcp_call: {
          _note: 'To call a tool on ANY connector, send a postMessage with this exact format.',
          message_format: {
            source: 'adas-plugin',
            message: {
              action: 'mcp-call',
              payload: {
                requestId: 'req_1_<timestamp>',
                toolName: 'cp.fe_api',
                args: {
                  method: 'mcpProxy',
                  params: {
                    connectorId: '<TARGET_CONNECTOR_ID>',
                    tool: '<TOOL_NAME>',
                    args: { /* tool arguments */ },
                  },
                },
              },
            },
          },
          code: `function mcpCall(tool, args, connectorId) {
  const requestId = "req_" + (++counter) + "_" + Date.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 15000);
    pendingCalls.set(requestId, {
      resolve: (r) => { clearTimeout(timeout); resolve(unwrapResult(r)); },
      reject:  (e) => { clearTimeout(timeout); reject(e); },
    });
    window.parent.postMessage({
      source: "adas-plugin",
      message: {
        action: "mcp-call",
        payload: {
          requestId,
          toolName: "cp.fe_api",
          args: { method: "mcpProxy", params: { connectorId, tool, args } },
        },
      },
    }, "*");
  });
}`,
        },

        _step_3_receive_result: {
          _note: 'Results arrive as postMessage from PluginHost. Unwrap the MCP content wrapper (may be double-wrapped).',
          message_format: '{ source: "adas-host", message: { type: "mcp-result", payload: { requestId, result, error } } }',
          unwrap_code: `function unwrapResult(raw) {
  if (raw?.content?.[0]?.type === "text") {
    try { raw = JSON.parse(raw.content[0].text); } catch {}
  }
  // Second pass for double-wrapped responses
  if (raw?.content?.[0]?.type === "text") {
    try { raw = JSON.parse(raw.content[0].text); } catch {}
  }
  return raw;
}`,
        },
      },

      // ── Example: Dashboard calling two data connectors ──
      usage_example: `// Dashboard UI calls task-board-mcp and knowledge-mcp directly:
const [tasks, docs] = await Promise.all([
  mcpCall("tasks.list", {}, "task-board-mcp"),
  mcpCall("knowledge.list_docs", {}, "project-knowledge-mcp"),
]);`,

      // ── Connector Registration Requirement ──
      connector_registration: {
        _critical: 'Target connectors MUST be registered in ADAS Core. If they are only deployed via the Skill Builder API, the ADAS frontend cannot reach them and calls return 404.',
        registration_steps: [
          '1. Upload source: POST /api/mcp-store/upload { connectorId, files: [{path, content}], installDeps: true }',
          '2. Register: POST /api/connectors { id, name, transport: "stdio", config: { command: "node", args: ["/mcp-store/<tenant>/<id>/server.js"] } }',
          '3. Connect: POST /api/connectors/<id>/connect',
        ],
        common_mistake: 'Deploying via ateam_build_and_run registers connectors on A-Team Core (Skill Builder), but NOT in the ADAS frontend app. You need BOTH.',
      },

      // ── Data Isolation Warning ──
      data_isolation: {
        _note: 'On the platform, each connector gets its own DATA_DIR at /tenants/<tenant>/connector-data/<connector-id>/. Connectors CANNOT read each other\'s files. Use cross-connector MCP calls instead.',
      },
    },

    // ── MOBILE COMPATIBILITY — CRITICAL ──
    // The A-Team mobile app does NOT relay mcpProxy calls from plugin iframes.
    // Plugins that depend on live MCP calls will timeout on mobile.
    // Follow the "embed first, upgrade silently" pattern.
    _mobile_compatibility: {
      _critical: 'Mobile PluginHost does NOT support postMessage → mcpProxy relay. Any mcpCall() from an iframe will TIMEOUT on mobile. Your plugin MUST render without any MCP calls.',

      problem: [
        'Web dashboard has a full PluginHost that relays postMessage → mcpProxy → ADAS Core → connector tools.',
        'Mobile app\'s PluginHost either does not support this relay or has a broken/slow path — every mcpProxy call times out.',
        'Result: plugins that wait for MCP data before rendering show blank/loading states forever on mobile.',
      ],

      required_pattern: 'Embed default data directly in the HTML. Render immediately on load. Try live MCP calls silently in the background. Desktop gets live data upgrade, mobile stays with embedded data. No errors either way.',

      code_example: {
        _note: 'This is the CORRECT pattern for a mobile-compatible plugin. Embed defaults, render instantly, silently upgrade with live data when available.',
        html: `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Commerce Overview</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f8f9fa; }
    .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric { font-size: 24px; font-weight: 700; color: #1a73e8; }
    .label { font-size: 12px; color: #666; text-transform: uppercase; }
    .live-badge { display: none; font-size: 10px; color: #34a853; }
  </style>
</head><body>

<div class="card">
  <div class="label">Total Orders</div>
  <div class="metric" id="orders">142</div>
</div>
<div class="card">
  <div class="label">Revenue</div>
  <div class="metric" id="revenue">$28,450</div>
</div>
<div class="card">
  <div class="label">Avg Order Value</div>
  <div class="metric" id="avg">$200.35</div>
</div>
<div class="live-badge" id="liveBadge">● LIVE</div>

<script>
// ── 1. EMBEDDED DEFAULT DATA — renders immediately, works on mobile ──
const DEFAULTS = { orders: 142, revenue: "$28,450", avg: "$200.35" };

function render(d) {
  document.getElementById("orders").textContent = d.orders;
  document.getElementById("revenue").textContent = d.revenue;
  document.getElementById("avg").textContent = d.avg;
}

// Render IMMEDIATELY with defaults — no MCP calls needed
render(DEFAULTS);

// ── 2. POSTMESSAGE BRIDGE — only works on web, silently fails on mobile ──
let hostReady = false;
let counter = 0;
const pending = new Map();

window.addEventListener("message", (ev) => {
  const d = ev.data || {};
  if (d.source !== "adas-host") return;
  const msg = d.message;
  if (msg?.type === "init") { hostReady = true; tryLiveData(); }
  if (msg?.type === "mcp-result") {
    const p = pending.get(msg.payload?.requestId);
    if (p) { pending.delete(msg.payload.requestId); p.resolve(unwrap(msg.payload.result)); }
  }
});

function unwrap(raw) {
  if (raw?.content?.[0]?.type === "text") try { raw = JSON.parse(raw.content[0].text); } catch {}
  if (raw?.content?.[0]?.type === "text") try { raw = JSON.parse(raw.content[0].text); } catch {}
  return raw;
}

function mcpCall(tool, args, connectorId) {
  const requestId = "req_" + (++counter) + "_" + Date.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 10000);
    pending.set(requestId, {
      resolve: (r) => { clearTimeout(timeout); resolve(r); },
      reject:  (e) => { clearTimeout(timeout); reject(e); },
    });
    window.parent.postMessage({
      source: "adas-plugin",
      message: { action: "mcp-call", payload: { requestId, toolName: "cp.fe_api",
        args: { method: "mcpProxy", params: { connectorId, tool, args } } } },
    }, "*");
  });
}

// ── 3. SILENTLY try live data — upgrade UI if successful, ignore if not ──
async function tryLiveData() {
  try {
    const live = await mcpCall("analytics.orders.summary", {}, "ecommerce-dashboard-mcp");
    if (live) {
      render(live);
      document.getElementById("liveBadge").style.display = "block"; // Show live indicator
    }
  } catch {
    // Silent failure — mobile will hit this, desktop won't. Both are fine.
  }
}
</script>
</body></html>`,
      },

      anti_patterns: [
        'WRONG: Show loading spinner and block rendering until mcpProxy returns.',
        'WRONG: Display error toasts/banners when mcpProxy calls fail.',
        'WRONG: Require init message from host before rendering ANY content.',
        'WRONG: Assume postMessage relay works on all platforms (web, mobile, embedded).',
      ],
    },

    // File structure for a UI-capable connector:
    _file_structure_reference: {
      '/mcp-store/ecommerce-dashboard-mcp/': [
        'server.js          — MCP server (exposes tools + ui.listPlugins/ui.getPlugin)',
        'package.json',
        'ui-dist/            — Static UI assets served by A-Team Core',
        'ui-dist/ecom-overview/1.0.0/index.html  — Self-contained dashboard (with embedded defaults for mobile)',
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
      voice: { default_skill: 'identity-assurance', description: 'Voice calls start at identity verification' },
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

    // ── Functional Connectors (optional, mobile/native only) ──
    functional_connectors: [
      {
        id: 'device-bridge',
        name: 'Device Data Bridge',
        description: 'Real-time device data collection and relay sync for mobile clients. Collects calendar, contacts, location, battery, notifications.',
        module: '@mobile-pa/device-bridge',
        type: 'background',
        autoStart: true,
        permissions: ['calendar', 'contacts', 'location', 'battery', 'connectivity', 'notifications'],
        backgroundSync: true,
        config: {
          deviceIdPrefix: 'ateam-mobile-',
        },
      },
    ],

    // ── Voice Channel (optional) ──
    voice: {
      _note: 'Voice channel configuration. On deploy, these settings are automatically pushed to the voice backend. Remove this block entirely to skip voice setup.',
      enabled: true,
      language: 'en',
      persona: {
        name: 'E-Commerce Support',
        style: 'friendly',
      },
      welcome: 'Hello! Welcome to our customer support. How can I help you today?',
      prompt: {
        behaviorRules: 'Always confirm order numbers before making changes. Never share other customers\' information.',
        informationGathering: 'Ask for the customer email address first, then their order number if they have one.',
      },
      verification: {
        enabled: true,
        method: 'security_question',
        securityQuestion: {
          question: 'What is the email address on your account?',
          answer: 'any',
          answerMatchMode: 'smart',
        },
        maxAttempts: 3,
        onFailure: 'hangup',
        skipRecentMinutes: 60,
      },
      knownPhones: [
        { number: '+14155551234', label: 'Support Desk' },
        { number: '+14155555678', label: 'Returns Department' },
      ],
    },

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
        _note: 'Optional: connector source code. Key = connector id, value = array of { path, content }. For UI-capable connectors, include ui-dist/ files alongside server code — Core serves them at /mcp-ui/<tenant>/<connector-id>/<path>.',
        _ui_dist_convention: 'To deploy UI plugin assets, include files with paths like "ui-dist/<plugin-id>/<version>/index.html" in the mcp_store array. These are uploaded to Core and served as static assets. Without them, the health check reports "UI plugin asset NOT FOUND".',
        _example: {
          'my-ui-connector': [
            { path: 'server.js', content: '// MCP server code...' },
            { path: 'package.json', content: '{ "name": "my-ui-connector", "version": "1.0.0", "type": "module" }' },
            { path: 'ui-dist/my-dashboard/1.0.0/index.html', content: '<!DOCTYPE html><html>...</html>' },
            { path: 'ui-dist/my-dashboard/1.0.0/styles.css', content: '/* dashboard styles */' },
          ],
        },
      },
    },
  };
}

function buildExampleUIPluginIframe() {
  return {
    _title: 'Complete Iframe UI Plugin Example',
    _description: 'A fully working HTML+JavaScript UI plugin that communicates with connector tools via postMessage protocol.',
    _platform: 'Web (browser, iframe)',
    _location: 'In connector mcp_store: ui-dist/{pluginId}/{version}/index.html',

    // ── Plugin Manifest ──
    manifest: {
      id: 'mcp:task-connector:task-board',
      name: 'Task Board',
      version: '1.0.0',
      description: 'Interactive task board with real-time updates',
      render: {
        mode: 'iframe',
        iframeUrl: '/ui/task-board/1.0.0/index.html',
      },
      commands: [
        {
          name: 'highlight_task',
          description: 'Highlight a specific task in the board',
          input_schema: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'The task ID to highlight' },
              color: { type: 'string', enum: ['red', 'blue', 'green'] },
            },
            required: ['task_id'],
          },
        },
      ],
    },

    // ── HTML Source Code ──
    html_source: {
      _note: 'This is the exact HTML file served at /ui/task-board/1.0.0/index.html. Use this as a template for your own iframe plugins.',
      _critical: 'Key points: (1) postMessage listener must be FIRST in <head> BEFORE other scripts, (2) Plugin sends { source: "adas-plugin", pluginId: "...", message: { type: "tool.call", toolName: "...", args: {...}, correlationId: "..." } }, (3) Listen for { source: "adas-host", message: { type: "tool.response", payload: { correlationId: "...", result: {...} } } }',
      file: 'ui-dist/task-board/1.0.0/index.html',
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Board Plugin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 16px; }
    .container { max-width: 600px; margin: 0 auto; }
    .board { display: flex; gap: 16px; margin: 20px 0; overflow-x: auto; }
    .column { background: white; border-radius: 8px; padding: 16px; flex: 0 0 300px; }
    .column-title { font-weight: 600; margin-bottom: 12px; }
    .task { background: #f9f9f9; padding: 12px; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid #007AFF; cursor: pointer; }
    .task:hover { background: #f0f0f0; }
    .task.highlighted { background: #FFF3E0; border-left-color: #FF9500; }
  </style>
</head>
<body>
  <!-- CRITICAL: postMessage listener MUST be first -->
  <script>
    class TaskBoardPlugin {
      constructor() {
        this.pluginId = null;
        this.tasks = { todo: [], inprogress: [], done: [] };
        this.pendingRequests = new Map();
        this.setupListeners();
      }

      setupListeners() {
        window.addEventListener('message', (event) => {
          const { source, message } = event.data || {};
          if (source === 'adas-host') {
            if (message?.type === 'init') this.onInit(message.payload);
            else if (message?.type === 'tool.response') this.onToolResponse(message.payload);
          }
        });
      }

      onInit(payload) {
        this.pluginId = payload.pluginId;
        this.loadTasks();
      }

      async loadTasks() {
        const result = await this.callTool('tasks.list', { status: 'all' });
        this.tasks = { todo: [], inprogress: [], done: [] };
        (result.tasks || []).forEach(task => {
          const status = task.status || 'todo';
          if (this.tasks[status]) this.tasks[status].push(task);
        });
        this.render();
      }

      callTool(toolName, args) {
        return new Promise((resolve, reject) => {
          const correlationId = 'req_' + Math.random().toString(36).slice(2, 9);
          const timeout = setTimeout(() => {
            this.pendingRequests.delete(correlationId);
            reject(new Error(\`Tool "\${toolName}" timed out\`));
          }, 15000);

          this.pendingRequests.set(correlationId, {
            resolve: (result) => { clearTimeout(timeout); resolve(result); },
            reject: (error) => { clearTimeout(timeout); reject(error); }
          });

          window.parent.postMessage({
            source: 'adas-plugin',
            pluginId: this.pluginId,
            message: { type: 'tool.call', toolName, args, correlationId }
          }, '*');
        });
      }

      onToolResponse(payload) {
        const { correlationId, result, error } = payload;
        const request = this.pendingRequests.get(correlationId);
        if (!request) return;
        this.pendingRequests.delete(correlationId);
        if (error) request.reject(new Error(error));
        else request.resolve(result);
      }

      highlightTask(taskId, color) {
        const el = document.querySelector(\`[data-task-id="\${taskId}"]\`);
        if (el) {
          document.querySelectorAll('.task').forEach(t => t.classList.remove('highlighted'));
          el.classList.add('highlighted');
        }
      }

      render() {
        const board = document.getElementById('board');
        board.innerHTML = \`
          <div class="column">
            <div class="column-title">To Do (\${this.tasks.todo.length})</div>
            \${this.tasks.todo.map(t => \`
              <div class="task" data-task-id="\${t.id}" onclick="plugin.highlightTask('\${t.id}', 'blue')">
                \${t.title}
              </div>
            \`).join('')}
          </div>
          <div class="column">
            <div class="column-title">In Progress (\${this.tasks.inprogress.length})</div>
            \${this.tasks.inprogress.map(t => \`
              <div class="task" data-task-id="\${t.id}" onclick="plugin.highlightTask('\${t.id}', 'blue')">
                \${t.title}
              </div>
            \`).join('')}
          </div>
          <div class="column">
            <div class="column-title">Done (\${this.tasks.done.length})</div>
            \${this.tasks.done.map(t => \`
              <div class="task" data-task-id="\${t.id}" onclick="plugin.highlightTask('\${t.id}', 'blue')">
                \${t.title}
              </div>
            \`).join('')}
          </div>
        \`;
      }
    }

    const plugin = new TaskBoardPlugin();
  </script>

  <div class="container">
    <h1>📋 Task Board</h1>
    <div class="board" id="board">
      <div class="column"><div class="column-title">Loading...</div></div>
    </div>
  </div>
</body>
</html>`,
    },
  };
}

function buildExampleUIPluginNative() {
  return {
    _title: 'Complete React Native UI Plugin Example',
    _description: 'A fully working TypeScript React Native component using Plugin SDK to call connector tools.',
    _platform: 'Mobile (React Native)',
    _location: 'In ateam-mobile: src/plugins/{name}/index.tsx',

    // ── Plugin Manifest ──
    manifest: {
      id: 'mcp:task-connector:task-board-mobile',
      name: 'Task Board Mobile',
      version: '1.0.0',
      description: 'Mobile-optimized task board with haptic feedback',
      type: 'ui',
      render: {
        mode: 'react-native',
        component: 'TaskBoardMobile',
      },
      capabilities: {
        haptics: true,
      },
      commands: [
        {
          name: 'focus_task',
          description: 'Scroll to and highlight a task',
          input_schema: {
            type: 'object',
            properties: {
              task_id: { type: 'string' },
            },
            required: ['task_id'],
          },
        },
      ],
    },

    // ── TypeScript Source Code ──
    source: {
      _note: 'This is the exact component registered with PluginSDK.register(). Use as template for native plugins.',
      _critical: 'Key patterns: (1) Use PluginSDK.register() with component name, (2) Accept { bridge, native, theme } props, (3) Use const api = useApi(bridge) for all tool calls, (4) Always wrap api.call() in try/catch, (5) Use theme tokens for styling, (6) Call native.haptics for feedback',
      file: 'src/plugins/task-board-mobile/index.tsx',
      content: `import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { PluginSDK, useApi } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'inprogress' | 'done';
  priority?: 'high' | 'medium' | 'low';
}

export default PluginSDK.register('task-board-mobile', {
  type: 'ui',
  version: '1.0.0',
  capabilities: { haptics: true },

  Component({ bridge, native, theme }: PluginProps) {
    const api = useApi(bridge);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
      loadTasks();
    }, []);

    async function loadTasks(isRefresh = false) {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await api.call('tasks.list', { status: 'all' });
        setTasks(result.tasks || []);
        setError(null);
      } catch (err: any) {
        setError(err.message);
        native.haptics.error();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }

    if (loading) {
      return (
        <View style={[s.center, { backgroundColor: theme.colors.bg }]}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[s.errorContainer, { backgroundColor: theme.colors.bg }]}>
          <Text style={{ color: theme.colors.error }}>Error: {error}</Text>
          <Pressable onPress={() => loadTasks()}>
            <Text style={{ color: theme.colors.accent }}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item: task }) => (
          <Pressable
            style={[s.taskCard, { backgroundColor: theme.colors.surface }]}
            onPress={() => native.haptics.selection()}
          >
            <View style={[s.statusDot, { backgroundColor: task.status === 'done' ? theme.colors.success : theme.colors.accent }]} />
            <Text style={[s.taskTitle, { color: theme.colors.text }]}>{task.title}</Text>
            {task.priority && (
              <Text style={[s.badge, { color: theme.colors.textMuted }]}>
                {task.priority.toUpperCase()}
              </Text>
            )}
          </Pressable>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTasks(true)}
            tintColor={theme.colors.accent}
          />
        }
      />
    );
  },
});

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  taskTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  badge: { fontSize: 10, fontWeight: '600', paddingHorizontal: 6 },
});`,
    },
  };
}
