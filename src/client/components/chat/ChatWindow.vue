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
        <el-button link :icon="More" @click="showMenu" />
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="messages.length === 0" class="empty-state">
        <el-empty description="No messages yet. Start the conversation!" />
      </div>

      <div v-else class="messages-list">
        <MessageBubble
          v-for="message in messages"
          :key="message.id"
          :message="message"
        />

        <!-- Streaming message -->
        <div v-if="isStreaming" class="message-bubble message-assistant streaming">
          <div class="message-content">
            <div class="markdown-content" v-html="renderedStreamingContent"></div>
            <span class="typing-cursor">|</span>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-else-if="sending && !isStreaming" class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>

      <div ref="messagesEnd"></div>
    </div>

    <div class="chat-input-container">
      <MessageInput
        :disabled="!currentChat"
        :sending="sending"
        @send="handleSendMessage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { More } from '@element-plus/icons-vue';
import { marked } from 'marked';
import { useChatStore } from '@client/stores/chat';
import MessageBubble from './MessageBubble.vue';
import MessageInput from './MessageInput.vue';
import type { Chat } from '@client/types';

interface Props {
  currentChat: Chat | null;
}

const props = defineProps<Props>();

const chatStore = useChatStore();
const messagesContainer = ref<HTMLElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);

const messages = computed(() => chatStore.messages);
const loading = computed(() => chatStore.loading);
const sending = computed(() => chatStore.sending);
const wsConnected = computed(() => chatStore.wsConnected);
const isStreaming = computed(() => chatStore.isStreaming);
const streamingMessage = computed(() => chatStore.streamingMessage);

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedStreamingContent = computed(() => {
  return marked.parse(streamingMessage.value);
});

const scrollToBottom = (smooth = true) => {
  nextTick(() => {
    if (messagesEnd.value) {
      messagesEnd.value.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  });
};

const handleSendMessage = async (content: string) => {
  try {
    await chatStore.sendMessage(content);
    scrollToBottom();
  } catch (error) {
    console.error('Failed to send message:', error);
  }
};

const showMenu = () => {
  // TODO: Implement chat menu (delete, rename, etc.)
  console.log('Show chat menu');
};

// Watch for new messages and scroll to bottom
watch(messages, () => {
  scrollToBottom();
}, { deep: true });

// Watch for streaming updates
watch(streamingMessage, () => {
  scrollToBottom();
});

// Scroll to bottom when chat changes
watch(() => props.currentChat, () => {
  scrollToBottom(false);
});

// Auto-scroll on mount
onMounted(() => {
  scrollToBottom(false);
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
});
</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--el-bg-color);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color);
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
  color: var(--el-text-color-primary);
}

.chat-subtitle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
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

.messages-list {
  display: flex;
  flex-direction: column;
}

.streaming {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
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

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background-color: var(--el-fill-color-light);
  border-radius: 12px;
  width: fit-content;
  margin-bottom: 16px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background-color: var(--el-text-color-secondary);
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
  background: var(--el-fill-color-lighter);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--el-fill-color-dark);
  border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary);
}
</style>
