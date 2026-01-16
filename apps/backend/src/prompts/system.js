/**
 * System prompt for the MCP Toolbox Builder conversation
 *
 * Uses the DraftDomain format (domain.json) via buildDALSystemPrompt()
 *
 * Legacy format (project.json + toolbox.json) has been removed.
 * Old projects are auto-migrated to DraftDomain format on load via migrate.js
 */

import { buildDALSystemPrompt } from './dalSystem.js';

// Export DAL system prompt builder
export { buildDALSystemPrompt };

/**
 * Build system prompt for a domain
 * @param {Object} domain - DraftDomain object
 * @returns {string}
 */
export function buildPromptForState(domain) {
  return buildDALSystemPrompt(domain);
}

export default { buildDALSystemPrompt, buildPromptForState };
