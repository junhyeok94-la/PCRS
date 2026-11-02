package com.pcrs.thermalguide.core.ui

import com.pcrs.thermalguide.core.personal.*
import com.pcrs.thermalguide.core.recommendation.PreferenceReason
import java.time.DayOfWeek

fun sensitivityLabel(value: Sensitivity?) = when (value) { null -> "미설정"; Sensitivity.LOW -> "덜 타요"; Sensitivity.NORMAL -> "보통"; Sensitivity.HIGH -> "많이 타요" }
fun walkingLabel(value: Walking?) = when (value) { null -> "미설정"; Walking.NONE -> "거의 안 걸어요"; Walking.SHORT -> "10분 이내"; Walking.MEDIUM -> "10~30분"; Walking.LONG -> "30분 이상" }
fun transportLabel(value: Transport?) = when (value) { null -> "미설정"; Transport.TRANSIT -> "대중교통"; Transport.WALK -> "도보"; Transport.CAR -> "자동차"; Transport.BIKE -> "자전거" }
fun indoorLabel(value: Indoor?) = when (value) { null -> "미설정"; Indoor.COOL -> "실내가 서늘해요"; Indoor.WARM -> "실내가 더워요"; Indoor.VARIABLE -> "일정하지 않아요" }
fun dayLabel(day: DayOfWeek) = listOf("월", "화", "수", "목", "금", "토", "일")[day.value - 1]
fun preferenceExplanation(reason: PreferenceReason): String = when (reason) {
    PreferenceReason.COLD_MORE -> "추위를 많이 타는 설정으로 보온을 우선했어요."
    PreferenceReason.COLD_LESS -> "추위를 덜 타는 설정으로 온화한 구간의 겉옷을 줄였어요."
    PreferenceReason.HEAT_MORE -> "더위를 많이 타는 설정으로 따뜻한 구간의 가벼운 차림·탈착을 우선했어요."
    PreferenceReason.WALK_LAYERS -> "설정한 도보 이동에서는 겉옷을 조절하고 땀이 차면 벗어 주세요."
    PreferenceReason.BIKE_WIND -> "자전거 이동 설정이 있어요. 겉옷의 바람 차단 여부를 확인해 주세요."
    PreferenceReason.INDOOR_COOL -> "실내가 서늘하다는 설정으로 더운 날에도 얇은 겉옷을 챙길 수 있게 했어요."
    PreferenceReason.INDOOR_WARM -> "실내가 덥다는 설정이 있어요. 도착 후 겉옷을 벗을 수 있는 구성이 좋아요."
    PreferenceReason.CARRY_OUTER -> "다른 출발 시각에 필요한 겉옷을 챙길 수 있게 했어요. 입지 않는 때에는 휴대해 주세요."
    PreferenceReason.WIND_PROTECTION -> "바람 예보가 있어 겉옷을 챙기도록 했어요. 바람을 막는 소재인지 확인해 주세요."
}
