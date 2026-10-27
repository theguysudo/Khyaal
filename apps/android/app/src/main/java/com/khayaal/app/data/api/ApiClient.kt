package com.khayaal.app.data.api

import com.khayaal.app.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Builds and caches one Retrofit instance per base URL, so the base URL stays
 * configurable at runtime (Settings) without an app restart. While a pairing
 * record exists, every request carries the device credentials —
 * `x-kh-household` / `x-kh-source` / `x-kh-key` — the server accepts those
 * on her-device routes (state, assistant, talkback, commands, check-in) the
 * same way the ESP32 uses them in LAN mode.
 */
class ApiClient {

    /** The credentials of the current pairing; null when unpaired. */
    @Volatile
    var deviceCredentials: DeviceCredentials? = null

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        encodeDefaults = true
    }

    private val instances = ConcurrentHashMap<String, KhayaalApi>()

    fun api(rawBaseUrl: String): KhayaalApi {
        val url = normalizeBaseUrl(rawBaseUrl)
        return instances.getOrPut(url) { build(url) }
    }

    private fun build(baseUrl: String): KhayaalApi {
        val logging = HttpLoggingInterceptor().apply {
            // BASIC: method, URL and status only — never bodies, so signal
            // payloads and keys stay out of logcat.
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        val auth = okhttp3.Interceptor { chain ->
            val creds = deviceCredentials
            val request = if (creds != null) {
                chain.request().newBuilder()
                    .header("x-kh-household", creds.householdId)
                    .header("x-kh-source", creds.sourceId)
                    .header("x-kh-key", creds.apiKey)
                    .build()
            } else {
                chain.request()
            }
            chain.proceed(request)
        }
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            // The talkback chunk poll is held open by the server for up to 15 s,
            // so the read timeout has to be comfortably longer than that.
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(auth)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(KhayaalApi::class.java)
    }

    companion object {
        /** Retrofit requires a trailing slash; be forgiving about what's pasted in. */
        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim().trimEnd('/')
            require(trimmed.isNotBlank()) { "Server address is empty" }
            return "$trimmed/"
        }
    }
}

/**
 * The device credentials the server checks on every household route: which
 * household this phone belongs to, which source it is, and that source's
 * key. They travel in headers on household routes and in the body on
 * /api/v1/ingest — the one endpoint the firmware also speaks.
 */
data class DeviceCredentials(
    val householdId: String,
    val sourceId: String,
    val apiKey: String,
)
