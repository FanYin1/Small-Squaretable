<!-- src/client/components/debug/MemoryRetrievalLog.vue -->
<template>
  <div class="memory-retrieval-log">
    <div class="log-header">
      <span class="log-title">记忆检索日志</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">刷新</el-button>
    </div>

    <div v-if="debugState?.lastRetrieval" class="retrieval-content">
      <!-- Last Query -->
      <div class="query-section">
        <div class="section-label">查询文本</div>
        <div class="query-text">{{ debugState.lastRetrieval.query }}</div>
        <div class="query-meta">
          <el-tag size="small" type="info">{{ debugState.lastRetrieval.latencyMs }}ms</el-tag>
          <span class="timestamp">{{ formatTime(debugState.lastRetrieval.timestamp) }}</span>
        </div>
      </div>

      <!-- Results -->
      <div class="results-section">
        <div class="section-label">检索结果 ({{ debugState.lastRetrieval.results.length }})</div>

        <div v-if="debugState.lastRetrieval.results.length === 0" class="no-results">
          <el-empty description="无匹配记忆" :image-size="40" />
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
                <span class="score-label">相似度</span>
                <el-progress
                  :percentage="(result.similarity || 0) * 100"
                  :stroke-width="6"
                  :show-text="false"
                  status="success"
                />
                <span class="score-value">{{ ((result.similarity || 0) * 100).toFixed(0) }}%</span>
              </div>
              <div class="score-item">
                <span class="score-label">重要性</span>
                <el-progress
                  :percentage="(result.importance || 0.5) * 100"
                  :stroke-width="6"
                  :show-text="false"
                  status="warning"
                />
                <span class="score-value">{{ ((result.importance || 0.5) * 100).toFixed(0) }}%</span>
              </div>
              <div class="score-item">
                <span class="score-label">时效性</span>
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
        <div class="section-label">评分公式</div>
        <code class="formula">Score = 0.5×相似度 + 0.3×重要性 + 0.2×时效性</code>
      </div>
    </div>

    <div v-else class="log-empty">
      <el-empty description="暂无检索记录" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../services/api';

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

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString();
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
    console.error('Failed to fetch debug state:', error);
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
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.query-section {
  background: var(--el-fill-color-light);
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
  color: var(--el-text-color-secondary);
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
  background: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid var(--el-color-primary);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-rank {
  font-weight: 600;
  color: var(--el-color-primary);
}

.result-score {
  margin-left: auto;
  font-weight: 600;
  color: var(--el-color-success);
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
  color: var(--el-text-color-secondary);
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
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 8px;
}

.formula {
  font-size: 12px;
  color: var(--el-color-primary);
}

.log-empty,
.no-results {
  padding: 24px;
}
</style>
