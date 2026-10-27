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
 * configurable at runtime (Settings) without an app restart. The HTTP client
 * adds no auth header — API keys travel in the request body per the API spec.
 */
class ApiClient {

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
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
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
