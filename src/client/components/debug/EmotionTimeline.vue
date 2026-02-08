<!-- src/client/components/debug/EmotionTimeline.vue -->
<template>
  <div class="emotion-timeline">
    <div class="timeline-header">
      <span class="timeline-title">{{ t('debug.emotion.title') }}</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">{{ t('common.refresh') }}</el-button>
    </div>

    <!-- Current State -->
    <div v-if="currentEmotion" class="current-state">
      <div class="state-label">{{ t('debug.emotion.currentState') }}</div>
      <div class="state-content">
        <span class="emotion-emoji">{{ getEmoji(currentEmotion.label) }}</span>
        <span class="emotion-label">{{ currentEmotion.label }}</span>
        <div class="emotion-values">
          <span :class="['valence', toNumber(currentEmotion.valence) > 0 ? 'positive' : 'negative']">
            V: {{ formatValue(currentEmotion.valence) }}
          </span>
          <span class="arousal">A: {{ formatValue(currentEmotion.arousal) }}</span>
        </div>
      </div>
    </div>

    <!-- Chart -->
    <div class="chart-container">
      <div ref="chartRef" class="chart"></div>
    </div>

    <!-- History List -->
    <div class="history-section">
      <div class="section-label">{{ t('debug.emotion.history') }} ({{ emotionHistory.length }})</div>
      <div class="history-list">
        <div
          v-for="(item, index) in emotionHistory.slice(0, 10)"
          :key="index"
          class="history-item"
        >
          <span class="history-emoji">{{ getEmoji(item.label) }}</span>
          <span class="history-label">{{ item.label }}</span>
          <span class="history-values">
            V:{{ formatValue(item.valence) }} A:{{ formatValue(item.arousal) }}
          </span>
          <span class="history-time">{{ formatTime(item.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../services/api';
import { createLogger } from '@client/utils/logger';
import { useDateTime } from '@client/composables';

const logger = createLogger('EmotionTimeline');
const { t } = useI18n();
const { formatTime } = useDateTime();

interface EmotionState {
  valence: number;
  arousal: number;
  label: string;
  timestamp?: string;
}

const props = defineProps<{
  chatId: string;
  characterId: string;
}>();

const loading = ref(false);
const currentEmotion = ref<EmotionState | null>(null);
const emotionHistory = ref<EmotionState[]>([]);
const chartRef = ref<HTMLElement | null>(null);

const EMOJI_MAP: Record<string, string> = {
  excited: '🤩',
  happy: '😊',
  loving: '🥰',
  calm: '😌',
  curious: '🤔',
  surprised: '😮',
  confused: '😕',
  bored: '😐',
  sad: '😢',
  fearful: '😨',
  angry: '😠',
  disgusted: '🤢',
  neutral: '😶',
};

function getEmoji(label: string) {
  return EMOJI_MAP[label] || '😶';
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function formatValue(val: unknown): string {
  return toNumber(val).toFixed(2);
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function refresh() {
  if (!props.chatId || !props.characterId) return;

  loading.value = true;
  try {
    const response = await api.get<{
      currentEmotion: EmotionState | null;
      emotionHistory?: EmotionState[];
    }>(`/characters/${props.characterId}/intelligence/debug?chatId=${props.chatId}`);

    currentEmotion.value = response.currentEmotion;
    emotionHistory.value = response.emotionHistory || [];

    renderChart();
  } catch (error) {
    logger.error('Failed to fetch emotion data', error);
  } finally {
    loading.value = false;
  }
}

function renderChart() {
  if (!chartRef.value || emotionHistory.value.length === 0) return;

  // Simple SVG chart
  const width = chartRef.value.clientWidth;
  const height = 150;
  const padding = 30;

  const data = emotionHistory.value.slice(0, 20).reverse();
  const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.display = 'block';

  // Draw grid
  const gridColor = getCssVar('--border-default');
  for (let i = 0; i <= 4; i++) {
    const y = padding + (height - padding * 2) * (i / 4);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(padding));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(width - padding));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', gridColor);
    line.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(line);
  }

  // Draw valence line (blue)
  if (data.length > 1) {
    const valencePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const valencePoints = data.map((d, i) => {
      const x = padding + i * xStep;
      const y = padding + (1 - (toNumber(d.valence) + 1) / 2) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
    valencePath.setAttribute('points', valencePoints);
    valencePath.setAttribute('fill', 'none');
    valencePath.setAttribute('stroke', getCssVar('--accent-purple'));
    valencePath.setAttribute('stroke-width', '2');
    svg.appendChild(valencePath);
  }

  // Draw arousal line (orange)
  if (data.length > 1) {
    const arousalPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const arousalPoints = data.map((d, i) => {
      const x = padding + i * xStep;
      const y = padding + (1 - toNumber(d.arousal)) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
    arousalPath.setAttribute('points', arousalPoints);
    arousalPath.setAttribute('fill', 'none');
    arousalPath.setAttribute('stroke', getCssVar('--color-warning'));
    arousalPath.setAttribute('stroke-width', '2');
    svg.appendChild(arousalPath);
  }

  // Draw points
  data.forEach((d, i) => {
    const x = padding + i * xStep;

    // Valence point
    const vy = padding + (1 - (toNumber(d.valence) + 1) / 2) * (height - padding * 2);
    const vCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    vCircle.setAttribute('cx', String(x));
    vCircle.setAttribute('cy', String(vy));
    vCircle.setAttribute('r', '4');
    vCircle.setAttribute('fill', getCssVar('--accent-purple'));
    svg.appendChild(vCircle);

    // Arousal point
    const ay = padding + (1 - toNumber(d.arousal)) * (height - padding * 2);
    const aCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    aCircle.setAttribute('cx', String(x));
    aCircle.setAttribute('cy', String(ay));
    aCircle.setAttribute('r', '4');
    aCircle.setAttribute('fill', getCssVar('--color-warning'));
    svg.appendChild(aCircle);
  });

  // Legend
  const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  const vLegend = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  vLegend.setAttribute('x', String(padding));
  vLegend.setAttribute('y', '15');
  vLegend.setAttribute('fill', getCssVar('--accent-purple'));
  vLegend.setAttribute('font-size', '11');
  vLegend.textContent = '● Valence';
  legend.appendChild(vLegend);

  const aLegend = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  aLegend.setAttribute('x', String(padding + 70));
  aLegend.setAttribute('y', '15');
  aLegend.setAttribute('fill', getCssVar('--color-warning'));
  aLegend.setAttribute('font-size', '11');
  aLegend.textContent = '● Arousal';
  legend.appendChild(aLegend);

  svg.appendChild(legend);

  // Clear and append
  chartRef.value.innerHTML = '';
  chartRef.value.appendChild(svg);
}

watch(() => [props.chatId, props.characterId], () => {
  refresh();
}, { immediate: true });

onMounted(() => {
  window.addEventListener('resize', renderChart);
});

onUnmounted(() => {
  window.removeEventListener('resize', renderChart);
});
</script>

<style scoped>
.emotion-timeline {
  padding: 12px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.timeline-title {
  font-weight: 600;
  font-size: 14px;
}

.current-state {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.state-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.state-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.emotion-emoji {
  font-size: 32px;
}

.emotion-label {
  font-size: 16px;
  font-weight: 600;
}

.emotion-values {
  margin-left: auto;
  display: flex;
  gap: 12px;
  font-family: monospace;
  font-size: 13px;
}

.valence.positive {
  color: var(--color-success);
}

.valence.negative {
  color: var(--color-danger);
}

.arousal {
  color: var(--color-warning);
}

.chart-container {
  background: var(--border-subtle);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 16px;
}

.chart {
  width: 100%;
  min-height: 150px;
}

.section-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
}

.history-emoji {
  font-size: 16px;
}

.history-label {
  font-weight: 500;
  min-width: 60px;
}

.history-values {
  font-family: monospace;
  color: var(--text-secondary);
}

.history-time {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 11px;
}
</style>
