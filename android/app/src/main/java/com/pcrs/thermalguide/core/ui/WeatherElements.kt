package com.pcrs.thermalguide.core.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.weather.KoreaZone
import com.pcrs.thermalguide.core.weather.RainAmount
import com.pcrs.thermalguide.core.weather.WeatherPoint
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

enum class WeatherArt { SUN, SUN_CLOUD, CLOUD, RAIN, SNOW, NIGHT, DROP, WIND, UMBRELLA }

fun WeatherPoint.art(): WeatherArt = when (precipitationType) {
    "rain", "shower", "drizzle", "rain_snow", "drizzle_snow" -> WeatherArt.RAIN
    "snow", "flurries" -> WeatherArt.SNOW
    else -> when (sky) {
        "overcast" -> WeatherArt.CLOUD
        "partly_cloudy" -> WeatherArt.SUN_CLOUD
        "clear" -> if (validAt.atZone(KoreaZone).hour in 7..17) WeatherArt.SUN else WeatherArt.NIGHT
        else -> WeatherArt.CLOUD
    }
}

fun WeatherPoint.condition(): String = when (precipitationType) {
    "rain", "drizzle" -> "비"
    "shower" -> "소나기"
    "snow", "flurries" -> "눈"
    "rain_snow", "drizzle_snow" -> "비와 눈"
    else -> when (sky) { "clear" -> "맑음"; "partly_cloudy" -> "구름 많음"; "overcast" -> "흐림"; else -> "하늘 정보 없음" }
}

fun degree(value: Double?): String = value?.let { "${it.roundToInt()}°" } ?: "—"
fun metric(value: Double?, unit: String = ""): String = value?.let {
    (if (it == it.toLong().toDouble()) it.toLong().toString() else String.format(Locale.KOREA, "%.1f", it)) + unit
} ?: "—"

fun rainText(amount: RainAmount?): String = when (amount?.kind) {
    "none" -> "0 mm"
    "exact" -> metric(amount.valueMm, " mm")
    "less_than" -> amount.upperBoundMm?.let { metric(it, "mm 미만") } ?: "—"
    "at_least" -> amount.lowerBoundMm?.let { metric(it, "mm 이상") } ?: "—"
    "range" -> if (amount.lowerBoundMm != null && amount.upperBoundMm != null) "${metric(amount.lowerBoundMm)}~${metric(amount.upperBoundMm)}mm" else "—"
    else -> "—"
}

fun windDirection(value: Double?): String = value?.let {
    listOf("북", "북동", "동", "남동", "남", "남서", "서", "북서")[(it / 45).roundToInt() % 8] + "풍"
} ?: "풍향 정보 없음"

fun clockTime(instant: Instant): String = DateTimeFormatter.ofPattern("HH:mm", Locale.KOREA).format(instant.atZone(KoreaZone))
fun hourLabel(instant: Instant, now: Instant): String {
    val time = instant.atZone(KoreaZone)
    val date = now.atZone(KoreaZone).toLocalDate()
    val prefix = when (time.toLocalDate()) { date -> ""; date.plusDays(1) -> "내일 "; else -> "${time.monthValue}/${time.dayOfMonth} " }
    return "$prefix${time.hour}시"
}

@Composable
fun WeatherCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier = modifier, shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
fun WeatherGlyph(art: WeatherArt, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val blue = MaterialTheme.colorScheme.primary
    val cloud = Color(0xFFD5E5F1)
    val sun = Color(0xFFFAC84A)
    Canvas(modifier = modifier.size(size)) {
        scale(this.size.minDimension / 100, pivot = Offset.Zero) {
            fun sunshine(x: Float, y: Float, radius: Float) {
                repeat(8) { index ->
                    val angle = index * Math.PI / 4
                    drawLine(sun, Offset(x + cos(angle).toFloat() * (radius + 7), y + sin(angle).toFloat() * (radius + 7)),
                        Offset(x + cos(angle).toFloat() * (radius + 15), y + sin(angle).toFloat() * (radius + 15)), 5f, StrokeCap.Round)
                }
                drawCircle(sun, radius, Offset(x, y))
            }
            fun cloudShape(y: Float) {
                drawRoundRect(cloud, Offset(14f, y + 12), Size(74f, 29f), CornerRadius(15f))
                drawCircle(cloud, 18f, Offset(36f, y + 12))
                drawCircle(cloud, 23f, Offset(60f, y + 5))
            }
            when (art) {
                WeatherArt.SUN -> sunshine(50f, 50f, 23f)
                WeatherArt.SUN_CLOUD -> { sunshine(30f, 31f, 16f); cloudShape(42f) }
                WeatherArt.CLOUD -> cloudShape(38f)
                WeatherArt.RAIN, WeatherArt.SNOW -> {
                    cloudShape(27f)
                    repeat(3) { index ->
                        val x = 28f + index * 23
                        if (art == WeatherArt.RAIN) drawLine(blue, Offset(x + 3, 77f), Offset(x - 1, 88f), 5f, StrokeCap.Round)
                        else { drawLine(blue, Offset(x - 4, 81f), Offset(x + 4, 81f), 3f); drawLine(blue, Offset(x, 77f), Offset(x, 85f), 3f) }
                    }
                }
                WeatherArt.NIGHT -> {
                    val moon = Path().apply { moveTo(67f, 15f); cubicTo(17f, 20f, 12f, 80f, 59f, 87f); cubicTo(79f, 88f, 92f, 75f, 92f, 66f); cubicTo(48f, 83f, 35f, 37f, 67f, 15f); close() }
                    drawPath(moon, Color(0xFF86B9EA))
                }
                WeatherArt.DROP -> {
                    val drop = Path().apply { moveTo(50f, 10f); cubicTo(38f, 31f, 20f, 49f, 20f, 66f); cubicTo(20f, 104f, 81f, 104f, 81f, 66f); cubicTo(81f, 49f, 62f, 31f, 50f, 10f); close() }
                    drawPath(drop, Color(0xFF79B2DF))
                    drawLine(Color.White.copy(alpha = .7f), Offset(34f, 65f), Offset(39f, 77f), 5f, StrokeCap.Round)
                }
                WeatherArt.WIND -> {
                    drawLine(blue, Offset(10f, 40f), Offset(72f, 40f), 6f, StrokeCap.Round)
                    drawArc(blue, 260f, 240f, false, Offset(59f, 19f), Size(25f, 22f), style = Stroke(6f, cap = StrokeCap.Round))
                    drawLine(blue, Offset(20f, 55f), Offset(88f, 55f), 6f, StrokeCap.Round)
                    drawLine(blue, Offset(10f, 70f), Offset(60f, 70f), 6f, StrokeCap.Round)
                }
                WeatherArt.UMBRELLA -> {
                    val umbrella = Path().apply { moveTo(12f, 51f); cubicTo(18f, 5f, 82f, 5f, 88f, 51f); close() }
                    drawPath(umbrella, Color(0xFF79B2DF))
                    drawLine(blue, Offset(50f, 51f), Offset(50f, 78f), 5f, StrokeCap.Round)
                    drawArc(blue, 0f, 180f, false, Offset(31f, 67f), Size(19f, 23f), style = Stroke(5f, cap = StrokeCap.Round))
                }
            }
        }
    }
}
