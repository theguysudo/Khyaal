package com.khayaal.app.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * The Khayaal backend contract. Every route here exists in apps/web under
 * app/api/v1. Auth is intentionally body-based: sources carry their key in
 * the ingest body, matching the ESP32 firmware's behaviour.
 */
interface KhayaalApi {

    @POST("api/v1/pair")
    suspend fun pair(@Body body: PairRequest): PairResponse

    @POST("api/v1/ingest")
    suspend fun ingest(@Body body: IngestRequest): IngestResponse

    @GET("api/v1/household/{id}/state")
    suspend fun state(@Path("id") householdId: String): StateBundleDto

    @POST("api/v1/household/{id}/checkin")
    suspend fun checkIn(@Path("id") householdId: String): StateBundleDto

    @POST("api/v1/household/{id}/snooze")
    suspend fun snooze(
        @Path("id") householdId: String,
        @Body body: SnoozeRequest,
    ): StateBundleDto

    @POST("api/v1/household/{id}/sources")
    suspend fun createSource(
        @Path("id") householdId: String,
        @Body body: SourceCreateRequest,
    ): SourceCreateResponse
}
