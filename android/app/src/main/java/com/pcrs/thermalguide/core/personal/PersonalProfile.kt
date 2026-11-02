package com.pcrs.thermalguide.core.personal

import com.pcrs.thermalguide.core.weather.KoreaZone
import com.pcrs.thermalguide.core.weather.WeatherRegion
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

enum class Sensitivity { LOW, NORMAL, HIGH }
enum class Walking { NONE, SHORT, MEDIUM, LONG }
enum class Transport { TRANSIT, WALK, CAR, BIKE }
enum class Indoor { COOL, WARM, VARIABLE }
data class CommuteSettings(
    val home: WeatherRegion, val work: WeatherRegion,
    val outbound: LocalTime, val returning: LocalTime, val returnNextDay: Boolean,
    val weekdays: Set<DayOfWeek>? = null,
) {
    fun valid(): Boolean = (returnNextDay || returning > outbound) && weekdays?.isEmpty() != true &&
        outbound.second == 0 && outbound.nano == 0 && returning.second == 0 && returning.nano == 0 &&
        listOf(home, work).all { it.id.matches(Regex("[0-9]{10}")) && it.name.isNotBlank() }
}
data class PersonalProfile(
    val commute: CommuteSettings? = null,
    val cold: Sensitivity? = null, val heat: Sensitivity? = null,
    val walking: Walking? = null, val transport: Transport? = null, val indoor: Indoor? = null,
) {
    val hasPreferences: Boolean get() = listOf(cold, heat, walking, transport, indoor).any { it != null }
    val walks: Boolean get() = walking in setOf(Walking.SHORT, Walking.MEDIUM, Walking.LONG) || transport == Transport.WALK
}

data class CommuteCycle(val departureDate: LocalDate, val outbound: Instant, val returning: Instant)
object CommuteSchedule {
    /** Include yesterday's overnight trip, and keep today's outbound until its return has passed. */
    fun next(settings: CommuteSettings, now: Instant): CommuteCycle? {
        if (!settings.valid()) return null
        val today = now.atZone(KoreaZone).toLocalDate()
        return (-1L..7L).map { today.plusDays(it) }
            .filter { settings.weekdays == null || it.dayOfWeek in settings.weekdays }
            .map { date -> CommuteCycle(date,
                date.atTime(settings.outbound).atZone(KoreaZone).toInstant(),
                date.plusDays(if (settings.returnNextDay) 1 else 0).atTime(settings.returning).atZone(KoreaZone).toInstant()) }
            .firstOrNull { it.returning >= now }
    }
}

enum class PersonalEditor { COMMUTE, SENSITIVITY, ROUTINE }
enum class RegionPurpose { HOME, COMMUTE_HOME, COMMUTE_WORK }

data class ProfileDraft(
    val enabled: Boolean = false, val home: WeatherRegion? = null, val work: WeatherRegion? = null,
    val outbound: String = "", val returning: String = "", val returnNextDay: Boolean = false,
    val weekdays: Set<DayOfWeek>? = null,
    val cold: Sensitivity? = null, val heat: Sensitivity? = null,
    val walking: Walking? = null, val transport: Transport? = null, val indoor: Indoor? = null,
) {
    fun error(): String? = when {
        enabled && (home == null || work == null) -> "집과 직장·학교 지역을 모두 선택해 주세요."
        enabled && (time(outbound) == null || time(returning) == null) -> "출발 시각을 HH:mm 형식으로 입력해 주세요."
        enabled && !returnNextDay && time(returning)!! <= time(outbound)!! -> "귀가 출발이 더 이르거나 같다면 ‘다음 날’을 선택해 주세요."
        transport == Transport.WALK && walking == Walking.NONE -> "도보 이동을 선택했다면 걷는 시간을 확인해 주세요."
        else -> null
    }
    fun profile(): PersonalProfile {
        require(error() == null)
        return PersonalProfile(if (enabled) CommuteSettings(home!!, work!!, time(outbound)!!, time(returning)!!, returnNextDay, weekdays) else null,
            cold, heat, walking, transport, indoor)
    }
    companion object {
        fun time(value: String): LocalTime? = if (value.matches(Regex("[0-2][0-9]:[0-5][0-9]"))) runCatching { LocalTime.parse(value) }.getOrNull() else null
        fun from(profile: PersonalProfile) = ProfileDraft(profile.commute != null, profile.commute?.home, profile.commute?.work,
            profile.commute?.outbound?.toString().orEmpty(), profile.commute?.returning?.toString().orEmpty(), profile.commute?.returnNextDay ?: false,
            profile.commute?.weekdays, profile.cold, profile.heat, profile.walking, profile.transport, profile.indoor)
    }
}
