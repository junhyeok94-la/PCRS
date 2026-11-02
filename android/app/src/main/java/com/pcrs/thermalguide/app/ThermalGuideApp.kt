package com.pcrs.thermalguide.app

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.pcrs.thermalguide.R
import com.pcrs.thermalguide.feature.home.HomeScreen
import com.pcrs.thermalguide.feature.hourly.HourlyScreen
import com.pcrs.thermalguide.feature.settings.SettingsScreen
import com.pcrs.thermalguide.feature.settings.PersonalEditorScreen
import com.pcrs.thermalguide.feature.region.RegionScreen
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

private enum class AppTab(@param:StringRes val label: Int, val icon: ImageVector) {
    HOME(R.string.tab_home, Icons.Outlined.Home),
    HOURLY(R.string.tab_hourly, Icons.Outlined.DateRange),
    SETTINGS(R.string.tab_settings, Icons.Outlined.Settings),
}

@Composable
fun ThermalGuideApp(model: WeatherViewModel) {
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.HOME.name) }
    val selectedTab = AppTab.entries.firstOrNull { it.name == selectedTabName } ?: AppTab.HOME
    val tabState = rememberSaveableStateHolder()

    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event -> when (event) { Lifecycle.Event.ON_START -> model.onForeground(); Lifecycle.Event.ON_STOP -> model.onBackground(); else -> Unit } }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    BackHandler(enabled = selectedTab != AppTab.HOME && !model.pickerOpen && model.editor == null) {
        selectedTabName = AppTab.HOME.name
    }
    BackHandler(enabled = model.pickerOpen && model.selectedRegion != null) { model.closePicker() }
    BackHandler(enabled = model.editor != null && !model.pickerOpen) { model.closeEditor() }

    Scaffold(
        bottomBar = {
            if (model.settingsLoaded && !model.pickerOpen && model.selectedRegion != null && model.editor == null) {
            NavigationBar {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTabName = tab.name },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(stringResource(tab.label)) },
                    )
                }
            }
            }
        },
    ) { padding ->
        val modifier = Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)
        if (!model.settingsLoaded) {
            Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (model.pickerOpen || model.selectedRegion == null) {
            RegionScreen(model, modifier)
        } else if (model.editor != null) {
            PersonalEditorScreen(model, modifier)
        } else {
        tabState.SaveableStateProvider(selectedTab.name) {
            when (selectedTab) {
                AppTab.HOME -> HomeScreen(model, onHourly = { selectedTabName = AppTab.HOURLY.name }, modifier)
                AppTab.HOURLY -> HourlyScreen(model, modifier)
                AppTab.SETTINGS -> SettingsScreen(model, modifier)
            }
        }
        }
    }
}
