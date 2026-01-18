/**
 * Domains API Routes
 *
 * Handles CRUD operations for DraftDomain objects.
 * Supports auto-migration from legacy project format.
 */

import { Router } from 'express';
import domainsStore from '../store/domains.js';
import templatesStore from '../store/templates.js';
import { getValidationSummary } from '../validators/index.js';

const router = Router();

/**
 * List all domains
 * GET /api/domains
 *
 * Returns both new-format domains and legacy projects (marked for migration)
 */
router.get('/', async (req, res, next) => {
  try {
    const domains = await domainsStore.list();
    res.json({ domains });
  } catch (err) {
    next(err);
  }
});

/**
 * Create new domain
 * POST /api/domains
 *
 * Body: {
 *   name: string,
 *   settings?: { llm_provider, llm_model },
 *   templateId?: string  // Optional: template to use as starting point
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, settings, templateId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Domain name is required' });
    }

    // Load template if specified
    let template = null;
    if (templateId) {
      try {
        template = await templatesStore.load(templateId);
      } catch (err) {
        return res.status(400).json({ error: `Template "${templateId}" not found` });
      }
    }

    const domain = await domainsStore.create(name, settings, template);
    res.status(201).json({ domain });
  } catch (err) {
    next(err);
  }
});

/**
 * Get domain by ID
 * GET /api/domains/:id
 *
 * Automatically migrates legacy projects to new format on first load
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const domain = await domainsStore.load(id);
    res.json({ domain });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next(err);
  }
});

/**
 * Update domain state
 * PATCH /api/domains/:id
 *
 * Body: { updates: { ... state updates using dot notation ... } }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    const domain = await domainsStore.updateState(id, updates);
    res.json({ domain });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next(err);
  }
});

/**
 * Update domain settings
 * PATCH /api/domains/:id/settings
 *
 * Body: { llm_provider?, llm_model?, ... }
 */
router.patch('/:id/settings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const settings = req.body;

    const domain = await domainsStore.updateSettings(id, settings);
    res.json({ domain });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next(err);
  }
});

/**
 * Get domain validation summary
 * GET /api/domains/:id/validation
 */
router.get('/:id/validation', async (req, res, next) => {
  try {
    const { id } = req.params;
    const domain = await domainsStore.load(id);
    const summary = getValidationSummary(domain);
    res.json({ validation: summary });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next(err);
  }
});

/**
 * Delete domain
 * DELETE /api/domains/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await domainsStore.remove(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Append message to domain conversation
 * POST /api/domains/:id/messages
 *
 * Body: { role: 'user' | 'assistant', content: string }
 */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, content, state_update, suggested_focus } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    const message = { role, content, state_update, suggested_focus };
    const domain = await domainsStore.appendMessage(id, message);
    res.json({ domain });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    next(err);
  }
});

export default router;
