package com.khayaal.neighbour.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * The Khayaal backend contract for the neighbour phone. Auth is the paired
 * phone's source credential — `x-kh-household` / `x-kh-source` / `x-kh-key` —
 * attached by the interceptor in [ApiClient], the same scheme every Khayaal
 * client speaks. The `/circle` route is asked best-effort and degrades
 * gracefully when the server still reserves it for a family session.
 */
interface NeighbourApi {

    @POST("api/v1/pair")
    suspend fun pair(@Body body: PairRequest): PairResponse

    @POST("api/v1/household/{id}/sources")
    suspend fun createSource(
        @Path("id") householdId: String,
        @Body body: SourceCreateRequest,
    ): SourceCreateResponse

    /** Asks the server to list this neighbour in the household's care circle. */
    @POST("api/v1/household/{id}/circle")
    suspend fun addToCircle(
        @Path("id") householdId: String,
        @Body body: CircleAddRequest,
    ): CircleAddResponse

    @GET("api/v1/household/{id}/state")
    suspend fun state(@Path("id") householdId: String): NeighbourBundleDto

    /** "I'm responding", with an optional ETA in minutes. */
    @POST("api/v1/household/{id}/sos/respond")
    suspend fun respondSos(
        @Path("id") householdId: String,
        @Body body: SosRespondRequest,
    ): SosActionResponse

    /** Registers this phone's FCM token for instant SOS pushes. */
    @POST("api/v1/household/{id}/devices")
    suspend fun registerDevice(
        @Path("id") householdId: String,
        @Body body: DeviceTokenRequest,
    ): DeviceTokenResponse

    /** Unregisters the FCM token (unpair). */
    @DELETE("api/v1/household/{id}/devices")
    suspend fun unregisterDevice(
        @Path("id") householdId: String,
        @Body body: DeviceTokenRequest,
    ): DeviceTokenResponse
}
