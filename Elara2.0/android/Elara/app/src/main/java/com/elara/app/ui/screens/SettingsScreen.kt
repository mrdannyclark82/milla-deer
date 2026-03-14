package com.elara.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.elara.app.data.models.PersonaMode
import com.elara.app.ui.theme.*
import com.elara.app.viewmodel.ChatViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val currentPersona by viewModel.currentPersona.collectAsState()

    var showClearDataDialog by remember { mutableStateOf(false) }

    // Clear Data Dialog
    if (showClearDataDialog) {
        AlertDialog(
            onDismissRequest = { showClearDataDialog = false },
            icon = {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    tint = RedAccent
                )
            },
            title = { Text("Clear All Data") },
            text = {
                Text("This will permanently delete all messages, memories, and generated content. This action cannot be undone.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearAllMessages()
                        showClearDataDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = RedAccent
                    )
                ) {
                    Text("Delete All")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDataDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // App Info
            item {
                SettingsSection(title = "About") {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Elara",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = EmeraldPrimary.copy(alpha = 0.2f)
                                ) {
                                    Text(
                                        text = "v3.0.0",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = EmeraldPrimary,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                            Text(
                                text = "AI Virtual Assistant powered by Google Gemini",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Divider(
                                modifier = Modifier.padding(vertical = 8.dp),
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                            )
                            InfoRow("Neural Core", "Gemini 3 Pro")
                            InfoRow("Platform", "Android")
                            InfoRow("Build Type", "Release")
                        }
                    }
                }
            }

            // Persona Settings
            item {
                SettingsSection(title = "Persona") {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "Select how Elara responds to you",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            PersonaMode.values().forEach { persona ->
                                PersonaOption(
                                    persona = persona,
                                    isSelected = persona == currentPersona,
                                    onClick = { viewModel.setPersona(persona) }
                                )
                            }
                        }
                    }
                }
            }

            // Features
            item {
                SettingsSection(title = "Features") {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        )
                    ) {
                        Column {
                            FeatureItem(
                                icon = Icons.Default.Psychology,
                                title = "Chat",
                                description = "Conversational AI with context understanding",
                                color = ChatColor
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.Search,
                                title = "Search",
                                description = "Web search powered by Google",
                                color = SearchColor
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.Place,
                                title = "Maps",
                                description = "Location services and navigation",
                                color = MapsColor
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.Image,
                                title = "Imagine",
                                description = "AI image generation",
                                color = ImageGenColor
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.VideoLibrary,
                                title = "Veo",
                                description = "AI video generation",
                                color = VideoGenColor
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.Code,
                                title = "Sandbox",
                                description = "Integrated development environment",
                                color = PurpleAccent
                            )
                            Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            FeatureItem(
                                icon = Icons.Default.Palette,
                                title = "Creative Studio",
                                description = "Art generation platform",
                                color = PinkAccent
                            )
                        }
                    }
                }
            }

            // Data Management
            item {
                SettingsSection(title = "Data Management") {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            OutlinedButton(
                                onClick = { /* Export data */ },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = BlueAccent
                                )
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Download,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Export Memory Database")
                            }

                            OutlinedButton(
                                onClick = { /* Import data */ },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = OnlineGreen
                                )
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Upload,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Import Memory Database")
                            }

                            OutlinedButton(
                                onClick = { showClearDataDialog = true },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = RedAccent
                                ),
                                border = ButtonDefaults.outlinedButtonBorder.copy(
                                    brush = androidx.compose.ui.graphics.SolidColor(
                                        RedAccent.copy(alpha = 0.5f)
                                    )
                                )
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Clear All Data")
                            }
                        }
                    }
                }
            }

            // Credits
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Built with ❤️ using Google Gemini",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Bold
        )
        content()
    }
}

@Composable
private fun InfoRow(
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = EmeraldPrimary,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun PersonaOption(
    persona: PersonaMode,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) EmeraldPrimary.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface,
        border = if (isSelected) {
            ButtonDefaults.outlinedButtonBorder.copy(
                brush = androidx.compose.ui.graphics.SolidColor(EmeraldPrimary.copy(alpha = 0.5f))
            )
        } else null
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = persona.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                    color = if (isSelected) EmeraldPrimary else MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = persona.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = EmeraldPrimary
                )
            }
        }
    }
}

@Composable
private fun FeatureItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    color: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(24.dp)
        )
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
