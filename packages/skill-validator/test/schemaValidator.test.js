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
});
