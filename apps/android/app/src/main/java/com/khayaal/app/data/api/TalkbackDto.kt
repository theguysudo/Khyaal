package com.khayaal.app.data.api

import kotlinx.serialization.Serializable

/*
 * The talkback wire contract, mirrored exactly from
 * apps/web/lib/server/talkback.ts and packages/shared/src/index.ts.
 *
 * Audio is signed 16-bit LITTLE-ENDIAN PCM, mono, 16 000 Hz, base64-encoded
 * in slices of ~250 ms (4000 samples). The mime string is the same on both
 * sides: 'audio/pcm;rate=16000'.
 */

/** One live conversation. `state` drives the consent popup and the mic gate. */
@Serializable
data class TalkbackSessionDto(
    val id: String = "",
    val householdId: String = "",
    /** Who asked: "family" | "parent". */
    val requester: String = "",
    val requesterName: String = "",
    /** The side being asked — the consent popup lands here. */
    val callee: String = "",
    /** "pending" | "active" | "declined" | "ended". */
    val state: String = "",
    val createdTs: Long = 0,
    val answeredTs: Long? = null,
    val endedTs: Long? = null,
    /** True once the callee has allowed the microphone to open. */
    val consentGiven: Boolean = false,
) {
    object Roles {
        const val FAMILY = "family"
        const val PARENT = "parent"
    }

    object States {
        const val PENDING = "pending"
        const val ACTIVE = "active"
        const val DECLINED = "declined"
        const val ENDED = "ended"
    }

    /** True when the microphone is allowed to open on this side. */
    val canSpeak: Boolean get() = state == States.ACTIVE && consentGiven
}

/** POST /talkback/request — direction says which side is being asked. */
@Serializable
data class TalkbackRequestBody(
    val direction: String = "to_family",
) {
    object Directions {
        const val TO_PARENT = "to_parent"
        const val TO_FAMILY = "to_family"
    }
}

/** POST /talkback/answer — the consent decision. */
@Serializable
data class TalkbackAnswerBody(
    val sessionId: String,
    val allow: Boolean,
)

/** POST /talkback/chunk — one audio slice; the server stamps seq and from. */
@Serializable
data class TalkbackChunkBody(
    val sessionId: String,
    val mime: String,
    val data: String,
)

/** POST /talkback/end — either side may hang up. */
@Serializable
data class TalkbackEndBody(
    val sessionId: String = "",
)

/** GET /talkback/session and POST /talkback/request|answer share this shape. */
@Serializable
data class TalkbackSessionResponse(
    val session: TalkbackSessionDto? = null,
    /** The server's view of who we are: "family" | "parent". */
    val role: String? = null,
    /** True when an existing session was returned instead of a new one. */
    val reused: Boolean? = null,
    val error: String? = null,
)

/** One slice of audio as it comes back from the long poll. */
@Serializable
data class TalkbackChunkDto(
    val seq: Long = 0,
    val ts: Long = 0,
    val mime: String = "",
    val data: String = "",
    /** Which side produced it — the server derives this, clients cannot forge it. */
    val from: String = "",
)

/** GET /talkback/chunks — the long poll answer. */
@Serializable
data class TalkbackChunksResponse(
    val chunks: List<TalkbackChunkDto> = emptyList(),
    val now: Long = 0,
    val ended: Boolean = false,
    val error: String? = null,
)

/** POST /talkback/chunk and /talkback/end answer with { ok, seq }. */
@Serializable
data class TalkbackOkResponse(
    val ok: Boolean = false,
    val seq: Long? = null,
    val error: String? = null,
)

/** The wire format both sides speak — kept here so the two can't drift apart. */
object TalkbackAudio {
    const val SAMPLE_RATE = 16000
    const val MIME = "audio/pcm;rate=16000"

    /** ~250 ms of 16 kHz mono PCM16. */
    const val CHUNK_SAMPLES = 4000
}
