<!-- src/client/components/debug/IntelligenceDebugPanel.vue -->
<template>
  <div class="debug-panel" :class="{ collapsed: isCollapsed }">
    <div class="debug-panel__header" @click="toggleCollapse">
      <div class="debug-panel__title">
        <span class="debug-icon">🔬</span>
        <span>{{ t('debug.title') }}</span>
      </div>
      <div class="debug-panel__actions">
        <el-badge :value="eventCount" :hidden="eventCount === 0" :max="99" />
        <el-icon class="collapse-icon">
          <ArrowDown v-if="!isCollapsed" />
          <ArrowRight v-else />
        </el-icon>
      </div>
    </div>

    <Transition name="slide-down">
      <div v-show="!isCollapsed" class="debug-panel__content">
        <el-tabs v-model="activeTab" class="debug-tabs">
          <el-tab-pane :label="t('debug.tab.systemPrompt')" name="prompt">
            <SystemPromptViewer
              v-if="chatId && characterId"
              :chat-id="chatId"
              :character-id="characterId"
            />
            <div v-else class="tab-empty">
              <el-empty :description="t('debug.selectChatFirst')" :image-size="60" />
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('debug.tab.memoryRetrieval')" name="retrieval">
            <MemoryRetrievalLog
              v-if="chatId && characterId"
              :chat-id="chatId"
              :character-id="characterId"
            />
            <div v-else class="tab-empty">
              <el-empty :description="t('debug.selectChatFirst')" :image-size="60" />
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('debug.tab.emotionTimeline')" name="emotion">
            <EmotionTimeline
              v-if="chatId && characterId"
              :chat-id="chatId"
              :character-id="characterId"
            />
            <div v-else class="tab-empty">
              <el-empty :description="t('debug.selectChatFirst')" :image-size="60" />
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('debug.tab.extractionLog')" name="extraction">
            <ExtractionLog
              v-if="chatId && characterId"
              :chat-id="chatId"
              :character-id="characterId"
            />
            <div v-else class="tab-empty">
              <el-empty :description="t('debug.selectChatFirst')" :image-size="60" />
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('debug.tab.performance')" name="performance">
            <PerformanceMetrics
              v-if="chatId && characterId"
              :chat-id="chatId"
              :character-id="characterId"
            />
            <div v-else class="tab-empty">
              <el-empty :description="t('debug.selectChatFirst')" :image-size="60" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import SystemPromptViewer from './SystemPromptViewer.vue';
import MemoryRetrievalLog from './MemoryRetrievalLog.vue';
import EmotionTimeline from './EmotionTimeline.vue';
import ExtractionLog from './ExtractionLog.vue';
import PerformanceMetrics from './PerformanceMetrics.vue';

defineProps<{
  chatId?: string;
  characterId?: string;
}>();

const { t } = useI18n();

const isCollapsed = ref(true);
const activeTab = ref('prompt');
const eventCount = ref(0);

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

// Expose for parent to update event count
defineExpose({
  incrementEventCount: () => {
    eventCount.value++;
  },
  resetEventCount: () => {
    eventCount.value = 0;
  },
});
</script>

<style scoped>
.debug-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.debug-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.debug-panel__header:hover {
  background: var(--el-fill-color);
}

.debug-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.debug-icon {
  font-size: 18px;
}

.debug-panel__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-icon {
  transition: transform 0.3s;
}

.debug-panel__content {
  max-height: 500px;
  overflow-y: auto;
}

.debug-tabs {
  padding: 0 8px;
}

:deep(.el-tabs__header) {
  margin-bottom: 0;
}

:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

:deep(.el-tabs__item) {
  font-size: 13px;
  padding: 0 12px;
}

:deep(.el-tab-pane) {
  padding: 0;
}

.tab-empty {
  padding: 32px;
}

/* Slide down animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  max-height: 500px;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
