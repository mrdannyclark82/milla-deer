package com.elara.app.di

import android.content.Context
import com.elara.app.data.database.ElaraDatabase
import com.elara.app.data.repository.ElaraRepository
import com.elara.app.services.GeminiService
import com.elara.app.services.GitHubService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideElaraDatabase(
        @ApplicationContext context: Context
    ): ElaraDatabase {
        return ElaraDatabase.getDatabase(context)
    }

    @Provides
    @Singleton
    fun provideElaraRepository(
        database: ElaraDatabase
    ): ElaraRepository {
        return ElaraRepository(database)
    }

    @Provides
    @Singleton
    fun provideGeminiService(): GeminiService {
        return GeminiService()
    }

    @Provides
    @Singleton
    fun provideGitHubService(): GitHubService {
        return GitHubService()
    }
}
