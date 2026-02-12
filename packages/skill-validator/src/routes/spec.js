/**
 * ADAS Specification API routes
 *
 * Serves the complete ADAS multi-agent specification as structured JSON
 * so that any external agent (LLM, CI tool, IDE plugin) can understand
 * how to build valid ADAS skills and solutions.
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
const INDEX = buildIndex();

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', (_req, res) => res.set(CACHE_HEADERS).json(INDEX));
router.get('/enums', (_req, res) => res.set(CACHE_HEADERS).json(ENUMS));
router.get('/skill', (_req, res) => res.set(CACHE_HEADERS).json(SKILL_SPEC));
router.get('/solution', (_req, res) => res.set(CACHE_HEADERS).json(SOLUTION_SPEC));

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildIndex() {
  return {
    service: '@adas/skill-validator',
    version: '1.0.0',
    description: 'ADAS External Agent API — learn, build, validate, and deploy ADAS multi-agent solutions',
    getting_started: [
      '1. GET /spec/skill — read the skill specification and agent guide',
      '2. GET /spec/examples/skill — study a complete working example',
      '3. Build your skill definition following the schema',
      '4. POST /validate/skill — validate and fix errors',
      '5. GET /spec/solution — read the solution specification when ready to compose skills',
      '6. POST /validate/solution — validate the full solution',
      '7. POST /deploy/solution — deploy to ADAS Core',
    ],
    endpoints: {
      '/spec/enums': {
        method: 'GET',
        description: 'All ADAS enum values in a flat lookup (phases, data types, classifications, tones, etc.)',
      },
      '/spec/skill': {
        method: 'GET',
        description: 'Complete ADAS skill specification: schema, validation rules, system tools, agent guide, and template',
      },
      '/spec/solution': {
        method: 'GET',
        description: 'Complete ADAS solution specification: multi-skill architecture, grant economy, handoffs, routing, security contracts, agent guide, and template',
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
      'POST /deploy/connector': 'Deploy a connector to ADAS Core (create/update + start)',
      'POST /deploy/skill': 'Deploy a skill MCP server to ADAS Core',
      'POST /deploy/solution': 'Deploy a full solution (identity + connectors + skills)',
      'GET /health': 'Health check',
    },
  };
}

function buildEnums() {
  return {
    description: 'All ADAS enum values. Use these when building skill and solution YAML files.',
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
    description: 'Complete ADAS skill definition specification. A skill is an autonomous AI agent with tools, policies, and workflows.',

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
      description: 'Tools provided by the ADAS runtime — do NOT define these in your tools array',
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
          max_iterations: 10,
          max_replans: 2,
        },
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building an ADAS skill from scratch.',
      build_order: [
        '1. GET /spec/enums — learn all valid enum values',
        '2. GET /spec/skill — study the schema, validation rules, and system tools',
        '3. GET /spec/examples/skill — see a complete working example that passes validation',
        '4. Define your connectors — what external systems (MCP servers) does your agent need?',
        '5. Build the skill definition following this order: problem → scenarios → role → intents → tools → policy → engine',
        '6. POST /validate/skill with { "skill": <your definition> } — fix all errors before proceeding',
        '7. POST /deploy/connector — deploy each connector to ADAS Core',
        '8. POST /deploy/skill — deploy the skill MCP server code to ADAS Core',
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
        'Forgetting security.classification on tools — every tool needs one',
        'High-risk tools (pii_write, financial, destructive) without access_policy rules → validation error',
        'Workflow steps referencing tool IDs instead of tool names — steps use tool.name not tool.id',
        'Tool source.connection_id not matching a connector in the skill.connectors array',
        'Intent examples that are too similar to each other — use diverse phrasings',
        'Missing mock examples for tools — needed for testing without real MCP connections',
        'Guardrails that contradict tool capabilities without access_policy to resolve the conflict',
        'Using invalid enum values — always check GET /spec/enums first',
      ],
      key_concepts: {
        tool_vs_system_tool: 'Your tools come from MCP connectors. System tools (sys.*, ui.*, cp.*) are provided by the ADAS runtime — do NOT define them in your tools array.',
        grant_economy: 'Grants are verified claims that flow between skills. A skill issues grants via grant_mappings (tool output → grant). Another skill requires grants via access_policy. Security contracts enforce this at the solution level.',
        workflow_steps: 'Workflow steps are tool NAMES (not IDs). Example: ["orders.order.get", "sys.emitUserMessage"]. System tools are valid step targets.',
        access_policy_effects: '"allow" = permit unconditionally, "deny" = block, "constrain" = inject values into tool inputs (e.g., force customer_id from grant). Use "*" in tools array to cover all tools.',
      },
    },
  };
}

function buildSolutionSpec() {
  return {
    spec_version: '1.0.0',
    description: 'Complete ADAS solution definition specification. A solution orchestrates multiple skills into a cohesive multi-agent system with shared grants, handoffs, and routing.',

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
        description: 'How verified claims flow between skills in ADAS',
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
        platform_connectors: [],
        security_contracts: [],
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building a multi-skill ADAS solution.',
      build_order: [
        '1. Build each skill individually first — each must pass POST /validate/skill',
        '2. Define identity: who uses this solution? Create actor_types (customer, agent, admin, etc.)',
        '3. Map the grant economy: what verified claims flow between skills? (e.g., customer_id, assurance_level)',
        '4. Define handoffs: how do conversations transfer between skills? What grants propagate?',
        '5. Set up routing: which skill answers which channel? (telegram, email, api)',
        '6. Add security contracts: which grants protect which tools across skill boundaries?',
        '7. POST /validate/solution with { "solution": <def>, "skills": [<skill1>, <skill2>] }',
        '8. POST /deploy/solution to deploy everything at once (identity → connectors → skills)',
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
