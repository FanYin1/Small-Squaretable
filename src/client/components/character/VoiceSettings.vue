<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTextToSpeech, type VoiceConfig } from '@client/composables/useTextToSpeech';

const props = defineProps<{
  modelValue?: VoiceConfig;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', config: VoiceConfig): void;
}>();

const { t } = useI18n();
const { speak, isSpeaking, stop, isSupported } = useTextToSpeech();

const voices = ref<SpeechSynthesisVoice[]>([]);

const selectedLang = ref(props.modelValue?.lang || '');
const selectedVoiceName = ref(props.modelValue?.voiceName || '');
const rate = ref(props.modelValue?.rate ?? 1);
const pitch = ref(props.modelValue?.pitch ?? 1);

// --- Voice loading (handles async voiceschanged) ---
function loadVoices() {
  voices.value = window.speechSynthesis?.getVoices() ?? [];
}

let onVoicesChanged: (() => void) | null = null;

onMounted(() => {
  loadVoices();
  if (window.speechSynthesis) {
    onVoicesChanged = () => loadVoices();
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
  }
});

onUnmounted(() => {
  if (window.speechSynthesis && onVoicesChanged) {
    window.speechSynthesis.onvoiceschanged = null;
  }
});

// --- Derived lists ---
const availableLanguages = computed(() => {
  const langs = new Set(voices.value.map(v => v.lang));
  return Array.from(langs).sort();
});
const filteredVoices = computed(() => {
  if (!selectedLang.value) return voices.value;
  return voices.value.filter(v => v.lang === selectedLang.value);
});

// --- Emit on change ---
function emitUpdate() {
  emit('update:modelValue', {
    lang: selectedLang.value || undefined,
    voiceName: selectedVoiceName.value || undefined,
    rate: rate.value,
    pitch: pitch.value,
  });
}

watch([selectedLang, selectedVoiceName, rate, pitch], () => emitUpdate());

// Reset voice name when language changes (selected voice may not be in new list)
watch(selectedLang, () => {
  const match = filteredVoices.value.find(v => v.name === selectedVoiceName.value);
  if (!match) {
    selectedVoiceName.value = '';
  }
});

// Sync from parent
watch(() => props.modelValue, (val) => {
  if (val) {
    selectedLang.value = val.lang || '';
    selectedVoiceName.value = val.voiceName || '';
    rate.value = val.rate ?? 1;
    pitch.value = val.pitch ?? 1;
  }
});

function testVoice() {
  if (isSpeaking.value) {
    stop();
    return;
  }
  const sample = t('character.voiceTestSample', 'Hello! This is a test of the character voice settings.');
  speak(sample, {
    lang: selectedLang.value || undefined,
    voiceName: selectedVoiceName.value || undefined,
    rate: rate.value,
    pitch: pitch.value,
  });
}
</script>

<template>
  <div class="voice-settings">
    <div v-if="!isSupported" class="voice-unsupported">
      {{ t('character.voiceUnsupported', 'Speech synthesis is not supported in this browser.') }}
    </div>
    <template v-else>
      <el-form-item :label="t('character.voiceLanguage', 'Language')">
        <el-select
          v-model="selectedLang"
          :placeholder="t('character.voiceLanguagePlaceholder', 'Auto-detect')"
          clearable
          filterable
        >
          <el-option
            v-for="lang in availableLanguages"
            :key="lang"
            :label="lang"
            :value="lang"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('character.voiceName', 'Voice')">
        <el-select
          v-model="selectedVoiceName"
          :placeholder="t('character.voiceNamePlaceholder', 'Default')"
          clearable
          filterable
        >
          <el-option
            v-for="voice in filteredVoices"
            :key="voice.name"
            :label="`${voice.name} (${voice.lang})`"
            :value="voice.name"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="`${t('character.voiceRate', 'Rate')}: ${rate}`">
        <el-slider v-model="rate" :min="0.5" :max="2" :step="0.1" />
      </el-form-item>

      <el-form-item :label="`${t('character.voicePitch', 'Pitch')}: ${pitch}`">
        <el-slider v-model="pitch" :min="0" :max="2" :step="0.1" />
      </el-form-item>

      <el-button :type="isSpeaking ? 'danger' : 'default'" @click="testVoice">
        {{ isSpeaking ? t('character.voiceStop', 'Stop') : t('character.voiceTest', 'Test Voice') }}
      </el-button>
    </template>
  </div>
</template>

<style scoped>
.voice-settings {
  padding: 8px 0;
}

.voice-settings :deep(.el-select) {
  width: 100%;
}

.voice-unsupported {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 12px 0;
}
</style>
