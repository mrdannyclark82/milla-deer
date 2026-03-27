package com.millarayne.ai

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.withContext
import java.io.File

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
        val preferGpu: Boolean = true,
    )

    data class InferenceResult(val text: String, val latencyMs: Long, val tokenCount: Int)

    private var engine: LlmInference? = null
    private var config: Config = Config()

    val isReady: Boolean get() = engine != null

    suspend fun initialize(cfg: Config = Config()) = withContext(Dispatchers.IO) {
        if (engine != null) return@withContext
        config = cfg
        val modelFile = resolveModelFile(cfg.modelPath)
        Log.i(TAG, "Loading model: ${modelFile.absolutePath} (GPU=${cfg.preferGpu})")
        val t0 = System.currentTimeMillis()

        val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelFile.absolutePath)
            .setMaxTokens(cfg.maxTokens)
            .setMaxTopK(cfg.topK)
            .apply { if (cfg.preferGpu) setPreferredBackend(LlmInference.Backend.GPU) }
            .build()

        engine = LlmInference.createFromOptions(context, options)
        Log.i(TAG, "Model loaded in ${System.currentTimeMillis() - t0} ms")
    }

    suspend fun infer(prompt: String): InferenceResult = withContext(Dispatchers.Default) {
        val session = createSession()
        val t0 = System.currentTimeMillis()
        session.addQueryChunk(prompt)
        val text = session.generateResponse()
        session.close()
        val latency = System.currentTimeMillis() - t0
        InferenceResult(text = text, latencyMs = latency, tokenCount = estimateTokens(text))
    }

    suspend fun inferStreaming(prompt: String, onToken: (String) -> Unit): InferenceResult =
        withContext(Dispatchers.Default) {
            val session = createSession()
            val t0 = System.currentTimeMillis()
            val buffer = StringBuilder()
            session.addQueryChunk(prompt)
            session.generateResponseAsync { partial, _ ->
                if (partial != null) { buffer.append(partial); onToken(partial) }
            }.await()
            session.close()
            val latency = System.currentTimeMillis() - t0
            InferenceResult(text = buffer.toString(), latencyMs = latency, tokenCount = estimateTokens(buffer.toString()))
        }

    fun release() { engine?.close(); engine = null }

    private fun createSession(): LlmInferenceSession {
        requireReady()
        val sessionOpts = LlmInferenceSession.LlmInferenceSessionOptions.builder()
            .setTopK(config.topK)
            .setTemperature(config.temperature)
            .setRandomSeed(config.randomSeed)
            .build()
        return LlmInferenceSession.createFromOptions(engine!!, sessionOpts)
    }

    private fun resolveModelFile(path: String): File {
        if (path.startsWith("/")) return File(path)
        val extDir = File(context.getExternalFilesDir("models"), path)
        if (extDir.exists()) return extDir
        return File(File(context.filesDir, "models"), path)
    }

    private fun requireReady() = check(engine != null) { "Not initialised — call initialize() first" }
    private fun estimateTokens(text: String): Int = (text.split(Regex("\\s+")).size * 1.3).toInt()
}
