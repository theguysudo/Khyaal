package com.khayaal.neighbour.data.api

import com.khayaal.neighbour.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Builds and caches one Retrofit instance per base URL (the address stays
 * configurable in Settings). While a pairing record exists, every request
 * carries the device credential headers — the same scheme as the elder app,
 * the ESP32 and the web relay.
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

    private val instances = ConcurrentHashMap<String, NeighbourApi>()

    fun api(rawBaseUrl: String): NeighbourApi {
        val url = normalizeBaseUrl(rawBaseUrl)
        return instances.getOrPut(url) { build(url) }
    }

    private fun build(baseUrl: String): NeighbourApi {
        val logging = HttpLoggingInterceptor().apply {
            // BASIC: method, URL and status only — never bodies, so keys and
            // the household's data stay out of logcat.
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
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(auth)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(NeighbourApi::class.java)
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

/** This phone's identity inside the household. */
data class DeviceCredentials(
    val householdId: String,
    val sourceId: String,
    val apiKey: String,
)
