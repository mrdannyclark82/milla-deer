package com.elara.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.elara.app.data.models.GeneratedImage
import com.elara.app.ui.theme.*
import com.elara.app.viewmodel.CreativeStudioViewModel
import com.elara.app.viewmodel.ModelOption

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreativeStudioScreen(
    onNavigateBack: () -> Unit,
    viewModel: CreativeStudioViewModel = hiltViewModel()
) {
    val images by viewModel.images.collectAsState()
    val isGenerating by viewModel.isGenerating.collectAsState()
    val selectedAspectRatio by viewModel.selectedAspectRatio.collectAsState()
    val selectedModel by viewModel.selectedModel.collectAsState()
    val selectedImage by viewModel.selectedImage.collectAsState()
    val isCompareMode by viewModel.isCompareMode.collectAsState()
    val compareSelection by viewModel.compareSelection.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    var prompt by remember { mutableStateOf("") }
    var showLightbox by remember { mutableStateOf(false) }
    var showComparison by remember { mutableStateOf(false) }

    // Lightbox Dialog
    if (showLightbox && selectedImage != null) {
        ImageLightbox(
            image = selectedImage!!,
            onDismiss = {
                showLightbox = false
                viewModel.selectImage(null)
            },
            onRemix = {
                viewModel.remixPrompt(selectedImage!!)
                showLightbox = false
                viewModel.selectImage(null)
            },
            onDelete = {
                viewModel.deleteImage(selectedImage!!.id)
                showLightbox = false
            }
        )
    }

    // Comparison Dialog
    if (showComparison && compareSelection.size == 2) {
        ComparisonDialog(
            images = viewModel.getCompareImages(),
            onDismiss = { showComparison = false },
            onRemix = { image ->
                viewModel.remixPrompt(image)
                showComparison = false
                viewModel.toggleCompareMode()
            }
        )
    }

    // Error Snackbar
    errorMessage?.let {
        LaunchedEffect(it) {
            // Auto dismiss after 5 seconds
            kotlinx.coroutines.delay(5000)
            viewModel.clearError()
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
                        Icon(
                            imageVector = Icons.Default.Palette,
                            contentDescription = null,
                            tint = PurpleAccent
                        )
                        Column {
                            Text("Creative Studio")
                            Text(
                                text = "Generative Art & Design",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
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
                    TextButton(
                        onClick = { viewModel.toggleCompareMode() }
                    ) {
                        Text(
                            text = if (isCompareMode) "Exit Compare" else "Compare",
                            color = if (isCompareMode) PurpleAccent else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    if (isCompareMode && compareSelection.size == 2) {
                        Button(
                            onClick = { showComparison = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PurpleAccent
                            )
                        ) {
                            Text("Compare")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        snackbarHost = {
            errorMessage?.let { error ->
                Snackbar(
                    modifier = Modifier.padding(16.dp),
                    action = {
                        TextButton(onClick = { viewModel.clearError() }) {
                            Text("Dismiss")
                        }
                    }
                ) {
                    Text(error)
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Generation Controls
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Prompt Input
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Describe your vision...") },
                        minLines = 2,
                        maxLines = 4,
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Model Selection
                    Text(
                        text = "MODEL PROVIDER",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        viewModel.models.forEach { model ->
                            ModelCard(
                                model = model,
                                isSelected = model == selectedModel,
                                onClick = { viewModel.setModel(model) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    // Aspect Ratio Selection
                    Text(
                        text = "ASPECT RATIO",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        viewModel.aspectRatios.forEach { ratio ->
                            FilterChip(
                                selected = ratio == selectedAspectRatio,
                                onClick = { viewModel.setAspectRatio(ratio) },
                                label = { Text(ratio) },
                                modifier = Modifier.weight(1f),
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PurpleAccent,
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }

                    // Generate Button
                    Button(
                        onClick = { viewModel.generateImage(prompt) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = prompt.isNotBlank() && !isGenerating,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PurpleAccent
                        )
                    ) {
                        if (isGenerating) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Creating...")
                        } else {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Generate Art")
                        }
                    }
                }
            }

            // Gallery
            if (images.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Image,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)
                        )
                        Text(
                            text = "Your canvas is empty.",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                        Text(
                            text = "Start imagining something beautiful.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                        )
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    items(images) { image ->
                        ImageCard(
                            image = image,
                            isCompareMode = isCompareMode,
                            isSelected = compareSelection.contains(image.id),
                            onClick = {
                                if (isCompareMode) {
                                    viewModel.toggleCompareSelection(image.id)
                                } else {
                                    viewModel.selectImage(image)
                                    showLightbox = true
                                }
                            },
                            onDelete = { viewModel.deleteImage(image.id) },
                            onRemix = { viewModel.remixPrompt(image) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ModelCard(
    model: ModelOption,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) PurpleAccent.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surface,
        border = if (isSelected) {
            ButtonDefaults.outlinedButtonBorder.copy(
                brush = androidx.compose.ui.graphics.SolidColor(PurpleAccent)
            )
        } else null
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = model.name,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) PurpleAccent else MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = model.description,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ImageCard(
    image: GeneratedImage,
    isCompareMode: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    onRemix: () -> Unit
) {
    Card(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        border = if (isSelected) {
            ButtonDefaults.outlinedButtonBorder.copy(
                brush = androidx.compose.ui.graphics.SolidColor(PurpleAccent),
                width = 2.dp
            )
        } else null
    ) {
        Box {
            AsyncImage(
                model = image.url,
                contentDescription = image.prompt,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Compare mode indicator
            if (isCompareMode) {
                Box(
                    modifier = Modifier
                        .padding(8.dp)
                        .size(24.dp)
                        .background(
                            color = if (isSelected) PurpleAccent else Color.Black.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .align(Alignment.TopEnd),
                    contentAlignment = Alignment.Center
                ) {
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = "Selected",
                            modifier = Modifier.size(16.dp),
                            tint = Color.White
                        )
                    }
                }
            }

            // Hover overlay (always visible on mobile)
            if (!isCompareMode) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    Color.Transparent,
                                    Color.Black.copy(alpha = 0.7f)
                                )
                            )
                        )
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomStart)
                        .padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = image.prompt,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        maxLines = 2
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color.Black.copy(alpha = 0.5f)
                            ) {
                                Text(
                                    text = image.aspectRatio,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White,
                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(
                                onClick = onRemix,
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Refresh,
                                    contentDescription = "Remix",
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            IconButton(
                                onClick = onDelete,
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = "Delete",
                                    tint = RedAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ImageLightbox(
    image: GeneratedImage,
    onDismiss: () -> Unit,
    onRemix: () -> Unit,
    onDelete: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = {},
        title = null,
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                AsyncImage(
                    model = image.url,
                    contentDescription = image.prompt,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Fit
                )

                Text(
                    text = image.prompt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onRemix,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Remix")
                    }
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PurpleAccent
                        )
                    ) {
                        Text("Close")
                    }
                }
            }
        }
    )
}

@Composable
private fun ComparisonDialog(
    images: List<GeneratedImage>,
    onDismiss: () -> Unit,
    onRemix: (GeneratedImage) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        title = { Text("Image Comparison") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                images.forEach { image ->
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AsyncImage(
                            model = image.url,
                            contentDescription = image.prompt,
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(8.dp)),
                            contentScale = ContentScale.Fit
                        )
                        Text(
                            text = image.prompt,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 2
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "Model: ${if (image.model.contains("imagen")) "Imagen 3" else "Gemini 3 Pro"}",
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = "Ratio: ${image.aspectRatio}",
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                        OutlinedButton(
                            onClick = { onRemix(image) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Remix This")
                        }
                    }
                }
            }
        }
    )
}
