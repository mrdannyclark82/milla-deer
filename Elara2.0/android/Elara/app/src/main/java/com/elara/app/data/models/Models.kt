package com.elara.app.data.models

import java.util.UUID

/**
 * Persona modes for Elara - affects conversation style
 */
enum class PersonaMode(val displayName: String, val description: String) {
    PROFESSIONAL("Professional", "Formal and precise"),
    CASUAL("Casual", "Friendly and relaxed"),
    EMPATHETIC("Empathetic", "Supportive and understanding"),
    HUMOROUS("Humorous", "Light and entertaining"),
    MOTIVATIONAL("Motivational", "Encouraging and inspiring"),
    ADAPTIVE("Adaptive", "Automatically adjusts based on context")
}

/**
 * Tool modes available in Elara
 */
enum class ToolMode(
    val displayName: String,
    val icon: String,
    val description: String
) {
    CHAT("Chat", "brain", "Conversational AI"),
    SEARCH("Search", "search", "Web search powered by Google"),
    MAPS("Maps", "map_marker", "Location services"),
    IMAGE_GEN("Imagine", "image", "AI image generation"),
    VIDEO_GEN("Veo", "video", "AI video generation")
}

/**
 * Message in the chat
 */
data class Message(
    val id: String = UUID.randomUUID().toString(),
    val role: MessageRole,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isThinking: Boolean = false,
    val thoughtProcess: String? = null,
    val imageUri: String? = null,
    val videoUri: String? = null,
    val audioUri: String? = null,
    val groundingSources: List<GroundingSource>? = null
)

enum class MessageRole {
    USER, MODEL, SYSTEM
}

data class GroundingSource(
    val title: String,
    val uri: String
)

/**
 * Detailed performance metrics for Elara
 */
data class DetailedMetrics(
    val accuracy: Int = 85,
    val empathy: Int = 80,
    val speed: Int = 90,
    val creativity: Int = 75,
    val relevance: Int = 88,
    val humor: Int = 60,
    val proactivity: Int = 70,
    val clarity: Int = 92,
    val engagement: Int = 85,
    val ethicalAlignment: Int = 100,
    val memoryUsage: Int = 45,
    val anticipation: Int = 65
) {
    fun toList(): List<MetricItem> = listOf(
        MetricItem("Accuracy", accuracy),
        MetricItem("Empathy", empathy),
        MetricItem("Speed", speed),
        MetricItem("Creativity", creativity),
        MetricItem("Relevance", relevance),
        MetricItem("Humor", humor),
        MetricItem("Proactivity", proactivity),
        MetricItem("Clarity", clarity),
        MetricItem("Engagement", engagement),
        MetricItem("Ethics", ethicalAlignment),
        MetricItem("Memory", memoryUsage),
        MetricItem("Anticipation", anticipation)
    )
}

data class MetricItem(
    val name: String,
    val value: Int
)

/**
 * Integration status for external services
 */
data class IntegrationStatus(
    val google: Boolean = true,
    val grok: Boolean = true,
    val github: Boolean = true
)

/**
 * Growth journal entry
 */
data class GrowthEntry(
    val id: String = UUID.randomUUID().toString(),
    val type: GrowthType,
    val title: String,
    val timestamp: Long = System.currentTimeMillis(),
    val details: String,
    val technicalDetails: String? = null,
    val sources: List<GroundingSource>? = null
)

enum class GrowthType {
    LEARNING, UPGRADE, AUDIT, PROPOSAL, RESEARCH
}

/**
 * Attachment for messages
 */
data class Attachment(
    val mimeType: String,
    val data: String, // base64
    val previewUri: String? = null
)

/**
 * Generated image in Creative Studio
 */
data class GeneratedImage(
    val id: String = UUID.randomUUID().toString(),
    val url: String,
    val prompt: String,
    val aspectRatio: String,
    val model: String,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Sandbox file for code editor
 */
data class SandboxFile(
    val name: String,
    val content: String,
    val language: String
)

/**
 * GitHub node for file tree
 */
data class GitHubNode(
    val path: String,
    val type: String, // "blob" or "tree"
    val sha: String,
    val url: String
)
