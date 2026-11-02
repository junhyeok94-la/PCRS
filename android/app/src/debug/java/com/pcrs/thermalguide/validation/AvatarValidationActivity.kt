package com.pcrs.thermalguide.validation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.R

/** Local image rendering check. This activity and its images are absent from release builds. */
class AvatarValidationActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AvatarValidationScreen { dark ->
                val barStyle = if (dark) {
                    SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = barStyle, navigationBarStyle = barStyle)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AvatarValidationScreen(onBackdropChanged: (Boolean) -> Unit) {
    var wearingJacket by rememberSaveable { mutableStateOf(false) }
    var darkBackground by rememberSaveable { mutableStateOf(false) }
    var largeImage by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(darkBackground) { onBackdropChanged(darkBackground) }
    val palette = if (darkBackground) {
        darkColorScheme(primary = Color(0xFFB9DDF5), background = Color(0xFF152430))
    } else {
        lightColorScheme(primary = Color(0xFF285B80), background = Color(0xFFF1F5F8))
    }
    MaterialTheme(colorScheme = palette) {
        Surface(modifier = Modifier.fillMaxSize(), color = palette.background) {
            Column(
                modifier = Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("아바타 제작 검증", style = MaterialTheme.typography.headlineSmall)
                Text("로컬 이미지 전환 · 실제 날씨/추천 연결 전", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !wearingJacket, onClick = { wearingJacket = false }, label = { Text("겉옷 없음") })
                    FilterChip(selected = wearingJacket, onClick = { wearingJacket = true }, label = { Text("재킷 착용") })
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !darkBackground, onClick = { darkBackground = false }, label = { Text("밝은 배경") })
                    FilterChip(selected = darkBackground, onClick = { darkBackground = true }, label = { Text("어두운 배경") })
                    FilterChip(selected = !largeImage, onClick = { largeImage = false }, label = { Text("240dp") })
                    FilterChip(selected = largeImage, onClick = { largeImage = true }, label = { Text("320dp") })
                }
                Box(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                        .background(if (darkBackground) Color(0xFF203644) else Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(if (wearingJacket) R.drawable.avatar_validation_jacket else R.drawable.avatar_validation_long),
                        contentDescription = if (wearingJacket) "얇은 긴팔과 긴바지에 재킷을 입은 아바타" else "얇은 긴팔과 긴바지, 겉옷은 입지 않은 아바타",
                        modifier = Modifier.fillMaxWidth().height(if (largeImage) 320.dp else 240.dp),
                        contentScale = ContentScale.Fit,
                    )
                }
                Text(if (wearingJacket) "현재: 재킷 착용" else "현재: 겉옷 없음", style = MaterialTheme.typography.titleMedium)
                Text("작은 대안 미리보기 · 96dp", style = MaterialTheme.typography.bodyMedium)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf(R.drawable.avatar_validation_long, R.drawable.avatar_validation_jacket).forEachIndexed { index, resource ->
                        Column(
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(palette.surface).padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Image(painter = painterResource(resource), contentDescription = null, modifier = Modifier.fillMaxWidth().height(96.dp), contentScale = ContentScale.Fit)
                            Text(if (index == 0) "겉옷 없음" else "재킷 착용", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Text("자유로운 의상 조합·외형 꾸미기·실시간 3D를 검증한 화면은 아닙니다.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
