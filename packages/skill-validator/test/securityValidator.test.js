import { describe, it, expect } from 'vitest';
import { validateSecurity } from '../src/validators/securityValidator.js';
import { makeValidSkill } from './fixtures/validSkill.js';

describe('securityValidator', () => {
  it('valid skill with wildcard access policy → no errors', () => {
    const issues = validateSecurity(makeValidSkill());
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('unclassified tool → UNCLASSIFIED_TOOL warning', () => {
    const skill = makeValidSkill();
    delete skill.tools[0].security;
    const warnings = validateSecurity(skill).filter(i => i.code === 'UNCLASSIFIED_TOOL');
    expect(warnings).toHaveLength(1);
  });

  it('invalid classification → INVALID_CLASSIFICATION error', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'top_secret';
    const errors = validateSecurity(skill).filter(i => i.code === 'INVALID_CLASSIFICATION');
    expect(errors).toHaveLength(1);
  });

  it('pii_write tool without access policy → HIGH_RISK_NO_POLICY error', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_write';
    skill.access_policy = { rules: [] }; // no coverage
    const errors = validateSecurity(skill).filter(i => i.code === 'HIGH_RISK_NO_POLICY');
    expect(errors).toHaveLength(1);
  });

  it('pii_read tool without filter or policy → PII_NO_FILTER warning', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_read';
    skill.access_policy = { rules: [] };
    skill.response_filters = [];
    const warnings = validateSecurity(skill).filter(i => i.code === 'PII_NO_FILTER');
    expect(warnings).toHaveLength(1);
  });

  it('pii_read tool WITH response filters → no PII_NO_FILTER warning', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_read';
    skill.access_policy = { rules: [] };
    // Has response filters
    skill.response_filters = [{ id: 'f1', strip_fields: ['customer.ssn'] }];
    const warnings = validateSecurity(skill).filter(i => i.code === 'PII_NO_FILTER');
    expect(warnings).toHaveLength(0);
  });

  it('grant mapping references nonexistent tool → GRANT_MAPPING_INVALID_TOOL error', () => {
    const skill = makeValidSkill();
    skill.grant_mappings = [{ tool: 'nonexistent.tool', grants: [] }];
    const errors = validateSecurity(skill).filter(i => i.code === 'GRANT_MAPPING_INVALID_TOOL');
    expect(errors).toHaveLength(1);
  });

  it('grant mapping with system tool → no error', () => {
    const skill = makeValidSkill();
    skill.grant_mappings = [{ tool: 'sys.askUser', grants: [] }];
    const errors = validateSecurity(skill).filter(i => i.code === 'GRANT_MAPPING_INVALID_TOOL');
    expect(errors).toHaveLength(0);
  });

  it('invalid access policy effect → INVALID_POLICY_EFFECT error', () => {
    const skill = makeValidSkill();
    skill.access_policy.rules = [{ tools: ['*'], effect: 'maybe' }];
    const errors = validateSecurity(skill).filter(i => i.code === 'INVALID_POLICY_EFFECT');
    expect(errors).toHaveLength(1);
  });

  // --- NEW: Guardrail ↔ Tool conflict detection ---

  it('guardrail "never share customer info" + pii_write tool without policy → GUARDRAIL_TOOL_CONFLICT', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_write';
    skill.access_policy = { rules: [] }; // no coverage
    skill.response_filters = [];
    skill.policy.guardrails.never = ['Never share customer information externally'];
    const warnings = validateSecurity(skill).filter(i => i.code === 'GUARDRAIL_TOOL_CONFLICT');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('customer information');
  });

  it('guardrail about PII + pii tool WITH wildcard policy → no conflict', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_write';
    skill.access_policy = { rules: [{ tools: ['*'], effect: 'allow' }] };
    skill.policy.guardrails.never = ['Never share sensitive data'];
    const warnings = validateSecurity(skill).filter(i => i.code === 'GUARDRAIL_TOOL_CONFLICT');
    expect(warnings).toHaveLength(0);
  });

  it('guardrail about payments + financial tool without policy → GUARDRAIL_TOOL_CONFLICT', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'financial';
    skill.access_policy = { rules: [] };
    skill.response_filters = [];
    skill.policy.guardrails.never = ['Never process credit card transactions directly'];
    const warnings = validateSecurity(skill).filter(i => i.code === 'GUARDRAIL_TOOL_CONFLICT');
    expect(warnings).toHaveLength(1);
  });

  it('unrelated guardrail (no PII/financial keywords) → no conflict', () => {
    const skill = makeValidSkill();
    skill.tools[0].security.classification = 'pii_write';
    skill.access_policy = { rules: [] };
    skill.response_filters = [];
    skill.policy.guardrails.never = ['Never use profanity'];
    const warnings = validateSecurity(skill).filter(i => i.code === 'GUARDRAIL_TOOL_CONFLICT');
    expect(warnings).toHaveLength(0);
  });
});
