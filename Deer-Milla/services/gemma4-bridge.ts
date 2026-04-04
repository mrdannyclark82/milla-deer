/**
 * Gemma 4 E2B/E4B multimodal dispatch bridge for Deer-Milla.
 *
 * Routes inference to the right Gemma 4 variant based on device capability:
 *   - Android NPU (NNAPI / AI Core) → Gemma 4 E2B (fastest, ~40ms)
 *   - Android CPU (MediaPipe)       → Gemma 4 E4B (balanced, ~80ms)
 *   - No on-device runtime          → cloud fallback via Milla-Rayne API
 *
 * Models (quantized, ExecuTorch .pte or MediaPipe .task):
 *   gemma4-e2b-npu.pte   — 2B, INT4, NPU-optimised
 *   gemma4-e4b-cpu.task  — 4B, INT8, MediaPipe CPU
 *
 * Place model assets in android/app/src/main/assets/models/
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────

export type Gemma4Variant = 'e2b-npu' | 'e4b-cpu' | 'cloud';

export interface Gemma4InferenceResult {
  text: string;
  variant: Gemma4Variant;
  latencyMs: number;
  hasVision: boolean;
}

export interface Gemma4DispatchStatus {
  preferredVariant: Gemma4Variant;
  hasNpu: boolean;
  hasCpuRuntime: boolean;
  e2bModelPresent: boolean;
  e4bModelPresent: boolean;
  summary: string;
}

// ── Native bridge ─────────────────────────────────────────────────────────

interface NativeGemma4Module {
  getDeviceCapabilities(): Promise<{
    hasNnapi: boolean;
    hasAiCore: boolean;
    hasMediaPipe: boolean;
    sdkInt: number;
  }>;
  loadModel(modelAssetPath: string, useNpu: boolean): Promise<{ ok: boolean; variant: string; error?: string }>;
  generate(prompt: string, imageBase64?: string): Promise<{ text: string; latencyMs: number; variant: string }>;
  unload(): Promise<void>;
}

// Gemma4Module is a new native module that must be added alongside LocalModelModule.
// Falls back gracefully to LocalModelModule if not yet built.
const nativeGemma4 =
  Platform.OS === 'android'
    ? (NativeModules.Gemma4Module as NativeGemma4Module | undefined)
    : undefined;

// Cloud fallback hits Milla-Rayne server
const CLOUD_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';
const STORAGE_KEY = 'milla-gemma4-variant';
const E2B_ASSET = 'models/gemma4-e2b-npu.pte';
const E4B_ASSET = 'models/gemma4-e4b-cpu.task';

// ── Service ───────────────────────────────────────────────────────────────

class Gemma4BridgeService {
  private loadedVariant: Gemma4Variant | null = null;
  private loadPromise: Promise<void> | null = null;

  async getDispatchStatus(): Promise<Gemma4DispatchStatus> {
    if (!nativeGemma4 || Platform.OS !== 'android') {
      return {
        preferredVariant: 'cloud',
        hasNpu: false,
        hasCpuRuntime: false,
        e2bModelPresent: false,
        e4bModelPresent: false,
        summary: 'Gemma4Module not present — cloud dispatch active.',
      };
    }

    const caps = await nativeGemma4.getDeviceCapabilities();
    const hasNpu = caps.hasNnapi || caps.hasAiCore;
    const hasCpuRuntime = caps.hasMediaPipe;
    const preferredVariant: Gemma4Variant =
      hasNpu ? 'e2b-npu' : hasCpuRuntime ? 'e4b-cpu' : 'cloud';

    return {
      preferredVariant,
      hasNpu,
      hasCpuRuntime,
      e2bModelPresent: false, // would query assets in full implementation
      e4bModelPresent: false,
      summary: `Preferred: ${preferredVariant}. NPU: ${hasNpu}, CPU runtime: ${hasCpuRuntime}.`,
    };
  }

  async ensureLoaded(): Promise<Gemma4Variant> {
    if (this.loadedVariant) return this.loadedVariant;
    if (this.loadPromise) {
      await this.loadPromise;
      return this.loadedVariant!;
    }

    if (!nativeGemma4) return 'cloud';

    this.loadPromise = (async () => {
      const caps = await nativeGemma4.getDeviceCapabilities();
      const useNpu = caps.hasNnapi || caps.hasAiCore;
      const asset = useNpu ? E2B_ASSET : E4B_ASSET;
      const result = await nativeGemma4.loadModel(asset, useNpu);
      if (!result.ok) throw new Error(result.error ?? 'Gemma4 load failed.');
      this.loadedVariant = result.variant as Gemma4Variant;
    })().finally(() => { this.loadPromise = null; });

    await this.loadPromise;
    return this.loadedVariant ?? 'cloud';
  }

  /**
   * Run multimodal inference: text prompt + optional image (base64).
   * Automatically selects the best variant; falls back to cloud if on-device fails.
   */
  async generate(
    prompt: string,
    imageBase64?: string
  ): Promise<Gemma4InferenceResult> {
    // Try on-device first
    if (nativeGemma4) {
      try {
        await this.ensureLoaded();
        if (this.loadedVariant && this.loadedVariant !== 'cloud') {
          const result = await nativeGemma4.generate(prompt, imageBase64);
          return {
            text: result.text,
            variant: result.variant as Gemma4Variant,
            latencyMs: result.latencyMs,
            hasVision: !!imageBase64,
          };
        }
      } catch {
        this.loadedVariant = null; // reset so cloud is used
      }
    }

    // Cloud fallback
    return this.generateCloud(prompt, imageBase64);
  }

  private async generateCloud(
    prompt: string,
    imageBase64?: string
  ): Promise<Gemma4InferenceResult> {
    const start = Date.now();
    const body: Record<string, unknown> = { message: prompt, model: 'gemma4' };
    if (imageBase64) body.imageBase64 = imageBase64;

    const response = await fetch(`${CLOUD_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Cloud fallback failed: ${response.status}`);
    }

    const data = await response.json() as { text?: string; message?: string };
    return {
      text: data.text ?? data.message ?? '',
      variant: 'cloud',
      latencyMs: Date.now() - start,
      hasVision: !!imageBase64,
    };
  }

  async unload(): Promise<void> {
    if (nativeGemma4 && this.loadedVariant && this.loadedVariant !== 'cloud') {
      await nativeGemma4.unload();
    }
    this.loadedVariant = null;
  }
}

export const gemma4Bridge = new Gemma4BridgeService();

// ── Preference helpers ────────────────────────────────────────────────────

export async function getPreferredGemma4Variant(): Promise<Gemma4Variant | null> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return (v as Gemma4Variant | null);
}

export async function setPreferredGemma4Variant(variant: Gemma4Variant): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, variant);
}
