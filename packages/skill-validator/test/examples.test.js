import { describe, it, expect } from 'vitest';
import { validateDraftSkill } from '../src/validators/index.js';
import { validateSolution } from '../src/validators/solutionValidator.js';
import { EXAMPLE_SKILL, EXAMPLE_CONNECTOR, EXAMPLE_CONNECTOR_UI, EXAMPLE_SOLUTION } from '../src/routes/examples.js';

describe('example skill', () => {
  it('passes full validation pipeline (valid: true)', () => {
    const result = validateDraftSkill(EXAMPLE_SKILL);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('is ready to export', () => {
    const result = validateDraftSkill(EXAMPLE_SKILL);
    expect(result.ready_to_export).toBe(true);
  });

  it('has all required sections', () => {
    expect(EXAMPLE_SKILL.id).toBeTruthy();
    expect(EXAMPLE_SKILL.name).toBeTruthy();
    expect(EXAMPLE_SKILL.phase).toBeTruthy();
    expect(EXAMPLE_SKILL.problem.statement.length).toBeGreaterThan(10);
    expect(EXAMPLE_SKILL.scenarios.length).toBeGreaterThanOrEqual(1);
    expect(EXAMPLE_SKILL.role.name).toBeTruthy();
    expect(EXAMPLE_SKILL.role.persona).toBeTruthy();
    expect(EXAMPLE_SKILL.intents.supported.length).toBeGreaterThanOrEqual(1);
    expect(EXAMPLE_SKILL.tools.length).toBeGreaterThanOrEqual(1);
    expect(EXAMPLE_SKILL.policy.guardrails.never.length).toBeGreaterThan(0);
    expect(EXAMPLE_SKILL.policy.guardrails.always.length).toBeGreaterThan(0);
  });

  it('has grant mappings and access policy', () => {
    expect(EXAMPLE_SKILL.grant_mappings.length).toBeGreaterThan(0);
    expect(EXAMPLE_SKILL.access_policy.rules.length).toBeGreaterThan(0);
  });

  it('has response filters', () => {
    expect(EXAMPLE_SKILL.response_filters.length).toBeGreaterThan(0);
  });

  it('all tools have security classification', () => {
    for (const tool of EXAMPLE_SKILL.tools) {
      expect(tool.security?.classification).toBeTruthy();
    }
  });

  it('all tools have mock examples', () => {
    for (const tool of EXAMPLE_SKILL.tools) {
      expect(tool.mock?.enabled).toBe(true);
      expect(tool.mock?.examples?.length).toBeGreaterThan(0);
    }
  });
});

describe('example connector', () => {
  it('has required fields', () => {
    expect(EXAMPLE_CONNECTOR.id).toBeTruthy();
    expect(EXAMPLE_CONNECTOR.name).toBeTruthy();
    expect(EXAMPLE_CONNECTOR.transport).toBe('stdio');
    expect(EXAMPLE_CONNECTOR.command).toBeTruthy();
    expect(EXAMPLE_CONNECTOR.args).toBeInstanceOf(Array);
  });

  it('is not ui_capable', () => {
    expect(EXAMPLE_CONNECTOR.ui_capable).toBe(false);
  });
});

describe('example UI connector', () => {
  it('has required fields', () => {
    expect(EXAMPLE_CONNECTOR_UI.id).toBeTruthy();
    expect(EXAMPLE_CONNECTOR_UI.name).toBeTruthy();
    expect(EXAMPLE_CONNECTOR_UI.transport).toBeTruthy();
    expect(EXAMPLE_CONNECTOR_UI.command).toBeTruthy();
  });

  it('is ui_capable', () => {
    expect(EXAMPLE_CONNECTOR_UI.ui_capable).toBe(true);
  });

  it('references ui plugin tools', () => {
    const toolNames = EXAMPLE_CONNECTOR_UI._tools_reference.map(t => t.name);
    expect(toolNames).toContain('ui.listPlugins');
    expect(toolNames).toContain('ui.getPlugin');
  });
});

describe('example solution', () => {
  it('passes solution validation (valid: true)', () => {
    const result = validateSolution(EXAMPLE_SOLUTION);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('has multiple skills with different roles', () => {
    expect(EXAMPLE_SOLUTION.skills.length).toBeGreaterThanOrEqual(2);
    const roles = EXAMPLE_SOLUTION.skills.map(s => s.role);
    expect(roles).toContain('gateway');
    expect(roles).toContain('worker');
  });

  it('has grants with issuers and consumers', () => {
    expect(EXAMPLE_SOLUTION.grants.length).toBeGreaterThan(0);
    for (const grant of EXAMPLE_SOLUTION.grants) {
      expect(grant.key).toBeTruthy();
      expect(grant.issued_by.length).toBeGreaterThan(0);
      expect(grant.consumed_by.length).toBeGreaterThan(0);
    }
  });

  it('has handoffs with grant propagation', () => {
    expect(EXAMPLE_SOLUTION.handoffs.length).toBeGreaterThan(0);
    for (const handoff of EXAMPLE_SOLUTION.handoffs) {
      expect(handoff.from).toBeTruthy();
      expect(handoff.to).toBeTruthy();
      expect(handoff.grants_passed.length).toBeGreaterThan(0);
    }
  });

  it('has routing rules', () => {
    expect(Object.keys(EXAMPLE_SOLUTION.routing).length).toBeGreaterThan(0);
  });

  it('has security contracts', () => {
    expect(EXAMPLE_SOLUTION.security_contracts.length).toBeGreaterThan(0);
  });

  it('has identity configuration', () => {
    expect(EXAMPLE_SOLUTION.identity.actor_types.length).toBeGreaterThan(0);
    expect(EXAMPLE_SOLUTION.identity.default_actor_type).toBeTruthy();
  });
});
