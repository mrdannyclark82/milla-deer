package com.elara.app.services

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

data class MillaChatResponse(
    val content: String,
    val success: Boolean,
    val isDemo: Boolean = false,
    val demoMessagesLeft: Int? = null,
    val demoLimitReached: Boolean = false
)

@Singleton
class MillaApiService @Inject constructor() {

    companion object {
        const val DEFAULT_SERVER_URL = "https://milla-rayne.com"
        private const val TAG = "MillaApiService"
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }

    private var serverUrl: String = DEFAULT_SERVER_URL
    private var sessionCookie: String? = null
    private var isDemo: Boolean = false
    private var demoMessageCount: Int = 0

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    fun setServerUrl(url: String) {
        serverUrl = url.trimEnd('/')
        // Reset session when server changes
        sessionCookie = null
        isDemo = false
        demoMessageCount = 0
    }

    fun getServerUrl(): String = serverUrl
    fun isConnectedAsDemo(): Boolean = isDemo
    fun getDemoMessageCount(): Int = demoMessageCount

    /** Ping the server to check availability */
    suspend fun isServerAvailable(): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$serverUrl/api/auth/status")
                .get()
                .build()
            val response = client.newCall(request).execute()
            response.code in 200..299
        } catch (e: Exception) {
            Log.w(TAG, "Server unavailable: ${e.message}")
            false
        }
    }

    /** Initialize a demo session (no login required) */
    suspend fun startDemoSession(): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$serverUrl/api/auth/demo")
                .post("{}".toRequestBody(JSON))
                .build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                // Extract session cookie
                val setCookieHeader = response.headers("Set-Cookie")
                    .firstOrNull { it.startsWith("session_token=") }
                if (setCookieHeader != null) {
                    sessionCookie = setCookieHeader.substringAfter("session_token=")
                        .substringBefore(";")
                    isDemo = true
                    demoMessageCount = 0
                    Log.d(TAG, "Demo session started")
                    return@withContext true
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Demo session failed: ${e.message}")
            false
        }
    }

    /** Send a chat message to the Milla server */
    suspend fun chat(
        message: String,
        conversationHistory: List<Pair<String, String>> = emptyList()
    ): MillaChatResponse = withContext(Dispatchers.IO) {
        // Auto-start demo session if no session exists
        if (sessionCookie == null) {
            val started = startDemoSession()
            if (!started) {
                return@withContext MillaChatResponse(
                    content = "Couldn't connect to Milla server. Check your network or server URL in Settings.",
                    success = false
                )
            }
        }

        try {
            val body = JSONObject().apply {
                put("message", message)
            }.toString()

            val request = Request.Builder()
                .url("$serverUrl/api/chat")
                .post(body.toRequestBody(JSON))
                .addHeader("Cookie", "session_token=$sessionCookie")
                .addHeader("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()

            when {
                response.code == 401 -> {
                    // Session expired — reset and retry once
                    sessionCookie = null
                    isDemo = false
                    val retryStarted = startDemoSession()
                    if (!retryStarted) return@withContext MillaChatResponse(
                        content = "Session expired. Pull to refresh.",
                        success = false
                    )
                    return@withContext chat(message, conversationHistory)
                }
                response.isSuccessful -> {
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val content = json.optString("response")
                        .ifBlank { json.optString("content") }
                        .ifBlank { "…" }

                    if (isDemo) demoMessageCount++

                    MillaChatResponse(
                        content = content,
                        success = true,
                        isDemo = isDemo,
                        demoMessagesLeft = if (isDemo) maxOf(0, 10 - demoMessageCount) else null,
                        demoLimitReached = json.optBoolean("demoLimitReached", false)
                    )
                }
                else -> MillaChatResponse(
                    content = "Server error (${response.code}). Try again.",
                    success = false
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Chat request failed: ${e.message}")
            MillaChatResponse(
                content = "Connection error: ${e.message}",
                success = false
            )
        }
    }
}
