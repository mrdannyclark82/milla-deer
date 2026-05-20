package com.millarayne.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.time.Instant

/**
 * Message entity for Room database
 */
@Entity(tableName = "messages")
data class Message(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val content: String,
    val role: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class RemoteMessage(
    val id: String? = null,
    val content: String,
    val role: String,
    val timestamp: String? = null
) {
    fun toLocalMessage(): Message {
        return Message(
            content = content,
            role = role,
            timestamp = parseTimestamp(timestamp)
        )
    }

    private fun parseTimestamp(rawTimestamp: String?): Long {
        if (rawTimestamp.isNullOrBlank()) {
            return System.currentTimeMillis()
        }

        return rawTimestamp.toLongOrNull()
            ?: runCatching { Instant.parse(rawTimestamp).toEpochMilli() }
                .getOrElse { System.currentTimeMillis() }
    }
}

/**
 * Scene context data
 */
data class SceneContext(
    val location: String,
    val mood: String,
    val timeOfDay: String
)

/**
 * API request for sending a message
 */
data class ChatRequest(
    val message: String,
    val imageData: String? = null
)

/**
 * API response from chat endpoint
 */
data class ChatResponse(
    val response: String,
    val sceneContext: SceneContext? = null
)
