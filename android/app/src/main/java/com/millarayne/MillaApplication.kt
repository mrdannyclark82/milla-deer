package com.millarayne

import android.app.Application
import android.util.Log
import com.millarayne.agent.OfflineResponseGenerator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Application class for Milla
 */
class MillaApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Shared SLM engine pre-warmed at process start — ViewModel reuses via OfflineResponseGenerator */
    lateinit var offlineGenerator: OfflineResponseGenerator
        private set

    override fun onCreate() {
        super.onCreate()
        offlineGenerator = OfflineResponseGenerator(this)
        appScope.launch {
            try {
                offlineGenerator.warmUp()
                Log.i("MillaApplication", "GPU SLM engine warmed up")
            } catch (e: Exception) {
                Log.w("MillaApplication", "SLM warm-up skipped (model not yet downloaded): ${e.message}")
            }
        }
    }
}
