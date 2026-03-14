package com.elara.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.elara.app.data.models.ToolMode
import com.elara.app.ui.theme.*

@Composable
fun ToolSelector(
    selectedTool: ToolMode,
    onToolSelected: (ToolMode) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ToolMode.values().forEach { tool ->
            ToolChip(
                tool = tool,
                isSelected = tool == selectedTool,
                onClick = { onToolSelected(tool) }
            )
        }
    }
}

@Composable
private fun ToolChip(
    tool: ToolMode,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val icon = when (tool) {
        ToolMode.CHAT -> Icons.Default.Psychology
        ToolMode.SEARCH -> Icons.Default.Search
        ToolMode.MAPS -> Icons.Default.Place
        ToolMode.IMAGE_GEN -> Icons.Default.Image
        ToolMode.VIDEO_GEN -> Icons.Default.VideoLibrary
    }

    val color = when (tool) {
        ToolMode.CHAT -> ChatColor
        ToolMode.SEARCH -> SearchColor
        ToolMode.MAPS -> MapsColor
        ToolMode.IMAGE_GEN -> ImageGenColor
        ToolMode.VIDEO_GEN -> VideoGenColor
    }

    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick),
        color = if (isSelected) color else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(20.dp),
        border = if (isSelected) null else ButtonDefaults.outlinedButtonBorder
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = tool.displayName,
                modifier = Modifier.size(16.dp),
                tint = if (isSelected) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = tool.displayName,
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun rememberScrollState() = androidx.compose.foundation.rememberScrollState()
