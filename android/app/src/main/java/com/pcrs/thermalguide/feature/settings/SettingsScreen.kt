package com.pcrs.thermalguide.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.BuildConfig
import com.pcrs.thermalguide.core.ui.WeatherCard
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import com.pcrs.thermalguide.core.personal.PersonalEditor
import com.pcrs.thermalguide.core.ui.*

@Composable
fun SettingsScreen(model: WeatherViewModel, modifier: Modifier = Modifier) {
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("설정", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Medium) }
        item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text("기준 지역", style = MaterialTheme.typography.titleMedium)
                Text(model.selectedRegion?.name.orEmpty())
                TextButton(onClick = model::openPicker) { Text("지역 변경") }
            }
        }
        item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text("나의 출퇴근", style = MaterialTheme.typography.titleMedium)
                model.profile.commute?.let { commute ->
                    Text("${commute.home.name} → ${commute.work.name}", style = MaterialTheme.typography.bodyMedium)
                    Text("출근 ${commute.outbound} · 귀가 ${if (commute.returnNextDay) "다음 날 " else ""}${commute.returning}", style = MaterialTheme.typography.bodySmall)
                } ?: Text("미설정 · 지역 하나로 계속 사용할 수 있어요", style = MaterialTheme.typography.bodyMedium)
                TextButton(enabled = model.profileLoaded && !model.profileProblem, onClick = { model.openEditor(PersonalEditor.COMMUTE) }) { Text("출퇴근 설정") }
            }
        }
        item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text("체감과 생활", style = MaterialTheme.typography.titleMedium)
                Text("추위 ${sensitivityLabel(model.profile.cold)} · 더위 ${sensitivityLabel(model.profile.heat)}", style = MaterialTheme.typography.bodyMedium)
                TextButton(enabled = model.profileLoaded && !model.profileProblem, onClick = { model.openEditor(PersonalEditor.SENSITIVITY) }) { Text("더위·추위 설정") }
                Text("${walkingLabel(model.profile.walking)} · ${transportLabel(model.profile.transport)}", style = MaterialTheme.typography.bodySmall)
                TextButton(enabled = model.profileLoaded && !model.profileProblem, onClick = { model.openEditor(PersonalEditor.ROUTINE) }) { Text("이동·실내 환경 설정") }
                if (model.profileProblem) {
                    Text("설정을 읽지 못했어요", color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = model::readProfile) { Text("다시 읽기") }
                }
            }
        }
        item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text("날씨 자료", style = MaterialTheme.typography.titleMedium)
                Text("기상청 단기예보·초단기실황")
                Text("공공누리 제1유형 · 출처표시", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("관측은 지역의 대표 지점 자료예요. 예보와 함께 자료 기준 시각을 확인해 주세요.", style = MaterialTheme.typography.bodyMedium)
            }
        }
        item {
            WeatherCard(Modifier.fillMaxWidth()) {
                Text("기본 차림", style = MaterialTheme.typography.titleMedium)
                Text("선택 지역·시각의 예보와 직접 설정한 성향으로 차림을 제안해요. 실제 체감 피드백 학습은 아직 적용하지 않아요.", style = MaterialTheme.typography.bodyMedium)
                Text("기온 구간을 이용한 초기 규칙이며 개인에게 맞는지는 검증이 필요해요. 지원하지 않는 의상은 아바타 대신 의류 구성을 표시해요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { Text("Thermal Guide ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
