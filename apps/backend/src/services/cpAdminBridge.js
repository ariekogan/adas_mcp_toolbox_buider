/**
 * CP Admin Bridge Service
 *
 * Bridge to CORE's cp.admin_api for actor/identity management.
 * Calls CORE's MCP server to manage actors, tokens, and identities.
 */

// Configuration from environment
const CORE_MCP_URL = process.env.CORE_MCP_URL || "http://localhost:4310/mcp";
const CORE_MCP_SECRET = process.env.CORE_MCP_SECRET || "";

/**
 * Call CORE's cp.admin_api via MCP JSON-RPC
 *
 * @param {string} method - Admin API method name (e.g., 'listActors', 'createActor')
 * @param {object} params - Method-specific parameters
 * @returns {Promise<any>} - Result from the admin API
 */
async function callAdminApi(method, params = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  // Add auth header if secret is configured
  if (CORE_MCP_SECRET) {
    headers["x-adas-token"] = CORE_MCP_SECRET;
  }

  const response = await fetch(CORE_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "cp.admin_api",
        arguments: {
          method,
          params,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`CORE MCP call failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`CORE MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  // Extract result from MCP response
  const content = data.result?.content?.[0];
  if (content?.type === "text") {
    return JSON.parse(content.text);
  }

  return data.result;
}

// ============================================
// Actor Management
// ============================================

/**
 * List all actors
 * @param {object} params - { limit?, offset?, status? }
 * @returns {Promise<{ actors: Actor[], paging: { total, limit, offset } }>}
 */
export async function listActors(params = {}) {
  return callAdminApi("listActors", params);
}

/**
 * Get a single actor by ID
 * @param {string} actorId
 * @returns {Promise<{ actor: Actor, tokens: Token[] }>}
 */
export async function getActor(actorId) {
  return callAdminApi("getActor", { actorId });
}

/**
 * Create a new actor
 * @param {object} params - { actorType?, roles?, displayName?, identities?, status? }
 * @returns {Promise<{ actor: Actor }>}
 */
export async function createActor(params = {}) {
  return callAdminApi("createActor", params);
}

/**
 * Update actor roles
 * @param {string} actorId
 * @param {string[]} roles
 * @returns {Promise<{ actor: Actor }>}
 */
export async function updateActor(actorId, roles) {
  return callAdminApi("updateActor", { actorId, roles });
}

/**
 * Approve a pending actor
 * @param {string} actorId
 * @returns {Promise<{ actor: Actor }>}
 */
export async function approveActor(actorId) {
  return callAdminApi("approveActor", { actorId });
}

/**
 * Deactivate an actor
 * @param {string} actorId
 * @returns {Promise<{ actor: Actor }>}
 */
export async function deactivateActor(actorId) {
  return callAdminApi("deactivateActor", { actorId });
}

// ============================================
// Identity Management
// ============================================

/**
 * Link an external identity to an actor
 * @param {string} actorId
 * @param {string} provider
 * @param {string} externalId
 * @returns {Promise<{ actor: Actor }>}
 */
export async function linkIdentity(actorId, provider, externalId) {
  return callAdminApi("linkIdentity", { actorId, provider, externalId });
}

/**
 * Unlink an external identity from an actor
 * @param {string} actorId
 * @param {string} provider
 * @param {string} externalId
 * @returns {Promise<{ actor: Actor }>}
 */
export async function unlinkIdentity(actorId, provider, externalId) {
  return callAdminApi("unlinkIdentity", { actorId, provider, externalId });
}

// ============================================
// Token Management
// ============================================

/**
 * Create a new PAT for an actor
 * @param {string} actorId
 * @param {string[]} scopes
 * @returns {Promise<{ id: string, token: string, prefix: string }>}
 */
export async function createToken(actorId, scopes = ["*"]) {
  return callAdminApi("createToken", { actorId, scopes });
}

/**
 * Revoke a token
 * @param {string} tokenId
 * @returns {Promise<{ success: boolean }>}
 */
export async function revokeToken(tokenId) {
  return callAdminApi("revokeToken", { tokenId });
}

/**
 * List tokens for an actor
 * @param {string} actorId
 * @returns {Promise<{ tokens: Token[] }>}
 */
export async function listTokens(actorId) {
  return callAdminApi("listTokens", { actorId });
}

// ============================================
// Audit
// ============================================

/**
 * List audit events
 * @param {object} params - { limit?, date?, actorId?, action? }
 * @returns {Promise<{ events: AuditEvent[] }>}
 */
export async function listAudit(params = {}) {
  return callAdminApi("listAudit", params);
}

// ============================================
// Email Aliases (Gmail Send As)
// ============================================

/**
 * List Gmail "Send As" email aliases
 * @returns {Promise<{ ok: boolean, aliases: EmailAlias[] }>}
 */
export async function listEmailAliases() {
  return callAdminApi("listEmailAliases", {});
}

/**
 * Set email configuration (SMTP/IMAP credentials)
 * @param {object} params - { emailUser, emailPass, smtpHost?, smtpPort?, imapHost?, imapPort? }
 * @returns {Promise<{ ok: boolean, config: EmailConfig }>}
 */
export async function setEmailConfig(params = {}) {
  return callAdminApi("setEmailConfig", params);
}

/**
 * Get current email configuration (password masked)
 * @returns {Promise<{ ok: boolean, configured: boolean, config: EmailConfig }>}
 */
export async function getEmailConfig() {
  return callAdminApi("getEmailConfig", {});
}

/**
 * Test email connection (SMTP and/or IMAP)
 * @param {object} params - { protocol?: "smtp" | "imap" | "both" }
 * @returns {Promise<{ ok: boolean, smtp?, imap? }>}
 */
export async function testEmailConnection(params = {}) {
  return callAdminApi("testEmailConnection", params);
}

// ============================================
// Telegram Config
// ============================================

/**
 * Set Telegram bot configuration
 * @param {object} params - { botName, botToken }
 * @returns {Promise<{ ok: boolean, config: TelegramConfig }>}
 */
export async function setTelegramConfig(params = {}) {
  return callAdminApi("setTelegramConfig", params);
}

/**
 * Get current Telegram bot configuration (token masked)
 * @returns {Promise<{ ok: boolean, configured: boolean, config: TelegramConfig }>}
 */
export async function getTelegramConfig() {
  return callAdminApi("getTelegramConfig", {});
}

/**
 * Test Telegram bot connection
 * @returns {Promise<{ ok: boolean, botInfo?: object }>}
 */
export async function testTelegramConnection() {
  return callAdminApi("testTelegramConnection", {});
}

// ============================================
// Trigger Management
// ============================================

/**
 * List all triggers across all skills or for a specific skill
 * @param {object} params - { skillSlug?, status?, limit?, offset? }
 * @returns {Promise<{ triggers: Trigger[], paging: { total, limit, offset } }>}
 */
export async function listTriggers(params = {}) {
  return callAdminApi("listTriggers", params);
}

/**
 * Get a specific trigger by skill and trigger ID
 * @param {string} skillSlug - The skill slug
 * @param {string} triggerId - The trigger ID
 * @returns {Promise<{ trigger: Trigger }>}
 */
export async function getTrigger(skillSlug, triggerId) {
  return callAdminApi("getTrigger", { skillSlug, triggerId });
}

/**
 * Enable a trigger (make it active in CORE)
 * @param {string} skillSlug - The skill slug
 * @param {string} triggerId - The trigger ID
 * @returns {Promise<{ trigger: Trigger }>}
 */
export async function enableTrigger(skillSlug, triggerId) {
  return callAdminApi("enableTrigger", { skillSlug, triggerId });
}

/**
 * Disable a trigger (pause it in CORE)
 * @param {string} skillSlug - The skill slug
 * @param {string} triggerId - The trigger ID
 * @returns {Promise<{ trigger: Trigger }>}
 */
export async function disableTrigger(skillSlug, triggerId) {
  return callAdminApi("disableTrigger", { skillSlug, triggerId });
}

/**
 * Toggle a trigger's active state
 * @param {string} skillSlug - The skill slug
 * @param {string} triggerId - The trigger ID
 * @param {boolean} active - Whether to enable or disable
 * @returns {Promise<{ trigger: Trigger }>}
 */
export async function toggleTrigger(skillSlug, triggerId, active) {
  if (active) {
    return enableTrigger(skillSlug, triggerId);
  }
  return disableTrigger(skillSlug, triggerId);
}

/**
 * Get trigger execution history
 * @param {string} skillSlug - The skill slug
 * @param {string} triggerId - The trigger ID
 * @param {object} params - { limit?, since? }
 * @returns {Promise<{ executions: TriggerExecution[] }>}
 */
export async function getTriggerHistory(skillSlug, triggerId, params = {}) {
  return callAdminApi("getTriggerHistory", { skillSlug, triggerId, ...params });
}

// ============================================
// Convenience Methods for DAL
// ============================================

/**
 * Find or create an actor for a connector identity
 *
 * @param {object} params - { provider, externalId, displayName }
 * @returns {Promise<{ actor: Actor, created: boolean }>}
 */
export async function findOrCreateActorForIdentity({ provider, externalId, displayName }) {
  // First, try to find existing actor by listing and filtering
  const { actors } = await listActors({ limit: 1000 });

  const existingActor = actors.find((actor) =>
    actor.identities?.some(
      (id) =>
        id.provider?.toLowerCase() === provider?.toLowerCase() &&
        id.externalId?.toLowerCase() === externalId?.toLowerCase()
    )
  );

  if (existingActor) {
    return { actor: existingActor, created: false };
  }

  // Create new actor with the identity
  const { actor } = await createActor({
    actorType: "external_user",
    roles: ["external_user"],
    displayName: displayName || externalId,
    identities: [{ provider, externalId }],
    status: "active",
  });

  return { actor, created: true };
}

/**
 * Get or create a token for a connector identity
 * Creates actor if needed, then creates/returns token
 *
 * @param {object} params - { provider, externalId, displayName, scopes }
 * @returns {Promise<{ actor: Actor, token: string, tokenId: string }>}
 */
export async function getOrCreateTokenForIdentity({ provider, externalId, displayName, scopes = ["*"] }) {
  const { actor } = await findOrCreateActorForIdentity({ provider, externalId, displayName });

  // Create a new token for this actor
  const { id, token } = await createToken(actor.actorId, scopes);

  return {
    actor,
    token,
    tokenId: id,
  };
}

/**
 * Find or create a skill actor (agent type)
 *
 * Skills have actorType 'agent' and are identified by their skillSlug.
 * The actor_ref format is: agent::{skillSlug}
 *
 * @param {object} params - { skillSlug, displayName }
 * @returns {Promise<{ actor: Actor, created: boolean }>}
 */
export async function findOrCreateSkillActor({ skillSlug, displayName }) {
  // First, try to find existing actor by listing and filtering
  const { actors } = await listActors({ limit: 1000 });

  // Skill actors have identity with provider='skill' and externalId=skillSlug
  const existingActor = actors.find((actor) =>
    actor.actorType === "agent" &&
    actor.identities?.some(
      (id) =>
        id.provider?.toLowerCase() === "skill" &&
        id.externalId?.toLowerCase() === skillSlug?.toLowerCase()
    )
  );

  if (existingActor) {
    return { actor: existingActor, created: false };
  }

  // Create new actor with agent type
  const { actor } = await createActor({
    actorType: "agent",
    roles: ["skill", "agent"],
    displayName: displayName || skillSlug,
    identities: [{ provider: "skill", externalId: skillSlug }],
    status: "active",
  });

  return { actor, created: true };
}

/**
 * Provision a skill actor with token
 *
 * Creates skill actor if needed, then creates/returns token.
 * Used during skill deployment to ADAS Core.
 *
 * @param {object} params - { skillSlug, displayName, scopes }
 * @returns {Promise<{ actor: Actor, token: string, tokenId: string, created: boolean }>}
 */
export async function provisionSkillActor({ skillSlug, displayName, scopes = ["*"] }) {
  const { actor, created } = await findOrCreateSkillActor({ skillSlug, displayName });

  // Create a new token for this skill actor
  const { id, token } = await createToken(actor.actorId, scopes);

  return {
    actor,
    token,
    tokenId: id,
    created,
  };
}

// ============================================
// Retention Cleanup
// ============================================

/**
 * Run retention cleanup via CORE
 * @param {object} params - { retention_days?, dryRun? }
 * @returns {Promise<{ ok: boolean, stats: object }>}
 */
export async function retentionCleanup(params = {}) {
  return callAdminApi("retentionCleanup", params);
}

export default {
  // Actor
  listActors,
  getActor,
  createActor,
  updateActor,
  approveActor,
  deactivateActor,
  // Identity
  linkIdentity,
  unlinkIdentity,
  // Token
  createToken,
  revokeToken,
  listTokens,
  // Audit
  listAudit,
  // Email Config
  listEmailAliases,
  setEmailConfig,
  getEmailConfig,
  testEmailConnection,
  // Telegram Config
  setTelegramConfig,
  getTelegramConfig,
  testTelegramConnection,
  // Triggers
  listTriggers,
  getTrigger,
  enableTrigger,
  disableTrigger,
  toggleTrigger,
  getTriggerHistory,
  // Convenience
  findOrCreateActorForIdentity,
  getOrCreateTokenForIdentity,
  // Skill Actors
  findOrCreateSkillActor,
  provisionSkillActor,
  // Retention
  retentionCleanup,
};
