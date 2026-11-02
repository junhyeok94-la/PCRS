package com.pcrs.thermalguide.core.personal

import com.pcrs.thermalguide.core.weather.WeatherJson
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalTime

object ProfileJson {
    fun encode(profile: PersonalProfile): String = JSONObject().apply {
        put("version", 1)
        put("cold", profile.cold?.name ?: JSONObject.NULL); put("heat", profile.heat?.name ?: JSONObject.NULL)
        put("walking", profile.walking?.name ?: JSONObject.NULL); put("transport", profile.transport?.name ?: JSONObject.NULL)
        put("indoor", profile.indoor?.name ?: JSONObject.NULL)
        put("commute", profile.commute?.let { c -> JSONObject()
            .put("home", JSONObject().put("id", c.home.id).put("name", c.home.name))
            .put("work", JSONObject().put("id", c.work.id).put("name", c.work.name))
            .put("outbound", c.outbound.toString()).put("returning", c.returning.toString()).put("returnNextDay", c.returnNextDay)
            .put("weekdays", c.weekdays?.let { JSONArray(it.sortedBy { day -> day.value }.map { day -> day.value }) } ?: JSONObject.NULL)
        } ?: JSONObject.NULL)
    }.toString()

    fun decode(text: String): PersonalProfile {
        val json = JSONObject(text)
        require(json.getInt("version") == 1)
        fun name(key: String): String? = if (!json.has(key) || json.isNull(key)) null else json.getString(key)
        val commute = json.optJSONObject("commute")?.let { c ->
            val days = c.optJSONArray("weekdays")?.let { array -> (0 until array.length()).map { DayOfWeek.of(array.getInt(it)) }.toSet() }
            CommuteSettings(WeatherJson.region(c.getJSONObject("home")), WeatherJson.region(c.getJSONObject("work")),
                LocalTime.parse(c.getString("outbound")), LocalTime.parse(c.getString("returning")), c.getBoolean("returnNextDay"), days)
                .also { require(it.valid()) }
        }
        return PersonalProfile(commute, name("cold")?.let(Sensitivity::valueOf), name("heat")?.let(Sensitivity::valueOf),
            name("walking")?.let(Walking::valueOf), name("transport")?.let(Transport::valueOf), name("indoor")?.let(Indoor::valueOf))
    }
}
