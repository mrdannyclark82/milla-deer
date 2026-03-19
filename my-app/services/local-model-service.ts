import AsyncStorage from '@react-native-async-storage/async-storage';

import { generateOfflineCompanionResponse } from './offline-companion';

const LOCAL_MODEL_ENABLED_STORAGE_KEY = 'milla-mobile-local-model-enabled';

export type LocalModelStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface LocalModelResult {
  text: string;
  backend: 'gemma3n-preview' | 'executorch-preview';
  latencyMs: number;
  mode: 'preview';
}

interface PreviewInferenceResult {
  text: string;
  latencyMs: number;
}

class Gemma3nPreviewModel {
  private initialized = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    this.initialized = true;
  }

  async infer(prompt: string): Promise<PreviewInferenceResult> {
    await this.initialize();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt is empty.');
    }

    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 40));

    return {
      text: `Gemma3n mobile preview: ${trimmedPrompt.slice(0, 60)}`,
      latencyMs: Date.now() - startedAt,
    };
  }
}

class ExecuTorchPreviewFallback {
  private initialized = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
    this.initialized = true;
  }

  async infer(prompt: string): Promise<PreviewInferenceResult> {
    await this.initialize();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Prompt is empty.');
    }

    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 70));

    return {
      text: `ExecuTorch preview: ${trimmedPrompt.slice(0, 60)}`,
      latencyMs: Date.now() - startedAt,
    };
  }
}

function buildPreviewResponse(prompt: string, backendLabel: string, previewText: string) {
  const offlineResponse = generateOfflineCompanionResponse(prompt);

  return `${offlineResponse}\n\n[${backendLabel} active on this device while the remote link is unavailable. ${previewText}]`;
}

class MobileLocalModelService {
  private gemmaPreview = new Gemma3nPreviewModel();
  private execuTorchPreview = new ExecuTorchPreviewFallback();
  private status: LocalModelStatus = 'idle';
  private lastError: string | null = null;
  private initializingPromise: Promise<void> | null = null;

  getStatus() {
    return this.status;
  }

  getLastError() {
    return this.lastError;
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
    this.initializingPromise = this.gemmaPreview
      .initialize()
      .then(() => {
        this.status = 'ready';
      })
      .catch((error) => {
        this.status = 'error';
        this.lastError =
          error instanceof Error ? error.message : 'Unable to initialize the on-device preview.';
        throw error;
      })
      .finally(() => {
        this.initializingPromise = null;
      });

    return this.initializingPromise;
  }

  async runInference(prompt: string): Promise<LocalModelResult> {
    try {
      const primaryResult = await this.gemmaPreview.infer(prompt);
      this.status = 'ready';
      this.lastError = null;

      return {
        text: buildPreviewResponse(
          prompt,
          'Gemma 3n preview',
          primaryResult.text
        ),
        backend: 'gemma3n-preview',
        latencyMs: primaryResult.latencyMs,
        mode: 'preview',
      };
    } catch (primaryError) {
      this.lastError =
        primaryError instanceof Error
          ? primaryError.message
          : 'Gemma preview failed on this device.';

      const fallbackResult = await this.execuTorchPreview.infer(prompt);
      this.status = 'ready';

      return {
        text: buildPreviewResponse(
          prompt,
          'ExecuTorch fallback preview',
          fallbackResult.text
        ),
        backend: 'executorch-preview',
        latencyMs: fallbackResult.latencyMs,
        mode: 'preview',
      };
    }
  }
}

export async function getLocalModelEnabled() {
  return (await AsyncStorage.getItem(LOCAL_MODEL_ENABLED_STORAGE_KEY)) === 'true';
}

export async function setLocalModelEnabled(enabled: boolean) {
  await AsyncStorage.setItem(LOCAL_MODEL_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
}

export const localModelService = new MobileLocalModelService();
