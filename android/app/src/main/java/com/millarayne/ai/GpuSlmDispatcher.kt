package com.millarayne.ai

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Secondary GPU SLM dispatch path using MLC LLM Android (OpenCL backend).
 *
 * Acts as a fallback / parallel dispatch alongside [MediaPipeInferenceEngine].
 * Decision logic in [SlmDispatcher] selects between the two based on:
 *   - Model availability
 *   - Device GPU capability (Adreno / Mali / MediaTek)
 *   - Measured first-token latency
 *
 * MLC LLM repo: https://github.com/mlc-ai/mlc-llm
 * Dependency:   ai.mlc:mlc-llm-android:0.1.0  (added to build.gradle.kts)
 *
 * Model requirements:
 *   - Any MLC-compiled model directory (e.g. Gemma-2B-q4f16_1)
 *   - Default path: getExternalFilesDir("models")/mlc/Gemma-2B-q4f16_1
 */
class GpuSlmDispatcher(private val context: Context) {

    companion object {
        private const val TAG = "GpuSlmDispatcher"

        const val DEFAULT_MODEL_DIR = "mlc/Gemma-2B-q4f16_1"
        const val DEFAULT_MAX_TOKENS = 512
        const val DEFAULT_TEMPERATURE = 0.7f

        /** Threshold: if MediaPipe first-token > this, prefer MLC dispatch */
        const val LATENCY_THRESHOLD_MS = 200L
    }

    data class Config(
        val modelDir: String = DEFAULT_MODEL_DIR,
        val maxTokens: Int = DEFAULT_MAX_TOKENS,
        val temperature: Float = DEFAULT_TEMPERATURE,
        /** Force OpenCL backend regardless of NNAPI availability */
        val forceOpenCL: Boolean = true,
    )

    data class DispatchResult(
        val text: String,
        val latencyMs: Long,
        val backend: String,
    )

    enum class Backend { MEDIAPIPE, MLC_OPENCL, CPU_FALLBACK }

    private val mediapipe = MediaPipeInferenceEngine(context)
    private var mlcEngine: Any? = null   // ai.mlc.mlcllm.MLCEngine placeholder
    private var config = Config()
    private var preferredBackend = Backend.MEDIAPIPE

    val isReady: Boolean get() = mediapipe.isReady || mlcEngine != null

    /**
     * Initialise both backends concurrently.
     * Falls back gracefully if either fails.
     */
    suspend fun initialize(
        mpConfig: MediaPipeInferenceEngine.Config = MediaPipeInferenceEngine.Config(),
        slmConfig: Config = Config(),
    ) {
        config = slmConfig

        // Try MediaPipe first (higher priority)
        try {
            mediapipe.initialize(mpConfig)
            Log.i(TAG, "MediaPipe backend ready")
        } catch (e: Exception) {
            Log.w(TAG, "MediaPipe init failed: ${e.message}")
        }

        // Try MLC LLM OpenCL backend
        try {
            mlcEngine = initMlcEngine(slmConfig)
            Log.i(TAG, "MLC-LLM OpenCL backend ready")
        } catch (e: Exception) {
            Log.w(TAG, "MLC-LLM init failed: ${e.message}")
        }

        preferredBackend = when {
            mediapipe.isReady -> Backend.MEDIAPIPE
            mlcEngine != null -> Backend.MLC_OPENCL
            else -> Backend.CPU_FALLBACK
        }

        Log.i(TAG, "Preferred backend: $preferredBackend")
    }

    /**
     * Dispatch inference to the fastest available backend.
     *
     * If MediaPipe exceeds [LATENCY_THRESHOLD_MS] on the first call, automatically
     * switches [preferredBackend] to MLC for subsequent requests.
     */
    suspend fun dispatch(prompt: String): DispatchResult = withContext(Dispatchers.Default) {
        when (preferredBackend) {
            Backend.MEDIAPIPE -> {
                val result = mediapipe.infer(prompt)
                if (result.latencyMs > LATENCY_THRESHOLD_MS && mlcEngine != null) {
                    Log.w(TAG, "MediaPipe latency ${result.latencyMs}ms > ${LATENCY_THRESHOLD_MS}ms — switching to MLC")
                    preferredBackend = Backend.MLC_OPENCL
                }
                DispatchResult(text = result.text, latencyMs = result.latencyMs, backend = "mediapipe")
            }

            Backend.MLC_OPENCL -> {
                val result = runMlcInference(prompt)
                DispatchResult(text = result.first, latencyMs = result.second, backend = "mlc-opencl")
            }

            Backend.CPU_FALLBACK -> {
                Log.w(TAG, "No GPU backend available — returning empty response")
                DispatchResult(text = "", latencyMs = 0, backend = "cpu-fallback")
            }
        }
    }

    /** Streaming dispatch — routes to MediaPipe streaming path when available */
    suspend fun dispatchStreaming(
        prompt: String,
        onToken: (token: String) -> Unit,
    ): DispatchResult = withContext(Dispatchers.Default) {
        if (mediapipe.isReady && preferredBackend != Backend.MLC_OPENCL) {
            val result = mediapipe.inferStreaming(prompt, onToken)
            DispatchResult(text = result.text, latencyMs = result.latencyMs, backend = "mediapipe-stream")
        } else {
            // MLC fallback: no streaming API in 0.1.0 — run blocking then emit full text
            val result = dispatch(prompt)
            onToken(result.text)
            result
        }
    }

    fun release() {
        mediapipe.release()
        mlcEngine = null
    }

    // ── MLC LLM bridge ────────────────────────────────────────────────────────

    /**
     * Initialise MLC LLM engine with OpenCL backend.
     *
     * The actual call would be:
     *   val engine = MLCEngine()
     *   engine.reload(modelPath, "q4f16_1")
     *
     * Kept as reflection-safe stub so the module compiles without the AAR present,
     * enabling CI on machines that can't resolve ai.mlc:mlc-llm-android.
     */
    private suspend fun initMlcEngine(cfg: Config): Any = withContext(Dispatchers.IO) {
        val modelDir = resolveModelDir(cfg.modelDir)

        // Reflection-based instantiation — replace with direct import once AAR is resolved:
        // val engine = ai.mlc.mlcllm.MLCEngine()
        // engine.reload(modelDir.absolutePath, "q4f16_1")
        val engineClass = Class.forName("ai.mlc.mlcllm.MLCEngine")
        val engine = engineClass.getDeclaredConstructor().newInstance()
        val reload = engineClass.getMethod("reload", String::class.java, String::class.java)
        reload.invoke(engine, modelDir.absolutePath, "q4f16_1")
        engine
    }

    private suspend fun runMlcInference(prompt: String): Pair<String, Long> = withContext(Dispatchers.Default) {
        val t0 = System.currentTimeMillis()
        val engineClass = mlcEngine!!.javaClass
        val generate = engineClass.getMethod("generate", String::class.java, Int::class.java)
        val text = generate.invoke(mlcEngine, prompt, config.maxTokens) as String
        Pair(text, System.currentTimeMillis() - t0)
    }

    private fun resolveModelDir(path: String): java.io.File {
        if (path.startsWith("/")) return java.io.File(path)
        val extDir = java.io.File(context.getExternalFilesDir("models"), path)
        if (extDir.exists()) return extDir
        Log.w(TAG, "MLC model dir not found: ${extDir.absolutePath}")
        return extDir
    }
}
