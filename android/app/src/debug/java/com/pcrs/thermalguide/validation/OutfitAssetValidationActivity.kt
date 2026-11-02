package com.pcrs.thermalguide.validation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.recommendation.*
import com.pcrs.thermalguide.core.ui.avatarDrawable

/** Deterministic image checks only. No weather fixture is reachable from the product UI. */
class OutfitAssetValidationActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val requested = intent.getIntExtra("index", 0).coerceIn(0, validationOutfits.lastIndex)
        val dark = intent.getBooleanExtra("dark", false)
        val height = intent.getIntExtra("height", 254).coerceIn(96, 320)
        setContent { ValidationScreen(requested, dark, height) }
    }
}

private val validationOutfits = listOf(
    "얇은 긴팔·얇은 바지" to Outfit(Top.THIN_LONG, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
    "반팔·얇은 바지" to Outfit(Top.SHORT_TEE, Bottom.LIGHT_LONG, Outer.NONE, OuterState.NONE),
    "재킷 챙기기" to Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.CARRIED),
    "재킷 입기" to Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.LIGHT_JACKET, OuterState.WORN),
    "가디건 입기" to Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.WORN),
    "니트·중간 재킷" to Outfit(Top.MEDIUM_KNIT, Bottom.REGULAR_LONG, Outer.MID_JACKET, OuterState.WORN),
    "니트·보온 코트" to Outfit(Top.MEDIUM_KNIT, Bottom.WARM_LONG, Outer.COAT, OuterState.WORN),
    "내의·니트·패딩" to Outfit(Top.THERMAL_AND_KNIT, Bottom.WARM_LONG, Outer.PADDED_COAT, OuterState.WORN),
    "가디건 챙기기" to Outfit(Top.THIN_LONG, Bottom.REGULAR_LONG, Outer.CARDIGAN, OuterState.CARRIED),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun ValidationScreen(initialIndex: Int, initialDark: Boolean, initialHeight: Int) {
    var index by rememberSaveable { mutableIntStateOf(initialIndex) }
    var dark by rememberSaveable { mutableStateOf(initialDark) }
    var height by rememberSaveable { mutableIntStateOf(initialHeight) }
    val palette = if (dark) darkColorScheme() else lightColorScheme()
    MaterialTheme(colorScheme = palette) {
        Surface(Modifier.fillMaxSize(), color = palette.background) {
            Column(Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("개발용 착장 검증", style = MaterialTheme.typography.titleLarge)
                Text("날씨 추천 아님 · 의류와 이미지 매핑 확인", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    validationOutfits.forEachIndexed { candidate, item ->
                        FilterChip(selected = index == candidate, onClick = { index = candidate }, label = { Text(item.first) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = dark, onClick = { dark = !dark }, label = { Text(if (dark) "어두운 배경" else "밝은 배경") })
                    FilterChip(selected = height == 96, onClick = { height = if (height == 96) 254 else 96 }, label = { Text("96 / 254dp") })
                }
                Text(validationOutfits[index].first, style = MaterialTheme.typography.titleMedium)
                Box(Modifier.fillMaxWidth().background(palette.surfaceVariant, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) {
                    val asset = OutfitAssets.match(validationOutfits[index].second)
                    if (asset != null) Image(painterResource(avatarDrawable(asset)), validationOutfits[index].first, Modifier.fillMaxWidth().height(height.dp), contentScale = ContentScale.Fit)
                    else Text("매핑 없음")
                }
                Text("${OutfitAssets.match(validationOutfits[index].second)} · ${height}dp", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
