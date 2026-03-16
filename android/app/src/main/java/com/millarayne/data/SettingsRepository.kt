package com.millarayne.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/**
 * User preferences and settings.
 */
class SettingsRepository(private val context: Context) {

    companion object {
        private val SERVER_URL_KEY = stringPreferencesKey("server_url")
        private val OFFLINE_MODE_ENABLED_KEY = booleanPreferencesKey("offline_mode_enabled")
        private val AUTO_FALLBACK_KEY = booleanPreferencesKey("auto_fallback")
        private val SPOKEN_REPLIES_ENABLED_KEY = booleanPreferencesKey("spoken_replies_enabled")

        const val DEFAULT_SERVER_URL = "http://10.0.2.2:5000/"
        const val DEFAULT_OFFLINE_MODE_ENABLED = false
        const val DEFAULT_AUTO_FALLBACK = true
        const val DEFAULT_SPOKEN_REPLIES_ENABLED = true

        fun normalizeServerUrl(url: String): String {
            var normalized = url.trim()
            if (normalized.isEmpty()) {
                return DEFAULT_SERVER_URL
            }

            if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
                normalized = "http://$normalized"
            }

            if (!normalized.endsWith('/')) {
                normalized += "/"
            }

            return normalized
        }
    }

    val serverUrl: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[SERVER_URL_KEY] ?: DEFAULT_SERVER_URL
    }

    val offlineModeEnabled: Flow<Boolean> = context.dataStore.data.map { preferences ->
        preferences[OFFLINE_MODE_ENABLED_KEY] ?: DEFAULT_OFFLINE_MODE_ENABLED
    }

    val autoFallback: Flow<Boolean> = context.dataStore.data.map { preferences ->
        preferences[AUTO_FALLBACK_KEY] ?: DEFAULT_AUTO_FALLBACK
    }

    val spokenRepliesEnabled: Flow<Boolean> = context.dataStore.data.map { preferences ->
        preferences[SPOKEN_REPLIES_ENABLED_KEY] ?: DEFAULT_SPOKEN_REPLIES_ENABLED
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { preferences ->
            preferences[SERVER_URL_KEY] = normalizeServerUrl(url)
        }
    }

    suspend fun setOfflineModeEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[OFFLINE_MODE_ENABLED_KEY] = enabled
        }
    }

    suspend fun setAutoFallback(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[AUTO_FALLBACK_KEY] = enabled
        }
    }

    suspend fun setSpokenRepliesEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[SPOKEN_REPLIES_ENABLED_KEY] = enabled
        }
    }
}
