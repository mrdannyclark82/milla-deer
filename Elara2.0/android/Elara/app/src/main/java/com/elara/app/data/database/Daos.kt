package com.elara.app.data.database

import androidx.room.*
import com.elara.app.data.database.entities.*
import kotlinx.coroutines.flow.Flow

@Dao
interface MemoryDao {
    // Memory operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMemory(memory: MemoryEntity)

    @Query("SELECT * FROM memories WHERE id = :id")
    suspend fun getMemory(id: String): MemoryEntity?

    @Query("SELECT * FROM memories ORDER BY timestamp DESC")
    fun getAllMemories(): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memories WHERE type = :type ORDER BY timestamp DESC")
    fun getMemoriesByType(type: String): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memories WHERE importance >= :minImportance ORDER BY importance DESC")
    fun getImportantMemories(minImportance: Int): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memories WHERE content LIKE '%' || :query || '%' ORDER BY timestamp DESC")
    suspend fun searchMemories(query: String): List<MemoryEntity>

    @Query("DELETE FROM memories WHERE id = :id")
    suspend fun deleteMemory(id: String)

    @Query("DELETE FROM memories WHERE timestamp < :cutoffTime AND importance < :minImportance")
    suspend fun pruneOldMemories(cutoffTime: Long, minImportance: Int): Int

    @Query("DELETE FROM memories")
    suspend fun clearAllMemories()

    @Query("SELECT COUNT(*) FROM memories")
    suspend fun getMemoryCount(): Int

    @Query("SELECT AVG(importance) FROM memories")
    suspend fun getAverageImportance(): Float?
}

@Dao
interface UserProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: UserProfileEntity)

    @Query("SELECT * FROM user_profiles WHERE id = :id")
    suspend fun getProfile(id: String = "default"): UserProfileEntity?

    @Query("DELETE FROM user_profiles")
    suspend fun clearProfiles()
}

@Dao
interface MessageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<MessageEntity>)

    @Query("SELECT * FROM messages ORDER BY timestamp ASC")
    fun getAllMessages(): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentMessages(limit: Int): List<MessageEntity>

    @Query("DELETE FROM messages")
    suspend fun clearAllMessages()
}

@Dao
interface GeneratedImageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertImage(image: GeneratedImageEntity)

    @Query("SELECT * FROM generated_images ORDER BY timestamp DESC")
    fun getAllImages(): Flow<List<GeneratedImageEntity>>

    @Query("DELETE FROM generated_images WHERE id = :id")
    suspend fun deleteImage(id: String)

    @Query("DELETE FROM generated_images")
    suspend fun clearAllImages()
}

@Dao
interface GrowthEntryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEntry(entry: GrowthEntryEntity)

    @Query("SELECT * FROM growth_entries ORDER BY timestamp DESC")
    fun getAllEntries(): Flow<List<GrowthEntryEntity>>

    @Query("DELETE FROM growth_entries")
    suspend fun clearAllEntries()
}

@Dao
interface SandboxFileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFile(file: SandboxFileEntity)

    @Query("SELECT * FROM sandbox_files ORDER BY name ASC")
    fun getAllFiles(): Flow<List<SandboxFileEntity>>

    @Query("SELECT * FROM sandbox_files WHERE name = :name")
    suspend fun getFile(name: String): SandboxFileEntity?

    @Query("DELETE FROM sandbox_files WHERE name = :name")
    suspend fun deleteFile(name: String)

    @Query("DELETE FROM sandbox_files")
    suspend fun clearAllFiles()
}

@Dao
interface SettingsDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSettings(settings: SettingsEntity)

    @Query("SELECT * FROM settings WHERE id = :id")
    suspend fun getSettings(id: String = "app_settings"): SettingsEntity?

    @Query("SELECT * FROM settings WHERE id = :id")
    fun getSettingsFlow(id: String = "app_settings"): Flow<SettingsEntity?>
}
