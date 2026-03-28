package com.millarayne.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.millarayne.MillaApplication
import com.millarayne.api.MillaApiClient
import com.millarayne.data.AppDatabase
import com.millarayne.data.ChatRequest
import com.millarayne.data.Message
import com.millarayne.data.MessageDao
import com.millarayne.data.SettingsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class ChatViewModel(application: Application) : AndroidViewModel(application) {
    private data class ChatDispatchResult(
        val content: String,
        val syncedWithServer: Boolean
    )

    private val messageDao: MessageDao =
        AppDatabase.getDatabase(application).messageDao()
    // Reuse the app-level instance so the model isn't loaded twice
    private val offlineGenerator = (application as MillaApplication).offlineGenerator
    private val settingsRepository = SettingsRepository(application)

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isOfflineMode = MutableStateFlow(false)
    val isOfflineMode: StateFlow<Boolean> = _isOfflineMode.asStateFlow()

    /** Which inference tier last generated an offline response: "server" | "gemma-nano" | "mediapipe" | "mlc-opencl" | "edge" | "pattern" */
    private val _inferenceBackend = MutableStateFlow("server")
    val inferenceBackend: StateFlow<String> = _inferenceBackend.asStateFlow()

    private val _serverUrl = MutableStateFlow(SettingsRepository.DEFAULT_SERVER_URL)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _sessionToken = MutableStateFlow("")
    val sessionToken: StateFlow<String> = _sessionToken.asStateFlow()

    private val _offlineModeEnabled =
        MutableStateFlow(SettingsRepository.DEFAULT_OFFLINE_MODE_ENABLED)
    val offlineModeEnabled: StateFlow<Boolean> = _offlineModeEnabled.asStateFlow()

    private val _autoFallback = MutableStateFlow(SettingsRepository.DEFAULT_AUTO_FALLBACK)
    val autoFallback: StateFlow<Boolean> = _autoFallback.asStateFlow()

    private val _spokenRepliesEnabled =
        MutableStateFlow(SettingsRepository.DEFAULT_SPOKEN_REPLIES_ENABLED)
    val spokenRepliesEnabled: StateFlow<Boolean> = _spokenRepliesEnabled.asStateFlow()

    private val _nanoEnabled = MutableStateFlow(SettingsRepository.DEFAULT_NANO_ENABLED)
    val nanoEnabled: StateFlow<Boolean> = _nanoEnabled.asStateFlow()

    private val _screenShareActive = MutableStateFlow(false)
    val screenShareActive: StateFlow<Boolean> = _screenShareActive.asStateFlow()

    private val _screenShareStatus = MutableStateFlow<String?>(null)
    val screenShareStatus: StateFlow<String?> = _screenShareStatus.asStateFlow()

    private val _screenSharePreview = MutableStateFlow<String?>(null)
    val screenSharePreview: StateFlow<String?> = _screenSharePreview.asStateFlow()

    init {
        MillaApiClient.setSessionTokenProvider { _sessionToken.value }
        observeMessages()
        observeSettings()
        refreshMessagesFromServer()
    }

    override fun onCleared() {
        // offlineGenerator is app-scoped — do not shut it down here
        super.onCleared()
    }

    private fun observeMessages() {
        viewModelScope.launch {
            try {
                messageDao.getAllMessages().collectLatest { storedMessages ->
                    _messages.value = storedMessages
                }
            } catch (error: Exception) {
                Log.e("ChatViewModel", "Failed to load messages", error)
                _error.value =
                    "Failed to load messages: ${error.localizedMessage ?: "Unknown error"}"
            }
        }
    }

    private fun observeSettings() {
        viewModelScope.launch {
            settingsRepository.serverUrl.collectLatest {
                _serverUrl.value = it
                refreshMessagesFromServer()
            }
        }
        viewModelScope.launch {
            settingsRepository.sessionToken.collectLatest {
                _sessionToken.value = it
                refreshMessagesFromServer()
            }
        }
        viewModelScope.launch {
            settingsRepository.offlineModeEnabled.collectLatest {
                _offlineModeEnabled.value = it
                if (it) {
                    _isOfflineMode.value = true
                } else {
                    refreshMessagesFromServer()
                }
            }
        }
        viewModelScope.launch {
            settingsRepository.autoFallback.collectLatest { _autoFallback.value = it }
        }
        viewModelScope.launch {
            settingsRepository.spokenRepliesEnabled.collectLatest {
                _spokenRepliesEnabled.value = it
            }
        }
        viewModelScope.launch {
            settingsRepository.nanoEnabled.collectLatest { enabled ->
                _nanoEnabled.value = enabled
                // Re-initialise SLM backends when user toggles Nano in settings
                offlineGenerator.reinitialize(enabled)
            }
        }
    }

    fun sendMessage(content: String) {
        submitMessage(content = content, imageData = null)
    }

    fun sendVisualMessage(prompt: String, imageData: String) {
        submitMessage(content = prompt, imageData = imageData)
    }

    fun sendDocumentMessage(fileName: String, extractedText: String, userPrompt: String? = null) {
        val prompt = buildString {
            append((userPrompt?.trim().takeUnless { it.isNullOrEmpty() }
                ?: "Analyze the attached document and help me with the important details."))
            append("\n\nDocument name: ")
            append(fileName)
            append("\nDocument contents:\n")
            append(extractedText)
        }
        submitMessage(content = prompt, imageData = null)
    }

    fun sendScreenObservation(prompt: String, imageData: String) {
        submitMessage(content = prompt, imageData = imageData)
    }

    fun sendLocationAwareMessage(content: String, locationSummary: String) {
        val trimmed = content.trim()
        val prompt = buildString {
            append(
                trimmed.ifEmpty {
                    "Use my current location to give me relevant advice, context, and any nearby considerations."
                }
            )
            append("\n\n")
            append(locationSummary)
        }
        submitMessage(content = prompt, imageData = null)
    }

    private fun submitMessage(content: String, imageData: String?) {
        val trimmed = content.trim()
        if (trimmed.isEmpty()) {
            _error.value = "Message cannot be empty"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            if (imageData != null) {
                _screenShareStatus.value = "Sending the latest screen capture to Milla..."
            }

            try {
                messageDao.insertMessage(
                    Message(
                        content = trimmed,
                        role = "user",
                        timestamp = System.currentTimeMillis()
                    )
                )

                val assistantResponse = tryOnlineThenOffline(trimmed, imageData)
                if (!assistantResponse.syncedWithServer) {
                    messageDao.insertMessage(
                        Message(
                            content = assistantResponse.content,
                            role = "assistant",
                            timestamp = System.currentTimeMillis()
                        )
                    )
                }

                if (imageData != null) {
                    _screenShareStatus.value = "Milla received your latest screen capture."
                }
            } catch (error: Exception) {
                Log.e("ChatViewModel", "Failed to send message", error)
                _error.value = "Failed to send message: ${describeNetworkError(error)}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateServerUrl(url: String) {
        viewModelScope.launch {
            settingsRepository.setServerUrl(url)
        }
    }

    fun updateSessionToken(sessionToken: String) {
        viewModelScope.launch {
            settingsRepository.setSessionToken(sessionToken)
        }
    }

    fun setOfflineModeEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setOfflineModeEnabled(enabled)
        }
    }

    fun setAutoFallback(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setAutoFallback(enabled)
        }
    }

    fun setSpokenRepliesEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setSpokenRepliesEnabled(enabled)
        }
    }

    fun setNanoEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setNanoEnabled(enabled)
        }
    }

    fun setScreenShareActive(active: Boolean) {
        _screenShareActive.value = active
    }

    fun setScreenShareStatus(status: String?) {
        _screenShareStatus.value = status
    }

    fun clearScreenShareStatus() {
        _screenShareStatus.value = null
    }

    fun setScreenSharePreview(imageData: String?) {
        _screenSharePreview.value = imageData
    }

    fun clearError() {
        _error.value = null
    }

    private fun refreshMessagesFromServer() {
        if (_offlineModeEnabled.value) {
            return
        }

        viewModelScope.launch {
            syncMessagesFromServer()
        }
    }

    private suspend fun syncMessagesFromServer(): Boolean {
        if (_offlineModeEnabled.value) {
            return false
        }

        for (baseUrl in candidateServerUrls()) {
            try {
                val response = MillaApiClient.createApiService(baseUrl).getMessages(limit = 80)
                if (!response.isSuccessful || response.body() == null) {
                    throw HttpException(response)
                }

                val remoteMessages = response.body()!!.map { it.toLocalMessage() }
                val localMessageCount = messageDao.getMessageCount()

                if (remoteMessages.isNotEmpty() || localMessageCount == 0) {
                    messageDao.deleteAllMessages()
                    if (remoteMessages.isNotEmpty()) {
                        messageDao.insertMessages(remoteMessages)
                    }
                }

                _isOfflineMode.value = false
                return true
            } catch (error: Exception) {
                Log.w("ChatViewModel", "Message sync failed for $baseUrl", error)
            }
        }

        return false
    }

    private suspend fun tryOnlineThenOffline(
        content: String,
        imageData: String?
    ): ChatDispatchResult {
        if (_offlineModeEnabled.value) {
            _isOfflineMode.value = true
            return ChatDispatchResult(
                content = offlineFallbackResponse(content, imageData),
                syncedWithServer = false
            )
        }

        var lastError: Exception? = null

        for (baseUrl in candidateServerUrls()) {
            try {
                val response = MillaApiClient.createApiService(baseUrl)
                    .sendMessage(ChatRequest(message = content, imageData = imageData))
                if (!response.isSuccessful || response.body() == null) {
                    throw HttpException(response)
                }

                _isOfflineMode.value = false
                _inferenceBackend.value = "server"
                val synced = syncMessagesFromServer()
                return ChatDispatchResult(
                    content = response.body()!!.response,
                    syncedWithServer = synced
                )
            } catch (error: Exception) {
                lastError = error
                Log.w("ChatViewModel", "Online request failed for $baseUrl", error)
            }
        }

        if (!_autoFallback.value && lastError != null) {
            throw lastError
        }

        _isOfflineMode.value = true
        return ChatDispatchResult(
            content = offlineFallbackResponse(content, imageData),
            syncedWithServer = false
        )
    }

    private suspend fun offlineFallbackResponse(content: String, imageData: String?): String {
        val prompt = if (imageData != null && content.isBlank())
            "I captured your screen but am offline — describe what you need help with."
        else content

        val (offlineResponse, _) = offlineGenerator.generateResponse(prompt)
        _inferenceBackend.value = offlineGenerator.lastBackend
        return offlineResponse
    }

    private fun candidateServerUrls(): List<String> {
        val configuredUrl = SettingsRepository.normalizeServerUrl(_serverUrl.value)
        val candidates = linkedSetOf(configuredUrl)

        if (configuredUrl == SettingsRepository.DEFAULT_SERVER_URL) {
            candidates += "http://127.0.0.1:5000/"
        }

        // Always try Cloudflare tunnel as remote fallback
        candidates += SettingsRepository.REMOTE_SERVER_URL

        return candidates.toList()
    }

    private fun describeNetworkError(error: Exception): String {
        return when (error) {
            is UnknownHostException ->
                "Cannot reach the server. Use your computer IP, or adb reverse with http://127.0.0.1:5000/."
            is ConnectException ->
                "Connection refused. Make sure the Milla server is running and the URL is correct."
            is SocketTimeoutException ->
                "The server took too long to respond."
            is HttpException ->
                "Server error ${error.code()}: ${error.message()}"
            else -> error.localizedMessage ?: "Unknown network error"
        }
    }
}
