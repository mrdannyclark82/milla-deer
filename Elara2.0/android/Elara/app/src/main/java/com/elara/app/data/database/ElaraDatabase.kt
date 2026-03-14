package com.elara.app.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.elara.app.data.database.entities.*

@Database(
    entities = [
        MemoryEntity::class,
        UserProfileEntity::class,
        MessageEntity::class,
        GeneratedImageEntity::class,
        GrowthEntryEntity::class,
        SandboxFileEntity::class,
        SettingsEntity::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class ElaraDatabase : RoomDatabase() {
    abstract fun memoryDao(): MemoryDao
    abstract fun userProfileDao(): UserProfileDao
    abstract fun messageDao(): MessageDao
    abstract fun generatedImageDao(): GeneratedImageDao
    abstract fun growthEntryDao(): GrowthEntryDao
    abstract fun sandboxFileDao(): SandboxFileDao
    abstract fun settingsDao(): SettingsDao

    companion object {
        @Volatile
        private var INSTANCE: ElaraDatabase? = null

        fun getDatabase(context: Context): ElaraDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    ElaraDatabase::class.java,
                    "elara_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
