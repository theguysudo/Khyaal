package com.khayaal.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khayaal.app.R
import com.khayaal.app.ui.theme.CardBorder
import com.khayaal.app.ui.theme.Clay
import com.khayaal.app.ui.theme.Ink

/**
 * A large, warm 6-digit code field: one invisible text field for input,
 * six visible boxes for dignity. Tapping anywhere focuses the field; the
 * soft keyboard's digits fill the boxes left to right.
 */
@Composable
fun CodeInput(
    code: String,
    onCodeChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val codeDescription = androidx.compose.ui.res.stringResource(
        com.khayaal.app.R.string.a11y_code_input,
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        BasicTextField(
            value = code,
            onValueChange = { raw ->
                val digits = raw.filter { it.isDigit() }.take(DIGIT_COUNT)
                onCodeChange(digits)
                if (digits.length == DIGIT_COUNT) focusManager.clearFocus(force = true)
            },
            modifier = Modifier
                .size(width = 1.dp, height = 1.dp)
                .focusRequester(focusRequester),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            cursorBrush = SolidColor(Clay),
            decorationBox = { innerTextField ->
                Box(Modifier.size(1.dp)) { innerTextField() }
            },
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Six digit pairing code" }
                .height(72.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { focusRequester.requestFocus() },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(DIGIT_COUNT) { index ->
                DigitBox(
                    digit = code.getOrNull(index)?.toString().orEmpty(),
                    filled = index < code.length,
                )
            }
        }
    }
}

@Composable
private fun DigitBox(digit: String, filled: Boolean) {
    Box(
        modifier = Modifier
            .width(52.dp)
            .height(64.dp)
            .background(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(16.dp),
            )
            .border(
                width = if (filled) 2.dp else 1.dp,
                color = if (filled) Clay else CardBorder,
                shape = RoundedCornerShape(16.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = digit,
            fontSize = 28.sp,
            color = Ink,
            textAlign = TextAlign.Center,
        )
    }
}

private const val DIGIT_COUNT = 6
