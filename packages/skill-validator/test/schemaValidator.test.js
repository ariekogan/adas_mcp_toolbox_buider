import { describe, it, expect } from 'vitest';
import { validateSchema } from '../src/validators/schemaValidator.js';
import { makeValidSkill } from './fixtures/validSkill.js';

describe('schemaValidator', () => {
  it('valid skill produces no errors', () => {
    const issues = validateSchema(makeValidSkill());
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('missing skill ID → INVALID_ID error', () => {
    const skill = makeValidSkill();
    skill.id = '';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_ID');
    expect(errors).toHaveLength(1);
  });

  it('missing skill name → INVALID_NAME error', () => {
    const skill = makeValidSkill();
    skill.name = '';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_NAME');
    expect(errors).toHaveLength(1);
  });

  it('invalid phase → INVALID_PHASE error', () => {
    const skill = makeValidSkill();
    skill.phase = 'BANANA';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_PHASE');
    expect(errors).toHaveLength(1);
  });

  it('missing problem section → MISSING_PROBLEM error', () => {
    const skill = makeValidSkill();
    skill.problem = null;
    const errors = validateSchema(skill).filter(i => i.code === 'MISSING_PROBLEM');
    expect(errors).toHaveLength(1);
  });

  it('invalid tone → INVALID_TONE error', () => {
    const skill = makeValidSkill();
    skill.role.communication_style.tone = 'aggressive';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_TONE');
    expect(errors).toHaveLength(1);
  });

  it('invalid tool input type → INVALID_INPUT_TYPE error', () => {
    const skill = makeValidSkill();
    skill.tools[0].inputs[0].type = 'uuid';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_INPUT_TYPE');
    expect(errors).toHaveLength(1);
  });

  it('invalid trigger type → INVALID_TRIGGER_TYPE error', () => {
    const skill = makeValidSkill();
    skill.triggers = [{ id: 't1', type: 'webhook', prompt: 'test' }];
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_TRIGGER_TYPE');
    expect(errors).toHaveLength(1);
  });

  it('invalid autonomy level → INVALID_AUTONOMY_LEVEL error', () => {
    const skill = makeValidSkill();
    skill.engine.autonomy.level = 'chaotic';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_AUTONOMY_LEVEL');
    expect(errors).toHaveLength(1);
  });

  it('max_iterations < 1 → INVALID_MAX_ITERATIONS error', () => {
    const skill = makeValidSkill();
    skill.engine.rv2.max_iterations = 0;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_MAX_ITERATIONS');
    expect(errors).toHaveLength(1);
  });

  // ── fast_path / execution_contract ──
  // CORE owns runtime enforcement of execution_contract.required_tools
  // (finalizationGate.js → REQUIRED_TOOL_NOT_EXECUTED). The Builder's job
  // is purely shape validation: catch misformed fields early so authors
  // don't ship a typo that makes the gate silently never fire.

  it('valid fast_path with required_tools → no errors', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [
        {
          pattern: '/^(build|make|create) me .* widget/i',
          intent: 'create_widget',
          mission_kind: 'generate',
          execution_contract: {
            requires_external_effect: true,
            required_tools: ['acs.widget.store'],
          },
        },
      ],
    };
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.startsWith('intents.fast_path'));
    expect(errors).toHaveLength(0);
  });

  it('fast_path.rules not array → INVALID_FAST_PATH_RULES', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = { rules: 'oops not an array' };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_FAST_PATH_RULES');
    expect(errors).toHaveLength(1);
  });

  it('fast_path rule missing pattern → MISSING_FAST_PATH_PATTERN', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = { rules: [{ intent: 'create_widget' }] };
    const errors = validateSchema(skill).filter(i => i.code === 'MISSING_FAST_PATH_PATTERN');
    expect(errors).toHaveLength(1);
  });

  it('fast_path rule missing intent → MISSING_FAST_PATH_INTENT', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = { rules: [{ pattern: '/^x/' }] };
    const errors = validateSchema(skill).filter(i => i.code === 'MISSING_FAST_PATH_INTENT');
    expect(errors).toHaveLength(1);
  });

  it('fast_path invalid mission_kind → INVALID_FAST_PATH_MISSION_KIND', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [{ pattern: '/^x/', intent: 'i1', mission_kind: 'invent' }],
    };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_FAST_PATH_MISSION_KIND');
    expect(errors).toHaveLength(1);
  });

  it('required_tools not array → INVALID_REQUIRED_TOOLS', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [{
        pattern: '/^x/', intent: 'i1',
        execution_contract: { required_tools: 'acs.widget.store' },
      }],
    };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_REQUIRED_TOOLS');
    expect(errors).toHaveLength(1);
  });

  it('required_tools entry not string → INVALID_REQUIRED_TOOL_NAME', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [{
        pattern: '/^x/', intent: 'i1',
        execution_contract: { required_tools: ['acs.widget.store', 42, ''] },
      }],
    };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_REQUIRED_TOOL_NAME');
    // 42 and '' both fail; valid 'acs.widget.store' passes
    expect(errors).toHaveLength(2);
  });

  it('requires_external_effect non-boolean → INVALID_REQUIRES_EXTERNAL_EFFECT', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [{
        pattern: '/^x/', intent: 'i1',
        execution_contract: { requires_external_effect: 'yes' },
      }],
    };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_REQUIRES_EXTERNAL_EFFECT');
    expect(errors).toHaveLength(1);
  });

  it('execution_contract is array (wrong shape) → INVALID_EXECUTION_CONTRACT', () => {
    const skill = makeValidSkill();
    skill.intents.fast_path = {
      rules: [{ pattern: '/^x/', intent: 'i1', execution_contract: [] }],
    };
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_EXECUTION_CONTRACT');
    expect(errors).toHaveLength(1);
  });

  // ── engine.include_read_evidence_in_gate ──
  // CORE owns runtime behavior (see ai-dev-assistant
  // apps/backend/worker/finalizationGate.js → isReadEvidenceEnabled).
  // The Builder only validates shape: must be boolean if present.

  it('engine.include_read_evidence_in_gate=true → no errors (valid opt-in)', () => {
    const skill = makeValidSkill();
    skill.engine.include_read_evidence_in_gate = true;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('include_read_evidence_in_gate'));
    expect(errors).toHaveLength(0);
  });

  it('engine.include_read_evidence_in_gate=false → no errors (explicit default)', () => {
    const skill = makeValidSkill();
    skill.engine.include_read_evidence_in_gate = false;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('include_read_evidence_in_gate'));
    expect(errors).toHaveLength(0);
  });

  it('engine.include_read_evidence_in_gate omitted → no errors (default behavior)', () => {
    const skill = makeValidSkill();
    delete skill.engine.include_read_evidence_in_gate;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('include_read_evidence_in_gate'));
    expect(errors).toHaveLength(0);
  });

  it('engine.include_read_evidence_in_gate=string → INVALID_INCLUDE_READ_EVIDENCE_IN_GATE', () => {
    const skill = makeValidSkill();
    skill.engine.include_read_evidence_in_gate = 'yes';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_INCLUDE_READ_EVIDENCE_IN_GATE');
    expect(errors).toHaveLength(1);
  });

  it('engine.include_read_evidence_in_gate=1 → INVALID_INCLUDE_READ_EVIDENCE_IN_GATE', () => {
    const skill = makeValidSkill();
    skill.engine.include_read_evidence_in_gate = 1;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_INCLUDE_READ_EVIDENCE_IN_GATE');
    expect(errors).toHaveLength(1);
  });

  // ── engine.default_* per-skill overrides ──
  // CORE reads these on the target (or both caller and target for delegation
  // depth) at sys.askAnySkill time. Builder validates shape only — CORE
  // clamps at runtime, so the Builder doesn't need to know the safe range.

  it('engine.default_sub_job_seconds=480 → no errors', () => {
    const skill = makeValidSkill();
    skill.engine.default_sub_job_seconds = 480;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('default_sub_job_seconds'));
    expect(errors).toHaveLength(0);
  });

  it('engine.default_sub_job_seconds=0 → INVALID_DEFAULT_SUB_JOB_SECONDS (must be positive)', () => {
    const skill = makeValidSkill();
    skill.engine.default_sub_job_seconds = 0;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_DEFAULT_SUB_JOB_SECONDS');
    expect(errors).toHaveLength(1);
  });

  it('engine.default_sub_job_seconds="300" → INVALID_DEFAULT_SUB_JOB_SECONDS (string rejected)', () => {
    const skill = makeValidSkill();
    skill.engine.default_sub_job_seconds = '300';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_DEFAULT_SUB_JOB_SECONDS');
    expect(errors).toHaveLength(1);
  });

  it('engine.default_max_idle_seconds=120 → no errors (the ada cherry-picked case)', () => {
    const skill = makeValidSkill();
    skill.engine.default_max_idle_seconds = 120;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('default_max_idle_seconds'));
    expect(errors).toHaveLength(0);
  });

  it('engine.default_max_idle_seconds=-5 → INVALID_DEFAULT_MAX_IDLE_SECONDS', () => {
    const skill = makeValidSkill();
    skill.engine.default_max_idle_seconds = -5;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_DEFAULT_MAX_IDLE_SECONDS');
    expect(errors).toHaveLength(1);
  });

  it('engine.default_max_delegation_depth=6 → no errors (Skill Factory case)', () => {
    const skill = makeValidSkill();
    skill.engine.default_max_delegation_depth = 6;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('default_max_delegation_depth'));
    expect(errors).toHaveLength(0);
  });

  it('engine.default_max_delegation_depth=NaN → INVALID_DEFAULT_MAX_DELEGATION_DEPTH', () => {
    const skill = makeValidSkill();
    skill.engine.default_max_delegation_depth = NaN;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_DEFAULT_MAX_DELEGATION_DEPTH');
    expect(errors).toHaveLength(1);
  });

  it('all three default_* fields omitted → no errors (CORE defaults apply)', () => {
    const skill = makeValidSkill();
    delete skill.engine.default_sub_job_seconds;
    delete skill.engine.default_max_idle_seconds;
    delete skill.engine.default_max_delegation_depth;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && /default_(sub_job|max_idle|max_delegation)/.test(i.path || ''));
    expect(errors).toHaveLength(0);
  });

  // ── engine.loop_streak_threshold ──
  // Per-skill override for the generic loop-breaker streak threshold added
  // to CORE worker/mainloop.js 2026-05-28. CORE default 3; runtime clamps
  // to [1, 20]. Builder validates shape only.

  it('engine.loop_streak_threshold=8 → no errors (Skill Factory builder case)', () => {
    const skill = makeValidSkill();
    skill.engine.loop_streak_threshold = 8;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('loop_streak_threshold'));
    expect(errors).toHaveLength(0);
  });

  it('engine.loop_streak_threshold=6 → no errors (Skill Factory QA case)', () => {
    const skill = makeValidSkill();
    skill.engine.loop_streak_threshold = 6;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('loop_streak_threshold'));
    expect(errors).toHaveLength(0);
  });

  it('engine.loop_streak_threshold=0 → INVALID_LOOP_STREAK_THRESHOLD (must be positive)', () => {
    const skill = makeValidSkill();
    skill.engine.loop_streak_threshold = 0;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_LOOP_STREAK_THRESHOLD');
    expect(errors).toHaveLength(1);
  });

  it('engine.loop_streak_threshold="6" → INVALID_LOOP_STREAK_THRESHOLD (string rejected)', () => {
    const skill = makeValidSkill();
    skill.engine.loop_streak_threshold = '6';
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_LOOP_STREAK_THRESHOLD');
    expect(errors).toHaveLength(1);
  });

  it('engine.loop_streak_threshold omitted → no errors (CORE default 3 applies)', () => {
    const skill = makeValidSkill();
    delete skill.engine.loop_streak_threshold;
    const errors = validateSchema(skill).filter(i => i.severity === 'error' && i.path?.includes('loop_streak_threshold'));
    expect(errors).toHaveLength(0);
  });

  // CORE clamps to [1, 20] at runtime — Builder doesn't pin the upper bound,
  // so values like 100 pass the shape check (CORE will clamp). This documents
  // that the Builder is intentionally NOT the source of truth for the range.
  it('engine.loop_streak_threshold=100 → no errors (Builder is shape-only; CORE clamps at runtime)', () => {
    const skill = makeValidSkill();
    skill.engine.loop_streak_threshold = 100;
    const errors = validateSchema(skill).filter(i => i.code === 'INVALID_LOOP_STREAK_THRESHOLD');
    expect(errors).toHaveLength(0);
  });
});
