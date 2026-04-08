/**
 * LiteRT-LM Service — on-device inference via Google's LiteRT runtime.
 *
 * Wraps `react-native-litert-lm` (v0.3.1) with model lifecycle management,
 * automatic backend selection (NPU → GPU → CPU), and a streaming API.
 *
 * Model files use the `.litertlm` format. On first call the model is
 * downloaded from litert.dev and cached in the app's files directory.
 * Subsequent calls load from the local cache.
 *
 * Supported models (in order of preference for mobile):
 *   GEMMA_3N_E2B  — 2B params, INT4, multimodal (text + image + audio)
 *   GEMMA_3_1B    — 1B params, smallest/fastest, text-only
 *   GEMMA_3N_E4B  — 4B params, higher quality, multimodal
 *
 * Backends:
 *   'npu' — Qualcomm Hexagon / MediaTek APU (fastest, auto-fallback to GPU)
 *   'gpu' — OpenGL/Vulkan (recommended default)
 *   'cpu' — always available, slowest
 */

import {
  createLLM,
  getRecommendedBackend,
  checkBackendSupport,
  checkMultimodalSupport,
  Models,
  GEMMA_3N_E2B_IT_INT4,
  applyGemmaTemplate,
  type LiteRTLMInstance,
  type Backend,
  type GenerationStats,
} from 'react-native-litert-lm';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY_MODEL = 'milla-litert-lm-model-path';
const STORAGE_KEY_BACKEND = 'milla-litert-lm-backend';
/** Default model: Gemma 3n E2B INT4 (~650 MB, multimodal, best for mobile). */
const DEFAULT_MODEL_URL = GEMMA_3N_E2B_IT_INT4;
const DEFAULT_MODEL_FILE = 'gemma-3n-e2b-int4.litertlm';

const SYSTEM_PROMPT = `You are Milla-Rayne, a warm and intelligent companion. 
You run entirely on-device with no internet connection.
Keep replies concise, clear, and helpful.`;

// ── Types ─────────────────────────────────────────────────────────────────

export type LiteRTStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface LiteRTInferenceResult {
  text: string;
  backend: Backend;
  stats: GenerationStats | null;
  modelId: string;
}

export interface LiteRTDownloadProgress {
  progress: number; // 0.0 – 1.0
  modelFile: string;
}

// ── Service ───────────────────────────────────────────────────────────────

class LiteRTLMService {
  private instance: LiteRTLMInstance | null = null;
  private status: LiteRTStatus = 'idle';
  private activeBackend: Backend = 'gpu';
  private activeModelPath: string | null = null;
  private loadPromise: Promise<void> | null = null;
  private onDownloadProgress: ((p: LiteRTDownloadProgress) => void) | null = null;

  /** Subscribe to model download progress updates. */
  setDownloadProgressListener(
    listener: ((p: LiteRTDownloadProgress) => void) | null
  ): void {
    this.onDownloadProgress = listener;
  }

  getStatus(): LiteRTStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status === 'ready' && this.instance?.isReady() === true;
  }

  getActiveBackend(): Backend {
    return this.activeBackend;
  }

  getActiveModelPath(): string | null {
    return this.activeModelPath;
  }

  /**
   * Ensure the model is loaded. Downloads if not cached. Returns immediately
   * if already loaded. Deduplicates concurrent calls.
   */
  async ensureLoaded(modelUrl = DEFAULT_MODEL_URL, modelFile = DEFAULT_MODEL_FILE): Promise<void> {
    if (this.isReady()) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._load(modelUrl, modelFile).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async _load(modelUrl: string, modelFile: string): Promise<void> {
    const llm = createLLM();
    this.instance = llm;

    // Pick the best backend, warn if NPU has issues
    const recommended = getRecommendedBackend();
    const npuWarning = checkBackendSupport('npu');
    this.activeBackend = npuWarning ? recommended : 'npu';

    // Resolve model path: check AsyncStorage cache first
    let modelPath = await AsyncStorage.getItem(STORAGE_KEY_MODEL);

    if (!modelPath) {
      // Download model
      this.status = 'downloading';
      modelPath = await llm.downloadModel(modelUrl, modelFile, (progress) => {
        this.onDownloadProgress?.({ progress, modelFile });
      });
      await AsyncStorage.setItem(STORAGE_KEY_MODEL, modelPath);
    }

    this.status = 'loading';
    await llm.loadModel(modelPath, {
      backend: this.activeBackend,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 512,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
    });

    this.status = 'ready';
    this.activeModelPath = modelPath;
    await AsyncStorage.setItem(STORAGE_KEY_BACKEND, this.activeBackend);
  }

  /**
   * Generate a response. Loads model on first call.
   * Optionally accepts an image path for multimodal inference.
   */
  async generate(
    prompt: string,
    imagePath?: string
  ): Promise<LiteRTInferenceResult> {
    await this.ensureLoaded();

    const llm = this.instance;
    if (!llm || !llm.isReady()) {
      throw new Error('LiteRT-LM model is not ready.');
    }

    const formatted = applyGemmaTemplate([{ role: 'user', content: prompt }]);

    let text: string;
    if (imagePath) {
      const multimodalError = checkMultimodalSupport();
      if (multimodalError) {
        // Fall back to text-only on devices without multimodal support
        text = await llm.sendMessage(formatted);
      } else {
        text = await llm.sendMessageWithImage(formatted, imagePath);
      }
    } else {
      text = await llm.sendMessage(formatted);
    }

    return {
      text,
      backend: this.activeBackend,
      stats: llm.getStats(),
      modelId: Models.GEMMA_3N_E2B,
    };
  }

  /**
   * Stream tokens to a callback. Loads model on first call.
   */
  async generateStreaming(
    prompt: string,
    onToken: (token: string, done: boolean) => void
  ): Promise<void> {
    await this.ensureLoaded();

    const llm = this.instance;
    if (!llm || !llm.isReady()) {
      throw new Error('LiteRT-LM model is not ready.');
    }

    const formatted = applyGemmaTemplate([{ role: 'user', content: prompt }]);
    llm.sendMessageAsync(formatted, onToken);
  }

  /** Clear conversation context without unloading the model. */
  resetConversation(): void {
    this.instance?.resetConversation();
  }

  /** Unload the model and free native memory. */
  async unload(): Promise<void> {
    this.instance?.close();
    this.instance = null;
    this.status = 'idle';
    this.activeModelPath = null;
  }

  /** Delete cached model file and reset stored path. */
  async deleteModel(modelFile = DEFAULT_MODEL_FILE): Promise<void> {
    await this.instance?.deleteModel(modelFile);
    await AsyncStorage.removeItem(STORAGE_KEY_MODEL);
    this.activeModelPath = null;
  }
}

export const liteRTLMService = new LiteRTLMService();
