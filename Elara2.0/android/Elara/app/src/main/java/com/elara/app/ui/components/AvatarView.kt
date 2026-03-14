package com.elara.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elara.app.ui.theme.AuburnPrimary
import com.elara.app.ui.theme.EmeraldPrimary
import com.elara.app.ui.theme.PurpleAccent

/**
 * Animated Avatar View - A glowing orb that represents Elara
 */
@Composable
fun AvatarView(
    isSpeaking: Boolean,
    mood: String = "neutral",
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "avatar")

    // Breathing animation
    val breathingScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathing"
    )

    // Speaking pulse animation
    val speakingScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isSpeaking) 1.15f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "speaking"
    )

    // Glow rotation
    val glowRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(8000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    // Color based on mood
    val mainColor by animateColorAsState(
        targetValue = when (mood) {
            "happy" -> EmeraldPrimary
            "thinking" -> PurpleAccent
            "concerned" -> Color(0xFFFF4500)
            else -> AuburnPrimary
        },
        animationSpec = tween(500),
        label = "color"
    )

    val glowColor by animateColorAsState(
        targetValue = when (mood) {
            "happy" -> EmeraldPrimary
            "thinking" -> Color(0xFF00BFFF)
            "concerned" -> Color(0xFFFFA500)
            else -> EmeraldPrimary
        },
        animationSpec = tween(500),
        label = "glowColor"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1.5f),
        contentAlignment = Alignment.Center
    ) {
        // Outer glow
        Box(
            modifier = Modifier
                .size(180.dp)
                .scale(breathingScale * speakingScale)
                .blur(30.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            glowColor.copy(alpha = 0.4f),
                            glowColor.copy(alpha = 0.1f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        // Inner orb
        Box(
            modifier = Modifier
                .size(120.dp)
                .scale(breathingScale * speakingScale)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            mainColor,
                            mainColor.copy(alpha = 0.8f),
                            mainColor.copy(alpha = 0.6f)
                        )
                    ),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            // Inner highlight
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .offset(x = (-15).dp, y = (-15).dp)
                    .blur(15.dp)
                    .background(
                        color = Color.White.copy(alpha = 0.3f),
                        shape = CircleShape
                    )
            )
        }

        // Halo ring
        Box(
            modifier = Modifier
                .size(160.dp)
                .scale(breathingScale)
                .background(
                    brush = Brush.sweepGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.3f),
                            Color.Transparent,
                            Color.White.copy(alpha = 0.3f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        // Status text
        Text(
            text = if (isSpeaking) "VOCALIZING" else "LISTENING",
            style = MaterialTheme.typography.labelSmall.copy(
                letterSpacing = 3.sp,
                fontWeight = FontWeight.Medium
            ),
            color = EmeraldPrimary.copy(alpha = 0.7f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
        )
    }
}
