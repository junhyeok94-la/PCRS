package com.pcrs.thermalguide.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF2D628C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCECF9),
    onPrimaryContainer = Color(0xFF193B58),
    secondaryContainer = Color(0xFFE5EFF7),
    onSecondaryContainer = Color(0xFF214A69),
    background = Color(0xFFF0F5FA),
    surface = Color.White,
    surfaceVariant = Color(0xFFE9F0F6),
    onSurface = Color(0xFF18344D),
    onSurfaceVariant = Color(0xFF536E82),
    outlineVariant = Color(0xFFD8E5EF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB7DDFC),
    onPrimary = Color(0xFF163A54),
    primaryContainer = Color(0xFF284C66),
    onPrimaryContainer = Color(0xFFDEEFFC),
    secondaryContainer = Color(0xFF304C60),
    onSecondaryContainer = Color(0xFFD7EAF8),
    background = Color(0xFF142330),
    surface = Color(0xFF213543),
    surfaceVariant = Color(0xFF2B4253),
    onSurface = Color(0xFFE7F1F8),
    onSurfaceVariant = Color(0xFFB8CDDD),
    outlineVariant = Color(0xFF3D5668),
)

@Composable
fun ThermalGuideTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
