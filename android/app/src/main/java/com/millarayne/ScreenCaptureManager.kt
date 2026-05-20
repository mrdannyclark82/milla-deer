package com.millarayne

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

class ScreenCaptureManager(private val context: Context) {
    companion object {
        private const val TAG = "ScreenCaptureManager"
        @Volatile
        private var sharedInstance: ScreenCaptureManager? = null

        fun getShared(context: Context): ScreenCaptureManager {
            return sharedInstance ?: synchronized(this) {
                sharedInstance ?: ScreenCaptureManager(context.applicationContext).also {
                    sharedInstance = it
                }
            }
        }
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var captureWidth: Int = 0
    private var captureHeight: Int = 0
    private var densityDpi: Int = 0
    private var isStoppingInternally = false
    private var onSessionEnded: (() -> Unit)? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            Log.w(TAG, "MediaProjection stopped by the system")
            if (isStoppingInternally) {
                return
            }

            releaseResources(stopProjection = false)
            ScreenShareForegroundService.stop(context)
            onSessionEnded?.invoke()
        }
    }

    fun isActive(): Boolean = mediaProjection != null && imageReader != null

    fun setOnSessionEndedListener(listener: (() -> Unit)?) {
        onSessionEnded = listener
    }

    fun start(resultCode: Int, data: Intent): Boolean {
        stop(stopService = false)

        val projectionManager = context.getSystemService(MediaProjectionManager::class.java)
            ?: return false
        val projection = try {
            projectionManager.getMediaProjection(resultCode, data)
        } catch (error: SecurityException) {
            Log.e(TAG, "MediaProjection start rejected by Android", error)
            return false
        } ?: return false
        projection.registerCallback(projectionCallback, mainHandler)
        val metrics = readDisplayMetrics()

        captureWidth = metrics.widthPixels.coerceAtLeast(1)
        captureHeight = metrics.heightPixels.coerceAtLeast(1)
        densityDpi = metrics.densityDpi.coerceAtLeast(1)

        val reader = ImageReader.newInstance(
            captureWidth,
            captureHeight,
            PixelFormat.RGBA_8888,
            2
        )

        val display = projection.createVirtualDisplay(
            "MillaScreenCapture",
            captureWidth,
            captureHeight,
            densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface,
            null,
            null
        )

        mediaProjection = projection
        imageReader = reader
        virtualDisplay = display
        Log.d(TAG, "MediaProjection started at ${captureWidth}x${captureHeight} (${densityDpi}dpi)")
        return true
    }

    suspend fun captureFrameDataUrl(
        maxAttempts: Int = 15,
        retryDelayMs: Long = 100
    ): String? = withContext(Dispatchers.Default) {
        val reader = imageReader ?: return@withContext null

        repeat(maxAttempts.coerceAtLeast(1)) {
            val image = reader.acquireLatestImage()
            if (image != null) {
                try {
                    Log.d(TAG, "Captured frame on attempt ${it + 1}")
                    return@withContext convertImageToDataUrl(image)
                } finally {
                    image.close()
                }
            }
            delay(retryDelayMs.coerceAtLeast(1L))
        }

        Log.w(TAG, "No screen frame became available during capture window")
        null
    }

    fun stop(stopService: Boolean = true) {
        Log.d(TAG, "Stopping MediaProjection session")
        isStoppingInternally = true
        releaseResources(stopProjection = true)
        isStoppingInternally = false
        if (stopService) {
            ScreenShareForegroundService.stop(context)
        }
    }

    private fun releaseResources(stopProjection: Boolean) {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null

        val projection = mediaProjection
        mediaProjection = null
        if (projection != null) {
            projection.unregisterCallback(projectionCallback)
            if (stopProjection) {
                projection.stop()
            }
        }

        captureWidth = 0
        captureHeight = 0
        densityDpi = 0
    }

    private fun convertImageToDataUrl(image: android.media.Image): String {
        val plane = image.planes.first()
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * image.width

        var bitmap = Bitmap.createBitmap(
            image.width + rowPadding / pixelStride,
            image.height,
            Bitmap.Config.ARGB_8888
        )
        buffer.rewind()
        bitmap.copyPixelsFromBuffer(buffer)

        val croppedBitmap = Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
        if (croppedBitmap != bitmap) {
            bitmap.recycle()
        }
        bitmap = croppedBitmap

        val resizedBitmap = if (bitmap.width > 720) {
            val scaledHeight = (bitmap.height * (720f / bitmap.width)).toInt().coerceAtLeast(1)
            Bitmap.createScaledBitmap(bitmap, 720, scaledHeight, true)
        } else {
            bitmap
        }

        if (resizedBitmap != bitmap) {
            bitmap.recycle()
            bitmap = resizedBitmap
        }

        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 75, outputStream)
        bitmap.recycle()

        val encoded = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
        return "data:image/jpeg;base64,$encoded"
    }

    private fun readDisplayMetrics(): DisplayMetrics {
        val metrics = DisplayMetrics()
        metrics.setTo(context.resources.displayMetrics)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val windowManager = context.getSystemService(WindowManager::class.java)
            val bounds = windowManager?.currentWindowMetrics?.bounds
            if (bounds != null) {
                metrics.widthPixels = bounds.width()
                metrics.heightPixels = bounds.height()
                return metrics
            }
        }

        @Suppress("DEPRECATION")
        val legacyWindowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        @Suppress("DEPRECATION")
        legacyWindowManager?.defaultDisplay?.getRealMetrics(metrics)
        return metrics
    }
}
