package com.pcrs.thermalguide.core.weather

import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

/** Bounded, replace-on-success snapshots. Can be evicted by Android without losing user settings. */
class WeatherDiskCache(root: File, endpoint: String, private val maxEntries: Int = 8) {
    private val namespace = MessageDigest.getInstance("SHA-256").digest(endpoint.trimEnd('/').toByteArray())
        .joinToString("") { "%02x".format(it) }.take(24)
    private val directory = File(root, "weather-v1-$namespace")
    private fun file(id: String): File? = id.takeIf { it.matches(Regex("[0-9]{10}")) }?.let { File(directory, "$it.json") }

    @Synchronized fun read(regionId: String): LocalWeather? = runCatching {
        val file = file(regionId) ?: return null
        if (!file.isFile || file.length() > 2_000_000) return null
        val text = file.readText(Charsets.UTF_8)
        if (JSONObject(text).getInt("cacheVersion") != 1) return null
        WeatherJson.weather(text, regionId)
    }.getOrNull()

    @Synchronized fun save(weather: LocalWeather) {
        if (!weather.hasData) return
        val destination = file(weather.region.id) ?: return
        var temporary: File? = null
        try {
            directory.mkdirs()
            val bytes = WeatherJson.cacheText(weather).toByteArray(Charsets.UTF_8)
            if (bytes.size > 2_000_000) return
            temporary = File.createTempFile("snapshot-", ".tmp", directory)
            FileOutputStream(temporary).use { it.write(bytes); it.fd.sync() }
            try {
                Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temporary.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            directory.listFiles { file -> file.extension == "json" }?.sortedByDescending { it.lastModified() }
                ?.drop(maxEntries)?.forEach { it.delete() }
        } catch (_: Exception) {
            // Disk full/unavailable must not turn a successful weather response into a network error.
        } finally { temporary?.delete() }
    }
}
