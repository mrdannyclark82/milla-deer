/**
 * Skills API Routes
 *
 * GET  /api/skills              – list all skills
 * GET  /api/skills/:id          – get a single skill by ID
 * GET  /api/skills/category/:cat – list skills by category
 * POST /api/skills/prompt        – build a merged system-prompt for a set of skill IDs
 * POST /api/skills/tools         – get merged tools list for a set of skill IDs
 */

import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import {
  listSkills,
  listSkillsByCategory,
  getSkill,
  buildSkillsSystemPrompt,
  getSkillsTools,
  type Skill,
} from '../services/skillsRegistryService';

export function registerSkillsRoutes(app: Express) {
  /** List all skills */
  app.get(
    '/api/skills',
    asyncHandler(async (_req, res) => {
      const skills = listSkills();
      res.json({ success: true, skills });
    })
  );

  /** Get skill by ID */
  app.get(
    '/api/skills/:id',
    asyncHandler(async (req, res) => {
      const skill = getSkill(req.params.id);
      if (!skill) {
        res.status(404).json({ success: false, error: `Skill "${req.params.id}" not found.` });
        return;
      }
      res.json({ success: true, skill });
    })
  );

  /** List skills by category */
  app.get(
    '/api/skills/category/:cat',
    asyncHandler(async (req, res) => {
      const validCategories: Skill['category'][] = [
        'interaction',
        'development',
        'infrastructure',
        'filesystem',
      ];
      const cat = req.params.cat as Skill['category'];
      if (!validCategories.includes(cat)) {
        res.status(400).json({
          success: false,
          error: `Unknown category "${cat}". Valid: ${validCategories.join(', ')}`,
        });
        return;
      }
      const skills = listSkillsByCategory(cat);
      res.json({ success: true, category: cat, skills });
    })
  );

  /**
   * Build a merged system prompt for the provided skill IDs.
   * Body: { skillIds: string[] }
   */
  app.post(
    '/api/skills/prompt',
    asyncHandler(async (req, res) => {
      const body = req.body as { skillIds?: unknown };
      if (!Array.isArray(body.skillIds) || body.skillIds.some((id) => typeof id !== 'string')) {
        res.status(400).json({ success: false, error: 'skillIds must be an array of strings.' });
        return;
      }
      const systemPrompt = buildSkillsSystemPrompt(body.skillIds as string[]);
      res.json({ success: true, systemPrompt });
    })
  );

  /**
   * Get merged tool list for the provided skill IDs.
   * Body: { skillIds: string[] }
   */
  app.post(
    '/api/skills/tools',
    asyncHandler(async (req, res) => {
      const body = req.body as { skillIds?: unknown };
      if (!Array.isArray(body.skillIds) || body.skillIds.some((id) => typeof id !== 'string')) {
        res.status(400).json({ success: false, error: 'skillIds must be an array of strings.' });
        return;
      }
      const tools = getSkillsTools(body.skillIds as string[]);
      res.json({ success: true, tools });
    })
  );
}
