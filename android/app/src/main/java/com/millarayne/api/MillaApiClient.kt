package com.millarayne.api

import com.millarayne.data.SettingsRepository
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Retrofit client for the Milla API.
 */
object MillaApiClient {
    @Volatile
    private var sessionTokenProvider: (() -> String?)? = null

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val token = sessionTokenProvider?.invoke()?.trim().orEmpty()
            val request = if (token.isNotEmpty()) {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                chain.request()
            }

            chain.proceed(request)
        }
        .addInterceptor(loggingInterceptor)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val serviceCache = ConcurrentHashMap<String, MillaApiService>()

    val apiService: MillaApiService by lazy {
        createApiService(SettingsRepository.DEFAULT_SERVER_URL)
    }

    fun setSessionTokenProvider(provider: () -> String?) {
        sessionTokenProvider = provider
    }

    fun createApiService(baseUrl: String): MillaApiService {
        val normalizedBaseUrl = SettingsRepository.normalizeServerUrl(baseUrl)
        return serviceCache.getOrPut(normalizedBaseUrl) {
            Retrofit.Builder()
                .baseUrl(normalizedBaseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(MillaApiService::class.java)
        }
    }
}
