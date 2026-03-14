package com.elara.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ElaraApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
