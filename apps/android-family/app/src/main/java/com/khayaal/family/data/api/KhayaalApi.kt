package com.khayaal.family.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * The Khayaal backend contract for the family phone. Auth is the paired
 * phone's source credential — `x-kh-household` / `x-kh-source` / `x-kh-key` —
 * attached by the interceptor in [ApiClient], exactly the way the elder app
 * speaks. A `phone`-type source holds every device scope; endpoints the
 * server still reserves for a family *session* (sending commands) degrade
 * gracefully in the UI when they answer 404.
 */
interface FamilyApi {

    @POST("api/v1/pair")
    suspend fun pair(@Body body: PairRequest): PairResponse

    @POST("api/v1/household/{id}/sources")
    suspend fun createSource(
        @Path("id") householdId: String,
        @Body body: SourceCreateRequest,
    ): SourceCreateResponse

    @GET("api/v1/household/{id}/state")
    suspend fun state(@Path("id") householdId: String): FamilyBundleDto

    /** Stands the SOS down under this family member's name. */
    @POST("api/v1/household/{id}/sos/resolve")
    suspend fun resolveSos(
        @Path("id") householdId: String,
        @Body body: SosResolveRequest,
    ): SosActionResponse

    /** Composes a message / reminder / voice note for her phone. */
    @POST("api/v1/household/{id}/commands")
    suspend fun sendCommand(
        @Path("id") householdId: String,
        @Body body: CommandCreateRequest,
    ): CommandCreateResponse

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
