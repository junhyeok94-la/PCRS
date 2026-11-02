package com.pcrs.thermalguide.core.recommendation

import com.pcrs.thermalguide.core.weather.LocalWeather
import com.pcrs.thermalguide.core.weather.WeatherPoint
import java.time.Instant
import java.time.temporal.ChronoUnit

enum class Top { SHORT_TEE, THIN_LONG, MEDIUM_KNIT, THERMAL_AND_KNIT }
enum class Bottom { LIGHT_LONG, REGULAR_LONG, WARM_LONG }
enum class Outer { NONE, LIGHT_JACKET, CARDIGAN, MID_JACKET, COAT, PADDED_COAT }
enum class OuterState { NONE, CARRIED, WORN }
data class Outfit(val top: Top, val bottom: Bottom, val outer: Outer, val outerState: OuterState)
enum class Advice { RAIN_GEAR, SNOW_GEAR, WIND_LAYER, HUMID, HOT, COLD, LAYER_OPTION }
enum class MissingInput { WIND, HUMIDITY, PRECIPITATION }
enum class UnavailableReason { NO_FORECAST, MISSING_HOUR, MISSING_TEMPERATURE }
enum class AvatarAsset { THIN_LONG, THIN_LONG_JACKET, THIN_LONG_CARDIGAN, THIN_LIGHT, SHORT_LIGHT, KNIT_MID_JACKET, KNIT_COAT, THERMAL_KNIT_PADDED }

/** Rendering support never restricts which clothes the weather rules can recommend. */
object OutfitAssets {
    fun match(outfit: Outfit): AvatarAsset? = when (outfit) {
        Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.NONE, OuterState.NONE),
        Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED),
        Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.CARRIED) -> AvatarAsset.THIN_LONG
        Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.WORN) -> AvatarAsset.THIN_LONG_JACKET
        Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.WORN) -> AvatarAsset.THIN_LONG_CARDIGAN
        Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
        Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED) -> AvatarAsset.THIN_LIGHT
        Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
        Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED) -> AvatarAsset.SHORT_LIGHT
        Outfit(Top.MEDIUM_KNIT, Bottom.REGULAR_LONG, Outer.MID_JACKET, OuterState.WORN) -> AvatarAsset.KNIT_MID_JACKET
        Outfit(Top.MEDIUM_KNIT, Bottom.WARM_LONG, Outer.COAT, OuterState.WORN) -> AvatarAsset.KNIT_COAT
        Outfit(Top.THERMAL_AND_KNIT, Bottom.WARM_LONG, Outer.PADDED_COAT, OuterState.WORN) -> AvatarAsset.THERMAL_KNIT_PADDED
        else -> null
    }
}

data class OutfitPeriod(
    val validAt: Instant,
    val point: WeatherPoint?,
    val outfit: Outfit?,
    val alternatives: List<Outfit> = emptyList(),
    val advice: Set<Advice> = emptySet(),
    val missing: Set<MissingInput> = emptySet(),
    val unavailable: UnavailableReason? = null,
)

data class OutfitRecommendation(
    val rulesVersion: String,
    val regionId: String,
    val generatedAt: Instant,
    val forecastIssuedAt: Instant?,
    val previousForecast: Boolean,
    val periods: List<OutfitPeriod>,
)

/** Editorial starting rules, not a physiological model or a learned personal preference. */
object OutfitEngine {
    const val RULES_VERSION = "regional-0.1"

    fun recommend(weather: LocalWeather, now: Instant): OutfitRecommendation {
        // Independently enforce the offline bounds even if a caller passes an unfiltered response.
        val forecast = weather.forDisplay(now).forecast
        val currentHour = now.truncatedTo(ChronoUnit.HOURS)
        // KMA can begin at the following hour. Use its real time label, never call it "now".
        val start = forecast?.points?.map { it.validAt }
            ?.filter { it >= currentHour && it <= currentHour.plus(1, ChronoUnit.HOURS) }
            ?.minOrNull() ?: currentHour
        val periods = listOf(0L, 3L, 6L).map { offset ->
            val target = start.plus(offset, ChronoUnit.HOURS)
            val point = forecast?.points?.singleOrNull { it.validAt == target }
            when {
                forecast == null -> OutfitPeriod(target, null, null, unavailable = UnavailableReason.NO_FORECAST)
                point == null -> OutfitPeriod(target, null, null, unavailable = UnavailableReason.MISSING_HOUR)
                point.temperatureC == null || !point.temperatureC.isFinite() || point.temperatureC !in -60.0..60.0 ->
                    OutfitPeriod(target, point, null, unavailable = UnavailableReason.MISSING_TEMPERATURE)
                else -> forPoint(point)
            }
        }
        return OutfitRecommendation(RULES_VERSION, weather.region.id, now, forecast?.issuedAt, forecast?.stale == true, periods)
    }

    fun forPoint(point: WeatherPoint): OutfitPeriod {
        val temperature = point.temperatureC?.takeIf { it.isFinite() && it in -60.0..60.0 }
            ?: return OutfitPeriod(point.validAt, point, null, unavailable = UnavailableReason.MISSING_TEMPERATURE)
        val outfit = when {
            temperature >= 23 -> Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE)
            temperature >= 20 -> Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE)
            temperature >= 17 -> Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED)
            temperature >= 12 -> Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.WORN)
            temperature >= 9 -> Outfit(Top.MEDIUM_KNIT, Bottom.REGULAR_LONG, Outer.MID_JACKET, OuterState.WORN)
            temperature >= 5 -> Outfit(Top.MEDIUM_KNIT, Bottom.WARM_LONG, Outer.COAT, OuterState.WORN)
            else -> Outfit(Top.THERMAL_AND_KNIT, Bottom.WARM_LONG, Outer.PADDED_COAT, OuterState.WORN)
        }
        val wind = point.windSpeedMs?.takeIf { it.isFinite() && it in 0.0..100.0 }
        val humidity = point.humidityPercent?.takeIf { it.isFinite() && it in 0.0..100.0 }
        val probability = point.precipitationProbabilityPercent?.takeIf { it.isFinite() && it in 0.0..100.0 }
        val knownTypes = setOf("none", "rain", "shower", "drizzle", "rain_snow", "drizzle_snow", "snow", "flurries")
        val type = point.precipitationType?.takeIf { it in knownTypes }
        val advice = buildSet {
            if (type in setOf("snow", "flurries", "rain_snow", "drizzle_snow")) add(Advice.SNOW_GEAR)
            else if (type != null && type != "none" || probability != null && probability >= 60) add(Advice.RAIN_GEAR)
            if (wind != null && wind >= 5 && temperature < 20) add(Advice.WIND_LAYER)
            if (humidity != null && humidity >= 70 && temperature >= 20) add(Advice.HUMID)
            if (temperature >= 28) add(Advice.HOT)
            if (temperature < 5) add(Advice.COLD)
            if (outfit.outerState == OuterState.CARRIED) add(Advice.LAYER_OPTION)
        }
        // Only propose same-category layering alternatives; do not pad the list with unsuitable looks.
        val alternatives = if (temperature >= 12 && temperature < 20 && Advice.WIND_LAYER !in advice &&
            Advice.RAIN_GEAR !in advice && Advice.SNOW_GEAR !in advice) listOf(outfit.copy(outer = Outer.CARDIGAN)) else emptyList()
        val missing = buildSet {
            if (wind == null) add(MissingInput.WIND)
            if (humidity == null) add(MissingInput.HUMIDITY)
            if (probability == null && type == null) add(MissingInput.PRECIPITATION)
        }
        return OutfitPeriod(point.validAt, point, outfit, alternatives, advice, missing)
    }
}
