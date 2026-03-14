package com.elara.app.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.elara.app.ui.theme.PurpleAccent

@Composable
fun ThoughtLogger(
    thoughtText: String,
    isThinking: Boolean,
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(true) }

    val rotationAngle by animateFloatAsState(
        targetValue = if (isExpanded) 0f else -180f,
        animationSpec = tween(300),
        label = "rotation"
    )

    AnimatedVisibility(
        visible = thoughtText.isNotEmpty() || isThinking,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically()
    ) {
        Surface(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(12.dp),
            color = PurpleAccent.copy(alpha = 0.1f),
            border = ButtonDefaults.outlinedButtonBorder.copy(
                brush = androidx.compose.ui.graphics.SolidColor(
                    PurpleAccent.copy(alpha = 0.3f)
                )
            )
        ) {
            Column {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                        .background(PurpleAccent.copy(alpha = 0.15f))
                        .clickable { isExpanded = !isExpanded }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Pulsing indicator
                        Box {
                            if (isThinking) {
                                val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                                val alpha by infiniteTransition.animateFloat(
                                    initialValue = 0.3f,
                                    targetValue = 1f,
                                    animationSpec = infiniteRepeatable(
                                        animation = tween(800),
                                        repeatMode = RepeatMode.Reverse
                                    ),
                                    label = "pulseAlpha"
                                )
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .background(
                                            color = PurpleAccent.copy(alpha = alpha * 0.5f),
                                            shape = CircleShape
                                        )
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(
                                        color = if (isThinking) PurpleAccent else PurpleAccent.copy(alpha = 0.5f),
                                        shape = CircleShape
                                    )
                            )
                        }

                        Text(
                            text = "ELARA'S THOUGHT PROCESS",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            ),
                            color = PurpleAccent
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "${thoughtText.length} chars",
                            style = MaterialTheme.typography.labelSmall,
                            color = PurpleAccent.copy(alpha = 0.6f)
                        )
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowDown,
                            contentDescription = if (isExpanded) "Collapse" else "Expand",
                            modifier = Modifier
                                .size(16.dp)
                                .rotate(rotationAngle),
                            tint = PurpleAccent
                        )
                    }
                }

                // Content
                AnimatedVisibility(
                    visible = isExpanded,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 200.dp)
                            .padding(12.dp)
                    ) {
                        Row {
                            Text(
                                text = thoughtText.ifEmpty { "Analyzing context and formulating response..." },
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace
                                ),
                                color = PurpleAccent.copy(alpha = 0.8f)
                            )

                            if (isThinking) {
                                val infiniteTransition = rememberInfiniteTransition(label = "cursor")
                                val alpha by infiniteTransition.animateFloat(
                                    initialValue = 0f,
                                    targetValue = 1f,
                                    animationSpec = infiniteRepeatable(
                                        animation = tween(500),
                                        repeatMode = RepeatMode.Reverse
                                    ),
                                    label = "cursorAlpha"
                                )
                                Box(
                                    modifier = Modifier
                                        .padding(start = 2.dp)
                                        .width(2.dp)
                                        .height(14.dp)
                                        .background(PurpleAccent.copy(alpha = alpha))
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
