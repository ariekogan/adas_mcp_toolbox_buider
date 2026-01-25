/**
 * Actors API Routes
 *
 * REST API for actor/identity management via CORE's cp.admin_api
 */

import { Router } from "express";
import cpAdminBridge from "../services/cpAdminBridge.js";

const router = Router();

// ============================================
// Actor Endpoints
// ============================================

/**
 * GET /api/actors
 * List all actors
 */
router.get("/", async (req, res) => {
  try {
    const { limit, offset, status } = req.query;
    const result = await cpAdminBridge.listActors({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      status: status || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("[actors] listActors error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/actors/:actorId
 * Get single actor with tokens
 */
router.get("/:actorId", async (req, res) => {
  try {
    const { actorId } = req.params;
    const result = await cpAdminBridge.getActor(actorId);
    res.json(result);
  } catch (err) {
    console.error("[actors] getActor error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors
 * Create new actor
 */
router.post("/", async (req, res) => {
  try {
    const { actorType, roles, displayName, identities, status } = req.body;
    const result = await cpAdminBridge.createActor({
      actorType,
      roles,
      displayName,
      identities,
      status,
    });
    res.json(result);
  } catch (err) {
    console.error("[actors] createActor error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/actors/:actorId/roles
 * Update actor roles
 */
router.patch("/:actorId/roles", async (req, res) => {
  try {
    const { actorId } = req.params;
    const { roles } = req.body;
    const result = await cpAdminBridge.updateActor(actorId, roles);
    res.json(result);
  } catch (err) {
    console.error("[actors] updateActor error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/:actorId/approve
 * Approve pending actor
 */
router.post("/:actorId/approve", async (req, res) => {
  try {
    const { actorId } = req.params;
    const result = await cpAdminBridge.approveActor(actorId);
    res.json(result);
  } catch (err) {
    console.error("[actors] approveActor error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/:actorId/deactivate
 * Deactivate actor
 */
router.post("/:actorId/deactivate", async (req, res) => {
  try {
    const { actorId } = req.params;
    const result = await cpAdminBridge.deactivateActor(actorId);
    res.json(result);
  } catch (err) {
    console.error("[actors] deactivateActor error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Identity Endpoints
// ============================================

/**
 * POST /api/actors/:actorId/identities
 * Link identity to actor
 */
router.post("/:actorId/identities", async (req, res) => {
  try {
    const { actorId } = req.params;
    const { provider, externalId } = req.body;

    if (!provider || !externalId) {
      return res.status(400).json({ error: "provider and externalId are required" });
    }

    const result = await cpAdminBridge.linkIdentity(actorId, provider, externalId);
    res.json(result);
  } catch (err) {
    console.error("[actors] linkIdentity error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/actors/:actorId/identities
 * Unlink identity from actor
 */
router.delete("/:actorId/identities", async (req, res) => {
  try {
    const { actorId } = req.params;
    const { provider, externalId } = req.body;

    if (!provider || !externalId) {
      return res.status(400).json({ error: "provider and externalId are required" });
    }

    const result = await cpAdminBridge.unlinkIdentity(actorId, provider, externalId);
    res.json(result);
  } catch (err) {
    console.error("[actors] unlinkIdentity error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Token Endpoints
// ============================================

/**
 * GET /api/actors/:actorId/tokens
 * List tokens for actor
 */
router.get("/:actorId/tokens", async (req, res) => {
  try {
    const { actorId } = req.params;
    const result = await cpAdminBridge.listTokens(actorId);
    res.json(result);
  } catch (err) {
    console.error("[actors] listTokens error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/:actorId/tokens
 * Create token for actor
 */
router.post("/:actorId/tokens", async (req, res) => {
  try {
    const { actorId } = req.params;
    const { scopes } = req.body;
    const result = await cpAdminBridge.createToken(actorId, scopes || ["*"]);
    res.json(result);
  } catch (err) {
    console.error("[actors] createToken error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/actors/tokens/:tokenId
 * Revoke token
 */
router.delete("/tokens/:tokenId", async (req, res) => {
  try {
    const { tokenId } = req.params;
    const result = await cpAdminBridge.revokeToken(tokenId);
    res.json(result);
  } catch (err) {
    console.error("[actors] revokeToken error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Convenience Endpoints for DAL
// ============================================

/**
 * POST /api/actors/find-or-create
 * Find or create actor for identity
 */
router.post("/find-or-create", async (req, res) => {
  try {
    const { provider, externalId, displayName } = req.body;

    if (!provider || !externalId) {
      return res.status(400).json({ error: "provider and externalId are required" });
    }

    const result = await cpAdminBridge.findOrCreateActorForIdentity({
      provider,
      externalId,
      displayName,
    });
    res.json(result);
  } catch (err) {
    console.error("[actors] findOrCreateActorForIdentity error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/token-for-identity
 * Get or create token for identity (creates actor if needed)
 */
router.post("/token-for-identity", async (req, res) => {
  try {
    const { provider, externalId, displayName, scopes } = req.body;

    if (!provider || !externalId) {
      return res.status(400).json({ error: "provider and externalId are required" });
    }

    const result = await cpAdminBridge.getOrCreateTokenForIdentity({
      provider,
      externalId,
      displayName,
      scopes,
    });
    res.json(result);
  } catch (err) {
    console.error("[actors] getOrCreateTokenForIdentity error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Email Configuration
// ============================================

/**
 * GET /api/actors/email-aliases
 * List Gmail "Send As" email aliases
 */
router.get("/email-aliases", async (req, res) => {
  try {
    const result = await cpAdminBridge.listEmailAliases();
    res.json(result);
  } catch (err) {
    console.error("[actors] listEmailAliases error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/actors/email-config
 * Get current email configuration (password masked)
 */
router.get("/email-config", async (req, res) => {
  try {
    const result = await cpAdminBridge.getEmailConfig();
    res.json(result);
  } catch (err) {
    console.error("[actors] getEmailConfig error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/email-config
 * Set email configuration (SMTP/IMAP credentials)
 */
router.post("/email-config", async (req, res) => {
  try {
    const { emailUser, emailPass, smtpHost, smtpPort, imapHost, imapPort } = req.body;

    if (!emailUser || !emailPass) {
      return res.status(400).json({ error: "emailUser and emailPass are required" });
    }

    const result = await cpAdminBridge.setEmailConfig({
      emailUser,
      emailPass,
      smtpHost,
      smtpPort,
      imapHost,
      imapPort,
    });
    res.json(result);
  } catch (err) {
    console.error("[actors] setEmailConfig error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/actors/email-config/test
 * Test email connection (SMTP and/or IMAP)
 */
router.post("/email-config/test", async (req, res) => {
  try {
    const { protocol } = req.body; // "smtp", "imap", or "both"
    const result = await cpAdminBridge.testEmailConnection({ protocol });
    res.json(result);
  } catch (err) {
    console.error("[actors] testEmailConnection error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
