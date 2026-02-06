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
        <div class="chat-intelligence-toggles">
          <el-tooltip content="情感状态" placement="bottom">
            <el-button
              :type="showEmotionPanel ? 'primary' : 'default'"
              :icon="Sunny"
              circle
              size="small"
              @click="showEmotionPanel = !showEmotionPanel"
            />
          </el-tooltip>
          <el-tooltip content="角色记忆" placement="bottom">
            <el-button
              :type="showMemoryPanel ? 'primary' : 'default'"
              :icon="Collection"
              circle
              size="small"
              @click="showMemoryPanel = !showMemoryPanel"
            />
          </el-tooltip>
          <el-tooltip content="智能系统调试" placement="bottom">
            <el-badge :value="intelligenceStore.debugEventCount" :hidden="intelligenceStore.debugEventCount === 0" :max="99">
              <el-button
                :type="showDebugPanel ? 'primary' : 'default'"
                :icon="DataAnalysis"
                circle
                size="small"
                @click="toggleDebugPanel"
              />
            </el-badge>
          </el-tooltip>
        </div>
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

    <!-- Intelligence Panels -->
    <Transition name="slide">
      <div v-if="showEmotionPanel" class="chat-emotion-panel">
        <EmotionIndicator />
      </div>
    </Transition>

    <Transition name="slide">
      <div v-if="showMemoryPanel && currentChat?.characterId" class="chat-memory-panel">
        <MemoryPanel
          :character-id="currentChat.characterId"
          :chat-id="currentChat.id"
        />
      </div>
    </Transition>

    <!-- Intelligence Debug Panel -->
    <Transition name="slide-up">
      <div v-if="showDebugPanel" class="chat-debug-panel">
        <IntelligenceDebugPanel
          :chat-id="currentChat?.id"
          :character-id="currentChat?.characterId"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { More, Sunny, Collection, DataAnalysis } from '@element-plus/icons-vue';
import { marked } from 'marked';
import { useChatStore } from '@client/stores/chat';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import MessageBubble from './MessageBubble.vue';
import MessageInput from './MessageInput.vue';
import EmotionIndicator from '@client/components/EmotionIndicator.vue';
import MemoryPanel from '@client/components/MemoryPanel.vue';
import IntelligenceDebugPanel from '@client/components/debug/IntelligenceDebugPanel.vue';
import type { Chat } from '@client/types';

interface Props {
  currentChat: Chat | null;
}

const props = defineProps<Props>();

const chatStore = useChatStore();
const intelligenceStore = useCharacterIntelligenceStore();
const messagesContainer = ref<HTMLElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);

// Panel visibility state
const showEmotionPanel = ref(false);
const showMemoryPanel = ref(false);
const showDebugPanel = ref(false);

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

const toggleDebugPanel = () => {
  showDebugPanel.value = !showDebugPanel.value;
  if (showDebugPanel.value) {
    intelligenceStore.resetDebugEventCount();
  }
};

// Watch for chat changes to fetch intelligence data
watch(() => props.currentChat, async (newChat, oldChat) => {
  if (newChat && newChat.characterId) {
    // Fetch memories and emotion for the new chat session
    try {
      await intelligenceStore.fetchMemories(newChat.characterId, newChat.id);
      await intelligenceStore.fetchEmotion(newChat.characterId, newChat.id);
    } catch (error) {
      console.error('Failed to fetch intelligence data:', error);
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

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-intelligence-toggles {
  display: flex;
  gap: 4px;
}

/* Intelligence Panels */
.chat-emotion-panel,
.chat-memory-panel {
  position: absolute;
  right: 16px;
  top: 70px;
  z-index: 100;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.chat-emotion-panel {
  width: 200px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.chat-memory-panel {
  top: 70px;
  width: 300px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.chat-debug-panel {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: calc(100% - 32px);
  max-width: 800px;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
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
