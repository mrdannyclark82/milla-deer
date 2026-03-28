import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../personaFusionService', () => ({
  generateActivePersona: vi.fn().mockResolvedValue({
    userId: 'default-user',
    timestamp: Date.now(),
    profile: {
      name: 'User',
      interests: ['tech'],
      preferences: {},
      goals: [],
    },
    memoryContext: {
      recentInteractions: 'talked about comfort and hoodies',
      relevantTopics: ['comfort', 'build'],
      emotionalPatterns: ['calm'],
    },
    ambientContext: {
      timeOfDay: '8:00 PM',
      dateInfo: 'Tonight',
    },
    personaSummary: 'A tech-focused user in a calm evening context.',
  }),
}));

vi.mock('../merchApi', () => ({
  getMerchItems: vi.fn().mockResolvedValue([
    {
      id: 'hoodie-001',
      name: 'Milla-Rayne Empire Hoodie',
      price: 49.99,
      category: 'apparel',
    },
    {
      id: 'hoodie-002',
      name: 'Milla-Rayne Tech Hoodie',
      price: 59.99,
      category: 'apparel',
    },
  ]),
}));

vi.mock('../performanceProfilingService', () => ({
  recordPerformanceMetric: vi.fn().mockResolvedValue(undefined),
}));

import {
  createSwarmHandoffDecision,
  getDynamicMerchRecommendations,
  getFusionMonitoringSnapshot,
  registerDeviceProfile,
  resetSwarmRuntimeStateForTests,
} from '../swarmRuntimeService';

describe('swarmRuntimeService', () => {
  beforeEach(() => {
    resetSwarmRuntimeStateForTests();
    vi.clearAllMocks();
  });

  it('prefers a webgpu browser target for vision handoffs', async () => {
    await registerDeviceProfile({
      sessionId: 'web-session',
      userId: 'default-user',
      surface: 'web',
      platform: 'chrome',
      deviceLabel: 'Chrome desktop',
      syncedAt: Date.now(),
      network: 'online',
      capabilities: {
        aiCore: false,
        liteRt: false,
        localModel: false,
        mediaPipe: true,
        vision: true,
        voice: true,
        webgpu: true,
      },
      preferredBackends: ['webgpu-browser', 'remote-cloud'],
      runtime: {
        activeProfile: 'balanced',
        activeModelSource: null,
        importedModelSizeMb: null,
        lastKnownLatencyMs: 105,
        totalRamMb: 16384,
      },
    });

    const decision = createSwarmHandoffDecision({
      sourceSessionId: 'mobile-session',
      userId: 'default-user',
      intent: 'vision',
      currentSurface: 'mobile',
      requiresVision: true,
      preferredTargetSurface: 'web',
    });

    expect(decision.targetSurface).toBe('web');
    expect(decision.targetBackend).toBe('webgpu-browser');
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it('produces a fusion snapshot from active devices and handoffs', async () => {
    await registerDeviceProfile({
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

    createSwarmHandoffDecision({
      sourceSessionId: 'web-session',
      userId: 'default-user',
      intent: 'chat',
      currentSurface: 'web',
      requiresLowLatency: true,
    });

    const snapshot = getFusionMonitoringSnapshot();

    expect(snapshot.summary.activeDeviceCount).toBe(1);
    expect(snapshot.summary.recentHandoffCount).toBe(1);
    expect(snapshot.summary.surfaceBreakdown.mobile).toBe(1);
  });

  it('creates memory-driven merch recommendations', async () => {
    const recommendations = await getDynamicMerchRecommendations({
      userId: 'default-user',
      contextMessage: 'Need a comforting merch suggestion after a late coding session',
    });

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].pricingReason).toContain('memory signals');
    expect(recommendations[0].adjustedPrice).not.toBe(
      recommendations[0].basePrice
    );
  });
});
