package com.pcrs.thermalguide.core.weather

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import com.pcrs.thermalguide.BuildConfig
import com.pcrs.thermalguide.core.personal.*

class WeatherViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = WeatherRepository(cache = WeatherDiskCache(application.cacheDir, BuildConfig.WEATHER_API_BASE_URL))
    private val store = RegionStore(application)
    private val profileStore = ProfileStore(application)
    private var profileJob: Job? = null
    private var commuteJob: Job? = null
    private var commuteVersion = 0
    private var hourlyJob: Job? = null
    private var hourlyVersion = 0
    private var commuteKey: String? = null
    private var lastCommuteAttempt: Instant? = null
    private var foreground = false
    private var settingsJob: Job? = null
    private var searchJob: Job? = null
    private var weatherJob: Job? = null
    private var searchVersion = 0
    private var weatherVersion = 0
    private var lastAttempt: Instant? = null

    var settingsLoaded by mutableStateOf(false); private set
    var selectedRegion by mutableStateOf<WeatherRegion?>(null); private set
    var pickerOpen by mutableStateOf(false); private set
    var query by mutableStateOf(""); private set
    var searchResults by mutableStateOf<List<WeatherRegion>>(emptyList()); private set
    var searchLoading by mutableStateOf(false); private set
    var searchProblem by mutableStateOf<WeatherProblem?>(null); private set
    var pendingRegion by mutableStateOf<WeatherRegion?>(null); private set
    var savingRegion by mutableStateOf(false); private set
    var storageProblem by mutableStateOf(false); private set
    var weather by mutableStateOf<LocalWeather?>(null); private set
    var loading by mutableStateOf(false); private set
    var problem by mutableStateOf<WeatherProblem?>(null); private set
    var now by mutableStateOf(Instant.now()); private set
    var profile by mutableStateOf(PersonalProfile()); private set
    var profileLoaded by mutableStateOf(false); private set
    var profileProblem by mutableStateOf(false); private set
    var editor by mutableStateOf<PersonalEditor?>(null); private set
    var profileDraft by mutableStateOf(ProfileDraft()); private set
    var draftProblem by mutableStateOf<String?>(null); private set
    var savingProfile by mutableStateOf(false); private set
    var pickerPurpose by mutableStateOf(RegionPurpose.HOME); private set
    var commuteWeather by mutableStateOf<Map<String, LocalWeather>>(emptyMap()); private set
    var commuteProblems by mutableStateOf<Map<String, WeatherProblem>>(emptyMap()); private set
    var commuteLoading by mutableStateOf(false); private set
    var hourlyRegionLoading by mutableStateOf<String?>(null); private set

    init {
        readSettings()
        readProfile()
        viewModelScope.launch {
            while (isActive) {
                delay(60_000)
                if (foreground) { now = Instant.now(); ensureCommute() }
            }
        }
    }

    fun readSettings() {
        settingsJob?.cancel()
        settingsJob = viewModelScope.launch {
            try {
                store.selectedRegion.collect { region ->
                    val changed = selectedRegion?.id != region?.id
                    selectedRegion = region
                    settingsLoaded = true
                    storageProblem = false
                    if (region == null) pickerOpen = true
                    if (changed) {
                        weatherJob?.cancel()
                        weather = null
                        problem = null
                        if (region != null) loadWeather(force = false)
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                settingsLoaded = true
                storageProblem = true
                pickerOpen = true
            }
        }
    }

    fun openPicker() {
        pickerPurpose = RegionPurpose.HOME
        pickerOpen = true
        pendingRegion = null
        updateQuery("")
    }

    fun openCommutePicker(home: Boolean) {
        pickerPurpose = if (home) RegionPurpose.COMMUTE_HOME else RegionPurpose.COMMUTE_WORK
        pickerOpen = true
        pendingRegion = null
        updateQuery("")
    }

    fun readProfile() {
        profileJob?.cancel()
        profileJob = viewModelScope.launch {
            try {
                profileStore.profile.collect { saved ->
                    val oldPlaces = profile.commute?.let { setOf(it.home.id, it.work.id) }
                    val newPlaces = saved.commute?.let { setOf(it.home.id, it.work.id) }
                    if (oldPlaces != newPlaces) { ++hourlyVersion; hourlyJob?.cancel(); hourlyRegionLoading = null }
                    profile = saved; profileLoaded = true; profileProblem = false
                    ensureCommute()
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { profileLoaded = true; profileProblem = true }
        }
    }

    fun openEditor(screen: PersonalEditor) {
        if (!profileLoaded || profileProblem) return
        profileDraft = ProfileDraft.from(profile).let { if (screen == PersonalEditor.COMMUTE && profile.commute == null) it.copy(enabled = true) else it }
        draftProblem = null
        editor = screen
    }
    fun updateDraft(draft: ProfileDraft) { if (!savingProfile) { profileDraft = draft; draftProblem = null } }
    fun closeEditor() { if (!savingProfile) { editor = null; draftProblem = null } }
    fun saveProfile() {
        if (savingProfile) return
        profileDraft.error()?.let { draftProblem = it; return }
        val pending = profileDraft.profile()
        savingProfile = true
        viewModelScope.launch {
            try { profileStore.save(pending); editor = null; draftProblem = null }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { draftProblem = "설정을 저장하지 못했어요. 다시 시도해 주세요." }
            finally { savingProfile = false }
        }
    }

    private fun ensureCommute() {
        val commute = profile.commute
        val cycle = commute?.let { CommuteSchedule.next(it, now) }
        val key = if (commute == null || cycle == null) null else "${commute.home.id}:${commute.work.id}:${cycle.outbound}:${cycle.returning}"
        if (key == commuteKey) return
        commuteKey = key
        loadCommute(false)
    }
    fun refreshCommute() { loadCommute(true) }
    fun loadHourlyRegion(regionId: String, force: Boolean = false) {
        val settings = profile.commute ?: return
        if (regionId !in setOf(settings.home.id, settings.work.id)) return
        val version = ++hourlyVersion
        hourlyJob?.cancel()
        hourlyRegionLoading = regionId
        hourlyJob = viewModelScope.launch {
            try {
                repository.cached(regionId)?.let { saved -> if (version == hourlyVersion) commuteWeather = commuteWeather + (regionId to saved) }
                val result = repository.weatherMany(listOf(regionId), force)
                val current = profile.commute
                if (version == hourlyVersion && current != null && regionId in setOf(current.home.id, current.work.id)) {
                    commuteWeather = commuteWeather + result.data
                    commuteProblems = commuteProblems.filterKeys { it != regionId } + result.problems
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { if (version == hourlyVersion) commuteProblems = commuteProblems + (regionId to WeatherProblem.CONNECTION) }
            finally { if (version == hourlyVersion) hourlyRegionLoading = null }
        }
    }
    private fun loadCommute(force: Boolean) {
        val version = ++commuteVersion
        commuteJob?.cancel()
        val settings = profile.commute
        val cycle = settings?.let { CommuteSchedule.next(it, now) }
        if (settings == null || cycle == null) {
            commuteWeather = emptyMap(); commuteProblems = emptyMap(); commuteLoading = false; return
        }
        val ids = buildList {
            if (cycle.outbound >= now) add(settings.home.id)
            if (cycle.returning >= now) add(settings.work.id)
        }.distinct()
        if (ids.isEmpty()) return
        lastCommuteAttempt = now
        commuteLoading = true
        commuteProblems = emptyMap()
        commuteJob = viewModelScope.launch {
            try {
                val cached = ids.mapNotNull { id -> repository.cached(id)?.let { id to it } }.toMap()
                if (version == commuteVersion) commuteWeather = commuteWeather.filterKeys { it in setOf(settings.home.id, settings.work.id) } + cached
                val result = repository.weatherMany(ids, force)
                if (version == commuteVersion) { commuteWeather = commuteWeather + result.data; commuteProblems = result.problems }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { if (version == commuteVersion) commuteProblems = ids.associateWith { WeatherProblem.CONNECTION } }
            finally { if (version == commuteVersion) commuteLoading = false }
        }
    }

    fun closePicker() { if (selectedRegion != null && !savingRegion) pickerOpen = false }

    fun updateQuery(value: String) {
        val version = ++searchVersion
        query = value.take(60)
        pendingRegion = null
        searchResults = emptyList()
        searchProblem = null
        searchJob?.cancel()
        if (query.trim().length < 2) { searchLoading = false; return }
        val requestedQuery = query.trim()
        searchLoading = true
        searchJob = viewModelScope.launch {
            delay(300)
            try {
                val results = repository.search(requestedQuery)
                if (version == searchVersion) searchResults = results
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: WeatherFailure) { if (version == searchVersion) searchProblem = failure.problem }
            catch (_: Exception) { if (version == searchVersion) searchProblem = WeatherProblem.CONNECTION }
            finally { if (version == searchVersion) searchLoading = false }
        }
    }

    fun chooseRegion(region: WeatherRegion) { pendingRegion = region }

    fun confirmRegion() {
        val region = pendingRegion ?: return
        if (savingRegion || storageProblem) return
        if (pickerPurpose != RegionPurpose.HOME) {
            profileDraft = if (pickerPurpose == RegionPurpose.COMMUTE_HOME) profileDraft.copy(home = region) else profileDraft.copy(work = region)
            pickerOpen = false
            draftProblem = null
            return
        }
        savingRegion = true
        viewModelScope.launch {
            try {
                store.save(region)
                pickerOpen = false
                searchProblem = null
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { searchProblem = WeatherProblem.STORAGE }
            finally { savingRegion = false }
        }
    }

    fun refresh() = loadWeather(force = true)

    private fun loadWeather(force: Boolean) {
        val region = selectedRegion ?: return
        val version = ++weatherVersion
        weatherJob?.cancel()
        loading = true
        problem = null
        lastAttempt = Instant.now()
        weatherJob = viewModelScope.launch {
            try {
                if (weather == null) {
                    val saved = repository.cached(region.id)
                    if (version == weatherVersion && selectedRegion?.id == region.id) weather = saved
                }
                val result = repository.weather(region.id, force)
                if (version == weatherVersion && selectedRegion?.id == region.id) {
                    if (result.hasData) { weather = result; problem = null }
                    else problem = WeatherProblem.UNAVAILABLE
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: WeatherFailure) { if (version == weatherVersion && selectedRegion?.id == region.id) problem = failure.problem }
            catch (_: Exception) { if (version == weatherVersion && selectedRegion?.id == region.id) problem = WeatherProblem.CONNECTION }
            finally { if (version == weatherVersion && selectedRegion?.id == region.id) { loading = false; now = Instant.now() } }
        }
    }

    fun onForeground() {
        foreground = true
        now = Instant.now()
        if (selectedRegion != null && !loading && (lastAttempt == null || Duration.between(lastAttempt, now) >= Duration.ofMinutes(5))) loadWeather(force = false)
        ensureCommute()
        if (profile.commute != null && !commuteLoading && (lastCommuteAttempt == null || Duration.between(lastCommuteAttempt, now) >= Duration.ofMinutes(5))) loadCommute(false)
    }
    fun onBackground() { foreground = false }

    fun displayWeather(): LocalWeather? = weather?.forDisplay(now, refreshFailed = problem != null)?.takeIf { it.hasData }
}
