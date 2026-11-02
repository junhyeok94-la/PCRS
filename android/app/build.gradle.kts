plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

fun quotedBuildValue(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""

android {
    namespace = "com.pcrs.thermalguide"
    compileSdk = 36

    defaultConfig {
        // Development identifier; confirm ownership before a Play Store release.
        applicationId = "com.pcrs.thermalguide"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("String", "WEATHER_API_BASE_URL", quotedBuildValue(
                providers.gradleProperty("weatherDebugApiBaseUrl").getOrElse("http://10.0.2.2:8010"),
            ))
        }
        getByName("release") {
            val endpoint = providers.gradleProperty("weatherApiBaseUrl").getOrElse("")
            require(endpoint.isEmpty() || endpoint.startsWith("https://")) { "Release weather endpoint must use HTTPS" }
            buildConfigField("String", "WEATHER_API_BASE_URL", quotedBuildValue(endpoint))
        }
    }
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.lifecycle.viewmodel)
    implementation(libs.androidx.lifecycle.compose)
    implementation(libs.androidx.datastore)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}
