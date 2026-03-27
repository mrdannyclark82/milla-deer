package com.millarayne.ai

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * MediaPipe Tasks-GenAI 0.10.32 inference engine.
 *
 * Wraps [LlmInference] + [LlmInferenceSession] for Gemma-3 1B 4-bit (INT4) quantized models.
 * Targets sub-150 ms voice response path on Snapdragon / MediaTek via GPU delegate.
 *
 * Model requirements:
 *   - Gemma-3 1B INT4 (.bin) converted via AI Edge Model Explorer or MediaPipe Benchmark tool
 *   - Default path: getExternalFilesDir("models")/gemma3-1b-it-q4.bin
 *   - Override via [Config.modelPath] at initialisation time
 */
class MediaPipeInferenceEngine(private val context: Context) {

    companion object {
        private const val TAG = "MPInferenceEngine"

        const val DEFAULT_MODEL_PATH = "gemma3-1b-it-q4.bin"
        const val DEFAULT_MAX_TOKENS = 512
        const val DEFAULT_TOP_K = 40
        const val DEFAULT_TEMPERATURE = 0.7f
        const val DEFAULT_RANDOM_SEED = 42
    }

    data class Config(
        val modelPath: String = DEFAULT_MODEL_PATH,
        val maxTokens: Int = DEFAULT_MAX_TOKENS,
        val topK: Int = DEFAULT_TOP_K,
        val temperature: Float = DEFAULT_TEMPERATURE,
        val randomSeed: Int = DEFAULT_RANDOM_SEED,
        /** Prefer GPU delegate (OpenCL/Vulkan/NNAPI) — enables sub-150 ms first-token latency */
        val preferGpu: Boolean = true,
    )

    data class InferenceResult(
        val text: String,
        val latencyMs: Long,
        val tokenCount: Int,
    )

    private var engine: LlmInference? = null
    private var config: Config = Config()

    val isReady: Boolean get() = engine != null

    /**
     * Initialise the MediaPipe LLM engine. Blocks until model is loaded.
     * Safe to call from a background coroutine; no-op if already initialised.
     */
    suspend fun initialize(cfg: Config = Config()) = withContext(Dispatchers.IO) {
        if (engine != null) {
            Log.d(TAG, "Engine already initialised — skipping")
            return@withContext
        }

        config = cfg
        val modelFile = resolveModelFile(cfg.modelPath)

        Log.i(TAG, "Loading model: ${modelFile.absolutePath} (GPU=${cfg.preferGpu})")
        val t0 = System.currentTimeMillis()

        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelFile.absolutePath)
            .setMaxTokens(cfg.maxTokens)
            .setTopK(cfg.topK)
            .setTemperature(cfg.temperature)
            .setRandomSeed(cfg.randomSeed)
            .apply {
                if (cfg.preferGpu) setAcceleratorName("gpu")
            }
            .build()

        engine = LlmInference.createFromOptions(context, options)
        Log.i(TAG, "Model loaded in ${System.currentTimeMillis() - t0} ms")
    }

    /**
     * Blocking inference — returns full generated text.
     * Use [inferStreaming] for the real-time voice path.
     */
    suspend fun infer(prompt: String): InferenceResult = withContext(Dispatchers.Default) {
        requireReady()
        val t0 = System.currentTimeMillis()

        val session: LlmInferenceSession = engine!!.createSession(
            LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(config.topK)
                .setTemperature(config.temperature)
                .build()
        )

        session.addQueryChunk(prompt)
        val text = session.generateResponse()
        session.close()

        val latency = System.currentTimeMillis() - t0
        Log.d(TAG, "Inference completed in ${latency}ms")

        InferenceResult(text = text, latencyMs = latency, tokenCount = estimateTokens(text))
    }

    /**
     * Streaming inference — emits tokens via [onToken] as they are generated.
     * First token should arrive < 150 ms on GPU path.
     */
    suspend fun inferStreaming(
        prompt: String,
        onToken: (token: String) -> Unit,
    ): InferenceResult = withContext(Dispatchers.Default) {
        requireReady()
        val t0 = System.currentTimeMillis()
        val buffer = StringBuilder()

        val session: LlmInferenceSession = engine!!.createSession(
            LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(config.topK)
                .setTemperature(config.temperature)
                .build()
        )

        session.addQueryChunk(prompt)
        session.generateResponseAsync { partial, _ ->
            if (partial != null) {
                buffer.append(partial)
                onToken(partial)
            }
        }

        session.close()
        val latency = System.currentTimeMillis() - t0
        Log.d(TAG, "Streaming inference done in ${latency}ms")

        InferenceResult(text = buffer.toString(), latencyMs = latency, tokenCount = estimateTokens(buffer.toString()))
    }

    /** Release native resources. Call from ViewModel.onCleared or onDestroy. */
    fun release() {
        engine?.close()
        engine = null
        Log.i(TAG, "Engine released")
    }

    private fun resolveModelFile(path: String): File {
        if (path.startsWith("/")) return File(path)
        val extDir = File(context.getExternalFilesDir("models"), path)
        if (extDir.exists()) return extDir
        val intDir = File(File(context.filesDir, "models"), path)
        if (intDir.exists()) return intDir
        Log.w(TAG, "Model not found at ${extDir.absolutePath} — will fail at load time if absent")
        return extDir
    }

    private fun requireReady() =
        check(engine != null) { "MediaPipeInferenceEngine not initialised — call initialize() first" }

    private fun estimateTokens(text: String): Int = (text.split(Regex("\\s+")).size * 1.3).toInt()
}
