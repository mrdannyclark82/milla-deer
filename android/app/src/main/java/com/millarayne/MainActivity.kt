package com.millarayne

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.util.Base64
import android.speech.RecognizerIntent
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
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoCamera
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import coil.compose.AsyncImage
import com.millarayne.location.LocationContextProvider
import com.millarayne.data.Message
import com.millarayne.data.SettingsRepository
import com.millarayne.ui.ChatViewModel
import com.millarayne.ui.theme.AssistantBubble
import com.millarayne.ui.theme.MillaTheme
import com.millarayne.ui.theme.UserBubble
import com.millarayne.voice.MillaTtsPlayer
import java.text.SimpleDateFormat
import java.io.ByteArrayOutputStream
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val viewModel: ChatViewModel by viewModels()
    private lateinit var screenCaptureManager: ScreenCaptureManager

    private val screenShareLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode != Activity.RESULT_OK || data == null) {
                viewModel.setScreenShareActive(false)
                viewModel.setScreenShareStatus("Screen share permission was cancelled.")
                ScreenShareForegroundService.stop(this)
                return@registerForActivityResult
            }

            viewModel.setScreenShareStatus("Starting protected screen-share session...")
            ScreenShareForegroundService.startProjection(this, result.resultCode, data)
            lifecycleScope.launch {
                repeat(10) {
                    delay(250)
                    if (screenCaptureManager.isActive()) {
                        viewModel.setScreenShareActive(true)
                        viewModel.setScreenShareStatus(
                            "Screen share is active. I'm grabbing the first shared screen now."
                        )
                        delay(800)
                        captureCurrentScreen(autoTriggered = true)
                        return@launch
                    }
                }

                viewModel.setScreenShareActive(false)
                viewModel.setScreenShareStatus(
                    "Screen capture could not start on this device."
                )
                ScreenShareForegroundService.stop(this@MainActivity)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        screenCaptureManager = ScreenCaptureManager.getShared(applicationContext)
        screenCaptureManager.setOnSessionEndedListener {
            viewModel.setScreenShareActive(false)
            viewModel.setScreenShareStatus(
                "Android stopped screen sharing. Start it again when you're ready."
            )
        }
        if (screenCaptureManager.isActive()) {
            viewModel.setScreenShareActive(true)
            if (viewModel.screenShareStatus.value.isNullOrBlank()) {
                viewModel.setScreenShareStatus("Screen share is still active.")
            }
        }

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
        screenCaptureManager.setOnSessionEndedListener(null)
        super.onDestroy()
    }

    private fun requestScreenSharePermission() {
        val projectionManager = getSystemService(MediaProjectionManager::class.java)
        if (projectionManager == null) {
            viewModel.setScreenShareStatus("Screen sharing is not available on this device.")
            return
        }

        ScreenShareForegroundService.stop(this)
        val captureIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            projectionManager.createScreenCaptureIntent(
                MediaProjectionConfig.createConfigForDefaultDisplay()
            )
        } else {
            projectionManager.createScreenCaptureIntent()
        }
        screenShareLauncher.launch(captureIntent)
    }

    private fun captureCurrentScreen(autoTriggered: Boolean = false) {
        if (!screenCaptureManager.isActive()) {
            viewModel.setScreenShareStatus("Enable screen share first.")
            return
        }

        lifecycleScope.launch {
            viewModel.setScreenShareStatus(
                if (autoTriggered) {
                    "Capturing the shared app automatically..."
                } else {
                    "Capturing your current screen..."
                }
            )
            val imageData = screenCaptureManager.captureFrameDataUrl(
                maxAttempts = if (autoTriggered) 30 else 15,
                retryDelayMs = if (autoTriggered) 150 else 100
            )
            if (imageData == null) {
                viewModel.setScreenShareStatus(
                    if (autoTriggered) {
                        "The first automatic capture missed. Open the app you want to share, wait a moment, then tap Capture current screen."
                    } else {
                        "I couldn't capture the screen yet. Try again in a moment."
                    }
                )
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
    val coroutineScope = rememberCoroutineScope()
    val messages by viewModel.messages.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val isOfflineMode by viewModel.isOfflineMode.collectAsStateWithLifecycle()
    val serverUrl by viewModel.serverUrl.collectAsStateWithLifecycle()
    val sessionToken by viewModel.sessionToken.collectAsStateWithLifecycle()
    val offlineModeEnabled by viewModel.offlineModeEnabled.collectAsStateWithLifecycle()
    val autoFallback by viewModel.autoFallback.collectAsStateWithLifecycle()
    val spokenRepliesEnabled by viewModel.spokenRepliesEnabled.collectAsStateWithLifecycle()
    val nanoEnabled by viewModel.nanoEnabled.collectAsStateWithLifecycle()
    val inferenceBackend by viewModel.inferenceBackend.collectAsStateWithLifecycle()
    val screenShareActive by viewModel.screenShareActive.collectAsStateWithLifecycle()
    val screenShareStatus by viewModel.screenShareStatus.collectAsStateWithLifecycle()
    val screenSharePreview by viewModel.screenSharePreview.collectAsStateWithLifecycle()

    var messageText by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var isSettingsOpen by remember { mutableStateOf(false) }
    var pendingServerUrl by remember { mutableStateOf(serverUrl) }
    var pendingSessionToken by remember { mutableStateOf(sessionToken) }
    var pendingOfflineMode by remember { mutableStateOf(offlineModeEnabled) }
    var pendingAutoFallback by remember { mutableStateOf(autoFallback) }
    var pendingSpokenReplies by remember { mutableStateOf(spokenRepliesEnabled) }
    var pendingNanoEnabled by remember { mutableStateOf(nanoEnabled) }
    var lastSpokenAssistantMessageId by remember { mutableStateOf<Long?>(null) }
    var pendingAttachmentPrompt by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val ttsPlayer = remember(context) { MillaTtsPlayer(context) }
    DisposableEffect(Unit) { onDispose { ttsPlayer.release() } }
    val locationContextProvider = remember(context) {
        LocationContextProvider(context.applicationContext)
    }

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

    val cameraCaptureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap == null) {
            localError = "Camera capture was cancelled."
            return@rememberLauncherForActivityResult
        }

        coroutineScope.launch {
            val imageData = bitmapToDataUrl(bitmap)
            val prompt = pendingAttachmentPrompt.ifBlank {
                "Analyze this camera photo and help me with what you see."
            }
            viewModel.sendVisualMessage(prompt, imageData)
            pendingAttachmentPrompt = ""
            messageText = ""
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            localError = "Camera permission is required to take a photo."
            return@rememberLauncherForActivityResult
        }

        cameraCaptureLauncher.launch(null)
    }

    var pendingLocationPrompt by remember { mutableStateOf("") }

    val sendCurrentLocationContext = {
        coroutineScope.launch {
            val locationSummary = withContext(Dispatchers.IO) {
                locationContextProvider.getCurrentLocationSummary()
            }
            if (locationSummary == null) {
                localError = "I couldn't determine your current location yet."
                return@launch
            }

            viewModel.sendLocationAwareMessage(pendingLocationPrompt, locationSummary)
            messageText = ""
            pendingLocationPrompt = ""
            localError = null
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.none { it }) {
            localError = "Location permission is required before I can use your current location."
            pendingLocationPrompt = ""
            return@rememberLauncherForActivityResult
        }

        sendCurrentLocationContext()
    }

    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) {
            return@rememberLauncherForActivityResult
        }

        coroutineScope.launch {
            when (val payload = withContext(Dispatchers.IO) { readAttachment(context, uri) }) {
                null -> {
                    localError = "I couldn't read that file yet."
                }
                is AttachmentPayload.Document -> {
                    viewModel.sendDocumentMessage(
                        fileName = payload.fileName,
                        extractedText = payload.text,
                        userPrompt = pendingAttachmentPrompt
                    )
                    pendingAttachmentPrompt = ""
                    messageText = ""
                }
                is AttachmentPayload.Visual -> {
                    val prompt = pendingAttachmentPrompt.ifBlank {
                        "Analyze the selected file and help me with what you see."
                    }
                    viewModel.sendVisualMessage(prompt, payload.imageData)
                    pendingAttachmentPrompt = ""
                    messageText = ""
                }
            }
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    LaunchedEffect(
        isSettingsOpen,
        serverUrl,
        sessionToken,
        offlineModeEnabled,
        autoFallback,
        spokenRepliesEnabled,
        nanoEnabled
    ) {
        if (isSettingsOpen) {
            pendingServerUrl = serverUrl
            pendingSessionToken = sessionToken
            pendingOfflineMode = offlineModeEnabled
            pendingAutoFallback = autoFallback
            pendingSpokenReplies = spokenRepliesEnabled
            pendingNanoEnabled = nanoEnabled
        }
    }

    LaunchedEffect(messages, spokenRepliesEnabled) {
        val latestAssistantMessage = messages.lastOrNull { it.role == "assistant" } ?: return@LaunchedEffect
        if (!spokenRepliesEnabled || latestAssistantMessage.id == lastSpokenAssistantMessageId) {
            return@LaunchedEffect
        }

        lastSpokenAssistantMessageId = latestAssistantMessage.id
        ttsPlayer.speak(
            text = latestAssistantMessage.content,
            serverUrl = serverUrl,
            useServer = !offlineModeEnabled && !isOfflineMode
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
                                isOfflineMode -> "Offline · ${inferenceBackend.replace("-", " ")}"
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
                            pendingAttachmentPrompt = messageText.trim()
                            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Filled.PhotoCamera,
                            contentDescription = "Take a photo",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(
                        onClick = {
                            localError = null
                            pendingAttachmentPrompt = messageText.trim()
                            documentPickerLauncher.launch(
                                arrayOf("image/*", "text/*", "application/json", "application/pdf")
                            )
                        },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Filled.AttachFile,
                            contentDescription = "Choose an image or document",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
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
                    IconButton(
                        onClick = {
                            localError = null
                            pendingLocationPrompt = messageText.trim()
                            val hasLocationPermission =
                                ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.ACCESS_FINE_LOCATION
                                ) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
                                    ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    ) == android.content.pm.PackageManager.PERMISSION_GRANTED

                            if (hasLocationPermission) {
                                sendCurrentLocationContext()
                            } else {
                                locationPermissionLauncher.launch(
                                    arrayOf(
                                        Manifest.permission.ACCESS_FINE_LOCATION,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                    )
                                )
                            }
                        },
                        enabled = !isLoading
                    ) {
                        Icon(
                            imageVector = Icons.Filled.LocationOn,
                            contentDescription = "Share current location for this message",
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
                                pendingAttachmentPrompt = ""
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
                        colors = listOf(Color(0xFF0A0A0F), Color(0xFF0D0D1A))
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
            sessionToken = pendingSessionToken,
            offlineModeEnabled = pendingOfflineMode,
            autoFallback = pendingAutoFallback,
            spokenRepliesEnabled = pendingSpokenReplies,
            nanoEnabled = pendingNanoEnabled,
            onServerUrlChange = { pendingServerUrl = it },
            onSessionTokenChange = { pendingSessionToken = it },
            onOfflineModeChange = { pendingOfflineMode = it },
            onAutoFallbackChange = { pendingAutoFallback = it },
            onSpokenRepliesChange = { pendingSpokenReplies = it },
            onNanoEnabledChange = { pendingNanoEnabled = it },
            onDismiss = { isSettingsOpen = false },
            onSave = {
                viewModel.updateServerUrl(pendingServerUrl)
                viewModel.updateSessionToken(pendingSessionToken)
                viewModel.setOfflineModeEnabled(pendingOfflineMode)
                viewModel.setAutoFallback(pendingAutoFallback)
                viewModel.setSpokenRepliesEnabled(pendingSpokenReplies)
                viewModel.setNanoEnabled(pendingNanoEnabled)
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

private sealed interface AttachmentPayload {
    data class Visual(val imageData: String) : AttachmentPayload
    data class Document(val fileName: String, val text: String) : AttachmentPayload
}

private fun bitmapToDataUrl(bitmap: Bitmap): String {
    val scaledBitmap = if (bitmap.width > 1440) {
        val scaledHeight = (bitmap.height * (1440f / bitmap.width)).toInt().coerceAtLeast(1)
        Bitmap.createScaledBitmap(bitmap, 1440, scaledHeight, true)
    } else {
        bitmap
    }

    val outputStream = ByteArrayOutputStream()
    scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
    if (scaledBitmap !== bitmap) {
        scaledBitmap.recycle()
    }

    return "data:image/jpeg;base64,${
        Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
    }"
}

private fun loadImageFromUri(context: android.content.Context, uri: Uri): String? {
    return context.contentResolver.openInputStream(uri)?.use { inputStream ->
        val bitmap = BitmapFactory.decodeStream(inputStream) ?: return null
        try {
            bitmapToDataUrl(bitmap)
        } finally {
            bitmap.recycle()
        }
    }
}

private fun readAttachment(context: android.content.Context, uri: Uri): AttachmentPayload? {
    val contentResolver = context.contentResolver
    val mimeType = contentResolver.getType(uri).orEmpty()
    val fileName = queryDisplayName(context, uri) ?: "selected file"

    return when {
        mimeType.startsWith("image/") -> {
            loadImageFromUri(context, uri)?.let(AttachmentPayload::Visual)
        }
        mimeType.startsWith("text/") || mimeType.contains("json") || mimeType.contains("xml") -> {
            val text = contentResolver.openInputStream(uri)?.bufferedReader()?.use { reader ->
                reader.readText().take(24_000)
            }
            text?.let { AttachmentPayload.Document(fileName, it) }
        }
        mimeType == "application/pdf" -> {
            renderPdfToDataUrl(context, uri)?.let(AttachmentPayload::Visual)
        }
        else -> null
    }
}

private fun renderPdfToDataUrl(context: android.content.Context, uri: Uri): String? {
    val fileDescriptor = context.contentResolver.openFileDescriptor(uri, "r") ?: return null
    return fileDescriptor.use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
            if (renderer.pageCount == 0) {
                return null
            }
            renderer.openPage(0).use { page ->
                val bitmap = Bitmap.createBitmap(
                    page.width.coerceAtLeast(1),
                    page.height.coerceAtLeast(1),
                    Bitmap.Config.ARGB_8888
                )
                try {
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bitmapToDataUrl(bitmap)
                } finally {
                    bitmap.recycle()
                }
            }
        }
    }
}

private fun queryDisplayName(context: android.content.Context, uri: Uri): String? {
    val projection = arrayOf(android.provider.OpenableColumns.DISPLAY_NAME)
    return context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
        val columnIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        if (columnIndex == -1 || !cursor.moveToFirst()) {
            null
        } else {
            cursor.getString(columnIndex)
        }
    }
}

@Composable
private fun SettingsDialog(
    serverUrl: String,
    sessionToken: String,
    offlineModeEnabled: Boolean,
    autoFallback: Boolean,
    spokenRepliesEnabled: Boolean,
    nanoEnabled: Boolean,
    onServerUrlChange: (String) -> Unit,
    onSessionTokenChange: (String) -> Unit,
    onOfflineModeChange: (Boolean) -> Unit,
    onAutoFallbackChange: (Boolean) -> Unit,
    onSpokenRepliesChange: (Boolean) -> Unit,
    onNanoEnabledChange: (Boolean) -> Unit,
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
                OutlinedTextField(
                    value = sessionToken,
                    onValueChange = onSessionTokenChange,
                    label = { Text("Session token") },
                    placeholder = { Text("Optional bearer token for shared account sync") },
                    supportingText = {
                        Text("Paste the same session token used by the dashboard/mobile app to sync the exact same user thread.")
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
                SettingsToggleRow(
                    label = "Gemma Nano (Tier 0)",
                    description = "Use Gemma Nano for ultra-fast offline responses (~60ms). Disable for complex queries that need the full Gemma-3 1B model.",
                    checked = nanoEnabled,
                    onCheckedChange = onNanoEnabledChange
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
