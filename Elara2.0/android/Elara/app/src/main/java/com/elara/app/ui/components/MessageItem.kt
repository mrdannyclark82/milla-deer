package com.elara.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.elara.app.data.models.GroundingSource
import com.elara.app.data.models.Message
import com.elara.app.data.models.MessageRole
import com.elara.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun MessageItem(
    message: Message,
    modifier: Modifier = Modifier
) {
    val isUser = message.role == MessageRole.USER
    val isSystem = message.role == MessageRole.SYSTEM

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .padding(vertical = 4.dp),
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp
            ),
            color = when {
                isSystem -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                isUser -> MaterialTheme.colorScheme.surfaceVariant
                else -> EmeraldPrimary.copy(alpha = 0.15f)
            },
            border = if (!isUser && !isSystem) {
                ButtonDefaults.outlinedButtonBorder.copy(
                    brush = androidx.compose.ui.graphics.SolidColor(
                        EmeraldPrimary.copy(alpha = 0.3f)
                    )
                )
            } else null
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                // Message content
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isSystem) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )

                // Image attachment
                message.imageUri?.let { imageUri ->
                    Spacer(modifier = Modifier.height(8.dp))
                    AsyncImage(
                        model = imageUri,
                        contentDescription = "Generated image",
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.FillWidth
                    )
                }

                // Video attachment
                message.videoUri?.let { videoUri ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "🎥 Video Content",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }

                // Grounding sources
                message.groundingSources?.let { sources ->
                    if (sources.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        GroundingSources(sources = sources)
                    }
                }

                // Timestamp
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = formatTimestamp(message.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@Composable
private fun GroundingSources(sources: List<GroundingSource>) {
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                shape = RoundedCornerShape(8.dp)
            )
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = "Sources",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        sources.take(3).forEach { source ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(4.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Link,
                    contentDescription = null,
                    modifier = Modifier.size(12.dp),
                    tint = EmeraldPrimary
                )
                Text(
                    text = source.title,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                )
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
    return sdf.format(Date(timestamp))
}
