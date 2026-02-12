import { describe, it, expect } from 'vitest';
import { resolveReferences } from '../src/validators/referenceResolver.js';
import { makeValidSkill } from './fixtures/validSkill.js';

function resolve(skill) {
  const unresolved = { tools: [], workflows: [], intents: [] };
  const issues = resolveReferences(skill, unresolved);
  return { issues, unresolved };
}

describe('referenceResolver', () => {
  it('valid skill produces no issues', () => {
    const { issues } = resolve(makeValidSkill());
    expect(issues).toHaveLength(0);
  });

  it('workflow step references nonexistent tool → TOOL_NOT_FOUND', () => {
    const skill = makeValidSkill();
    skill.policy.workflows[0].steps = ['nonexistent.tool.get'];
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'TOOL_NOT_FOUND');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('nonexistent.tool.get');
  });

  it('system tools (sys.*, ui.*, cp.*) do not trigger TOOL_NOT_FOUND', () => {
    const skill = makeValidSkill();
    skill.policy.workflows[0].steps = ['sys.emitUserMessage', 'ui.listPlugins', 'cp.admin_api'];
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'TOOL_NOT_FOUND');
    expect(found).toHaveLength(0);
  });

  it('duplicate tool IDs → DUPLICATE_TOOL_ID error', () => {
    const skill = makeValidSkill();
    skill.tools.push({ ...skill.tools[0] }); // duplicate
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'DUPLICATE_TOOL_ID');
    expect(found).toHaveLength(1);
  });

  it('intent maps_to_workflow references nonexistent workflow → WORKFLOW_NOT_FOUND', () => {
    const skill = makeValidSkill();
    skill.intents.supported[0].maps_to_workflow = 'nonexistent_workflow';
    const { issues, unresolved } = resolve(skill);
    const found = issues.filter(i => i.code === 'WORKFLOW_NOT_FOUND');
    expect(found).toHaveLength(1);
    expect(unresolved.workflows).toContain('nonexistent_workflow');
  });

  it('intent with no maps_to_workflow and no matching workflow trigger → INTENT_NO_TOOLS', () => {
    const skill = makeValidSkill();
    // Remove the explicit mapping
    delete skill.intents.supported[0].maps_to_workflow;
    // Change the workflow trigger to something else
    skill.policy.workflows[0].trigger = 'different_intent';
    // And the tool name doesn't contain "order" or "status" keywords from intent id "order_status"
    skill.tools[0].name = 'api.data.fetch';
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'INTENT_NO_TOOLS');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('order_status');
  });

  it('intent with no maps_to_workflow but matching workflow trigger → no warning', () => {
    const skill = makeValidSkill();
    delete skill.intents.supported[0].maps_to_workflow;
    // Workflow trigger matches intent ID
    skill.policy.workflows[0].trigger = 'order_status';
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'INTENT_NO_TOOLS');
    expect(found).toHaveLength(0);
  });

  it('intent with no maps_to_workflow but keyword-matching tool name → no warning', () => {
    const skill = makeValidSkill();
    delete skill.intents.supported[0].maps_to_workflow;
    skill.policy.workflows[0].trigger = 'something_else';
    // Tool name contains "order" which is a keyword from intent id "order_status"
    skill.tools[0].name = 'orders.order.get';
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'INTENT_NO_TOOLS');
    expect(found).toHaveLength(0);
  });

  it('circular workflow references → WORKFLOW_CIRCULAR error', () => {
    const skill = makeValidSkill();
    skill.policy.workflows = [
      { id: 'wf_a', name: 'A', steps: ['wf_b'], trigger: 'order_status' },
      { id: 'wf_b', name: 'B', steps: ['wf_a'] },
    ];
    // Also need intent to map to wf_a so it doesn't trigger INTENT_NO_TOOLS
    skill.intents.supported[0].maps_to_workflow = 'wf_a';
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'WORKFLOW_CIRCULAR');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('wf_a');
    expect(found[0].message).toContain('wf_b');
  });

  it('non-circular workflow chain → no WORKFLOW_CIRCULAR', () => {
    const skill = makeValidSkill();
    skill.policy.workflows = [
      { id: 'wf_a', name: 'A', steps: ['wf_b'], trigger: 'order_status' },
      { id: 'wf_b', name: 'B', steps: ['orders.order.get'] },
    ];
    skill.intents.supported[0].maps_to_workflow = 'wf_a';
    const { issues } = resolve(skill);
    const found = issues.filter(i => i.code === 'WORKFLOW_CIRCULAR');
    expect(found).toHaveLength(0);
  });
});
