package com.pcrs.thermalguide.core.weather

import com.pcrs.thermalguide.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.Instant
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

fun interface WeatherTransport { fun request(path: String, body: String?): String }

data class WeatherBatch(val data: Map<String, LocalWeather>, val problems: Map<String, WeatherProblem>)

class WeatherRepository(
    endpoint: String = BuildConfig.WEATHER_API_BASE_URL,
    private val cache: WeatherDiskCache? = null,
    private val transport: WeatherTransport = HttpWeatherTransport(endpoint),
    private val clock: () -> Instant = Instant::now,
) {
    private val weatherMutex = Mutex()
    suspend fun cached(regionId: String): LocalWeather? = withContext(Dispatchers.IO) {
        cache?.read(regionId)?.forDisplay(clock())?.takeIf { it.hasData }
    }
    suspend fun search(query: String): List<WeatherRegion> = withContext(Dispatchers.IO) {
        val text = transport.request("/v1/regions?q=${URLEncoder.encode(query, "UTF-8")}&limit=20", null)
        parse { WeatherJson.regions(text) }
    }

    suspend fun weather(regionId: String, force: Boolean = false): LocalWeather {
        val batch = weatherMany(listOf(regionId), force)
        batch.problems[regionId]?.let { throw WeatherFailure(it) }
        return batch.data[regionId] ?: throw WeatherFailure(WeatherProblem.UNAVAILABLE)
    }

    suspend fun weatherMany(regionIds: List<String>, force: Boolean = false): WeatherBatch = withContext(Dispatchers.IO) {
        val ids = regionIds.distinct()
        require(ids.isNotEmpty() && ids.size <= 2)
        weatherMutex.withLock {
            val data = ids.mapNotNull { id -> cache?.read(id)?.forDisplay(clock())?.takeIf { it.hasData }?.let { id to it } }.toMap().toMutableMap()
            val needed = ids.filter { force || data[it]?.needsRefresh(clock()) != false }
            val problems = mutableMapOf<String, WeatherProblem>()
            if (needed.isNotEmpty()) {
                try {
                    val body = JSONObject().put("regionIds", JSONArray(needed)).put("hours", 36).toString()
                    val text = transport.request("/v1/weather", body)
                    for (id in needed) {
                        val response = try { parse { WeatherJson.weather(text, id) } }
                            catch (failure: WeatherFailure) { problems[id] = failure.problem; continue }
                        if (!response.hasData) { problems[id] = WeatherProblem.UNAVAILABLE; continue }
                        val previous = data[id]
                        val result = response.copy(
                            forecast = response.forecast ?: previous?.forecast?.copy(stale = true),
                            current = response.current ?: previous?.current?.copy(stale = true),
                        )
                        data[id] = result
                        cache?.save(result)
                    }
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (failure: WeatherFailure) { needed.forEach { problems[it] = failure.problem } }
                catch (_: Exception) { needed.forEach { problems[it] = WeatherProblem.CONNECTION } }
            }
            problems.keys.forEach { id -> data[id]?.let { old -> data[id] = old.copy(
                forecast = old.forecast?.copy(stale = true), current = old.current?.copy(stale = true)) } }
            WeatherBatch(data, problems)
        }
    }

    private inline fun <T> parse(block: () -> T): T = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: WeatherFailure) {
        throw failure
    } catch (_: Exception) {
        throw WeatherFailure(WeatherProblem.INVALID_RESPONSE)
    }
}

private class HttpWeatherTransport(private val endpoint: String) : WeatherTransport {
    override fun request(path: String, body: String?): String {
        if (endpoint.isBlank()) throw WeatherFailure(WeatherProblem.NOT_CONFIGURED)
        val base = URI(endpoint)
        if (base.scheme !in listOf("http", "https") || base.userInfo != null || base.query != null || base.fragment != null) {
            throw WeatherFailure(WeatherProblem.NOT_CONFIGURED)
        }
        val connection = URI(endpoint.trimEnd('/') + path).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8_000
            connection.readTimeout = 25_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status == 429) throw WeatherFailure(WeatherProblem.RATE_LIMIT)
            if (status !in listOf(200, 503) || status == 503 && body == null) throw WeatherFailure(WeatherProblem.CONNECTION)
            val stream = if (status == 503) connection.errorStream else connection.inputStream
            val bytes = stream?.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > 2_000_000) throw WeatherFailure(WeatherProblem.INVALID_RESPONSE)
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            } ?: throw WeatherFailure(WeatherProblem.INVALID_RESPONSE)
            return bytes.toString(Charsets.UTF_8)
        } catch (failure: WeatherFailure) {
            throw failure
        } catch (_: IOException) {
            throw WeatherFailure(WeatherProblem.CONNECTION)
        } finally {
            connection.disconnect()
        }
    }

}
