package com.millarayne.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.millarayne.agent.OfflineResponseGenerator
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
    private val messageDao: MessageDao =
        AppDatabase.getDatabase(application).messageDao()
    private val offlineGenerator = OfflineResponseGenerator(application)
    private val settingsRepository = SettingsRepository(application)

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isOfflineMode = MutableStateFlow(false)
    val isOfflineMode: StateFlow<Boolean> = _isOfflineMode.asStateFlow()

    private val _serverUrl = MutableStateFlow(SettingsRepository.DEFAULT_SERVER_URL)
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _offlineModeEnabled =
        MutableStateFlow(SettingsRepository.DEFAULT_OFFLINE_MODE_ENABLED)
    val offlineModeEnabled: StateFlow<Boolean> = _offlineModeEnabled.asStateFlow()

    private val _autoFallback = MutableStateFlow(SettingsRepository.DEFAULT_AUTO_FALLBACK)
    val autoFallback: StateFlow<Boolean> = _autoFallback.asStateFlow()

    private val _spokenRepliesEnabled =
        MutableStateFlow(SettingsRepository.DEFAULT_SPOKEN_REPLIES_ENABLED)
    val spokenRepliesEnabled: StateFlow<Boolean> = _spokenRepliesEnabled.asStateFlow()

    private val _screenShareActive = MutableStateFlow(false)
    val screenShareActive: StateFlow<Boolean> = _screenShareActive.asStateFlow()

    private val _screenShareStatus = MutableStateFlow<String?>(null)
    val screenShareStatus: StateFlow<String?> = _screenShareStatus.asStateFlow()

    private val _screenSharePreview = MutableStateFlow<String?>(null)
    val screenSharePreview: StateFlow<String?> = _screenSharePreview.asStateFlow()

    init {
        observeMessages()
        observeSettings()
    }

    override fun onCleared() {
        offlineGenerator.shutdown()
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
            settingsRepository.serverUrl.collectLatest { _serverUrl.value = it }
        }
        viewModelScope.launch {
            settingsRepository.offlineModeEnabled.collectLatest {
                _offlineModeEnabled.value = it
                if (it) {
                    _isOfflineMode.value = true
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
    }

    fun sendMessage(content: String) {
        submitMessage(content = content, imageData = null)
    }

    fun sendScreenObservation(prompt: String, imageData: String) {
        submitMessage(content = prompt, imageData = imageData)
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
                messageDao.insertMessage(
                    Message(
                        content = assistantResponse,
                        role = "assistant",
                        timestamp = System.currentTimeMillis()
                    )
                )

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

    private suspend fun tryOnlineThenOffline(content: String, imageData: String?): String {
        if (_offlineModeEnabled.value) {
            _isOfflineMode.value = true
            return offlineFallbackResponse(content, imageData)
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
                return response.body()!!.response
            } catch (error: Exception) {
                lastError = error
                Log.w("ChatViewModel", "Online request failed for $baseUrl", error)
            }
        }

        if (!_autoFallback.value && lastError != null) {
            throw lastError
        }

        _isOfflineMode.value = true
        return offlineFallbackResponse(content, imageData)
    }

    private suspend fun offlineFallbackResponse(content: String, imageData: String?): String {
        if (imageData != null) {
            return "I captured your screen, but I'm offline right now and can't inspect the image without the server connection. Reconnect me and share the screen again so I can help with what's visible."
        }

        val (offlineResponse, _) = offlineGenerator.generateResponse(content)
        return offlineResponse
    }

    private fun candidateServerUrls(): List<String> {
        val configuredUrl = SettingsRepository.normalizeServerUrl(_serverUrl.value)
        val candidates = linkedSetOf(configuredUrl)

        if (configuredUrl == SettingsRepository.DEFAULT_SERVER_URL) {
            candidates += "http://127.0.0.1:5000/"
        }

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
