package com.khayaal.app.ui.home

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Small time helpers for the daily view. "Now" prefers the backend's
 * simulated clock (demo time-warp) and falls back to the phone's clock.
 */
object HomeTime {

    private val clockFormat = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())

    /** The greeting bucket for the hour — late night gets its own quiet voice. */
    fun greetingHour(nowMs: Long): Int =
        LocalDateTime.ofInstant(Instant.ofEpochMilli(nowMs), ZoneId.systemDefault()).hour

    fun formatClock(epochMs: Long, fallbackNowMs: Long? = null): String {
        val effective = if (epochMs <= 0) fallbackNowMs ?: System.currentTimeMillis() else epochMs
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(effective), ZoneId.systemDefault())
            .format(clockFormat)
    }

    fun greetingResourceId(hour: Int): Int = when (hour) {
        in 5..11 -> com.khayaal.app.R.string.greeting_morning
        in 12..16 -> com.khayaal.app.R.string.greeting_afternoon
        in 17..21 -> com.khayaal.app.R.string.greeting_evening
        else -> com.khayaal.app.R.string.greeting_night
    }
}
