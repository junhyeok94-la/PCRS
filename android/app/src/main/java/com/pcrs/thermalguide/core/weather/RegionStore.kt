package com.pcrs.thermalguide.core.weather

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map
import org.json.JSONObject

private val Context.weatherPreferences by preferencesDataStore(name = "weather_settings")

class RegionStore(context: Context) {
    private val data = context.applicationContext.weatherPreferences
    private val regionKey = stringPreferencesKey("selected_region_v1")
    val selectedRegion = data.data.map { preferences ->
        preferences[regionKey]?.let { WeatherJson.region(JSONObject(it)) }
    }

    suspend fun save(region: WeatherRegion) {
        data.edit { it[regionKey] = JSONObject().put("id", region.id).put("name", region.name).toString() }
    }
}
