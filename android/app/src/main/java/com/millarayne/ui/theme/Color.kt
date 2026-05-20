package com.millarayne.ui.theme

import androidx.compose.ui.graphics.Color

// Cyberpunk palette
val CyberBackground    = Color(0xFF0A0A0F)
val CyberSurface       = Color(0xFF111118)
val CyberSurfaceVar    = Color(0xFF1A1A24)
val CyberPrimary       = Color(0xFF00F5FF)   // neon cyan
val CyberPrimaryDark   = Color(0xFF009EAA)
val CyberSecondary     = Color(0xFFFF00FF)   // neon magenta
val CyberTertiary      = Color(0xFF7B2FFF)   // neon purple
val CyberOnPrimary     = Color(0xFF000000)
val CyberOnBackground  = Color(0xFFE0FFFE)
val CyberOnSurface     = Color(0xFFCCFAFD)
val CyberError         = Color(0xFFFF3355)
val CyberOutline       = Color(0xFF00F5FF).copy(alpha = 0.35f)

val UserBubble         = CyberPrimary.copy(alpha = 0.18f)
val UserBubbleLight    = CyberPrimary
val AssistantBubble    = CyberSurfaceVar
val AssistantBubbleLight = CyberSecondary.copy(alpha = 0.15f)
