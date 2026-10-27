package com.khayaal.app.commands

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The voice of a 'tts' command: a voice reminder read aloud on the phone's
 * speaker. No microphone is involved — TextToSpeech is output only. The
 * engine initialises asynchronously; anything asked for before it is ready
 * is queued and drained on init.
 */
class TtsSpeaker(context: Context) {

    private val pending = ArrayDeque<String>()
    private var engine: TextToSpeech? = null
    private val ready = AtomicBoolean(false)
    private var usable = false
    private var utteranceCounter = 0

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            usable = status == TextToSpeech.SUCCESS
            if (usable) {
                runCatching { engine?.language = Locale.getDefault() }
                ready.set(true)
                drain()
            }
        }
    }

    @Synchronized
    fun speak(text: String) {
        if (text.isBlank()) return
        if (!ready.get()) {
            if (pending.size < PENDING_CAP) pending.addLast(text)
            return
        }
        utter(peek = false, text)
    }

    @Synchronized
    private fun drain() {
        while (pending.isNotEmpty()) {
            utter(peek = true, pending.removeFirst())
        }
    }

    private fun utter(peek: Boolean, text: String) {
        utteranceCounter += 1
        runCatching {
            engine?.speak(
                text,
                TextToSpeech.QUEUE_ADD,
                null,
                "khayaal-tts-$utteranceCounter",
            )
        }.onFailure { if (peek) pending.addFirst(text) }
    }

    @Synchronized
    fun stop() {
        runCatching { engine?.stop() }
        pending.clear()
    }

    @Synchronized
    fun shutdown() {
        runCatching { engine?.stop() }
        runCatching { engine?.shutdown() }
        engine = null
        pending.clear()
        ready.set(false)
    }

    private companion object {
        const val PENDING_CAP = 5
    }
}
