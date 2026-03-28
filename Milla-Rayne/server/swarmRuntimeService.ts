import type {
  DeviceCapabilityProfile,
  FusionTelemetrySnapshot,
  MerchPricingRecommendation,
  SwarmBackend,
  SwarmHandoffDecision,
  SwarmHandoffRequest,
  SwarmIntent,
  SwarmSurface,
} from '@shared/swarm';
import { generateActivePersona } from './personaFusionService';
import { getMerchItems } from './merchApi';
import { recordPerformanceMetric } from './performanceProfilingService';

const MAX_RECENT_HANDOFFS = 40;
const DEFAULT_USER_ID = 'default-user';
const DEFAULT_COMMERCE_CONTEXT = 'merchandise and companion apparel';

const deviceProfiles = new Map<string, DeviceCapabilityProfile>();
const recentHandoffs: SwarmHandoffDecision[] = [];

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUserId(userId: string | undefined) {
  const trimmed = userId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
}

function clampConfidence(score: number) {
  return Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));
}

function recordRuntimeMetric(
  operation: string,
  duration: number,
  metadata: Record<string, unknown>
) {
  void recordPerformanceMetric({
    operation,
    duration,
    success: true,
    metadata,
  }).catch((error) => {
    console.error(`Failed to record ${operation} metric:`, error);
  });
}

function getProfilesForUser(userId: string) {
  return [...deviceProfiles.values()].filter((profile) => profile.userId === userId);
}

function estimateBackendLatency(
  backend: SwarmBackend,
  profile: DeviceCapabilityProfile | null
) {
  const knownLatency = profile?.runtime.lastKnownLatencyMs;
  if (typeof knownLatency === 'number' && Number.isFinite(knownLatency) && knownLatency > 0) {
    return knownLatency;
  }

  switch (backend) {
    case 'android-npu':
      return 80;
    case 'android-local':
      return 140;
    case 'webgpu-browser':
      return 110;
    case 'ollama-local':
      return 220;
    case 'openai-edge-stub':
      return 260;
    case 'remote-cloud':
      return 450;
    case 'offline-fallback':
    default:
      return 180;
  }
}

function chooseBackendForProfile(
  profile: DeviceCapabilityProfile,
  request: SwarmHandoffRequest
) {
  const reasons: string[] = [];
  let backend: SwarmBackend = 'remote-cloud';
  let score = 0.2;

  if (request.requiresVision && profile.capabilities.webgpu) {
    backend = 'webgpu-browser';
    score = 0.96;
    reasons.push('Browser WebGPU is available for vision-heavy work.');
  } else if (
    profile.surface === 'mobile' &&
    profile.capabilities.aiCore &&
    profile.capabilities.localModel
  ) {
    backend = 'android-npu';
    score = request.requiresLowLatency ? 0.95 : 0.88;
    reasons.push('Android device reports AI Core and local model availability.');
  } else if (profile.surface === 'mobile' && profile.capabilities.localModel) {
    backend = 'android-local';
    score = request.requiresLowLatency ? 0.84 : 0.74;
    reasons.push('Android device can satisfy the request with the local runtime.');
  } else if (profile.surface === 'web' && profile.capabilities.webgpu) {
    backend = 'webgpu-browser';
    score = request.intent === 'vision' ? 0.9 : 0.72;
    reasons.push('Browser WebGPU can take the active handoff.');
  } else if (profile.surface === 'server') {
    backend = 'ollama-local';
    score = 0.68;
    reasons.push('Server-local model is the best available hosted fallback.');
  } else if (request.intent === 'commerce' || request.intent === 'memory') {
    backend = 'openai-edge-stub';
    score = 0.66;
    reasons.push('Edge provider stub is preferred when local acceleration is unavailable.');
  } else if (profile.network === 'offline') {
    backend = 'offline-fallback';
    score = 0.42;
    reasons.push('No online route is available for this surface.');
  } else {
    backend = 'remote-cloud';
    score = 0.55;
    reasons.push('Remote cloud remains the safest general-purpose route.');
  }

  if (
    request.preferredTargetSurface &&
    request.preferredTargetSurface === profile.surface
  ) {
    score += 0.05;
    reasons.push(`Preferred target surface matched ${profile.surface}.`);
  }

  if (request.requiresLowLatency && backend === 'remote-cloud') {
    score -= 0.08;
    reasons.push('Remote cloud is penalized for low-latency requests.');
  }

  return {
    backend,
    estimatedLatencyMs: estimateBackendLatency(backend, profile),
    reason: reasons.join(' '),
    score: clampConfidence(score),
  };
}

function buildFallbackDecision(request: SwarmHandoffRequest): SwarmHandoffDecision {
  const targetBackend: SwarmBackend =
    request.intent === 'commerce' || request.intent === 'memory'
      ? 'openai-edge-stub'
      : 'remote-cloud';

  const estimatedLatencyMs = estimateBackendLatency(targetBackend, null);
  const decision: SwarmHandoffDecision = {
    handoffId: createId('handoff'),
    createdAt: Date.now(),
    sourceSessionId: request.sourceSessionId,
    targetSessionId: null,
    currentSurface: request.currentSurface,
    targetSurface: request.preferredTargetSurface || request.currentSurface,
    targetBackend,
    confidence: targetBackend === 'openai-edge-stub' ? 0.64 : 0.58,
    estimatedLatencyMs,
    reason:
      targetBackend === 'openai-edge-stub'
        ? 'No active accelerated target surface is registered, so the edge provider stub is keeping the route warm.'
        : 'No active accelerated target surface is registered, so the request stays on the remote cloud path.',
    intent: request.intent,
  };

  recentHandoffs.unshift(decision);
  recentHandoffs.splice(MAX_RECENT_HANDOFFS);
  recordRuntimeMetric('swarm.handoff', estimatedLatencyMs, {
    category: 'swarm-handoff',
    backend: targetBackend,
    targetSurface: decision.targetSurface,
    sourceSurface: request.currentSurface,
    intent: request.intent,
    fallback: true,
  });

  return decision;
}

function createSurfaceBreakdown() {
  return {
    web: 0,
    mobile: 0,
    server: 0,
  } satisfies Record<SwarmSurface, number>;
}

function createBackendBreakdown() {
  return {
    'webgpu-browser': 0,
    'android-npu': 0,
    'android-local': 0,
    'ollama-local': 0,
    'remote-cloud': 0,
    'openai-edge-stub': 0,
    'offline-fallback': 0,
  } satisfies Record<SwarmBackend, number>;
}

export async function registerDeviceProfile(
  profile: DeviceCapabilityProfile
): Promise<DeviceCapabilityProfile> {
  const normalized: DeviceCapabilityProfile = {
    ...profile,
    userId: normalizeUserId(profile.userId),
    syncedAt: Date.now(),
  };

  deviceProfiles.set(normalized.sessionId, normalized);
  recordRuntimeMetric('swarm.profile-sync', normalized.runtime.lastKnownLatencyMs ?? 30, {
    category: 'swarm-profile-sync',
    surface: normalized.surface,
    platform: normalized.platform,
    deviceLabel: normalized.deviceLabel,
    aiCore: normalized.capabilities.aiCore,
    webgpu: normalized.capabilities.webgpu,
  });

  return normalized;
}

export function getFusionMonitoringSnapshot(): FusionTelemetrySnapshot {
  const activeDevices = [...deviceProfiles.values()].sort(
    (left, right) => right.syncedAt - left.syncedAt
  );
  const surfaceBreakdown = createSurfaceBreakdown();
  const backendBreakdown = createBackendBreakdown();

  for (const device of activeDevices) {
    surfaceBreakdown[device.surface] += 1;
  }

  for (const handoff of recentHandoffs) {
    backendBreakdown[handoff.targetBackend] += 1;
  }

  const averageEstimatedLatencyMs =
    recentHandoffs.length > 0
      ? Math.round(
          recentHandoffs.reduce(
            (sum, handoff) => sum + handoff.estimatedLatencyMs,
            0
          ) / recentHandoffs.length
        )
      : 0;

  return {
    generatedAt: Date.now(),
    activeDevices,
    summary: {
      averageEstimatedLatencyMs,
      recentHandoffCount: recentHandoffs.length,
      activeDeviceCount: activeDevices.length,
      surfaceBreakdown,
      backendBreakdown,
    },
    recentHandoffs: [...recentHandoffs],
  };
}

export function createSwarmHandoffDecision(
  request: SwarmHandoffRequest
): SwarmHandoffDecision {
  const normalizedRequest: SwarmHandoffRequest = {
    ...request,
    userId: normalizeUserId(request.userId),
  };
  const candidates = getProfilesForUser(normalizedRequest.userId).filter(
    (profile) => profile.sessionId !== normalizedRequest.sourceSessionId
  );

  if (candidates.length === 0) {
    return buildFallbackDecision(normalizedRequest);
  }

  const rankedCandidates = candidates
    .map((profile) => {
      const route = chooseBackendForProfile(profile, normalizedRequest);
      return {
        profile,
        route,
      };
    })
    .sort((left, right) => right.route.score - left.route.score);

  const bestCandidate = rankedCandidates[0];
  const decision: SwarmHandoffDecision = {
    handoffId: createId('handoff'),
    createdAt: Date.now(),
    sourceSessionId: normalizedRequest.sourceSessionId,
    targetSessionId: bestCandidate.profile.sessionId,
    currentSurface: normalizedRequest.currentSurface,
    targetSurface: bestCandidate.profile.surface,
    targetBackend: bestCandidate.route.backend,
    confidence: bestCandidate.route.score,
    estimatedLatencyMs: bestCandidate.route.estimatedLatencyMs,
    reason: bestCandidate.route.reason,
    intent: normalizedRequest.intent,
  };

  recentHandoffs.unshift(decision);
  recentHandoffs.splice(MAX_RECENT_HANDOFFS);

  recordRuntimeMetric('swarm.handoff', decision.estimatedLatencyMs, {
    category: 'swarm-handoff',
    backend: decision.targetBackend,
    targetSurface: decision.targetSurface,
    sourceSurface: decision.currentSurface,
    intent: decision.intent,
    confidence: decision.confidence,
  });

  return decision;
}

function buildRecommendationReason(
  itemName: string,
  signals: string[],
  intent: SwarmIntent
) {
  if (signals.length === 0) {
    return `No strong memory cues were available, so ${itemName} stays near the base price for ${intent} mode.`;
  }

  return `${itemName} is being repriced around memory signals: ${signals.join(', ')}.`;
}

function determineSignalBoost(signals: string[], itemName: string) {
  const lowerName = itemName.toLowerCase();
  const joinedSignals = signals.join(' ').toLowerCase();

  if (
    joinedSignals.includes('tech') ||
    joinedSignals.includes('code') ||
    joinedSignals.includes('build')
  ) {
    return lowerName.includes('tech') ? 0.12 : 0.06;
  }

  if (
    joinedSignals.includes('comfort') ||
    joinedSignals.includes('calm') ||
    joinedSignals.includes('night')
  ) {
    return lowerName.includes('hoodie') ? -0.08 : -0.03;
  }

  return 0.04;
}

export async function getDynamicMerchRecommendations(params?: {
  userId?: string;
  contextMessage?: string;
  intent?: SwarmIntent;
}): Promise<MerchPricingRecommendation[]> {
  const userId = normalizeUserId(params?.userId);
  const intent = params?.intent ?? 'commerce';
  const contextMessage = params?.contextMessage || DEFAULT_COMMERCE_CONTEXT;
  const [items, persona] = await Promise.all([
    getMerchItems(),
    generateActivePersona(userId, contextMessage),
  ]);

  const memorySignals = [
    ...persona.profile.interests,
    ...persona.memoryContext.relevantTopics,
    ...persona.memoryContext.emotionalPatterns,
  ]
    .map((signal) => signal.trim().toLowerCase())
    .filter((signal) => signal.length > 0)
    .slice(0, 6);

  return items
    .map((item) => {
      const adjustment = determineSignalBoost(memorySignals, item.name);
      const adjustedPrice = Number(
        Math.max(item.price * 0.75, Math.min(item.price * 1.25, item.price * (1 + adjustment))).toFixed(2)
      );

      return {
        recommendationId: createId('merch'),
        itemId: item.id,
        itemName: item.name,
        basePrice: item.price,
        adjustedPrice,
        pricingReason: buildRecommendationReason(item.name, memorySignals, intent),
        memorySignals,
      } satisfies MerchPricingRecommendation;
    })
    .sort((left, right) => Math.abs(right.adjustedPrice - right.basePrice) - Math.abs(left.adjustedPrice - left.basePrice));
}

export function resetSwarmRuntimeStateForTests() {
  deviceProfiles.clear();
  recentHandoffs.splice(0, recentHandoffs.length);
}
