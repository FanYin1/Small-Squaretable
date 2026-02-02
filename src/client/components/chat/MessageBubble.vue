<template>
  <div :class="['message-bubble', `message-${message.role}`]">
    <div class="message-content">
      <div v-if="message.role === 'assistant'" class="markdown-content" v-html="renderedContent"></div>
      <div v-else class="text-content">{{ message.content }}</div>
    </div>
    <div class="message-footer">
      <span class="message-time">{{ formattedTime }}</span>
      <el-button
        v-if="message.content"
        link
        size="small"
        :icon="CopyDocument"
        @click="copyMessage"
        class="copy-button"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CopyDocument } from '@element-plus/icons-vue';
import { marked } from 'marked';
import type { Message } from '@client/types';

interface Props {
  message: Message;
}

const props = defineProps<Props>();
const copied = ref(false);

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    return marked.parse(props.message.content);
  }
  return props.message.content;
});

const formattedTime = computed(() => {
  const date = new Date(props.message.createdAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
});

const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy message:', error);
  }
};
</script>

<style scoped>
.message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  max-width: 80%;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-user {
  align-self: flex-end;
}

.message-assistant {
  align-self: flex-start;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.message-user .message-content {
  background-color: var(--el-color-primary);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-assistant .message-content {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  border-bottom-left-radius: 4px;
}

.text-content {
  white-space: pre-wrap;
}

.markdown-content {
  line-height: 1.6;
}

.markdown-content :deep(p) {
  margin: 0 0 8px 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(code) {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin: 4px 0;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--el-color-primary);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--el-text-color-secondary);
}

.markdown-content :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.message-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 0 4px;
}

.message-user .message-footer {
  justify-content: flex-end;
}

.message-assistant .message-footer {
  justify-content: flex-start;
}

.message-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.copy-button {
  opacity: 0;
  transition: opacity 0.2s;
}

.message-bubble:hover .copy-button {
  opacity: 1;
}
</style>
