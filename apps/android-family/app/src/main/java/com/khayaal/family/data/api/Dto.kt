package com.khayaal.family.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/*
 * Wire shapes for the Khayaal backend, trimmed to what a family phone needs.
 * All models tolerate unknown fields so the client never breaks when the
 * backend grows. Tier names/colors intentionally mirror the web dashboard's
 * TIER_META (apps/web/lib/api.ts) — see ui/theme/TierMeta.kt.
 */

@Serializable
data class PairRequest(
    val action: String,
    val code: String,
)

@Serializable
data class CareCircleMemberDto(
    val name: String = "",
    val email: String = "",
    /** Powers the call / WhatsApp row on the SOS screen. Absent on older backends. */
    val phone: String? = null,
    val role: String = "",
    val addedTs: Long? = null,
)

@Serializable
data class HouseholdDto(
    val id: String,
    val parentName: String = "",
    val childName: String = "",
    val pairingCode: String? = null,
    val simTimeOffsetMs: Long = 0,
    /** Who else is looking out for her — the SOS screen calls these people. */
    val careCircle: List<CareCircleMemberDto> = emptyList(),
)

@Serializable
data class PairResponse(
    val household: HouseholdDto? = null,
    val error: String? = null,
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
    val originButton: Boolean get() = origin == SosResolveRequest.ORIGIN_BUTTON
    val originAuto: Boolean get() = origin == SosResolveRequest.ORIGIN_AUTO
}

@Serializable
data class SosResolveRequest(val by: String) {
    companion object {
        const val ORIGIN_BUTTON = "button"
        const val ORIGIN_AUTO = "auto"
    }
}

@Serializable
data class SosActionResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class ContributionDto(
    val signal: String = "",
    val weight: Double = 0.0,
    val effect: Double = 0.0,
    /** Plain language, written for the family — shown as "today's reasons". */
    val reason: String = "",
)

@Serializable
data class StateDto(
    /** Null while the engine is still learning. */
    val score: JsonElement? = null,
    val tier: Int = 0,
    val status: String = "",
    val contributions: List<ContributionDto> = emptyList(),
    val confidence: Double = 1.0,
    val lastActiveTs: Long? = null,
    val tierSinceTs: Long? = null,
    val updatedTs: Long? = null,
    val snoozeUntilTs: Long? = null,
    val ack: AckDto? = null,
    val learning: Boolean = false,
) {
    /** score arrives as number|null; unwrap it without guessing the wire type. */
    val scoreValue: Int?
        get() = (score as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()
}

/** One line of the household's day, as the backend narrates it. */
@Serializable
data class EventDto(
    val id: String = "",
    val ts: Long = 0,
    val type: String = "",
    val meta: String? = null,
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

/** POST /household/{id}/commands — the family speaks into her phone. */
@Serializable
data class CommandCreateRequest(
    val type: String,
    val text: String,
    /** "en" | "hi" — the language a voice note is spoken in. */
    val lang: String? = null,
) {
    companion object {
        const val TYPE_MESSAGE = "message"
        const val TYPE_REMINDER = "reminder"
        const val TYPE_TTS = "tts"
        const val LANG_EN = "en"
        const val LANG_HI = "hi"
    }
}

@Serializable
data class CommandCreateResponse(
    val command: CommandDto? = null,
    val error: String? = null,
)

@Serializable
data class CommandDto(
    val id: String = "",
    val ts: Long = 0,
    val type: String = "",
    val text: String = "",
)

/** POST/DELETE /household/{id}/devices — FCM token registration. */
@Serializable
data class DeviceTokenRequest(val token: String)

@Serializable
data class DeviceTokenResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

/** GET /household/{id}/state — the same bundle the web dashboard polls. */
@Serializable
data class FamilyBundleDto(
    val state: StateDto? = null,
    val household: HouseholdDto? = null,
    val events: List<EventDto> = emptyList(),
    val sos: SosStateDto? = null,
    val simNowTs: Long? = null,
    val realNowTs: Long? = null,
    /** The watchers — every paired device, keys stripped server-side. Absent on older backends. */
    val sources: List<SourceDto> = emptyList(),
    /** Movement, summarised on her phone — presence, never a trail. */
    val movement: MovementSummaryDto? = null,
    /** The band's latest reading — aggregates, never a live feed. */
    val smartwatch: SmartwatchSummaryDto? = null,
)

/** One watcher in "The watchers" panel. The apiKey never crosses the wire. */
@Serializable
data class SourceDto(
    val id: String = "",
    val type: String = "",
    val label: String = "",
    val lastSeenTs: Long? = null,
) {
    /** A watcher is "live" when it reported in the last 15 minutes. */
    fun isLive(nowTs: Long): Boolean =
        lastSeenTs != null && nowTs - lastSeenTs < LIVE_WINDOW_MS

    companion object {
        const val LIVE_WINDOW_MS = 15 * 60_000L
    }
}

/** Movement summary — the numbers her phone computed, nothing spatial. */
@Serializable
data class MovementSummaryDto(
    val zone: String? = null,
    val distanceM: Double? = null,
    val speedKmh: Double? = null,
    val lastTs: Long? = null,
    val stepsToday: Long? = null,
)

/** The wearable's latest reading — a few numbers, never a trace. */
@Serializable
data class SmartwatchSummaryDto(
    val paired: Boolean = false,
    val sourceId: String? = null,
    val label: String? = null,
    val stepsToday: Long? = null,
    val heartRateBpm: Long? = null,
    val heartRateTs: Long? = null,
    val sleepMinutesLastNight: Int? = null,
    val sleepTs: Long? = null,
    val activeMinutesToday: Int? = null,
    val activityTs: Long? = null,
    val lastSeenTs: Long? = null,
)
