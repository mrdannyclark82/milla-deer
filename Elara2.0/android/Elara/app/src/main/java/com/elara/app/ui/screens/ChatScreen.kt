package com.elara.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.elara.app.data.models.ToolMode
import com.elara.app.ui.components.*
import com.elara.app.ui.theme.*
import com.elara.app.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onNavigateToDashboard: () -> Unit,
    onNavigateToCreativeStudio: () -> Unit,
    onNavigateToSandbox: () -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val messages by viewModel.messages.collectAsState()
    val isThinking by viewModel.isThinking.collectAsState()
    val thoughtProcess by viewModel.thoughtProcess.collectAsState()
    val selectedTool by viewModel.selectedTool.collectAsState()
    val attachments by viewModel.attachments.collectAsState()

    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Auto scroll to bottom on new messages
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Elara")
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = EmeraldPrimary.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = "v3.0",
                                style = MaterialTheme.typography.labelSmall,
                                color = EmeraldPrimary,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateToDashboard) {
                        Icon(
                            imageVector = Icons.Default.Dashboard,
                            contentDescription = "Dashboard"
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToSandbox) {
                        Icon(
                            imageVector = Icons.Default.Code,
                            contentDescription = "Sandbox",
                            tint = PurpleAccent
                        )
                    }
                    IconButton(onClick = onNavigateToCreativeStudio) {
                        Icon(
                            imageVector = Icons.Default.Palette,
                            contentDescription = "Creative Studio",
                            tint = PinkAccent
                        )
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            ChatInputBar(
                inputText = inputText,
                onInputChange = { inputText = it },
                selectedTool = selectedTool,
                onToolSelected = { viewModel.setSelectedTool(it) },
                onSend = {
                    viewModel.sendMessage(inputText)
                    inputText = ""
                },
                onOpenSandbox = onNavigateToSandbox,
                onOpenStudio = onNavigateToCreativeStudio,
                isThinking = isThinking,
                attachmentsCount = attachments.size
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.background
                        )
                    )
                )
        ) {
            // Avatar Area
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.3f)
            ) {
                AvatarView(
                    isSpeaking = isThinking,
                    mood = if (isThinking) "thinking" else "neutral"
                )
            }

            // Chat Area
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.7f)
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                MaterialTheme.colorScheme.background.copy(alpha = 0.9f),
                                MaterialTheme.colorScheme.background
                            )
                        )
                    )
            ) {
                // Thought Logger
                ThoughtLogger(
                    thoughtText = thoughtProcess,
                    isThinking = isThinking
                )

                // Messages
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    items(messages, key = { it.id }) { message ->
                        MessageItem(message = message)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    inputText: String,
    onInputChange: (String) -> Unit,
    selectedTool: ToolMode,
    onToolSelected: (ToolMode) -> Unit,
    onSend: () -> Unit,
    onOpenSandbox: () -> Unit,
    onOpenStudio: () -> Unit,
    isThinking: Boolean,
    attachmentsCount: Int
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 8.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Tool Selector
            ToolSelector(
                selectedTool = selectedTool,
                onToolSelected = onToolSelected
            )

            // Input Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Input Field
                OutlinedTextField(
                    value = inputText,
                    onValueChange = onInputChange,
                    modifier = Modifier.weight(1f),
                    placeholder = {
                        Text(
                            text = when (selectedTool) {
                                ToolMode.IMAGE_GEN -> "Describe the image to generate..."
                                ToolMode.VIDEO_GEN -> "Describe the video..."
                                ToolMode.SEARCH -> "Search for information..."
                                ToolMode.MAPS -> "Ask about locations..."
                                else -> "Message Elara..."
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    leadingIcon = {
                        if (attachmentsCount > 0) {
                            Badge(
                                containerColor = EmeraldPrimary
                            ) {
                                Text("$attachmentsCount")
                            }
                        }
                    },
                    trailingIcon = {
                        Row {
                            IconButton(onClick = onOpenSandbox) {
                                Icon(
                                    imageVector = Icons.Default.Code,
                                    contentDescription = "Sandbox",
                                    tint = PurpleAccent
                                )
                            }
                            IconButton(onClick = onOpenStudio) {
                                Icon(
                                    imageVector = Icons.Default.Palette,
                                    contentDescription = "Studio",
                                    tint = PinkAccent
                                )
                            }
                        }
                    },
                    shape = RoundedCornerShape(24.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = EmeraldPrimary,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                    ),
                    singleLine = true
                )

                // Send Button
                FloatingActionButton(
                    onClick = onSend,
                    containerColor = if (inputText.isNotBlank()) EmeraldPrimary else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (inputText.isNotBlank()) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(48.dp)
                ) {
                    if (isThinking) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.ArrowUpward,
                            contentDescription = "Send"
                        )
                    }
                }
            }
        }
    }
}
