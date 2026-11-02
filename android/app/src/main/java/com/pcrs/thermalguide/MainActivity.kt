package com.pcrs.thermalguide

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import com.pcrs.thermalguide.app.ThermalGuideApp
import com.pcrs.thermalguide.core.ui.theme.ThermalGuideTheme
import com.pcrs.thermalguide.core.weather.WeatherViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val weather = ViewModelProvider(this)[WeatherViewModel::class.java]
        setContent {
            ThermalGuideTheme {
                ThermalGuideApp(weather)
            }
        }
    }
}
