package com.millarayne.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.util.Log
import com.millarayne.api.MillaApiClient
import com.millarayne.api.TtsRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Plays Milla's voice using the server ElevenLabs TTS endpoint.
 * Falls back to device TextToSpeech if the server is unreachable or offline.
 */
class MillaTtsPlayer(context: Context) {

    private val appContext = context.applicationContext
    private var deviceTts: TextToSpeech? = null
    private var deviceTtsReady = false

    init {
        deviceTts = TextToSpeech(appContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                deviceTts?.language = Locale.getDefault()
                deviceTtsReady = true
            }
        }
    }

    /**
     * Speak text using ElevenLabs via the server, or fall back to device TTS.
     * @param text The text to speak
     * @param serverUrl Base URL of the Milla server (e.g. "http://192.168.1.x:5000/")
     * @param useServer Whether to attempt server TTS (false = device TTS only, used in offline mode)
     */
    suspend fun speak(text: String, serverUrl: String, useServer: Boolean = true) {
        if (text.isBlank()) return

        if (useServer) {
            val success = tryServerTts(text, serverUrl)
            if (success) return
        }

        speakWithDeviceTts(text)
    }

    private suspend fun tryServerTts(text: String, serverUrl: String): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val service = MillaApiClient.createApiService(serverUrl)
                val response = service.requestTts(TtsRequest(text = text))
                if (!response.isSuccessful) return@withContext false

                val body = response.body() ?: return@withContext false

                // Server told us to fall back to browser/device synthesis
                if (body.fallback == "browser" || body.audioUrl == null) {
                    return@withContext false
                }

                // audioUrl is relative e.g. "/audio/abc123.mp3" — prepend server base
                val normalizedBase = serverUrl.trimEnd('/')
                val fullUrl = if (body.audioUrl.startsWith("http")) {
                    body.audioUrl
                } else {
                    "$normalizedBase${body.audioUrl}"
                }

                playUrl(fullUrl)
                true
            } catch (e: Exception) {
                Log.d("MillaTtsPlayer", "Server TTS unavailable: ${e.message}")
                false
            }
        }

    private suspend fun playUrl(url: String) = withContext(Dispatchers.IO) {
        try {
            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .build()
                )
                setDataSource(url)
                prepare()
            }
            withContext(Dispatchers.Main) {
                player.setOnCompletionListener { it.release() }
                player.start()
            }
        } catch (e: Exception) {
            Log.w("MillaTtsPlayer", "Audio playback failed: ${e.message}")
        }
    }

    private fun speakWithDeviceTts(text: String) {
        if (!deviceTtsReady) return
        deviceTts?.speak(
            text.replace('\n', ' '),
            TextToSpeech.QUEUE_FLUSH,
            null,
            "milla-tts-fallback"
        )
    }

    fun release() {
        deviceTts?.shutdown()
        deviceTts = null
    }
}
