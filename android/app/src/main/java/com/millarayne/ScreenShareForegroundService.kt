package com.millarayne

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class ScreenShareForegroundService : Service() {
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        if (intent?.action == ACTION_START_PROJECTION) {
            val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Int.MIN_VALUE)
            val projectionData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(EXTRA_PROJECTION_DATA, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(EXTRA_PROJECTION_DATA)
            }

            if (resultCode == Int.MIN_VALUE || projectionData == null) {
                Log.w(TAG, "Projection start requested without valid permission data")
            } else {
                mainHandler.postDelayed({
                    val started = ScreenCaptureManager.getShared(applicationContext)
                        .start(resultCode, projectionData)
                    Log.d(TAG, "Projection start from service result: $started")
                }, 350)
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Milla screen sharing")
            .setContentText("Screen sharing is active.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) {
            return
        }

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Screen sharing",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Required while Milla captures shared screen frames."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "ScreenShareService"
        private const val CHANNEL_ID = "milla_screen_share"
        private const val NOTIFICATION_ID = 4401
        private const val ACTION_START_PROJECTION = "com.millarayne.action.START_PROJECTION"
        private const val EXTRA_RESULT_CODE = "extra_result_code"
        private const val EXTRA_PROJECTION_DATA = "extra_projection_data"

        fun start(context: Context) {
            val intent = Intent(context, ScreenShareForegroundService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun startProjection(context: Context, resultCode: Int, data: Intent) {
            val intent = Intent(context, ScreenShareForegroundService::class.java).apply {
                action = ACTION_START_PROJECTION
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_PROJECTION_DATA, data)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenShareForegroundService::class.java))
        }
    }
}
