package com.elara.app.ui.screens

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import com.elara.app.data.models.SandboxFile
import com.elara.app.ui.theme.*
import com.elara.app.viewmodel.ConsoleLog
import com.elara.app.viewmodel.ConsoleLogLevel
import com.elara.app.viewmodel.SandboxViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SandboxScreen(
    onNavigateBack: () -> Unit,
    viewModel: SandboxViewModel = hiltViewModel()
) {
    val files by viewModel.files.collectAsState()
    val activeFile by viewModel.activeFile.collectAsState()
    val isGenerating by viewModel.isGenerating.collectAsState()
    val consoleLogs by viewModel.consoleLogs.collectAsState()
    val fileTree by viewModel.fileTree.collectAsState()
    val isLoadingRepo by viewModel.isLoadingRepo.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    var showPreview by remember { mutableStateOf(false) }
    var showConsole by remember { mutableStateOf(true) }
    var showGenerateDialog by remember { mutableStateOf(false) }
    var showNewFileDialog by remember { mutableStateOf(false) }
    var showGitHubDialog by remember { mutableStateOf(false) }
    var generatePrompt by remember { mutableStateOf("") }
    var newFileName by remember { mutableStateOf("") }
    var repoUrl by remember { mutableStateOf("") }
    var gitHubToken by remember { mutableStateOf("") }

    // Generate Dialog
    if (showGenerateDialog) {
        AlertDialog(
            onDismissRequest = { showGenerateDialog = false },
            title = { Text("AI Code Generation") },
            text = {
                OutlinedTextField(
                    value = generatePrompt,
                    onValueChange = { generatePrompt = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Describe what you want to create...") },
                    minLines = 3
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.generateCode(generatePrompt)
                        showGenerateDialog = false
                        generatePrompt = ""
                    },
                    enabled = generatePrompt.isNotBlank() && !isGenerating
                ) {
                    Text(if (isGenerating) "Generating..." else "Generate")
                }
            },
            dismissButton = {
                TextButton(onClick = { showGenerateDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // New File Dialog
    if (showNewFileDialog) {
        AlertDialog(
            onDismissRequest = { showNewFileDialog = false },
            title = { Text("New File") },
            text = {
                OutlinedTextField(
                    value = newFileName,
                    onValueChange = { newFileName = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("filename.ext") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (viewModel.createFile(newFileName)) {
                            showNewFileDialog = false
                            newFileName = ""
                        }
                    },
                    enabled = newFileName.isNotBlank()
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { showNewFileDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // GitHub Dialog
    if (showGitHubDialog) {
        AlertDialog(
            onDismissRequest = { showGitHubDialog = false },
            title = { Text("GitHub Integration") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = repoUrl,
                        onValueChange = { repoUrl = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Repository URL") },
                        placeholder = { Text("owner/repo") },
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = gitHubToken,
                        onValueChange = { gitHubToken = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Personal Access Token (optional)") },
                        placeholder = { Text("ghp_...") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.setRepoUrl(repoUrl)
                        if (gitHubToken.isNotBlank()) {
                            viewModel.setGitHubToken(gitHubToken)
                        }
                        viewModel.loadRepository()
                        showGitHubDialog = false
                    },
                    enabled = repoUrl.isNotBlank() && !isLoadingRepo
                ) {
                    Text(if (isLoadingRepo) "Loading..." else "Load")
                }
            },
            dismissButton = {
                TextButton(onClick = { showGitHubDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Code,
                            contentDescription = null,
                            tint = PurpleAccent
                        )
                        Text("Sandbox IDE")
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.runCode() }) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Run",
                            tint = OnlineGreen
                        )
                    }
                    IconButton(onClick = { showGenerateDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = "AI Generate",
                            tint = PurpleAccent
                        )
                    }
                    IconButton(onClick = { showGitHubDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.Cloud,
                            contentDescription = "GitHub"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // File Tabs
            FileTabBar(
                files = files,
                activeFile = activeFile,
                onFileSelect = { viewModel.setActiveFile(it) },
                onNewFile = { showNewFileDialog = true },
                onDeleteFile = { viewModel.deleteFile(it) }
            )

            // Main content area
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                // Code Editor
                Column(
                    modifier = Modifier
                        .weight(if (showPreview) 0.5f else 1f)
                        .fillMaxHeight()
                ) {
                    CodeEditor(
                        content = viewModel.getCurrentFileContent(),
                        onContentChange = { viewModel.updateFileContent(it) },
                        language = files[activeFile]?.language ?: "text",
                        modifier = Modifier.weight(1f)
                    )
                }

                // Preview (if enabled)
                if (showPreview) {
                    Divider(
                        modifier = Modifier
                            .fillMaxHeight()
                            .width(1.dp),
                        color = MaterialTheme.colorScheme.outline
                    )
                    PreviewPane(
                        htmlContent = viewModel.bundlePreview(),
                        modifier = Modifier
                            .weight(0.5f)
                            .fillMaxHeight()
                    )
                }
            }

            // Console
            if (showConsole) {
                Divider()
                ConsolePane(
                    logs = consoleLogs,
                    onClear = { viewModel.clearLogs() },
                    onToggle = { showConsole = false },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                )
            }

            // Bottom toolbar
            BottomToolbar(
                showPreview = showPreview,
                showConsole = showConsole,
                onTogglePreview = { showPreview = !showPreview },
                onToggleConsole = { showConsole = !showConsole },
                fileInfo = "${files[activeFile]?.language ?: "text"} | ${viewModel.getCurrentFileContent().length} chars"
            )
        }
    }
}

@Composable
private fun FileTabBar(
    files: Map<String, SandboxFile>,
    activeFile: String,
    onFileSelect: (String) -> Unit,
    onNewFile: () -> Unit,
    onDeleteFile: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .horizontalScroll(rememberScrollState())
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        files.keys.forEach { fileName ->
            val isActive = fileName == activeFile
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { onFileSelect(fileName) },
                color = if (isActive) MaterialTheme.colorScheme.surface else Color.Transparent,
                shape = RoundedCornerShape(4.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = getFileIcon(fileName),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = fileName,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isActive) PurpleAccent else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (fileName != "index.html" && isActive) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            modifier = Modifier
                                .size(14.dp)
                                .clickable { onDeleteFile(fileName) },
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // New file button
        IconButton(
            onClick = onNewFile,
            modifier = Modifier.size(28.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "New File",
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun CodeEditor(
    content: String,
    onContentChange: (String) -> Unit,
    language: String,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()
    val lines = content.split("\n")

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // Line numbers
        Column(
            modifier = Modifier
                .width(40.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                .verticalScroll(scrollState)
                .padding(vertical = 8.dp),
            horizontalAlignment = Alignment.End
        ) {
            lines.forEachIndexed { index, _ ->
                Text(
                    text = "${index + 1}",
                    style = TextStyle(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    ),
                    modifier = Modifier.padding(end = 8.dp)
                )
            }
        }

        // Code content
        BasicTextField(
            value = content,
            onValueChange = onContentChange,
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .verticalScroll(scrollState)
                .padding(8.dp),
            textStyle = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onBackground
            ),
            cursorBrush = SolidColor(PurpleAccent)
        )
    }
}

@Composable
private fun PreviewPane(
    htmlContent: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = "PREVIEW",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        AndroidView(
            factory = { context ->
                WebView(context).apply {
                    webViewClient = WebViewClient()
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
                }
            },
            update = { webView ->
                webView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}

@Composable
private fun ConsolePane(
    logs: List<ConsoleLog>,
    onClear: () -> Unit,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.background(MaterialTheme.colorScheme.background)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "CONSOLE",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold
            )
            Row {
                TextButton(
                    onClick = onClear,
                    contentPadding = PaddingValues(horizontal = 8.dp)
                ) {
                    Text("Clear", style = MaterialTheme.typography.labelSmall)
                }
                IconButton(
                    onClick = onToggle,
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            items(logs) { log ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
                            .format(Date(log.timestamp)),
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                    )
                    Text(
                        text = log.message,
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = when (log.level) {
                                ConsoleLogLevel.ERROR -> RedAccent
                                ConsoleLogLevel.WARN -> AmberAccent
                                ConsoleLogLevel.INFO -> BlueAccent
                                else -> MaterialTheme.colorScheme.onBackground
                            }
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun BottomToolbar(
    showPreview: Boolean,
    showConsole: Boolean,
    onTogglePreview: () -> Unit,
    onToggleConsole: () -> Unit,
    fileInfo: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = fileInfo,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = showPreview,
                onClick = onTogglePreview,
                label = { Text("Preview", style = MaterialTheme.typography.labelSmall) }
            )
            FilterChip(
                selected = showConsole,
                onClick = onToggleConsole,
                label = { Text("Console", style = MaterialTheme.typography.labelSmall) }
            )
        }
    }
}

private fun getFileIcon(fileName: String): String {
    return when {
        fileName.endsWith(".html") -> "🌐"
        fileName.endsWith(".css") -> "🎨"
        fileName.endsWith(".js") || fileName.endsWith(".ts") -> "📜"
        fileName.endsWith(".json") -> "📦"
        else -> "📄"
    }
}
