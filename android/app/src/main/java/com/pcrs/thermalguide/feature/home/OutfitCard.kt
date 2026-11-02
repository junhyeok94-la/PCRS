package com.pcrs.thermalguide.feature.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.recommendation.*
import com.pcrs.thermalguide.core.ui.*
import com.pcrs.thermalguide.core.weather.LocalWeather
import java.time.Instant
import com.pcrs.thermalguide.core.personal.PersonalProfile

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OutfitCard(weather: LocalWeather, now: Instant, profile: PersonalProfile = PersonalProfile()) {
    val result = OutfitEngine.recommend(weather, now)
    var selected by rememberSaveable(result.regionId, result.periods.first().validAt.toString()) { mutableIntStateOf(0) }
    val period = result.periods[selected]
    val personal = period.outfit?.let { PersonalOutfit.apply(it, period.point!!.temperatureC!!, profile, period.advice) }
    val alternativeOutfit = period.alternatives.firstOrNull()?.let { PersonalOutfit.apply(it, period.point!!.temperatureC!!, profile, period.advice).outfit }?.takeIf { it != personal?.outfit }
    var alternative by rememberSaveable(result.regionId, period.validAt.toString(), personal.toString(), alternativeOutfit.toString()) { mutableStateOf(false) }
    var reasonsOpen by rememberSaveable { mutableStateOf(false) }
    val outfit = if (alternative) alternativeOutfit ?: personal?.outfit else personal?.outfit

    WeatherCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (profile.hasPreferences) "설정 반영 차림" else "기본 차림", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(12.dp)) {
                Text("지역 기준", Modifier.padding(horizontal = 9.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            result.periods.forEachIndexed { index, item ->
                FilterChip(selected = index == selected, onClick = { selected = index }, label = { Text(hourLabel(item.validAt, now)) })
            }
        }
        if (outfit == null) {
            Text("이 시간의 차림을 제안할 자료가 없어요", style = MaterialTheme.typography.bodyMedium)
            Text(if (period.unavailable == UnavailableReason.MISSING_TEMPERATURE) "기온 자료를 받지 못했어요." else "해당 시각의 예보가 필요해요. 다른 시각을 선택하거나 날씨를 새로고침해 주세요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Text("${degree(period.point?.temperatureC)} · ${outerAction(outfit)}", style = MaterialTheme.typography.titleMedium)
            Text("${hourLabel(period.validAt, now)} 예보 기준 · ${if (profile.hasPreferences) "직접 설정 반영" else "성향 미설정"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (result.previousForecast) Text("이전 예보로 만든 차림 · 외출 전 다시 확인해 주세요", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
            OutfitAppearance(outfit)
            AdviceBadges(period.advice)
            if (alternativeOutfit != null) {
                OutlinedButton(onClick = { alternative = !alternative }) { Text(if (alternative) "재킷 차림으로 보기" else "가디건 차림으로 보기") }
            }
            TextButton(onClick = { reasonsOpen = !reasonsOpen }) { Text(if (reasonsOpen) "추천 근거 접기" else "왜 이 차림인가요?") }
            if (reasonsOpen) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(temperatureReason(period, outfit), style = MaterialTheme.typography.bodyMedium)
                    period.advice.filter { it != Advice.LAYER_OPTION }.forEach { Text(adviceReason(it, period), style = MaterialTheme.typography.bodySmall) }
                    personal?.reasons?.forEach { Text(preferenceExplanation(it), style = MaterialTheme.typography.bodySmall) }
                    if (alternative) Text("같은 얇은 겉옷 범주의 가디건 대안이에요. 소재와 개인 체감에 따라 차이가 있어요.", style = MaterialTheme.typography.bodySmall)
                    val temperatures = result.periods.mapNotNull { it.point?.temperatureC?.takeIf { t -> t.isFinite() && t in -60.0..60.0 } }
                    if (temperatures.size >= 2 && temperatures.max() - temperatures.min() >= 5) Text("선택 가능한 시간의 기온은 ${degree(temperatures.min())}~${degree(temperatures.max())}로 달라요. 오래 외출한다면 다른 시각의 차림도 확인해 주세요.", style = MaterialTheme.typography.bodySmall)
                    if (period.missing.isNotEmpty()) Text("자료 없음: ${period.missing.joinToString("·") { when (it) { MissingInput.WIND -> "바람"; MissingInput.HUMIDITY -> "습도"; MissingInput.PRECIPITATION -> "강수" } }}. 해당 항목은 반영하지 않았어요.", style = MaterialTheme.typography.bodySmall)
                    Text("예보 발표 ${result.forecastIssuedAt?.let(::clockTime) ?: "—"} · 기준 ${result.rulesVersion}\n${PersonalOutfit.VERSION} · 기온 구간과 직접 설정한 성향을 이용한 초기 제안이에요. 실제 체감 피드백을 학습한 결과는 아니에요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
internal fun OutfitAppearance(outfit: Outfit) {
    val asset = OutfitAssets.match(outfit)
    val description = "${topLabel(outfit.top)}, ${bottomLabel(outfit.bottom)}, ${outerLabel(outfit)}"
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background, RoundedCornerShape(20.dp)).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (asset != null) Image(
            painterResource(avatarDrawable(asset)),
            contentDescription = description, modifier = Modifier.weight(1.1f).height(254.dp), contentScale = ContentScale.Fit,
        ) else Column(Modifier.weight(1.1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            GarmentSilhouette(Modifier.size(110.dp))
            Text("의류 구성", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f).padding(8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            GarmentLabel("상의", topLabel(outfit.top))
            GarmentLabel("하의", bottomLabel(outfit.bottom))
            GarmentLabel("겉옷", outerLabel(outfit))
        }
    }
    if (asset == null) Text("이 차림의 아바타는 준비 중이에요", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** Neutral garment symbol: it does not impersonate an unavailable dressed avatar. */
@Composable
private fun GarmentSilhouette(modifier: Modifier) {
    val color = MaterialTheme.colorScheme.primary
    Canvas(modifier.semantics { contentDescription = "의류 구성은 옆의 상의·하의·겉옷 설명을 확인하세요" }) {
        val unit = size.minDimension / 100
        val path = Path().apply {
            moveTo(35*unit, 12*unit); lineTo(15*unit, 25*unit); lineTo(24*unit, 42*unit); lineTo(32*unit, 37*unit)
            lineTo(32*unit, 78*unit); lineTo(68*unit, 78*unit); lineTo(68*unit, 37*unit); lineTo(76*unit, 42*unit)
            lineTo(85*unit, 25*unit); lineTo(65*unit, 12*unit)
            cubicTo(60*unit, 25*unit, 40*unit, 25*unit, 35*unit, 12*unit); close()
        }
        drawPath(path, color.copy(alpha = .12f)); drawPath(path, color, style = Stroke(2*unit))
        drawLine(color.copy(alpha = .25f), Offset(40*unit, 68*unit), Offset(60*unit, 68*unit), 2*unit)
    }
}

@Composable private fun GarmentLabel(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable private fun AdviceChip(label: String, art: WeatherArt) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.secondaryContainer) {
        Row(Modifier.padding(horizontal = 9.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            WeatherGlyph(art, size = 18.dp); Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

private fun topLabel(top: Top) = when (top) {
    Top.SHORT_TEE -> "얇은 반팔"; Top.THIN_LONG -> "얇은 긴팔"; Top.MEDIUM_KNIT -> "중간 두께 니트"; Top.THERMAL_AND_KNIT -> "보온 내의 + 니트"
}
private fun bottomLabel(bottom: Bottom) = when (bottom) { Bottom.LIGHT_LONG -> "얇은 긴바지"; Bottom.REGULAR_LONG -> "긴바지"; Bottom.WARM_LONG -> "보온 긴바지" }
private fun outerName(outer: Outer) = when (outer) {
    Outer.NONE -> "없음"; Outer.LIGHT_JACKET -> "가벼운 재킷"; Outer.CARDIGAN -> "얇은 가디건"; Outer.MID_JACKET -> "중간 두께 재킷"; Outer.COAT -> "보온 코트"; Outer.PADDED_COAT -> "두꺼운 패딩"
}
private fun outerLabel(outfit: Outfit) = outerName(outfit.outer) + when (outfit.outerState) { OuterState.CARRIED -> " · 챙기기"; OuterState.WORN -> " · 입기"; OuterState.NONE -> "" }
private fun outerAction(outfit: Outfit) = when (outfit.outerState) {
    OuterState.NONE -> "가벼운 차림"; OuterState.CARRIED -> "겉옷은 챙기기"; OuterState.WORN -> "${outerName(outfit.outer)} 걸치기"
}
internal fun temperatureReason(period: OutfitPeriod, outfit: Outfit): String = when (outfit.outerState) {
    OuterState.CARRIED -> "기온 ${degree(period.point!!.temperatureC)} 기준, 필요할 때 걸칠 겉옷을 챙기는 구성이에요."
    OuterState.NONE -> "기온 ${degree(period.point!!.temperatureC)} 기준, 얇은 옷 위주로 구성했어요. 실내 냉방이나 활동량에 따라 조절해 주세요."
    OuterState.WORN -> "기온 ${degree(period.point!!.temperatureC)} 기준으로 ${outerName(outfit.outer)} 착용을 제안해요. 개인에게 검증된 보온 수준은 아니에요."
}
private fun adviceReason(advice: Advice, period: OutfitPeriod): String = when (advice) {
    Advice.RAIN_GEAR -> "강수 형태 또는 강수확률 ${metric(period.point?.precipitationProbabilityPercent, "%")} 예보를 보고 우산·젖음 대비를 제안해요. 비가 확정됐다는 뜻은 아니에요."
    Advice.SNOW_GEAR -> "눈 또는 비·눈 예보가 있어요. 젖음과 미끄러운 길에 대비해 주세요."
    Advice.WIND_LAYER -> "바람 ${metric(period.point?.windSpeedMs, " m/s")} 예보가 있어요. 겉옷의 바람 차단 여부를 확인해 주세요."
    Advice.HUMID -> "습도 ${metric(period.point?.humidityPercent, "%")} 예보가 있어요. 땀이 잘 마르는 통기성 있는 옷을 고려해 주세요."
    Advice.HOT -> "더운 구간이라 여유 있는 얇은 옷을 제안해요. 이 추천은 폭염 경보나 안전 판단을 대신하지 않아요."
    Advice.COLD -> "추운 구간이에요. 목도리·장갑 등 보온 소품도 함께 확인해 주세요."
    Advice.LAYER_OPTION -> "필요할 때 겉옷을 더할 수 있게 챙겨 주세요."
}

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun AdviceBadges(advice: Set<Advice>) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                advice.forEach { advice ->
                    when (advice) {
                        Advice.RAIN_GEAR -> AdviceChip("우산·방수 준비", WeatherArt.UMBRELLA)
                        Advice.SNOW_GEAR -> AdviceChip("눈·젖음 대비", WeatherArt.SNOW)
                        Advice.WIND_LAYER -> AdviceChip("바람 막는 겉옷", WeatherArt.WIND)
                        Advice.HUMID -> AdviceChip("통기성 챙기기", WeatherArt.DROP)
                        Advice.HOT -> AdviceChip("가볍고 여유 있게", WeatherArt.SUN)
                        Advice.COLD -> AdviceChip("보온 소품 챙기기", WeatherArt.SNOW)
                        Advice.LAYER_OPTION -> Unit // The worn/carried state is already explicit beside the avatar.
                    }
                }
            }
}
