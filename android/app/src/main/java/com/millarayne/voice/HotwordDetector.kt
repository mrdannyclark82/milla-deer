package com.millarayne.voice

import android.content.Context
import android.util.Log

class HotwordDetector(
    private val context: Context,
    private val onHotwordDetected: (String) -> Unit
) {
    private var isListening = false

    fun initialize(customWakeWord: String = "hey-milla"): Boolean {
        Log.i(
            "HotwordDetector",
            "Hotword detection is not configured in this build; using a no-op detector for $customWakeWord."
        )
        return false
    }

    fun startListening() {
        isListening = true
        Log.i("HotwordDetector", "Hotword listening requested, but detector is disabled.")
    }

    fun stopListening() {
        isListening = false
    }

    fun destroy() {
        isListening = false
    }

    companion object {
        fun createSnowboyDetector(
            context: Context,
            modelPath: String,
            sensitivity: Float = 0.5f,
            callback: () -> Unit
        ): SnowboyDetector? {
            Log.i(
                "HotwordDetector",
                "Snowboy detector is not bundled in this build. modelPath=$modelPath sensitivity=$sensitivity"
            )
            return null
        }
    }
}

class SnowboyDetector(
    modelPath: String,
    private val sensitivity: Float,
    private val callback: () -> Unit
)
