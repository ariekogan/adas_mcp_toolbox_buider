/**
 * A-Team Specification API routes
 *
 * Serves the complete A-Team multi-agent specification as structured JSON
 * so that any external agent (LLM, CI tool, IDE plugin) can understand
 * how to build valid A-Team skills and solutions.
 *
 * GET /spec           — Index of spec endpoints
 * GET /spec/enums     — All enum values
 * GET /spec/skill     — Complete skill specification
 * GET /spec/solution  — Complete solution specification
 */

import { Router } from 'express';
import { PHASES, PHASE_LABELS } from '../types/DraftSkill.js';
import { VALID_DATA_TYPES, VALID_TRIGGER_TYPES, VALID_PHASES } from '../validators/schemaValidator.js';
import { VALID_CLASSIFICATIONS, VALID_RISK_LEVELS, VALID_EFFECTS, HIGH_RISK_CLASSIFICATIONS } from '../validators/securityValidator.js';
import { SYSTEM_TOOL_PREFIXES } from '../validators/referenceResolver.js';
import { DIMENSION_WEIGHTS, GRADE_THRESHOLDS } from '../validators/solutionQualityValidator.js';
import { ALL_COVERAGE, COVERAGE_GAPS } from '../validators/coverage.js';

const router = Router();
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400' };

// ═══════════════════════════════════════════════════════════════════════════
// BUILD RESPONSES AT MODULE LOAD (static data — compute once)
// ═══════════════════════════════════════════════════════════════════════════

const ENUMS = buildEnums();
const SKILL_SPEC = buildSkillSpec();
const SOLUTION_SPEC = buildSolutionSpec();
const WORKFLOWS = buildWorkflows();
const INDEX = buildIndex();

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', (_req, res) => res.set(CACHE_HEADERS).json(INDEX));
router.get('/enums', (_req, res) => res.set(CACHE_HEADERS).json(ENUMS));
router.get('/skill', (_req, res) => res.set(CACHE_HEADERS).json(SKILL_SPEC));
router.get('/solution', (_req, res) => res.set(CACHE_HEADERS).json(SOLUTION_SPEC));
router.get('/workflows', (_req, res) => res.set(CACHE_HEADERS).json(WORKFLOWS));

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildIndex() {
  return {
    service: '@adas/skill-validator',
    version: '1.0.0',
    description: 'A-Team External Agent API — learn, build, validate, and deploy A-Team multi-agent solutions',
    getting_started: [
      '1. GET /spec/skill — read the skill specification and agent guide',
      '2. GET /spec/examples/skill — study a complete working example',
      '3. Build your skill definition following the schema',
      '4. POST /validate/skill — validate and fix errors',
      '5. GET /spec/solution — read the solution specification when ready to compose skills',
      '6. POST /validate/solution — validate the full solution',
      '7. POST /deploy/solution — deploy everything to A-Team Core (the Skill Builder auto-generates MCP servers from your tool definitions — no slug or Python code needed)',
      '8. GET /deploy/solutions/:id/definition — read back the deployed solution to verify',
      '9. GET /deploy/solutions/:id/skills/:skillId — read back individual skills to verify',
      '10. PATCH /deploy/solutions/:id/skills/:skillId — update skills incrementally (tools_push, tools_delete, etc.) without re-deploying everything',
      '11. POST /deploy/solutions/:id/skills/:skillId/redeploy — after PATCH, redeploy just that skill (regenerates MCP server, pushes to A-Team Core)',
      '--- Operate & Debug ---',
      '12. POST /deploy/solutions/:id/skills/:skillId/test — test a skill (sync: wait for result, or async: true to get job_id immediately)',
      '13. GET /deploy/solutions/:id/skills/:skillId/test/:jobId — poll async test progress (iteration, steps, pending questions)',
      '14. DELETE /deploy/solutions/:id/skills/:skillId/test/:jobId — abort a running test',
      '15. GET /deploy/solutions/:id/logs — view execution logs (job traces, tool calls, errors)',
      '16. GET /deploy/solutions/:id/metrics — analyze execution metrics (timing, bottlenecks, signals)',
      '17. GET /deploy/solutions/:id/diff — compare Builder definitions vs what is deployed in Core',
      '18. GET /deploy/solutions/:id/connectors/:connectorId/source — inspect connector source code',
    ],
    endpoints: {
      '/spec/enums': {
        method: 'GET',
        description: 'All A-Team enum values in a flat lookup (phases, data types, classifications, tones, etc.)',
      },
      '/spec/skill': {
        method: 'GET',
        description: 'Complete A-Team skill specification: schema, validation rules, system tools, agent guide, and template',
      },
      '/spec/solution': {
        method: 'GET',
        description: 'Complete A-Team solution specification: multi-skill architecture, grant economy, handoffs, routing, security contracts, agent guide, and template',
      },
      '/spec/workflows': {
        method: 'GET',
        description: 'Builder workflows — the step-by-step state machines for building skills and solutions. Use this to guide users through the build process.',
      },
      '/spec/examples': {
        method: 'GET',
        description: 'Index of complete, runnable examples (skill, connector, connector-ui, solution)',
      },
      '/spec/examples/skill': {
        method: 'GET',
        description: 'Complete "Order Support Agent" skill that passes all 5 validation stages',
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
    also_available: {
      'POST /validate/skill': 'Validate a single skill definition (5-stage pipeline)',
      'POST /validate/solution': 'Validate a solution (cross-skill contracts + LLM quality scoring)',
      'POST /deploy/mcp-store/:connectorId': 'Pre-upload large connector source files (e.g., dist bundles). They are auto-merged into the next POST /deploy/solution. Body: { files: [{ path, content }] }',
      'GET /deploy/mcp-store': 'List all pre-staged connector files',
      'DELETE /deploy/mcp-store/:connectorId': 'Remove pre-staged files for a connector',
      'POST /deploy/connector': 'Deploy a connector via Skill Builder → A-Team Core',
      'POST /deploy/skill': 'Deploy a single skill via Skill Builder (requires solution_id)',
      'POST /deploy/solution': 'Deploy a full solution via Skill Builder → A-Team Core (identity + connectors + skills). No slug or Python MCP code needed.',
      'GET /deploy/solutions': 'List all solutions stored in the Skill Builder',
      'GET /deploy/status/:solutionId': 'Get aggregated deploy status — skills, connectors, A-Team Core health',
      'DELETE /deploy/solutions/:solutionId': 'Remove a solution from the Skill Builder',
      'GET /deploy/solutions/:solutionId/definition': 'Read back the full solution definition (identity, grants, handoffs, routing)',
      'GET /deploy/solutions/:solutionId/skills': 'List skills in a solution (summaries with original and internal IDs)',
      'GET /deploy/solutions/:solutionId/skills/:skillId': 'Read back a full skill definition (accepts original or internal skill ID)',
      'PATCH /deploy/solutions/:solutionId': 'Update solution definition incrementally (grants, handoffs, routing, identity)',
      'PATCH /deploy/solutions/:solutionId/skills/:skillId': 'Update a skill incrementally (tools, intents, policy, engine — accepts original or internal ID)',
      'POST /deploy/solutions/:solutionId/skills/:skillId/redeploy': 'Re-deploy a single skill after PATCH — regenerates MCP server and pushes to A-Team Core',
      'DELETE /deploy/solutions/:solutionId/skills/:skillId': 'Remove a single skill from a solution (accepts original or internal ID)',
      'GET /deploy/solutions/:solutionId/validate': 'Re-validate solution from stored state (structural + cross-skill checks)',
      'GET /deploy/solutions/:solutionId/skills/:skillId/validate': 'Re-validate a single skill from stored state',
      'GET /deploy/solutions/:solutionId/connectors/health': 'Connector health — status, discovered tools, errors from A-Team Core',
      'GET /deploy/solutions/:solutionId/skills/:skillId/conversation': 'Skill conversation history — returns chat messages, optional ?limit=N',
      'GET /deploy/solutions/:solutionId/health': 'Live health check — cross-checks definition vs A-Team Core (skills deployed, connectors connected, issues)',
      'POST /deploy/solutions/:solutionId/chat': 'Send a message to the Solution Bot — returns AI response with state updates and suggested focus',
      'POST /deploy/solutions/:solutionId/redeploy': 'Re-deploy ALL skills at once — regenerates MCP servers and pushes to A-Team Core',
      'POST /deploy/solutions/:solutionId/skills': 'Add a new skill to an existing solution — creates, links, and updates solution topology',
      'GET /deploy/solutions/:solutionId/export': 'Export solution as a JSON bundle — compatible with POST /deploy/solution for re-import',
      // Developer Tools
      'GET /deploy/solutions/:solutionId/logs': 'Execution logs — recent jobs with step traces, tool calls, errors, timing. Query: ?skill_id=X&limit=10&job_id=X',
      'POST /deploy/solutions/:solutionId/skills/:skillId/test': 'Test a skill — sync (wait for result) or async (Body: { message, async: true } returns job_id immediately)',
      'GET /deploy/solutions/:solutionId/skills/:skillId/test/:jobId': 'Poll async test progress — iteration, steps, pending_question, result, elapsed_ms',
      'DELETE /deploy/solutions/:solutionId/skills/:skillId/test/:jobId': 'Abort a running test',
      'GET /deploy/solutions/:solutionId/metrics': 'Execution metrics — timing, bottlenecks, tool stats, signals. Query: ?job_id=X or ?skill_id=X',
      'GET /deploy/solutions/:solutionId/connectors/:connectorId/source': 'Connector source code — read the MCP server files',
      'GET /deploy/solutions/:solutionId/diff': 'Diff Builder vs Core — shows undeployed, orphaned, or changed skills. Query: ?skill_id=X',
      'GET /health': 'Health check',
    },
    deploy_guide: {
      _note: 'All deploy routes proxy through the Skill Builder backend, which stores everything (visible in Skill Builder UI), auto-generates Python MCP servers from skill tool definitions, and pushes to A-Team Core.',
      'POST /deploy/solution': {
        description: 'Deploy a complete solution — the recommended way to deploy. The Skill Builder handles slug generation, MCP server creation, and A-Team Core registration.',
        body: {
          solution: {
            _note: 'Solution architecture — identity, grants, handoffs, routing',
            id: 'ecom-customer-service',
            name: 'E-Commerce Customer Service',
            description: '...',
            identity: { actor_types: ['...'], default_actor_type: '...' },
            skills: [{ id: 'skill-id', name: '...', role: 'gateway|worker' }],
            grants: ['...'],
            handoffs: ['...'],
            routing: {},
          },
          skills: [
            {
              _note: 'Full skill definitions — same format as POST /validate/skill',
              id: 'order-support',
              name: 'Order Support Agent',
              tools: ['... tool definitions with inputs, outputs, source ...'],
              role: '...',
              connectors: ['orders-mcp'],
            },
          ],
          connectors: [
            {
              _note: 'Connector metadata — how to connect to MCP servers',
              id: 'orders-mcp',
              name: 'Orders MCP',
              transport: 'stdio',
              command: 'node',
              args: ['/mcp-store/orders-mcp/server.js'],
            },
          ],
          mcp_store: {
            _note: 'Optional but RECOMMENDED for stdio connectors: connector source code files. Key = connector id, value = { path: content } map. Without mcp_store, stdio connectors will fail to start if the server code is not pre-installed on A-Team Core. The deploy response includes validation_warnings if connectors are missing code.',
            'orders-mcp': [{ path: 'server.js', content: '...' }, { path: 'package.json', content: '...' }],
          },
        },
      },
      'POST /deploy/connector': {
        description: 'Deploy a single connector. Registers it in the Skill Builder catalog and connects it in A-Team Core.',
        body: { connector: { id: 'orders-mcp', name: 'Orders MCP', transport: 'stdio', command: 'node', args: [] } },
      },
      'POST /deploy/skill': {
        description: 'Deploy a single skill into an existing solution. Requires solution_id.',
        body: { skill: { id: 'order-support', name: 'Order Support Agent', tools: ['...'] }, solution_id: '<existing-solution-id>' },
      },
      'PATCH /deploy/solutions/:solutionId/skills/:skillId': {
        description: 'Update a deployed skill incrementally. Accepts original skill ID or internal ID. Supports dot notation for scalar fields, and _push/_delete/_update/_rename for array fields.',
        body: {
          updates: {
            _note: 'All operations are optional. Combine as many as needed.',
            'problem.statement': 'New problem statement (dot notation for scalar fields)',
            'tools_push': { name: 'new-tool', description: 'A new tool', inputs: ['...'], output: {}, source: {}, policy: {}, security: {} },
            'tools_update': { name: 'existing-tool', description: 'Updated description' },
            'tools_delete': 'tool-to-remove',
            'tools_rename': { from: 'old-name', to: 'new-name' },
            'intents.supported_push': { id: 'new-intent', description: '...', examples: ['...'] },
            'policy.guardrails.always_push': 'New guardrail rule',
            'engine.temperature': 0.5,
          },
        },
        protected_arrays: ['tools', 'meta_tools', 'intents.supported', 'policy.guardrails.always', 'policy.guardrails.never'],
        protected_note: 'These arrays cannot be replaced directly — use _push/_delete/_update instead to prevent accidental data loss.',
      },
      'PATCH /deploy/solutions/:solutionId': {
        description: 'Update a deployed solution incrementally. Supports dot notation and _push/_delete/_update for arrays.',
        body: {
          state_update: {
            _note: 'All operations are optional.',
            'phase': 'DEPLOYED',
            'identity.actor_types_push': { key: 'new-role', label: 'New Role', description: '...' },
            'grants_push': { key: 'ns.grant', description: '...', issued_by: ['skill-a'], consumed_by: ['skill-b'], issued_via: 'grant_mapping' },
            'handoffs_push': { id: 'a-to-b', from: 'skill-a', to: 'skill-b', trigger: '...', grants_passed: ['ns.grant'], mechanism: 'handoff-controller-mcp' },
            'routing.api': { default_skill: 'skill-a', description: 'API routing' },
          },
        },
      },
      'POST /deploy/solutions/:solutionId/redeploy': {
        description: 'Re-deploy ALL skills in a solution at once. Iterates every linked skill, regenerates MCP servers, pushes to A-Team Core.',
        body: { _note: 'No body required. Just POST with empty body.' },
        returns: {
          ok: true,
          solution_id: 'solution-id',
          deployed: 2,
          failed: 0,
          total: 2,
          skills: [{ skill_id: 'skill-1', ok: true, skillSlug: '...', mcpUri: '...' }],
        },
      },
      'POST /deploy/solutions/:solutionId/skills': {
        description: 'Add a new skill to an existing deployed solution. Creates the skill, populates it with the provided definition, and links it to the solution.',
        body: {
          skill: {
            id: 'new-skill-id',
            name: 'New Skill',
            description: 'What this skill does',
            role: 'worker',
            _note: 'Full skill definition — same format as in POST /deploy/solution skills array',
          },
        },
        returns: {
          ok: true,
          skill_id: 'new-skill-id',
          internal_id: 'dom_xxx',
        },
      },
      'GET /deploy/solutions/:solutionId/export': {
        description: 'Export solution as a JSON bundle. Returns solution + all skill definitions + connector metadata in a format compatible with POST /deploy/solution for re-import.',
        returns: {
          solution: { id: '...', name: '...', identity: {}, skills: [], grants: [], handoffs: [], routing: {} },
          skills: ['full skill definitions'],
          connectors: ['connector metadata'],
          exported_at: 'ISO timestamp',
        },
      },
      'POST /deploy/solutions/:solutionId/skills/:skillId/redeploy': {
        description: 'Re-deploy a single skill after PATCH updates. Reads stored definition, regenerates MCP server, pushes to A-Team Core. Accepts original or internal skill ID.',
        body: { _note: 'No body required — reads from stored state. Just POST with empty body.' },
        returns: {
          ok: true,
          skill_id: 'original-skill-id',
          internal_id: 'dom_xxx (if different from skill_id)',
          status: 'deployed',
          skillSlug: 'the-slug-used',
          mcpUri: 'tcp://localhost:PORT',
          message: 'Skill deployed successfully',
        },
        typical_workflow: [
          '1. PATCH /deploy/solutions/:id/skills/:skillId — update tools, policy, etc.',
          '2. POST /deploy/solutions/:id/skills/:skillId/redeploy — push changes to A-Team Core',
          '3. GET /deploy/status/:id — verify new status',
        ],
      },
    },
    id_remapping_guide: {
      _note: 'ID remapping is now AUTOMATIC. After deploying skills, the pipeline auto-remaps original IDs to internal dom_xxx IDs in grants, handoffs, routing, and security_contracts. You do NOT need to PATCH manually.',
      how_it_works: 'When POST /deploy/solution deploys skills, internal IDs (e.g., dom_abc123) are assigned. The deploy pipeline then automatically deep-replaces all original IDs in the solution definition (grants, handoffs, routing, security_contracts) with internal IDs.',
      what_you_get: 'The deploy response includes import.skills[] with both originalId and id (internal). The health check (GET /deploy/solutions/:id/health) accepts both original and internal IDs.',
      manual_override: 'If you need to manually update IDs (e.g., after adding a new skill), use PATCH /deploy/solutions/:id with the remapped references.',
      example_response_fragment: {
        'import.skills[0]': { id: 'dom_04f014ac', originalId: 'identity-assurance', name: 'Identity Assurance Manager', status: 'imported' },
        'import.skills[1]': { id: 'dom_492a7855', originalId: 'support-tier-1', name: 'Customer Support Tier 1', status: 'imported' },
      },
      tip: 'Use human-readable IDs (e.g., identity-assurance) in your source files. The deploy pipeline handles remapping automatically.',
    },
  };
}

function buildEnums() {
  return {
    description: 'All A-Team enum values. Use these when building skill and solution YAML files.',
    enums: {
      // Phases
      phase: VALID_PHASES,
      phase_labels: PHASE_LABELS,

      // Data types
      data_type: VALID_DATA_TYPES,

      // Communication style
      tone: ['formal', 'casual', 'technical'],
      verbosity: ['concise', 'balanced', 'detailed'],

      // Tool configuration
      tool_policy_allowed: ['always', 'conditional', 'never'],
      tool_id_status: ['temporary', 'permanent'],
      tool_source_type: ['mcp_bridge', 'builtin', 'custom'],

      // Mock configuration
      mock_mode: ['examples', 'llm', 'hybrid'],
      mock_status: ['untested', 'tested', 'skipped'],

      // Triggers
      trigger_type: VALID_TRIGGER_TYPES,

      // Security
      security_classification: VALID_CLASSIFICATIONS,
      risk_level: VALID_RISK_LEVELS,
      access_policy_effect: VALID_EFFECTS,
      high_risk_classifications: HIGH_RISK_CLASSIFICATIONS,

      // Intent handling
      out_of_domain_action: ['redirect', 'reject', 'escalate'],
      policy_condition_action: ['allow', 'deny', 'escalate', 'require_approval'],

      // Workflow
      workflow_deviation: ['warn', 'block', 'ask_user'],

      // Engine
      autonomy_level: ['autonomous', 'supervised', 'restricted'],
      on_max_iterations: ['escalate', 'fail', 'ask_user'],
      critic_strictness: ['low', 'medium', 'high'],
      reflection_depth: ['shallow', 'medium', 'deep'],

      // Solution-level
      skill_role_in_solution: ['gateway', 'worker', 'orchestrator', 'approval'],
      handoff_mechanism: ['handoff-controller-mcp', 'internal-message'],
      grant_issued_via: ['grant_mapping', 'handoff', 'platform'],

      // Actors & channels
      actor_type: ['external_user', 'skill_builder', 'adas_builder', 'agent', 'service'],
      actor_status: ['active', 'pending', 'inactive'],
      channel_type: ['api', 'slack', 'email', 'webhook'],
      email_routing_mode: ['dedicated_mailbox', 'plus_addressing'],
      slack_routing_mode: ['mention_based', 'channel_per_skill'],

      // Meta tools
      meta_tool_status: ['pending', 'approved', 'rejected'],

      // Quality scoring
      quality_grade: Object.keys(GRADE_THRESHOLDS),

      // System tools
      system_tool_prefixes: SYSTEM_TOOL_PREFIXES,
    },
  };
}

function buildSkillSpec() {
  return {
    spec_version: '1.0.0',
    description: 'Complete A-Team skill definition specification. A skill is an autonomous AI agent with tools, policies, and workflows.',

    schema: {
      // ── Metadata ──
      id: { type: 'string', required: true, description: 'Unique skill identifier (e.g., "identity-assurance")' },
      name: { type: 'string', required: true, description: 'Human-readable skill name' },
      description: { type: 'string', required: false, description: 'What this skill does' },
      version: { type: 'string', required: false, description: 'Semantic version (e.g., "1.0.0")' },
      phase: { type: 'enum', required: true, values: VALID_PHASES, description: 'Current development phase' },
      created_at: { type: 'string', required: false, description: 'ISO 8601 timestamp' },
      updated_at: { type: 'string', required: false, description: 'ISO 8601 timestamp' },
      ui_capable: { type: 'boolean', required: false, description: 'Whether this skill serves UI plugins' },

      // ── Connectors ──
      connectors: {
        type: 'string[]', required: false,
        description: 'List of MCP connector IDs this skill depends on (e.g., ["orders-mcp", "fulfillment-mcp"])',
      },

      // ── Problem ──
      problem: {
        type: 'object', required: true,
        description: 'The problem this skill solves',
        fields: {
          statement: { type: 'string', required: true, description: 'Problem statement (minimum 10 characters)' },
          context: { type: 'string', required: false, description: 'Additional context about the problem domain' },
          goals: { type: 'string[]', required: false, description: 'What the skill aims to achieve' },
        },
      },

      // ── Scenarios ──
      scenarios: {
        type: 'array', required: true, min_items: 1,
        description: 'Concrete use cases that demonstrate the skill in action',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique scenario ID' },
          title: { type: 'string', required: true, description: 'Short scenario title' },
          description: { type: 'string', required: false, description: 'Detailed scenario description' },
          steps: { type: 'string[]', required: true, description: 'Ordered list of steps' },
          expected_outcome: { type: 'string', required: false, description: 'What should happen after the scenario completes' },
        },
      },

      // ── Role ──
      role: {
        type: 'object', required: true,
        description: 'The agent persona and behavioral constraints',
        fields: {
          name: { type: 'string', required: true, description: 'Role name (e.g., "Identity Assurance Manager")' },
          persona: { type: 'string', required: true, description: 'Detailed persona description — how the agent should behave' },
          goals: { type: 'string[]', required: false, description: 'What the agent tries to achieve' },
          limitations: { type: 'string[]', required: false, description: 'What the agent must NOT do' },
          communication_style: {
            type: 'object', required: false,
            fields: {
              tone: { type: 'enum', values: ['formal', 'casual', 'technical'], description: 'Communication tone' },
              verbosity: { type: 'enum', values: ['concise', 'balanced', 'detailed'], description: 'Response detail level' },
            },
          },
        },
      },

      // ── Glossary ──
      glossary: {
        type: 'object', required: false,
        description: 'Domain-specific term definitions (key-value pairs)',
      },

      // ── Intents ──
      intents: {
        type: 'object', required: true,
        description: 'User intent classification configuration',
        fields: {
          supported: {
            type: 'array', required: true,
            description: 'List of intents the skill can handle',
            item_schema: {
              id: { type: 'string', required: true, description: 'Unique intent ID' },
              description: { type: 'string', required: true, description: 'What this intent means' },
              examples: { type: 'string[]', required: true, description: 'Example user messages that match this intent' },
              maps_to_workflow: { type: 'string', required: false, description: 'Workflow ID to execute when this intent is detected' },
              entities: {
                type: 'array', required: false,
                description: 'Entities to extract from user message',
                item_schema: {
                  name: { type: 'string', required: true },
                  type: { type: 'enum', values: VALID_DATA_TYPES },
                  required: { type: 'boolean', required: false },
                  extract_from: { type: 'enum', values: ['message', 'context'] },
                },
              },
              guardrails: {
                type: 'object', required: false,
                fields: {
                  pre_conditions: { type: 'string[]' },
                  rate_limit: {
                    type: 'object',
                    fields: {
                      max_per_session: { type: 'number' },
                      cooldown_seconds: { type: 'number' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          thresholds: {
            type: 'object', required: false,
            description: 'Confidence thresholds for intent matching',
            fields: {
              accept: { type: 'number', description: 'Confidence to proceed (default: 0.8)', default: 0.8 },
              clarify: { type: 'number', description: 'Confidence to ask for clarification (default: 0.5)', default: 0.5 },
              reject: { type: 'number', description: 'Confidence below which to reject (default: 0.3)', default: 0.3 },
            },
          },
          out_of_domain: {
            type: 'object', required: false,
            description: 'What to do when intent does not match this skill',
            fields: {
              action: { type: 'enum', values: ['redirect', 'reject', 'escalate'] },
              message: { type: 'string', description: 'Message to show user' },
              suggest_domains: { type: 'string[]', description: 'Other skill IDs that might handle this' },
            },
          },
        },
      },

      // ── Tools ──
      tools: {
        type: 'array', required: true, min_items: 1,
        description: 'Available actions this skill can perform via MCP connectors',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique tool ID (e.g., "tool-orders-get")' },
          id_status: { type: 'enum', values: ['temporary', 'permanent'], description: 'Whether this ID is provisional or finalized' },
          name: { type: 'string', required: true, description: 'Tool name matching MCP tool (e.g., "orders.order.get")' },
          description: { type: 'string', required: true, description: 'What this tool does' },
          inputs: {
            type: 'array', required: true,
            description: 'Tool input parameters',
            item_schema: {
              name: { type: 'string', required: true },
              type: { type: 'enum', values: VALID_DATA_TYPES, required: true },
              required: { type: 'boolean', required: false },
              description: { type: 'string', required: true },
              default: { type: 'any', required: false },
              enum: { type: 'string[]', required: false, description: 'Allowed values' },
            },
          },
          output: {
            type: 'object', required: true,
            fields: {
              type: { type: 'enum', values: VALID_DATA_TYPES },
              description: { type: 'string', required: true },
              schema: { type: 'object', required: false, description: 'JSON Schema for output structure' },
            },
          },
          source: {
            type: 'object', required: false,
            description: 'Where this tool comes from',
            fields: {
              type: { type: 'enum', values: ['mcp_bridge', 'builtin', 'custom'] },
              connection_id: { type: 'string', description: 'Connector ID for mcp_bridge tools' },
              mcp_tool: { type: 'string', description: 'Tool name on the MCP server' },
            },
          },
          policy: {
            type: 'object', required: false,
            description: 'Tool-level access policy',
            fields: {
              allowed: { type: 'enum', values: ['always', 'conditional', 'never'] },
              conditions: {
                type: 'array', required: false,
                item_schema: {
                  when: { type: 'string', description: 'Condition expression (e.g., "amount > 500")' },
                  action: { type: 'enum', values: ['allow', 'deny', 'escalate', 'require_approval'] },
                  message: { type: 'string', required: false },
                },
              },
              requires_approval: { type: 'enum', values: ['always', 'conditional', 'never'], required: false },
              rate_limit: { type: 'string', required: false, description: 'e.g., "100/minute"' },
            },
          },
          mock: {
            type: 'object', required: false,
            description: 'Mock configuration for testing without real MCP',
            fields: {
              enabled: { type: 'boolean' },
              mode: { type: 'enum', values: ['examples', 'llm', 'hybrid'] },
              examples: {
                type: 'array',
                item_schema: {
                  id: { type: 'string' },
                  input: { type: 'object' },
                  output: { type: 'any' },
                  description: { type: 'string', required: false },
                },
              },
            },
          },
          mock_status: { type: 'enum', values: ['untested', 'tested', 'skipped'] },
          security: {
            type: 'object', required: true,
            description: 'Tool security metadata',
            fields: {
              classification: {
                type: 'enum', values: VALID_CLASSIFICATIONS, required: true,
                description: 'Security classification. High-risk tools (pii_write, financial, destructive) require access policies.',
              },
              risk: { type: 'enum', values: VALID_RISK_LEVELS, required: false },
              data_owner_field: { type: 'string', required: false, description: 'Input field that identifies data owner (for constrain policies)' },
            },
          },
        },
      },

      // ── Meta Tools ──
      meta_tools: {
        type: 'array', required: false,
        description: 'Auto-generated tool compositions (created by DAL, not manually)',
        item_schema: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          composes: { type: 'string[]', description: 'Tool names this meta tool combines' },
          logic: { type: 'string', description: 'How the tools are combined' },
          status: { type: 'enum', values: ['pending', 'approved', 'rejected'] },
        },
      },

      // ── Bootstrap Tools ──
      bootstrap_tools: {
        type: 'string[]', required: false, max_items: 3,
        description: 'Up to 3 tool names that are always available to the planner (pinned in tool selection). These are NOT auto-executed — they simply guarantee the planner can always see and choose these tools, even when LLM-based tool ranking would otherwise exclude them. Useful for core domain tools like identity lookup or order retrieval that the planner needs on almost every request. Values must be valid tool names from the tools array.',
        example: ['identity.customer.lookup', 'orders.list', 'account.status'],
      },

      // ── Triggers ──
      triggers: {
        type: 'array', required: false,
        description: 'Automation triggers that activate this skill periodically or on events',
        item_schema: {
          id: { type: 'string', required: true },
          type: { type: 'enum', values: VALID_TRIGGER_TYPES, required: true },
          enabled: { type: 'boolean', required: false, default: true },
          concurrency: { type: 'number', required: false, default: 1, description: 'Max parallel jobs' },
          prompt: { type: 'string', required: true, description: 'Goal prompt for the triggered job' },
          input: { type: 'object', required: false, description: 'Arbitrary data passed to triggerContext' },
          every: { type: 'string', required: false, description: 'ISO 8601 duration (schedule triggers only, e.g., "PT2M", "PT1H", "P1D")' },
          event: { type: 'string', required: false, description: 'Event type name (event triggers only, e.g., "email.received")' },
          filter: { type: 'object', required: false, description: 'Event data filter (event triggers only)' },
        },
      },

      // ── Policy ──
      policy: {
        type: 'object', required: true,
        description: 'Guardrails, workflows, approval rules, and escalation',
        fields: {
          guardrails: {
            type: 'object', required: true,
            description: 'Hard behavioral constraints',
            fields: {
              never: { type: 'string[]', description: 'Things the agent must NEVER do' },
              always: { type: 'string[]', description: 'Things the agent must ALWAYS do' },
            },
            note: 'Can also be an array of {type: "never"|"always", rule: string} objects',
          },
          workflows: {
            type: 'array', required: false,
            description: 'Named orchestration sequences',
            item_schema: {
              id: { type: 'string', required: true },
              name: { type: 'string', required: true },
              description: { type: 'string', required: false },
              trigger: { type: 'string', description: 'Intent ID that triggers this workflow' },
              steps: { type: 'string[]', required: true, description: 'Ordered list of tool names or system tool names to execute' },
              required: { type: 'boolean', description: 'Must follow this sequence?' },
              on_deviation: { type: 'enum', values: ['warn', 'block', 'ask_user'], description: 'What happens if agent deviates from workflow' },
            },
          },
          approvals: {
            type: 'array', required: false,
            description: 'Manual approval gates for specific tools',
            item_schema: {
              id: { type: 'string', required: true },
              tool_id: { type: 'string', required: true, description: 'Tool that requires approval' },
              conditions: {
                type: 'array',
                item_schema: {
                  when: { type: 'string' },
                  action: { type: 'enum', values: ['allow', 'deny', 'escalate', 'require_approval'] },
                },
              },
              approver: { type: 'string', required: false, description: 'Role or queue' },
            },
          },
          escalation: {
            type: 'object', required: false,
            fields: {
              enabled: { type: 'boolean' },
              conditions: { type: 'string[]' },
              target: { type: 'string', description: 'Skill or queue to escalate to' },
            },
          },
        },
      },

      // ── Engine ──
      engine: {
        type: 'object', required: false,
        description: 'AI model and reasoning configuration',
        fields: {
          model: { type: 'string', required: false, description: 'LLM model (e.g., "claude-sonnet-4-20250514")' },
          temperature: { type: 'number', required: false, description: 'LLM temperature (0.0-1.0)' },
          max_iterations: { type: 'number', required: false, description: 'Shorthand for rv2.max_iterations' },
          max_replans: { type: 'number', required: false, description: 'Shorthand for hlr.replanning.max_replans' },
          rv2: {
            type: 'object', description: 'Runtime verification v2',
            fields: {
              max_iterations: { type: 'number', description: 'Max tool calls per job (default: 10)' },
              iteration_timeout_ms: { type: 'number', description: 'Timeout per iteration in ms (default: 30000)' },
              allow_parallel_tools: { type: 'boolean', description: 'Allow parallel tool execution (default: false)' },
              on_max_iterations: { type: 'enum', values: ['escalate', 'fail', 'ask_user'] },
            },
          },
          hlr: {
            type: 'object', description: 'High-level reasoning',
            fields: {
              enabled: { type: 'boolean', default: true },
              critic: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  check_interval: { type: 'number', description: 'Check every N iterations (default: 3)' },
                  strictness: { type: 'enum', values: ['low', 'medium', 'high'] },
                },
              },
              reflection: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  depth: { type: 'enum', values: ['shallow', 'medium', 'deep'] },
                },
              },
              replanning: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  max_replans: { type: 'number', description: 'Max re-plans (default: 2)' },
                },
              },
            },
          },
          autonomy: {
            type: 'object',
            fields: {
              level: { type: 'enum', values: ['autonomous', 'supervised', 'restricted'] },
            },
          },
          finalization_gate: {
            type: 'object', required: false,
            fields: {
              enabled: { type: 'boolean', description: 'Validate responses before sending (default: true)' },
              max_retries: { type: 'number', description: 'Retry count (0-10, default: 2)' },
            },
          },
          internal_error: {
            type: 'object', required: false, description: 'Internal error handling and RESOLUTION mode',
            fields: {
              enabled: { type: 'boolean', default: true },
              tool_not_found: {
                type: 'object',
                fields: {
                  enter_resolution_after: { type: 'number', description: 'Failures before RESOLUTION mode (default: 1)' },
                  retryable: { type: 'boolean' },
                },
              },
              resolution: {
                type: 'object',
                fields: {
                  max_iterations: { type: 'number' },
                  allowed_capabilities: { type: 'string[]' },
                },
              },
              loop_detection: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  identical_call_threshold: { type: 'number', description: 'Identical calls before flagging (default: 2)' },
                },
              },
            },
          },
        },
      },

      // ── Grant Mappings ──
      grant_mappings: {
        type: 'array', required: false,
        description: 'Auto-issue grants from tool responses. When a tool succeeds, extract values and create grants.',
        item_schema: {
          tool: { type: 'string', required: true, description: 'Tool name that triggers the grant' },
          on_success: { type: 'boolean', description: 'Only issue on successful tool call' },
          grants: {
            type: 'array',
            item_schema: {
              key: { type: 'string', description: 'Grant key (e.g., "ecom.customer_id")' },
              value_from: { type: 'string', description: 'JSON path into tool result (e.g., "$.candidates[0].customer_id")' },
              condition: { type: 'string', required: false, description: 'Condition for issuing (e.g., "$.candidates.length == 1")' },
              ttl_seconds: { type: 'number', required: false },
            },
          },
        },
      },

      // ── Access Policy ──
      access_policy: {
        type: 'object', required: false,
        description: 'Declarative access control rules for tools',
        fields: {
          rules: {
            type: 'array',
            item_schema: {
              tools: { type: 'string[]', description: 'Tool names this rule applies to. Use "*" for all tools.' },
              effect: { type: 'enum', values: VALID_EFFECTS, description: 'allow = permit, deny = block, constrain = inject filter' },
              requires_grants: { type: 'string[]', required: false, description: 'Grants required to match this rule' },
              inject: { type: 'object', required: false, description: 'Values to inject into tool inputs (for constrain)' },
            },
          },
        },
      },

      // ── Response Filters ──
      response_filters: {
        type: 'array', required: false,
        description: 'Strip or mask sensitive fields from tool responses',
        item_schema: {
          tools: { type: 'string[]', description: 'Tool names to filter' },
          strip_fields: { type: 'string[]', description: 'JSON paths to remove entirely' },
          mask_fields: { type: 'string[]', description: 'JSON paths to mask (e.g., replace with "***")' },
          condition: { type: 'string', required: false, description: 'Only apply filter when condition is true' },
        },
      },

      // ── Channels ──
      channels: {
        type: 'array', required: false,
        description: 'Communication channel configuration',
        item_schema: {
          type: { type: 'enum', values: ['api', 'slack', 'email', 'webhook', 'telegram'] },
          enabled: { type: 'boolean' },
          config: { type: 'object', description: 'Channel-specific settings (rate_limit, endpoint, etc.)' },
        },
      },

      // ── Skill Identity ──
      skill_identity: {
        type: 'object', required: false,
        description: 'Who the skill is (independent of channels)',
        fields: {
          actor_ref: { type: 'string', description: 'Reference to CORE actor (e.g., "agent::my-skill")' },
          display_name: { type: 'string' },
          avatar_url: { type: 'string', required: false },
          channel_identities: {
            type: 'object', required: false,
            fields: {
              email: {
                type: 'object',
                fields: {
                  from_name: { type: 'string' },
                  from_email: { type: 'string' },
                  signature: { type: 'string', required: false },
                },
              },
              slack: {
                type: 'object',
                fields: {
                  bot_name: { type: 'string', required: false },
                  bot_icon_url: { type: 'string', required: false },
                },
              },
            },
          },
        },
      },

      // ── Prompt ──
      prompt: {
        type: 'string', required: false,
        description: 'Full system prompt for the skill. Alternative to role.persona for more detailed instructions.',
      },

      // ── Example Conversations ──
      example_conversations: {
        type: 'array', required: false,
        description: 'Few-shot examples for the LLM',
        item_schema: {
          title: { type: 'string' },
          messages: {
            type: 'array',
            item_schema: {
              role: { type: 'enum', values: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
            },
          },
        },
      },
    },

    // ── System Tools ──
    system_tools: {
      description: 'Tools provided by the A-Team runtime — do NOT define these in your tools array',
      prefixes: SYSTEM_TOOL_PREFIXES,
      known_tools: {
        'sys.askUser': 'Pause job execution to request user input; resumes when user responds',
        'sys.finalizePlan': 'Finalize and polish the agent response with persona application',
        'sys.emitUserMessage': 'Send a message to the user mid-workflow (e.g., ask for OTP code)',
        'sys.dispatch_skill_job': 'Dispatch a job to another skill',
        'sys.approval.record': 'Record an approval decision',
        'ui.listPlugins': 'List available UI plugins from a connector',
        'ui.getPlugin': 'Get the manifest for a specific UI plugin',
        'cp.admin_api': 'Actor and identity management (CRUD actors, tokens, audit)',
        'cp.fe_api': 'Frontend API proxy for context plugin iframe requests',
        'cp.listContextPlugins': 'List all context plugins from connected connectors',
        'cp.getContextPlugin': 'Get a specific context plugin manifest',
      },
      note: 'Any tool name starting with sys., ui., or cp. is recognized as a system tool by the validator',
    },

    // ── Validation Rules ──
    validation_rules: {
      description: 'What POST /validate/skill checks (5-stage pipeline)',
      pipeline: [
        {
          stage: 1,
          name: 'Schema Validation',
          description: 'Type checks, required fields, enum values. Catches structural errors.',
          checks: ALL_COVERAGE.filter(c => c.type === 'schema').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 2,
          name: 'Reference Resolution',
          description: 'Cross-reference validation: workflow steps reference existing tools, intent mappings are valid, no duplicate IDs.',
          checks: ALL_COVERAGE.filter(c => c.type === 'reference').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 3,
          name: 'Completeness Check',
          description: 'Are all required sections filled with meaningful content?',
          checks: ALL_COVERAGE.filter(c => c.type === 'completeness').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 4,
          name: 'Security Validation',
          description: 'All tools have classifications, high-risk tools have access policies, response filters are valid.',
          note: `High-risk classifications requiring access policy: ${HIGH_RISK_CLASSIFICATIONS.join(', ')}`,
        },
        {
          stage: 5,
          name: 'Export Readiness',
          description: 'Final gate: no errors, all references resolved, required sections complete.',
        },
      ],
      known_gaps: COVERAGE_GAPS,
    },

    // ── Template ──
    template: {
      description: 'Minimal valid skill definition. Fill placeholders marked with <...>.',
      skill: {
        id: '<unique-skill-id>',
        name: '<Your Skill Name>',
        description: '<What this skill does>',
        version: '0.1.0',
        phase: 'TOOL_DEFINITION',
        connectors: ['<connector-id>'],
        problem: {
          statement: '<Describe the problem this skill solves (min 10 chars)>',
          context: '<Additional context>',
          goals: ['<Goal 1>'],
        },
        scenarios: [
          {
            id: 'scenario-1',
            title: '<Scenario title>',
            description: '<What happens in this scenario>',
            steps: ['<Step 1>', '<Step 2>'],
            expected_outcome: '<What should happen>',
          },
        ],
        role: {
          name: '<Agent Role Name>',
          persona: '<How the agent should behave — detailed persona description>',
          goals: ['<Goal>'],
          limitations: ['<What the agent must NOT do>'],
          communication_style: { tone: 'formal', verbosity: 'balanced' },
        },
        intents: {
          supported: [
            {
              id: 'intent-1',
              description: '<What this intent means>',
              examples: ['<Example user message 1>', '<Example user message 2>'],
            },
          ],
          thresholds: { accept: 0.85, clarify: 0.6, reject: 0.4 },
          out_of_domain: { action: 'redirect', message: '<Not my domain>', suggest_domains: [] },
        },
        tools: [
          {
            id: 'tool-1',
            id_status: 'permanent',
            name: '<connector-prefix>.<tool-name>',
            description: '<What this tool does>',
            inputs: [
              { name: '<param>', type: 'string', required: true, description: '<Param description>' },
            ],
            output: { type: 'object', description: '<What the tool returns>' },
            source: { type: 'mcp_bridge', connection_id: '<connector-id>', mcp_tool: '<tool-name>' },
            policy: { allowed: 'always' },
            mock: {
              enabled: true,
              mode: 'examples',
              examples: [{ id: 'example-1', input: {}, output: {}, description: '<Example description>' }],
            },
            security: { classification: 'public' },
          },
        ],
        policy: {
          guardrails: {
            never: ['<Something the agent must NEVER do>'],
            always: ['<Something the agent must ALWAYS do>'],
          },
          workflows: [],
          approvals: [],
          escalation: { enabled: false, conditions: [], target: '' },
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
        grant_mappings: [
          {
            _note: 'Optional: auto-issue grants from tool responses. Include only if this skill issues grants for other skills.',
            grant_key: '<namespace.grant_name>',
            source_tool: '<tool-name>',
            source_field: '$.result_field',
            condition: '<optional JS expression, e.g. output.verified === true>',
          },
        ],
        access_policy: {
          _note: 'Declarative access control. Use requires_grants for tools that need verified claims.',
          rules: [
            { tools: ['*'], effect: 'allow' },
          ],
        },
        response_filters: [
          {
            _note: 'Optional: strip sensitive fields from tool responses before showing to users.',
            id: 'strip-pii',
            strip_fields: ['<field.path.to.strip>'],
          },
        ],
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building an A-Team skill from scratch.',
      build_order: [
        '1. GET /spec/enums — learn all valid enum values',
        '2. GET /spec/skill — study the schema, validation rules, and system tools',
        '3. GET /spec/examples/skill — see a complete working example that passes validation',
        '4. Define your connectors — what external systems (MCP servers) does your agent need? Write the connector source code (Node.js/Python MCP server) that implements real business logic (database access, API calls, UI dashboards)',
        '5. Build the skill definition following this order: problem → scenarios → role → intents → tools → policy → engine → grant_mappings (if issuing grants) → access_policy → response_filters',
        '6. POST /validate/skill with { "skill": <your definition> } — fix all errors before proceeding',
        '7. POST /deploy/solution — deploy everything at once (connectors + skills). The Skill Builder auto-generates Python MCP servers from your skill tool definitions. You do NOT need to write slugs or Python MCP code for skills — only connector implementations.',
      ],
      naming_conventions: {
        skill_id: 'lowercase-kebab-case (e.g., "order-support", "identity-assurance")',
        tool_id: 'prefixed with "tool-" (e.g., "tool-orders-get", "tool-customers-search")',
        tool_name: 'connector-prefix.resource.action (e.g., "orders.order.get", "identity.customer.verify")',
        workflow_id: 'descriptive_snake_case (e.g., "order_lookup_flow", "refund_approval_flow")',
        connector_id: 'lowercase-kebab-case, often with -mcp suffix (e.g., "orders-mcp", "identity-mcp")',
        intent_id: 'descriptive_snake_case (e.g., "check_order_status", "request_refund")',
        grant_key: 'namespace.name (e.g., "ecom.customer_id", "ecom.assurance_level")',
      },
      common_mistakes: [
        // ── CONNECTOR MISTAKES (most common, most painful) ──
        'FATAL: Starting a web server (express, fastify, http.createServer) inside a stdio connector — connectors MUST use stdio transport (stdin/stdout JSON-RPC), NOT HTTP. Code with app.listen() will crash with EADDRINUSE. The deploy pipeline now blocks this.',
        'FATAL: Using HttpServerTransport, SSEServerTransport, or StreamableHTTPServerTransport — A-Team ONLY supports StdioServerTransport. These HTTP transports bind to ports and crash.',
        'Using console.log() in a stdio connector — console.log writes to stdout which is the JSON-RPC channel. Use console.error() or process.stderr.write() instead.',
        'Calling process.exit() in connector code — MCP servers must stay alive. Let A-Team manage the lifecycle.',
        'Forgetting "type": "module" in package.json when using @modelcontextprotocol/sdk or ESM imports — the runtime is Node.js 22.x which fully supports ESM, but package.json must declare it.',
        'Defining stdio connectors without providing mcp_store code — if the connector server code is not pre-installed on A-Team Core, include it in the mcp_store field of the deploy payload. Without it, the connector will fail to start.',
        // ── SKILL MISTAKES ──
        'Forgetting security.classification on tools — every tool needs one',
        'High-risk tools (pii_write, financial, destructive) without access_policy rules → validation error',
        'Workflow steps referencing tool IDs instead of tool names — steps use tool.name not tool.id',
        'Tool source.connection_id not matching a connector in the skill.connectors array',
        'Intent examples that are too similar to each other — use diverse phrasings',
        'Missing mock examples for tools — needed for testing without real MCP connections',
        'Guardrails that contradict tool capabilities without access_policy to resolve the conflict',
        'Using invalid enum values — always check GET /spec/enums first',
        'Putting only { max_iterations, max_replans } in engine — use the full engine structure with model, temperature, rv2, hlr, and autonomy (see template)',
        'Omitting grant_mappings when a skill issues grants — if your skill verifies identity or produces claims consumed by other skills, add grant_mappings',
        'Trying to write Python MCP server code for skills — the Skill Builder auto-generates it from your tool definitions. Only connector source code (real business logic) needs to be written by you.',
        'Providing slug or mcpServer in deploy requests — these are computed automatically. Just provide skill definitions with tools.',
      ],
      key_concepts: {
        connector_runtime: 'A-Team Core runs connector MCP servers on Node.js 22.x with full ESM support. Recommended: use @modelcontextprotocol/sdk with StdioServerTransport — it is the simplest and most reliable approach. Make sure package.json has "type": "module" and lists @modelcontextprotocol/sdk + zod as dependencies. Alternative: implement raw JSON-RPC over stdio with readline if you prefer zero dependencies. See the connector examples for both patterns.',
        connector_rules: {
          _CRITICAL: 'EVERY connector deployed to A-Team MUST follow these rules. Violations are caught at deploy time and blocked.',
          transport: 'A-Team connectors use STDIO transport — they are spawned as child processes and communicate via stdin/stdout JSON-RPC. There is NO HTTP mode for custom connectors.',
          must_use: 'StdioServerTransport from @modelcontextprotocol/sdk, or raw readline over process.stdin with JSON-RPC responses to process.stdout.',
          must_NOT_use: [
            'express(), fastify(), Koa, Hapi, or any web framework',
            'http.createServer(), https.createServer(), or net.createServer()',
            'app.listen(PORT) or any port binding',
            'HttpServerTransport, SSEServerTransport, StreamableHTTPServerTransport from MCP SDK',
          ],
          stdout_is_sacred: 'stdout is the JSON-RPC communication channel. NEVER write non-JSON-RPC data to stdout. Use console.error() or process.stderr.write() for logging.',
          stay_alive: 'MCP servers must stay alive and continuously process messages. Never call process.exit().',
          validation: 'The deploy pipeline scans connector source code for anti-patterns (web server code, port binding) and BLOCKS deployment if found.',
        },
        connector_storage: 'A-Team Core auto-injects a DATA_DIR environment variable into every stdio connector process, pointing to a tenant-scoped, connector-isolated directory. Use process.env.DATA_DIR to store SQLite databases, files, or any persistent data. No configuration needed — just read the env var in your connector code.',
        tool_vs_system_tool: 'Your tools come from MCP connectors. System tools (sys.*, ui.*, cp.*) are provided by the A-Team runtime — do NOT define them in your tools array.',
        grant_economy: 'Grants are verified claims that flow between skills. A skill issues grants via grant_mappings (tool output → grant). Another skill requires grants via access_policy. Security contracts enforce this at the solution level.',
        workflow_steps: 'Workflow steps are tool NAMES (not IDs). Example: ["orders.order.get", "sys.emitUserMessage"]. System tools are valid step targets.',
        access_policy_effects: '"allow" = permit unconditionally, "deny" = block, "constrain" = inject values into tool inputs (e.g., force customer_id from grant). Use "*" in tools array to cover all tools.',
      },
    },
  };
}

function buildWorkflows() {
  return {
    description: 'Builder workflows — the step-by-step state machines the Skill Builder uses internally. Use these to guide users through building skills and solutions conversationally, replicating the Skill Builder experience.',
    usage: 'When a user wants to build a skill or solution, read this workflow and follow it step by step. At each phase, ask the user the right questions, collect their answers, build the definition incrementally, validate with adas_validate_skill / adas_validate_solution, and deploy with adas_deploy_solution.',

    skill_workflow: {
      description: 'State machine for building a single A-Team skill (autonomous AI agent)',
      phases: [
        {
          id: 'PROBLEM_DISCOVERY',
          order: 1,
          label: 'Problem Discovery',
          goal: 'Understand what problem this skill solves',
          what_to_ask: [
            'What problem should this AI agent solve?',
            'Who are the users? What domain is this in?',
            'What systems or data does it need access to?',
          ],
          what_to_build: {
            'problem.statement': 'Clear problem description (min 10 chars)',
            'problem.context': 'Domain context and background',
            'problem.goals': 'What the skill aims to achieve',
          },
          exit_criteria: 'problem.statement is defined and >= 10 characters',
          tips: [
            'Always suggest a concrete problem statement — don\'t just ask',
            'Include the domain context to help with later phases',
          ],
        },
        {
          id: 'SCENARIO_EXPLORATION',
          order: 2,
          label: 'Scenario Exploration',
          goal: 'Define concrete use cases that demonstrate the skill in action',
          what_to_ask: [
            'What are the most common situations this agent will handle?',
            'Walk me through a typical interaction step by step',
            'What edge cases should the agent handle?',
          ],
          what_to_build: {
            'scenarios[]': 'Array of scenarios, each with id, title, description, steps, expected_outcome',
          },
          exit_criteria: 'At least 1 scenario with title, description, and steps',
          tips: [
            'Suggest 2-3 scenarios based on the problem statement',
            'Each scenario should map to a different user intent',
            'Include both happy path and edge cases',
          ],
        },
        {
          id: 'INTENT_DEFINITION',
          order: 3,
          label: 'Intent Definition',
          goal: 'Define the user intents this skill can handle',
          what_to_ask: [
            'What distinct requests can users make?',
            'For each intent, what are example phrases a user might say?',
            'What should happen when an unrecognized request comes in?',
          ],
          what_to_build: {
            'intents.supported[]': 'Array of intents, each with id, description, and examples (diverse phrasings)',
            'intents.thresholds': 'Confidence thresholds for accept/clarify/reject',
            'intents.out_of_domain': 'What to do with unrecognized requests',
          },
          exit_criteria: 'At least 1 intent with at least 1 example',
          tips: [
            'Derive intents from the scenarios — each scenario usually maps to 1-2 intents',
            'Example phrases should be diverse, not repetitive',
            'Set out_of_domain to redirect for multi-skill solutions',
          ],
        },
        {
          id: 'TOOLS_PROPOSAL',
          order: 4,
          label: 'Tools Proposal',
          goal: 'Propose the tools (actions) this agent needs',
          what_to_ask: [
            'What actions does the agent need to perform?',
            'What data does it need to read or write?',
            'Which external systems does it connect to?',
          ],
          what_to_build: {
            'tools[]': 'Initial tool definitions with name, description — details come in next phase',
            'connectors': 'Which MCP connectors provide these tools',
          },
          exit_criteria: 'At least 1 tool defined',
          tips: [
            'Map each scenario step to a tool',
            'Use naming convention: connector-prefix.resource.action (e.g., orders.order.get)',
            'Don\'t forget system tools (sys.askUser, sys.emitUserMessage) for user interaction',
          ],
        },
        {
          id: 'TOOL_DEFINITION',
          order: 5,
          label: 'Tool Definition',
          goal: 'Fully define each tool with inputs, outputs, source, and security',
          what_to_ask: [
            'For each tool: what inputs does it need? What does it return?',
            'What security classification? (public, internal, pii_read, pii_write, financial, destructive)',
            'Are there any conditions for when the tool should be blocked or require approval?',
          ],
          what_to_build: {
            'tools[].inputs': 'Input parameters with name, type, required, description',
            'tools[].output': 'Output type and description',
            'tools[].source': 'Source connector and MCP tool name',
            'tools[].security': 'Classification (required) and risk level',
            'tools[].policy': 'Access conditions, approval requirements',
          },
          exit_criteria: 'All tools have inputs defined and output.description',
          tips: [
            'Every tool needs security.classification — this is the most common validation error',
            'High-risk tools (pii_write, financial, destructive) need access_policy rules',
            'If the skill has >= 3 tools, suggest setting bootstrap_tools (up to 3 core tools always available to the planner)',
            'Add mock examples for each tool — needed for testing',
          ],
        },
        {
          id: 'POLICY_DEFINITION',
          order: 6,
          label: 'Policy Definition',
          goal: 'Define guardrails, workflows, and approval rules',
          what_to_ask: [
            'What should this agent NEVER do?',
            'What should it ALWAYS do?',
            'Are there specific sequences of steps that must be followed?',
            'Which actions need human approval?',
          ],
          what_to_build: {
            'policy.guardrails.never': 'Things the agent must never do',
            'policy.guardrails.always': 'Things the agent must always do',
            'policy.workflows': 'Named step sequences triggered by intents',
            'policy.approvals': 'Tools that need human approval',
            'policy.escalation': 'When and where to escalate',
          },
          exit_criteria: 'At least one guardrail (never or always) defined',
          tips: [
            'Guardrails should be specific and actionable',
            'Workflow steps use tool NAMES not IDs',
            'System tools (sys.askUser, sys.emitUserMessage) are valid workflow steps',
          ],
        },
        {
          id: 'MOCK_TESTING',
          order: 7,
          label: 'Mock Testing',
          goal: 'Add mock data for tools and test scenarios without real backends',
          what_to_ask: [
            'What should each tool return in a typical case?',
            'What error cases should we test?',
          ],
          what_to_build: {
            'tools[].mock': 'Mock configuration with mode and example input/output pairs',
            'tools[].mock_status': 'Set to "tested" or "skipped" for each tool',
          },
          exit_criteria: 'All tools have mock_status != "untested"',
          tips: [
            'Mock examples should cover both success and error cases',
            'Set mock_status to "skipped" for tools that don\'t need mock testing',
          ],
        },
        {
          id: 'READY_TO_EXPORT',
          order: 8,
          label: 'Ready to Export',
          goal: 'Final validation gate — all checks must pass',
          what_to_do: [
            'Run adas_validate_skill to check for errors',
            'Fix any validation errors',
            'Review the complete skill definition',
          ],
          what_to_build: {
            'role': 'Ensure role.name and role.persona are set',
            'engine': 'Set model, temperature, rv2, hlr, autonomy',
            'grant_mappings': 'If this skill issues grants for other skills',
            'access_policy': 'If this skill consumes grants from other skills',
          },
          exit_criteria: 'Validation returns ready_to_export = true with no errors',
          tips: [
            'Use adas_validate_skill to get the full validation report',
            'The engine section needs the full structure (model, temperature, rv2, hlr, autonomy) — not just shortcuts',
          ],
        },
        {
          id: 'EXPORTED',
          order: 9,
          label: 'Exported / Deployed',
          goal: 'Skill is deployed and running',
          what_to_do: [
            'Deploy via adas_deploy_solution (recommended) or adas_deploy_skill',
            'Verify deployment with adas_get_solution (view: "health")',
          ],
        },
      ],
      completeness_fields: [
        'problem — problem.statement >= 10 chars',
        'scenarios — at least 1 scenario with title and description',
        'role — role.name and role.persona defined',
        'intents — at least 1 intent with description and examples',
        'tools — at least 1 tool with name, description, and output',
        'policy — guardrails section with at least 1 never or always rule',
        'engine — model and temperature set',
        'mocks_tested — all tools have mock_status != "untested"',
      ],
    },

    solution_workflow: {
      description: 'State machine for building a multi-skill A-Team solution (the architecture layer that connects skills)',
      note: 'Build each skill individually first using the skill workflow. Then use this workflow to define how skills work together.',
      phases: [
        {
          id: 'SOLUTION_DISCOVERY',
          order: 1,
          label: 'Solution Discovery',
          goal: 'Understand the overall solution shape',
          what_to_ask: [
            'What problem does this multi-agent solution solve?',
            'How many skills/agents will it need?',
            'What types of users interact with it? (customers, admins, operators)',
            'What channels does it serve? (chat, email, API, scheduled tasks)',
            'Is there an identity/security gateway?',
          ],
          what_to_build: {
            'id': 'Solution identifier',
            'name': 'Solution display name',
            'description': 'What this multi-agent solution does',
          },
          exit_criteria: 'Basic solution shape is understood — name, description, rough skill count',
          tips: [
            'Suggest a solution pattern based on the domain (e-commerce, helpdesk, HR)',
            'Most solutions have: gateway (identity) → worker(s) → optional approval skill',
          ],
        },
        {
          id: 'IDENTITY_DESIGN',
          order: 2,
          label: 'Identity Design (Users & Roles)',
          goal: 'Define who uses this solution — user types, admin roles, defaults',
          what_to_ask: [
            'What types of users will interact with this solution?',
            'Which roles should have admin privileges?',
            'What is the default user type for unknown/anonymous users?',
          ],
          what_to_build: {
            'identity.actor_types[]': 'Each with key, label, description',
            'identity.admin_roles': 'Keys that get admin access',
            'identity.default_actor_type': 'Default for new users',
          },
          exit_criteria: 'At least 2 actor types, admin_roles set, default_actor_type set',
          tips: [
            'Always suggest concrete user types with examples — don\'t just ask',
            'Common patterns: customer + admin, patient + doctor, employee + manager',
          ],
        },
        {
          id: 'SKILL_TOPOLOGY',
          order: 3,
          label: 'Skill Topology',
          goal: 'Define each skill with its role in the solution',
          what_to_ask: [
            'Which skill handles the entry point (gateway)?',
            'Which skills do the actual work (workers)?',
            'Do you need an orchestrator or approval skill?',
          ],
          what_to_build: {
            'skills[]': 'Each with id, name, role (gateway/worker/orchestrator/approval), description, entry_channels, connectors',
          },
          exit_criteria: 'At least 2 skills defined with roles',
          tips: [
            'Roles: gateway = entry point + identity, worker = does the work, orchestrator = coordinates, approval = human-in-the-loop',
            'Each skill should have a clear, single responsibility',
          ],
        },
        {
          id: 'GRANT_ECONOMY',
          order: 4,
          label: 'Grant Economy',
          goal: 'Define the verified claims that flow between skills',
          what_to_ask: [
            'What information does each worker skill need from the gateway?',
            'What verified claims should flow between skills? (e.g., customer_id, assurance_level)',
            'How are grants issued? (from tool responses via grant_mapping, or via handoff)',
          ],
          what_to_build: {
            'grants[]': 'Each with key, description, issued_by, consumed_by, issued_via, source_tool, source_field',
          },
          exit_criteria: 'At least 1 grant defined',
          tips: [
            'Grants are the security backbone — they ensure skills only act on verified data',
            'Common grants: customer_id, assurance_level, employee_id, session_token',
            'Use namespace.name format (e.g., ecom.customer_id)',
          ],
        },
        {
          id: 'HANDOFF_DESIGN',
          order: 5,
          label: 'Handoff Design',
          goal: 'Define how conversations transfer between skills and which grants propagate',
          what_to_ask: [
            'When should the gateway hand off to a worker? What triggers it?',
            'Which grants should be passed to the target skill?',
            'Should any grants be revoked after handoff?',
          ],
          what_to_build: {
            'handoffs[]': 'Each with id, from, to, trigger, grants_passed, grants_dropped, mechanism',
          },
          exit_criteria: 'All inter-skill flows have handoff definitions',
          tips: [
            'handoff-controller-mcp = live conversation transfer (user keeps chatting, different skill answers)',
            'internal-message = async skill-to-skill (background coordination)',
            'Every handoff needs a unique id',
          ],
        },
        {
          id: 'ROUTING_CONFIG',
          order: 6,
          label: 'Routing Configuration',
          goal: 'Map each channel to its default entry skill',
          what_to_ask: [
            'Which skill should answer Telegram messages?',
            'Which skill should handle emails?',
            'Which skill handles API/webhook calls?',
          ],
          what_to_build: {
            'routing': 'Object mapping channel names to { default_skill, description }',
          },
          exit_criteria: 'All declared channels have routing configured',
          tips: [
            'Usually all channels route to the gateway skill first',
            'API/webhook channels might go directly to an orchestrator',
          ],
        },
        {
          id: 'SECURITY_CONTRACTS',
          order: 7,
          label: 'Security Contracts',
          goal: 'Define cross-skill grant requirements for tools',
          what_to_ask: [
            'Which tools in worker skills need verified grants before they can run?',
            'Which gateway skill provides those grants?',
            'What grant values are required? (e.g., assurance_level must be L1 or L2)',
          ],
          what_to_build: {
            'security_contracts[]': 'Each with name, consumer, provider, requires_grants, required_values, for_tools, validation',
          },
          exit_criteria: 'At least 1 security contract for the main consumer skill',
          tips: [
            'Security contracts formalize the grant economy into enforceable rules',
            'consumer = skill being constrained, provider = skill that issues the grants',
          ],
        },
        {
          id: 'VALIDATION',
          order: 8,
          label: 'Validation',
          goal: 'Run validation and fix any issues',
          what_to_do: [
            'Run adas_validate_solution with the full solution + all skill definitions',
            'Fix any errors (warnings are OK)',
            'Review the complete solution architecture',
          ],
          exit_criteria: 'No validation errors',
          tips: [
            'Common errors: orphan skills, broken handoff chains, missing grant providers',
            'After validation passes, deploy with adas_deploy_solution',
          ],
        },
      ],
    },

    conversation_guide: {
      description: 'How to drive the build conversation as a hosting AI',
      principles: [
        'Follow the phase order — don\'t skip ahead',
        'At each phase, suggest concrete examples based on the domain — never ask bare questions',
        'Build the definition incrementally — add to it after each user response',
        'Validate frequently — run adas_validate_skill or adas_validate_solution after major changes',
        'One topic at a time — complete one phase before moving to the next',
        'Show progress — tell the user which phase they\'re in and what\'s next',
      ],
      opening_message: 'When the user wants to build something, start with: "I\'m an A-Team Solution Architect. I\'ll help you design and deploy a multi-agent AI system. Let\'s start — what problem do you want to solve?"',
      tools_to_use: {
        'adas_get_spec': 'Fetch the full schema when you need field details',
        'adas_get_examples': 'Show the user a working example for reference',
        'adas_validate_skill': 'Validate after completing tools, policy, and engine phases',
        'adas_validate_solution': 'Validate the full solution before deploy',
        'adas_deploy_solution': 'Deploy when validation passes',
        'adas_get_solution': 'Verify deployment health after deploy',
      },
    },
  };
}

function buildSolutionSpec() {
  return {
    spec_version: '1.0.0',
    description: 'Complete A-Team solution definition specification. A solution orchestrates multiple skills into a cohesive multi-agent system with shared grants, handoffs, and routing.',

    schema: {
      // ── Metadata ──
      id: { type: 'string', required: true, description: 'Unique solution identifier' },
      name: { type: 'string', required: true, description: 'Solution display name' },
      version: { type: 'string', required: false, description: 'Semantic version' },
      description: { type: 'string', required: false, description: 'What this multi-agent solution does' },

      // ── Identity ──
      identity: {
        type: 'object', required: false,
        description: 'Actor types and access control for the solution',
        fields: {
          actor_types: {
            type: 'array', required: true,
            description: 'Define who can use this solution',
            item_schema: {
              key: { type: 'string', required: true, description: 'Actor type identifier (e.g., "customer", "agent")' },
              label: { type: 'string', required: true, description: 'Display name' },
              description: { type: 'string', required: false },
              default_channel: { type: 'string', required: false, description: 'Default entry channel for this actor type' },
            },
          },
          default_actor_type: { type: 'string', description: 'Default actor type if not specified. Must match an actor_types[].key' },
          admin_roles: { type: 'string[]', description: 'Actor type keys that have admin privileges' },
        },
      },

      // ── Skills ──
      skills: {
        type: 'array', required: true, min_items: 1,
        description: 'The autonomous agents in this solution',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique skill ID (must match the skill definition id)' },
          name: { type: 'string', required: true },
          role: {
            type: 'enum', required: true,
            values: ['gateway', 'worker', 'orchestrator', 'approval'],
            description: 'gateway = entry point (identity/routing), worker = does the work, orchestrator = coordinates, approval = authorizes',
          },
          description: { type: 'string', required: true },
          entry_channels: { type: 'string[]', required: false, description: 'Channels where external actors can reach this skill' },
          connectors: { type: 'string[]', required: false, description: 'MCP connector IDs this skill uses' },
          ui_capable: { type: 'boolean', required: false, description: 'Whether this skill serves UI plugins' },
          prompt: { type: 'string', required: false, description: 'System prompt for this skill in the solution context' },
          example_conversations: {
            type: 'array', required: false,
            item_schema: {
              title: { type: 'string' },
              messages: { type: 'array', item_schema: { role: { type: 'string' }, content: { type: 'string' } } },
            },
          },
        },
      },

      // ── Grants ──
      grants: {
        type: 'array', required: false,
        description: 'Verified claims that flow between skills. The grant economy is the security backbone of the solution.',
        item_schema: {
          key: { type: 'string', required: true, description: 'Grant identifier with namespace (e.g., "ecom.customer_id")' },
          description: { type: 'string', required: true },
          values: { type: 'string[]', required: false, description: 'Allowed values for enum grants (e.g., ["L0", "L1", "L2"])' },
          issued_by: { type: 'string[]', required: true, description: 'Skill IDs that can issue this grant' },
          consumed_by: { type: 'string[]', required: true, description: 'Skill IDs that need this grant' },
          issued_via: { type: 'enum', values: ['grant_mapping', 'handoff', 'platform'] },
          source_tool: { type: 'string', required: false, description: 'Tool whose output creates this grant' },
          source_field: { type: 'string', required: false, description: 'JSON path into tool result (e.g., "$.candidates[0].customer_id")' },
          ttl_seconds: { type: 'number', required: false, description: 'How long the grant lives (omit for permanent)' },
          internal: { type: 'boolean', required: false, description: 'If true, grant is not visible outside issuing skill' },
        },
      },

      // ── Handoffs ──
      handoffs: {
        type: 'array', required: false,
        description: 'Skill-to-skill conversation transfers with grant propagation',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique handoff ID' },
          from: { type: 'string', required: true, description: 'Source skill ID' },
          to: { type: 'string', required: true, description: 'Destination skill ID' },
          trigger: { type: 'string', required: true, description: 'When this handoff happens (human-readable)' },
          grants_passed: { type: 'string[]', required: true, description: 'Grant keys to transfer to target skill' },
          grants_dropped: { type: 'string[]', required: false, description: 'Grant keys to revoke after handoff' },
          mechanism: {
            type: 'enum', values: ['handoff-controller-mcp', 'internal-message'],
            description: 'handoff-controller-mcp = live conversation transfer, internal-message = async skill-to-skill',
          },
          ttl_seconds: { type: 'number', required: false, description: 'How long the handoff session lives' },
        },
      },

      // ── Routing ──
      routing: {
        type: 'object', required: false,
        description: 'Channel-to-skill routing. Maps each channel to its default entry skill.',
        note: 'Each key is a channel name (telegram, email, api, dashboard, etc.). Value is an object with default_skill and description.',
        example: {
          telegram: { default_skill: '<gateway-skill-id>', description: 'All Telegram messages go to identity verification first' },
          api: { default_skill: '<orchestrator-skill-id>', description: 'Webhooks and API calls go to orchestrator' },
        },
      },

      // ── Platform Connectors ──
      platform_connectors: {
        type: 'array', required: false,
        description: 'Infrastructure-level MCP connectors the solution needs',
        item_schema: {
          id: { type: 'string', required: true, description: 'Connector ID' },
          required: { type: 'boolean', description: 'Is this connector required for the solution to work?' },
          description: { type: 'string' },
          used_by: { type: 'string[]', required: false, description: 'Which skill IDs use this connector' },
          ui_capable: { type: 'boolean', required: false },
        },
      },

      // ── Security Contracts ──
      security_contracts: {
        type: 'array', required: false,
        description: 'Cross-skill grant requirements. Defines which tools require which grants from which providers.',
        item_schema: {
          name: { type: 'string', required: true, description: 'Contract name (human-readable)' },
          consumer: { type: 'string', required: true, description: 'Skill ID that is constrained' },
          requires_grants: { type: 'string[]', required: true, description: 'Grant keys required' },
          required_values: { type: 'object', required: false, description: 'Specific values required (e.g., { "ecom.assurance_level": ["L1", "L2"] })' },
          provider: { type: 'string', required: true, description: 'Skill ID that issues the required grants' },
          for_tools: { type: 'string[]', required: true, description: 'Tool names protected by this contract' },
          validation: { type: 'string', required: false, description: 'Human-readable validation description' },
          response_filter: { type: 'string', required: false, description: 'Named response filter to apply' },
        },
      },
    },

    // ── Models ──
    models: {
      grant_economy: {
        description: 'How verified claims flow between skills in A-Team',
        lifecycle: [
          '1. Skill calls a tool (e.g., identity.candidates.search)',
          '2. Platform checks grant_mapping rules for that tool',
          '3. On match, extract value via source_field JSON path from tool result',
          '4. Grant stored in conversation context with optional TTL',
          '5. On handoff, grants listed in grants_passed propagate to target skill',
          '6. Grants listed in grants_dropped are removed from context',
          '7. Target skill access_policy checks required grants before tool execution',
          '8. Grants expire after ttl_seconds (if set)',
        ],
        key_concepts: {
          grant: 'A verified claim (key-value pair) attached to a conversation',
          grant_mapping: 'Rule that auto-issues a grant when a tool returns successfully',
          access_policy: 'Declarative rules that check grants before allowing tool execution',
          security_contract: 'Cross-skill agreement defining which grants are required for which tools',
        },
      },
      handoff_flow: {
        description: 'How conversations transfer between skills',
        mechanisms: {
          'handoff-controller-mcp': 'Live conversation transfer via platform MCP. Source skill calls handoff.transfer with target_skill, grants, and context. Platform routes subsequent messages to target skill.',
          'internal-message': 'Async skill-to-skill message. Does not redirect the user conversation. Used for background coordination.',
        },
        grant_propagation: 'On handoff, grants_passed are forwarded to target skill context. grants_dropped are removed. This ensures the target has exactly the grants it needs.',
      },
      quality_scoring: {
        description: 'How solution quality is assessed via LLM (POST /validate/solution)',
        dimensions: DIMENSION_WEIGHTS,
        grade_thresholds: GRADE_THRESHOLDS,
        note: 'Quality scoring requires LLM API key (ANTHROPIC_API_KEY or OPENAI_API_KEY). If unavailable, structural validation still works.',
      },
    },

    // ── Validation Rules ──
    validation_rules: {
      description: 'What POST /validate/solution checks',
      checks: [
        { name: 'identity_actor_types', description: 'Actor types are defined', severity: 'warning' },
        { name: 'identity_admin_roles', description: 'Admin roles are defined when actor types exist', severity: 'warning' },
        { name: 'identity_default_type_valid', description: 'Default actor type matches a defined actor type', severity: 'error' },
        { name: 'grant_provider_exists', description: 'Every grant issuer is a skill in the solution', severity: 'error' },
        { name: 'grant_consumer_exists', description: 'Every grant consumer is a skill in the solution', severity: 'error' },
        { name: 'grant_provider_missing', description: 'Consumed grants have at least one issuer', severity: 'error' },
        { name: 'handoff_from_exists', description: 'Handoff source skill exists in the solution', severity: 'error' },
        { name: 'handoff_to_exists', description: 'Handoff target skill exists in the solution', severity: 'error' },
        { name: 'contract_consumer_exists', description: 'Security contract consumer/provider skills exist', severity: 'error' },
        { name: 'no_orphan_skills', description: 'Every skill is reachable via routing or handoffs', severity: 'warning' },
        { name: 'no_circular_handoffs', description: 'No infinite loops in handoff chains', severity: 'error' },
      ],
    },

    // ── Template ──
    template: {
      description: 'Minimal valid solution definition. Fill placeholders marked with <...>.',
      solution: {
        id: '<solution-id>',
        name: '<Solution Name>',
        version: '0.1.0',
        description: '<What this multi-agent solution does>',
        identity: {
          actor_types: [
            { key: 'end_user', label: 'End User', description: '<Who uses this solution>' },
          ],
          default_actor_type: 'end_user',
          admin_roles: [],
        },
        skills: [
          {
            id: '<gateway-skill-id>',
            name: '<Gateway Skill>',
            role: 'gateway',
            description: '<Entry point skill — identity verification or routing>',
            entry_channels: ['telegram', 'email'],
            connectors: ['<connector-id>'],
          },
          {
            id: '<worker-skill-id>',
            name: '<Worker Skill>',
            role: 'worker',
            description: '<Skill that does the actual work>',
            connectors: ['<connector-id>'],
          },
        ],
        grants: [
          {
            key: '<namespace.grant_name>',
            description: '<What this grant represents>',
            issued_by: ['<gateway-skill-id>'],
            consumed_by: ['<worker-skill-id>'],
            issued_via: 'grant_mapping',
            source_tool: '<tool-name>',
            source_field: '$.result.field',
          },
        ],
        handoffs: [
          {
            id: 'gateway-to-worker',
            from: '<gateway-skill-id>',
            to: '<worker-skill-id>',
            trigger: '<When to transfer>',
            grants_passed: ['<namespace.grant_name>'],
            grants_dropped: [],
            mechanism: 'handoff-controller-mcp',
          },
        ],
        routing: {
          telegram: { default_skill: '<gateway-skill-id>', description: 'All messages go to gateway first' },
          email: { default_skill: '<gateway-skill-id>', description: 'All emails go to gateway first' },
        },
        platform_connectors: [
          {
            id: '<connector-id>',
            name: '<Connector Name>',
            description: '<What this connector does>',
          },
        ],
        security_contracts: [
          {
            name: '<Contract name — human-readable>',
            consumer: '<worker-skill-id>',
            provider: '<gateway-skill-id>',
            requires_grants: ['<namespace.grant_name>'],
            required_values: { '<namespace.assurance_level>': ['L1'] },
            for_tools: ['<tool-name-1>', '<tool-name-2>'],
            validation: '<Human-readable explanation of what this contract enforces>',
          },
        ],
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building a multi-skill A-Team solution.',
      build_order: [
        '1. Build each skill individually first — each must pass POST /validate/skill',
        '2. Write connector source code — real MCP server implementations (Node.js/Python) with business logic, database access, UI dashboards',
        '3. Define identity: who uses this solution? Create actor_types (customer, agent, admin, etc.)',
        '4. Map the grant economy: what verified claims flow between skills? (e.g., customer_id, assurance_level)',
        '5. Define handoffs: how do conversations transfer between skills? What grants propagate?',
        '6. Set up routing: which skill answers which channel? (telegram, email, api)',
        '7. Add security contracts: which grants protect which tools across skill boundaries?',
        '8. POST /validate/solution with { "solution": <def>, "skills": [<skill1>, <skill2>] }',
        '9. POST /deploy/solution with { solution, skills, connectors, mcp_store } — the Skill Builder imports everything, auto-generates Python MCP servers from skill tool definitions, and deploys to A-Team Core. No slug or Python MCP code needed for skills.',
      ],
      naming_conventions: {
        solution_id: 'lowercase-kebab-case (e.g., "ecom-customer-service")',
        grant_key: 'namespace.name (e.g., "ecom.customer_id", "hr.employee_id")',
        handoff_id: 'descriptive from-to (e.g., "identity-to-orders", "orders-to-returns")',
      },
      common_mistakes: [
        'Grant consumed_by referencing skills not in this solution → validation error',
        'Missing handoff path between grant provider and consumer — grants only flow via handoffs',
        'Orphan skills not reachable via routing or handoffs → validation warning',
        'Circular handoff chains (A → B → A) → validation error',
        'Routing target skills that do not exist in the solution → validation error',
        'Forgetting to declare handoff-controller-mcp as a platform connector',
        'Security contract provider/consumer referencing non-existent skills',
        'Using "grants_propagated" instead of "grants_passed" in handoffs — the correct field name is grants_passed',
        'Using { tool, skill } in security_contracts instead of { name, consumer, provider, for_tools } — see the template and example for the correct schema',
        'Missing "id" field on handoffs — every handoff needs a unique id',
        'Deploying directly to A-Team Core instead of through the Skill Builder — always use POST /deploy/solution which routes through the Skill Builder for proper storage and MCP generation',
        'Writing Python MCP server code for skills — only connector implementations need real code. Skill MCP servers are auto-generated from tool definitions.',
        'Defining stdio connectors without providing mcp_store code — if the connector server code is not pre-installed on A-Team Core, include it in the mcp_store field of the deploy payload. Without it, the connector will fail to start.',
        'Forgetting "type": "module" in package.json when using ESM imports or @modelcontextprotocol/sdk — Node.js 22.x supports ESM fully but needs the package.json declaration.',
        'Manually remapping skill IDs after deploy — ID remapping is now automatic. The deploy pipeline deep-replaces original IDs with internal dom_xxx IDs in grants, handoffs, routing, and security_contracts.',
      ],
      key_concepts: {
        skill_roles: 'gateway = entry point (identity/routing), worker = does the work, orchestrator = coordinates multiple workers, approval = authorizes actions',
        grant_lifecycle: '1. Skill calls tool → 2. grant_mapping extracts value from result → 3. Grant stored in conversation → 4. On handoff, grants_passed propagate → 5. Target skill access_policy checks grants → 6. Grant expires after ttl_seconds',
        handoff_mechanisms: '"handoff-controller-mcp" = live conversation transfer (user sees new skill), "internal-message" = async skill-to-skill (background coordination)',
        security_contracts: 'Cross-skill agreements: "skill X cannot use tools Y and Z unless skill W has issued grants A and B". Enforced at the solution level.',
      },
    },
  };
}
