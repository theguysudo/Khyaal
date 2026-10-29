package com.khayaal.neighbour.data.api

import kotlinx.serialization.Serializable

/*
 * Wire shapes for the Khayaal backend, trimmed to what a neighbour needs —
 * and deliberately trimmed DOWN: there is no score, no contributions and no
 * events here. A neighbour's phone never even parses health data, so it can
 * never display or leak it. All models tolerate unknown fields.
 */

@Serializable
data class PairRequest(
    val action: String,
    val code: String,
)

@Serializable
data class PairResponse(
    val household: HouseholdDto? = null,
    val error: String? = null,
)

@Serializable
data class HouseholdDto(
    val id: String,
    val parentName: String = "",
    val childName: String = "",
    /** Present in the /state bundle; the neighbour app only uses the names. */
    val careCircle: List<CareCircleMemberDto> = emptyList(),
)

@Serializable
data class CareCircleMemberDto(
    val name: String = "",
    val email: String = "",
    /** Powers "Call family" on the SOS screen. Absent on older backends. */
    val phone: String? = null,
    val role: String = "",
)

@Serializable
data class SourceCreateRequest(
    val type: String,
    val label: String,
    /** Required when creating a source without a family session: proves the phone was invited. */
    val pairingCode: String? = null,
)

@Serializable
data class SourceCreateResponse(
    val id: String = "",
    val type: String = "",
    val label: String = "",
    val apiKey: String? = null,
    val lastSeenTs: Long? = null,
)

@Serializable
data class AckDto(
    val by: String = "",
    val ts: Long = 0,
)

/**
 * The household's SOS flag inside the state bundle. Null on backends that
 * predate SOS — which reads as "no SOS", the safe default.
 */
@Serializable
data class SosStateDto(
    val active: Boolean = false,
    /** "button" | "auto", or null when the server did not say. */
    val origin: String? = null,
    val sinceTs: Long? = null,
    val ack: AckDto? = null,
) {
    val originButton: Boolean get() = origin == ORIGIN_BUTTON
    val originAuto: Boolean get() = origin == ORIGIN_AUTO

    companion object {
        const val ORIGIN_BUTTON = "button"
        const val ORIGIN_AUTO = "auto"
    }
}

/** A neighbour says "I'm responding", with an optional ETA in minutes. */
@Serializable
data class SosRespondRequest(
    val by: String,
    val etaMin: Long? = null,
)

@Serializable
data class SosActionResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

/**
 * POST /household/{id}/circle — the existing care-circle endpoint. The server
 * is asked to add this neighbour with role `neighbor`. Family-session-gated
 * today: if the answer is 404/401/403 the app degrades gracefully (the alarm
 * still works on this phone; the family can add the neighbour from the
 * dashboard).
 */
@Serializable
data class CircleAddRequest(
    val action: String = "add",
    val name: String,
    val email: String,
    val role: String = "neighbor",
)

@Serializable
data class CircleAddResponse(
    val circle: List<CareCircleMemberDto> = emptyList(),
    val error: String? = null,
)

/** GET /household/{id}/state — the tier, the status, the SOS flag. That's all. */
@Serializable
data class NeighbourBundleDto(
    val state: NeighbourStateDto? = null,
    val household: HouseholdDto? = null,
    val sos: SosStateDto? = null,
    val simNowTs: Long? = null,
    val realNowTs: Long? = null,
)

/** The neighbour's view of the wellbeing state: the tier, nothing else. */
@Serializable
data class NeighbourStateDto(
    val tier: Int = 0,
    val status: String = "",
)

/** POST/DELETE /household/{id}/devices — FCM token registration. */
@Serializable
data class DeviceTokenRequest(val token: String)

@Serializable
data class DeviceTokenResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)
