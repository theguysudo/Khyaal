package com.khayaal.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.app.R
import com.khayaal.app.data.api.CallPlanDto
import com.khayaal.app.data.api.CareCircleMemberDto
import com.khayaal.app.data.datastore.CallChainState
import com.khayaal.app.ui.theme.Ink
import com.khayaal.app.ui.theme.Paper
import com.khayaal.app.ui.theme.Tier3

/**
 * The tier-3 alarm: a full-screen, warm-red moment that leaves no doubt but
 * never shouts. The big button opens the dialer (or, with CALL_PHONE granted,
 * the armed call chain dials on its own — this screen's cancel button stops
 * that). The escalation order from the household's callPlan and care circle
 * is spelled out in one calm column.
 */
@Composable
fun AlarmOverlay(
    tier: Int,
    callPlan: CallPlanDto?,
    careCircle: List<CareCircleMemberDto>,
    callChain: CallChainState?,
    justCheckedIn: Boolean,
    onCheckIn: () -> Unit,
    onCallFamily: () -> Unit,
    onCancelCallChain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = tier >= 3,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        val okDescription = stringResource(R.string.a11y_im_ok_button)
        val callFamilyLabel = stringResource(R.string.alarm_call_family)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Tier3.copy(alpha = 0.08f)),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.padding(top = 32.dp))
                Text(
                    text = stringResource(R.string.alarm_title),
                    style = MaterialTheme.typography.displaySmall,
                    color = Tier3,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                )
                Text(
                    text = stringResource(R.string.alarm_body),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink.copy(alpha = 0.75f),
                )

                // The armed call chain: what happens next, and the way out.
                callChain?.takeIf { !it.cancelled && it.nextIndex < it.entries.size }?.let { chain ->
                    val next = chain.entries[chain.nextIndex]
                    val minutes = if (chain.nextIndex == 0) chain.callElderAfterMin else chain.alertCircleAfterMin
                    val callerName = next.name.ifBlank { callFamilyLabel }
                    Text(
                        text = stringResource(R.string.call_chain_scheduled, callerName, minutes),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Tier3,
                    )
                    TextButton(onClick = onCancelCallChain) {
                        Text(
                            text = stringResource(R.string.call_chain_stop),
                            color = Tier3,
                        )
                    }
                }

                val callDescription = stringResource(R.string.qa_call_family_desc)
                Button(
                    onClick = onCallFamily,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 84.dp)
                        .semantics { contentDescription = callDescription },
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Tier3),
                ) {
                    Text(
                        text = stringResource(R.string.alarm_call_family),
                        fontSize = 24.sp,
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                Button(
                    onClick = onCheckIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 84.dp)
                        .semantics { contentDescription = okDescription },
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Paper,
                        contentColor = Ink,
                    ),
                ) {
                    Text(
                        text = if (justCheckedIn) {
                            stringResource(R.string.home_im_ok_done)
                        } else {
                            stringResource(R.string.alarm_im_ok)
                        },
                        fontSize = 24.sp,
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                EscalationOrder(callPlan, careCircle)
                Spacer(Modifier.padding(bottom = 24.dp))
            }
        }
    }
}

@Composable
private fun EscalationOrder(
    callPlan: CallPlanDto?,
    careCircle: List<CareCircleMemberDto>,
) {
    val appLabel = stringResource(R.string.app_name)
    val callLine = callPlan?.callElderAfterMin?.takeIf { it > 0 }
        ?.let { stringResource(R.string.alarm_escalation_call, appLabel, it) }
    val circleLine = callPlan?.alertCircleAfterMin?.takeIf { it > 0 }
        ?.let { stringResource(R.string.alarm_escalation_circle, it) }
    val lines = listOfNotNull(callLine, circleLine)
    val circleNames = careCircle
        .map { it.name }
        .filter { it.isNotBlank() }

    if (lines.isEmpty() && circleNames.isEmpty()) return

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(24.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = stringResource(R.string.alarm_escalation_title),
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )
        lines.forEach { line ->
            Text(
                text = line,
                style = MaterialTheme.typography.bodyMedium,
                color = Ink.copy(alpha = 0.7f),
            )
        }
        if (circleNames.isNotEmpty()) {
            Text(
                text = stringResource(R.string.alarm_circle_with, circleNames.joinToString(", ")),
                style = MaterialTheme.typography.bodyMedium,
                color = Ink.copy(alpha = 0.7f),
            )
        }
    }
}
