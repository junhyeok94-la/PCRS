package com.pcrs.thermalguide.core.weather

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.atomic.AtomicInteger

class WeatherDiskCacheTest {
    @get:Rule val temporary = TemporaryFolder()
    private val now = Instant.parse("2026-11-02T01:20:00Z")
    private val region = WeatherRegion("1168000000", "서울특별시 강남구")
    private fun fixture(id: String = region.id): LocalWeather {
        val point = WeatherPoint(now.truncatedTo(ChronoUnit.HOURS), 0.0, null, 0.0, null, 0.0, "none", null, RainAmount("less_than", upperBoundMm = 1.0))
        val data = WeatherDataset("hourly_forecast", now.minusSeconds(3600), now.minusSeconds(60), now.plusSeconds(3000), false,
            (0L..35L).map { point.copy(validAt = point.validAt.plus(it, ChronoUnit.HOURS)) }, listOf(DailyTemperature(now.atZone(KoreaZone).toLocalDate(), null, 15.0)))
        return LocalWeather(region.copy(id = id), data, data.copy(kind = "representative_observation", points = listOf(point)), emptyList(), "기상청 test")
    }
    private fun disk(root: File, endpoint: String = "https://unit.test") = WeatherDiskCache(root, endpoint)
    private fun repository(root: File, calls: AtomicInteger, result: LocalWeather = fixture(), instant: () -> Instant = { now }, fail: Boolean = false): WeatherRepository =
        WeatherRepository("https://unit.test", disk(root), WeatherTransport { _, _ ->
            calls.incrementAndGet()
            if (fail) throw WeatherFailure(WeatherProblem.CONNECTION)
            WeatherJson.cacheText(result)
        }, instant)

    @Test fun recreationReadsSnapshotWithoutNetworkAndPreservesAllProvenanceAndNulls() = runBlocking {
        val root = temporary.newFolder()
        val calls = AtomicInteger()
        val first = repository(root, calls).weather(region.id)
        val restored = repository(root, calls, fail = true).weather(region.id)
        assertEquals(1, calls.get())
        assertEquals(first, restored)
        assertEquals(0.0, restored.current!!.points.first().temperatureC!!, 0.0)
        assertNull(restored.current.points.first().humidityPercent)
        assertEquals(1.0, restored.forecast!!.points.first().precipitation.upperBoundMm!!, 0.0)
        assertNull(restored.forecast.daily.first().minimumC)
    }

    @Test fun offlineExpiredSnapshotRemainsReadableButCannotBecomeFreshOrLiveForever() = runBlocking {
        val root = temporary.newFolder()
        disk(root).save(fixture())
        val calls = AtomicInteger()
        val expiredNow = now.plusSeconds(3600)
        val repo = repository(root, calls, instant = { expiredNow }, fail = true)
        val saved = repo.cached(region.id)!!
        assertTrue(saved.isStale)
        assertEquals(fixture().forecast!!.fetchedAt, saved.forecast!!.fetchedAt)
        assertTrue(runCatching { repo.weather(region.id) }.isFailure)
        assertEquals(1, calls.get())
        assertNull(repository(root, calls, instant = { now.plusSeconds(7 * 3600) }).cached(region.id))
    }

    @Test fun partialNetworkResponsePreservesUsableOldComponentAsStale() = runBlocking {
        val root = temporary.newFolder()
        disk(root).save(fixture())
        val partial = fixture().copy(forecast = null, errors = listOf("provider_unreachable"))
        val result = repository(root, AtomicInteger(), partial).weather(region.id, force = true)
        assertTrue(result.forecast!!.stale)
        assertFalse(result.current!!.stale)
        assertEquals(fixture().forecast!!.fetchedAt, result.forecast.fetchedAt)
        assertEquals(result, disk(root).read(region.id))
    }

    @Test fun failedRefreshCannotOverwriteTheLastSnapshot() = runBlocking {
        val root = temporary.newFolder()
        disk(root).save(fixture())
        val unavailable = fixture().copy(forecast = null, current = null)
        assertTrue(runCatching { repository(root, AtomicInteger(), unavailable).weather(region.id, force = true) }.isFailure)
        assertEquals(fixture(), disk(root).read(region.id))
    }

    @Test fun simultaneousAutomaticRequestsShareOneFetch() = runBlocking {
        val calls = AtomicInteger()
        val repo = repository(temporary.newFolder(), calls)
        coroutineScope { List(8) { async { repo.weather(region.id) } }.forEach { it.await() } }
        assertEquals(1, calls.get())
    }

    @Test fun endpointAndRegionNeverShareTheWrongCache() {
        val root = temporary.newFolder()
        disk(root).save(fixture())
        assertNull(disk(root, "https://other.test").read(region.id))
        assertNull(disk(root).read("1144000000"))
        assertNull(disk(root).read("../../outside"))
    }

    @Test fun corruptOrUnknownVersionIsACacheMissRatherThanAnAppCrash() {
        val root = temporary.newFolder()
        disk(root).save(fixture())
        val file = root.walkTopDown().first { it.extension == "json" }
        file.writeText("broken json")
        assertNull(disk(root).read(region.id))
        file.writeText(WeatherJson.cacheText(fixture()).replace("\"cacheVersion\":1", "\"cacheVersion\":9"))
        assertNull(disk(root).read(region.id))
    }

    @Test fun cacheEvictionIsBoundedAndDoesNotReplaceSettings() {
        val root = temporary.newFolder()
        val cache = WeatherDiskCache(root, "https://unit.test", maxEntries = 2)
        for (id in listOf("1168000000", "1144000000", "1100000000")) cache.save(fixture(id))
        assertEquals(2, root.walkTopDown().count { it.extension == "json" })
        assertEquals(0, root.walkTopDown().count { it.extension == "tmp" })
    }

    @Test fun observationKeepsFreshUntilReleaseButExpiresAtActualNinetyMinuteAge() {
        val data = fixture()
        assertNotNull(data.forDisplay(now.plusSeconds(29 * 60)).current)
        assertFalse(data.forDisplay(now.plusSeconds(29 * 60)).current!!.stale)
        assertNull(data.forDisplay(now.plusSeconds(71 * 60)).current)
    }

    @Test fun unwritableCacheDoesNotTurnASuccessfulFetchIntoFailure() = runBlocking {
        val root = temporary.newFile()
        val calls = AtomicInteger()
        assertTrue(repository(root, calls).weather(region.id).hasData)
        assertEquals(1, calls.get())
    }

    @Test fun twoRegionsUseOneHttpRequestAndRepeatedCallsUseTheirDiskCaches() = runBlocking {
        val root = temporary.newFolder()
        val calls = AtomicInteger()
        val ids = listOf(region.id, "1144000000")
        val repo = WeatherRepository("https://unit.test", disk(root), WeatherTransport { _, body ->
            calls.incrementAndGet()
            val requested = org.json.JSONObject(body!!).getJSONArray("regionIds")
            val envelope = org.json.JSONObject(WeatherJson.cacheText(fixture()))
            envelope.put("locations", org.json.JSONArray((0 until requested.length()).map { i ->
                org.json.JSONObject(WeatherJson.cacheText(fixture(requested.getString(i)))).getJSONArray("locations").getJSONObject(0)
            })).toString()
        }, { now })
        val result = repo.weatherMany(ids)
        assertEquals(ids.toSet(), result.data.keys)
        assertTrue(result.problems.isEmpty())
        assertEquals(1, calls.get())
        repo.weatherMany(ids)
        assertEquals(1, calls.get())
    }

    @Test fun missingBatchLocationDoesNotDiscardTheOtherValidRegion() = runBlocking {
        val repo = repository(temporary.newFolder(), AtomicInteger())
        val result = repo.weatherMany(listOf(region.id, "1144000000"))
        assertTrue(result.data[region.id]!!.hasData)
        assertFalse(result.problems.containsKey(region.id))
        assertEquals(WeatherProblem.INVALID_RESPONSE, result.problems["1144000000"])
    }
}
