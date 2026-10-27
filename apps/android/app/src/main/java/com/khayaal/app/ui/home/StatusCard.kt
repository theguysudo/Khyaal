package com.khayaal.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.khayaal.app.R
import com.khayaal.app.data.api.StateDto
import com.khayaal.app.ui.theme.CardBorder
import com.khayaal.app.ui.theme.Sage
import com.khayaal.app.ui.theme.Tier1
import com.khayaal.app.ui.theme.Tier2
import com.khayaal.app.ui.theme.Tier3
import com.khayaal.app.ui.theme.tierColor

/**
 * The calm card at the heart of the daily view: the backend's own status
 * string, a tier-colored dot, the score ring, and the last check-in time.
 */
@Composable
fun StatusCard(
    state: StateDto?,
    offline: Boolean,
    modifier: Modifier = Modifier,
) {
    val tier = state?.tier ?: 0
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
            .border(1.dp, CardBorder, RoundedCornerShape(28.dp))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(tierColor(tier), CircleShape),
            )
            Spacer(Modifier.size(10.dp))
            Text(
                text = state?.status?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.home_all_well),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.size(12.dp))
            ScoreRing(score = state?.scoreValue, tier = tier)
        }

        val ackTs = state?.ack?.ts
        Text(
            text = if (ackTs != null) {
                stringResource(R.string.home_last_checkin, HomeTime.formatClock(ackTs))
            } else {
                stringResource(R.string.home_no_checkin_yet)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )

        if (state?.learning == true) {
            Text(
                text = stringResource(R.string.home_learning),
                style = MaterialTheme.typography.bodySmall,
                color = Sage,
            )
        }
        if (offline) {
            Text(
                text = stringResource(R.string.home_offline),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
            )
        }
    }
}

/**
 * The tier-appropriate gentle nudge. Tier 1 is a soft hello, tier 2 asks the
 * question outright, tier 3 admits worry and points to the child by name.
 */
@Composable
fun NudgeCard(
    tier: Int,
    childName: String,
    modifier: Modifier = Modifier,
) {
    val (bg, fg) = when (tier) {
        3 -> Tier3.copy(alpha = 0.10f) to Tier3
        2 -> Tier2.copy(alpha = 0.12f) to Tier2
        else -> Tier1.copy(alpha = 0.12f) to Tier1
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(bg, RoundedCornerShape(24.dp))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = stringResource(
                when (tier) {
                    3 -> R.string.nudge_tier3_title
                    2 -> R.string.nudge_tier2_title
                    else -> R.string.nudge_tier1_title
                },
            ),
            style = MaterialTheme.typography.headlineSmall,
            color = fg,
        )
        Text(
            text = if (tier == 3) {
                stringResource(R.string.nudge_tier3_body, childName.ifBlank { "the family" })
            } else {
                stringResource(
                    when (tier) {
                        2 -> R.string.nudge_tier2_body
                        else -> R.string.nudge_tier1_body
                    },
                )
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
        )
    }
}
