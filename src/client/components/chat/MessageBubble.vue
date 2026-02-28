<template>
  <div :class="['message', `message-${message.role}`]">
    <div class="message-row">
      <!-- Assistant avatar (left side) -->
      <div v-if="message.role === 'assistant'" class="avatar-col">
        <el-avatar :size="40" :src="displayCharacterAvatar" class="char-avatar">
          {{ displayCharacterName?.[0]?.toUpperCase() || '?' }}
        </el-avatar>
      </div>

      <div class="bubble-col">
        <div v-if="message.extra?.pinned" class="pin-indicator">{{ t('chat.pinnedMessage', 'Pinned') }}</div>

        <!-- Assistant name + emotion above bubble -->
        <div v-if="message.role === 'assistant'" class="bubble-meta">
          <span class="message-author">{{ displayCharacterName }}</span>
          <span v-if="(message as any).emotion" class="emotion-tag">{{ (message as any).emotion }}</span>
          <div v-if="branchInfo && branchInfo.total > 1" class="branch-indicator">
            <el-button :icon="ArrowLeft" size="small" text :disabled="branchInfo.currentIndex === 0" @click="emit('switchBranch', Number(message.id), 'prev')" />
            <span class="branch-count">{{ branchInfo.currentIndex + 1 }}/{{ branchInfo.total }}</span>
            <el-button :icon="ArrowRight" size="small" text :disabled="branchInfo.currentIndex === branchInfo.total - 1" @click="emit('switchBranch', Number(message.id), 'next')" />
          </div>
        </div>

        <!-- User branch nav -->
        <div v-if="message.role === 'user' && branchInfo && branchInfo.total > 1" class="bubble-meta bubble-meta--right">
          <div class="branch-indicator">
            <el-button :icon="ArrowLeft" size="small" text :disabled="branchInfo.currentIndex === 0" @click="emit('switchBranch', Number(message.id), 'prev')" />
            <span class="branch-count">{{ branchInfo.currentIndex + 1 }}/{{ branchInfo.total }}</span>
            <el-button :icon="ArrowRight" size="small" text :disabled="branchInfo.currentIndex === branchInfo.total - 1" @click="emit('switchBranch', Number(message.id), 'next')" />
          </div>
        </div>

        <div v-if="message.extra?.replyTo" class="reply-quote">
          <div class="reply-quote-role">{{ message.extra.replyTo.role }}</div>
          <div class="reply-quote-content">{{ message.extra.replyTo.content?.substring(0, 100) }}{{ (message.extra.replyTo.content?.length ?? 0) > 100 ? '...' : '' }}</div>
        </div>

        <div class="bubble">
          <div class="message-body">
            <template v-if="message.role === 'assistant'">
              <MarkdownRenderer :content="message.content" />
            </template>
            <template v-else>
              <template v-if="editing">
                <div class="edit-container">
                  <el-input v-model="editContent" type="textarea" :autosize="{ minRows: 1, maxRows: 8 }" @keydown.enter.ctrl="saveEdit" @keydown.escape="cancelEdit" />
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
              <AudioPlayer v-if="attachment.type === 'audio'" :src="attachment.url" :duration="attachment.duration" />
              <MessageImage v-else-if="attachment.type === 'image'" :src="attachment.url" :alt="attachment.name" />
            </template>
          </div>
        </div>

        <!-- Reactions + actions below bubble -->
        <div class="bubble-footer">
          <div v-if="reactions.length" class="reaction-bar">
            <span v-for="reaction in reactions" :key="reaction.emoji" class="reaction-badge" @click="toggleReaction(reaction.emoji)">
              {{ reaction.emoji }} {{ reaction.count }}
            </span>
          </div>
          <div class="message-actions">
            <span class="message-time">{{ formattedTime }}</span>
            <template v-if="message.role === 'assistant'">
              <button class="action-btn" @click="copyMessage" :aria-label="t('chat.copyMessage') || 'Copy'">{{ copied ? '✓' : '⎘' }}</button>
              <button v-if="ttsSupported" :class="['action-btn', { 'action-btn--active': ttsSpeaking }]" @click="toggleTts" :aria-label="ttsSpeaking ? 'Stop' : 'Play'">{{ ttsSpeaking ? '◼' : '▶' }}</button>
              <button class="action-btn" @click="handleRegenerate" :aria-label="t('chat.regenerateMessage') || 'Regenerate'">↻</button>
            </template>
            <template v-else>
              <button class="action-btn" @click="handleEdit" :aria-label="t('chat.editMessage') || 'Edit'">✎</button>
            </template>
            <button :class="['action-btn', { 'action-btn--active': bookmarkStore.isBookmarked(message.id) }]" @click="handleBookmark" :aria-label="bookmarkStore.isBookmarked(message.id) ? t('chat.bookmarked') : t('chat.bookmark')">🔖</button>
            <el-popover placement="top" :width="160" trigger="click">
              <template #reference>
                <button class="action-btn action-more" aria-label="More">⋯</button>
              </template>
              <div class="more-menu">
                <button class="more-menu-item" @click="handleBookmark">
                  {{ bookmarkStore.isBookmarked(message.id) ? t('chat.bookmarked') : t('chat.bookmark') }}
                </button>
                <button class="more-menu-item" @click="handleReply">{{ t('chat.reply') }}</button>
                <button class="more-menu-item" @click="handleTogglePin">
                  {{ message.extra?.pinned ? t('chat.unpin') : t('chat.pin') }}
                </button>
                <button class="more-menu-item" @click="handleRollback">{{ t('chat.rollbackToHere') }}</button>
                <el-popover :visible="showEmojiPicker" placement="top" :width="200" trigger="click">
                  <template #reference>
                    <button class="more-menu-item" @click="showEmojiPicker = !showEmojiPicker">{{ t('chat.addReaction', 'React') }}</button>
                  </template>
                  <div class="emoji-picker">
                    <span v-for="emoji in EMOJI_PRESETS" :key="emoji" class="emoji-option" @click="toggleReaction(emoji)">{{ emoji }}</span>
                  </div>
                </el-popover>
                <button class="more-menu-item more-menu-item--danger" @click="handleDelete">{{ t('chat.deleteMessage') || 'Delete' }}</button>
              </div>
            </el-popover>
          </div>
        </div>
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
import { ArrowLeft, ArrowRight, ChatLineSquare } from '@element-plus/icons-vue';
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
  (e: 'toggleReaction', payload: { messageId: string; emoji: string }): void;
  (e: 'reply', payload: { id: string; content: string; role: string }): void;
  (e: 'togglePin', payload: { messageId: string; isPinned: boolean }): void;
}>();

const { t } = useI18n();
const { formatRelativeTime } = useDateTime();
const bookmarkStore = useBookmarkStore();
const copied = ref(false);
const editContent = ref('');

const EMOJI_PRESETS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

const reactions = ref<ReactionGroup[]>([]);
const showEmojiPicker = ref(false);

function toggleReaction(emoji: string) {
  emit('toggleReaction', { messageId: props.message.id, emoji });
  showEmojiPicker.value = false;
}

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

const handleReply = () => {
  emit('reply', { id: props.message.id, content: props.message.content, role: props.message.role });
};

const handleTogglePin = () => {
  emit('togglePin', { messageId: props.message.id, isPinned: !!props.message.extra?.pinned });
};
</script>

<style scoped>
.message {
  padding: 6px 0;
  animation: fadeIn 0.25s ease-out;
}

.message + .message {
  padding-top: 2px;
}

.message-row {
  display: flex;
  gap: 10px;
  max-width: 720px;
  padding: 0 20px;
}

/* User messages: right-aligned, narrower */
.message-user .message-row {
  margin-left: auto;
  margin-right: 0;
  flex-direction: row-reverse;
  max-width: 65%;
}

/* Assistant messages: left-aligned */
.message-assistant .message-row {
  margin-left: 0;
  margin-right: auto;
}

.avatar-col {
  flex-shrink: 0;
  padding-top: 22px;
}

.char-avatar {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.bubble-col {
  min-width: 0;
  max-width: 100%;
}

/* Meta line above bubble */
.bubble-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 0 4px;
}

.bubble-meta--right {
  justify-content: flex-end;
}

.message-author {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.emotion-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  padding: 2px 8px;
  border-radius: 10px;
}

.pin-indicator {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-light);
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  display: inline-block;
}

/* Bubble shape */
.bubble {
  padding: 10px 14px;
  border-radius: 18px;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text-primary);
  word-break: break-word;
}

.message-assistant .bubble {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 18px 18px 18px 4px;
}

.message-user .bubble {
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: 18px 18px 4px 18px;
  display: inline-block;
}

.message-user .bubble-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.message-user .user-text {
  white-space: pre-wrap;
  color: inherit;
}

.message-body {
  line-height: 1.6;
}

/* Reply quote */
.reply-quote {
  padding: 6px 10px;
  margin-bottom: 4px;
  border-left: 2px solid var(--accent);
  background: var(--bg-subtle);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
}

.reply-quote-role {
  font-weight: 600;
  color: var(--accent);
  font-size: 11px;
  text-transform: capitalize;
}

.reply-quote-content {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-attachments {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Footer: reactions + actions */
.bubble-footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

.reaction-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.reaction-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 0.15s;
}

.reaction-badge:hover {
  background: var(--accent-light);
  border-color: var(--accent);
}

/* Action bar */
.message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.message:hover .message-actions,
.message:focus-within .message-actions {
  opacity: 1;
}

@media (hover: none) {
  .message-actions { opacity: 1; }
}

@media (hover: none) and (pointer: coarse) {
  .action-btn {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }
}

.message-time {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}

.action-btn {
  background: transparent;
  border: none;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.action-btn--active {
  color: var(--accent);
}

.action-more {
  font-size: 16px;
  letter-spacing: 1px;
}

/* More menu dropdown */
.more-menu {
  display: flex;
  flex-direction: column;
}

.more-menu-item {
  background: none;
  border: none;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  border-radius: 6px;
  transition: background 0.1s;
}

.more-menu-item:hover {
  background: var(--surface-hover);
}

.more-menu-item--danger {
  color: var(--color-danger, #ef4444);
}

.more-menu-item--danger:hover {
  background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
}

/* Edit container */
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

/* Branch indicator */
.branch-indicator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  padding: 2px 4px;
  border-radius: 6px;
  margin-left: auto;
}

.branch-count {
  min-width: 28px;
  text-align: center;
  user-select: none;
  font-variant-numeric: tabular-nums;
}

/* Emoji picker */
.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.emoji-option {
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.15s;
}

.emoji-option:hover {
  background: var(--bg-subtle);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .message-row {
    max-width: 90%;
    padding: 0 12px;
  }
  .bubble {
    font-size: 14px;
    padding: 8px 12px;
  }
  .avatar-col { padding-top: 18px; }
  .message-actions {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .message-actions::-webkit-scrollbar { display: none; }
}
</style>
