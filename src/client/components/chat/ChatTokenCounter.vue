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
          <span class="token-text">{{ usedTokens }}/{{ maxTokens }}</span>
          <el-progress
            :percentage="percentage"
            :color="getProgressColor()"
            :show-text="false"
            class="mini-progress"
          />
        </div>
      </template>

      <div class="token-breakdown">
        <div class="breakdown-header">
          <h4>Context Token Usage</h4>
          <el-tag :type="getTagType()" size="small">
            {{ percentage.toFixed(0) }}% Used
          </el-tag>
        </div>

        <!-- Character (Permanent) -->
        <div class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><User /></el-icon>
              Character (Permanent)
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

        <!-- World Info -->
        <div v-if="worldInfoTokens > 0" class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><Document /></el-icon>
              World Info
            </span>
            <span class="tokens">{{ worldInfoTokens }}</span>
          </div>
          <div class="section-items">
            <div v-for="entry in activeWorldInfoEntries" :key="entry.id" class="item">
              <span>{{ entry.name }}</span>
              <span>{{ entry.tokens }}</span>
            </div>
            <div v-if="activeWorldInfoEntries.length === 0" class="item empty">
              <span>No entries triggered</span>
            </div>
          </div>
        </div>

        <!-- Chat History -->
        <div class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><ChatDotRound /></el-icon>
              Chat History
            </span>
            <span class="tokens">{{ historyTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>Messages included</span>
              <span>{{ includedMessageCount }}/{{ totalMessageCount }}</span>
            </div>
          </div>
        </div>

        <!-- Intelligence -->
        <div v-if="intelligenceTokens > 0" class="breakdown-section">
          <div class="section-header">
            <span class="section-title">
              <el-icon><MagicStick /></el-icon>
              Intelligence
            </span>
            <span class="tokens">{{ intelligenceTokens }}</span>
          </div>
          <div class="section-items">
            <div v-if="memoryTokens > 0" class="item">
              <span>Memories</span>
              <span>{{ memoryTokens }}</span>
            </div>
            <div v-if="emotionTokens > 0" class="item">
              <span>Emotion</span>
              <span>{{ emotionTokens }}</span>
            </div>
          </div>
        </div>

        <!-- Available -->
        <div class="breakdown-total">
          <span>Available for Response</span>
          <span class="available" :class="{ warning: availableTokens < 500 }">
            {{ availableTokens }}
          </span>
        </div>

        <el-button
          @click="showContextViewer"
          size="small"
          style="width: 100%; margin-top: 12px;"
        >
          <el-icon><View /></el-icon>
          View Full Context
        </el-button>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '@client/stores/chat';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import type { Message } from '@client/types';
import {
  Histogram,
  User,
  Document,
  ChatDotRound,
  MagicStick,
  View,
} from '@element-plus/icons-vue';

interface WorldInfoEntry {
  id: string;
  name: string;
  tokens: number;
}

const chatStore = useChatStore();
const intelligenceStore = useCharacterIntelligenceStore();

const emit = defineEmits<{
  showContextViewer: [];
}>();

// Token calculations
const maxTokens = computed(() => {
  // Get from current model's context window
  return chatStore.currentModelContextWindow || 128000;
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

const worldInfoTokens = computed(() => {
  return activeWorldInfoEntries.value.reduce((sum, entry) => sum + entry.tokens, 0);
});

const activeWorldInfoEntries = computed<WorldInfoEntry[]>(() => {
  // TODO: Get from worldbook store when implemented
  return [];
});

const historyTokens = computed(() => {
  const messages = chatStore.messages || [];
  return messages.reduce((sum: number, msg: Message) => sum + estimateTokens(msg.content), 0);
});

const includedMessageCount = computed(() => {
  return chatStore.messages?.length || 0;
});

const totalMessageCount = computed(() => {
  return chatStore.messages?.length || 0;
});

const memoryTokens = computed(() => {
  const memories = intelligenceStore.memories || [];
  return memories.reduce((sum: number, mem: any) => sum + estimateTokens(mem.content), 0);
});

const emotionTokens = computed(() => {
  // Emotion state is small, estimate ~50 tokens
  return intelligenceStore.emotion ? 50 : 0;
});

const intelligenceTokens = computed(() => {
  return memoryTokens.value + emotionTokens.value;
});

const usedTokens = computed(() => {
  return characterTokens.value +
    worldInfoTokens.value +
    historyTokens.value +
    intelligenceTokens.value;
});

const availableTokens = computed(() => {
  const maxOutput = 4096; // Reserve for model output
  const buffer = 100; // Safety buffer
  return Math.max(0, maxTokens.value - usedTokens.value - maxOutput - buffer);
});

const percentage = computed(() => {
  return (usedTokens.value / maxTokens.value) * 100;
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
