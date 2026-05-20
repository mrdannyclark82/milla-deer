import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerMonitoringRoutes } from './monitoring.routes';
import { agentController } from '../agentController';
import * as featureFlags from '../featureFlags';
import * as swarmRuntimeService from '../swarmRuntimeService';

vi.mock('../agentController');
vi.mock('../apiResilience');
vi.mock('../xaiTracker');
vi.mock('../featureFlags');
vi.mock('../swarmRuntimeService');

describe('Monitoring Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerMonitoringRoutes(app);
    vi.clearAllMocks();
  });

  describe('GET /api/feature-flags', () => {
    it('should return feature flags', async () => {
      vi.spyOn(featureFlags, 'getFeatureFlags').mockReturnValue({
        flag1: true,
      } as any);
      const response = await request(app).get('/api/feature-flags');

      expect(response.status).toBe(200);
      expect(response.body.flags.flag1).toBe(true);
    });
  });

  describe('GET /api/monitoring/agents', () => {
    it('should return agent metrics', async () => {
      vi.spyOn(agentController, 'getAllMetrics').mockReturnValue({});
      vi.spyOn(agentController, 'getRegisteredAgents').mockReturnValue([]);
      const response = await request(app).get('/api/monitoring/agents');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/monitoring/fusion', () => {
    it('should return fusion monitoring data', async () => {
      vi.spyOn(swarmRuntimeService, 'getFusionMonitoringSnapshot').mockReturnValue({
        generatedAt: Date.now(),
        activeDevices: [],
        summary: {
          averageEstimatedLatencyMs: 80,
          recentHandoffCount: 2,
          activeDeviceCount: 1,
          surfaceBreakdown: {
            web: 1,
            mobile: 0,
            server: 0,
          },
          backendBreakdown: {
            'webgpu-browser': 1,
            'android-npu': 0,
            'android-local': 0,
            'ollama-local': 0,
            'remote-cloud': 0,
            'openai-edge-stub': 0,
            'offline-fallback': 0,
          },
        },
        recentHandoffs: [],
      });

      const response = await request(app).get('/api/monitoring/fusion');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.snapshot.summary.averageEstimatedLatencyMs).toBe(80);
    });
  });

  describe('POST /api/swarm/devices/register', () => {
    it('should register a device profile', async () => {
      vi.spyOn(swarmRuntimeService, 'registerDeviceProfile').mockResolvedValue({
        sessionId: 'mobile-session',
        userId: 'default-user',
        surface: 'mobile',
        platform: 'android',
        deviceLabel: 'Pixel',
        syncedAt: Date.now(),
        network: 'online',
        capabilities: {
          aiCore: true,
          liteRt: true,
          localModel: true,
          mediaPipe: true,
          vision: true,
          voice: true,
          webgpu: false,
        },
        preferredBackends: ['android-npu'],
        runtime: {
          activeProfile: 'fast',
          activeModelSource: 'bundled-asset',
          importedModelSizeMb: null,
          lastKnownLatencyMs: 80,
          totalRamMb: 8192,
        },
      });

      const response = await request(app).post('/api/swarm/devices/register').send({
        sessionId: 'mobile-session',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.profile.sessionId).toBe('mobile-session');
    });
  });

  describe('POST /api/swarm/handoff', () => {
    it('should return a handoff decision', async () => {
      vi.spyOn(swarmRuntimeService, 'createSwarmHandoffDecision').mockReturnValue({
        handoffId: 'handoff-1',
        createdAt: Date.now(),
        sourceSessionId: 'mobile-session',
        targetSessionId: 'web-session',
        currentSurface: 'mobile',
        targetSurface: 'web',
        targetBackend: 'webgpu-browser',
        confidence: 0.94,
        estimatedLatencyMs: 110,
        reason: 'Browser WebGPU is available.',
        intent: 'vision',
      });

      const response = await request(app).post('/api/swarm/handoff').send({
        sourceSessionId: 'mobile-session',
        userId: 'default-user',
        intent: 'vision',
        currentSurface: 'mobile',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.decision.targetBackend).toBe('webgpu-browser');
    });
  });
});
