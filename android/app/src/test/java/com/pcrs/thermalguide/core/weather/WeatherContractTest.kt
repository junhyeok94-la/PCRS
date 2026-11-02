package com.pcrs.thermalguide.core.weather

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.OffsetDateTime

class WeatherContractTest {
    private val id = "1144000000"
    private val now = OffsetDateTime.parse("2026-11-02T09:10:00+09:00").toInstant()
    private fun fixture(): JSONObject = JSONObject("""
        {"schemaVersion":"1.0","timezone":"Asia/Seoul","isSample":false,"attribution":"contract fixture",
         "locations":[{"location":{"id":"1144000000","name":"서울특별시 마포구"},"status":"available","errors":[],
          "forecast":{"kind":"hourly_forecast","issuedAt":"2026-11-02T08:00:00+09:00","fetchedAt":"2026-11-02T09:10:00+09:00","expiresAt":"2026-11-02T09:20:00+09:00","freshness":"fresh",
           "points":[{"validAt":"2026-11-02T10:00:00+09:00","temperatureC":0,"humidityPercent":null,"windSpeedMs":2,"windDirectionDegrees":180,"precipitationProbabilityPercent":20,"precipitationType":"none","sky":"partly_cloudy","precipitation":{"kind":"less_than","upperBoundMm":1}}],
           "daily":[{"date":"2026-11-02","minimumC":null,"maximumC":23}]},
          "current":{"kind":"representative_observation","issuedAt":"2026-11-02T09:00:00+09:00","fetchedAt":"2026-11-02T09:10:00+09:00","expiresAt":"2026-11-02T09:15:00+09:00","freshness":"fresh",
           "points":[{"validAt":"2026-11-02T09:00:00+09:00","temperatureC":0,"humidityPercent":60,"windSpeedMs":0,"windDirectionDegrees":null,"precipitationType":"none","sky":null,"precipitation":{"kind":"none","valueMm":0}}],"daily":[]}}]}
    """.trimIndent())

    private fun parse(root: JSONObject = fixture()) = WeatherJson.weather(root.toString(), id)
    private fun location(root: JSONObject) = root.getJSONArray("locations").getJSONObject(0)

    @Test fun nullsAndZeroRemainDifferent() {
        val data = parse()
        assertEquals(0.0, data.current!!.points.first().temperatureC!!, 0.0)
        assertEquals(0.0, data.current.points.first().windSpeedMs!!, 0.0)
        assertNull(data.forecast!!.points.first().humidityPercent)
        assertNull(data.current.points.first().sky)
        assertNull(data.forecast.daily.first().minimumC)
    }

    @Test fun rangeRainIsNotTurnedIntoZeroOrAnExactNumber() {
        val amount = parse().forecast!!.points.first().precipitation
        assertEquals("less_than", amount.kind)
        assertEquals(1.0, amount.upperBoundMm!!, 0.0)
        assertNull(amount.valueMm)
    }

    @Test fun timestampsRetainTheirActualOffsetMeaning() {
        assertEquals(Instant.parse("2026-11-02T01:00:00Z"), parse().forecast!!.points.first().validAt)
    }

    @Test fun wrongRegionIsRejectedRatherThanDisplayingAnotherPlace() {
        assertTrue(runCatching { WeatherJson.weather(fixture().toString(), "1168000000") }.isFailure)
    }

    @Test fun sampleCannotMasqueradeAsLiveWeather() {
        assertTrue(runCatching { parse(fixture().put("isSample", true)) }.isFailure)
    }

    @Test fun incompatibleContractIsRejected() {
        assertTrue(runCatching { parse(fixture().put("schemaVersion", "2.0")) }.isFailure)
        assertTrue(runCatching { parse(fixture().put("timezone", "UTC")) }.isFailure)
    }

    @Test fun forecastIsNotAcceptedAsAnObservation() {
        val json = fixture()
        location(json).getJSONObject("current").put("kind", "hourly_forecast")
        assertTrue(runCatching { parse(json) }.isFailure)
    }

    @Test fun partialResponseKeepsItsValidComponent() {
        val json = fixture()
        location(json).put("current", JSONObject.NULL)
        val data = parse(json)
        assertNull(data.current)
        assertNotNull(data.forecast)
    }

    @Test fun expiredFreshnessIsNotShownAsFresh() {
        val data = parse().forDisplay(now.plusSeconds(11 * 60))
        assertTrue(data.forecast!!.stale)
        assertEquals(now, data.forecast.fetchedAt)
    }

    @Test fun offlineSnapshotBecomesStaleImmediately() {
        val data = parse().forDisplay(now, refreshFailed = true)
        assertTrue(data.forecast!!.stale)
        assertTrue(data.current!!.stale)
    }

    @Test fun oldObservationExpiresBeforeForecast() {
        val data = parse().forDisplay(now.plusSeconds(26 * 60))
        assertNull(data.current)
        assertNotNull(data.forecast)
    }

    @Test fun noForeverWeatherAfterOfflineOrClockChange() {
        assertFalse(parse().forDisplay(now.plusSeconds(7 * 3600)).hasData)
        assertFalse(parse().forDisplay(now.minusSeconds(1)).hasData)
    }

    @Test fun nullableAndEmptyComponentsDoNotCreateFakeWeather() {
        val json = fixture()
        location(json).put("current", JSONObject.NULL).put("forecast", JSONObject.NULL)
        assertFalse(parse(json).hasData)
    }
}
