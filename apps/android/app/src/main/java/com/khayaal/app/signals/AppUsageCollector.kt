package com.khayaal.app.signals

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.app.AppOpsManager
import android.os.Process
import com.khayaal.app.data.datastore.PairingStore
import com.khayaal.app.data.queue.SignalQueue

/**
 * Optional app-open signals: "an app was opened", package name only, never
 * screen content. Requires the user to grant Usage Access in Settings, so
 * this is a polite no-op on most installs. Queried in bulk at flush time —
 * there is no reliable event broadcast for app opens on modern Android.
 */
object AppUsageCollector {

    private const val DEFAULT_FIRST_WINDOW_MS = 15 * 60 * 1000L

    suspend fun drainInto(context: Context, store: PairingStore, queue: SignalQueue) {
        if (!hasUsageAccess(context)) return
        val now = System.currentTimeMillis()
        val since = store.currentLastAppUsagePollTs()
            .takeIf { it > 0 }
            ?: (now - DEFAULT_FIRST_WINDOW_MS)
        store.setLastAppUsagePollTs(now)

        val opens = queryAppOpens(context, since, now)
        if (opens.isNotEmpty()) queue.enqueueAll(opens)
    }

    /** One event per app resume, consecutive duplicates collapsed. */
    private fun queryAppOpens(context: Context, sinceMs: Long, untilMs: Long): List<SignalEvent> {
        val usageManager = context.getSystemService(UsageStatsManager::class.java) ?: return emptyList()
        val events = usageManager.queryEvents(sinceMs, untilMs)
        val opens = mutableListOf<SignalEvent>()
        val query = UsageEvents.Event()
        var lastPackage: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(query)
            if (!isAppOpen(query)) continue
            val pkg = query.packageName ?: continue
            if (pkg == context.packageName) continue
            if (pkg == lastPackage) continue
            lastPackage = pkg
            opens += SignalEvent.appUsage(pkg, query.timeStamp)
        }
        return opens
    }

    @Suppress("DEPRECATION") // MOVE_TO_FOREGROUND is the API < 29 variant; same value as ACTIVITY_RESUMED.
    private fun isAppOpen(event: UsageEvents.Event): Boolean =
        event.eventType == UsageEvents.Event.ACTIVITY_RESUMED ||
            event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND

    private fun hasUsageAccess(context: Context): Boolean {
        val appOps = context.getSystemService(AppOpsManager::class.java) ?: return false
        val mode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}
