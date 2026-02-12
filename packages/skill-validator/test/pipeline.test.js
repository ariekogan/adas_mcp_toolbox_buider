import { describe, it, expect } from 'vitest';
import { validateDraftSkill } from '../src/validators/index.js';
import { makeValidSkill } from './fixtures/validSkill.js';

describe('validateDraftSkill (full pipeline)', () => {
  it('valid skill → valid: true, ready_to_export: true', () => {
    const result = validateDraftSkill(makeValidSkill());
    expect(result.valid).toBe(true);
    expect(result.ready_to_export).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('skill with schema error → valid: false', () => {
    const skill = makeValidSkill();
    skill.id = ''; // schema error
    const result = validateDraftSkill(skill);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ID')).toBe(true);
  });

  it('skill with only warnings → valid: true', () => {
    const skill = makeValidSkill();
    // Remove tool description (warning) but keep everything else valid
    delete skill.tools[0].description;
    const result = validateDraftSkill(skill);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('skill with unresolved tool ref → ready_to_export: false', () => {
    const skill = makeValidSkill();
    skill.policy.workflows[0].steps = ['nonexistent.tool'];
    const result = validateDraftSkill(skill);
    // TOOL_NOT_FOUND is a warning, so skill is still "valid"
    expect(result.valid).toBe(true);
    expect(result.ready_to_export).toBe(false);
    expect(result.unresolved.tools).toContain('nonexistent.tool');
  });

  it('security error makes skill invalid', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_write';
    skill.access_policy = { rules: [] }; // no coverage for high-risk tool
    const result = validateDraftSkill(skill);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'HIGH_RISK_NO_POLICY')).toBe(true);
  });
});
