<!-- src/client/components/debug/PerformanceMetrics.vue -->
<template>
  <div class="performance-metrics">
    <div class="metrics-header">
      <span class="metrics-title">{{ t('debug.performance.title') }}</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- Latency Metrics -->
    <div class="latency-section">
      <div class="section-label">{{ t('debug.performance.latencyMetrics') }}</div>

      <div class="latency-grid">
        <div class="latency-item">
          <div class="latency-header">
            <span class="latency-name">{{ t('debug.performance.embedding') }}</span>
            <span class="latency-value">{{ metrics.embeddingLatency }}ms</span>
          </div>
          <el-progress
            :percentage="getLatencyPercentage(metrics.embeddingLatency, 500)"
            :stroke-width="8"
            :show-text="false"
            :status="getLatencyStatus(metrics.embeddingLatency, 100, 300)"
          />
        </div>

        <div class="latency-item">
          <div class="latency-header">
            <span class="latency-name">{{ t('debug.performance.vectorSearch') }}</span>
            <span class="latency-value">{{ metrics.retrievalLatency }}ms</span>
          </div>
          <el-progress
            :percentage="getLatencyPercentage(metrics.retrievalLatency, 200)"
            :stroke-width="8"
            :show-text="false"
            :status="getLatencyStatus(metrics.retrievalLatency, 50, 100)"
          />
        </div>

        <div class="latency-item">
          <div class="latency-header">
            <span class="latency-name">{{ t('debug.performance.sentiment') }}</span>
            <span class="latency-value">{{ metrics.emotionAnalysisLatency }}ms</span>
          </div>
          <el-progress
            :percentage="getLatencyPercentage(metrics.emotionAnalysisLatency, 300)"
            :stroke-width="8"
            :show-text="false"
            :status="getLatencyStatus(metrics.emotionAnalysisLatency, 50, 150)"
          />
        </div>

        <div class="latency-item">
          <div class="latency-header">
            <span class="latency-name">{{ t('debug.performance.promptBuild') }}</span>
            <span class="latency-value">{{ metrics.promptBuildLatency }}ms</span>
          </div>
          <el-progress
            :percentage="getLatencyPercentage(metrics.promptBuildLatency, 100)"
            :stroke-width="8"
            :show-text="false"
            :status="getLatencyStatus(metrics.promptBuildLatency, 20, 50)"
          />
        </div>
      </div>
    </div>

    <!-- Token Stats -->
    <div class="token-section">
      <div class="section-label">{{ t('debug.performance.tokenStats') }}</div>
      <div class="token-content">
        <div class="token-item">
          <span class="token-label">{{ t('debug.performance.recentPrompt') }}</span>
          <span class="token-value">{{ metrics.lastPromptTokenCount }} tokens</span>
        </div>
      </div>
    </div>

    <!-- Model Status -->
    <div class="model-section">
      <div class="section-label">{{ t('debug.performance.modelStatus') }}</div>
      <div class="model-grid">
        <div class="model-item">
          <span class="model-name">MiniLM ({{ t('debug.performance.modelEmbedding') }})</span>
          <el-tag :type="modelStatus.embedding ? 'success' : 'warning'" size="small">
            {{ modelStatus.embedding ? t('debug.performance.loaded') : t('debug.performance.notLoaded') }}
          </el-tag>
        </div>
        <div class="model-item">
          <span class="model-name">DistilBERT ({{ t('debug.performance.modelSentiment') }})</span>
          <el-tag :type="modelStatus.sentiment ? 'success' : 'warning'" size="small">
            {{ modelStatus.sentiment ? t('debug.performance.loaded') : t('debug.performance.notLoaded') }}
          </el-tag>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend-section">
      <div class="section-label">{{ t('debug.performance.latencyLegend') }}</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-dot success"></span>
          <span>{{ t('debug.performance.good') }}</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot warning"></span>
          <span>{{ t('debug.performance.average') }}</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot exception"></span>
          <span>{{ t('debug.performance.slow') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../services/api';

interface PerformanceData {
  embeddingLatency: number;
  retrievalLatency: number;
  emotionAnalysisLatency: number;
  promptBuildLatency: number;
  lastPromptTokenCount: number;
}

const props = defineProps<{
  chatId: string;
  characterId: string;
}>();

const { t } = useI18n();

const loading = ref(false);
const metrics = reactive<PerformanceData>({
  embeddingLatency: 0,
  retrievalLatency: 0,
  emotionAnalysisLatency: 0,
  promptBuildLatency: 0,
  lastPromptTokenCount: 0,
});

const modelStatus = reactive({
  embedding: false,
  sentiment: false,
});

function getLatencyPercentage(value: number, max: number): number {
  return Math.min((value / max) * 100, 100);
}

function getLatencyStatus(value: number, good: number, warning: number): '' | 'success' | 'warning' | 'exception' {
  if (value <= good) return 'success';
  if (value <= warning) return 'warning';
  return 'exception';
}

async function refresh() {
  if (!props.chatId || !props.characterId) return;

  loading.value = true;
  try {
    const response = await api.get<{
      performance: PerformanceData;
      modelStatus?: { embedding: boolean; sentiment: boolean };
    }>(`/characters/${props.characterId}/intelligence/debug?chatId=${props.chatId}`);

    // API client already unwraps the response, so response is the data directly
    if (response.performance) {
      Object.assign(metrics, response.performance);
    }
    if (response.modelStatus) {
      Object.assign(modelStatus, response.modelStatus);
    }
  } catch (error) {
    console.error('Failed to fetch performance metrics:', error);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.chatId, props.characterId], () => {
  refresh();
}, { immediate: true });
</script>

<style scoped>
.performance-metrics {
  padding: 12px;
}

.metrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metrics-title {
  font-weight: 600;
  font-size: 14px;
}

.section-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.latency-section {
  margin-bottom: 16px;
}

.latency-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.latency-item {
  background: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 8px;
}

.latency-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.latency-name {
  font-size: 13px;
}

.latency-value {
  font-family: monospace;
  font-weight: 600;
}

.token-section {
  margin-bottom: 16px;
}

.token-content {
  background: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 8px;
}

.token-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.token-label {
  font-size: 13px;
}

.token-value {
  font-family: monospace;
  font-weight: 600;
  color: var(--el-color-primary);
}

.model-section {
  margin-bottom: 16px;
}

.model-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--el-fill-color-lighter);
  padding: 10px 12px;
  border-radius: 8px;
}

.model-name {
  font-size: 13px;
}

.legend-section {
  margin-top: 16px;
}

.legend-items {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot.success {
  background: var(--el-color-success);
}

.legend-dot.warning {
  background: var(--el-color-warning);
}

.legend-dot.exception {
  background: var(--el-color-danger);
}
</style>
