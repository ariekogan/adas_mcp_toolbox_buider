import { describe, it, expect } from 'vitest';
import { checkCompleteness } from '../src/validators/completenessChecker.js';
import { makeValidSkill } from './fixtures/validSkill.js';

describe('completenessChecker', () => {
  it('complete skill → all core sections true', () => {
    const result = checkCompleteness(makeValidSkill());
    expect(result.problem).toBe(true);
    expect(result.tools).toBe(true);
    expect(result.intents).toBe(true);
    expect(result.policy).toBe(true);
  });

  it('missing problem statement → problem false', () => {
    const skill = makeValidSkill();
    skill.problem.statement = '';
    const result = checkCompleteness(skill);
    expect(result.problem).toBe(false);
  });

  it('empty tools array → tools false', () => {
    const skill = makeValidSkill();
    skill.tools = [];
    const result = checkCompleteness(skill);
    expect(result.tools).toBe(false);
  });

  it('empty scenarios array → scenarios false', () => {
    const skill = makeValidSkill();
    skill.scenarios = [];
    const result = checkCompleteness(skill);
    expect(result.scenarios).toBe(false);
  });

  it('no intents → intents false', () => {
    const skill = makeValidSkill();
    skill.intents.supported = [];
    const result = checkCompleteness(skill);
    expect(result.intents).toBe(false);
  });
});
