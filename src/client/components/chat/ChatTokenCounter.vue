<template>
  <div class="chat-token-counter">
    <el-popover
      placement="bottom"
      :width="420"
      trigger="click"
      popper-class="token-counter-popover"
    >
      <template #reference>
        <div class="counter-badge" :class="getStatusClass()">
          <el-icon><Histogram /></el-icon>
          <span class="token-text">≈{{ usedTokens }}/{{ maxTokens ?? '未知' }}</span>
          <el-progress
            :percentage="percentage"
            :color="getProgressColor()"
            :show-text="false"
            class="mini-progress"
          />
        </div>
      </template>

      <div class="token-breakdown">
        <p>仅估算当前页面已加载的文字，不包含完整后端世界书、记忆与提示词，也不代表实际选入的历史。每次输出上限：{{ currentMeta?.maxOutputTokens ?? '未知' }} token。</p>
        <div class="breakdown-header">
          <h4>页面文字估算</h4>
          <el-tag :type="getTagType()" size="small">
            {{ currentMeta ? `${percentage.toFixed(0)}% 估算占比` : '容量未知' }}
          </el-tag>
        </div>

        <!-- 已加载角色文字 -->
        <div class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><User /></el-icon>
              已加载角色文字
            </span>
            <span class="tokens">{{ characterTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>Description</span>
              <span>{{ descriptionTokens }}</span>
            </div>
            <div class="item">
              <span>Personality</span>
              <span>{{ personalityTokens }}</span>
            </div>
            <div class="item">
              <span>Scenario</span>
              <span>{{ scenarioTokens }}</span>
            </div>
            <div v-if="authorNoteTokens > 0" class="item">
              <span>Author's Note</span>
              <span>{{ authorNoteTokens }}</span>
            </div>
          </div>
        </div>

        <!-- 已加载对话文字 -->
        <div class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><ChatDotRound /></el-icon>
              已加载对话文字
            </span>
            <span class="tokens">{{ historyTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>页面已加载消息</span>
              <span>{{ totalMessageCount }}</span>
            </div>
          </div>
        </div>

        <!-- Available -->
        <div class="breakdown-total">
          <span>估算剩余输入空间</span>
          <span class="available" :class="{ warning: availableTokens < 500 }">
            {{ currentMeta ? availableTokens : '未知' }}
          </span>
        </div>

        <el-button
          @click="showContextViewer"
          size="small"
          style="width: 100%; margin-top: 12px;"
        >
          <el-icon><View /></el-icon>
          上下文详情
        </el-button>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '@client/stores/chat';
import type { Message } from '@client/types';
import {
  Histogram,
  User,
  ChatDotRound,
  View,
} from '@element-plus/icons-vue';

const chatStore = useChatStore();

const emit = defineEmits<{
  showContextViewer: [];
}>();

const currentMeta = computed(() => chatStore.availableModels.find(model => model.id === chatStore.currentModel));

// Token calculations
const maxTokens = computed(() => {
  // Get from current model's context window
  return currentMeta.value?.contextWindow;
});

const characterTokens = computed(() => {
  return descriptionTokens.value +
    personalityTokens.value +
    scenarioTokens.value +
    authorNoteTokens.value;
});

const descriptionTokens = computed(() => {
  return estimateTokens(chatStore.currentCharacter?.cardData?.description || '');
});

const personalityTokens = computed(() => {
  return estimateTokens(chatStore.currentCharacter?.cardData?.personality || '');
});

const scenarioTokens = computed(() => {
  return estimateTokens(chatStore.currentCharacter?.cardData?.scenario || '');
});

const authorNoteTokens = computed(() => {
  return estimateTokens(chatStore.currentCharacter?.cardData?.character_author_note || '');
});

const historyTokens = computed(() => {
  const messages = chatStore.messages || [];
  return messages.reduce((sum: number, msg: Message) => sum + estimateTokens(msg.content), 0);
});

const totalMessageCount = computed(() => {
  return chatStore.messages?.length || 0;
});

const usedTokens = computed(() => characterTokens.value + historyTokens.value);

const availableTokens = computed(() => {
  const meta = currentMeta.value;
  if (!meta) return 0;
  return Math.max(0, Math.min(meta.contextWindow - meta.maxOutputTokens, meta.maxInputTokens ?? meta.contextWindow) - usedTokens.value - 100);
});

const percentage = computed(() => {
  return maxTokens.value ? Math.min(100, (usedTokens.value / maxTokens.value) * 100) : 0;
});

// Helper function to estimate tokens (rough approximation)
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough estimate: 1 token ≈ 4 characters for English, 1.5 for Chinese
  const hasAsian = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/.test(text);
  const ratio = hasAsian ? 1.5 : 4;
  return Math.ceil(text.length / ratio);
}

// UI helpers
function getStatusClass() {
  if (percentage.value > 90) return 'critical';
  if (percentage.value > 75) return 'warning';
  return 'normal';
}

function getProgressColor() {
  if (percentage.value > 90) return '#f56c6c';
  if (percentage.value > 75) return '#e6a23c';
  return '#67c23a';
}

function getTagType() {
  if (percentage.value > 90) return 'danger';
  if (percentage.value > 75) return 'warning';
  return 'success';
}

function showContextViewer() {
  emit('showContextViewer');
}
</script>

<style scoped lang="scss">
.chat-token-counter {
  display: inline-block;
}

.counter-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
  font-weight: 500;

  &.normal {
    background: rgba(103, 194, 58, 0.1);
    color: #67c23a;
    border: 1px solid rgba(103, 194, 58, 0.3);

    &:hover {
      background: rgba(103, 194, 58, 0.2);
    }
  }

  &.warning {
    background: rgba(230, 162, 60, 0.1);
    color: #e6a23c;
    border: 1px solid rgba(230, 162, 60, 0.3);

    &:hover {
      background: rgba(230, 162, 60, 0.2);
    }
  }

  &.critical {
    background: rgba(245, 108, 108, 0.1);
    color: #f56c6c;
    border: 1px solid rgba(245, 108, 108, 0.3);

    &:hover {
      background: rgba(245, 108, 108, 0.2);
    }
  }

  .token-text {
    white-space: nowrap;
  }

  .mini-progress {
    width: 60px;
    :deep(.el-progress-bar__outer) {
      height: 4px !important;
    }
  }
}

.token-breakdown {
  .breakdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--el-border-color-light);

    h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
  }

  .breakdown-section {
    margin-bottom: 16px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: 600;
      color: var(--el-text-color-primary);

      .section-title {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .tokens {
        color: var(--el-color-primary);
      }
    }

    .section-items {
      padding-left: 24px;

      .item {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;
        color: var(--el-text-color-regular);

        &.empty {
          color: var(--el-text-color-placeholder);
          font-style: italic;
        }
      }
    }
  }

  .breakdown-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    margin-top: 16px;
    background: var(--el-fill-color-light);
    border-radius: 8px;
    font-weight: 600;

    .available {
      font-size: 18px;
      color: var(--el-color-success);

      &.warning {
        color: var(--el-color-warning);
      }
    }
  }
}
</style>

<style>
.token-counter-popover {
  padding: 16px !important;
}
</style>
