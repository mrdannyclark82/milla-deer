package com.elara.app.data.repository

import com.elara.app.data.database.*
import com.elara.app.data.database.entities.*
import com.elara.app.data.models.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ElaraRepository @Inject constructor(
    private val database: ElaraDatabase
) {
    private val memoryDao = database.memoryDao()
    private val messageDao = database.messageDao()
    private val imageDao = database.generatedImageDao()
    private val growthDao = database.growthEntryDao()
    private val sandboxDao = database.sandboxFileDao()
    private val settingsDao = database.settingsDao()
    private val profileDao = database.userProfileDao()

    // === Memory Operations ===
    suspend fun storeMemory(
        type: String,
        content: String,
        importance: Int = 5,
        tags: List<String> = emptyList(),
        source: String? = null
    ): String {
        val id = "mem_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"
        val memory = MemoryEntity(
            id = id,
            type = type,
            content = content,
            timestamp = System.currentTimeMillis(),
            importance = importance,
            tags = tags,
            source = source
        )
        memoryDao.insertMemory(memory)
        return id
    }

    fun getAllMemories(): Flow<List<MemoryEntity>> = memoryDao.getAllMemories()

    suspend fun searchMemories(query: String): List<MemoryEntity> = memoryDao.searchMemories(query)

    suspend fun pruneOldMemories(daysToKeep: Int = 90, minImportance: Int = 5): Int {
        val cutoffTime = System.currentTimeMillis() - (daysToKeep * 24 * 60 * 60 * 1000L)
        return memoryDao.pruneOldMemories(cutoffTime, minImportance)
    }

    suspend fun clearAllMemories() = memoryDao.clearAllMemories()

    suspend fun getMemoryStats(): MemoryStats {
        val count = memoryDao.getMemoryCount()
        val avgImportance = memoryDao.getAverageImportance() ?: 0f
        return MemoryStats(count, avgImportance)
    }

    // === Message Operations ===
    fun getAllMessages(): Flow<List<Message>> = messageDao.getAllMessages().map { entities ->
        entities.map { it.toMessage() }
    }

    suspend fun saveMessage(message: Message) {
        messageDao.insertMessage(message.toEntity())
    }

    suspend fun getRecentMessages(limit: Int = 10): List<Message> {
        return messageDao.getRecentMessages(limit).map { it.toMessage() }
    }

    suspend fun clearAllMessages() = messageDao.clearAllMessages()

    // === Generated Image Operations ===
    fun getAllGeneratedImages(): Flow<List<GeneratedImage>> = imageDao.getAllImages().map { entities ->
        entities.map { it.toGeneratedImage() }
    }

    suspend fun saveGeneratedImage(image: GeneratedImage) {
        imageDao.insertImage(image.toEntity())
    }

    suspend fun deleteGeneratedImage(id: String) = imageDao.deleteImage(id)

    suspend fun clearAllImages() = imageDao.clearAllImages()

    // === Growth Entry Operations ===
    fun getAllGrowthEntries(): Flow<List<GrowthEntry>> = growthDao.getAllEntries().map { entities ->
        entities.map { it.toGrowthEntry() }
    }

    suspend fun saveGrowthEntry(entry: GrowthEntry) {
        growthDao.insertEntry(entry.toEntity())
    }

    // === Sandbox File Operations ===
    fun getAllSandboxFiles(): Flow<List<SandboxFile>> = sandboxDao.getAllFiles().map { entities ->
        entities.map { SandboxFile(it.name, it.content, it.language) }
    }

    suspend fun saveSandboxFile(file: SandboxFile) {
        sandboxDao.insertFile(
            SandboxFileEntity(
                name = file.name,
                content = file.content,
                language = file.language
            )
        )
    }

    suspend fun deleteSandboxFile(name: String) = sandboxDao.deleteFile(name)

    // === Settings Operations ===
    fun getSettingsFlow(): Flow<SettingsEntity?> = settingsDao.getSettingsFlow()

    suspend fun getSettings(): SettingsEntity? = settingsDao.getSettings()

    suspend fun saveSettings(settings: SettingsEntity) = settingsDao.insertSettings(settings)

    suspend fun updatePersona(persona: PersonaMode) {
        val current = getSettings() ?: SettingsEntity()
        saveSettings(current.copy(persona = persona.name))
    }

    suspend fun updateGithubToken(token: String) {
        val current = getSettings() ?: SettingsEntity()
        saveSettings(current.copy(githubToken = token))
    }

    // === Data Export/Import ===
    suspend fun exportAllData(): String {
        // Simplified export - in production would include all data
        return "{\"version\": 1, \"timestamp\": ${System.currentTimeMillis()}}"
    }
}

data class MemoryStats(
    val totalCount: Int,
    val avgImportance: Float
)

// Extension functions for entity conversion
private fun MessageEntity.toMessage() = Message(
    id = id,
    role = MessageRole.valueOf(role),
    content = content,
    timestamp = timestamp,
    imageUri = imageUri,
    videoUri = videoUri
)

private fun Message.toEntity() = MessageEntity(
    id = id,
    role = role.name,
    content = content,
    timestamp = timestamp,
    imageUri = imageUri,
    videoUri = videoUri
)

private fun GeneratedImageEntity.toGeneratedImage() = GeneratedImage(
    id = id,
    url = url,
    prompt = prompt,
    aspectRatio = aspectRatio,
    model = model,
    timestamp = timestamp
)

private fun GeneratedImage.toEntity() = GeneratedImageEntity(
    id = id,
    url = url,
    prompt = prompt,
    aspectRatio = aspectRatio,
    model = model,
    timestamp = timestamp
)

private fun GrowthEntryEntity.toGrowthEntry() = GrowthEntry(
    id = id,
    type = GrowthType.valueOf(type),
    title = title,
    timestamp = timestamp,
    details = details,
    technicalDetails = technicalDetails
)

private fun GrowthEntry.toEntity() = GrowthEntryEntity(
    id = id,
    type = type.name,
    title = title,
    timestamp = timestamp,
    details = details,
    technicalDetails = technicalDetails
)
