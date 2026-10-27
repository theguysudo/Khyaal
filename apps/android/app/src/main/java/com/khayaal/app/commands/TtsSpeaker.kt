package com.khayaal.app.commands

import android.content.Context
import android.speech.tts.TextToSpeech
import android.widget.Toast
import com.khayaal.app.R
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The voice of a 'tts' command: a voice reminder read aloud on the phone's
 * speaker. No microphone is involved — TextToSpeech is output only. The
 * engine initialises asynchronously; anything asked for before it is ready
 * is queued and drained on init.
 *
 * Commands may carry `lang: "hi" | "en"`. Hindi utterances switch the engine
 * to hi-IN for that utterance; if the Hindi voice data is missing on the
 * device we fall back to the default voice and gently suggest (once per
 * session, via toast) installing Hindi speech data.
 */
class TtsSpeaker(private val context: Context) {

    private val pending = ArrayDeque<Spoken>()
    private var engine: TextToSpeech? = null
    private val ready = AtomicBoolean(false)
    private var usable = false
    private var utteranceCounter = 0
    private var hindiFallbackToastShown = false

    private data class Spoken(val text: String, val lang: String?)

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            usable = status == TextToSpeech.SUCCESS
            if (usable) {
                runCatching { engine?.setLanguage(Locale.getDefault()) }
                ready.set(true)
                drain()
            }
        }
    }

    @Synchronized
    fun speak(text: String, lang: String? = null) {
        if (text.isBlank()) return
        if (!ready.get()) {
            if (pending.size < PENDING_CAP) pending.addLast(Spoken(text, lang))
            return
        }
        utter(peek = false, Spoken(text, lang))
    }

    @Synchronized
    private fun drain() {
        while (pending.isNotEmpty()) {
            val spoken = pending.removeFirst()
            utter(peek = true, spoken)
        }
    }

    private fun utter(peek: Boolean, spoken: Spoken) {
        val activeEngine = engine ?: return
        val locale = localeFor(spoken.lang)
        if (locale != null) {
            // setLanguage returns LANG_* codes; a negative result means the
            // voice data for that language isn't on the device.
            val result = runCatching {
                activeEngine.setLanguage(locale)
            }.getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
            if (result == TextToSpeech.LANG_MISSING_DATA ||
                result == TextToSpeech.LANG_NOT_SUPPORTED
            ) {
                maybeSuggestHindiData(locale)
                runCatching { activeEngine.setLanguage(Locale.getDefault()) }
            }
        }
        utteranceCounter += 1
        runCatching {
            activeEngine.speak(
                spoken.text,
                TextToSpeech.QUEUE_ADD,
                null,
                "khayaal-tts-$utteranceCounter",
            )
        }.onFailure { if (peek) pending.addFirst(spoken) }
    }

    private fun localeFor(lang: String?): Locale? = when (lang?.lowercase()) {
        "hi", "hi-in", "hindi" -> Locale("hi", "IN")
        "en", "en-in", "english" -> Locale("en", "IN")
        else -> Locale.getDefault()
    }

    private fun maybeSuggestHindiData(locale: Locale) {
        if (hindiFallbackToastShown) return
        if (locale.language == "hi") {
            hindiFallbackToastShown = true
            runCatching {
                Toast.makeText(
                    context,
                    R.string.tts_hindi_data_missing,
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
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
