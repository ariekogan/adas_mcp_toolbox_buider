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
  // Convenience
  findOrCreateActorForIdentity,
  getOrCreateTokenForIdentity,
};
