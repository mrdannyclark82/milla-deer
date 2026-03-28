import { Router, type Express } from 'express';
import { agentController } from '../agentController';
import { circuitBreaker, apiCache, rateLimiter } from '../apiResilience';
import { getReasoningData } from '../xaiTracker';
import { getFeatureFlags } from '../featureFlags';
import { asyncHandler } from '../utils/routeHelpers';
import {
  createSwarmHandoffDecision,
  getFusionMonitoringSnapshot,
  registerDeviceProfile,
} from '../swarmRuntimeService';

/**
 * Advanced Monitoring and Feature Flag Routes
 */
export function registerMonitoringRoutes(app: Express) {
  const router = Router();

  // Feature flags
  router.get(
    '/feature-flags',
    asyncHandler(async (req, res) => {
      const flags = getFeatureFlags();
      res.json({ success: true, flags });
    })
  );

  // Agent metrics
  router.get(
    '/monitoring/agents',
    asyncHandler(async (req, res) => {
      const metrics = agentController.getAllMetrics();
      const agents = agentController.getRegisteredAgents();
      res.json({ success: true, agents, metrics, timestamp: Date.now() });
    })
  );

  // Resilience status
  router.get(
    '/monitoring/resilience',
    asyncHandler(async (req, res) => {
      res.json({
        success: true,
        circuitBreaker: circuitBreaker.getStatus(),
        cache: { size: apiCache.size(), maxSize: 1000 },
        rateLimiter: rateLimiter.getStatus(),
        timestamp: Date.now(),
      });
    })
  );

  router.get(
    '/monitoring/fusion',
    asyncHandler(async (req, res) => {
      res.json({
        success: true,
        snapshot: getFusionMonitoringSnapshot(),
        timestamp: Date.now(),
      });
    })
  );

  router.post(
    '/swarm/devices/register',
    asyncHandler(async (req, res) => {
      const profile = await registerDeviceProfile(req.body);
      res.json({ success: true, profile, timestamp: Date.now() });
    })
  );

  router.post(
    '/swarm/handoff',
    asyncHandler(async (req, res) => {
      const decision = createSwarmHandoffDecision(req.body);
      res.json({ success: true, decision, timestamp: Date.now() });
    })
  );

  // XAI Reasoning session data
  router.get(
    '/xai/session/:sessionId',
    asyncHandler(async (req, res) => {
      const data = getReasoningData(req.params.sessionId as string);
      res.json({ success: true, data, timestamp: Date.now() });
    })
  );

  // Mount routes
  app.use('/api', router);
}
