package com.pcrs.thermalguide.core.personal

import com.pcrs.thermalguide.core.weather.*
import com.pcrs.thermalguide.core.recommendation.*
import org.junit.Assert.*
import org.junit.Test
import java.time.*

class PersonalProfileTest {
    private val home = WeatherRegion("1144000000", "집 지역")
    private val work = WeatherRegion("1168000000", "직장 지역")
    private val now = Instant.parse("2026-11-02T22:00:00Z") // Tue 07:00 Korea
    private val date = now.atZone(KoreaZone).toLocalDate()
    private fun at(hour: Int, minute: Int = 0, day: Long = 0) = date.plusDays(day).atTime(hour, minute).atZone(KoreaZone).toInstant()
    private fun settings(out: String = "09:30", back: String = "18:00", next: Boolean = false, days: Set<DayOfWeek>? = null) =
        CommuteSettings(home, work, LocalTime.parse(out), LocalTime.parse(back), next, days)
    private fun point(temp: Double?, time: Instant = at(9)) = WeatherPoint(time, temp, 50.0, 2.0, 180.0, 0.0, "none", "clear", RainAmount("none", 0.0))
    private fun weather(region: WeatherRegion, points: List<WeatherPoint>) = LocalWeather(region,
        WeatherDataset("hourly_forecast", now.minusSeconds(3600), now.minusSeconds(60), now.plusSeconds(3600), false, points, emptyList()), null, emptyList(), "test")
    private fun profile() = PersonalProfile(commute = settings())

    @Test fun unsetRemainsDifferentFromExplicitNormalAndBothSensitivitiesSurvive() {
        val empty = ProfileJson.decode(ProfileJson.encode(PersonalProfile()))
        assertNull(empty.cold); assertNull(empty.heat); assertFalse(empty.hasPreferences)
        val both = PersonalProfile(cold = Sensitivity.HIGH, heat = Sensitivity.HIGH)
        assertEquals(both, ProfileJson.decode(ProfileJson.encode(both)))
        assertNotEquals(empty, PersonalProfile(cold = Sensitivity.NORMAL, heat = Sensitivity.NORMAL))
    }

    @Test fun completeProfileRoundTripPreservesNullWeekdaysAndOptionalValues() {
        val p = PersonalProfile(settings(), Sensitivity.HIGH, Sensitivity.LOW, Walking.SHORT, Transport.TRANSIT, Indoor.COOL)
        assertEquals(p, ProfileJson.decode(ProfileJson.encode(p)))
        assertNull(ProfileJson.decode(ProfileJson.encode(p)).commute!!.weekdays)
    }

    @Test fun calendarRulesAndSameRegionAreAllowedWithoutInventingAWorkWeek() {
        val c = settings().copy(work = home)
        val cycle = CommuteSchedule.next(c, now)!!
        assertEquals(at(9, 30), cycle.outbound)
        assertEquals(at(18), cycle.returning)
        assertEquals(date, cycle.departureDate)
        assertNull(c.weekdays)
    }

    @Test fun fridayOvernightReturnStillBelongsToFridaysSelectedCycle() {
        val c = settings("23:00", "00:30", true, setOf(DayOfWeek.FRIDAY))
        val saturday = LocalDate.of(2026, 11, 7).atTime(0, 15).atZone(KoreaZone).toInstant()
        val cycle = CommuteSchedule.next(c, saturday)!!
        assertEquals(LocalDate.of(2026, 11, 6), cycle.departureDate)
        assertEquals(LocalDate.of(2026, 11, 7), cycle.returning.atZone(KoreaZone).toLocalDate())
    }

    @Test fun completedDayAdvancesAndSelectedWeekdaySkipsTheWeekend() {
        val friday = LocalDate.of(2026, 11, 6).atTime(19, 0).atZone(KoreaZone).toInstant()
        val c = settings(days = setOf(DayOfWeek.MONDAY, DayOfWeek.FRIDAY))
        assertEquals(LocalDate.of(2026, 11, 9), CommuteSchedule.next(c, friday)!!.departureDate)
        assertEquals(date.plusDays(1), CommuteSchedule.next(settings(), at(19))!!.departureDate)
    }

    @Test fun earlierReturnNeedsExplicitNextDayAndInvalidTimesCannotBeSaved() {
        assertFalse(settings("22:00", "07:00").valid())
        assertTrue(settings("22:00", "07:00", true).valid())
        assertFalse(settings().copy(weekdays = emptySet()).valid())
        assertFalse(settings().copy(outbound = LocalTime.of(9, 30, 1)).valid())
        assertNull(ProfileDraft.time("24:00")); assertNull(ProfileDraft.time("09:60")); assertNull(ProfileDraft.time("9:30"))
        assertNotNull(ProfileDraft(enabled = true, home = home, work = work, outbound = "22:00", returning = "07:00").error())
    }

    @Test fun corruptSchemaOrUnsupportedEnumsAreRejected() {
        val json = ProfileJson.encode(profile())
        assertTrue(runCatching { ProfileJson.decode(json.replace("\"version\":1", "\"version\":9")) }.isFailure)
        assertTrue(runCatching { ProfileJson.decode(json.replace("\"cold\":null", "\"cold\":\"unknown\"")) }.isFailure)
        assertTrue(runCatching { ProfileJson.decode(json.replace("09:30", "23:00")) }.isFailure)
    }

    @Test fun noProfileProducesTheSameBasicOutfit() {
        for (temperature in listOf(-5.0, 7.0, 10.0, 15.0, 19.0, 22.0, 28.0)) {
            val base = OutfitEngine.forPoint(point(temperature)).outfit!!
            assertEquals(base, PersonalOutfit.apply(base, temperature, PersonalProfile()).outfit)
        }
    }

    @Test fun coldAndHeatPreferencesDoNotCancelEachOther() {
        val p = PersonalProfile(cold = Sensitivity.HIGH, heat = Sensitivity.HIGH)
        val cool = PersonalOutfit.apply(OutfitEngine.forPoint(point(15.0)).outfit!!, 15.0, p)
        val warm = PersonalOutfit.apply(OutfitEngine.forPoint(point(22.0)).outfit!!, 22.0, p)
        assertEquals(Outer.MID_JACKET, cool.outfit.outer)
        assertEquals(Top.SHORT_TEE, warm.outfit.top)
        assertTrue(PreferenceReason.COLD_MORE in cool.reasons)
        assertTrue(PreferenceReason.HEAT_MORE in warm.reasons)
    }

    @Test fun walkingMustBeExplicitForTransitionalHeatLayerAdjustment() {
        val p = PersonalProfile(cold = Sensitivity.HIGH, heat = Sensitivity.HIGH)
        val base = OutfitEngine.forPoint(point(19.0)).outfit!!
        assertEquals(OuterState.WORN, PersonalOutfit.apply(base, 19.0, p).outfit.outerState)
        assertEquals(OuterState.CARRIED, PersonalOutfit.apply(base, 19.0, p.copy(walking = Walking.SHORT)).outfit.outerState)
        assertNotNull(ProfileDraft(transport = Transport.WALK, walking = Walking.NONE).error())
    }

    @Test fun coolIndoorAddsCarryRatherThanWearingAWinterCoatInHeat() {
        val base = OutfitEngine.forPoint(point(28.0)).outfit!!
        val outfit = PersonalOutfit.apply(base, 28.0, PersonalProfile(indoor = Indoor.COOL)).outfit
        assertEquals(Top.SHORT_TEE, outfit.top)
        assertEquals(OuterState.CARRIED, outfit.outerState)
        assertEquals(AvatarAsset.SHORT_LIGHT, OutfitAssets.match(outfit))
    }

    @Test fun allCurrentPreferenceOutputsHaveExactAssetsAndKeepTheOriginalTemperature() {
        val sensitivities = listOf(null) + Sensitivity.entries
        for (temperature in listOf(-10.0, 4.0, 5.0, 8.9, 9.0, 11.9, 12.0, 16.9, 17.0, 19.9, 20.0, 22.9, 23.0, 35.0))
            for (cold in sensitivities) for (heat in sensitivities) for (indoor in listOf(null, Indoor.COOL)) for (walking in listOf(null, Walking.SHORT)) {
                val point = point(temperature)
                val period = OutfitEngine.forPoint(point)
                val p = PersonalProfile(cold = cold, heat = heat, walking = walking, indoor = indoor)
                (listOf(period.outfit!!) + period.alternatives).forEach { base ->
                    assertNotNull("$temperature $p", OutfitAssets.match(PersonalOutfit.apply(base, temperature, p).outfit))
                }
                assertEquals(temperature, point.temperatureC!!, 0.0)
            }
    }

    @Test fun departuresUseTheCorrectRegionsAndExactHourlyForecasts() {
        val data = mapOf(home.id to weather(home, listOf(point(19.0))), work.id to weather(work, listOf(point(15.0, at(18)))))
        val plan = CommuteOutfitPlanner.plan(profile(), data, now)!!
        assertEquals(at(9, 30), plan.legs[0].departure)
        assertEquals(at(9), plan.legs[0].forecastAt)
        assertEquals(19.0, plan.legs[0].period!!.point!!.temperatureC!!, 0.0)
        assertEquals(15.0, plan.legs[1].period!!.point!!.temperatureC!!, 0.0)
        assertTrue(plan.commonBase)
        assertEquals(OuterState.CARRIED, plan.outfits[0]!!.outerState)
        assertEquals(OuterState.WORN, plan.outfits[1]!!.outerState)
    }

    @Test fun missingDepartureHourIsNotReplacedByTheNextAvailableHour() {
        val data = mapOf(home.id to weather(home, listOf(point(19.0, at(10)))))
        val plan = CommuteOutfitPlanner.plan(profile(), data, now)!!
        assertEquals(LegStatus.UNAVAILABLE, plan.legs[0].status)
        assertNull(plan.outfits[0])
    }

    @Test fun pastDepartureAndAbsentFarFutureForecastAreNotInvented() {
        val data = mapOf(home.id to weather(home, listOf(point(19.0))))
        val past = CommuteOutfitPlanner.plan(profile(), data, at(10))!!
        assertEquals(LegStatus.PAST, past.legs[0].status)
        assertNull(past.outfits[0])
        val later = CommuteOutfitPlanner.plan(profile().copy(commute = settings(days = setOf(DayOfWeek.FRIDAY))), data, now)!!
        assertTrue(later.outfits.all { it == null })
    }

    @Test fun commonBaseCarriesTheOuterNeededForTheOtherLeg() {
        val data = mapOf(home.id to weather(home, listOf(point(19.0))), work.id to weather(work, listOf(point(15.0, at(18)))))
        val plan = CommuteOutfitPlanner.plan(profile().copy(cold = Sensitivity.LOW), data, now)!!
        assertTrue(plan.commonBase)
        assertEquals(OuterState.CARRIED, plan.outfits[0]!!.outerState)
        assertTrue(PreferenceReason.CARRY_OUTER in plan.reasons[0])
    }

    @Test fun differentInnerGarmentsAreNeverPromisedAsOneCommonAllDayBase() {
        val data = mapOf(home.id to weather(home, listOf(point(25.0))), work.id to weather(work, listOf(point(7.0, at(18)))))
        assertFalse(CommuteOutfitPlanner.plan(profile(), data, now)!!.commonBase)
    }

    @Test fun coldLowDoesNotDiscardWindProtection() {
        val base = OutfitEngine.forPoint(point(19.0).copy(windSpeedMs = 6.0))
        val adjusted = PersonalOutfit.apply(base.outfit!!, 19.0, PersonalProfile(cold = Sensitivity.LOW), base.advice)
        assertEquals(OuterState.CARRIED, adjusted.outfit.outerState)
        assertTrue(PreferenceReason.WIND_PROTECTION in adjusted.reasons)
    }
}
