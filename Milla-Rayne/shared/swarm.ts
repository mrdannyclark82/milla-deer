export type SwarmSurface = 'web' | 'mobile' | 'server';

export type SwarmIntent =
  | 'chat'
  | 'vision'
  | 'voice'
  | 'memory'
  | 'commerce';

export type SwarmNetworkState = 'offline' | 'metered' | 'online' | 'unknown';

export type SwarmBackend =
  | 'webgpu-browser'
  | 'android-npu'
  | 'android-local'
  | 'ollama-local'
  | 'remote-cloud'
  | 'openai-edge-stub'
  | 'offline-fallback';

export interface SwarmCapabilities {
  aiCore: boolean;
  liteRt: boolean;
  localModel: boolean;
  mediaPipe: boolean;
  vision: boolean;
  voice: boolean;
  webgpu: boolean;
}

export interface SwarmRuntimeSummary {
  activeProfile: string | null;
  activeModelSource: string | null;
  importedModelSizeMb: number | null;
  lastKnownLatencyMs: number | null;
  totalRamMb: number | null;
}

export interface DeviceCapabilityProfile {
  sessionId: string;
  userId: string;
  surface: SwarmSurface;
  platform: string;
  deviceLabel: string;
  syncedAt: number;
  network: SwarmNetworkState;
  capabilities: SwarmCapabilities;
  preferredBackends: SwarmBackend[];
  runtime: SwarmRuntimeSummary;
}

export interface SwarmHandoffRequest {
  sourceSessionId: string;
  userId: string;
  intent: SwarmIntent;
  currentSurface: SwarmSurface;
  preferredTargetSurface?: SwarmSurface;
  requiresLowLatency?: boolean;
  requiresVision?: boolean;
}

export interface SwarmHandoffDecision {
  handoffId: string;
  createdAt: number;
  sourceSessionId: string;
  targetSessionId: string | null;
  currentSurface: SwarmSurface;
  targetSurface: SwarmSurface;
  targetBackend: SwarmBackend;
  confidence: number;
  estimatedLatencyMs: number;
  reason: string;
  intent: SwarmIntent;
}

export interface FusionTelemetrySnapshot {
  generatedAt: number;
  activeDevices: DeviceCapabilityProfile[];
  summary: {
    averageEstimatedLatencyMs: number;
    recentHandoffCount: number;
    activeDeviceCount: number;
    surfaceBreakdown: Record<SwarmSurface, number>;
    backendBreakdown: Record<SwarmBackend, number>;
  };
  recentHandoffs: SwarmHandoffDecision[];
}

export interface MerchPricingRecommendation {
  recommendationId: string;
  itemId: string;
  itemName: string;
  basePrice: number;
  adjustedPrice: number;
  pricingReason: string;
  memorySignals: string[];
}
