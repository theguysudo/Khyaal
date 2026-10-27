package com.khayaal.app.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/*
 * Wire shapes for the Khayaal backend (apps/web Next.js routes). All models
 * tolerate unknown fields so the Android client never breaks when the demo
 * backend grows.
 */

@Serializable
data class PairRequest(
    val action: String,
    val code: String,
)

@Serializable
data class QuietHoursDto(
    val start: Int = 0,
    val end: Int = 0,
)

@Serializable
data class EscalationConfigDto(
    val nudgeAfterMin: Long = 30,
    val checkInAfterMin: Long = 45,
    val alertAfterMin: Long = 60,
)

@Serializable
data class HouseholdDto(
    val id: String,
    val parentName: String = "",
    val childName: String = "",
    val pairingCode: String? = null,
    val quietHours: QuietHoursDto? = null,
    val escalationConfig: EscalationConfigDto? = null,
    val simTimeOffsetMs: Long = 0,
    val learningUntilTs: Long? = null,
    val createdAtTs: Long? = null,
    /** Who else is looking out for her — shown on the tier-3 alarm. Absent on older backends. */
    val careCircle: List<CareCircleMemberDto> = emptyList(),
    /** Escalation timing extras; absent on older backends. */
    val callPlan: CallPlanDto? = null,
)

@Serializable
data class CareCircleMemberDto(
    val name: String = "",
    val email: String = "",
    /** Present on newer backends — powers "call <name>" and the call chain. */
    val phone: String? = null,
    val role: String = "",
    val addedTs: Long? = null,
)

@Serializable
data class CallPlanDto(
    val callElderAfterMin: Long? = null,
    val alertCircleAfterMin: Long? = null,
    /** The free call chain: who to call, in order. Absent on older backends. */
    val callOrder: List<CallOrderEntryDto> = emptyList(),
)

@Serializable
data class CallOrderEntryDto(
    val name: String = "",
    val phone: String = "",
)

@Serializable
data class PairResponse(
    val household: HouseholdDto? = null,
    val error: String? = null,
)

/** One POST /api/v1/ingest body. The API key travels in the body, never a header. */
@Serializable
data class IngestRequest(
    @SerialName("householdId") val householdId: String,
    @SerialName("sourceId") val sourceId: String,
    val type: String,
    val value: JsonElement,
    val ts: Long,
    val apiKey: String,
)

@Serializable
data class IngestResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

@Serializable
data class ContributionDto(
    val signal: String = "",
    val weight: Double = 0.0,
    val effect: Double = 0.0,
    val reason: String = "",
)

@Serializable
data class TrendPointDto(
    val ts: Long = 0,
    val score: Int = 0,
)

@Serializable
data class AckDto(
    val by: String = "",
    val ts: Long = 0,
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
    val scoreTrend: List<TrendPointDto> = emptyList(),
    val snoozeUntilTs: Long? = null,
    val ack: AckDto? = null,
    val learning: Boolean = false,
) {
    /** score arrives as number|null; unwrap it without guessing the wire type. */
    val scoreValue: Int?
        get() = (score as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()
}

@Serializable
data class SourceDto(
    val id: String = "",
    val type: String = "",
    val label: String = "",
    val lastSeenTs: Long? = null,
)

/** A one-way family→app nudge composed on the web dashboard. */
@Serializable
data class CommandDto(
    val id: String = "",
    val type: String = "",
    val text: String = "",
    val ts: Long = 0,
    val ackTs: Long? = null,
    /** "hi" | "en" — the language the text should be spoken in. Default "en". */
    val lang: String? = null,
) {
    object Types {
        const val MESSAGE = "message"
        const val REMINDER = "reminder"
        const val TTS = "tts"
        const val REQUEST_CHECKIN = "request_checkin"
    }
}

@Serializable
data class CommandAckRequest(val id: String)

@Serializable
data class CommandAckResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

/** One turn of the "Ask Khayaal" conversation. Roles: "user" | "assistant". */
@Serializable
data class AssistantMessageDto(
    val role: String,
    val content: String,
)

@Serializable
data class AssistantRequest(
    val messages: List<AssistantMessageDto>,
)

@Serializable
data class AssistantResponse(
    val reply: String? = null,
    val error: String? = null,
)

/** POST/DELETE /household/{id}/devices — FCM token registration. */
@Serializable
data class DeviceTokenRequest(val token: String)

@Serializable
data class DeviceTokenResponse(
    val ok: Boolean? = null,
    val error: String? = null,
)

/** GET/POST checkin/snooze all return the same "tick bundle" the dashboard polls. */
@Serializable
data class StateBundleDto(
    val state: StateDto? = null,
    val household: HouseholdDto? = null,
    val sources: List<SourceDto> = emptyList(),
    val simNowTs: Long? = null,
    val realNowTs: Long? = null,
    /** Family→app commands channel; absent on backends that predate it. */
    val commands: List<CommandDto> = emptyList(),
)

@Serializable
data class SnoozeRequest(val minutes: Long)

@Serializable
data class SourceCreateRequest(
    val type: String,
    val label: String,
)

/** POST /household/{id}/sources — the only response that carries the API key. */
@Serializable
data class SourceCreateResponse(
    val id: String = "",
    val type: String = "",
    val label: String = "",
    val apiKey: String? = null,
    val lastSeenTs: Long? = null,
)
