<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterApi, type VersionDiff } from '@client/services/character.api';

const props = defineProps<{
  characterId: string;
  fromVersion: number;
  toVersion: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const { t } = useI18n();
const diff = ref<VersionDiff | null>(null);
const loading = ref(false);

watch(() => props.visible, async (val) => {
  if (val && props.fromVersion && props.toVersion) {
    loading.value = true;
    try {
      diff.value = await characterApi.compareVersions(props.characterId, props.fromVersion, props.toVersion);
    } catch {
      diff.value = null;
    } finally {
      loading.value = false;
    }
  }
});

function handleClose() {
  emit('update:visible', false);
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  return JSON.stringify(val, null, 2);
}

function tagType(type: string): 'success' | 'danger' | 'warning' {
  if (type === 'added') return 'success';
  if (type === 'removed') return 'danger';
  return 'warning';
}

function changeLabel(type: string): string {
  if (type === 'added') return t('characterEditor.fieldAdded', 'Added');
  if (type === 'removed') return t('characterEditor.fieldRemoved', 'Removed');
  return t('characterEditor.fieldChanged', 'Changed');
}
</script>
<template>
  <el-dialog
    :model-value="visible"
    :title="t('characterEditor.versionDiff', 'Version Comparison')"
    width="720px"
    @update:model-value="handleClose"
  >
    <el-skeleton v-if="loading" :rows="6" animated />

    <div v-else-if="!diff || diff.changes.length === 0" class="empty-state">
      {{ t('characterEditor.noChanges', 'No changes') }}
    </div>

    <div v-else class="diff-container">
      <div class="diff-header">
        <span>{{ t('characterEditor.version', { version: diff.fromVersion.version }) }}</span>
        <span class="arrow">→</span>
        <span>{{ t('characterEditor.version', { version: diff.toVersion.version }) }}</span>
      </div>

      <div v-for="change in diff.changes" :key="change.field" class="diff-item">
        <div class="diff-item-header">
          <span class="field-name">{{ change.field }}</span>
          <el-tag :type="tagType(change.type)" size="small">
            {{ changeLabel(change.type) }}
          </el-tag>
        </div>
        <div class="diff-values">
          <div v-if="change.type !== 'added'" class="diff-from">
            <pre class="diff-pre">{{ formatValue(change.from) }}</pre>
          </div>
          <div v-if="change.type !== 'removed'" class="diff-to">
            <pre class="diff-pre">{{ formatValue(change.to) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px 0;
}

.diff-container {
  max-height: 60vh;
  overflow-y: auto;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 16px;
  font-size: 14px;
}

.arrow {
  color: var(--text-secondary);
}

.diff-item {
  margin-bottom: 16px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
}

.diff-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
}

.field-name {
  font-weight: 600;
  font-size: 13px;
}

.diff-values {
  display: flex;
  flex-direction: column;
}

.diff-from {
  background: var(--el-color-danger-light-9);
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
}

.diff-to {
  background: var(--el-color-success-light-9);
  padding: 8px 12px;
}

.diff-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  font-family: inherit;
  max-height: 200px;
  overflow-y: auto;
}
</style>
