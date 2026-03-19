import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

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
  url?: string;
}

export interface GoogleAuthStatusResponse {
  authenticated?: boolean;
}

const API_BASE_URL_STORAGE_KEY = 'milla-mobile-api-base-url';

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

async function getResolvedApiBaseUrl(): Promise<string> {
  return (await getStoredApiBaseUrl()) || DEFAULT_API_BASE_URL;
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await getResolvedApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, init);
  const data = (await response.json()) as T & { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
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
  async buildAssetUrl(path: string) {
    const baseUrl = await getResolvedApiBaseUrl();
    return `${baseUrl}${path}`;
  },
  getMessages(limit = 40) {
    return readJson<ChatMessage[]>(`/api/messages?limit=${limit}`);
  },
  sendMessage(message: string) {
    return readJson<ChatResponse>('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
  },
  generateImage(prompt: string, options?: { aspectRatio?: string; model?: string }) {
    return readJson<ImageGenerationResponse>('/api/image/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
  getGoogleAuthUrl() {
    return readJson<GoogleAuthUrlResponse>('/api/auth/google/url');
  },
  getGoogleAuthStatus() {
    return readJson<GoogleAuthStatusResponse>('/api/oauth/authenticated');
  },
};
