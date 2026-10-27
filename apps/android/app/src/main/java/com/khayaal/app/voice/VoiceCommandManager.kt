package com.khayaal.app.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.khayaal.app.data.datastore.PairingStore

/**
 * Opt-in plumbing for "Hey Khayaal". Same pattern as the night watch: the
 * toggle on Home is the only way the service ever starts, default OFF, and
 * the service reports its own activity back through DataStore.
 */
object VoiceCommandManager {

    const val NOTIFICATION_ID = 3201
    const val CHANNEL_VOICE = "khayaal-voice"

    fun hasRecordPermission(context: Context): Boolean =
        androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.RECORD_AUDIO,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    fun isAvailable(context: Context): Boolean =
        SpeechRecognizer.isRecognitionAvailable(context)

    suspend fun start(context: Context, store: PairingStore) {
        if (!hasRecordPermission(context) || !isAvailable(context)) return
        store.setVoiceCommandsEnabled(true)
        val intent = Intent(context, VoiceCommandService::class.java)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }
    }

    suspend fun stop(context: Context, store: PairingStore) {
        store.setVoiceCommandsEnabled(false)
        context.stopService(Intent(context, VoiceCommandService::class.java))
    }
}
