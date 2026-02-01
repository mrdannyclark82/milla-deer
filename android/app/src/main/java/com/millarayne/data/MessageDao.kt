package com.millarayne.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * DAO for Message entity
 */
@Dao
interface MessageDao {
    @Query("SELECT * FROM messages ORDER BY timestamp ASC")
    fun getAllMessages(): Flow<List<Message>>

    @Query("SELECT * FROM messages ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentMessages(limit: Int): List<Message>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: Message): Long

    @Query("DELETE FROM messages")
    suspend fun deleteAllMessages()

    @Query("SELECT COUNT(*) FROM messages")
    suspend fun getMessageCount(): Int

    @Query("SELECT * FROM messages WHERE isSynced = 0 AND role = 'user'")
    suspend fun getUnsyncedMessages(): List<Message>

    @Query("UPDATE messages SET isSynced = 1 WHERE id = :messageId")
    suspend fun markAsSynced(messageId: Long)
}
