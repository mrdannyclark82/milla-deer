package com.elara.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elara.app.data.models.GeneratedImage
import com.elara.app.data.repository.ElaraRepository
import com.elara.app.services.GeminiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class CreativeStudioViewModel @Inject constructor(
    private val geminiService: GeminiService,
    private val repository: ElaraRepository
) : ViewModel() {

    // Available aspect ratios
    val aspectRatios = listOf("1:1", "16:9", "9:16", "3:4", "4:3")

    // Available models
    val models = listOf(
        ModelOption("gemini-pro-image", "Gemini 3 Pro", "High Fidelity"),
        ModelOption("imagen-3", "Imagen 3", "Photorealistic")
    )

    // State
    private val _images = MutableStateFlow<List<GeneratedImage>>(emptyList())
    val images: StateFlow<List<GeneratedImage>> = _images.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _selectedAspectRatio = MutableStateFlow("1:1")
    val selectedAspectRatio: StateFlow<String> = _selectedAspectRatio.asStateFlow()

    private val _selectedModel = MutableStateFlow(models[0])
    val selectedModel: StateFlow<ModelOption> = _selectedModel.asStateFlow()

    private val _selectedImage = MutableStateFlow<GeneratedImage?>(null)
    val selectedImage: StateFlow<GeneratedImage?> = _selectedImage.asStateFlow()

    private val _isCompareMode = MutableStateFlow(false)
    val isCompareMode: StateFlow<Boolean> = _isCompareMode.asStateFlow()

    private val _compareSelection = MutableStateFlow<List<String>>(emptyList())
    val compareSelection: StateFlow<List<String>> = _compareSelection.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        loadImages()
    }

    private fun loadImages() {
        viewModelScope.launch {
            repository.getAllGeneratedImages().collect { savedImages ->
                _images.value = savedImages
            }
        }
    }

    fun setAspectRatio(ratio: String) {
        _selectedAspectRatio.value = ratio
    }

    fun setModel(model: ModelOption) {
        _selectedModel.value = model
    }

    fun selectImage(image: GeneratedImage?) {
        _selectedImage.value = image
    }

    fun toggleCompareMode() {
        _isCompareMode.value = !_isCompareMode.value
        if (!_isCompareMode.value) {
            _compareSelection.value = emptyList()
        }
    }

    fun toggleCompareSelection(imageId: String) {
        val current = _compareSelection.value.toMutableList()
        if (current.contains(imageId)) {
            current.remove(imageId)
        } else {
            if (current.size >= 2) {
                current.removeAt(0)
            }
            current.add(imageId)
        }
        _compareSelection.value = current
    }

    fun generateImage(prompt: String) {
        if (prompt.isBlank() || _isGenerating.value) return

        viewModelScope.launch {
            _isGenerating.value = true
            _errorMessage.value = null

            try {
                // Note: Real image generation requires server-side Gemini Pro Image API
                // For demo, we'll create a placeholder entry
                // In production, this would call a backend service

                // Simulate generation delay
                kotlinx.coroutines.delay(2000)

                // Create placeholder image
                // In production, this would be the actual generated image URL
                val newImage = GeneratedImage(
                    id = UUID.randomUUID().toString(),
                    url = "https://via.placeholder.com/512x512.png?text=${prompt.take(20).replace(" ", "+")}",
                    prompt = prompt,
                    aspectRatio = _selectedAspectRatio.value,
                    model = _selectedModel.value.id,
                    timestamp = System.currentTimeMillis()
                )

                _images.value = listOf(newImage) + _images.value
                repository.saveGeneratedImage(newImage)

                _errorMessage.value = "Note: Full image generation requires Gemini Pro Image API backend integration."

            } catch (e: Exception) {
                _errorMessage.value = "Failed to generate image: ${e.message}"
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun deleteImage(imageId: String) {
        viewModelScope.launch {
            repository.deleteGeneratedImage(imageId)
            _images.value = _images.value.filter { it.id != imageId }
            if (_selectedImage.value?.id == imageId) {
                _selectedImage.value = null
            }
            _compareSelection.value = _compareSelection.value.filter { it != imageId }
        }
    }

    fun remixPrompt(image: GeneratedImage) {
        _selectedAspectRatio.value = image.aspectRatio
        _selectedModel.value = models.find { it.id == image.model } ?: models[0]
        _selectedImage.value = null
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun getCompareImages(): List<GeneratedImage> {
        return _compareSelection.value.mapNotNull { id ->
            _images.value.find { it.id == id }
        }
    }
}

data class ModelOption(
    val id: String,
    val name: String,
    val description: String
)
