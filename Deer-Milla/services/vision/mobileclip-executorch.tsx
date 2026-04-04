/**
 * MobileCLIP + ExecuTorch zero-shot vision classifier for Deer-Milla.
 *
 * Uses react-native-executorch to run MobileCLIP on the Android NPU/NNAPI
 * for sub-80ms zero-shot image classification — no cloud required.
 *
 * Install: pnpm add react-native-executorch
 * Model:   MobileCLIP-S2 from apple/ml-mobileclip (XNNPACK-optimised .pte)
 *          Place at android/app/src/main/assets/models/mobileclip_s2.pte
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ClipClassifyResult {
  label: string;
  score: number;
  latencyMs: number;
  backend: 'executorch-npu' | 'executorch-cpu' | 'unavailable';
}

export interface ClipZeroShotResult {
  success: boolean;
  topLabel?: string;
  topScore?: number;
  allLabels?: ClipClassifyResult[];
  latencyMs?: number;
  error?: string;
}

export interface MobileClipStatus {
  available: boolean;
  modelLoaded: boolean;
  backend: 'executorch-npu' | 'executorch-cpu' | 'unavailable';
  modelPath: string | null;
  summary: string;
}

// ── Default label sets for zero-shot scene understanding ─────────────────

export const MILLA_SCENE_LABELS = [
  'code editor', 'terminal', 'browser', 'error message', 'dashboard',
  'chat interface', 'settings panel', 'file explorer', 'video player',
  'document', 'form', 'login screen', 'map', 'blank screen',
] as const;

export const MILLA_CONTENT_LABELS = [
  'text content', 'image content', 'graph or chart', 'code snippet',
  'list or table', 'button or control', 'loading indicator', 'notification',
  'modal dialog', 'navigation menu',
] as const;

// ── Native bridge interface ───────────────────────────────────────────────

interface NativeMobileClipModule {
  loadModel(modelAssetPath: string): Promise<{ ok: boolean; backend: string; error?: string }>;
  classifyImage(imageBase64: string, labels: string[]): Promise<{
    scores: number[];
    latencyMs: number;
    backend: string;
  }>;
  getStatus(): Promise<{ modelLoaded: boolean; backend: string; modelPath: string | null }>;
  unloadModel(): Promise<void>;
}

const nativeClip =
  Platform.OS === 'android'
    ? (NativeModules.MobileClipModule as NativeMobileClipModule | undefined)
    : undefined;

const STORAGE_KEY_ENABLED = 'milla-mobileclip-enabled';
const DEFAULT_MODEL_ASSET = 'models/mobileclip_s2.pte';

// ── Service ──────────────────────────────────────────────────────────────

class MobileClipService {
  private modelLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private backend: 'executorch-npu' | 'executorch-cpu' | 'unavailable' = 'unavailable';

  isAvailable(): boolean {
    return !!nativeClip;
  }

  async getStatus(): Promise<MobileClipStatus> {
    if (!nativeClip) {
      return {
        available: false,
        modelLoaded: false,
        backend: 'unavailable',
        modelPath: null,
        summary: 'ExecuTorch native module not present in this build. Run: pnpm add react-native-executorch and rebuild.',
      };
    }
    try {
      const status = await nativeClip.getStatus();
      this.modelLoaded = status.modelLoaded;
      this.backend = status.backend as 'executorch-npu' | 'executorch-cpu';
      return {
        available: true,
        modelLoaded: status.modelLoaded,
        backend: this.backend,
        modelPath: status.modelPath,
        summary: status.modelLoaded
          ? `MobileCLIP ready on ${this.backend} (${status.modelPath?.split('/').pop()})`
          : 'MobileCLIP module present but model not yet loaded.',
      };
    } catch (e) {
      return {
        available: true,
        modelLoaded: false,
        backend: 'unavailable',
        modelPath: null,
        summary: `MobileCLIP status error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async ensureLoaded(modelAssetPath = DEFAULT_MODEL_ASSET): Promise<void> {
    if (this.modelLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    if (!nativeClip) {
      throw new Error('MobileClip ExecuTorch module not available in this build.');
    }

    this.loadPromise = (async () => {
      const result = await nativeClip.loadModel(modelAssetPath);
      if (!result.ok) {
        throw new Error(result.error ?? 'MobileCLIP model failed to load.');
      }
      this.modelLoaded = true;
      this.backend = result.backend as 'executorch-npu' | 'executorch-cpu';
    })().finally(() => {
      this.loadPromise = null;
    });

    return this.loadPromise;
  }

  /**
   * Zero-shot classify an image (base64 PNG/JPEG) against a list of text labels.
   * Returns labels sorted by score descending.
   */
  async classify(
    imageBase64: string,
    labels: readonly string[] = MILLA_SCENE_LABELS,
    modelAssetPath = DEFAULT_MODEL_ASSET
  ): Promise<ClipZeroShotResult> {
    if (!nativeClip) {
      return { success: false, error: 'ExecuTorch not available in this build.' };
    }

    try {
      await this.ensureLoaded(modelAssetPath);

      const { scores, latencyMs, backend } = await nativeClip.classifyImage(
        imageBase64,
        [...labels]
      );

      const ranked: ClipClassifyResult[] = labels
        .map((label, i) => ({
          label,
          score: scores[i] ?? 0,
          latencyMs,
          backend: backend as 'executorch-npu' | 'executorch-cpu',
        }))
        .sort((a, b) => b.score - a.score);

      return {
        success: true,
        topLabel: ranked[0]?.label,
        topScore: ranked[0]?.score,
        allLabels: ranked,
        latencyMs,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'MobileCLIP classify failed.',
      };
    }
  }

  /**
   * Classify with both scene and content label sets, return merged top hits.
   * Designed for feeding Milla's screen-vision memory context.
   */
  async describeScreen(imageBase64: string): Promise<{
    scene: string | null;
    contentType: string | null;
    latencyMs: number;
    backend: string;
  }> {
    const [sceneResult, contentResult] = await Promise.all([
      this.classify(imageBase64, MILLA_SCENE_LABELS),
      this.classify(imageBase64, MILLA_CONTENT_LABELS),
    ]);

    return {
      scene: sceneResult.topLabel ?? null,
      contentType: contentResult.topLabel ?? null,
      latencyMs: (sceneResult.latencyMs ?? 0) + (contentResult.latencyMs ?? 0),
      backend: this.backend,
    };
  }

  async unload(): Promise<void> {
    if (!nativeClip || !this.modelLoaded) return;
    await nativeClip.unloadModel();
    this.modelLoaded = false;
  }
}

export const mobileClipService = new MobileClipService();

// ── Preference helpers ────────────────────────────────────────────────────

export async function getMobileClipEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY_ENABLED)) === 'true';
}

export async function setMobileClipEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
}
