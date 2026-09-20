<template>
  <el-drawer
    v-model="visible"
    :title="t('characterTuner.title')"
    size="450px"
    direction="rtl"
  >
    <div class="character-tuner">
      <!-- Quick Presets -->
      <div class="section">
        <h3>{{ t('characterTuner.quickPresets') }}</h3>
        <el-select
          v-model="selectedPresetId"
          :placeholder="t('characterTuner.selectPreset')"
          clearable
          @change="applyPreset"
          style="width: 100%"
        >
          <el-option
            v-for="preset in presets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          >
            <div class="preset-option">
              <span>{{ preset.name }}</span>
              <el-tag v-if="preset.isGlobal" size="small" type="info">
                {{ t('characterTuner.global') }}
              </el-tag>
            </div>
          </el-option>
        </el-select>
      </div>

      <!-- Parameter Adjustments -->
      <div class="section">
        <h3>{{ t('characterTuner.parameters') }}</h3>

        <!-- Personality -->
        <el-form-item :label="t('characterTuner.personality')">
          <el-input
            v-model="overrides.personality"
            type="textarea"
            :rows="3"
            :placeholder="t('characterTuner.personalityPlaceholder')"
          />
        </el-form-item>

        <!-- Scenario -->
        <el-form-item :label="t('characterTuner.scenario')">
          <el-input
            v-model="overrides.scenario"
            type="textarea"
            :rows="3"
            :placeholder="t('characterTuner.scenarioPlaceholder')"
          />
        </el-form-item>

        <!-- System Prompt -->
        <el-form-item :label="t('characterTuner.systemPrompt')">
          <el-input
            v-model="overrides.system_prompt"
            type="textarea"
            :rows="4"
            :placeholder="t('characterTuner.systemPromptPlaceholder')"
          />
        </el-form-item>

        <!-- Post History Instructions -->
        <el-form-item :label="t('characterTuner.postHistoryInstructions')">
          <el-input
            v-model="overrides.post_history_instructions"
            type="textarea"
            :rows="3"
            :placeholder="t('characterTuner.postHistoryPlaceholder')"
          />
        </el-form-item>

        <!-- Response Length Slider -->
        <el-form-item :label="t('characterTuner.responseLength')">
          <el-slider
            v-model="responseLength"
            :min="1"
            :max="5"
            :marks="lengthMarks"
            show-stops
            @change="updateResponseStyle"
          />
        </el-form-item>

        <!-- Emotional Intensity Slider -->
        <el-form-item :label="t('characterTuner.emotionalIntensity')">
          <el-slider
            v-model="emotionalIntensity"
            :min="1"
            :max="5"
            :marks="intensityMarks"
            show-stops
            @change="updateEmotionalStyle"
          />
        </el-form-item>
      </div>

      <!-- Note -->
      <div class="section">
        <el-form-item :label="t('characterTuner.note')">
          <el-input
            v-model="note"
            type="textarea"
            :rows="2"
            :placeholder="t('characterTuner.notePlaceholder')"
          />
        </el-form-item>
      </div>

      <!-- Override Status -->
      <div class="section">
        <el-alert
          v-if="currentOverride"
          :title="overrideEnabled ? t('characterTuner.overrideActive') : t('characterTuner.overrideInactive')"
          :type="overrideEnabled ? 'success' : 'info'"
          :closable="false"
        >
          <el-switch
            v-model="overrideEnabled"
            :active-text="t('characterTuner.enabled')"
            :inactive-text="t('characterTuner.disabled')"
            @change="toggleOverride"
          />
        </el-alert>
      </div>
    </div>

    <!-- Footer Actions -->
    <template #footer>
      <div class="drawer-footer">
        <el-button @click="resetToDefault">
          {{ t('characterTuner.reset') }}
        </el-button>
        <el-button @click="saveAsPreset">
          {{ t('characterTuner.saveAsPreset') }}
        </el-button>
        <el-button
          type="primary"
          :loading="applying"
          @click="applyOverrides"
        >
          {{ t('characterTuner.apply') }}
        </el-button>
      </div>
    </template>
  </el-drawer>

  <!-- Save Preset Dialog -->
  <el-dialog
    v-model="showPresetDialog"
    :title="t('characterTuner.savePresetTitle')"
    width="500px"
  >
    <el-form :model="presetForm" label-width="120px">
      <el-form-item :label="t('characterTuner.presetName')">
        <el-input v-model="presetForm.name" :placeholder="t('characterTuner.presetNamePlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('characterTuner.presetDescription')">
        <el-input
          v-model="presetForm.description"
          type="textarea"
          :rows="3"
          :placeholder="t('characterTuner.presetDescriptionPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('characterTuner.presetScope')">
        <el-radio-group v-model="presetForm.isGlobal">
          <el-radio :label="true">{{ t('characterTuner.globalPreset') }}</el-radio>
          <el-radio :label="false">{{ t('characterTuner.characterPreset') }}</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showPresetDialog = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="savingPreset" @click="confirmSavePreset">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { chatApi } from '@/client/services/chat.api';
import { api } from '@/client/services/api';

const { t } = useI18n();

interface Props {
  modelValue: boolean;
  chatId: string;
  characterId?: string;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'applied'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// State
const presets = ref<any[]>([]);
const selectedPresetId = ref<string | null>(null);
const currentOverride = ref<any>(null);
const overrideEnabled = ref(true);
const applying = ref(false);
const showPresetDialog = ref(false);
const savingPreset = ref(false);

// Override parameters
const overrides = ref({
  personality: '',
  scenario: '',
  system_prompt: '',
  post_history_instructions: '',
});

const note = ref('');
const responseLength = ref(3);
const emotionalIntensity = ref(3);

// Slider marks
const lengthMarks = computed(() => ({
  1: t('characterTuner.lengthVeryShort'),
  2: t('characterTuner.lengthShort'),
  3: t('characterTuner.lengthMedium'),
  4: t('characterTuner.lengthLong'),
  5: t('characterTuner.lengthVeryLong'),
}));

const intensityMarks = computed(() => ({
  1: t('characterTuner.intensitySubdued'),
  2: t('characterTuner.intensityMild'),
  3: t('characterTuner.intensityModerate'),
  4: t('characterTuner.intensityRich'),
  5: t('characterTuner.intensityIntense'),
}));

// Preset form
const presetForm = ref({
  name: '',
  description: '',
  isGlobal: true,
});

// Load presets
async function loadPresets() {
  try {
    const response = await api.get('/presets', {
      params: props.characterId ? { characterId: props.characterId } : {},
    });
    presets.value = response.data.data || [];
  } catch (error) {
    console.error('Failed to load presets:', error);
  }
}

// Load current override
async function loadCurrentOverride() {
  try {
    const response = await api.get(`/chats/${props.chatId}/overrides`);
    currentOverride.value = response.data.data;

    if (currentOverride.value) {
      overrideEnabled.value = currentOverride.value.enabled;
      overrides.value = { ...overrides.value, ...currentOverride.value.overrides };
      note.value = currentOverride.value.note || '';
    }
  } catch (error) {
    console.error('Failed to load override:', error);
  }
}

// Apply preset
async function applyPreset(presetId: string | null) {
  if (!presetId) return;

  const preset = presets.value.find(p => p.id === presetId);
  if (!preset) return;

  overrides.value = { ...overrides.value, ...preset.preset };
  ElMessage.success(t('characterTuner.presetApplied', { name: preset.name }));
}

// Update response style based on slider
function updateResponseStyle() {
  const styles: Record<number, string> = {
    1: t('characterTuner.styleVeryShort'),
    2: t('characterTuner.styleShort'),
    3: t('characterTuner.styleMedium'),
    4: t('characterTuner.styleLong'),
    5: t('characterTuner.styleVeryLong'),
  };

  const instruction = styles[responseLength.value];
  if (instruction) {
    overrides.value.post_history_instructions = instruction;
  }
}

// Update emotional style based on slider
function updateEmotionalStyle() {
  const styles: Record<number, string> = {
    1: t('characterTuner.emotionSubdued'),
    2: t('characterTuner.emotionMild'),
    3: t('characterTuner.emotionModerate'),
    4: t('characterTuner.emotionRich'),
    5: t('characterTuner.emotionIntense'),
  };

  const instruction = styles[emotionalIntensity.value];
  if (instruction) {
    const current = overrides.value.post_history_instructions || '';
    overrides.value.post_history_instructions = current + (current ? ' ' : '') + instruction;
  }
}

// Apply overrides
async function applyOverrides() {
  applying.value = true;
  try {
    await api.put(`/chats/${props.chatId}/overrides`, {
      overrides: overrides.value,
      enabled: true,
      note: note.value,
    });

    ElMessage.success(t('characterTuner.applied'));
    emit('applied');
    await loadCurrentOverride();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || t('characterTuner.applyFailed'));
  } finally {
    applying.value = false;
  }
}

// Toggle override
async function toggleOverride(enabled: boolean) {
  try {
    await api.patch(`/chats/${props.chatId}/overrides/toggle`, { enabled });
    ElMessage.success(enabled ? t('characterTuner.enabled') : t('characterTuner.disabled'));
    emit('applied');
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || t('characterTuner.toggleFailed'));
    overrideEnabled.value = !enabled; // Revert on error
  }
}

// Reset to default
function resetToDefault() {
  overrides.value = {
    personality: '',
    scenario: '',
    system_prompt: '',
    post_history_instructions: '',
  };
  note.value = '';
  responseLength.value = 3;
  emotionalIntensity.value = 3;
  selectedPresetId.value = null;
  ElMessage.info(t('characterTuner.reset'));
}

// Save as preset
function saveAsPreset() {
  presetForm.value = {
    name: '',
    description: '',
    isGlobal: true,
  };
  showPresetDialog.value = true;
}

// Confirm save preset
async function confirmSavePreset() {
  if (!presetForm.value.name) {
    ElMessage.warning(t('characterTuner.presetNameRequired'));
    return;
  }

  savingPreset.value = true;
  try {
    await api.post('/presets', {
      name: presetForm.value.name,
      description: presetForm.value.description,
      preset: overrides.value,
      isGlobal: presetForm.value.isGlobal,
      characterId: presetForm.value.isGlobal ? undefined : props.characterId,
    });

    ElMessage.success(t('characterTuner.presetSaved'));
    showPresetDialog.value = false;
    await loadPresets();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || t('characterTuner.presetSaveFailed'));
  } finally {
    savingPreset.value = false;
  }
}

// Watch for drawer open
watch(visible, (isVisible) => {
  if (isVisible) {
    loadPresets();
    loadCurrentOverride();
  }
});

onMounted(() => {
  if (visible.value) {
    loadPresets();
    loadCurrentOverride();
  }
});
</script>

<style scoped>
.character-tuner {
  padding: 0 4px;
}

.section {
  margin-bottom: 24px;
}

.section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.preset-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

:deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
}

:deep(.el-slider__marks-text) {
  font-size: 11px;
}
</style>
