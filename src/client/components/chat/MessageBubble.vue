<template>
  <div :class="['message-bubble', `message-${message.role}`]">
    <el-avatar
      v-if="message.role === 'assistant'"
      :size="32"
      :src="characterAvatar"
      class="message-avatar"
    >
      {{ avatarFallback(characterName) }}
    </el-avatar>
    <div class="message-body">
      <div class="message-content">
        <div v-if="message.role === 'assistant'" class="markdown-content" v-html="renderedContent"></div>
        <div v-else class="text-content">{{ message.content }}</div>
      </div>
      <div class="message-footer">
        <span class="message-time">{{ formattedTime }}</span>
        <div class="message-actions">
          <el-tooltip content="Copy" placement="top" :show-after="500">
            <button class="action-btn" :aria-label="t('chat.copyMessage') || 'Copy message'" @click="copyMessage" v-if="message.content">
              <el-icon :size="14"><component :is="copied ? Check : CopyDocument" /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="Edit" placement="top" :show-after="500">
            <button class="action-btn" :aria-label="t('chat.editMessage') || 'Edit message'" @click="handleEdit" v-if="message.role === 'user'">
              <el-icon :size="14"><Edit /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="Regenerate" placement="top" :show-after="500">
            <button class="action-btn" :aria-label="t('chat.regenerateMessage') || 'Regenerate response'" @click="handleRegenerate" v-if="message.role === 'assistant'">
              <el-icon :size="14"><RefreshRight /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="Delete" placement="top" :show-after="500">
            <button class="action-btn delete-btn" :aria-label="t('chat.deleteMessage') || 'Delete message'" @click="handleDelete">
              <el-icon :size="14"><Delete /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>
    </div>
    <el-avatar
      v-if="message.role === 'user'"
      :size="32"
      :src="userAvatar"
      class="message-avatar"
    >
      {{ avatarFallback(userName) }}
    </el-avatar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, CopyDocument, Edit, RefreshRight, Delete } from '@element-plus/icons-vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useDateTime } from '@client/composables';
import { createLogger } from '@client/utils/logger';
import type { Message } from '@client/types';

const logger = createLogger('MessageBubble');

interface Props {
  message: Message;
  characterAvatar?: string;
  characterName?: string;
  userAvatar?: string;
  userName?: string;
}

const props = defineProps<Props>();

const avatarFallback = (name?: string): string => {
  return name ? name[0].toUpperCase() : '?';
};
const emit = defineEmits<{
  (e: 'edit', messageId: string): void;
  (e: 'regenerate', messageId: string): void;
  (e: 'delete', messageId: string): void;
}>();
const { t } = useI18n();
const { formatRelativeTime } = useDateTime();
const copied = ref(false);

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    return DOMPurify.sanitize(marked.parse(props.message.content) as string);
  }
  return props.message.content;
});

const formattedTime = computed(() => {
  return formatRelativeTime(props.message.createdAt);
});

const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    logger.error('Failed to copy message', error);
  }
};

const handleEdit = () => {
  emit('edit', props.message.id);
};

const handleRegenerate = () => {
  emit('regenerate', props.message.id);
};

const handleDelete = () => {
  emit('delete', props.message.id);
};
</script>

<style scoped>
.message-bubble {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
  max-width: 80%;
  animation: fadeIn 0.3s ease-in;
}

.message-user {
  align-self: flex-end;
}

.message-assistant {
  align-self: flex-start;
}

.message-avatar {
  flex-shrink: 0;
  margin-top: 4px;
}

.message-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.message-user .message-content {
  background-color: var(--accent-purple);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-assistant .message-content {
  background-color: var(--surface-card);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
  position: relative;
  z-index: 0;
}

.message-assistant .message-content::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  z-index: -1;
  opacity: 0.3;
  pointer-events: none;
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
  background-color: var(--surface-hover);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background-color: var(--surface-hover);
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
  border-left: 4px solid var(--accent-purple);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
}

.markdown-content :deep(a) {
  color: var(--accent-purple);
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
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.2s;
}

.message-bubble:hover .message-time {
  opacity: 1;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-bubble:hover .message-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--surface-hover);
  color: var(--accent-purple);
}

.action-btn.delete-btn:hover {
  color: var(--color-danger);
}
</style>
