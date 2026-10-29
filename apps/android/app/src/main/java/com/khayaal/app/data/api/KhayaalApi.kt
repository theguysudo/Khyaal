package com.khayaal.app.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

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

    // -- SOS -------------------------------------------------------------------
    // The elder device calls these with its own source credentials (the
    // interceptor attaches x-kh-household / x-kh-source / x-kh-key).

    /** Raises the SOS. Origin is "button" (she pressed it) or "auto". */
    @POST("api/v1/household/{id}/sos")
    suspend fun triggerSos(
        @Path("id") householdId: String,
        @Body body: SosTriggerRequest,
    ): SosActionResponse

    /** Stands the SOS down. The elder device or a family session. */
    @POST("api/v1/household/{id}/sos/resolve")
    suspend fun resolveSos(
        @Path("id") householdId: String,
        @Body body: SosResolveRequest,
    ): SosActionResponse

    /** A neighbour says "I'm responding", with an optional ETA in minutes. */
    @POST("api/v1/household/{id}/sos/respond")
    suspend fun respondSos(
        @Path("id") householdId: String,
        @Body body: SosRespondRequest,
    ): SosActionResponse

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

    /** Confirms a family command reached her phone. 404 on older backends — tolerate. */
    @POST("api/v1/household/{id}/command-ack")
    suspend fun ackCommand(
        @Path("id") householdId: String,
        @Body body: CommandAckRequest,
    ): CommandAckResponse

    /** "Ask Khayaal": the app sends the conversation, the backend holds the LLM key. */
    @POST("api/v1/household/{id}/assistant")
    suspend fun assistant(
        @Path("id") householdId: String,
        @Body body: AssistantRequest,
    ): AssistantResponse

    /** Registers this phone's FCM token for instant tier pushes. */
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

    // -- Talkback (the walkie-talkie) --------------------------------------------
    // Every route authenticates with the same pairing headers the interceptor
    // already attaches (x-kh-source + x-kh-key); the server derives our role
    // from that credential, so a client can never claim to be the other side.

    /** Opens a talkback request. The other side sees a consent popup. */
    @POST("api/v1/household/{id}/talkback/request")
    suspend fun talkbackRequest(
        @Path("id") householdId: String,
        @Body body: TalkbackRequestBody,
    ): TalkbackSessionResponse

    /** The live session, whichever side is asking. Polled every few seconds. */
    @GET("api/v1/household/{id}/talkback/session")
    suspend fun talkbackSession(
        @Path("id") householdId: String,
    ): TalkbackSessionResponse

    /** The consent decision — only the side being called may answer. */
    @POST("api/v1/household/{id}/talkback/answer")
    suspend fun talkbackAnswer(
        @Path("id") householdId: String,
        @Body body: TalkbackAnswerBody,
    ): TalkbackSessionResponse

    /** Posts one ~250 ms audio slice. The server stamps seq and from. */
    @POST("api/v1/household/{id}/talkback/chunk")
    suspend fun talkbackChunk(
        @Path("id") householdId: String,
        @Body body: TalkbackChunkBody,
    ): TalkbackOkResponse

    /** Long-polls for new audio slices (the server holds the request ~15 s). */
    @GET("api/v1/household/{id}/talkback/chunks")
    suspend fun talkbackChunks(
        @Path("id") householdId: String,
        @Query("after") after: Long,
        @Query("sessionId") sessionId: String,
    ): TalkbackChunksResponse

    /** Either side may hang up; the audio slices are dropped with the session. */
    @POST("api/v1/household/{id}/talkback/end")
    suspend fun talkbackEnd(
        @Path("id") householdId: String,
        @Body body: TalkbackEndBody,
    ): TalkbackOkResponse
}
