package com.pcrs.thermalguide.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pcrs.thermalguide.core.ui.WeatherArt
import com.pcrs.thermalguide.core.ui.WeatherCard
import com.pcrs.thermalguide.core.ui.WeatherGlyph
import com.pcrs.thermalguide.core.ui.art
import com.pcrs.thermalguide.core.ui.clockTime
import com.pcrs.thermalguide.core.ui.condition
import com.pcrs.thermalguide.core.ui.degree
import com.pcrs.thermalguide.core.ui.hourLabel
import com.pcrs.thermalguide.core.ui.metric
import com.pcrs.thermalguide.core.ui.rainText
import com.pcrs.thermalguide.core.ui.windDirection
import com.pcrs.thermalguide.core.weather.KoreaZone
import com.pcrs.thermalguide.core.weather.LocalWeather
import com.pcrs.thermalguide.core.weather.WeatherPoint
import com.pcrs.thermalguide.core.weather.WeatherProblem
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import java.time.Instant

@Composable
fun HomeScreen(model: WeatherViewModel, onHourly: () -> Unit, modifier: Modifier = Modifier) {
    val weather = model.displayWeather()
    val list = rememberLazyListState()
    var lastRegion by rememberSaveable { mutableStateOf(model.selectedRegion?.id) }
    LaunchedEffect(model.selectedRegion?.id) {
        if (lastRegion != model.selectedRegion?.id) { list.scrollToItem(0); lastRegion = model.selectedRegion?.id }
    }
    LazyColumn(
        modifier.fillMaxSize().background(Brush.verticalGradient(listOf(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.background), endY = 900f)),
        state = list, verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        item(key = "region") {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = model::openPicker, modifier = Modifier.weight(1f)) {
                    Column(Modifier.fillMaxWidth()) {
                        Text(model.selectedRegion?.name.orEmpty(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Medium)
                        Text("지역 날씨", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = model::refresh, enabled = !model.loading) {
                    if (model.loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.Refresh, contentDescription = "날씨 새로고침")
                }
            }
        }
        if (weather == null) {
            item(key = "unavailable") {
                WeatherCard(Modifier.fillMaxWidth()) {
                    if (model.loading) {
                        WeatherGlyph(WeatherArt.SUN_CLOUD, size = 64.dp)
                        Text("날씨를 불러오는 중이에요", style = MaterialTheme.typography.titleMedium)
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                    } else {
                        Text("날씨를 불러오지 못했어요", style = MaterialTheme.typography.titleLarge)
                        Text(if (model.problem == WeatherProblem.RATE_LIMIT) "잠시 후 다시 시도해 주세요." else "연결을 확인한 뒤 다시 시도해 주세요.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = model::refresh) { Text("다시 시도") }
                        TextButton(onClick = model::openPicker) { Text("지역 확인") }
                    }
                }
            }
            if (model.profile.commute != null) item(key = "commute_unavailable") { CommuteCard(model) }
        } else {
            if (weather.isStale || model.problem != null || weather.errors.isNotEmpty()) item(key = "weather_notice") {
                WeatherCard(Modifier.fillMaxWidth()) {
                    Text(when { model.problem != null -> "갱신하지 못했어요 · 이전 자료 표시 중"; weather.isStale -> "갱신이 필요한 이전 자료예요"; else -> "일부 날씨 자료를 받지 못했어요" }, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = model::refresh, enabled = !model.loading) { Text("다시 시도") }
                }
            }
            item(key = "hero") { WeatherHero(weather, model.now) }
            item(key = "hourly") { HourlyPreview(weather, model.now, onHourly) }
            item(key = "outfit") { if (model.profile.commute != null) CommuteCard(model) else OutfitCard(weather, model.now, model.profile) }
            item(key = "details_title") { Text("상세 날씨", Modifier.padding(start = 4.dp, top = 4.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium) }
            val observation = weather.current?.points?.firstOrNull()
            val forecast = weather.forecast?.points?.firstOrNull()
            val humidityPoint = observation?.takeIf { it.humidityPercent != null } ?: forecast
            val windPoint = observation?.takeIf { it.windSpeedMs != null } ?: forecast
            item(key = "humidity_wind") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DetailTile("습도", metric(humidityPoint?.humidityPercent, "%"), pointSource(humidityPoint, observation, model.now), WeatherArt.DROP, Modifier.weight(1f))
                    DetailTile("바람", metric(windPoint?.windSpeedMs, " m/s"), if (windPoint == null) "자료 없음" else windDirection(windPoint.windDirectionDegrees) + " · " + pointSource(windPoint, observation, model.now), WeatherArt.WIND, Modifier.weight(1f))
                }
            }
            item(key = "precipitation") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DetailTile("강수확률", metric(forecast?.precipitationProbabilityPercent, "%"), forecast?.let { "${hourLabel(it.validAt, model.now)} 예보" } ?: "자료 없음", WeatherArt.UMBRELLA, Modifier.weight(1f))
                    DetailTile("강수량", rainText(observation?.precipitation), observation?.let { "${clockTime(it.validAt)} 실황 · 1시간" } ?: "실황 자료 없음", WeatherArt.RAIN, Modifier.weight(1f))
                }
            }
            item(key = "source") {
                WeatherCard(Modifier.fillMaxWidth()) {
                    Text("자료 기준", style = MaterialTheme.typography.labelLarge)
                    weather.current?.let { Text("대표 관측 ${clockTime(it.issuedAt)} · 수신 ${clockTime(it.fetchedAt)}", style = MaterialTheme.typography.bodySmall) }
                    weather.forecast?.let { Text("예보 발표 ${clockTime(it.issuedAt)} · 수신 ${clockTime(it.fetchedAt)}", style = MaterialTheme.typography.bodySmall) }
                    Text(weather.attribution, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun pointSource(point: WeatherPoint?, observation: WeatherPoint?, now: Instant): String = when {
    point == null -> "자료 없음"
    point === observation -> "${clockTime(point.validAt)} 대표 관측"
    else -> "${hourLabel(point.validAt, now)} 예보"
}

@Composable
private fun WeatherHero(weather: LocalWeather, now: Instant) {
    val observation = weather.current?.points?.firstOrNull()
    val forecast = weather.forecast?.points?.firstOrNull()
    val temperaturePoint = observation ?: forecast
    val conditionPoint = observation?.takeIf { it.precipitationType != null && it.precipitationType != "none" } ?: forecast
    val knownCondition = conditionPoint?.takeIf { it.sky != null || it.precipitationType != null && it.precipitationType != "none" }
    val daily = weather.forecast?.daily?.firstOrNull { it.date == now.atZone(KoreaZone).toLocalDate() }
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp)) {
        val font = if (maxWidth < 330.dp) 76.sp else 92.sp
        val largeText = LocalDensity.current.fontScale > 1.2f
        val detail: @Composable () -> Unit = {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                if (knownCondition != null) {
                    WeatherGlyph(knownCondition.art(), size = 58.dp)
                    Text(knownCondition.condition(), style = MaterialTheme.typography.titleMedium)
                    Text(if (knownCondition === observation) "관측 ${clockTime(knownCondition.validAt)}" else "${hourLabel(knownCondition.validAt, now)} 예보", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else Text("하늘 정보 없음", style = MaterialTheme.typography.bodySmall)
                if (daily != null) Text("최고 ${degree(daily.maximumC)} · 최저 ${degree(daily.minimumC)}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        val temperature: @Composable () -> Unit = {
            Column {
                Text(degree(temperaturePoint?.temperatureC), fontSize = font, lineHeight = font, fontWeight = FontWeight.Normal)
                Text(temperaturePoint?.let { if (observation != null) "${clockTime(it.validAt)} 지역 대표 관측" else "${hourLabel(it.validAt, now)} 예보 기온" } ?: "기온 자료 없음", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (largeText) Column(verticalArrangement = Arrangement.spacedBy(16.dp)) { temperature(); detail() }
        else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { temperature(); detail() }
    }
}

@Composable
private fun HourlyPreview(weather: LocalWeather, now: Instant, onHourly: () -> Unit) {
    WeatherCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("오늘의 흐름", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            TextButton(onClick = onHourly) { Text("전체 보기") }
        }
        val points = weather.forecast?.points.orEmpty().take(12)
        if (points.isEmpty()) Text("시간별 예보가 없어요", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(points, key = { it.validAt.toString() }) { point ->
                Column(Modifier.width(64.dp).background(MaterialTheme.colorScheme.background, RoundedCornerShape(16.dp)).padding(horizontal = 4.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(hourLabel(point.validAt, now), style = MaterialTheme.typography.labelMedium)
                    if (point.sky != null || point.precipitationType != null && point.precipitationType != "none") WeatherGlyph(point.art(), size = 30.dp)
                    else Text("—", Modifier.height(30.dp))
                    Text(degree(point.temperatureC), style = MaterialTheme.typography.titleMedium)
                    Text(metric(point.precipitationProbabilityPercent, "%"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Text("시간별 예보 · 아래 숫자는 강수확률", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun DetailTile(title: String, value: String, caption: String, art: WeatherArt, modifier: Modifier = Modifier) {
    WeatherCard(modifier.heightIn(min = 148.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            WeatherGlyph(art, size = 24.dp)
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(value, fontSize = 27.sp, fontWeight = FontWeight.Normal)
        Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
