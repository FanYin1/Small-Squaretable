<template>
  <el-dialog
    v-model="visible"
    title="Context Viewer"
    width="90%"
    :fullscreen="isFullscreen"
    class="context-viewer-dialog"
  >
    <div class="context-viewer">
      <div class="viewer-toolbar">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="formatted">Formatted</el-radio-button>
          <el-radio-button value="raw">Raw JSON</el-radio-button>
          <el-radio-button value="tokens">Token View</el-radio-button>
        </el-radio-group>

        <div class="toolbar-stats">
          <el-tag type="info">{{ contextMessages.length }} messages</el-tag>
          <el-tag :type="getTokenTagType()">{{ totalTokens }} tokens</el-tag>
        </div>

        <div class="toolbar-actions">
          <el-button @click="copyToClipboard" size="small">
            <el-icon><CopyDocument /></el-icon> Copy
          </el-button>
          <el-button @click="refreshContext" size="small" :loading="loading">
            <el-icon><Refresh /></el-icon> Refresh
          </el-button>
          <el-button @click="isFullscreen = !isFullscreen" size="small">
            <el-icon v-if="!isFullscreen"><FullScreen /></el-icon>
            <el-icon v-else><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- Formatted View -->
      <div v-if="viewMode === 'formatted'" class="formatted-view">
        <div v-for="(message, index) in contextMessages" :key="index" class="context-message">
          <div class="message-header">
            <el-tag :type="getRoleTagType(message.role)" size="small">
              {{ message.role }}
            </el-tag>
            <span class="message-index">#{{ index }}</span>
            <span class="message-tokens">{{ message.tokens }} tokens</span>
            <el-tag v-if="message.source" size="small" type="info">
              {{ message.source }}
            </el-tag>
            <el-tag v-if="message.depth !== undefined" size="small" type="warning">
              depth {{ message.depth }}
            </el-tag>
            <el-tag v-if="message.pinned" size="small" type="danger">
              <el-icon><Flag /></el-icon> Pinned
            </el-tag>
            <el-tag v-if="message.importance" size="small">
              ⭐ {{ message.importance }}
            </el-tag>
          </div>
          <div class="message-content">
            <pre>{{ message.content }}</pre>
          </div>
        </div>

        <el-empty v-if="contextMessages.length === 0" description="No context available" />
      </div>

      <!-- Raw JSON View -->
      <div v-else-if="viewMode === 'raw'" class="raw-view">
        <pre><code>{{ JSON.stringify(contextData, null, 2) }}</code></pre>
      </div>

      <!-- Token View -->
      <div v-else class="token-view">
        <div class="token-legend">
          <div class="legend-item">
            <span class="legend-color system"></span>
            <span>System</span>
          </div>
          <div class="legend-item">
            <span class="legend-color user"></span>
            <span>User</span>
          </div>
          <div class="legend-item">
            <span class="legend-color assistant"></span>
            <span>Assistant</span>
          </div>
        </div>

        <div class="token-visualization">
          <div
            v-for="(message, index) in contextMessages"
            :key="index"
            class="token-block"
            :style="{
              width: `${(message.tokens / totalTokens) * 100}%`,
              minWidth: '2px'
            }"
            :class="`role-${message.role}`"
          >
            <el-tooltip
              :content="`${message.role}: ${message.tokens} tokens (${((message.tokens / totalTokens) * 100).toFixed(1)}%)`"
              placement="top"
            >
              <div class="block-content">
                <span v-if="message.tokens > 50">{{ message.tokens }}</span>
              </div>
            </el-tooltip>
          </div>
        </div>

        <div class="token-breakdown-list">
          <div
            v-for="(message, index) in contextMessages"
            :key="index"
            class="breakdown-item"
          >
            <div class="item-header">
              <el-tag :type="getRoleTagType(message.role)" size="small">
                {{ message.role }}
              </el-tag>
              <span class="item-source">{{ message.source || 'Message' }}</span>
            </div>
            <div class="item-stats">
              <span>{{ message.tokens }} tokens</span>
              <span class="percentage">{{ ((message.tokens / totalTokens) * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <span class="footer-info">
          Total: {{ totalTokens }} / {{ maxTokens }} tokens ({{ usagePercentage }}%)
        </span>
        <el-button @click="visible = false">Close</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  CopyDocument,
  Refresh,
  FullScreen,
  Close,
  Flag,
} from '@element-plus/icons-vue';
import { chatApi } from '@client/services/chat.api';

interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokens: number;
  source?: string;
  depth?: number;
  pinned?: boolean;
  importance?: number;
}

interface ContextData {
  messages: ContextMessage[];
  totalTokens: number;
  maxTokens: number;
  model: string;
}

const props = defineProps<{
  chatId: string;
}>();

const visible = defineModel<boolean>({ required: true });

const viewMode = ref<'formatted' | 'raw' | 'tokens'>('formatted');
const isFullscreen = ref(false);
const loading = ref(false);
const contextData = ref<ContextData | null>(null);

const contextMessages = computed(() => contextData.value?.messages || []);
const totalTokens = computed(() => contextData.value?.totalTokens || 0);
const maxTokens = computed(() => contextData.value?.maxTokens || 128000);
const usagePercentage = computed(() =>
  ((totalTokens.value / maxTokens.value) * 100).toFixed(1)
);

// Fetch context when dialog opens
watch(visible, async (isVisible) => {
  if (isVisible && !contextData.value) {
    await refreshContext();
  }
});

async function refreshContext() {
  loading.value = true;
  try {
    // TODO: Implement API endpoint
    // const response = await chatApi.getContext(props.chatId);
    // contextData.value = response;

    // Mock data for now
    contextData.value = {
      messages: [
        {
          role: 'system',
          content: 'You are Alice. A friendly AI assistant.',
          tokens: 12,
          source: 'Character Description',
        },
        {
          role: 'system',
          content: 'Personality: helpful, curious, friendly',
          tokens: 8,
          source: 'Personality',
        },
        {
          role: 'system',
          content: '[Alice\'s persona: intelligent, empathetic; Alice\'s body: virtual]',
          tokens: 15,
          source: 'Author\'s Note',
          depth: 0,
        },
        {
          role: 'user',
          content: 'Hello! How are you?',
          tokens: 6,
          pinned: true,
          importance: 8,
        },
        {
          role: 'assistant',
          content: 'Hi there! I\'m doing great, thank you for asking!',
          tokens: 14,
        },
      ],
      totalTokens: 55,
      maxTokens: 128000,
      model: 'glm-4.5-air',
    };
  } catch (error) {
    ElMessage.error('Failed to fetch context');
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function getRoleTagType(role: string) {
  switch (role) {
    case 'system': return 'info';
    case 'user': return 'success';
    case 'assistant': return 'primary';
    default: return 'info';
  }
}

function getTokenTagType() {
  const percentage = (totalTokens.value / maxTokens.value) * 100;
  if (percentage > 90) return 'danger';
  if (percentage > 75) return 'warning';
  return 'success';
}

async function copyToClipboard() {
  try {
    let text = '';
    if (viewMode.value === 'raw') {
      text = JSON.stringify(contextData.value, null, 2);
    } else {
      text = contextMessages.value
        .map(m => `[${m.role}] ${m.content}`)
        .join('\n\n');
    }
    await navigator.clipboard.writeText(text);
    ElMessage.success('Copied to clipboard');
  } catch (error) {
    ElMessage.error('Failed to copy');
  }
}
</script>

<style scoped lang="scss">
.context-viewer {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 500px;

  .viewer-toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color-light);
    background: var(--el-fill-color-light);

    .toolbar-stats {
      display: flex;
      gap: 8px;
    }

    .toolbar-actions {
      margin-left: auto;
      display: flex;
      gap: 8px;
    }
  }

  .formatted-view,
  .raw-view,
  .token-view {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .formatted-view {
    .context-message {
      margin-bottom: 16px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 8px;
      overflow: hidden;

      .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--el-fill-color-light);
        border-bottom: 1px solid var(--el-border-color-lighter);
        font-size: 13px;

        .message-index {
          color: var(--el-text-color-secondary);
        }

        .message-tokens {
          margin-left: auto;
          color: var(--el-color-primary);
          font-weight: 500;
        }
      }

      .message-content {
        padding: 12px;

        pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          line-height: 1.6;
        }
      }
    }
  }

  .raw-view {
    pre {
      margin: 0;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
    }
  }

  .token-view {
    .token-legend {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--el-fill-color-light);
      border-radius: 8px;

      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;

        .legend-color {
          width: 20px;
          height: 20px;
          border-radius: 4px;

          &.system {
            background: var(--el-color-info);
          }

          &.user {
            background: var(--el-color-success);
          }

          &.assistant {
            background: var(--el-color-primary);
          }
        }
      }
    }

    .token-visualization {
      display: flex;
      height: 60px;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

      .token-block {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.3s;

        &.role-system {
          background: var(--el-color-info);
        }

        &.role-user {
          background: var(--el-color-success);
        }

        &.role-assistant {
          background: var(--el-color-primary);
        }

        &:hover {
          filter: brightness(1.1);
          transform: scaleY(1.05);
        }

        .block-content {
          color: white;
          font-size: 12px;
          font-weight: 500;
        }
      }
    }

    .token-breakdown-list {
      .breakdown-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        margin-bottom: 8px;
        border: 1px solid var(--el-border-color-light);
        border-radius: 8px;
        transition: all 0.3s;

        &:hover {
          background: var(--el-fill-color-light);
          border-color: var(--el-color-primary);
        }

        .item-header {
          display: flex;
          align-items: center;
          gap: 8px;

          .item-source {
            color: var(--el-text-color-regular);
          }
        }

        .item-stats {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 500;

          .percentage {
            color: var(--el-color-primary);
          }
        }
      }
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .footer-info {
    color: var(--el-text-color-secondary);
    font-size: 14px;
  }
}
</style>

<style>
.context-viewer-dialog {
  .el-dialog__body {
    padding: 0 !important;
  }
}
</style>
