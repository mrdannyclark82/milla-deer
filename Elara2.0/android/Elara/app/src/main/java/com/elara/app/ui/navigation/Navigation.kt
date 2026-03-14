package com.elara.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.elara.app.ui.screens.*

object ElaraDestinations {
    const val CHAT = "chat"
    const val DASHBOARD = "dashboard"
    const val CREATIVE_STUDIO = "creative_studio"
    const val SANDBOX = "sandbox"
    const val SETTINGS = "settings"
}

@Composable
fun ElaraNavHost(
    navController: NavHostController
) {
    NavHost(
        navController = navController,
        startDestination = ElaraDestinations.CHAT
    ) {
        composable(ElaraDestinations.CHAT) {
            ChatScreen(
                onNavigateToDashboard = { navController.navigate(ElaraDestinations.DASHBOARD) },
                onNavigateToCreativeStudio = { navController.navigate(ElaraDestinations.CREATIVE_STUDIO) },
                onNavigateToSandbox = { navController.navigate(ElaraDestinations.SANDBOX) },
                onNavigateToSettings = { navController.navigate(ElaraDestinations.SETTINGS) }
            )
        }

        composable(ElaraDestinations.DASHBOARD) {
            DashboardScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(ElaraDestinations.CREATIVE_STUDIO) {
            CreativeStudioScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(ElaraDestinations.SANDBOX) {
            SandboxScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(ElaraDestinations.SETTINGS) {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }
    }
}
