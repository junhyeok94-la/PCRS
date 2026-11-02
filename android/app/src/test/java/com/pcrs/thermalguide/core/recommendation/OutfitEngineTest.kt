package com.pcrs.thermalguide.core.recommendation

import com.pcrs.thermalguide.core.weather.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

class OutfitEngineTest {
    private val now = Instant.parse("2026-11-02T23:20:00Z") // 08:20 KST
    private val hour = now.truncatedTo(ChronoUnit.HOURS)
    private fun point(temp: Double? = 19.0, offset: Long = 0, wind: Double? = 2.0,
        humidity: Double? = 50.0, probability: Double? = 0.0, type: String? = "none") =
        WeatherPoint(hour.plus(offset, ChronoUnit.HOURS), temp, humidity, wind, null, probability, type, "clear", RainAmount("none", 0.0))
    private fun weather(points: List<WeatherPoint> = listOf(point()), stale: Boolean = false) = LocalWeather(
        WeatherRegion("1168000000", "강남구"), WeatherDataset("hourly_forecast", now.minusSeconds(3600), now.minusSeconds(60), now.plusSeconds(600), stale, points, emptyList()),
        null, emptyList(), "test only",
    )
    private fun first(point: WeatherPoint = point()) = OutfitEngine.recommend(weather(listOf(point)), now).periods.first()

    @Test fun walkingExampleDoesNotRequireWearingAJacketAtNineteen() {
        val outfit = first().outfit!!
        assertEquals(Top.THIN_LONG, outfit.top)
        assertEquals(OuterState.CARRIED, outfit.outerState)
        assertEquals(AvatarAsset.THIN_LONG, OutfitAssets.match(outfit))
    }

    @Test fun temperatureBoundariesUseUnroundedValues() {
        val cases = listOf(4.99 to Outer.PADDED_COAT, 5.0 to Outer.COAT, 8.99 to Outer.COAT,
            9.0 to Outer.MID_JACKET, 11.99 to Outer.MID_JACKET, 12.0 to Outer.LIGHT_JACKET,
            16.99 to Outer.LIGHT_JACKET, 17.0 to Outer.LIGHT_JACKET, 19.99 to Outer.LIGHT_JACKET, 20.0 to Outer.NONE, 23.0 to Outer.NONE)
        cases.forEach { (temperature, outer) -> assertEquals("$temperature", outer, first(point(temperature)).outfit!!.outer) }
        assertEquals(OuterState.WORN, first(point(16.99)).outfit!!.outerState)
        assertEquals(OuterState.CARRIED, first(point(17.0)).outfit!!.outerState)
        assertEquals(Top.SHORT_TEE, first(point(23.0)).outfit!!.top)
    }

    @Test fun sameTemperatureDoesNotInventAnApparentTemperatureFromHumidityOrWind() {
        assertEquals(first(point(19.0)).outfit, first(point(19.0, wind = 9.0, humidity = 95.0)).outfit)
        assertTrue(Advice.WIND_LAYER in first(point(19.0, wind = 9.0)).advice)
        assertTrue(Advice.HUMID in first(point(24.0, humidity = 70.0)).advice)
        assertFalse(Advice.HUMID in first(point(19.0, humidity = 95.0)).advice)
    }

    @Test fun rainAndSnowAreNotLostWhenProbabilityIsMissingOrZero() {
        assertTrue(Advice.RAIN_GEAR in first(point(type = "rain", probability = null)).advice)
        assertTrue(Advice.SNOW_GEAR in first(point(type = "rain_snow", probability = 0.0)).advice)
        assertFalse(Advice.RAIN_GEAR in first(point(probability = 59.9)).advice)
        assertTrue(Advice.RAIN_GEAR in first(point(probability = 60.0)).advice)
    }

    @Test fun missingFieldsAreNeverTreatedAsCalmDryWeather() {
        val period = first(point(wind = null, humidity = null, probability = null, type = null))
        assertEquals(MissingInput.entries.toSet(), period.missing)
        assertFalse(Advice.WIND_LAYER in period.advice)
        assertFalse(Advice.HUMID in period.advice)
        assertFalse(Advice.RAIN_GEAR in period.advice)
        assertTrue(first(point(wind = 0.0, humidity = 0.0)).missing.isEmpty())
    }

    @Test fun invalidTemperatureBlocksRecommendationIncludingNanAndInfinity() {
        listOf(null, Double.NaN, Double.POSITIVE_INFINITY, -61.0, 61.0).forEach {
            val period = first(point(it))
            assertNull(period.outfit)
            assertEquals(UnavailableReason.MISSING_TEMPERATURE, period.unavailable)
        }
        assertNotNull(first(point(0.0)).outfit)
    }

    @Test fun outOfRangeAuxiliaryFieldsAreReportedAsMissing() {
        val period = first(point(wind = -1.0, humidity = 101.0, probability = Double.NaN, type = "unknown"))
        assertEquals(MissingInput.entries.toSet(), period.missing)
    }

    @Test fun requestedHoursUseExactForecastAndNeverBorrowAnotherTime() {
        val result = OutfitEngine.recommend(weather(listOf(point(offset = 0), point(15.0, 2), point(8.0, 6))), now)
        assertEquals(hour.plus(3, ChronoUnit.HOURS), result.periods[1].validAt)
        assertEquals(UnavailableReason.MISSING_HOUR, result.periods[1].unavailable)
        assertNull(result.periods[1].outfit)
        assertEquals(Outer.COAT, result.periods[2].outfit!!.outer)
    }

    @Test fun nextHourForecastUsesItsActualLabelButDistantFutureCannotReplaceCurrentSlot() {
        val next = OutfitEngine.recommend(weather(listOf(point(offset = 1), point(14.0, 4))), now)
        assertEquals(hour.plus(1, ChronoUnit.HOURS), next.periods.first().validAt)
        assertNotNull(next.periods.first().outfit)
        assertEquals(hour.plus(4, ChronoUnit.HOURS), next.periods[1].validAt)
        val distant = OutfitEngine.recommend(weather(listOf(point(offset = 3))), now)
        assertNull(distant.periods.first().outfit)
        assertEquals(hour, distant.periods.first().validAt)
    }

    @Test fun midnightCrossingPreservesExactInstantsAndRegion() {
        val late = Instant.parse("2026-11-03T14:30:00Z") // 23:30 KST
        val data = weather(listOf(point())).copy(forecast = weather().forecast!!.copy(fetchedAt = late, expiresAt = late.plusSeconds(600), points = listOf(point().copy(validAt = late.truncatedTo(ChronoUnit.HOURS)))))
        val result = OutfitEngine.recommend(data, late)
        assertEquals("1168000000", result.regionId)
        assertEquals("2026-11-04", result.periods[1].validAt.atZone(KoreaZone).toLocalDate().toString())
    }

    @Test fun observedTemperatureCannotReplaceMissingForecast() {
        val data = weather().copy(current = weather().forecast!!.copy(kind = "representative_observation"), forecast = null)
        assertTrue(OutfitEngine.recommend(data, now).periods.all { it.outfit == null && it.unavailable == UnavailableReason.NO_FORECAST })
    }

    @Test fun staleForecastIsLabelledAndExpiredDataIsNotUsed() {
        assertTrue(OutfitEngine.recommend(weather(stale = true), now).previousForecast)
        assertTrue(OutfitEngine.recommend(weather(), now.plusSeconds(7 * 3600)).periods.all { it.outfit == null })
    }

    @Test fun coldAndHotRecommendationsHaveTheirOwnAssets() {
        assertEquals(AvatarAsset.THERMAL_KNIT_PADDED, OutfitAssets.match(first(point(-3.0)).outfit!!))
        assertEquals(AvatarAsset.SHORT_LIGHT, OutfitAssets.match(first(point(29.0)).outfit!!))
        assertEquals(AvatarAsset.THIN_LONG_JACKET, OutfitAssets.match(first(point(15.0)).outfit!!))
        assertEquals(AvatarAsset.THIN_LONG_CARDIGAN, OutfitAssets.match(first(point(15.0)).alternatives.single()))
    }

    @Test fun alternativesAreBoundedAndExcludeRainWindAndSnow() {
        assertEquals(Outer.CARDIGAN, first(point(15.0)).alternatives.single().outer)
        assertTrue(first(point(15.0, wind = 5.0)).alternatives.isEmpty())
        assertTrue(first(point(15.0, type = "snow")).alternatives.isEmpty())
        assertTrue(first(point(15.0, probability = 60.0)).alternatives.isEmpty())
        assertTrue(first(point(-5.0)).alternatives.isEmpty())
        assertTrue(first(point(30.0)).alternatives.isEmpty())
    }

    @Test fun carriedAndWornNeverShareTheJacketWornAsset() {
        val carried = first(point(19.0)).outfit!!
        assertNotEquals(OutfitAssets.match(carried), OutfitAssets.match(carried.copy(outerState = OuterState.WORN)))
        assertNull(OutfitAssets.match(carried.copy(top = Top.MEDIUM_KNIT)))
        assertNull(OutfitAssets.match(carried.copy(bottom = Bottom.WARM_LONG)))
    }

    @Test fun everyCurrentRuleOutputAndAlternativeHasAnExactAsset() {
        for (temperature in listOf(-15.0, 0.0, 5.0, 8.99, 9.0, 11.99, 12.0, 16.99, 17.0, 19.99, 20.0, 22.99, 23.0, 35.0)) {
            val period = first(point(temperature))
            (listOf(period.outfit!!) + period.alternatives).forEach { assertNotNull("$temperature: $it", OutfitAssets.match(it)) }
        }
    }

    @Test fun allUnsupportedCombinationsRemainUnsupportedRatherThanSubstitutingClothes() {
        val supported = setOf(
            Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.NONE, OuterState.NONE),
            Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED),
            Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.CARRIED),
            Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.WORN),
            Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.WORN),
            Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
            Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED),
            Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
            Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED),
            Outfit(Top.MEDIUM_KNIT, Bottom.REGULAR_LONG, Outer.MID_JACKET, OuterState.WORN),
            Outfit(Top.MEDIUM_KNIT, Bottom.WARM_LONG, Outer.COAT, OuterState.WORN),
            Outfit(Top.THERMAL_AND_KNIT, Bottom.WARM_LONG, Outer.PADDED_COAT, OuterState.WORN),
        )
        for (top in Top.entries) for (bottom in Bottom.entries) for (outer in Outer.entries) for (state in OuterState.entries) {
            val outfit = Outfit(top, bottom, outer, state)
            assertEquals(outfit.toString(), outfit in supported, OutfitAssets.match(outfit) != null)
        }
    }

    @Test fun cardiganCarryAndWearUseDifferentImagesAndWarmPantsAreNotRegularPants() {
        val cardigan = first(point(15.0)).alternatives.single()
        assertNotEquals(OutfitAssets.match(cardigan), OutfitAssets.match(cardigan.copy(outerState = OuterState.CARRIED)))
        assertNull(OutfitAssets.match(cardigan.copy(bottom = Bottom.WARM_LONG)))
        val coat = first(point(7.0)).outfit!!
        assertEquals(AvatarAsset.KNIT_COAT, OutfitAssets.match(coat))
        assertNull(OutfitAssets.match(coat.copy(outerState = OuterState.CARRIED)))
        assertNull(OutfitAssets.match(coat.copy(bottom = Bottom.REGULAR_LONG)))
    }
}
