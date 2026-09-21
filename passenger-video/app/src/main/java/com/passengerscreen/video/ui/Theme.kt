package com.passengerscreen.video.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7FB2FF),
    onPrimary = Color(0xFF00305F),
    background = Color(0xFF0E1116),
    onBackground = Color(0xFFE3E6EB),
    surface = Color(0xFF161A21),
    onSurface = Color(0xFFE3E6EB),
    surfaceVariant = Color(0xFF232833),
    onSurfaceVariant = Color(0xFFBFC5D0)
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF1B5FBF),
    background = Color(0xFFF7F8FA),
    surface = Color(0xFFFFFFFF)
)

@Composable
fun PassengerScreenTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
