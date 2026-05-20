package com.millarayne.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val CyberpunkColorScheme = darkColorScheme(
    primary            = CyberPrimary,
    onPrimary          = CyberOnPrimary,
    primaryContainer   = CyberPrimaryDark,
    onPrimaryContainer = CyberOnBackground,
    secondary          = CyberSecondary,
    onSecondary        = CyberOnPrimary,
    tertiary           = CyberTertiary,
    onTertiary         = CyberOnBackground,
    background         = CyberBackground,
    onBackground       = CyberOnBackground,
    surface            = CyberSurface,
    onSurface          = CyberOnSurface,
    surfaceVariant     = CyberSurfaceVar,
    onSurfaceVariant   = CyberOnSurface,
    outline            = CyberOutline,
    error              = CyberError,
    onError            = CyberOnPrimary,
)

@Composable
fun MillaTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = CyberBackground.toArgb()
            window.navigationBarColor = CyberBackground.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = CyberpunkColorScheme,
        typography = Typography,
        content = content
    )
}
