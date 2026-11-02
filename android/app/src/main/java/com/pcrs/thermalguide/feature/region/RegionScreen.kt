package com.pcrs.thermalguide.feature.region

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pcrs.thermalguide.core.ui.WeatherArt
import com.pcrs.thermalguide.core.ui.WeatherGlyph
import com.pcrs.thermalguide.core.weather.WeatherProblem
import com.pcrs.thermalguide.core.weather.WeatherViewModel
import com.pcrs.thermalguide.core.personal.RegionPurpose

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RegionScreen(model: WeatherViewModel, modifier: Modifier = Modifier) {
    val keyboard = LocalSoftwareKeyboardController.current
    Column(modifier.fillMaxSize().imePadding().padding(horizontal = 22.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (model.selectedRegion != null) TextButton(onClick = model::closePicker, enabled = !model.savingRegion) { Text("취소") }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(when (model.pickerPurpose) { RegionPurpose.HOME -> "어느 지역의\n날씨를 볼까요?"; RegionPurpose.COMMUTE_HOME -> "집 지역"; RegionPurpose.COMMUTE_WORK -> "직장·학교 지역" }, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Medium)
                Text(if (model.pickerPurpose == RegionPurpose.HOME) "지역 하나만 고르면 시작할 수 있어요" else "선택 후 출퇴근 설정 화면으로 돌아가요", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            WeatherGlyph(WeatherArt.SUN_CLOUD, size = 70.dp)
        }
        OutlinedTextField(
            value = model.query, onValueChange = model::updateQuery, label = { Text("지역 검색") },
            placeholder = { Text("시·군·구·동 이름") }, leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
            singleLine = true, enabled = !model.savingRegion, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
        )
        if (model.query.isBlank()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("서울", "부산", "제주").forEach { name ->
                    FilterChip(selected = false, onClick = { model.updateQuery(name) }, label = { Text(name) })
                }
            }
        }
        if (model.storageProblem) {
            Text("저장한 지역을 읽지 못했어요.", color = MaterialTheme.colorScheme.error)
            TextButton(onClick = model::readSettings) { Text("다시 읽기") }
        }
        if (model.searchLoading) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Text("지역 찾는 중")
        }
        model.searchProblem?.let { error ->
            Text(if (error == WeatherProblem.STORAGE) "지역을 저장하지 못했어요. 다시 시도해 주세요." else "지역을 불러오지 못했어요.", color = MaterialTheme.colorScheme.error)
            if (error != WeatherProblem.STORAGE) TextButton(onClick = { model.updateQuery(model.query) }) { Text("다시 시도") }
        }
        if (model.query.trim().length >= 2 && !model.searchLoading && model.searchProblem == null && model.searchResults.isEmpty()) {
            Text("검색 결과가 없어요. 지역 이름을 확인해 주세요.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(model.searchResults, key = { it.id }) { region ->
                val selected = model.pendingRegion?.id == region.id
                Surface(color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(18.dp)) {
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = !model.savingRegion, role = Role.RadioButton) { keyboard?.hide(); model.chooseRegion(region) }.padding(18.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(region.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        if (selected) Icon(Icons.Outlined.Check, contentDescription = "선택됨", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        Text("상세 주소 없이 지역 단위로 저장해요", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(
            onClick = model::confirmRegion, enabled = model.pendingRegion != null && !model.savingRegion && !model.storageProblem,
            modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
        ) { Text(if (model.pickerPurpose != RegionPurpose.HOME) "이 지역 선택" else if (model.savingRegion) "저장 중" else if (model.selectedRegion == null) "이 지역으로 시작" else "이 지역으로 변경", Modifier.padding(vertical = 8.dp)) }
    }
}
