import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface ChatMessage {
  id?: string;
  role: string;
  content: string;
}

export interface ChatResponse {
  response?: string;
  content?: string;
  error?: string;
  success?: boolean;
}

export interface ImageGenerationResponse {
  success?: boolean;
  response?: string;
  imageUrl?: string;
  error?: string;
}

export interface GoogleTask {
  id?: string;
  title?: string;
  notes?: string;
  status?: string;
  due?: string;
}

export interface GoogleTasksResponse {
  success?: boolean;
  message?: string;
  tasks?: GoogleTask[];
  error?: string;
}

export interface AddGoogleTaskResponse {
  success?: boolean;
  message?: string;
  taskId?: string;
  taskLink?: string;
  error?: string;
}

export interface GoogleAuthUrlResponse {
  success?: boolean;
  url?: string;
}

export interface GoogleAuthStatusResponse {
  authenticated?: boolean;
}

export type SwarmSurface = 'web' | 'mobile' | 'server';
export type SwarmIntent = 'chat' | 'vision' | 'voice' | 'memory' | 'commerce';
export type SwarmNetworkState = 'offline' | 'metered' | 'online' | 'unknown';
export type SwarmBackend =
  | 'webgpu-browser'
  | 'android-npu'
  | 'android-local'
  | 'ollama-local'
  | 'remote-cloud'
  | 'openai-edge-stub'
  | 'offline-fallback';

export interface DeviceCapabilityProfile {
  sessionId: string;
  userId: string;
  surface: SwarmSurface;
  platform: string;
  deviceLabel: string;
  syncedAt: number;
  network: SwarmNetworkState;
  capabilities: {
    aiCore: boolean;
    liteRt: boolean;
    localModel: boolean;
    mediaPipe: boolean;
    vision: boolean;
    voice: boolean;
    webgpu: boolean;
  };
  preferredBackends: SwarmBackend[];
  runtime: {
    activeProfile: string | null;
    activeModelSource: string | null;
    importedModelSizeMb: number | null;
    lastKnownLatencyMs: number | null;
    totalRamMb: number | null;
  };
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

export interface SwarmHandoffRequest {
  sourceSessionId: string;
  userId: string;
  intent: SwarmIntent;
  currentSurface: SwarmSurface;
  preferredTargetSurface?: SwarmSurface;
  requiresLowLatency?: boolean;
  requiresVision?: boolean;
}

const API_BASE_URL_STORAGE_KEY = 'milla-mobile-api-base-url';
const SESSION_TOKEN_STORAGE_KEY = 'milla-mobile-session-token';
const SWARM_SESSION_ID_STORAGE_KEY = 'milla-mobile-swarm-session-id';

function resolveDefaultApiBaseUrl(): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_MILLA_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const linkingUri = Constants.linkingUri;
  if (typeof linkingUri === 'string' && linkingUri.length > 0) {
    try {
      const normalizedUri = linkingUri.replace(/^exp/, 'http');
      const { hostname } = new URL(normalizedUri);
      if (hostname) {
        return `http://${hostname}:5000`;
      }
    } catch {
      // Fall back to local simulator defaults below.
    }
  }

  return 'http://127.0.0.1:5000';
}

function normalizeApiBaseUrl(rawValue: string): string {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : trimmedValue === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(trimmedValue)
      ? `http://${trimmedValue}`
      : `https://${trimmedValue}`;

  const normalizedUrl = new URL(withProtocol);
  return normalizedUrl.toString().replace(/\/$/, '');
}

const DEFAULT_API_BASE_URL = resolveDefaultApiBaseUrl();

async function getStoredApiBaseUrl(): Promise<string | null> {
  const storedValue = await AsyncStorage.getItem(API_BASE_URL_STORAGE_KEY);
  return storedValue && storedValue.trim() ? storedValue : null;
}

async function getStoredSessionToken(): Promise<string | null> {
  const storedValue = await AsyncStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  return storedValue && storedValue.trim() ? storedValue : null;
}

export async function getDeviceSessionId(): Promise<string> {
  const storedValue = await AsyncStorage.getItem(SWARM_SESSION_ID_STORAGE_KEY);
  if (storedValue && storedValue.trim()) {
    return storedValue;
  }

  const sessionId = `mobile_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(SWARM_SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
}

async function getResolvedApiBaseUrl(): Promise<string> {
  return (await getStoredApiBaseUrl()) || DEFAULT_API_BASE_URL;
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const [baseUrl, sessionToken] = await Promise.all([
    getResolvedApiBaseUrl(),
    getStoredSessionToken(),
  ]);
  const headers = new Headers(init?.headers ?? {});

  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const data = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed');
  }

  return data;
}

export const millaApi = {
  defaultBaseUrl: DEFAULT_API_BASE_URL,
  async getApiBaseUrl() {
    return getResolvedApiBaseUrl();
  },
  async setApiBaseUrl(nextBaseUrl: string) {
    const normalizedBaseUrl = normalizeApiBaseUrl(nextBaseUrl);
    if (!normalizedBaseUrl) {
      throw new Error('Enter a valid server URL.');
    }

    await AsyncStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizedBaseUrl);
    return normalizedBaseUrl;
  },
  async resetApiBaseUrl() {
    await AsyncStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    return DEFAULT_API_BASE_URL;
  },
  async getSessionToken() {
    return getStoredSessionToken();
  },
  async setSessionToken(sessionToken: string) {
    const normalizedToken = sessionToken.trim();
    if (!normalizedToken) {
      throw new Error('Session token is required.');
    }

    await AsyncStorage.setItem(SESSION_TOKEN_STORAGE_KEY, normalizedToken);
    return normalizedToken;
  },
  async clearSessionToken() {
    await AsyncStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  },
  async buildAssetUrl(path: string) {
    const baseUrl = await getResolvedApiBaseUrl();
    return `${baseUrl}${path}`;
  },
  getMessages(limit = 40) {
    return readJson<ChatMessage[]>(`/api/messages?limit=${limit}`);
  },
  sendMessage(
    message: string,
    options?: {
      imageData?: string;
      handoffDecision?: SwarmHandoffDecision | null;
    }
  ) {
    return readJson<ChatResponse>('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.handoffDecision
          ? {
              'X-Milla-Handoff-Backend': options.handoffDecision.targetBackend,
              'X-Milla-Handoff-Target-Surface':
                options.handoffDecision.targetSurface,
              'X-Milla-Handoff-Id': options.handoffDecision.handoffId,
            }
          : {}),
      },
      body: JSON.stringify({ message, imageData: options?.imageData }),
    });
  },
  generateImage(prompt: string, options?: { aspectRatio?: string; model?: string }) {
    return readJson<ImageGenerationResponse>('/api/image/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Milla-Platform': Platform.OS,
      },
      body: JSON.stringify({
        prompt,
        aspectRatio: options?.aspectRatio,
        model: options?.model,
      }),
    });
  },
  getTasks(maxResults = 10) {
    return readJson<GoogleTasksResponse>(`/api/tasks/list?maxResults=${maxResults}`);
  },
  addTask(title: string, notes?: string) {
    return readJson<AddGoogleTaskResponse>('/api/tasks/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, notes }),
    });
  },
  getGoogleAuthUrl(options?: { mobileRedirectUri?: string }) {
    const searchParams = new URLSearchParams();
    if (options?.mobileRedirectUri) {
      searchParams.set('mobileRedirectUri', options.mobileRedirectUri);
    }
    searchParams.set('nonce', String(Date.now()));

    const suffix = searchParams.size ? `?${searchParams.toString()}` : '';
    return readJson<GoogleAuthUrlResponse>(`/api/auth/google/url${suffix}`);
  },
  getGoogleAuthStatus() {
    return readJson<GoogleAuthStatusResponse>(
      `/api/oauth/authenticated?nonce=${Date.now()}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }
    );
  },
  registerDeviceProfile(profile: DeviceCapabilityProfile) {
    return readJson<{ success: boolean; profile: DeviceCapabilityProfile }>(
      '/api/swarm/devices/register',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Milla-Platform': Platform.OS,
        },
        body: JSON.stringify(profile),
      }
    );
  },
  requestHandoffDecision(request: SwarmHandoffRequest) {
    return readJson<{ success: boolean; decision: SwarmHandoffDecision }>(
      '/api/swarm/handoff',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Milla-Platform': Platform.OS,
        },
        body: JSON.stringify(request),
      }
    );
  },
};
