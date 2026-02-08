<!-- src/client/components/debug/ExtractionLog.vue -->
<template>
  <div class="extraction-log">
    <div class="log-header">
      <span class="log-title">{{ t('debug.extraction.title') }}</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- Message Counter -->
    <div class="counter-section">
      <div class="section-label">{{ t('debug.extraction.messageCounter') }}</div>
      <div class="counter-content">
        <el-progress
          :percentage="(debugState?.messageCounter || 0) * 10"
          :stroke-width="12"
          :format="() => `${debugState?.messageCounter || 0} / ${debugState?.extractionThreshold || 10}`"
        />
        <div class="counter-hint">
          {{ t('debug.extraction.autoExtract', { n: debugState?.extractionThreshold || 10 }) }}
        </div>
      </div>
    </div>

    <!-- Last Extraction -->
    <div class="extraction-section">
      <div class="section-label">{{ t('debug.extraction.recentExtraction') }}</div>

      <div v-if="debugState?.memoryStats?.lastExtractedAt" class="last-extraction">
        <el-tag type="success" size="small">
          {{ formatTime(debugState.memoryStats.lastExtractedAt) }}
        </el-tag>
      </div>
      <div v-else class="no-extraction">
        <el-tag type="info" size="small">{{ t('debug.extraction.noRecords') }}</el-tag>
      </div>
    </div>

    <!-- Memory Stats -->
    <div class="stats-section">
      <div class="section-label">{{ t('debug.extraction.memoryStats') }}</div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{{ debugState?.memoryStats?.total || 0 }}</span>
          <span class="stat-label">{{ t('debug.extraction.total') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value fact">{{ debugState?.memoryStats?.byType?.fact || 0 }}</span>
          <span class="stat-label">{{ t('debug.extraction.fact') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value preference">{{ debugState?.memoryStats?.byType?.preference || 0 }}</span>
          <span class="stat-label">{{ t('debug.extraction.preference') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value relationship">{{ debugState?.memoryStats?.byType?.relationship || 0 }}</span>
          <span class="stat-label">{{ t('debug.extraction.relationship') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value event">{{ debugState?.memoryStats?.byType?.event || 0 }}</span>
          <span class="stat-label">{{ t('debug.extraction.event') }}</span>
        </div>
      </div>
    </div>

    <!-- Manual Extraction -->
    <div class="action-section">
      <el-button
        type="primary"
        size="small"
        @click="triggerExtraction"
        :loading="extracting"
        :disabled="!props.chatId"
      >
        {{ t('debug.extraction.manualExtract') }}
      </el-button>
    </div>

    <!-- Extraction History -->
    <div class="history-section">
      <div class="section-label">{{ t('debug.extraction.history') }}</div>
      <div v-if="extractionHistory.length === 0" class="no-history">
        <el-empty :description="t('debug.extraction.noHistory')" :image-size="40" />
      </div>
      <div v-else class="history-list">
        <div
          v-for="(item, index) in extractionHistory"
          :key="index"
          class="history-item"
        >
          <div class="history-header">
            <el-tag size="small" type="success">{{ item.extracted.length }}</el-tag>
            <span class="history-time">{{ formatTime(item.timestamp) }}</span>
          </div>
          <div class="history-memories">
            <div
              v-for="(mem, mIndex) in item.extracted"
              :key="mIndex"
              class="memory-item"
            >
              <el-tag :type="getTypeTagType(mem.type)" size="small">{{ mem.type }}</el-tag>
              <span class="memory-content">{{ mem.content }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { createLogger } from '@client/utils/logger';
import { useDateTime } from '@client/composables';

const logger = createLogger('ExtractionLog');
const { t } = useI18n();
const { formatTime } = useDateTime();

interface DebugState {
  messageCounter: number;
  extractionThreshold: number;
  memoryStats: {
    total: number;
    byType: Record<string, number>;
    lastExtractedAt: string | null;
  };
}

interface ExtractionRecord {
  extracted: Array<{ type: string; content: string; importance: number }>;
  timestamp: string;
}

const props = defineProps<{
  chatId: string;
  characterId: string;
}>();

const loading = ref(false);
const extracting = ref(false);
const debugState = ref<DebugState | null>(null);
const extractionHistory = ref<ExtractionRecord[]>([]);

const TYPE_CONFIG: Record<string, 'primary' | 'success' | 'warning' | 'danger'> = {
  fact: 'primary',
  preference: 'success',
  relationship: 'warning',
  event: 'danger',
};

function getTypeTagType(type: string) {
  return TYPE_CONFIG[type] || 'info';
}

async function refresh() {
  if (!props.chatId || !props.characterId) return;

  loading.value = true;
  try {
    const response = await api.get<DebugState>(
      `/characters/${props.characterId}/intelligence/debug?chatId=${props.chatId}`
    );
    debugState.value = response;
  } catch (error) {
    logger.error('Failed to fetch debug state', error);
  } finally {
    loading.value = false;
  }
}

async function triggerExtraction() {
  if (!props.chatId || !props.characterId) return;

  extracting.value = true;
  try {
    const response = await api.post<{ extracted: Array<{ type: string; content: string; importance: number }> }>(
      `/characters/${props.characterId}/intelligence/extract-memories`,
      { chatId: props.chatId }
    );

    const extracted = response.extracted || [];
    if (extracted.length > 0) {
      extractionHistory.value.unshift({
        extracted,
        timestamp: new Date().toISOString(),
      });
      ElMessage.success(t('debug.extraction.extractSuccess', { n: extracted.length }));
    } else {
      ElMessage.info(t('debug.extraction.noNewMemories'));
    }

    await refresh();
  } catch (error) {
    logger.error('Failed to extract memories', error);
    ElMessage.error(t('debug.extraction.extractError'));
  } finally {
    extracting.value = false;
  }
}

watch(() => [props.chatId, props.characterId], () => {
  refresh();
}, { immediate: true });
</script>

<style scoped>
.extraction-log {
  padding: 12px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.log-title {
  font-weight: 600;
  font-size: 14px;
}

.section-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.counter-section {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.counter-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.extraction-section {
  margin-bottom: 16px;
}

.stats-section {
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.stat-item {
  background: var(--border-subtle);
  padding: 12px 8px;
  border-radius: 8px;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.stat-value.fact { color: var(--accent-purple); }
.stat-value.preference { color: var(--color-success); }
.stat-value.relationship { color: var(--color-warning); }
.stat-value.event { color: var(--color-danger); }

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.action-section {
  margin-bottom: 16px;
}

.history-section {
  margin-top: 16px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  background: var(--border-subtle);
  padding: 12px;
  border-radius: 8px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.history-memories {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.memory-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.memory-content {
  font-size: 12px;
  line-height: 1.4;
}

.no-history,
.no-extraction {
  padding: 12px;
}
</style>
