import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  DeviceCapabilityProfile,
  SwarmHandoffDecision,
  SwarmIntent,
} from '@/services/milla-api';
import { getDeviceSessionId } from '@/services/milla-api';
import type {
  LocalModelProfile,
  LocalModelRuntimeDetails,
} from '@/services/local-model-service';

export async function buildMobileCapabilityProfile(input: {
  localModelEnabled: boolean;
  localModelProfile: LocalModelProfile;
  localModelRuntimeDetails: LocalModelRuntimeDetails | null;
}): Promise<DeviceCapabilityProfile> {
  const runtimeDetails = input.localModelRuntimeDetails;
  const appOwnership =
    Constants.executionEnvironment || Constants.appOwnership || 'standalone';

  return {
    sessionId: await getDeviceSessionId(),
    userId: 'default-user',
    surface: 'mobile',
    platform: `${Platform.OS}-${Platform.Version}`,
    deviceLabel: runtimeDetails
      ? `${runtimeDetails.manufacturer} ${runtimeDetails.deviceModel}`.trim()
      : `mobile-${appOwnership}`,
    syncedAt: Date.now(),
    network: 'unknown',
    capabilities: {
      aiCore: Boolean(runtimeDetails?.hasAiCore),
      liteRt: Boolean(runtimeDetails?.hasLiteRtRuntime),
      localModel: input.localModelEnabled && Boolean(runtimeDetails?.isConfigured),
      mediaPipe: Boolean(runtimeDetails?.hasMediaPipeRuntime),
      vision: true,
      voice: true,
      webgpu: false,
    },
    preferredBackends:
      input.localModelEnabled && runtimeDetails?.hasAiCore
        ? ['android-npu', 'android-local', 'remote-cloud', 'openai-edge-stub']
        : input.localModelEnabled
          ? ['android-local', 'remote-cloud', 'openai-edge-stub']
          : ['remote-cloud', 'openai-edge-stub', 'offline-fallback'],
    runtime: {
      activeProfile: input.localModelEnabled ? input.localModelProfile : null,
      activeModelSource: runtimeDetails?.activeModelSource || null,
      importedModelSizeMb: runtimeDetails?.importedModelSizeMb || null,
      lastKnownLatencyMs: input.localModelProfile === 'fast' ? 80 : 140,
      totalRamMb: runtimeDetails?.totalRamMb || null,
    },
  };
}

export function buildMobileHandoffRequest(input: {
  sessionId: string;
  intent: SwarmIntent;
  localModelEnabled: boolean;
  requiresVision?: boolean;
}) {
  return {
    sourceSessionId: input.sessionId,
    userId: 'default-user',
    intent: input.intent,
    currentSurface: 'mobile' as const,
    preferredTargetSurface:
      input.intent === 'vision' ? ('web' as const) : input.localModelEnabled ? ('mobile' as const) : ('web' as const),
    requiresLowLatency: input.localModelEnabled,
    requiresVision: Boolean(input.requiresVision),
  };
}

export function shouldUseLocalRoute(
  decision: SwarmHandoffDecision | null,
  localModelEnabled: boolean
) {
  return (
    localModelEnabled &&
    (decision?.targetBackend === 'android-npu' ||
      decision?.targetBackend === 'android-local')
  );
}

export function describeSwarmDecision(decision: SwarmHandoffDecision | null) {
  if (!decision) {
    return null;
  }

  return `${decision.currentSurface} -> ${decision.targetSurface} via ${decision.targetBackend} (${decision.estimatedLatencyMs}ms)`;
}
