package com.elara.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elara.app.data.models.GitHubNode
import com.elara.app.data.models.SandboxFile
import com.elara.app.data.repository.ElaraRepository
import com.elara.app.services.GeminiService
import com.elara.app.services.GitHubService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SandboxViewModel @Inject constructor(
    private val geminiService: GeminiService,
    private val gitHubService: GitHubService,
    private val repository: ElaraRepository
) : ViewModel() {

    // Default files
    private val defaultFiles = mapOf(
        "index.html" to SandboxFile(
            name = "index.html",
            content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Elara Sandbox</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Hello from Elara Sandbox!</h1>
    <p>Start coding here...</p>
    <script src="script.js"></script>
</body>
</html>""".trimIndent(),
            language = "html"
        ),
        "style.css" to SandboxFile(
            name = "style.css",
            content = """body {
    font-family: system-ui, -apple-system, sans-serif;
    padding: 20px;
    color: #333;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
}

h1 {
    color: white;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

p {
    color: rgba(255,255,255,0.9);
}""".trimIndent(),
            language = "css"
        ),
        "script.js" to SandboxFile(
            name = "script.js",
            content = """console.log("Hello from Elara Sandbox!");

// Add your JavaScript here
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
});""".trimIndent(),
            language = "javascript"
        )
    )

    // State
    private val _files = MutableStateFlow<Map<String, SandboxFile>>(defaultFiles)
    val files: StateFlow<Map<String, SandboxFile>> = _files.asStateFlow()

    private val _activeFile = MutableStateFlow("index.html")
    val activeFile: StateFlow<String> = _activeFile.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _consoleLogs = MutableStateFlow<List<ConsoleLog>>(emptyList())
    val consoleLogs: StateFlow<List<ConsoleLog>> = _consoleLogs.asStateFlow()

    // GitHub state
    private val _repoUrl = MutableStateFlow("")
    val repoUrl: StateFlow<String> = _repoUrl.asStateFlow()

    private val _currentRepo = MutableStateFlow<Pair<String, String>?>(null)
    val currentRepo: StateFlow<Pair<String, String>?> = _currentRepo.asStateFlow()

    private val _fileTree = MutableStateFlow<List<GitHubNode>>(emptyList())
    val fileTree: StateFlow<List<GitHubNode>> = _fileTree.asStateFlow()

    private val _isLoadingRepo = MutableStateFlow(false)
    val isLoadingRepo: StateFlow<Boolean> = _isLoadingRepo.asStateFlow()

    private val _gitHubToken = MutableStateFlow("")
    val gitHubToken: StateFlow<String> = _gitHubToken.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        loadSavedFiles()
        loadGitHubToken()
    }

    private fun loadSavedFiles() {
        viewModelScope.launch {
            repository.getAllSandboxFiles().collect { savedFiles ->
                if (savedFiles.isNotEmpty()) {
                    _files.value = savedFiles.associateBy { it.name }
                }
            }
        }
    }

    private fun loadGitHubToken() {
        viewModelScope.launch {
            repository.getSettings()?.let { settings ->
                settings.githubToken?.let { token ->
                    _gitHubToken.value = token
                    gitHubService.setToken(token)
                }
            }
        }
    }

    fun setActiveFile(fileName: String) {
        if (_files.value.containsKey(fileName)) {
            _activeFile.value = fileName
        }
    }

    fun updateFileContent(content: String) {
        val currentFile = _files.value[_activeFile.value] ?: return
        val updatedFile = currentFile.copy(content = content)
        _files.value = _files.value + (currentFile.name to updatedFile)

        // Save to database
        viewModelScope.launch {
            repository.saveSandboxFile(updatedFile)
        }
    }

    fun createFile(name: String): Boolean {
        if (name.isBlank() || _files.value.containsKey(name)) {
            return false
        }

        val language = getLanguageFromExtension(name)
        val newFile = SandboxFile(name = name, content = "", language = language)
        _files.value = _files.value + (name to newFile)
        _activeFile.value = name

        viewModelScope.launch {
            repository.saveSandboxFile(newFile)
        }

        return true
    }

    fun deleteFile(name: String): Boolean {
        if (name == "index.html") return false // Can't delete entry file

        _files.value = _files.value - name
        if (_activeFile.value == name) {
            _activeFile.value = "index.html"
        }

        viewModelScope.launch {
            repository.deleteSandboxFile(name)
        }

        return true
    }

    fun generateCode(prompt: String) {
        if (prompt.isBlank() || _isGenerating.value) return

        viewModelScope.launch {
            _isGenerating.value = true
            addLog(ConsoleLogLevel.INFO, "Generating code for ${_activeFile.value}...")

            try {
                val language = _files.value[_activeFile.value]?.language ?: "text"
                val generatedCode = geminiService.generateCode(prompt, language)
                updateFileContent(generatedCode)
                addLog(ConsoleLogLevel.INFO, "Generation complete.")
            } catch (e: Exception) {
                addLog(ConsoleLogLevel.ERROR, "Code generation failed: ${e.message}")
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun runCode() {
        clearLogs()
        addLog(ConsoleLogLevel.INFO, "Running code...")
        // In a real implementation, this would execute the code in a WebView
        // For now, we just log the action
        addLog(ConsoleLogLevel.LOG, "Code executed. Check preview.")
    }

    // GitHub operations
    fun setRepoUrl(url: String) {
        _repoUrl.value = url
    }

    fun setGitHubToken(token: String) {
        _gitHubToken.value = token
        gitHubService.setToken(token)
        viewModelScope.launch {
            repository.updateGithubToken(token)
        }
    }

    fun loadRepository() {
        val parsed = gitHubService.parseRepoString(_repoUrl.value)
        if (parsed == null) {
            _errorMessage.value = "Invalid GitHub URL. Use format: owner/repo"
            return
        }

        viewModelScope.launch {
            _isLoadingRepo.value = true
            _errorMessage.value = null

            gitHubService.fetchRepoContents(parsed.first, parsed.second)
                .onSuccess { nodes ->
                    _fileTree.value = nodes
                    _currentRepo.value = parsed
                    addLog(ConsoleLogLevel.INFO, "Loaded repository: ${parsed.first}/${parsed.second}")
                }
                .onFailure { error ->
                    _errorMessage.value = error.message ?: "Failed to load repository"
                    addLog(ConsoleLogLevel.ERROR, "GitHub error: ${error.message}")
                }

            _isLoadingRepo.value = false
        }
    }

    fun loadGitHubFile(node: GitHubNode) {
        if (node.type == "tree") {
            // Load directory contents
            viewModelScope.launch {
                _currentRepo.value?.let { repo ->
                    _isLoadingRepo.value = true
                    gitHubService.fetchRepoContents(repo.first, repo.second, node.path)
                        .onSuccess { nodes ->
                            _fileTree.value = nodes
                        }
                        .onFailure { error ->
                            _errorMessage.value = error.message
                        }
                    _isLoadingRepo.value = false
                }
            }
        } else {
            // Load file content
            viewModelScope.launch {
                gitHubService.fetchFileContent(node.url)
                    .onSuccess { content ->
                        val fileName = node.path.substringAfterLast("/")
                        val language = getLanguageFromExtension(fileName)
                        val newFile = SandboxFile(
                            name = fileName,
                            content = content,
                            language = language
                        )
                        _files.value = _files.value + (fileName to newFile)
                        _activeFile.value = fileName
                        repository.saveSandboxFile(newFile)
                    }
                    .onFailure { error ->
                        _errorMessage.value = "Failed to load file: ${error.message}"
                    }
            }
        }
    }

    // Console operations
    fun addLog(level: ConsoleLogLevel, message: String) {
        val log = ConsoleLog(
            level = level,
            message = message,
            timestamp = System.currentTimeMillis()
        )
        _consoleLogs.value = _consoleLogs.value + log
    }

    fun clearLogs() {
        _consoleLogs.value = emptyList()
    }

    fun clearError() {
        _errorMessage.value = null
    }

    // Helper functions
    private fun getLanguageFromExtension(fileName: String): String {
        return when {
            fileName.endsWith(".html") -> "html"
            fileName.endsWith(".css") -> "css"
            fileName.endsWith(".js") -> "javascript"
            fileName.endsWith(".ts") || fileName.endsWith(".tsx") -> "typescript"
            fileName.endsWith(".json") -> "json"
            fileName.endsWith(".kt") -> "kotlin"
            fileName.endsWith(".java") -> "java"
            fileName.endsWith(".py") -> "python"
            else -> "text"
        }
    }

    fun getCurrentFileContent(): String {
        return _files.value[_activeFile.value]?.content ?: ""
    }

    fun bundlePreview(): String {
        val html = _files.value["index.html"]?.content ?: ""
        val css = _files.value["style.css"]?.content ?: ""
        val js = _files.value["script.js"]?.content ?: ""

        var bundled = html

        // Inject CSS
        bundled = if (bundled.contains("</head>")) {
            bundled.replace("</head>", "<style>$css</style></head>")
        } else {
            "$bundled<style>$css</style>"
        }

        // Inject JS
        bundled = if (bundled.contains("</body>")) {
            bundled.replace("</body>", "<script>$js</script></body>")
        } else {
            "$bundled<script>$js</script>"
        }

        return bundled
    }
}

data class ConsoleLog(
    val level: ConsoleLogLevel,
    val message: String,
    val timestamp: Long
)

enum class ConsoleLogLevel {
    LOG, INFO, WARN, ERROR
}
