/**
 * Templates API Routes
 *
 * Provides endpoints for listing and loading skill templates.
 */

import { Router } from 'express';
import templatesStore from '../store/templates.js';

const router = Router();

/**
 * List all available templates
 * GET /api/templates
 *
 * Returns metadata for all templates (not full content)
 */
router.get('/', async (req, res, next) => {
  try {
    const templates = await templatesStore.list();
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

/**
 * Get a specific template by ID
 * GET /api/templates/:id
 *
 * Returns full template content
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await templatesStore.load(id);
    res.json({ template });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Template not found' });
    }
    next(err);
  }
});

export default router;
