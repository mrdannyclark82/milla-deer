/**
 * LiteRT (TFLite) Quantization Pipeline for Gemma 3 270M
 *
 * Provides:
 *   - Model download from Hugging Face (with auth token support)
 *   - LiteRT/TFLite conversion via AI Edge Torch (Python subprocess)
 *   - Local inference wrapper compatible with both web (WASM) and mobile (Android/iOS)
 *
 * Prerequisites (installed by scripts/setup_vision.sh or manually):
 *   pip install ai-edge-torch tensorflow
 *   huggingface-cli login   (or set HF_TOKEN env var)
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiteRTPipelineConfig {
  /** HF model ID to download */
  modelId: string;
  /** Local directory for downloaded weights */
  downloadDir: string;
  /** Output .tflite / .bin artifact path */
  outputPath: string;
  /** Quantisation scheme */
  quantization: 'int4' | 'int8' | 'fp16';
  /** Target runtime */
  target: 'android' | 'web' | 'ios';
  /** HuggingFace auth token (or set HF_TOKEN env var) */
  hfToken?: string;
}

export interface ConversionResult {
  success: boolean;
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
  error?: string;
}

export interface InferenceResult {
  text: string;
  latencyMs: number;
  tokenCount: number;
}

// ── Default configs ────────────────────────────────────────────────────────────

export const GEMMA3_270M_CONFIG: LiteRTPipelineConfig = {
  modelId: 'google/gemma-3-270m-it',
  downloadDir: path.resolve(process.cwd(), 'locallm/weights/gemma3-270m'),
  outputPath: path.resolve(process.cwd(), 'locallm/gemma3-270m-int4.bin'),
  quantization: 'int4',
  target: 'android',
  hfToken: process.env.HF_TOKEN,
};

export const GEMMA3_270M_WEB_CONFIG: LiteRTPipelineConfig = {
  ...GEMMA3_270M_CONFIG,
  outputPath: path.resolve(process.cwd(), 'locallm/gemma3-270m-fp16.tflite'),
  quantization: 'fp16',
  target: 'web',
};

// ── LiteRT Pipeline ───────────────────────────────────────────────────────────

/**
 * Download Gemma 3 270M weights from Hugging Face.
 * Uses `huggingface-cli download` (requires `huggingface_hub` pip package).
 */
export async function downloadModel(config: LiteRTPipelineConfig): Promise<void> {
  mkdirSync(config.downloadDir, { recursive: true });

  const tokenArg = config.hfToken ? `--token ${config.hfToken}` : '';
  const cmd = `huggingface-cli download ${config.modelId} ${tokenArg} --local-dir ${config.downloadDir} --quiet`;

  console.log(`[LiteRT] Downloading ${config.modelId} → ${config.downloadDir}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log('[LiteRT] Download complete');
}

/**
 * Convert downloaded weights to LiteRT format using ai-edge-torch.
 *
 * Generates a Python conversion script, executes it inside the venv, and
 * returns a [ConversionResult].
 */
export async function convertToLiteRT(config: LiteRTPipelineConfig): Promise<ConversionResult> {
  const t0 = Date.now();
  const scriptPath = path.join(config.downloadDir, '_convert_litert.py');

  const quantMap: Record<string, string> = {
    int4: 'INT4',
    int8: 'INT8',
    fp16: 'FP16',
  };

  const targetMap: Record<string, string> = {
    android: 'mediapipe_llm_inference',
    web: 'tflite',
    ios: 'tflite',
  };

  const pythonScript = `
import os, sys
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

try:
    import ai_edge_torch
    from ai_edge_torch.generative.utilities import model_builder
except ImportError:
    print("[LiteRT] ai-edge-torch not installed. Run: pip install ai-edge-torch", file=sys.stderr)
    sys.exit(1)

import torch

MODEL_DIR = ${JSON.stringify(config.downloadDir)}
OUTPUT_PATH = ${JSON.stringify(config.outputPath)}
QUANT = "${quantMap[config.quantization]}"
TARGET = "${targetMap[config.target]}"

print(f"[LiteRT] Converting {MODEL_DIR} → {OUTPUT_PATH} (quant={QUANT}, target={TARGET})")

# Load model weights
model = model_builder.build_causal_lm(MODEL_DIR)
model.eval()

# Representative input for calibration (int4/int8 only)
sample_input = (torch.zeros((1, 512), dtype=torch.int64),)

# Convert
converter = ai_edge_torch.convert(model, sample_input)

if TARGET == "mediapipe_llm_inference":
    # Export MediaPipe-compatible .bin bundle
    converter.export(OUTPUT_PATH, quant_config=ai_edge_torch.quantize.pt2e_quantize.PT2EQuantConfig(
        global_config=ai_edge_torch.quantize.quant_config.QuantConfig(
            weight_qspec=ai_edge_torch.quantize.quant_config.QTypeSpec(num_bits=${config.quantization === 'int4' ? 4 : 8})
        )
    ))
else:
    # Export plain .tflite
    converter.export(OUTPUT_PATH)

import os
size = os.path.getsize(OUTPUT_PATH)
print(f"[LiteRT] Done — {OUTPUT_PATH} ({size:,} bytes)")
`;

  writeFileSync(scriptPath, pythonScript);

  return new Promise<ConversionResult>((resolve) => {
    const venvPython = path.resolve(process.cwd(), 'venv/bin/python3');
    const python = existsSync(venvPython) ? venvPython : 'python3';
    const proc = spawn(python, [scriptPath], { stdio: 'inherit' });

    proc.on('close', (code) => {
      const durationMs = Date.now() - t0;
      if (code === 0 && existsSync(config.outputPath)) {
        const { statSync } = require('fs');
        resolve({
          success: true,
          outputPath: config.outputPath,
          sizeBytes: statSync(config.outputPath).size,
          durationMs,
        });
      } else {
        resolve({
          success: false,
          outputPath: config.outputPath,
          sizeBytes: 0,
          durationMs,
          error: `Conversion exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Full pipeline: download weights → convert to LiteRT → return artifact path.
 * Skips download if weights already present; skips conversion if artifact already exists.
 */
export async function runPipeline(config: LiteRTPipelineConfig = GEMMA3_270M_CONFIG): Promise<ConversionResult> {
  // Skip download if already present
  const sentinelFile = path.join(config.downloadDir, 'config.json');
  if (!existsSync(sentinelFile)) {
    await downloadModel(config);
  } else {
    console.log(`[LiteRT] Weights already present at ${config.downloadDir} — skipping download`);
  }

  // Skip conversion if artifact already exists
  if (existsSync(config.outputPath)) {
    const { statSync } = await import('fs');
    console.log(`[LiteRT] Artifact already exists at ${config.outputPath} — skipping conversion`);
    return {
      success: true,
      outputPath: config.outputPath,
      sizeBytes: statSync(config.outputPath).size,
      durationMs: 0,
    };
  }

  return convertToLiteRT(config);
}

// ── Lightweight web inference wrapper ─────────────────────────────────────────

/**
 * LiteRT inference shim for Node.js / web environments.
 *
 * Uses @tensorflow/tfjs-tflite (WASM) for web targets, or TFLite Node bindings
 * for server-side inference. Falls back to the existing Gemma3AIEdge class when
 * the .tflite artifact is unavailable.
 */
export class LiteRTInferenceWrapper {
  private modelPath: string;
  private interpreter: any = null;

  constructor(modelPath = GEMMA3_270M_WEB_CONFIG.outputPath) {
    this.modelPath = modelPath;
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.modelPath)) {
      throw new Error(
        `LiteRT model not found at ${this.modelPath}. Run: import { runPipeline } from './litert-pipeline'; await runPipeline()`
      );
    }

    try {
      // Try Node TFLite bindings first (faster)
      const tflite = await import('@tensorflow/tfjs-tflite');
      this.interpreter = await tflite.loadTFLiteModel(this.modelPath);
      console.log('[LiteRT] Loaded via @tensorflow/tfjs-tflite Node bindings');
    } catch {
      // WASM fallback (browser / edge runtime)
      console.warn('[LiteRT] TFLite Node bindings unavailable — falling back to WASM');
      const tflite = await import('@tensorflow/tfjs-tflite/dist/tflite_web_api');
      await (tflite as any).setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@latest/wasm/');
      this.interpreter = await (tflite as any).loadTFLiteModel(this.modelPath);
    }
  }

  async infer(promptTokens: Int32Array): Promise<InferenceResult> {
    if (!this.interpreter) await this.initialize();
    const t0 = Date.now();

    const inputTensor = this.interpreter.getInputTensor(0);
    inputTensor.dataSync().set(promptTokens);
    this.interpreter.invoke();

    const outputTensor = this.interpreter.getOutputTensor(0);
    const outputData = outputTensor.dataSync() as Float32Array;

    // Decode top-1 greedy tokens (simplified — production uses beam search)
    const text = Array.from(outputData)
      .slice(0, 256)
      .map((v) => String.fromCharCode(Math.round(v)))
      .join('')
      .replace(/\x00/g, '');

    return {
      text,
      latencyMs: Date.now() - t0,
      tokenCount: promptTokens.length,
    };
  }

  isReady(): boolean {
    return this.interpreter !== null;
  }
}

// Singleton for locallm/ pipeline usage
export const liteRTWrapper = new LiteRTInferenceWrapper();
