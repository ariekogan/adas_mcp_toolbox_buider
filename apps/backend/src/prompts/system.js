/**
 * System prompt for the MCP Toolbox Builder conversation
 *
 * Uses the DraftSkill format (skill.json) via buildDALSystemPrompt()
 *
 * Legacy format (project.json + toolbox.json) has been removed.
 * Old projects are auto-migrated to DraftSkill format on load via migrate.js
 */

import { buildDALSystemPrompt } from './dalSystem.js';

// Export DAL system prompt builder
export { buildDALSystemPrompt };

/**
 * Build system prompt for a skill
 * @param {Object} skill - DraftSkill object
 * @returns {string}
 */
export function buildPromptForState(skill) {
  return buildDALSystemPrompt(skill);
}

export default { buildDALSystemPrompt, buildPromptForState };
