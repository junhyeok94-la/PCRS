package com.pcrs.thermalguide.feature.home

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.personal.*
import com.pcrs.thermalguide.core.recommendation.*
import com.pcrs.thermalguide.core.ui.*
import com.pcrs.thermalguide.core.weather.KoreaZone
import com.pcrs.thermalguide.core.weather.WeatherViewModel

@OptIn(ExperimentalLayoutApi::class)
@Composable fun CommuteCard(model: WeatherViewModel) {
    val plan = CommuteOutfitPlanner.plan(model.profile, model.commuteWeather, model.now)
    var index by rememberSaveable(plan?.cycle?.departureDate.toString()) { mutableIntStateOf(0) }
    var expanded by rememberSaveable { mutableStateOf(false) }
    WeatherCard(Modifier.fillMaxWidth()) {
        Text("내 출퇴근 차림", style = MaterialTheme.typography.titleLarge)
        if (plan == null) Text("출퇴근 일정을 확인해 주세요") else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("출근·등교", "퇴근·귀가").forEachIndexed { i, label ->
                    FilterChip(index == i, { index = i }, label = { Text(label) })
                }
            }
            val leg = plan.legs[index]
            val date = leg.departure.atZone(KoreaZone)
            val outfit = plan.outfits[index]
            Text(leg.region.name, style = MaterialTheme.typography.titleMedium)
            Text("${date.monthValue}월 ${date.dayOfMonth}일(${dayLabel(date.dayOfWeek)}) ${clockTime(leg.departure)} 출발", style = MaterialTheme.typography.bodyMedium)
            if (model.profile.commute?.weekdays == null) Text("요일 미설정 · 다음 일정을 기준으로 표시", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (leg.status == LegStatus.PAST) Text("이 출발 시각은 지났어요. 귀가 차림을 확인해 보세요.")
            else if (outfit == null) {
                Text(if (model.commuteLoading) "해당 시각의 날씨를 확인하고 있어요" else "이 시각의 차림을 제안할 예보가 없어요")
                if (model.commuteProblems[leg.region.id] != null) Text("연결 또는 자료 제공 상태를 확인해 주세요.", style = MaterialTheme.typography.bodySmall)
            } else {
                Text("${degree(leg.period?.point?.temperatureC)} · ${clockTime(leg.forecastAt)} 예보 기준", style = MaterialTheme.typography.bodyMedium)
                if (leg.previous) Text("이전 예보로 만든 차림 · 외출 전 다시 확인해 주세요", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                OutfitAppearance(outfit)
                AdviceBadges(leg.period!!.advice)
                if (plan.commonBase) Text("출근·귀가의 상의·하의는 같게, 겉옷은 시간별로 조절해요.", style = MaterialTheme.typography.bodySmall)
                else if (plan.outfits.all { it != null }) Text("두 시간의 옷 구성이 달라요. 각각의 차림을 확인해 주세요.", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "근거 접기" else "설정과 추천 근거") }
                if (expanded) {
                    Text(temperatureReason(leg.period!!, outfit), style = MaterialTheme.typography.bodyMedium)
                    plan.reasons[index].forEach { Text(preferenceExplanation(it), style = MaterialTheme.typography.bodySmall) }
                    if (leg.period.missing.isNotEmpty()) Text("일부 날씨 항목은 자료가 없어 반영하지 않았어요.", style = MaterialTheme.typography.bodySmall)
                    leg.period.advice.filter { it != Advice.LAYER_OPTION }.forEach { advice ->
                        Text(when (advice) {
                            Advice.RAIN_GEAR -> "비 예보 또는 높은 강수확률 · 우산과 젖음 대비"
                            Advice.SNOW_GEAR -> "눈·비와 눈 예보 · 젖음과 미끄러운 길 대비"
                            Advice.WIND_LAYER -> "바람 예보 · 겉옷의 바람 차단 여부 확인"
                            Advice.HUMID -> "습도 예보 · 통기성 있는 옷 고려"
                            Advice.HOT -> "더운 구간 · 여유 있는 얇은 차림"
                            Advice.COLD -> "추운 구간 · 보온 소품 확인"
                            Advice.LAYER_OPTION -> "겉옷 준비"
                        }, style = MaterialTheme.typography.bodySmall)
                    }
                    Text("${OutfitEngine.RULES_VERSION} / ${PersonalOutfit.VERSION}\n장소·출발 시각·직접 고른 성향을 반영한 초기 제안이에요. 경로·도착 시각·실내 온도를 측정한 결과는 아니에요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    model.commuteWeather[leg.region.id]?.forecast?.let { source ->
                        Text("기상청 ${hourLabel(source.issuedAt, model.now)} 발표 · 수신 ${clockTime(source.fetchedAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = model::refreshCommute, enabled = !model.commuteLoading) { Text(if (model.commuteLoading) "확인 중" else "날씨 다시 확인") }
            TextButton(onClick = { model.openEditor(PersonalEditor.COMMUTE) }) { Text("출퇴근 수정") }
        }
    }
}
