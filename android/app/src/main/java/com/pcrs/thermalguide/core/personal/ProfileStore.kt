package com.pcrs.thermalguide.core.personal

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.personalPreferences by preferencesDataStore(name = "personal_settings")
class ProfileStore(context: Context) {
    private val data = context.applicationContext.personalPreferences
    private val key = stringPreferencesKey("profile_v1")
    val profile = data.data.map { preferences -> preferences[key]?.let(ProfileJson::decode) ?: PersonalProfile() }
    suspend fun save(profile: PersonalProfile) { data.edit { it[key] = ProfileJson.encode(profile) } }
}
