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
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

class ScreenCaptureManager(private val context: Context) {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var captureWidth: Int = 0
    private var captureHeight: Int = 0
    private var densityDpi: Int = 0

    fun isActive(): Boolean = mediaProjection != null && imageReader != null

    fun start(resultCode: Int, data: Intent): Boolean {
        stop()

        val projectionManager = context.getSystemService(MediaProjectionManager::class.java)
            ?: return false
        val projection = projectionManager.getMediaProjection(resultCode, data) ?: return false
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
        return true
    }

    suspend fun captureFrameDataUrl(): String? = withContext(Dispatchers.Default) {
        val reader = imageReader ?: return@withContext null

        repeat(15) {
            val image = reader.acquireLatestImage()
            if (image != null) {
                try {
                    return@withContext convertImageToDataUrl(image)
                } finally {
                    image.close()
                }
            }
            delay(100)
        }

        null
    }

    fun stop() {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
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
