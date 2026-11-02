package com.pcrs.thermalguide.feature.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.personal.*
import com.pcrs.thermalguide.core.ui.*
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import java.time.DayOfWeek

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PersonalEditorScreen(model: WeatherViewModel, modifier: Modifier = Modifier) {
    val draft = model.profileDraft
    val enabled = !model.savingProfile
    Column(modifier.fillMaxSize().imePadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = model::closeEditor, enabled = enabled) { Text("취소") }
        Text(when (model.editor) { PersonalEditor.COMMUTE -> "출퇴근 장소와 시각"; PersonalEditor.SENSITIVITY -> "나의 더위·추위"; else -> "이동과 실내 환경" }, style = MaterialTheme.typography.headlineSmall)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when (model.editor) {
                PersonalEditor.COMMUTE -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("출퇴근 추천 사용", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        Switch(checked = draft.enabled, enabled = enabled, onCheckedChange = { model.updateDraft(draft.copy(enabled = it)) })
                    }
                    Text(if (draft.enabled) "시각은 이동을 시작하는 때예요." else "저장하면 출퇴근 설정을 해제하고 지역 추천으로 돌아가요.", style = MaterialTheme.typography.bodySmall)
                    if (draft.enabled) {
                        WeatherCard(Modifier.fillMaxWidth()) {
                            Text("출근·등교 출발", style = MaterialTheme.typography.titleMedium)
                            TextButton(enabled = enabled, onClick = { model.openCommutePicker(true) }) { Text(draft.home?.name ?: "집 지역 선택") }
                            TimeField("출발 시각", draft.outbound, "08:30", enabled) { model.updateDraft(draft.copy(outbound = it)) }
                        }
                        WeatherCard(Modifier.fillMaxWidth()) {
                            Text("퇴근·귀가 출발", style = MaterialTheme.typography.titleMedium)
                            TextButton(enabled = enabled, onClick = { model.openCommutePicker(false) }) { Text(draft.work?.name ?: "직장·학교 지역 선택") }
                            TimeField("귀가 출발 시각", draft.returning, "18:00", enabled) { model.updateDraft(draft.copy(returning = it)) }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(selected = !draft.returnNextDay, enabled = enabled, onClick = { model.updateDraft(draft.copy(returnNextDay = false)) }, label = { Text("당일") })
                                FilterChip(selected = draft.returnNextDay, enabled = enabled, onClick = { model.updateDraft(draft.copy(returnNextDay = true)) }, label = { Text("다음 날") })
                            }
                        }
                        WeatherCard(Modifier.fillMaxWidth()) {
                            Text("이용 요일 · 선택", style = MaterialTheme.typography.titleMedium)
                            Text(if (draft.weekdays == null) "미설정 · 모든 날을 후보로 다음 일정을 보여줘요" else draft.weekdays.sortedBy { it.value }.joinToString(" · ", transform = ::dayLabel), style = MaterialTheme.typography.bodySmall)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                DayOfWeek.entries.forEach { day ->
                                    FilterChip(selected = day in draft.weekdays.orEmpty(), enabled = enabled, onClick = {
                                        val days = draft.weekdays.orEmpty().toMutableSet()
                                        if (!days.add(day)) days.remove(day)
                                        model.updateDraft(draft.copy(weekdays = days.takeIf { it.isNotEmpty() }))
                                    }, label = { Text(dayLabel(day)) })
                                }
                            }
                            TextButton(enabled = enabled, onClick = { model.updateDraft(draft.copy(weekdays = null)) }) { Text("요일 미설정으로") }
                        }
                    }
                }
                PersonalEditor.SENSITIVITY -> {
                    Text("더위와 추위는 따로 설정해요. 둘 다 많이 탈 수도 있어요.", style = MaterialTheme.typography.bodyMedium)
                    ChoiceCard("추위", draft.cold, Sensitivity.entries, ::sensitivityLabel, enabled) { model.updateDraft(draft.copy(cold = it)) }
                    ChoiceCard("더위", draft.heat, Sensitivity.entries, ::sensitivityLabel, enabled) { model.updateDraft(draft.copy(heat = it)) }
                    Text("직접 고른 성향으로 옷의 보온·탈착을 조절해요. 실제 체감 피드백을 학습한 결과는 아니에요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PersonalEditor.ROUTINE -> {
                    Text("평소 패턴을 한 번 설정해 두세요. 모르는 항목은 비워도 돼요.", style = MaterialTheme.typography.bodyMedium)
                    ChoiceCard("대중교통 전후를 포함한 도보", draft.walking, Walking.entries, ::walkingLabel, enabled) { model.updateDraft(draft.copy(walking = it)) }
                    ChoiceCard("주 이동 수단", draft.transport, Transport.entries, ::transportLabel, enabled) { model.updateDraft(draft.copy(transport = it)) }
                    ChoiceCard("주로 머무는 실내", draft.indoor, Indoor.entries, ::indoorLabel, enabled) { model.updateDraft(draft.copy(indoor = it)) }
                }
                null -> Unit
            }
        }
        model.draftProblem?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        Button(onClick = model::saveProfile, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(if (model.savingProfile) "저장 중" else "설정 저장", Modifier.padding(vertical = 8.dp)) }
    }
}

@Composable private fun TimeField(label: String, value: String, placeholder: String, enabled: Boolean, change: (String) -> Unit) {
    OutlinedTextField(value, { change(it.filter { c -> c.isDigit() || c == ':' }.take(5)) }, label = { Text(label) },
        placeholder = { Text(placeholder) }, singleLine = true, enabled = enabled, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii), supportingText = { Text("HH:mm · 24시간") })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun <T> ChoiceCard(title: String, selected: T?, values: List<T>, label: (T?) -> String, enabled: Boolean, choose: (T?) -> Unit) {
    WeatherCard(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            values.forEach { value -> FilterChip(selected == value, { choose(value) }, enabled = enabled, label = { Text(label(value)) }) }
        }
        TextButton(onClick = { choose(null) }, enabled = enabled) { Text(if (selected == null) "미설정" else "미설정으로 되돌리기") }
    }
}
