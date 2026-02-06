<!-- src/client/components/debug/ExtractionLog.vue -->
<template>
  <div class="extraction-log">
    <div class="log-header">
      <span class="log-title">记忆提取日志</span>
      <el-button size="small" @click="refresh" :icon="Refresh" :loading="loading">刷新</el-button>
    </div>

    <!-- Message Counter -->
    <div class="counter-section">
      <div class="section-label">消息计数器</div>
      <div class="counter-content">
        <el-progress
          :percentage="(debugState?.messageCounter || 0) * 10"
          :stroke-width="12"
          :format="() => `${debugState?.messageCounter || 0} / ${debugState?.extractionThreshold || 10}`"
        />
        <div class="counter-hint">
          每 {{ debugState?.extractionThreshold || 10 }} 条消息自动提取记忆
        </div>
      </div>
    </div>

    <!-- Last Extraction -->
    <div class="extraction-section">
      <div class="section-label">最近提取</div>

      <div v-if="debugState?.memoryStats?.lastExtractedAt" class="last-extraction">
        <el-tag type="success" size="small">
          {{ formatTime(debugState.memoryStats.lastExtractedAt) }}
        </el-tag>
      </div>
      <div v-else class="no-extraction">
        <el-tag type="info" size="small">暂无提取记录</el-tag>
      </div>
    </div>

    <!-- Memory Stats -->
    <div class="stats-section">
      <div class="section-label">记忆统计</div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{{ debugState?.memoryStats?.total || 0 }}</span>
          <span class="stat-label">总计</span>
        </div>
        <div class="stat-item">
          <span class="stat-value fact">{{ debugState?.memoryStats?.byType?.fact || 0 }}</span>
          <span class="stat-label">事实</span>
        </div>
        <div class="stat-item">
          <span class="stat-value preference">{{ debugState?.memoryStats?.byType?.preference || 0 }}</span>
          <span class="stat-label">偏好</span>
        </div>
        <div class="stat-item">
          <span class="stat-value relationship">{{ debugState?.memoryStats?.byType?.relationship || 0 }}</span>
          <span class="stat-label">关系</span>
        </div>
        <div class="stat-item">
          <span class="stat-value event">{{ debugState?.memoryStats?.byType?.event || 0 }}</span>
          <span class="stat-label">事件</span>
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
        手动提取记忆
      </el-button>
    </div>

    <!-- Extraction History -->
    <div class="history-section">
      <div class="section-label">提取历史</div>
      <div v-if="extractionHistory.length === 0" class="no-history">
        <el-empty description="暂无提取历史" :image-size="40" />
      </div>
      <div v-else class="history-list">
        <div
          v-for="(item, index) in extractionHistory"
          :key="index"
          class="history-item"
        >
          <div class="history-header">
            <el-tag size="small" type="success">{{ item.extracted.length }} 条</el-tag>
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
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';

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

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString();
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
      ElMessage.success(`成功提取 ${extracted.length} 条记忆`);
    } else {
      ElMessage.info('未提取到新记忆');
    }

    await refresh();
  } catch (error) {
    console.error('Failed to extract memories:', error);
    ElMessage.error('提取失败');
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
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.counter-section {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.counter-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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
  background: var(--el-fill-color-lighter);
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

.stat-value.fact { color: var(--el-color-primary); }
.stat-value.preference { color: var(--el-color-success); }
.stat-value.relationship { color: var(--el-color-warning); }
.stat-value.event { color: var(--el-color-danger); }

.stat-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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
  background: var(--el-fill-color-lighter);
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
  color: var(--el-text-color-secondary);
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
