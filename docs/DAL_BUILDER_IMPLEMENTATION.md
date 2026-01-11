# DAL Builder Implementation Plan

**Version:** 1.0
**Date:** January 2025
**Status:** Implementation Ready
**Parent Doc:** [ADAS-DAL-DESIGN.md](https://github.com/ariekogan/ai-dev-assistant/blob/main/Docs/WIP/ADAS-DAL-DESIGN.md)

---

## Executive Summary

This document transforms the MCP ToolBox Builder into the **DAL (Domain Abstraction Layer) Builder** - a tool for creating complete domain configurations for the ADAS platform, not just MCP servers.

### What Changes

| Before (ToolBox Builder) | After (DAL Builder) |
|--------------------------|---------------------|
| Creates MCP servers | Creates Domain packages (domain.yaml) |
| Tool definitions only | Tools + Policy + Engine + Intents |
| Tool-first authoring | Bidirectional: tool-first OR policy-first |
| Shallow validation | Continuous validation pipeline |
| Export = Python MCP | Export = domain.yaml + optional MCP |

---

## Table of Contents

1. [Non-Negotiables](#1-non-negotiables)
2. [DraftDomain Schema](#2-draftdomain-schema)
3. [Migration from Current State](#3-migration-from-current-state)
4. [Validator Pipeline](#4-validator-pipeline)
5. [Phase Machine Updates](#5-phase-machine-updates)
6. [File Structure Changes](#6-file-structure-changes)
7. [API Changes](#7-api-changes)
8. [UI Updates](#8-ui-updates)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Non-Negotiables

These design decisions are **frozen** and must be preserved throughout implementation:

### 1.1 Tools ↔ Policy Bidirectionality

Support both authoring modes:

```
TOOL-FIRST                          POLICY-FIRST
───────────                         ────────────
1. Define tools                     1. Define guardrails
2. Add policies per tool            2. Define workflows
3. Validate                         3. Discover needed tools
                                    4. Build/import tools
                                    5. Validate

Both modes produce the same DraftDomain structure
```

**Implementation Requirements:**
- Allow unresolved references (policy → missing tool_id, workflow → missing step)
- Track `*_resolved: boolean` for each reference
- Block export until all references resolved
- UI shows unresolved refs as warnings, not errors (until export)

### 1.2 Every Change Must Be Validated

Validation runs after **every** `state_update`:

```
state_update ──► Schema Validator ──► Reference Resolver ──► Result
                     │                      │                  │
                     │ • Type checks        │ • tool_id ok?    │ errors[]
                     │ • Required fields    │ • workflow ok?   │ warnings[]
                     │ • Enum values        │ • policy refs?   │ unresolved{}
                     │                      │                  │ ready_to_export
                     │                      ▼                  │
                     │            [Optional LLM Validator]     │
                     │            • Semantic consistency       │
                     │            • Conflict detection         │
```

### 1.3 Every Property Must Have Examples

**System-wide UX rule:** No question or field without examples.

| Surface | Implementation |
|---------|----------------|
| Chat | Prompt instructs: "never ask without an example" |
| UI Fields | Schema-driven tooltips with `examples[]` |
| API | Field metadata includes `examples[]` and `template` |

---

## 2. DraftDomain Schema

The canonical object shared by chat and UI. Replaces `project.json` + `toolbox.json`.

### 2.1 TypeScript Interface

```typescript
// types/DraftDomain.ts

export type Phase =
  | 'PROBLEM_DISCOVERY'
  | 'SCENARIO_EXPLORATION'
  | 'INTENT_DEFINITION'      // NEW
  | 'TOOLS_PROPOSAL'
  | 'TOOL_DEFINITION'
  | 'POLICY_DEFINITION'      // NEW
  | 'MOCK_TESTING'
  | 'READY_TO_EXPORT'
  | 'EXPORTED';

export interface DraftDomain {
  // ═══════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════
  id: string;
  name: string;
  description: string;
  version: string;
  phase: Phase;
  created_at: string;
  updated_at: string;

  // ═══════════════════════════════════════════════════════════════
  // PROBLEM & SCENARIOS (existing, restructured)
  // ═══════════════════════════════════════════════════════════════
  problem: {
    statement: string;
    context: string;
    goals: string[];
  };
  scenarios: Scenario[];

  // ═══════════════════════════════════════════════════════════════
  // PILLAR 1: DOMAIN DESCRIPTION
  // ═══════════════════════════════════════════════════════════════
  role: {
    name: string;
    persona: string;
    goals: string[];
    limitations: string[];
    communication_style?: {
      tone: 'formal' | 'casual' | 'technical';
      verbosity: 'concise' | 'balanced' | 'detailed';
    };
  };
  glossary: Record<string, string>;

  // ═══════════════════════════════════════════════════════════════
  // INTENTS (Step 0) - NEW
  // ═══════════════════════════════════════════════════════════════
  intents: {
    supported: Intent[];
    thresholds: {
      accept: number;      // Default: 0.8
      clarify: number;     // Default: 0.5
      reject: number;      // Default: 0.5
    };
    out_of_domain: {
      action: 'redirect' | 'reject' | 'escalate';
      message: string;
      suggest_domains?: string[];
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // PILLAR 2: ENGINE SETTINGS
  // ═══════════════════════════════════════════════════════════════
  engine: {
    rv2: {
      max_iterations: number;           // Default: 10
      iteration_timeout_ms: number;     // Default: 30000
      allow_parallel_tools: boolean;    // Default: false
      on_max_iterations: 'escalate' | 'fail' | 'ask_user';
    };
    hlr: {
      enabled: boolean;                 // Default: true
      critic: {
        enabled: boolean;
        check_interval: number;         // Default: 3
        strictness: 'low' | 'medium' | 'high';
      };
      reflection: {
        enabled: boolean;
        depth: 'shallow' | 'medium' | 'deep';
      };
      replanning: {
        enabled: boolean;
        max_replans: number;            // Default: 2
      };
    };
    autonomy: {
      level: 'autonomous' | 'supervised' | 'restricted';
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // PILLAR 3: TOOLBOX
  // ═══════════════════════════════════════════════════════════════
  toolbox_imports: ToolBoxImport[];     // From shared registry (future)
  tools: Tool[];                        // Domain-specific tools

  // ═══════════════════════════════════════════════════════════════
  // POLICY (First-Class!) - NEW
  // ═══════════════════════════════════════════════════════════════
  policy: {
    guardrails: {
      never: string[];                  // Things agent must NEVER do
      always: string[];                 // Things agent must ALWAYS do
    };
    approvals: ApprovalRule[];
    workflows: Workflow[];
    escalation: {
      enabled: boolean;
      conditions: string[];
      target: string;                   // queue name or handler
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // PILLAR 4: CHANNELS (Future)
  // ═══════════════════════════════════════════════════════════════
  channels: Channel[];

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION STATE (Continuous) - NEW
  // ═══════════════════════════════════════════════════════════════
  validation: ValidationResult;

  // ═══════════════════════════════════════════════════════════════
  // CONVERSATION (existing)
  // ═══════════════════════════════════════════════════════════════
  conversation: Message[];
}

// ═══════════════════════════════════════════════════════════════
// SUPPORTING TYPES
// ═══════════════════════════════════════════════════════════════

export interface Scenario {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expected_outcome: string;
}

export interface Intent {
  id: string;
  description: string;
  examples: string[];
  maps_to_workflow?: string;          // workflow.id reference
  maps_to_workflow_resolved: boolean;
  entities?: IntentEntity[];
  guardrails?: {
    pre_conditions: string[];
    rate_limit?: {
      max_per_session: number;
      cooldown_seconds: number;
      message: string;
    };
  };
}

export interface IntentEntity {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
  extract_from: 'message' | 'context';
}

export interface Tool {
  id: string;
  id_status: 'temporary' | 'permanent';
  name: string;
  description: string;
  inputs: ToolInput[];
  output: ToolOutput;

  // Inline policy (tool-level)
  policy: {
    allowed: 'always' | 'conditional' | 'never';
    conditions?: PolicyCondition[];
    requires_approval?: 'always' | 'conditional' | 'never';
    rate_limit?: string;              // e.g., "100/minute"
  };

  // Mock configuration
  mock: {
    enabled: boolean;
    mode: 'examples' | 'llm' | 'hybrid';
    examples: MockExample[];
    llm_rules?: string[];
  };
  mock_status: 'untested' | 'tested' | 'skipped';
  mock_test_results?: MockTestResult[];
}

export interface ToolInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
  enum?: string[];
}

export interface ToolOutput {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  schema?: Record<string, any>;
}

export interface MockExample {
  id: string;
  input: Record<string, any>;
  output: any;
  description?: string;
}

export interface MockTestResult {
  id: string;
  timestamp: string;
  input: Record<string, any>;
  expected_output?: any;
  actual_output: any;
  passed: boolean;
  notes?: string;
}

export interface PolicyCondition {
  when: string;                       // Expression: "amount > 500"
  action: 'allow' | 'deny' | 'escalate' | 'require_approval';
  message?: string;
}

export interface ApprovalRule {
  id: string;
  tool_id: string;                    // May be unresolved
  tool_id_resolved: boolean;
  conditions: PolicyCondition[];
  approver?: string;                  // Role or queue
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: string[];                    // Tool IDs (may be unresolved)
  steps_resolved: boolean[];          // Per-step resolution status
  required: boolean;                  // Must follow this sequence?
  on_deviation?: 'warn' | 'block' | 'ask_user';
}

export interface ToolBoxImport {
  import: string;                     // ToolBox ID from registry
  version: string;                    // Semver constraint
  overrides?: {
    tools?: {
      include?: string[];
      exclude?: string[];
    };
    policy?: Record<string, any>;
  };
}

export interface Channel {
  type: 'api' | 'slack' | 'email' | 'webhook';
  enabled: boolean;
  config: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  state_update?: Record<string, any>;
  suggested_focus?: SuggestedFocus;
}

export interface SuggestedFocus {
  panel: 'problem' | 'scenarios' | 'intents' | 'tools' | 'policy' | 'engine' | 'export';
  section?: string;
  field?: string;
  action?: 'add' | 'edit' | 'review';
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;                     // No blocking errors?
  ready_to_export: boolean;           // All requirements met?
  errors: ValidationIssue[];          // Block progress
  warnings: ValidationIssue[];        // Inform but allow
  unresolved: {
    tools: string[];                  // Referenced but not defined
    workflows: string[];              // Referenced but not defined
    intents: string[];                // Referenced but not defined
  };
  completeness: {
    problem: boolean;
    scenarios: boolean;
    role: boolean;
    intents: boolean;
    tools: boolean;
    policy: boolean;
    engine: boolean;
    mocks_tested: boolean;
  };
}

export interface ValidationIssue {
  code: string;                       // e.g., "TOOL_NOT_FOUND"
  severity: 'error' | 'warning';
  path: string;                       // e.g., "policy.workflows[0].steps[2]"
  message: string;
  suggestion?: string;
}
```

### 2.2 Default Values

```typescript
// utils/defaults.ts

export function createEmptyDraftDomain(id: string, name: string): DraftDomain {
  return {
    id,
    name,
    description: '',
    version: '0.1.0',
    phase: 'PROBLEM_DISCOVERY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    problem: {
      statement: '',
      context: '',
      goals: [],
    },
    scenarios: [],

    role: {
      name: '',
      persona: '',
      goals: [],
      limitations: [],
    },
    glossary: {},

    intents: {
      supported: [],
      thresholds: {
        accept: 0.8,
        clarify: 0.5,
        reject: 0.5,
      },
      out_of_domain: {
        action: 'redirect',
        message: '',
      },
    },

    engine: {
      rv2: {
        max_iterations: 10,
        iteration_timeout_ms: 30000,
        allow_parallel_tools: false,
        on_max_iterations: 'ask_user',
      },
      hlr: {
        enabled: true,
        critic: {
          enabled: true,
          check_interval: 3,
          strictness: 'medium',
        },
        reflection: {
          enabled: true,
          depth: 'shallow',
        },
        replanning: {
          enabled: true,
          max_replans: 2,
        },
      },
      autonomy: {
        level: 'supervised',
      },
    },

    toolbox_imports: [],
    tools: [],

    policy: {
      guardrails: {
        never: [],
        always: [],
      },
      approvals: [],
      workflows: [],
      escalation: {
        enabled: false,
        conditions: [],
        target: '',
      },
    },

    channels: [],

    validation: {
      valid: true,
      ready_to_export: false,
      errors: [],
      warnings: [],
      unresolved: {
        tools: [],
        workflows: [],
        intents: [],
      },
      completeness: {
        problem: false,
        scenarios: false,
        role: false,
        intents: false,
        tools: false,
        policy: false,
        engine: true,  // Has defaults
        mocks_tested: false,
      },
    },

    conversation: [],
  };
}
```

---

## 3. Migration from Current State

### 3.1 File Structure Migration

```
BEFORE (current):                    AFTER (DAL Builder):
/memory/projects/<id>/               /memory/domains/<id>/
├── project.json                     ├── domain.json         # DraftDomain
├── toolbox.json          ──►        │   (merged into domain.json)
├── conversation.json                │   (merged into domain.json)
└── exports/                         └── exports/
    └── mcp_server/                      ├── domain.yaml     # NEW
                                         └── mcp_server/     # Optional
```

### 3.2 Migration Function

```typescript
// utils/migrate.ts

import { DraftDomain, Tool, Scenario } from '../types/DraftDomain';
import { createEmptyDraftDomain } from './defaults';

interface LegacyProject {
  id: string;
  name: string;
  description: string;
  phase: string;
  created_at: string;
  updated_at: string;
}

interface LegacyToolbox {
  problem_statement: string;
  scenarios: any[];
  tools: any[];
}

interface LegacyConversation {
  messages: any[];
}

export function migrateToV2(
  project: LegacyProject,
  toolbox: LegacyToolbox,
  conversation: LegacyConversation
): DraftDomain {
  const domain = createEmptyDraftDomain(project.id, project.name);

  // Migrate metadata
  domain.description = project.description || '';
  domain.phase = mapPhase(project.phase);
  domain.created_at = project.created_at;
  domain.updated_at = new Date().toISOString();

  // Migrate problem
  domain.problem.statement = toolbox.problem_statement || '';

  // Migrate scenarios
  domain.scenarios = (toolbox.scenarios || []).map(migrateScenario);

  // Migrate tools
  domain.tools = (toolbox.tools || []).map(migrateTool);

  // Migrate conversation
  domain.conversation = (conversation.messages || []).map(migrateMessage);

  // Run validation
  domain.validation = validateDraftDomain(domain);

  return domain;
}

function mapPhase(oldPhase: string): Phase {
  const phaseMap: Record<string, Phase> = {
    'PROBLEM_DISCOVERY': 'PROBLEM_DISCOVERY',
    'SCENARIO_EXPLORATION': 'SCENARIO_EXPLORATION',
    'TOOLS_PROPOSAL': 'TOOLS_PROPOSAL',
    'TOOL_DEFINITION': 'TOOL_DEFINITION',
    'MOCK_TESTING': 'MOCK_TESTING',
    'READY_TO_EXPORT': 'READY_TO_EXPORT',
    'EXPORTED': 'EXPORTED',
  };
  return phaseMap[oldPhase] || 'PROBLEM_DISCOVERY';
}

function migrateTool(oldTool: any): Tool {
  return {
    id: oldTool.id || generateId(),
    id_status: 'permanent',
    name: oldTool.name || '',
    description: oldTool.description || '',
    inputs: (oldTool.inputs || []).map((i: any) => ({
      name: i.name,
      type: i.type || 'string',
      required: i.required ?? true,
      description: i.description || '',
    })),
    output: {
      type: oldTool.output?.type || 'object',
      description: oldTool.output?.description || '',
      schema: oldTool.output?.schema,
    },
    policy: {
      allowed: 'always',
      requires_approval: 'never',
    },
    mock: {
      enabled: true,
      mode: 'examples',
      examples: oldTool.mock?.examples || [],
    },
    mock_status: oldTool.mock?.tested ? 'tested' : 'untested',
  };
}

function migrateScenario(oldScenario: any): Scenario {
  return {
    id: oldScenario.id || generateId(),
    title: oldScenario.title || '',
    description: oldScenario.description || '',
    steps: oldScenario.steps || [],
    expected_outcome: oldScenario.expected_outcome || '',
  };
}
```

### 3.3 Auto-Migration on Load

```typescript
// services/domainService.ts

export async function loadDomain(id: string): Promise<DraftDomain> {
  const domainPath = `/memory/domains/${id}/domain.json`;
  const legacyPath = `/memory/projects/${id}`;

  // Try new format first
  if (await fileExists(domainPath)) {
    const domain = await readJson(domainPath);
    // Validate and return
    domain.validation = validateDraftDomain(domain);
    return domain;
  }

  // Try legacy format and migrate
  if (await fileExists(`${legacyPath}/project.json`)) {
    console.log(`Migrating legacy project ${id} to domain format`);

    const project = await readJson(`${legacyPath}/project.json`);
    const toolbox = await readJson(`${legacyPath}/toolbox.json`);
    const conversation = await readJson(`${legacyPath}/conversation.json`);

    const domain = migrateToV2(project, toolbox, conversation);

    // Save in new format
    await saveDomain(domain);

    // Optionally: archive old files
    await archiveLegacy(legacyPath);

    return domain;
  }

  throw new Error(`Domain ${id} not found`);
}
```

---

## 4. Validator Pipeline

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     VALIDATION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  applyStateUpdate(domain, update)                                   │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Apply Update    │  (existing applyStateUpdate logic)             │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Schema Validator│  • Type checks (Zod)                           │
│  │                 │  • Required fields                             │
│  │                 │  • Enum values                                 │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Reference       │  • tool_id exists in tools[]?                  │
│  │ Resolver        │  • workflow steps exist?                       │
│  │                 │  • intent maps_to_workflow valid?              │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Completeness    │  • Problem defined?                            │
│  │ Checker         │  • Role defined?                               │
│  │                 │  • Tools have policies?                        │
│  │                 │  • Mocks tested?                               │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Ready-to-Export │  • All errors resolved?                        │
│  │ Calculator      │  • All refs resolved?                          │
│  │                 │  • Completeness >= threshold?                  │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ [Optional]      │  • Semantic consistency                        │
│  │ LLM Validator   │  • Policy conflicts                            │
│  │                 │  • Missing edge cases                          │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ValidationResult                                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Implementation

```typescript
// validators/index.ts

import { DraftDomain, ValidationResult, ValidationIssue } from '../types/DraftDomain';

export function validateDraftDomain(domain: DraftDomain): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const unresolved = {
    tools: [] as string[],
    workflows: [] as string[],
    intents: [] as string[],
  };

  // 1. Schema validation
  const schemaIssues = validateSchema(domain);
  errors.push(...schemaIssues.filter(i => i.severity === 'error'));
  warnings.push(...schemaIssues.filter(i => i.severity === 'warning'));

  // 2. Reference resolution
  const refIssues = resolveReferences(domain, unresolved);
  errors.push(...refIssues.filter(i => i.severity === 'error'));
  warnings.push(...refIssues.filter(i => i.severity === 'warning'));

  // 3. Completeness check
  const completeness = checkCompleteness(domain);

  // 4. Ready-to-export calculation
  const ready_to_export = calculateReadiness(errors, unresolved, completeness);

  return {
    valid: errors.length === 0,
    ready_to_export,
    errors,
    warnings,
    unresolved,
    completeness,
  };
}

// ─────────────────────────────────────────────────────────────────
// SCHEMA VALIDATION (using Zod)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';

const ToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  inputs: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    required: z.boolean(),
    description: z.string(),
  })),
  // ... more fields
});

function validateSchema(domain: DraftDomain): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Validate tools
  domain.tools.forEach((tool, i) => {
    const result = ToolSchema.safeParse(tool);
    if (!result.success) {
      result.error.issues.forEach(err => {
        issues.push({
          code: 'SCHEMA_ERROR',
          severity: 'error',
          path: `tools[${i}].${err.path.join('.')}`,
          message: err.message,
        });
      });
    }
  });

  // Validate other sections...

  return issues;
}

// ─────────────────────────────────────────────────────────────────
// REFERENCE RESOLUTION
// ─────────────────────────────────────────────────────────────────

function resolveReferences(
  domain: DraftDomain,
  unresolved: { tools: string[]; workflows: string[]; intents: string[] }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const toolIds = new Set(domain.tools.map(t => t.id));
  const workflowIds = new Set(domain.policy.workflows.map(w => w.id));

  // Check workflow steps reference valid tools
  domain.policy.workflows.forEach((workflow, wi) => {
    workflow.steps.forEach((stepId, si) => {
      const resolved = toolIds.has(stepId);
      workflow.steps_resolved[si] = resolved;

      if (!resolved) {
        unresolved.tools.push(stepId);
        issues.push({
          code: 'TOOL_NOT_FOUND',
          severity: 'warning',  // Warning until export
          path: `policy.workflows[${wi}].steps[${si}]`,
          message: `Tool "${stepId}" not found`,
          suggestion: `Define tool "${stepId}" or remove from workflow`,
        });
      }
    });
  });

  // Check intent maps_to_workflow references valid workflow
  domain.intents.supported.forEach((intent, ii) => {
    if (intent.maps_to_workflow) {
      const resolved = workflowIds.has(intent.maps_to_workflow);
      intent.maps_to_workflow_resolved = resolved;

      if (!resolved) {
        unresolved.workflows.push(intent.maps_to_workflow);
        issues.push({
          code: 'WORKFLOW_NOT_FOUND',
          severity: 'warning',
          path: `intents.supported[${ii}].maps_to_workflow`,
          message: `Workflow "${intent.maps_to_workflow}" not found`,
          suggestion: `Define workflow or remove mapping`,
        });
      }
    }
  });

  // Check approval rules reference valid tools
  domain.policy.approvals.forEach((rule, ri) => {
    const resolved = toolIds.has(rule.tool_id);
    rule.tool_id_resolved = resolved;

    if (!resolved) {
      unresolved.tools.push(rule.tool_id);
      issues.push({
        code: 'TOOL_NOT_FOUND',
        severity: 'warning',
        path: `policy.approvals[${ri}].tool_id`,
        message: `Tool "${rule.tool_id}" not found`,
      });
    }
  });

  return issues;
}

// ─────────────────────────────────────────────────────────────────
// COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────

function checkCompleteness(domain: DraftDomain): ValidationResult['completeness'] {
  return {
    problem: Boolean(domain.problem.statement && domain.problem.statement.length > 10),
    scenarios: domain.scenarios.length >= 1,
    role: Boolean(domain.role.name && domain.role.persona),
    intents: domain.intents.supported.length >= 1,
    tools: domain.tools.length >= 1 && domain.tools.every(t => t.description),
    policy: domain.policy.guardrails.never.length > 0 || domain.policy.guardrails.always.length > 0,
    engine: true,  // Has defaults
    mocks_tested: domain.tools.every(t => t.mock_status !== 'untested'),
  };
}

// ─────────────────────────────────────────────────────────────────
// READY-TO-EXPORT CALCULATION
// ─────────────────────────────────────────────────────────────────

function calculateReadiness(
  errors: ValidationIssue[],
  unresolved: { tools: string[]; workflows: string[]; intents: string[] },
  completeness: ValidationResult['completeness']
): boolean {
  // Must have no errors
  if (errors.length > 0) return false;

  // Must have all references resolved
  if (unresolved.tools.length > 0) return false;
  if (unresolved.workflows.length > 0) return false;

  // Must meet minimum completeness
  const required = ['problem', 'role', 'tools'] as const;
  for (const field of required) {
    if (!completeness[field]) return false;
  }

  // Mocks must be tested or explicitly skipped
  if (!completeness.mocks_tested) return false;

  return true;
}
```

### 4.3 Hook into State Updates

```typescript
// services/stateService.ts

import { validateDraftDomain } from '../validators';

export async function applyStateUpdateWithValidation(
  domain: DraftDomain,
  update: Record<string, any>
): Promise<DraftDomain> {
  // 1. Apply the update (existing logic)
  const updatedDomain = applyStateUpdate(domain, update);

  // 2. Update timestamp
  updatedDomain.updated_at = new Date().toISOString();

  // 3. Run validation pipeline
  updatedDomain.validation = validateDraftDomain(updatedDomain);

  // 4. Persist
  await saveDomain(updatedDomain);

  return updatedDomain;
}
```

---

## 5. Phase Machine Updates

### 5.1 New Phase Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PHASE MACHINE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PROBLEM_DISCOVERY ────────────────────────────────────────────────┐│
│  │ • Define problem statement                                       ││
│  │ • Set context and goals                                          ││
│  │ • Exit: problem.statement filled                                 ││
│  ▼                                                                  ││
│  SCENARIO_EXPLORATION ─────────────────────────────────────────────┐││
│  │ • Explore real-world scenarios                                   │││
│  │ • Document steps and outcomes                                    │││
│  │ • Exit: >= 2 scenarios defined                                   │││
│  ▼                                                                  │││
│  INTENT_DEFINITION (NEW) ──────────────────────────────────────────┐│││
│  │ • Define what intents the domain handles                         ││││
│  │ • Add examples for each intent                                   ││││
│  │ • Configure out-of-domain handling                               ││││
│  │ • Exit: >= 1 intent with examples                                ││││
│  ▼                                                                  ││││
│  TOOLS_PROPOSAL ───────────────────────────────────────────────────┐│││││
│  │ • AI proposes tools based on scenarios                           ││││││
│  │ • User reviews and adjusts                                       ││││││
│  │ • Exit: >= 1 tool proposed                                       ││││││
│  ▼                                                                  ││││││
│  TOOL_DEFINITION ──────────────────────────────────────────────────┐│││││││
│  │ • Define inputs/outputs for each tool                            ││││││││
│  │ • Add inline policies per tool                                   ││││││││
│  │ • Exit: all tools fully defined                                  ││││││││
│  ▼                                                                  ││││││││
│  POLICY_DEFINITION (NEW) ──────────────────────────────────────────┐│││││││││
│  │ • Define guardrails (never/always)                               ││││││││││
│  │ • Define workflows                                               ││││││││││
│  │ • Configure approval rules                                       ││││││││││
│  │ • Exit: basic guardrails defined                                 ││││││││││
│  ▼                                                                  ││││││││││
│  MOCK_TESTING ─────────────────────────────────────────────────────┐│││││││││││
│  │ • Test each tool with mock inputs                                ││││││││││││
│  │ • Verify outputs match expectations                              ││││││││││││
│  │ • Mark tools as tested or skipped                                ││││││││││││
│  │ • Exit: all tools tested or skipped                              ││││││││││││
│  ▼                                                                  ││││││││││││
│  READY_TO_EXPORT ──────────────────────────────────────────────────┐│││││││││││││
│  │ • Review all configurations                                      ││││││││││││││
│  │ • Fix any remaining issues                                       ││││││││││││││
│  │ • Exit: validation.ready_to_export === true                      ││││││││││││││
│  ▼                                                                  ││││││││││││││
│  EXPORTED ──────────────────────────────────────────────────────────┘│││││││││││││
│    • domain.yaml generated                                           │││││││││││││
│    • Optional: MCP server generated                                  │││││││││││││
│                                                                      │
│  ◄─── Can go back to any previous phase ───►                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Phase Transition Logic

```typescript
// services/phaseService.ts

export function canTransitionTo(domain: DraftDomain, targetPhase: Phase): boolean {
  const checks: Record<Phase, () => boolean> = {
    PROBLEM_DISCOVERY: () => true,  // Always can go back

    SCENARIO_EXPLORATION: () =>
      domain.problem.statement.length > 10,

    INTENT_DEFINITION: () =>
      domain.scenarios.length >= 1,

    TOOLS_PROPOSAL: () =>
      domain.intents.supported.length >= 1 &&
      domain.intents.supported.every(i => i.examples.length >= 1),

    TOOL_DEFINITION: () =>
      domain.tools.length >= 1,

    POLICY_DEFINITION: () =>
      domain.tools.every(t =>
        t.inputs.length > 0 &&
        t.output.description
      ),

    MOCK_TESTING: () =>
      domain.policy.guardrails.never.length > 0 ||
      domain.policy.guardrails.always.length > 0,

    READY_TO_EXPORT: () =>
      domain.tools.every(t => t.mock_status !== 'untested'),

    EXPORTED: () =>
      domain.validation.ready_to_export,
  };

  return checks[targetPhase]();
}

export function getBlockingIssues(domain: DraftDomain, targetPhase: Phase): string[] {
  const issues: string[] = [];

  switch (targetPhase) {
    case 'SCENARIO_EXPLORATION':
      if (domain.problem.statement.length <= 10) {
        issues.push('Problem statement must be at least 10 characters');
      }
      break;

    case 'INTENT_DEFINITION':
      if (domain.scenarios.length < 1) {
        issues.push('Define at least 1 scenario before proceeding');
      }
      break;

    case 'TOOLS_PROPOSAL':
      if (domain.intents.supported.length < 1) {
        issues.push('Define at least 1 intent');
      }
      const missingExamples = domain.intents.supported.filter(i => i.examples.length < 1);
      if (missingExamples.length > 0) {
        issues.push(`Add examples to intents: ${missingExamples.map(i => i.id).join(', ')}`);
      }
      break;

    // ... more phases

    case 'EXPORTED':
      if (!domain.validation.ready_to_export) {
        issues.push(...domain.validation.errors.map(e => e.message));
        if (domain.validation.unresolved.tools.length > 0) {
          issues.push(`Unresolved tool references: ${domain.validation.unresolved.tools.join(', ')}`);
        }
      }
      break;
  }

  return issues;
}
```

---

## 6. File Structure Changes

### 6.1 Backend Structure

```
apps/backend/
├── src/
│   ├── types/
│   │   ├── DraftDomain.ts        # NEW: Main schema
│   │   └── index.ts
│   │
│   ├── validators/
│   │   ├── index.ts              # NEW: Main validator
│   │   ├── schemaValidator.ts    # NEW: Zod schemas
│   │   ├── referenceResolver.ts  # NEW: Ref checking
│   │   └── completenessChecker.ts# NEW: Completeness
│   │
│   ├── services/
│   │   ├── domainService.ts      # RENAME from projectService
│   │   ├── stateService.ts       # UPDATED: with validation
│   │   ├── phaseService.ts       # UPDATED: new phases
│   │   ├── exportService.ts      # UPDATED: domain.yaml export
│   │   └── migrateService.ts     # NEW: Legacy migration
│   │
│   ├── routes/
│   │   ├── chat.ts               # UPDATED: new prompt
│   │   ├── domains.ts            # RENAME from projects
│   │   ├── mock.ts               # UPDATED: updates mock_status
│   │   └── export.ts             # UPDATED: domain.yaml
│   │
│   └── prompts/
│       ├── system.ts             # UPDATED: DAL-aware prompt
│       ├── phases/               # NEW: Phase-specific prompts
│       │   ├── problem.ts
│       │   ├── scenarios.ts
│       │   ├── intents.ts        # NEW
│       │   ├── tools.ts
│       │   ├── policy.ts         # NEW
│       │   └── testing.ts
│       └── fieldExamples.ts      # NEW: Examples per field
```

### 6.2 Frontend Structure

```
apps/frontend/
├── src/
│   ├── types/
│   │   └── DraftDomain.ts        # Mirror of backend types
│   │
│   ├── components/
│   │   ├── panels/
│   │   │   ├── ProblemPanel.tsx
│   │   │   ├── ScenariosPanel.tsx
│   │   │   ├── IntentsPanel.tsx  # NEW
│   │   │   ├── ToolsPanel.tsx
│   │   │   ├── PolicyPanel.tsx   # NEW
│   │   │   ├── EnginePanel.tsx   # NEW
│   │   │   └── ExportPanel.tsx
│   │   │
│   │   ├── fields/
│   │   │   ├── FieldWithExamples.tsx  # NEW: Reusable
│   │   │   ├── GuardrailsEditor.tsx   # NEW
│   │   │   ├── WorkflowEditor.tsx     # NEW
│   │   │   └── IntentEditor.tsx       # NEW
│   │   │
│   │   └── validation/
│   │       ├── ValidationBanner.tsx   # NEW
│   │       ├── IssuesList.tsx         # NEW
│   │       └── ReadinessIndicator.tsx # NEW
│   │
│   ├── hooks/
│   │   ├── useDomain.ts          # RENAME from useProject
│   │   ├── useValidation.ts      # NEW
│   │   └── useSuggestedFocus.ts  # NEW
│   │
│   └── utils/
│       └── focusNavigation.ts    # NEW: Handle suggested_focus
```

---

## 7. API Changes

### 7.1 Endpoint Updates

| Old Endpoint | New Endpoint | Changes |
|-------------|--------------|---------|
| `GET /api/projects` | `GET /api/domains` | Returns DraftDomain[] |
| `GET /api/projects/:id` | `GET /api/domains/:id` | Returns DraftDomain |
| `POST /api/projects` | `POST /api/domains` | Creates DraftDomain |
| `POST /api/chat` | `POST /api/chat` | Returns validation in response |
| `POST /api/mock/:toolId` | `POST /api/mock/:toolId` | Updates mock_status |
| `GET /api/export/:id` | `GET /api/export/:id` | Exports domain.yaml + MCP |

### 7.2 Chat Response Format

```typescript
// New chat response format
interface ChatResponse {
  message: string;
  state_update?: Record<string, any>;
  suggested_focus?: SuggestedFocus;

  // NEW: Include validation after update
  validation?: ValidationResult;

  // NEW: Phase transition suggestion
  phase_suggestion?: {
    can_advance: boolean;
    next_phase: Phase;
    blocking_issues: string[];
  };
}
```

### 7.3 Export Output

```typescript
// Export now produces domain.yaml as primary output
interface ExportResult {
  domain_yaml: string;           // Primary: domain.yaml content
  domain_yaml_path: string;      // Path to saved file

  mcp_server?: {                 // Optional: MCP server (if tools defined)
    path: string;
    files: string[];
  };

  validation_report: {
    exported_at: string;
    warnings: string[];
    tools_count: number;
    policies_count: number;
  };
}
```

---

## 8. UI Updates

### 8.1 Panel Navigation with suggested_focus

```typescript
// hooks/useSuggestedFocus.ts

import { useEffect } from 'react';
import { SuggestedFocus } from '../types/DraftDomain';

export function useSuggestedFocus(
  suggestedFocus: SuggestedFocus | undefined,
  setActivePanel: (panel: string) => void
) {
  useEffect(() => {
    if (!suggestedFocus) return;

    // Navigate to panel
    setActivePanel(suggestedFocus.panel);

    // Scroll to section if specified
    if (suggestedFocus.section) {
      setTimeout(() => {
        const element = document.getElementById(`section-${suggestedFocus.section}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    // Focus field if specified
    if (suggestedFocus.field) {
      setTimeout(() => {
        const input = document.querySelector(`[name="${suggestedFocus.field}"]`);
        (input as HTMLElement)?.focus();
      }, 200);
    }
  }, [suggestedFocus, setActivePanel]);
}
```

### 8.2 Field with Examples Component

```tsx
// components/fields/FieldWithExamples.tsx

import { useState } from 'react';
import { FIELD_EXAMPLES } from '../../utils/fieldExamples';

interface Props {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

export function FieldWithExamples({ name, label, value, onChange, multiline }: Props) {
  const [showExamples, setShowExamples] = useState(false);
  const fieldConfig = FIELD_EXAMPLES[name];

  return (
    <div className="field-with-examples">
      <label>
        {label}
        {fieldConfig?.help && (
          <button
            className="help-btn"
            onClick={() => setShowExamples(!showExamples)}
          >
            ?
          </button>
        )}
      </label>

      {showExamples && fieldConfig && (
        <div className="examples-panel">
          <p className="help-text">{fieldConfig.help}</p>
          <div className="examples">
            <strong>Examples:</strong>
            <ul>
              {fieldConfig.examples.map((ex, i) => (
                <li key={i}>
                  <button onClick={() => onChange(ex)}>{ex}</button>
                </li>
              ))}
            </ul>
          </div>
          {fieldConfig.template && (
            <div className="template">
              <strong>Template:</strong> {fieldConfig.template}
            </div>
          )}
        </div>
      )}

      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fieldConfig?.placeholder}
        />
      ) : (
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fieldConfig?.placeholder}
        />
      )}
    </div>
  );
}
```

### 8.3 Validation Banner

```tsx
// components/validation/ValidationBanner.tsx

import { ValidationResult } from '../../types/DraftDomain';

interface Props {
  validation: ValidationResult;
}

export function ValidationBanner({ validation }: Props) {
  if (validation.valid && validation.warnings.length === 0) {
    return null;
  }

  return (
    <div className={`validation-banner ${validation.valid ? 'warnings' : 'errors'}`}>
      {validation.errors.length > 0 && (
        <div className="errors">
          <strong>Errors ({validation.errors.length}):</strong>
          <ul>
            {validation.errors.slice(0, 3).map((err, i) => (
              <li key={i}>
                <code>{err.path}</code>: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="warnings">
          <strong>Warnings ({validation.warnings.length}):</strong>
          <ul>
            {validation.warnings.slice(0, 3).map((warn, i) => (
              <li key={i}>
                <code>{warn.path}</code>: {warn.message}
                {warn.suggestion && <em> — {warn.suggestion}</em>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!validation.ready_to_export && (
        <div className="readiness">
          <strong>Not ready to export.</strong>
          Missing: {Object.entries(validation.completeness)
            .filter(([_, v]) => !v)
            .map(([k]) => k)
            .join(', ')}
        </div>
      )}
    </div>
  );
}
```

---

## 9. Implementation Checklist

### Phase 1: Foundation (Week 1)

- [ ] **Types**
  - [ ] Create `types/DraftDomain.ts` with all interfaces
  - [ ] Create `utils/defaults.ts` with default values
  - [ ] Add Zod schemas for validation

- [ ] **Migration**
  - [ ] Create `services/migrateService.ts`
  - [ ] Implement `migrateToV2()` function
  - [ ] Add auto-migration on load
  - [ ] Test with existing projects

- [ ] **Storage**
  - [ ] Rename `/memory/projects` → `/memory/domains`
  - [ ] Update `domainService.ts` (rename from projectService)
  - [ ] Update file paths throughout

### Phase 2: Validation Pipeline (Week 2)

- [ ] **Validators**
  - [ ] Create `validators/schemaValidator.ts`
  - [ ] Create `validators/referenceResolver.ts`
  - [ ] Create `validators/completenessChecker.ts`
  - [ ] Create main `validators/index.ts`

- [ ] **Integration**
  - [ ] Hook validation into `applyStateUpdate()`
  - [ ] Return validation in chat response
  - [ ] Update phase transitions to use validation

### Phase 3: New Phases (Week 3)

- [ ] **Intent Phase**
  - [ ] Add INTENT_DEFINITION phase
  - [ ] Create intent prompts
  - [ ] Create IntentsPanel.tsx

- [ ] **Policy Phase**
  - [ ] Add POLICY_DEFINITION phase
  - [ ] Create policy prompts
  - [ ] Create PolicyPanel.tsx
  - [ ] Create GuardrailsEditor.tsx
  - [ ] Create WorkflowEditor.tsx

- [ ] **Phase Transitions**
  - [ ] Update `phaseService.ts` with new logic
  - [ ] Update prompts for new phase flow

### Phase 4: UI Enhancements (Week 4)

- [ ] **suggested_focus**
  - [ ] Create `useSuggestedFocus` hook
  - [ ] Wire into panel navigation
  - [ ] Add section/field scrolling

- [ ] **Field Examples**
  - [ ] Create `fieldExamples.ts` data
  - [ ] Create `FieldWithExamples` component
  - [ ] Apply to all input fields

- [ ] **Validation UI**
  - [ ] Create ValidationBanner
  - [ ] Create IssuesList
  - [ ] Create ReadinessIndicator
  - [ ] Add inline validation hints

### Phase 5: Export & Polish (Week 5)

- [ ] **Export**
  - [ ] Update export to generate domain.yaml
  - [ ] Keep MCP export as optional
  - [ ] Add validation report

- [ ] **Mock Testing**
  - [ ] Update mock endpoint to set `mock_status`
  - [ ] Track test results in state
  - [ ] Include in readiness calculation

- [ ] **Testing & Documentation**
  - [ ] Write tests for validators
  - [ ] Write tests for migration
  - [ ] Update README
  - [ ] Update DESIGN_SPEC.md

---

## Appendix A: Field Examples Data

```typescript
// utils/fieldExamples.ts

export const FIELD_EXAMPLES: Record<string, FieldConfig> = {
  'problem.statement': {
    help: 'Describe the core problem you want to solve. Be specific about who has this problem and why it matters.',
    examples: [
      'Customer support agents spend 40% of their time looking up order information across multiple systems',
      'Sales team needs to quickly generate quotes but the process requires checking inventory, pricing, and discounts manually',
      'HR needs to answer employee questions about benefits but policies are scattered across multiple documents',
    ],
    template: '{Who} needs to {do what} but {current problem/blocker}',
    placeholder: 'Describe the problem...',
  },

  'role.persona': {
    help: 'Describe how the agent should behave and communicate. This shapes all interactions.',
    examples: [
      'You are a helpful customer service agent. Professional but friendly. Never argue with customers.',
      'You are a technical assistant for developers. Precise and concise. Always provide code examples.',
      'You are a sales support assistant. Enthusiastic but not pushy. Focus on understanding customer needs.',
    ],
    template: 'You are a {role}. {personality traits}. {key behaviors}.',
    placeholder: 'Describe the agent personality...',
  },

  'tool.description': {
    help: 'What does this tool do? Be specific about inputs and outputs.',
    examples: [
      'Look up customer order by order number or email address',
      'Process refund for a given order ID and reason',
      'Send confirmation email to customer with order details',
      'Check inventory levels for a product SKU',
    ],
    template: '{Action verb} {target} by/for {identifier}',
    placeholder: 'Describe what this tool does...',
  },

  'intent.description': {
    help: 'What is the user trying to accomplish? This helps route requests correctly.',
    examples: [
      'Customer wants a refund for an order',
      'Customer checking status of existing order',
      'Customer wants to update shipping address',
      'Customer reporting a problem with their order',
    ],
    template: '{User type} wants to {action} {target}',
    placeholder: 'Describe the user intent...',
  },

  'guardrail.never': {
    help: 'Actions the agent must NEVER take, regardless of context.',
    examples: [
      'Process refund without verifying order ownership',
      'Share customer payment information',
      'Promise delivery dates without checking inventory',
      'Modify orders after they have shipped',
    ],
    placeholder: 'Never...',
  },

  'guardrail.always': {
    help: 'Actions the agent must ALWAYS take in relevant situations.',
    examples: [
      'Verify customer identity before accessing account',
      'Log all refund decisions with reason',
      'Confirm order details before processing changes',
      'Escalate requests over $500 to supervisor',
    ],
    placeholder: 'Always...',
  },

  'workflow.trigger': {
    help: 'What user request or situation triggers this workflow?',
    examples: [
      'Customer requests a refund',
      'Customer reports damaged item',
      'Customer wants to cancel order',
      'Customer asks about shipping status',
    ],
    template: '{User/Customer} {action verb} {target}',
    placeholder: 'When does this workflow start?',
  },
};

interface FieldConfig {
  help: string;
  examples: string[];
  template?: string;
  placeholder?: string;
}
```

---

## Appendix B: System Prompt Updates

The system prompt needs to be updated to:
1. Be aware of the new DraftDomain structure
2. Know about intents and policies
3. Guide through new phases
4. Always provide examples

See `prompts/system.ts` for the full updated prompt.

---

**End of Implementation Plan**
