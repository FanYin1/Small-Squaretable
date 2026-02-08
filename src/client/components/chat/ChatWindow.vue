<template>
  <div class="chat-window">
    <div class="chat-header" v-if="currentChat">
      <div class="chat-info">
        <el-avatar :size="40" :src="currentChat.characterAvatar">
          {{ currentChat.characterName[0] }}
        </el-avatar>
        <div class="chat-details">
          <h3 class="chat-title">{{ currentChat.title || currentChat.characterName }}</h3>
          <span class="chat-subtitle">{{ currentChat.characterName }}</span>
        </div>
      </div>
      <div class="chat-actions">
        <el-tooltip :content="t('chat.intelligence')" placement="bottom">
          <el-badge :value="intelligenceStore.debugEventCount" :hidden="intelligenceStore.debugEventCount === 0" :max="99">
            <el-button
              :type="showIntelligenceDrawer ? 'primary' : 'default'"
              :icon="DataAnalysis"
              circle
              size="small"
              @click="toggleIntelligenceDrawer"
            />
          </el-badge>
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleMenuCommand">
          <el-button link :icon="More" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">{{ t('chat.renameTitle') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('chat.deleteTitle') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer" @scroll="handleScroll" aria-live="polite"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Pull-to-refresh indicator -->
      <div class="pull-refresh-indicator" :class="{ active: pullRefreshState === 'ready', pulling: pullRefreshState === 'pulling', refreshing: pullRefreshState === 'refreshing' }" :style="{ transform: `translateY(${pullDistance}px)`, opacity: pullDistance > 0 ? 1 : 0 }">
        <div v-if="pullRefreshState === 'refreshing'" class="pull-refresh-spinner">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-else class="pull-refresh-arrow" :style="{ transform: pullRefreshState === 'ready' ? 'rotate(180deg)' : 'rotate(0deg)' }">
          &#8595;
        </div>
        <span class="pull-refresh-text">{{ pullRefreshText }}</span>
      </div>

      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="messages.length === 0 && currentGreeting" class="greeting-container">
        <div class="message-bubble message-assistant">
          <div class="message-content">
            <div class="markdown-content" v-html="renderedGreeting"></div>
          </div>
        </div>
        <div v-if="hasAlternateGreetings" class="greeting-swipe">
          <button class="swipe-btn" :aria-label="t('chat.previousGreeting') || 'Previous greeting'" @click="prevGreeting" :disabled="greetingIndex <= 0">
            <span>&lt;</span>
          </button>
          <span class="swipe-indicator">{{ greetingIndex + 1 }} / {{ totalGreetings }}</span>
          <button class="swipe-btn" :aria-label="t('chat.nextGreeting') || 'Next greeting'" @click="nextGreeting" :disabled="greetingIndex >= totalGreetings - 1">
            <span>&gt;</span>
          </button>
        </div>
      </div>

      <div v-else-if="messages.length === 0" class="empty-state">
        <el-empty :description="t('chat.noMessages')" />
      </div>

      <div v-else class="messages-list">
        <template v-for="(message, index) in messages" :key="message.id">
          <DateDivider
            v-if="shouldShowDateDivider(index)"
            :label="getDateLabel(message.createdAt)"
          />
          <MessageBubble
            :message="message"
            :character-avatar="currentChat?.characterAvatar"
            :character-name="currentChat?.characterName"
            :user-avatar="userStore.user?.avatar"
            :user-name="userStore.user?.name"
            :editing="editingMessageId === message.id"
            @delete="handleDeleteMessage"
            @edit="handleEditMessage"
            @regenerate="handleRegenerateMessage"
            @save-edit="handleSaveEdit"
            @cancel-edit="handleCancelEdit"
          />
        </template>

        <!-- Streaming message -->
        <div v-if="isStreaming" class="message-bubble message-assistant streaming">
          <div class="message-content">
            <div class="markdown-content" v-html="renderedStreamingContent"></div>
            <span class="typing-cursor">|</span>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-else-if="sending && !isStreaming" class="typing-indicator" aria-live="assertive">
          <span class="typing-text">{{ t('chat.typing', { name: currentChat?.characterName || '' }) }}</span>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>

      <div ref="messagesEnd"></div>

      <ScrollToBottom
        :visible="showScrollButton"
        @click="scrollToBottom(true)"
      />
    </div>

    <div class="chat-input-container">
      <MessageInput
        :disabled="!currentChat"
        :sending="sending"
        @send="handleSendMessage"
      />
    </div>

    <!-- Intelligence Drawer -->
    <el-drawer
      v-model="showIntelligenceDrawer"
      :title="t('chat.intelligence')"
      direction="rtl"
      size="360px"
      :append-to-body="false"
      :modal="false"
      class="intelligence-drawer"
    >
      <el-tabs v-model="activeIntelligenceTab">
        <el-tab-pane :label="t('chat.emotion')" name="emotion">
          <EmotionIndicator />
        </el-tab-pane>
        <el-tab-pane :label="t('chat.memory')" name="memory">
          <MemoryPanel v-if="currentChat?.characterId" :character-id="currentChat.characterId" :chat-id="currentChat.id" />
        </el-tab-pane>
        <el-tab-pane :label="t('chat.debug')" name="debug">
          <IntelligenceDebugPanel :chat-id="currentChat?.id" :character-id="currentChat?.characterId" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { More, DataAnalysis, Loading } from '@element-plus/icons-vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { useDateTime } from '@client/composables';
import MessageBubble from './MessageBubble.vue';
import MessageInput from './MessageInput.vue';
import ScrollToBottom from './ScrollToBottom.vue';
import DateDivider from './DateDivider.vue';
import EmotionIndicator from '@client/components/EmotionIndicator.vue';
import MemoryPanel from '@client/components/MemoryPanel.vue';
import IntelligenceDebugPanel from '@client/components/debug/IntelligenceDebugPanel.vue';
import { createLogger } from '@client/utils/logger';
import type { Chat, MessageAttachment } from '@client/types';

const logger = createLogger('ChatWindow');

interface Props {
  currentChat: Chat | null;
}

const props = defineProps<Props>();

const { t } = useI18n();
const chatStore = useChatStore();
const userStore = useUserStore();
const intelligenceStore = useCharacterIntelligenceStore();
const messagesContainer = ref<HTMLElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);

const { formatRelativeTime } = useDateTime();
const showScrollButton = ref(false);
const editingMessageId = ref<string | null>(null);

const handleScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  showScrollButton.value = scrollHeight - scrollTop - clientHeight > 200;
};

// Intelligence drawer state
const showIntelligenceDrawer = ref(false);
const activeIntelligenceTab = ref('emotion');

const messages = computed(() => chatStore.messages);
const loading = computed(() => chatStore.loading);
const sending = computed(() => chatStore.sending);
const isStreaming = computed(() => chatStore.isStreaming);
const streamingMessage = computed(() => chatStore.streamingMessage);

// Greeting swipe state
const greetingIndex = ref(0);

const allGreetings = computed<string[]>(() => {
  const character = chatStore.currentCharacter;
  if (!character) return [];
  const cardData = character.cardData || {};
  const greetings: string[] = [];
  if (cardData.first_mes) {
    greetings.push(cardData.first_mes);
  }
  if (cardData.alternate_greetings && Array.isArray(cardData.alternate_greetings)) {
    greetings.push(...cardData.alternate_greetings);
  }
  return greetings;
});

const totalGreetings = computed(() => allGreetings.value.length);

const hasAlternateGreetings = computed(() => totalGreetings.value > 1);

const currentGreeting = computed(() => {
  if (allGreetings.value.length === 0) return '';
  const idx = Math.min(greetingIndex.value, allGreetings.value.length - 1);
  return allGreetings.value[idx] || '';
});

const renderedGreeting = computed(() => {
  if (!currentGreeting.value) return '';
  return DOMPurify.sanitize(marked.parse(currentGreeting.value) as string);
});

const prevGreeting = () => {
  if (greetingIndex.value > 0) {
    greetingIndex.value--;
  }
};

const nextGreeting = () => {
  if (greetingIndex.value < totalGreetings.value - 1) {
    greetingIndex.value++;
  }
};

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedStreamingContent = computed(() => {
  return DOMPurify.sanitize(marked.parse(streamingMessage.value) as string);
});

const getDateLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('time.today');
  if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
  return date.toLocaleDateString();
};

const shouldShowDateDivider = (index: number): boolean => {
  if (index === 0) return true;
  const current = new Date(messages.value[index].createdAt);
  const previous = new Date(messages.value[index - 1].createdAt);
  return current.toDateString() !== previous.toDateString();
};

const scrollToBottom = (smooth = true) => {
  nextTick(() => {
    if (messagesContainer.value) {
      const container = messagesContainer.value;
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  });
};

const handleSendMessage = async (content: string, attachments?: MessageAttachment[]) => {
  try {
    await chatStore.sendMessage(content, attachments);
    scrollToBottom();
  } catch (error: unknown) {
    logger.error('Failed to send message', error);
  }
};

const handleMenuCommand = async (command: string) => {
  if (!props.currentChat) return;
  if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt(t('chat.renamePrompt'), t('chat.renameTitle'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputValue: props.currentChat.title || props.currentChat.characterName,
      });
      if (value?.trim()) {
        await chatStore.renameChat(props.currentChat.id, value.trim());
      }
    } catch { /* cancelled */ }
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteTitle'), {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      });
      await chatStore.deleteChat(props.currentChat.id);
    } catch { /* cancelled */ }
  }
};

const handleDeleteMessage = async (messageId: string) => {
  try {
    await ElMessageBox.confirm(
      t('chat.deleteMessageConfirm'),
      t('chat.deleteMessage'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await chatStore.deleteMessage(messageId);
  } catch { /* cancelled */ }
};

// Edit message handlers
const handleEditMessage = (messageId: string) => {
  editingMessageId.value = messageId;
};

const handleSaveEdit = async (messageId: string, content: string) => {
  try {
    await chatStore.editMessage(messageId, content);
    editingMessageId.value = null;
  } catch (error: unknown) {
    logger.error('Failed to edit message', error);
  }
};

const handleCancelEdit = () => {
  editingMessageId.value = null;
};

const handleRegenerateMessage = (_messageId: string) => {
  // TODO: Task 3
};

const toggleIntelligenceDrawer = () => {
  showIntelligenceDrawer.value = !showIntelligenceDrawer.value;
  if (showIntelligenceDrawer.value) {
    intelligenceStore.resetDebugEventCount();
  }
};

// Watch for chat changes to fetch intelligence data
watch(() => props.currentChat, async (newChat, oldChat) => {
  // Reset greeting index when switching chats
  greetingIndex.value = 0;

  if (newChat && newChat.characterId) {
    // Fetch memories and emotion for the new chat session
    try {
      await intelligenceStore.fetchMemories(newChat.characterId, newChat.id);
      await intelligenceStore.fetchEmotion(newChat.characterId, newChat.id);
    } catch (error) {
      logger.error('Failed to fetch intelligence data', error);
    }
  }
  // Scroll to bottom when chat changes
  scrollToBottom(false);
}, { immediate: true });

// Watch for new messages and scroll to bottom
watch(messages, () => {
  scrollToBottom();
}, { deep: true });

// Watch for streaming updates
watch(streamingMessage, () => {
  scrollToBottom();
});

// Pull-to-refresh state
const pullRefreshState = ref<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle');
const pullDistance = ref(0);
const PULL_THRESHOLD = 60;
let touchStartY = 0;
let touchStartScrollTop = 0;

const pullRefreshText = computed(() => {
  switch (pullRefreshState.value) {
    case 'pulling': return t('common.loading');
    case 'ready': return t('common.refresh');
    case 'refreshing': return t('common.loading');
    default: return '';
  }
});

const handleTouchStart = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  touchStartY = e.touches[0].clientY;
  touchStartScrollTop = messagesContainer.value.scrollTop;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  if (pullRefreshState.value === 'refreshing') return;

  const touchY = e.touches[0].clientY;
  const diff = touchY - touchStartY;

  // Only activate pull-to-refresh when scrolled to top
  if (touchStartScrollTop <= 0 && diff > 0) {
    // Apply resistance factor for natural feel
    const distance = Math.min(diff * 0.4, 120);
    pullDistance.value = distance;

    if (distance >= PULL_THRESHOLD) {
      pullRefreshState.value = 'ready';
    } else if (distance > 0) {
      pullRefreshState.value = 'pulling';
    }
  }
};

const handleTouchEnd = async () => {
  if (pullRefreshState.value === 'refreshing') return;

  if (pullRefreshState.value === 'ready') {
    pullRefreshState.value = 'refreshing';
    pullDistance.value = PULL_THRESHOLD;

    try {
      // Load older messages
      if (props.currentChat) {
        await chatStore.loadMessages(props.currentChat.id);
        logger.info('Pull-to-refresh: loaded messages');
      }
    } catch (error: unknown) {
      logger.error('Pull-to-refresh failed', error);
    } finally {
      pullRefreshState.value = 'idle';
      pullDistance.value = 0;
    }
  } else {
    pullRefreshState.value = 'idle';
    pullDistance.value = 0;
  }
};

// Auto-scroll on mount
onMounted(() => {
  scrollToBottom(false);
  messagesContainer.value?.addEventListener('scroll', handleScroll);
});

// Handle scroll on window resize
const handleResize = () => {
  scrollToBottom(false);
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  messagesContainer.value?.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--surface-card);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-default);
  background-color: var(--surface-card);
  flex-shrink: 0;
}

.chat-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-details {
  display: flex;
  flex-direction: column;
}

.chat-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.loading-container {
  padding: 24px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.greeting-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 16px;
}

.greeting-container .message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  max-width: 80%;
  animation: fadeIn 0.3s ease-in;
}

.greeting-container .message-assistant {
  align-self: flex-start;
}

.greeting-container .message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.greeting-container .markdown-content {
  line-height: 1.6;
}

.greeting-container .markdown-content :deep(p) {
  margin: 0 0 8px 0;
}

.greeting-container .markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.greeting-swipe {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.swipe-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-primary);
  transition: background-color 0.2s, border-color 0.2s;
}

.swipe-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.swipe-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.swipe-indicator {
  font-size: 12px;
  color: var(--text-secondary);
}

.messages-list {
  display: flex;
  flex-direction: column;
}

.streaming {
  animation: pulse 1.5s ease-in-out infinite;
}

.streaming .message-content {
  position: relative;
}

.typing-cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s step-end infinite;
  font-weight: bold;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background-color: var(--bg-surface);
  border-radius: 12px;
  width: fit-content;
  margin-bottom: 16px;
}

.typing-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-right: 8px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background-color: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  30% {
    transform: translateY(-10px);
    opacity: 1;
  }
}

.chat-input-container {
  flex-shrink: 0;
}

/* Scrollbar styling */
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  background: var(--border-subtle);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--surface-active);
  border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Pull-to-refresh styles */
.pull-refresh-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 0;
  overflow: visible;
  transition: opacity var(--duration-fast) var(--ease-out);
  pointer-events: none;
  flex-shrink: 0;
}

.pull-refresh-indicator.refreshing {
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-arrow {
  font-size: 18px;
  color: var(--text-secondary);
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-spinner {
  font-size: 18px;
  color: var(--accent-purple);
}

.pull-refresh-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
