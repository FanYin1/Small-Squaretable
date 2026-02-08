<!-- src/client/components/debug/MemoryRetrievalLog.vue -->
<template>
  <div class="memory-retrieval-log">
    <div class="log-header">
      <span class="log-title">{{ t('debug.retrieval.title') }}</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">{{ t('common.refresh') }}</el-button>
    </div>

    <div v-if="debugState?.lastRetrieval" class="retrieval-content">
      <!-- Last Query -->
      <div class="query-section">
        <div class="section-label">{{ t('debug.retrieval.queryText') }}</div>
        <div class="query-text">{{ debugState.lastRetrieval.query }}</div>
        <div class="query-meta">
          <el-tag size="small" type="info">{{ debugState.lastRetrieval.latencyMs }}ms</el-tag>
          <span class="timestamp">{{ formatTime(debugState.lastRetrieval.timestamp) }}</span>
        </div>
      </div>

      <!-- Results -->
      <div class="results-section">
        <div class="section-label">{{ t('debug.retrieval.results') }} ({{ debugState.lastRetrieval.results.length }})</div>

        <div v-if="debugState.lastRetrieval.results.length === 0" class="no-results">
          <el-empty :description="t('debug.retrieval.noMatch')" :image-size="40" />
        </div>

        <div v-else class="results-list">
          <div
            v-for="(result, index) in debugState.lastRetrieval.results"
            :key="result.id"
            class="result-item"
          >
            <div class="result-header">
              <span class="result-rank">#{{ index + 1 }}</span>
              <el-tag :type="getTypeTagType(result.type)" size="small">{{ result.type }}</el-tag>
              <span class="result-score">{{ (result.score * 100).toFixed(1) }}%</span>
            </div>
            <div class="result-content">{{ result.content }}</div>

            <!-- Score Breakdown -->
            <div class="score-breakdown">
              <div class="score-item">
                <span class="score-label">{{ t('debug.retrieval.similarity') }}</span>
                <el-progress
                  :percentage="(result.similarity || 0) * 100"
                  :stroke-width="6"
                  :show-text="false"
                  status="success"
                />
                <span class="score-value">{{ ((result.similarity || 0) * 100).toFixed(0) }}%</span>
              </div>
              <div class="score-item">
                <span class="score-label">{{ t('debug.retrieval.importance') }}</span>
                <el-progress
                  :percentage="(result.importance || 0.5) * 100"
                  :stroke-width="6"
                  :show-text="false"
                  status="warning"
                />
                <span class="score-value">{{ ((result.importance || 0.5) * 100).toFixed(0) }}%</span>
              </div>
              <div class="score-item">
                <span class="score-label">{{ t('debug.retrieval.recency') }}</span>
                <el-progress
                  :percentage="(result.recency || 0.5) * 100"
                  :stroke-width="6"
                  :show-text="false"
                />
                <span class="score-value">{{ ((result.recency || 0.5) * 100).toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Score Formula -->
      <div class="formula-section">
        <div class="section-label">{{ t('debug.retrieval.formula') }}</div>
        <code class="formula">{{ t('debug.retrieval.formulaText') }}</code>
      </div>
    </div>

    <div v-else class="log-empty">
      <el-empty :description="t('debug.retrieval.empty')" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../services/api';
import { createLogger } from '@client/utils/logger';
import { useDateTime } from '@client/composables';

const logger = createLogger('MemoryRetrievalLog');
const { t } = useI18n();
const { formatTime } = useDateTime();

interface MemoryResult {
  id: string;
  content: string;
  type: string;
  score: number;
  similarity?: number;
  importance?: number;
  recency?: number;
}

interface DebugState {
  lastRetrieval: {
    query: string;
    results: MemoryResult[];
    timestamp: string;
    latencyMs: number;
  } | null;
}

const props = defineProps<{
  chatId: string;
  characterId: string;
}>();

const loading = ref(false);
const debugState = ref<DebugState | null>(null);

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

watch(() => [props.chatId, props.characterId], () => {
  refresh();
}, { immediate: true });
</script>

<style scoped>
.memory-retrieval-log {
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

.query-section {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.query-text {
  font-size: 13px;
  margin-bottom: 8px;
}

.query-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timestamp {
  font-size: 11px;
  color: var(--text-secondary);
}

.results-section {
  margin-bottom: 16px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  background: var(--border-subtle);
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid var(--accent-purple);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-rank {
  font-weight: 600;
  color: var(--accent-purple);
}

.result-score {
  margin-left: auto;
  font-weight: 600;
  color: var(--color-success);
}

.result-content {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
}

.score-breakdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.score-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-label {
  font-size: 11px;
  color: var(--text-secondary);
  width: 50px;
}

.score-item .el-progress {
  flex: 1;
}

.score-value {
  font-size: 11px;
  width: 35px;
  text-align: right;
}

.formula-section {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 8px;
}

.formula {
  font-size: 12px;
  color: var(--accent-purple);
}

.log-empty,
.no-results {
  padding: 24px;
}
</style>
