package com.pcrs.thermalguide.core.weather

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

val KoreaZone: ZoneId = ZoneId.of("Asia/Seoul")

data class WeatherRegion(val id: String, val name: String)

data class RainAmount(
    val kind: String,
    val valueMm: Double? = null,
    val lowerBoundMm: Double? = null,
    val upperBoundMm: Double? = null,
)

data class WeatherPoint(
    val validAt: Instant,
    val temperatureC: Double?,
    val humidityPercent: Double?,
    val windSpeedMs: Double?,
    val windDirectionDegrees: Double?,
    val precipitationProbabilityPercent: Double?,
    val precipitationType: String?,
    val sky: String?,
    val precipitation: RainAmount,
)

data class DailyTemperature(val date: LocalDate, val minimumC: Double?, val maximumC: Double?)

data class WeatherDataset(
    val kind: String,
    val issuedAt: Instant,
    val fetchedAt: Instant,
    val expiresAt: Instant,
    val stale: Boolean,
    val points: List<WeatherPoint>,
    val daily: List<DailyTemperature>,
)

data class LocalWeather(
    val region: WeatherRegion,
    val forecast: WeatherDataset?,
    val current: WeatherDataset?,
    val errors: List<String>,
    val attribution: String,
) {
    /** Same bounds as the initial server policy; never keep an offline view forever. */
    fun forDisplay(now: Instant, refreshFailed: Boolean = false): LocalWeather {
        fun valid(dataset: WeatherDataset?, isCurrent: Boolean): WeatherDataset? {
            dataset ?: return null
            val age = Duration.between(dataset.fetchedAt, now)
            if (age.isNegative || age > Duration.ofMinutes(if (isCurrent) 90 else 360)) return null
            // Fresh observations last to the next release; offline grace never extends their actual age.
            if (isCurrent && now > dataset.expiresAt.plusSeconds(20 * 60)) return null
            val points = if (isCurrent) dataset.points.filter {
                !it.validAt.isAfter(now) && Duration.between(it.validAt, now) <= Duration.ofMinutes(90)
            } else dataset.points.filter { it.validAt >= now.truncatedTo(ChronoUnit.HOURS) }
            if (points.isEmpty()) return null
            return dataset.copy(points = points, stale = dataset.stale || refreshFailed || now >= dataset.expiresAt)
        }
        return copy(forecast = valid(forecast, false), current = valid(current, true))
    }

    val hasData: Boolean get() = forecast != null || current != null
    val isStale: Boolean get() = forecast?.stale == true || current?.stale == true
    fun needsRefresh(now: Instant): Boolean {
        val display = forDisplay(now)
        return display.forecast == null || display.current == null || display.isStale || errors.isNotEmpty()
    }
}

enum class WeatherProblem { CONNECTION, RATE_LIMIT, INVALID_RESPONSE, UNAVAILABLE, NOT_CONFIGURED, STORAGE }

class WeatherFailure(val problem: WeatherProblem) : Exception(problem.name)
