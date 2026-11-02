package com.pcrs.thermalguide.feature.hourly

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.FilterChip
import com.pcrs.thermalguide.core.personal.PersonalEditor
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.ui.WeatherCard
import com.pcrs.thermalguide.core.ui.clockTime
import com.pcrs.thermalguide.core.ui.degree
import com.pcrs.thermalguide.core.ui.hourLabel
import com.pcrs.thermalguide.core.ui.metric
import com.pcrs.thermalguide.core.weather.KoreaZone
import com.pcrs.thermalguide.core.weather.WeatherPoint
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import java.time.Duration
import kotlin.math.ceil
import kotlin.math.floor

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HourlyScreen(model: WeatherViewModel, modifier: Modifier = Modifier) {
    var role by rememberSaveable { mutableStateOf("base") }
    val commute = model.profile.commute
    val selectedRole = if (commute == null) "base" else role
    val region = when (selectedRole) { "home" -> commute?.home; "work" -> commute?.work; else -> model.selectedRegion }
    LaunchedEffect(selectedRole, region?.id) { if (selectedRole != "base" && region != null) model.loadHourlyRegion(region.id) }
    val weather = if (selectedRole == "base") model.displayWeather() else model.commuteWeather[region?.id]?.forDisplay(model.now)
    val loading = if (selectedRole == "base") model.loading else model.hourlyRegionLoading == region?.id
    val problem = if (selectedRole == "base") model.problem else model.commuteProblems[region?.id]
    val refresh: () -> Unit = { if (selectedRole == "base") model.refresh() else region?.let { model.loadHourlyRegion(it.id, true) }; Unit }
    val points = weather?.forecast?.points.orEmpty()
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("시간별 날씨", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Medium)
            if (commute != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("base" to "기준 지역", "home" to "집", "work" to "직장·학교").forEach { (key, label) ->
                    FilterChip(selectedRole == key, { role = key }, label = { Text(label) })
                }
            }
            TextButton(onClick = { if (selectedRole == "base") model.openPicker() else model.openEditor(PersonalEditor.COMMUTE) }) { Text(region?.name.orEmpty()) }
        }
        if (points.isEmpty()) item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text(if (loading) "시간별 예보를 불러오는 중이에요" else "시간별 예보를 받지 못했어요")
                Button(onClick = refresh, enabled = !loading) { Text("다시 시도") }
            }
        }
        else {
            item {
                WeatherCard(Modifier.fillMaxWidth()) {
                    Text("기온 변화", style = MaterialTheme.typography.titleMedium)
                    if (weather?.forecast?.stale == true || problem != null) Text("이전 예보 표시 중", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (weather?.forecast?.stale == true || problem != null) TextButton(onClick = refresh, enabled = !loading) { Text("다시 확인") }
                    TemperatureChart(points.take(24))
                    weather?.forecast?.let { Text("예보 발표 ${clockTime(it.issuedAt)} · 수신 ${clockTime(it.fetchedAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 5.dp)) {
                    listOf("시각", "기온", "강수확률", "바람(m/s)").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            itemsIndexed(points, key = { _, point -> point.validAt.toString() }) { index, point ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val date = point.validAt.atZone(KoreaZone).toLocalDate()
                    if (index == 0 || points[index - 1].validAt.atZone(KoreaZone).toLocalDate() != date) {
                        Text("${date.monthValue}월 ${date.dayOfMonth}일", Modifier.padding(top = 10.dp, start = 5.dp), style = MaterialTheme.typography.labelLarge)
                    }
                    WeatherCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth()) {
                            Text(clockTime(point.validAt), Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                            Text(degree(point.temperatureC), Modifier.weight(1f), textAlign = TextAlign.Center, fontWeight = FontWeight.Medium)
                            Text(metric(point.precipitationProbabilityPercent, "%"), Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                            Text(metric(point.windSpeedMs), Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            item { Text("기상청 단기예보 · 시간별 예보를 앱 표시용으로 정리", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun TemperatureChart(points: List<WeatherPoint>) {
    val values = points.filter { it.temperatureC != null }
    if (values.size < 2) { Text("그래프를 그릴 자료가 부족해요", style = MaterialTheme.typography.bodySmall); return }
    val minimum = floor(values.minOf { it.temperatureC!! }) - 2
    val maximum = ceil(values.maxOf { it.temperatureC!! }) + 2
    val first = values.first().validAt
    val seconds = Duration.between(first, values.last().validAt).seconds.coerceAtLeast(1)
    val line = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    Row {
        Column(Modifier.width(34.dp).height(142.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(degree(maximum), style = MaterialTheme.typography.labelSmall)
            Text("°C", style = MaterialTheme.typography.labelSmall)
            Text(degree(minimum), style = MaterialTheme.typography.labelSmall)
        }
        Canvas(Modifier.weight(1f).height(142.dp).semantics { contentDescription = "시간별 기온 그래프. 아래 목록에서 각 시각의 기온을 확인할 수 있습니다." }) {
            val inset = 5.dp.toPx()
            val width = size.width - 2 * inset
            val height = size.height - 2 * inset
            repeat(3) { n -> val y = inset + height * n / 2; drawLine(grid, Offset(inset, y), Offset(size.width - inset, y), 1.dp.toPx()) }
            fun position(point: WeatherPoint) = Offset(inset + width * Duration.between(first, point.validAt).seconds.toFloat() / seconds,
                inset + height * (1 - ((point.temperatureC!! - minimum) / (maximum - minimum)).toFloat()))
            values.zipWithNext().forEach { (a, b) ->
                if (Duration.between(a.validAt, b.validAt).toMinutes() <= 90) drawLine(line, position(a), position(b), 2.dp.toPx(), StrokeCap.Round)
            }
            values.forEach { drawCircle(line, 2.5.dp.toPx(), position(it)) }
        }
    }
    Row(Modifier.fillMaxWidth().padding(start = 34.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        (0..3).forEach { index ->
            val time = first.plusSeconds(seconds * index / 3)
            Text(hourLabel(time, first), style = MaterialTheme.typography.labelSmall)
        }
    }
}
