import { Router, type Express } from 'express';
import {
  getPersonalTasks,
  startTask,
  completeTask,
  getTaskSummary,
} from '../personalTaskService';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';

/**
 * Personal Task and Self-Improvement Task Routes
 */
export function registerPersonalTaskRoutes(app: Express) {
  const router = Router();

  router.get(
    '/personal-tasks',
    requireAuth,
    asyncHandler(async (req, res) => {
      const tasks = getPersonalTasks();
      res.json(tasks);
    })
  );

  router.get(
    '/task-summary',
    requireAuth,
    asyncHandler(async (req, res) => {
      const summary = getTaskSummary();
      res.json({ summary });
    })
  );

  router.post(
    '/personal-tasks/:taskId/start',
    requireAuth,
    asyncHandler(async (req, res) => {
      const task = await startTask(req.params.taskId as string);
      res.json({ success: !!task, task });
    })
  );

  router.post(
    '/personal-tasks/:taskId/complete',
    requireAuth,
    asyncHandler(async (req, res) => {
      const insights = req.body.insights || "Task completed manually.";
      const task = await completeTask(req.params.taskId as string, insights);
      res.json({ success: !!task, task });
    })
  );

  // Mount routes
  app.use('/api', router);
}
