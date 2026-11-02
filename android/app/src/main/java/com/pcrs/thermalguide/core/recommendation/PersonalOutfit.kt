package com.pcrs.thermalguide.core.recommendation

import com.pcrs.thermalguide.core.personal.*
import com.pcrs.thermalguide.core.weather.*
import java.time.Instant
import java.time.temporal.ChronoUnit

enum class PreferenceReason { COLD_MORE, COLD_LESS, HEAT_MORE, WALK_LAYERS, BIKE_WIND, INDOOR_COOL, INDOOR_WARM, CARRY_OUTER, WIND_PROTECTION }
data class PersonalizedOutfit(val outfit: Outfit, val reasons: Set<PreferenceReason>)
object PersonalOutfit {
    const val VERSION = "preference-0.1"
    fun apply(base: Outfit, temperature: Double, profile: PersonalProfile, advice: Set<Advice> = emptySet()): PersonalizedOutfit {
        var outfit = base
        val reasons = mutableSetOf<PreferenceReason>()
        if (profile.cold == Sensitivity.HIGH && temperature < 20) {
            outfit = when {
                temperature >= 17 -> base.copy(outer = Outer.LIGHT_JACKET, outerState = OuterState.WORN)
                temperature >= 12 -> Outfit(Top.MEDIUM_KNIT, Bottom.REGULAR_LONG, Outer.MID_JACKET, OuterState.WORN)
                temperature >= 9 -> Outfit(Top.MEDIUM_KNIT, Bottom.WARM_LONG, Outer.COAT, OuterState.WORN)
                temperature >= 5 -> Outfit(Top.THERMAL_AND_KNIT, Bottom.WARM_LONG, Outer.PADDED_COAT, OuterState.WORN)
                else -> base
            }
            reasons += PreferenceReason.COLD_MORE
        } else if (profile.cold == Sensitivity.LOW && temperature >= 12 && temperature < 20) {
            outfit = if (temperature >= 17) base.copy(outer = Outer.NONE, outerState = OuterState.NONE)
                else base.copy(outerState = OuterState.CARRIED)
            reasons += PreferenceReason.COLD_LESS
        }
        if (profile.heat == Sensitivity.HIGH && temperature >= 17) {
            if (temperature >= 20 && temperature < 23) outfit = Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE)
            // Explicit walking preference resolves this transitional band; cold preference remains on colder legs.
            if (temperature < 20 && profile.walks && outfit.outerState == OuterState.WORN) outfit = outfit.copy(outerState = OuterState.CARRIED)
            reasons += PreferenceReason.HEAT_MORE
        }
        if (profile.walks) reasons += PreferenceReason.WALK_LAYERS
        if (profile.transport == Transport.BIKE) reasons += PreferenceReason.BIKE_WIND
        if (profile.indoor == Indoor.COOL) {
            if (temperature >= 20 && outfit.outer == Outer.NONE) outfit = outfit.copy(outer = Outer.LIGHT_JACKET, outerState = OuterState.CARRIED)
            reasons += PreferenceReason.INDOOR_COOL
        }
        if (profile.indoor == Indoor.WARM) reasons += PreferenceReason.INDOOR_WARM
        if (Advice.WIND_LAYER in advice && outfit.outer == Outer.NONE && base.outer != Outer.NONE) {
            outfit = outfit.copy(outer = base.outer, outerState = OuterState.CARRIED)
            reasons += PreferenceReason.WIND_PROTECTION
        }
        return PersonalizedOutfit(outfit, reasons)
    }
}

enum class LegStatus { AVAILABLE, PAST, UNAVAILABLE }
data class CommuteLeg(val outbound: Boolean, val region: WeatherRegion, val departure: Instant, val forecastAt: Instant,
    val period: OutfitPeriod?, val status: LegStatus, val previous: Boolean)
data class CommuteOutfits(val cycle: CommuteCycle, val legs: List<CommuteLeg>, val outfits: List<Outfit?>,
    val reasons: List<Set<PreferenceReason>>, val commonBase: Boolean)
object CommuteOutfitPlanner {
    fun plan(profile: PersonalProfile, weather: Map<String, LocalWeather>, now: Instant): CommuteOutfits? {
        val settings = profile.commute ?: return null
        val cycle = CommuteSchedule.next(settings, now) ?: return null
        val legs = listOf(Triple(true, settings.home, cycle.outbound), Triple(false, settings.work, cycle.returning)).map { (outbound, region, departure) ->
            val hour = departure.truncatedTo(ChronoUnit.HOURS)
            val forecast = weather[region.id]?.forDisplay(now)?.forecast
            val point = forecast?.points?.singleOrNull { it.validAt == hour }
            val period = point?.takeIf { departure >= now }?.let(OutfitEngine::forPoint)
            CommuteLeg(outbound, region, departure, hour, period,
                if (departure < now) LegStatus.PAST else if (period?.outfit == null) LegStatus.UNAVAILABLE else LegStatus.AVAILABLE,
                forecast?.stale == true)
        }
        val adjusted = legs.map { leg -> leg.period?.outfit?.let { PersonalOutfit.apply(it, leg.period.point!!.temperatureC!!, profile, leg.period.advice) } }
        val available = adjusted.map { it?.outfit }.toMutableList()
        val reasons = adjusted.map { it?.reasons.orEmpty() }.toMutableList()
        // A common base is only promised when both actual recommendations have identical inner garments.
        // Otherwise show each time's outfit separately rather than forcing one arbitrary all-day outfit.
        val common = available.all { it != null } && available[0]!!.top == available[1]!!.top && available[0]!!.bottom == available[1]!!.bottom
        if (common) for (index in 0..1) {
            val own = available[index]!!
            val other = available[1 - index]!!
            if (own.outer == Outer.NONE && other.outer != Outer.NONE) {
                available[index] = own.copy(outer = other.outer, outerState = OuterState.CARRIED)
                reasons[index] = reasons[index] + PreferenceReason.CARRY_OUTER
            }
        }
        return CommuteOutfits(cycle, legs, available, reasons, common)
    }
}
