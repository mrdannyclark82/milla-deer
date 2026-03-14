package com.elara.app.services

import com.elara.app.data.models.GitHubNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import javax.inject.Inject
import javax.inject.Singleton

/**
 * GitHub Service - Handles GitHub API operations for Sandbox
 */
@Singleton
class GitHubService @Inject constructor() {

    private val client = OkHttpClient()
    private var token: String? = null

    fun setToken(newToken: String) {
        token = newToken
    }

    fun getToken(): String? = token

    /**
     * Parse a GitHub repo string to extract owner and repo name
     */
    fun parseRepoString(input: String): Pair<String, String>? {
        val regex = Regex("""(?:https?://github\.com/)?([^/]+)/([^/\s]+)""")
        val match = regex.find(input) ?: return null
        val owner = match.groupValues[1]
        val repo = match.groupValues[2].replace(".git", "")
        return Pair(owner, repo)
    }

    /**
     * Fetch repository contents from GitHub API
     */
    suspend fun fetchRepoContents(
        owner: String,
        repo: String,
        path: String = ""
    ): Result<List<GitHubNode>> = withContext(Dispatchers.IO) {
        try {
            val url = "https://api.github.com/repos/$owner/$repo/contents/$path"
            val requestBuilder = Request.Builder()
                .url(url)
                .addHeader("Accept", "application/vnd.github.v3+json")

            token?.let {
                requestBuilder.addHeader("Authorization", "token $it")
            }

            val request = requestBuilder.build()
            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                return@withContext Result.failure(
                    when (response.code) {
                        404 -> Exception("Repository not found or private")
                        403 -> Exception("Rate limited or forbidden")
                        else -> Exception("Failed to fetch: ${response.code}")
                    }
                )
            }

            val body = response.body?.string() ?: return@withContext Result.failure(
                Exception("Empty response")
            )

            val jsonArray = JSONArray(body)
            val nodes = mutableListOf<GitHubNode>()

            for (i in 0 until jsonArray.length()) {
                val item = jsonArray.getJSONObject(i)
                nodes.add(
                    GitHubNode(
                        path = item.getString("path"),
                        type = item.getString("type"),
                        sha = item.getString("sha"),
                        url = item.getString("url")
                    )
                )
            }

            Result.success(nodes)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Fetch file content from GitHub
     */
    suspend fun fetchFileContent(url: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val requestBuilder = Request.Builder()
                .url(url)
                .addHeader("Accept", "application/vnd.github.v3.raw")

            token?.let {
                requestBuilder.addHeader("Authorization", "token $it")
            }

            val request = requestBuilder.build()
            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                return@withContext Result.failure(
                    Exception("Failed to fetch file: ${response.code}")
                )
            }

            val content = response.body?.string() ?: ""
            Result.success(content)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
