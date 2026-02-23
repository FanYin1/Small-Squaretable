<template>
  <div :class="['message', `message-${message.role}`]">
    <div class="message-inner">
      <div class="message-header">
        <template v-if="message.role === 'assistant'">
          <el-avatar :size="36" :src="displayCharacterAvatar">
            {{ displayCharacterName?.[0]?.toUpperCase() || '?' }}
          </el-avatar>
          <span class="message-author">{{ displayCharacterName }}</span>
          <span v-if="(message as any).emotion" class="emotion-tag">{{ (message as any).emotion }}</span>
        </template>
        <template v-else>
          <span class="message-author">{{ t('chat.you') || 'You' }}</span>
        </template>
        <!-- Branch navigation indicator -->
        <div v-if="branchInfo && branchInfo.total > 1" class="branch-indicator">
          <el-button
            :icon="ArrowLeft"
            size="small"
            text
            :disabled="branchInfo.currentIndex === 0"
            @click="emit('switchBranch', Number(message.id), 'prev')"
          />
          <span class="branch-count">{{ branchInfo.currentIndex + 1 }}/{{ branchInfo.total }}</span>
          <el-button
            :icon="ArrowRight"
            size="small"
            text
            :disabled="branchInfo.currentIndex === branchInfo.total - 1"
            @click="emit('switchBranch', Number(message.id), 'next')"
          />
        </div>
      </div>
      <div class="message-body">
        <template v-if="message.role === 'assistant'">
          <MarkdownRenderer :content="message.content" />
        </template>
        <template v-else>
          <template v-if="editing">
            <div class="edit-container">
              <el-input
                v-model="editContent"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 8 }"
                @keydown.enter.ctrl="saveEdit"
                @keydown.escape="cancelEdit"
              />
              <div class="edit-actions">
                <el-button size="small" @click="cancelEdit">{{ t('common.cancel') }}</el-button>
                <el-button size="small" type="primary" @click="saveEdit">{{ t('common.save') }}</el-button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="user-text">{{ message.content }}</div>
          </template>
        </template>
      </div>
      <div v-if="message.attachments?.length" class="message-attachments">
        <template v-for="attachment in message.attachments" :key="attachment.id">
          <AudioPlayer
            v-if="attachment.type === 'audio'"
            :src="attachment.url"
            :duration="attachment.duration"
          />
          <MessageImage
            v-else-if="attachment.type === 'image'"
            :src="attachment.url"
            :alt="attachment.name"
          />
        </template>
      </div>
      <div class="message-actions">
        <template v-if="message.role === 'assistant'">
          <button class="action-btn" @click="copyMessage" :aria-label="t('chat.copyMessage') || 'Copy'">
            {{ copied ? '✓' : 'Copy' }}
          </button>
          <button
            v-if="ttsSupported"
            :class="['action-btn', { 'action-btn--active': ttsSpeaking }]"
            :aria-label="ttsSpeaking ? (t('voice.stopVoice') || 'Stop') : (t('voice.playVoice') || 'Play voice')"
            @click="toggleTts"
          >
            {{ ttsSpeaking ? 'Stop' : 'Play' }}
          </button>
          <button class="action-btn" @click="handleRegenerate" :aria-label="t('chat.regenerateMessage') || 'Regenerate'">
            Regenerate
          </button>
        </template>
        <template v-else>
          <button class="action-btn" @click="handleEdit" :aria-label="t('chat.editMessage') || 'Edit'">
            Edit
          </button>
        </template>
        <button
          :class="['action-btn', { 'action-btn--active': bookmarkStore.isBookmarked(message.id) }]"
          @click="handleBookmark"
          :aria-label="bookmarkStore.isBookmarked(message.id) ? t('chat.unbookmarkMessage') : t('chat.bookmarkMessage')"
        >
          {{ bookmarkStore.isBookmarked(message.id) ? t('chat.bookmarked') : t('chat.bookmark') }}
        </button>
        <button class="action-btn" @click="handleRollback" :aria-label="t('chat.rollbackToHere')">
          {{ t('chat.rollbackToHere') }}
        </button>
        <button class="action-btn delete-btn" @click="handleDelete" :aria-label="t('chat.deleteMessage') || 'Delete'">
          Delete
        </button>
        <span class="message-time">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDateTime } from '@client/composables';
import { useTextToSpeech, type VoiceConfig } from '@client/composables/useTextToSpeech';
import { createLogger } from '@client/utils/logger';
import { useBookmarkStore } from '@client/stores/bookmark';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import AudioPlayer from './AudioPlayer.vue';
import MessageImage from './MessageImage.vue';
import type { Message } from '@client/types';

const logger = createLogger('MessageBubble');

interface Props {
  message: Message;
  characterAvatar?: string;
  characterName?: string;
  userAvatar?: string;
  userName?: string;
  editing?: boolean;
  voiceConfig?: VoiceConfig;
  branchInfo?: { currentIndex: number; total: number } | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'edit', messageId: string): void;
  (e: 'regenerate', messageId: string): void;
  (e: 'delete', messageId: string): void;
  (e: 'save-edit', messageId: string, content: string): void;
  (e: 'cancel-edit'): void;
  (e: 'rollback', messageId: string): void;
  (e: 'switchBranch', messageId: number, direction: 'prev' | 'next'): void;
}>();

const { t } = useI18n();
const { formatRelativeTime } = useDateTime();
const bookmarkStore = useBookmarkStore();
const copied = ref(false);
const editContent = ref('');

// For group chats, prefer per-message character info over chat-level props
const displayCharacterName = computed(() => props.message.characterName || props.characterName);
const displayCharacterAvatar = computed(() => props.characterAvatar);

const { isSpeaking: ttsSpeaking, isSupported: ttsSupported, speak: ttsSpeak, stop: ttsStop } = useTextToSpeech();

const toggleTts = () => {
  if (ttsSpeaking.value) {
    ttsStop();
  } else {
    ttsSpeak(props.message.content, props.voiceConfig);
  }
};

watch(() => props.editing, (val) => {
  if (val) {
    editContent.value = props.message.content;
  }
});

const saveEdit = () => {
  if (editContent.value.trim()) {
    emit('save-edit', props.message.id, editContent.value.trim());
  }
};

const cancelEdit = () => {
  emit('cancel-edit');
};

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

const handleRollback = () => {
  emit('rollback', props.message.id);
};

const handleBookmark = () => {
  bookmarkStore.toggleBookmark(props.message.chatId, props.message.id);
};
</script>

<style scoped>
.message {
  padding: 24px 0;
  border-bottom: 1px solid var(--chat-divider);
  animation: fadeIn 0.3s ease-in;
}

.message-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 24px;
}

.message-assistant {
  background: var(--chat-assistant-msg-bg);
}

.message-user {
  background: var(--chat-user-msg-bg);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.message-author {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.emotion-tag {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface-hover);
  padding: 2px 8px;
  border-radius: 12px;
}

.message-body {
  line-height: 1.6;
}

.message-attachments {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-text {
  white-space: pre-wrap;
  color: var(--text-primary);
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message:hover .message-actions {
  opacity: 1;
}

/* Show on focus-within (keyboard navigation) */
.message:focus-within .message-actions {
  opacity: 1;
}

/* On touch devices, always show actions */
@media (hover: none) {
  .message-actions {
    opacity: 1;
  }
}

.action-btn {
  background: none;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.action-btn:hover {
  background: var(--surface-hover);
  color: var(--accent-purple);
}

.action-btn--active {
  background: var(--accent-purple);
  color: #fff;
  border-color: var(--accent-purple);
}

.action-btn--active:hover {
  background: var(--accent-purple);
  color: #fff;
}

.action-btn.delete-btn:hover {
  color: var(--color-danger);
}

.message-time {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.edit-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.branch-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: auto;
}

.branch-count {
  min-width: 30px;
  text-align: center;
  user-select: none;
}

@media (max-width: 768px) {
  .message-inner {
    padding: 0 12px;
  }
  .message-actions {
    gap: 4px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 4px;
  }
  .message-actions::-webkit-scrollbar {
    display: none;
  }
  .message-header {
    gap: 6px;
  }
  .branch-indicator {
    font-size: 11px;
  }
}
</style>
