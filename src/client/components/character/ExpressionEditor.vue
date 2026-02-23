<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  modelValue?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', config: Record<string, string>): void;
}>();

const { t } = useI18n();

const EMOTION_LABELS = [
  'neutral', 'default',
  'excited', 'happy', 'loving', 'calm', 'curious', 'surprised',
  'confused', 'bored', 'sad', 'fearful', 'angry', 'disgusted',
];

const expressions = reactive<Record<string, string>>({});

watch(() => props.modelValue, (val) => {
  Object.keys(expressions).forEach(k => delete expressions[k]);
  if (val) Object.assign(expressions, val);
}, { immediate: true });

watch(expressions, () => {
  const nonEmpty = Object.fromEntries(
    Object.entries(expressions).filter(([, v]) => v)
  );
  emit('update:modelValue', Object.keys(nonEmpty).length > 0 ? nonEmpty : {});
}, { deep: true });

const previewEmotion = ref('neutral');
const previewUrl = computed(() => {
  return expressions[previewEmotion.value]
    || expressions['neutral']
    || expressions['default']
    || null;
});

function handleUpload(label: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      ElMessage.error(t('expressionEditor.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      expressions[label] = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
</script>

<template>
  <div class="expression-editor">
    <!-- Preview -->
    <div v-if="Object.values(expressions).some(v => v)" class="expression-preview-section">
      <div class="preview-header">
        <span>{{ t('expressionEditor.preview') }}</span>
        <el-select v-model="previewEmotion" size="small" style="width: 140px;">
          <el-option
            v-for="label in EMOTION_LABELS"
            :key="label"
            :label="t(`expressionEditor.${label}`, label)"
            :value="label"
          />
        </el-select>
      </div>
      <div class="preview-display">
        <img v-if="previewUrl" :src="previewUrl" :alt="previewEmotion" class="large-preview" />
        <div v-else class="no-preview">{{ t('expressionEditor.noSprite') }}</div>
      </div>
    </div>

    <!-- Grid -->
    <div class="expression-grid">
      <div v-for="label in EMOTION_LABELS" :key="label" class="expression-card">
        <div class="expression-label">{{ t(`expressionEditor.${label}`, label) }}</div>
        <div class="expression-slot" @click="handleUpload(label)">
          <img v-if="expressions[label]" :src="expressions[label]" :alt="label" class="slot-image" />
          <div v-else class="upload-placeholder">
            <span>+</span>
          </div>
        </div>
        <el-button
          v-if="expressions[label]"
          type="danger"
          text
          size="small"
          @click="delete expressions[label]"
        >
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expression-editor { padding: 8px 0; }
.expression-preview-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.large-preview {
  max-height: 200px;
  max-width: 100%;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}
.no-preview {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
}
.expression-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.expression-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.expression-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.expression-slot {
  width: 100px;
  height: 100px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.2s;
}
.expression-slot:hover {
  border-color: var(--el-color-primary);
}
.slot-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.upload-placeholder {
  font-size: 24px;
  color: var(--el-text-color-placeholder);
}
</style>
