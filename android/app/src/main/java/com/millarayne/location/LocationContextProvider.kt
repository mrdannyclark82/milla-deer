package com.millarayne.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

class LocationContextProvider(private val context: Context) {
    fun hasLocationPermission(): Boolean {
        val fineGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        val coarseGranted =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        return fineGranted || coarseGranted
    }

    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocationSummary(): String? {
        if (!hasLocationPermission()) {
            return null
        }

        val locationManager =
            context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: return null

        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
            LocationManager.PASSIVE_PROVIDER
        ).filter(locationManager::isProviderEnabled)

        if (providers.isEmpty()) {
            return null
        }

        val bestLastKnown = providers
            .mapNotNull { provider -> runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull() }
            .maxByOrNull { location -> location.time }

        val resolvedLocation =
            bestLastKnown ?: providers.firstNotNullOfOrNull { provider ->
                runCatching { locationManager.awaitSingleLocation(provider, context) }.getOrNull()
            }

        return resolvedLocation?.toSummary()
    }
}

@SuppressLint("MissingPermission")
private suspend fun LocationManager.awaitSingleLocation(
    provider: String,
    context: Context
): Location? = suspendCancellableCoroutine { continuation ->
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        getCurrentLocation(provider, null, context.mainExecutor) { location ->
            if (!continuation.isCompleted) {
                continuation.resume(location)
            }
        }
        return@suspendCancellableCoroutine
    }

    val listener =
        object : LocationListener {
            override fun onLocationChanged(location: Location) {
                removeUpdates(this)
                if (!continuation.isCompleted) {
                    continuation.resume(location)
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onProviderDisabled(provider: String) {
                removeUpdates(this)
                if (!continuation.isCompleted) {
                    continuation.resume(null)
                }
            }
        }

    try {
        requestSingleUpdate(provider, listener, null)
    } catch (error: SecurityException) {
        if (!continuation.isCompleted) {
            continuation.resumeWithException(error)
        }
        return@suspendCancellableCoroutine
    }

    continuation.invokeOnCancellation {
        removeUpdates(listener)
    }
}

private fun Location.toSummary(): String {
    val formattedLatitude = String.format(Locale.US, "%.4f", latitude)
    val formattedLongitude = String.format(Locale.US, "%.4f", longitude)
    val roundedAccuracy = accuracy.toInt().coerceAtLeast(1)
    return "Approximate device location: $formattedLatitude, $formattedLongitude (accuracy about ${roundedAccuracy}m). Use this only as optional context."
}
