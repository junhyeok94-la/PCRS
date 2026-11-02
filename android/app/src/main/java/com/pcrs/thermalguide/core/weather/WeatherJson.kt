package com.pcrs.thermalguide.core.weather

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.OffsetDateTime

object WeatherJson {
    /** Private disk snapshot, not a new public API response or a generated weather source. */
    fun cacheText(weather: LocalWeather): String {
        fun value(value: Any?): Any = value ?: JSONObject.NULL
        fun dataset(data: WeatherDataset?): Any {
            data ?: return JSONObject.NULL
            return JSONObject().put("kind", data.kind).put("issuedAt", data.issuedAt.toString())
                .put("fetchedAt", data.fetchedAt.toString()).put("expiresAt", data.expiresAt.toString())
                .put("freshness", if (data.stale) "stale" else "fresh")
                .put("points", JSONArray(data.points.map { p -> JSONObject()
                    .put("validAt", p.validAt.toString()).put("temperatureC", value(p.temperatureC))
                    .put("humidityPercent", value(p.humidityPercent)).put("windSpeedMs", value(p.windSpeedMs))
                    .put("windDirectionDegrees", value(p.windDirectionDegrees))
                    .put("precipitationProbabilityPercent", value(p.precipitationProbabilityPercent))
                    .put("precipitationType", value(p.precipitationType)).put("sky", value(p.sky))
                    .put("precipitation", JSONObject().put("kind", p.precipitation.kind)
                        .put("valueMm", value(p.precipitation.valueMm)).put("lowerBoundMm", value(p.precipitation.lowerBoundMm))
                        .put("upperBoundMm", value(p.precipitation.upperBoundMm))) }))
                .put("daily", JSONArray(data.daily.map { d -> JSONObject().put("date", d.date.toString())
                    .put("minimumC", value(d.minimumC)).put("maximumC", value(d.maximumC)) }))
        }
        return JSONObject().put("cacheVersion", 1).put("schemaVersion", "1.0").put("timezone", "Asia/Seoul")
            .put("isSample", false).put("attribution", weather.attribution)
            .put("locations", JSONArray().put(JSONObject()
                .put("location", JSONObject().put("id", weather.region.id).put("name", weather.region.name))
                .put("forecast", dataset(weather.forecast)).put("current", dataset(weather.current))
                .put("errors", JSONArray(weather.errors.map { JSONObject().put("code", it) })))).toString()
    }

    private fun JSONObject.number(name: String): Double? =
        if (!has(name) || isNull(name)) null else optDouble(name, Double.NaN).takeIf { it.isFinite() }

    private fun JSONObject.optionalString(name: String): String? =
        if (!has(name) || isNull(name)) null else getString(name)

    private fun JSONObject.instant(name: String) = OffsetDateTime.parse(getString(name)).toInstant()

    private fun <T> JSONArray.items(parse: (JSONObject) -> T): List<T> = (0 until length()).map { parse(getJSONObject(it)) }

    fun region(json: JSONObject) = WeatherRegion(json.getString("id"), json.getString("name"))

    fun regions(text: String): List<WeatherRegion> = JSONObject(text).getJSONArray("regions").items(::region)

    fun weather(text: String, requestedRegionId: String): LocalWeather {
        val root = JSONObject(text)
        require(root.getString("schemaVersion") == "1.0" && root.getString("timezone") == "Asia/Seoul")
        require(!root.getBoolean("isSample")) { "A sample response must not appear as live weather" }
        val locations = root.getJSONArray("locations")
        val location = (0 until locations.length()).map { locations.getJSONObject(it) }
            .single { it.getJSONObject("location").getString("id") == requestedRegionId }
        val errors = location.getJSONArray("errors").items { it.getString("code") }
        return LocalWeather(
            region = region(location.getJSONObject("location")),
            forecast = location.optJSONObject("forecast")?.let { dataset(it, "hourly_forecast") },
            current = location.optJSONObject("current")?.let { dataset(it, "representative_observation") },
            errors = errors,
            attribution = root.getString("attribution"),
        )
    }

    private fun dataset(json: JSONObject, expectedKind: String): WeatherDataset {
        require(json.getString("kind") == expectedKind)
        return WeatherDataset(
            kind = expectedKind, issuedAt = json.instant("issuedAt"), fetchedAt = json.instant("fetchedAt"),
            expiresAt = json.instant("expiresAt"), stale = json.getString("freshness") == "stale",
            points = json.getJSONArray("points").items { point ->
                val amount = point.getJSONObject("precipitation")
                WeatherPoint(
                    validAt = point.instant("validAt"), temperatureC = point.number("temperatureC"),
                    humidityPercent = point.number("humidityPercent"), windSpeedMs = point.number("windSpeedMs"),
                    windDirectionDegrees = point.number("windDirectionDegrees"),
                    precipitationProbabilityPercent = point.number("precipitationProbabilityPercent"),
                    precipitationType = point.optionalString("precipitationType"), sky = point.optionalString("sky"),
                    precipitation = RainAmount(amount.getString("kind"), amount.number("valueMm"), amount.number("lowerBoundMm"), amount.number("upperBoundMm")),
                )
            }.sortedBy { it.validAt },
            daily = (json.optJSONArray("daily") ?: JSONArray()).items {
                DailyTemperature(LocalDate.parse(it.getString("date")), it.number("minimumC"), it.number("maximumC"))
            },
        )
    }
}
