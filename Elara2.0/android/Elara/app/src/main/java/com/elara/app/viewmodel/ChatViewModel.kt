package com.elara.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elara.app.data.models.*
import com.elara.app.data.repository.ElaraRepository
import com.elara.app.services.GeminiResponse
import com.elara.app.services.GeminiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val geminiService: GeminiService,
    private val repository: ElaraRepository
) : ViewModel() {

    // UI State
    private val _messages = MutableStateFlow<List<Message>>(listOf(
        Message(
            id = "1",
            role = MessageRole.MODEL,
            content = "Systems Online. Neural Toolkit Active. I can search, generate images, create videos, code with you in the Sandbox, and create art. How can I help?",
            timestamp = System.currentTimeMillis()
        )
    ))
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _isThinking = MutableStateFlow(false)
    val isThinking: StateFlow<Boolean> = _isThinking.asStateFlow()

    private val _thoughtProcess = MutableStateFlow("")
    val thoughtProcess: StateFlow<String> = _thoughtProcess.asStateFlow()

    private val _selectedTool = MutableStateFlow(ToolMode.CHAT)
    val selectedTool: StateFlow<ToolMode> = _selectedTool.asStateFlow()

    private val _currentPersona = MutableStateFlow(PersonaMode.ADAPTIVE)
    val currentPersona: StateFlow<PersonaMode> = _currentPersona.asStateFlow()

    private val _metrics = MutableStateFlow(DetailedMetrics())
    val metrics: StateFlow<DetailedMetrics> = _metrics.asStateFlow()

    private val _knowledgeBase = MutableStateFlow<List<String>>(emptyList())
    val knowledgeBase: StateFlow<List<String>> = _knowledgeBase.asStateFlow()

    private val _attachments = MutableStateFlow<List<Attachment>>(emptyList())
    val attachments: StateFlow<List<Attachment>> = _attachments.asStateFlow()

    // Growth entries
    private val _growthEntries = MutableStateFlow<List<GrowthEntry>>(emptyList())
    val growthEntries: StateFlow<List<GrowthEntry>> = _growthEntries.asStateFlow()

    init {
        loadPersistedData()
    }

    private fun loadPersistedData() {
        viewModelScope.launch {
            // Load messages from database
            repository.getAllMessages().collect { savedMessages ->
                if (savedMessages.isNotEmpty()) {
                    _messages.value = savedMessages
                }
            }
        }

        viewModelScope.launch {
            // Load growth entries
            repository.getAllGrowthEntries().collect { entries ->
                _growthEntries.value = entries
            }
        }

        viewModelScope.launch {
            // Load settings
            repository.getSettingsFlow().collect { settings ->
                settings?.let {
                    _currentPersona.value = PersonaMode.valueOf(it.persona)
                }
            }
        }
    }

    fun setSelectedTool(tool: ToolMode) {
        _selectedTool.value = tool
    }

    fun setPersona(persona: PersonaMode) {
        _currentPersona.value = persona
        viewModelScope.launch {
            repository.updatePersona(persona)
        }
    }

    fun addAttachment(attachment: Attachment) {
        _attachments.value = _attachments.value + attachment
    }

    fun removeAttachment(index: Int) {
        _attachments.value = _attachments.value.toMutableList().apply {
            if (index in indices) removeAt(index)
        }
    }

    fun clearAttachments() {
        _attachments.value = emptyList()
    }

    fun sendMessage(text: String) {
        if (text.isBlank() && _attachments.value.isEmpty()) return

        viewModelScope.launch {
            // Handle special commands
            when (text.lowercase()) {
                "open sandbox" -> {
                    addSystemMessage("🛠️ Opening Sandbox IDE...")
                    return@launch
                }
                "open studio" -> {
                    addSystemMessage("🎨 Opening Creative Studio...")
                    return@launch
                }
            }

            // Add user message
            val userMessage = Message(
                role = MessageRole.USER,
                content = text + if (_attachments.value.isNotEmpty()) " [Attached ${_attachments.value.size} file(s)]" else "",
                timestamp = System.currentTimeMillis()
            )
            _messages.value = _messages.value + userMessage
            repository.saveMessage(userMessage)

            // Store in memory database
            repository.storeMemory(
                type = "conversation",
                content = text,
                importance = 5,
                tags = listOf(_selectedTool.value.name, "user-message"),
                source = "user-input"
            )

            // Process with Gemini
            _isThinking.value = true
            _thoughtProcess.value = "Analyzing request and context..."

            try {
                // Simulate thought process updates
                _thoughtProcess.value = "Selecting optimal model and tools..."
                kotlinx.coroutines.delay(500)
                _thoughtProcess.value = "Generating response with context awareness..."

                val response = geminiService.processUserRequest(
                    text = text,
                    tool = _selectedTool.value,
                    attachments = _attachments.value,
                    persona = _currentPersona.value,
                    knowledgeBase = _knowledgeBase.value
                )

                val modelMessage = Message(
                    role = MessageRole.MODEL,
                    content = response.content,
                    timestamp = System.currentTimeMillis(),
                    imageUri = response.imageUri,
                    videoUri = response.videoUri,
                    groundingSources = response.groundingSources
                )

                _messages.value = _messages.value + modelMessage
                repository.saveMessage(modelMessage)

                // Store response in memory
                repository.storeMemory(
                    type = "conversation",
                    content = response.content,
                    importance = 6,
                    tags = listOf(_selectedTool.value.name, "assistant-response"),
                    source = "gemini-api"
                )

                // Self-evaluation
                if (!response.isError) {
                    val newMetrics = geminiService.evaluateInteraction(text, response.content)
                    _metrics.value = newMetrics

                    // Learn if accuracy is low
                    if (newMetrics.accuracy < 90) {
                        val knowledge = geminiService.acquireKnowledge(text)
                        _knowledgeBase.value = _knowledgeBase.value + knowledge
                        addGrowthEntry(GrowthType.LEARNING, "Gap Detected", "Learned: $knowledge")
                    }
                }

            } catch (e: Exception) {
                val errorMessage = Message(
                    role = MessageRole.MODEL,
                    content = "I encountered an error: ${e.message}",
                    timestamp = System.currentTimeMillis()
                )
                _messages.value = _messages.value + errorMessage
            } finally {
                _isThinking.value = false
                _thoughtProcess.value = ""
                clearAttachments()
            }
        }
    }

    private fun addSystemMessage(content: String) {
        val message = Message(
            role = MessageRole.SYSTEM,
            content = content,
            timestamp = System.currentTimeMillis()
        )
        _messages.value = _messages.value + message
    }

    private fun addGrowthEntry(type: GrowthType, title: String, details: String) {
        val entry = GrowthEntry(
            type = type,
            title = title,
            details = details,
            timestamp = System.currentTimeMillis()
        )
        _growthEntries.value = _growthEntries.value + entry
        viewModelScope.launch {
            repository.saveGrowthEntry(entry)
        }
    }

    fun clearAllMessages() {
        viewModelScope.launch {
            repository.clearAllMessages()
            _messages.value = listOf(
                Message(
                    id = "1",
                    role = MessageRole.MODEL,
                    content = "Memory cleared. Systems reset. How can I help?",
                    timestamp = System.currentTimeMillis()
                )
            )
        }
    }

    fun handleGrowthEntryClick(entry: GrowthEntry) {
        val responseContent = when (entry.type) {
            GrowthType.PROPOSAL -> {
                """### 🛠️ Implementing: ${entry.title}
                   
                   **Concept:** ${entry.details}
                   
                   **Technical Guide:**
                   ${entry.technicalDetails ?: "Check implementation details."}
                   
                   *Would you like me to help implement this?*
                """.trimIndent()
            }
            GrowthType.AUDIT -> {
                """### ⚖️ Ethical Audit Report
                   
                   ${entry.details}
                   
                   *Status: Verified and Compliant.*
                """.trimIndent()
            }
            GrowthType.RESEARCH -> {
                """### 🔍 ${entry.title}
                   
                   ${entry.details}
                   
                   *Discovered through proactive research.*
                """.trimIndent()
            }
            else -> entry.details
        }

        val message = Message(
            role = MessageRole.MODEL,
            content = responseContent,
            timestamp = System.currentTimeMillis()
        )
        _messages.value = _messages.value + message
    }
}
