package com.khayaal.app.signals

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import com.khayaal.app.KhayaalApp

/**
 * Receives activity-detection updates from the Activity Recognition API and
 * reduces them to a single movement signal when she is on her feet.
 * In-vehicle and still states are deliberately not signals — Khayaal cares
 * that she moved, not where she went.
 */
class MotionTransitionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val result = ActivityRecognitionResult.extractResult(intent) ?: return
        val container = (context.applicationContext as? KhayaalApp)?.container ?: return
        val activity = result.mostProbableActivity ?: return
        if (activity.type in MOVEMENT_ACTIVITY_TYPES) {
            container.signalRecorder.record(SignalEvent.motion())
        }
    }

    private companion object {
        val MOVEMENT_ACTIVITY_TYPES = setOf(
            DetectedActivity.WALKING,
            DetectedActivity.ON_FOOT,
            DetectedActivity.RUNNING,
            DetectedActivity.ON_BICYCLE,
        )
    }
}
