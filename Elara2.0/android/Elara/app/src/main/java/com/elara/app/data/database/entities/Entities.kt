package com.elara.app.data.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Memory entry stored in Room database
 */
@Entity(tableName = "memories")
data class MemoryEntity(
    @PrimaryKey
    val id: String,
    val type: String, // conversation, knowledge, user_preference, context, insight
    val content: String,
    val timestamp: Long,
    val importance: Int, // 1-10 scale
    val tags: List<String>,
    val source: String? = null,
    val relatedTo: List<String>? = null
)

/**
 * User profile stored in Room database
 */
@Entity(tableName = "user_profiles")
data class UserProfileEntity(
    @PrimaryKey
    val id: String = "default",
    val preferencesJson: String = "{}",
    val totalMessages: Int = 0,
    val topicsDiscussedJson: String = "[]",
    val favoriteFeaturesJson: String = "[]",
    val lastUpdated: Long = System.currentTimeMillis()
)

/**
 * Message entity for persisting chat history
 */
@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val role: String,
    val content: String,
    val timestamp: Long,
    val imageUri: String? = null,
    val videoUri: String? = null,
    val groundingSourcesJson: String? = null
)

/**
 * Generated image entity for Creative Studio
 */
@Entity(tableName = "generated_images")
data class GeneratedImageEntity(
    @PrimaryKey
    val id: String,
    val url: String,
    val prompt: String,
    val aspectRatio: String,
    val model: String,
    val timestamp: Long
)

/**
 * Growth entry entity for journal
 */
@Entity(tableName = "growth_entries")
data class GrowthEntryEntity(
    @PrimaryKey
    val id: String,
    val type: String,
    val title: String,
    val timestamp: Long,
    val details: String,
    val technicalDetails: String? = null,
    val sourcesJson: String? = null
)

/**
 * Sandbox file entity for code persistence
 */
@Entity(tableName = "sandbox_files")
data class SandboxFileEntity(
    @PrimaryKey
    val name: String,
    val content: String,
    val language: String,
    val lastModified: Long = System.currentTimeMillis()
)

/**
 * Settings entity for app preferences
 */
@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey
    val id: String = "app_settings",
    val persona: String = "ADAPTIVE",
    val darkMode: Boolean = true,
    val backgroundImageUrl: String? = null,
    val githubToken: String? = null,
    val lastAuditTimestamp: Long = 0,
    val lastResearchTimestamp: Long = 0
)

/**
 * Type converters for Room
 */
class Converters {
    private val gson = Gson()

    @TypeConverter
    fun fromStringList(value: List<String>?): String {
        return gson.toJson(value ?: emptyList<String>())
    }

    @TypeConverter
    fun toStringList(value: String): List<String> {
        val listType = object : TypeToken<List<String>>() {}.type
        return gson.fromJson(value, listType) ?: emptyList()
    }
}
