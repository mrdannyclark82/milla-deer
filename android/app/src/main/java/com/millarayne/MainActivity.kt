package com.millarayne

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import coil.compose.AsyncImage
import com.millarayne.data.Message
import com.millarayne.data.SettingsRepository
import com.millarayne.ui.ChatViewModel
import com.millarayne.ui.theme.AssistantBubble
import com.millarayne.ui.theme.MillaTheme
import com.millarayne.ui.theme.UserBubble
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val viewModel: ChatViewModel by viewModels()
    private lateinit var screenCaptureManager: ScreenCaptureManager

    private val screenShareLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode != Activity.RESULT_OK || data == null) {
                viewModel.setScreenShareActive(false)
                viewModel.setScreenShareStatus("Screen share permission was cancelled.")
                return@registerForActivityResult
            }

            if (screenCaptureManager.start(result.resultCode, data)) {
                viewModel.setScreenShareActive(true)
                viewModel.setScreenShareStatus(
                    "Screen share is ready. Tap capture so Milla can inspect your current screen."
                )
            } else {
                viewModel.setScreenShareActive(false)
                viewModel.setScreenShareStatus(
                    "Screen capture could not start on this device."
                )
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        screenCaptureManager = ScreenCaptureManager(this)

        setContent {
            MillaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    ChatScreen(
                        viewModel = viewModel,
                        onRequestScreenShare = { requestScreenSharePermission() },
                        onCaptureCurrentScreen = { captureCurrentScreen() },
                        onStopScreenShare = { stopScreenShare() }
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        screenCaptureManager.stop()
        super.onDestroy()
    }

    private fun requestScreenSharePermission() {
        val projectionManager = getSystemService(MediaProjectionManager::class.java)
        if (projectionManager == null) {
            viewModel.setScreenShareStatus("Screen sharing is not available on this device.")
            return
        }

        screenShareLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    private fun captureCurrentScreen() {
        if (!screenCaptureManager.isActive()) {
            viewModel.setScreenShareStatus("Enable screen share first.")
            return
        }

        lifecycleScope.launch {
            viewModel.setScreenShareStatus("Capturing your current screen...")
            val imageData = screenCaptureManager.captureFrameDataUrl()
            if (imageData == null) {
                viewModel.setScreenShareStatus("I couldn't capture the screen yet. Try again in a moment.")
                return@launch
            }

            viewModel.setScreenSharePreview(imageData)
            viewModel.sendScreenObservation(
                prompt = "I'm sharing my current screen. Tell me what you can infer from it and help me with anything relevant on display.",
                imageData = imageData
            )
        }
    }

    private fun stopScreenShare() {
        screenCaptureManager.stop()
        viewModel.setScreenShareActive(false)
        viewModel.setScreenSharePreview(null)
        viewModel.setScreenShareStatus("Screen sharing stopped.")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatScreen(
    viewModel: ChatViewModel,
    onRequestScreenShare: () -> Unit,
    onCaptureCurrentScreen: () -> Unit,
    onStopScreenShare: () -> Unit
) {
    val context = LocalContext.current
    val messages by viewModel.messages.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val isOfflineMode by viewModel.isOfflineMode.collectAsStateWithLifecycle()
    val serverUrl by viewModel.serverUrl.collectAsStateWithLifecycle()
    val offlineModeEnabled by viewModel.offlineModeEnabled.collectAsStateWithLifecycle()
    val autoFallback by viewModel.autoFallback.collectAsStateWithLifecycle()
    val spokenRepliesEnabled by viewModel.spokenRepliesEnabled.collectAsStateWithLifecycle()
    val screenShareActive by viewModel.screenShareActive.collectAsStateWithLifecycle()
    val screenShareStatus by viewModel.screenShareStatus.collectAsStateWithLifecycle()
    val screenSharePreview by viewModel.screenSharePreview.collectAsStateWithLifecycle()

    var messageText by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var isSettingsOpen by remember { mutableStateOf(false) }
    var pendingServerUrl by remember { mutableStateOf(serverUrl) }
    var pendingOfflineMode by remember { mutableStateOf(offlineModeEnabled) }
    var pendingAutoFallback by remember { mutableStateOf(autoFallback) }
    var pendingSpokenReplies by remember { mutableStateOf(spokenRepliesEnabled) }
    var lastSpokenAssistantMessageId by remember { mutableStateOf<Long?>(null) }
    val listState = rememberLazyListState()
    val textToSpeech = rememberTextToSpeech()

    val speechRecognizerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) {
            localError = "Voice input was cancelled."
            return@rememberLauncherForActivityResult
        }

        val recognizedText = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
            ?.trim()
            .orEmpty()

        if (recognizedText.isBlank()) {
            localError = "I couldn't hear anything clearly enough to send."
            return@rememberLauncherForActivityResult
        }

        messageText = ""
        viewModel.sendMessage(recognizedText)
    }

    val microphonePermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            localError = "Microphone permission is required for voice input."
            return@rememberLauncherForActivityResult
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to Milla")
        }

        if (intent.resolveActivity(context.packageManager) == null) {
            localError = "Speech recognition is not available on this device."
            return@rememberLauncherForActivityResult
        }

        speechRecognizerLauncher.launch(intent)
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    LaunchedEffect(isSettingsOpen, serverUrl, offlineModeEnabled, autoFallback, spokenRepliesEnabled) {
        if (isSettingsOpen) {
            pendingServerUrl = serverUrl
            pendingOfflineMode = offlineModeEnabled
            pendingAutoFallback = autoFallback
            pendingSpokenReplies = spokenRepliesEnabled
        }
    }

    LaunchedEffect(messages, spokenRepliesEnabled) {
        val latestAssistantMessage = messages.lastOrNull { it.role == "assistant" } ?: return@LaunchedEffect
        if (!spokenRepliesEnabled || latestAssistantMessage.id == lastSpokenAssistantMessageId) {
            return@LaunchedEffect
        }

        lastSpokenAssistantMessageId = latestAssistantMessage.id
        textToSpeech?.speak(
            latestAssistantMessage.content.replace('\n', ' '),
            TextToSpeech.QUEUE_FLUSH,
            null,
            "assistant-${latestAssistantMessage.id}"
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Milla Rayne", fontWeight = FontWeight.Bold)
                        Text(
                            when {
                                offlineModeEnabled -> "Offline only"
                                isOfflineMode -> "Offline fallback"
                                else -> "Connected"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.9f)
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (screenShareActive) {
                                onStopScreenShare()
                            } else {
                                onRequestScreenShare()
                            }
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Visibility,
                            contentDescription = if (screenShareActive) {
                                "Stop screen sharing"
                            } else {
                                "Enable screen sharing"
                            },
                            tint = if (screenShareActive) Color(0xFFB2FF59) else Color.White
                        )
                    }
                    IconButton(onClick = { isSettingsOpen = true }) {
                        Icon(
                            imageVector = Icons.Filled.Settings,
                            contentDescription = "Connection and voice settings",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = Color.White
                )
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = {
                            localError = null
                            microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Mic,
                            contentDescription = "Speak a message",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    OutlinedTextField(
                        value = messageText,
                        onValueChange = { messageText = it },
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 8.dp),
                        placeholder = { Text("Type or speak a message...") },
                        enabled = !isLoading,
                        maxLines = 3
                    )
                    IconButton(
                        onClick = {
                            val trimmed = messageText.trim()
                            if (trimmed.isNotEmpty()) {
                                viewModel.sendMessage(trimmed)
                                messageText = ""
                            }
                        },
                        enabled = !isLoading && messageText.isNotBlank()
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send",
                            tint = if (messageText.isNotBlank()) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                Color.Gray
                            }
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFFF3E5F5), Color(0xFFE1BEE7))
                    )
                )
                .padding(paddingValues)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                if (screenShareActive || screenShareStatus != null || screenSharePreview != null) {
                    ScreenShareCard(
                        isActive = screenShareActive,
                        status = screenShareStatus,
                        previewImageData = screenSharePreview,
                        onCaptureCurrentScreen = onCaptureCurrentScreen,
                        onStartScreenShare = onRequestScreenShare,
                        onStopScreenShare = onStopScreenShare
                    )
                }

                if (messages.isEmpty() && !isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                "Hello!",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Start chatting with Milla",
                                style = MaterialTheme.typography.bodyLarge,
                                color = Color.Gray
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentPadding = PaddingValues(8.dp)
                    ) {
                        items(messages) { message ->
                            MessageBubble(message = message)
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        if (isLoading) {
                            item {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(8.dp),
                                    horizontalArrangement = Arrangement.Start
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = AssistantBubble.copy(alpha = 0.6f)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(
                                                horizontal = 12.dp,
                                                vertical = 10.dp
                                            ),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                "...",
                                                color = MaterialTheme.colorScheme.primary,
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                "Milla is thinking...",
                                                color = Color.Gray,
                                                style = MaterialTheme.typography.bodySmall
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            (error ?: localError)?.let { errorMessage ->
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp),
                    action = {
                        TextButton(
                            onClick = {
                                viewModel.clearError()
                                localError = null
                            }
                        ) {
                            Text("Dismiss")
                        }
                    }
                ) {
                    Text(errorMessage)
                }
            }
        }
    }

    if (isSettingsOpen) {
        SettingsDialog(
            serverUrl = pendingServerUrl,
            offlineModeEnabled = pendingOfflineMode,
            autoFallback = pendingAutoFallback,
            spokenRepliesEnabled = pendingSpokenReplies,
            onServerUrlChange = { pendingServerUrl = it },
            onOfflineModeChange = { pendingOfflineMode = it },
            onAutoFallbackChange = { pendingAutoFallback = it },
            onSpokenRepliesChange = { pendingSpokenReplies = it },
            onDismiss = { isSettingsOpen = false },
            onSave = {
                viewModel.updateServerUrl(pendingServerUrl)
                viewModel.setOfflineModeEnabled(pendingOfflineMode)
                viewModel.setAutoFallback(pendingAutoFallback)
                viewModel.setSpokenRepliesEnabled(pendingSpokenReplies)
                isSettingsOpen = false
                localError = null
            }
        )
    }
}

@Composable
private fun ScreenShareCard(
    isActive: Boolean,
    status: String?,
    previewImageData: String?,
    onCaptureCurrentScreen: () -> Unit,
    onStartScreenShare: () -> Unit,
    onStopScreenShare: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White.copy(alpha = 0.88f),
        shadowElevation = 4.dp
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("Screen sharing", fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = status ?: if (isActive) {
                    "Screen share is active. Capture the current screen when you want Milla to inspect it."
                } else {
                    "Enable screen sharing so Milla can inspect your current screen."
                },
                style = MaterialTheme.typography.bodySmall,
                color = Color.DarkGray
            )
            if (previewImageData != null) {
                Spacer(modifier = Modifier.height(12.dp))
                AsyncImage(
                    model = previewImageData,
                    contentDescription = "Latest shared screen preview",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentScale = ContentScale.Crop
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isActive) {
                    TextButton(onClick = onCaptureCurrentScreen) {
                        Text("Capture current screen")
                    }
                    TextButton(onClick = onStopScreenShare) {
                        Text("Stop")
                    }
                } else {
                    TextButton(onClick = onStartScreenShare) {
                        Text("Enable")
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsDialog(
    serverUrl: String,
    offlineModeEnabled: Boolean,
    autoFallback: Boolean,
    spokenRepliesEnabled: Boolean,
    onServerUrlChange: (String) -> Unit,
    onOfflineModeChange: (Boolean) -> Unit,
    onAutoFallbackChange: (Boolean) -> Unit,
    onSpokenRepliesChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Connection and voice") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = onServerUrlChange,
                    label = { Text("Server URL") },
                    placeholder = { Text(SettingsRepository.DEFAULT_SERVER_URL) },
                    supportingText = {
                        Text("Use your computer IP like http://192.168.1.50:5000/ or adb reverse with http://127.0.0.1:5000/")
                    },
                    singleLine = true
                )
                SettingsToggleRow(
                    label = "Offline only",
                    description = "Always use the on-device fallback responder.",
                    checked = offlineModeEnabled,
                    onCheckedChange = onOfflineModeChange
                )
                SettingsToggleRow(
                    label = "Auto fallback",
                    description = "Drop to offline responses if the server cannot be reached.",
                    checked = autoFallback,
                    onCheckedChange = onAutoFallbackChange
                )
                SettingsToggleRow(
                    label = "Spoken replies",
                    description = "Read assistant responses out loud after they arrive.",
                    checked = spokenRepliesEnabled,
                    onCheckedChange = onSpokenRepliesChange
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onSave) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun SettingsToggleRow(
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.SemiBold)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun rememberTextToSpeech(): TextToSpeech? {
    val context = LocalContext.current
    var textToSpeech by remember { mutableStateOf<TextToSpeech?>(null) }

    DisposableEffect(context) {
        var createdTextToSpeech: TextToSpeech? = null
        createdTextToSpeech = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                createdTextToSpeech?.language = Locale.getDefault()
                createdTextToSpeech?.setSpeechRate(1.0f)
            }
        }
        textToSpeech = createdTextToSpeech

        onDispose {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
            textToSpeech = null
        }
    }

    return textToSpeech
}

@Composable
private fun MessageBubble(message: Message) {
    val isUser = message.role == "user"
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (isUser) UserBubble else AssistantBubble,
            shadowElevation = 2.dp,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = message.content,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = timeFormat.format(Date(message.timestamp)),
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
    }
}
