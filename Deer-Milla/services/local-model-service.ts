import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const LOCAL_MODEL_ENABLED_STORAGE_KEY = 'milla-mobile-local-model-enabled';
const LOCAL_MODEL_PROFILE_STORAGE_KEY = 'milla-mobile-local-model-profile';

export type LocalModelStatus = 'idle' | 'initializing' | 'ready' | 'error';
export type LocalModelBackend = 'android-native';
export type LocalModelMode = 'native';
export type LocalModelSource = 'bundled-asset' | 'imported-model';
export type LocalModelProfile = 'balanced' | 'fast';

export interface LocalModelRuntimeDetails {
  activeProfile: LocalModelProfile;
  activeModelSource: LocalModelSource | null;
  androidSdkInt: number;
  backend: LocalModelBackend;
  bundledModelAssetCount: number;
  deviceModel: string;
  hasAiCore: boolean;
  hasBundledModelAsset: boolean;
  hasImportedModel: boolean;
  importedModelSizeMb: number | null;
  hasLiteRtRuntime: boolean;
  hasMediaPipeRuntime: boolean;
  isConfigured: boolean;
  importedModelPath: string | null;
  manufacturer: string;
  modelAssetPath: string | null;
  preferredBalancedModelAssetPath: string | null;
  preferredFastModelAssetPath: string | null;
  summary: string;
  totalRamMb: number | null;
}

export interface LocalModelResult {
  text: string;
  backend: LocalModelBackend;
  latencyMs: number;
  mode: LocalModelMode;
  profile: LocalModelProfile;
}

interface NativeLocalModelModule {
  generateResponse(prompt: string, profile: LocalModelProfile): Promise<LocalModelResult>;
  getRuntimeStatus(): Promise<LocalModelRuntimeDetails>;
  importModelFromPicker(): Promise<LocalModelRuntimeDetails>;
  clearImportedModel(): Promise<LocalModelRuntimeDetails>;
}

const nativeLocalModelModule =
  Platform.OS === 'android'
    ? (NativeModules.LocalModelModule as NativeLocalModelModule | undefined)
    : undefined;

function getNativeLocalModelModule() {
  if (!nativeLocalModelModule) {
    throw new Error(
      'The Android on-device runtime bridge is not available in this build. Reinstall Deer-Milla after rebuilding the native app.'
    );
  }

  return nativeLocalModelModule;
}

function normalizeNativeError(error: unknown) {
  return error instanceof Error ? error.message : 'The Android on-device runtime is unavailable.';
}

class MobileLocalModelService {
  private status: LocalModelStatus = 'idle';
  private lastError: string | null = null;
  private initializingPromise: Promise<void> | null = null;
  private runtimeDetails: LocalModelRuntimeDetails | null = null;

  getStatus() {
    return this.status;
  }

  getLastError() {
    return this.lastError;
  }

  getRuntimeDetails() {
    return this.runtimeDetails;
  }

  private async refreshRuntimeStatus() {
    const module = getNativeLocalModelModule();
    const runtimeStatus = await module.getRuntimeStatus();
    this.runtimeDetails = runtimeStatus;
    return runtimeStatus;
  }

  async initialize() {
    if (this.status === 'ready') {
      return;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.status = 'initializing';
    this.lastError = null;
    this.initializingPromise = Promise.resolve()
      .then(async () => {
        if (Platform.OS !== 'android') {
          throw new Error('The on-device runtime is only available in the Android app build.');
        }

        const module = getNativeLocalModelModule();
        const runtimeStatus = await module.getRuntimeStatus();
        this.runtimeDetails = runtimeStatus;

        if (!runtimeStatus.isConfigured) {
          throw new Error(runtimeStatus.summary);
        }

        this.status = 'ready';
      })
      .catch((error) => {
        this.status = 'error';
        this.lastError = normalizeNativeError(error);
        throw error;
      })
      .finally(() => {
        this.initializingPromise = null;
      });

    return this.initializingPromise;
  }

  async runInference(prompt: string, profile: LocalModelProfile): Promise<LocalModelResult> {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt is empty.');
    }

    await this.initialize();

    const module = getNativeLocalModelModule();
    try {
      const response = await module.generateResponse(trimmedPrompt, profile);
      this.status = 'ready';
      this.lastError = null;
      return response;
    } catch (error) {
      this.status = 'error';
      this.lastError = normalizeNativeError(error);
      throw error;
    }
  }

  async importModelFromPicker() {
    if (Platform.OS !== 'android') {
      throw new Error('Model import is only available in the Android app build.');
    }

    const module = getNativeLocalModelModule();
    const runtimeStatus = await module.importModelFromPicker();
    this.runtimeDetails = runtimeStatus;
    this.status = runtimeStatus.isConfigured ? 'ready' : 'error';
    this.lastError = runtimeStatus.isConfigured ? null : runtimeStatus.summary;
    return runtimeStatus;
  }

  async clearImportedModel() {
    if (Platform.OS !== 'android') {
      throw new Error('Model management is only available in the Android app build.');
    }

    const module = getNativeLocalModelModule();
    const runtimeStatus = await module.clearImportedModel();
    this.runtimeDetails = runtimeStatus;
    this.status = runtimeStatus.isConfigured ? 'ready' : 'idle';
    this.lastError = runtimeStatus.isConfigured ? null : null;
    return runtimeStatus;
  }

  async getLatestRuntimeDetails(): Promise<LocalModelRuntimeDetails | null> {
    if (Platform.OS !== 'android') {
      this.runtimeDetails = null;
      return null;
    }

    return this.refreshRuntimeStatus();
  }
}

export async function getLocalModelEnabled() {
  return (await AsyncStorage.getItem(LOCAL_MODEL_ENABLED_STORAGE_KEY)) === 'true';
}

export async function setLocalModelEnabled(enabled: boolean) {
  await AsyncStorage.setItem(LOCAL_MODEL_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function getLocalModelProfile(): Promise<LocalModelProfile> {
  const storedValue = await AsyncStorage.getItem(LOCAL_MODEL_PROFILE_STORAGE_KEY);
  return storedValue === 'fast' ? 'fast' : 'balanced';
}

export async function setLocalModelProfile(profile: LocalModelProfile) {
  await AsyncStorage.setItem(LOCAL_MODEL_PROFILE_STORAGE_KEY, profile);
}

export const localModelService = new MobileLocalModelService();
