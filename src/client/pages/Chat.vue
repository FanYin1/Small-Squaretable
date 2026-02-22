<template>
  <ChatLayout @new-chat="handleNewChat" @select-chat="handleSelectChat">
    <WelcomePage
      v-if="!currentChatId"
      @select-character="handleSelectCharacter"
      @select-characters="handleSelectCharacters"
    />
    <ChatWindow
      v-else
      :current-chat="currentChat"
    />
  </ChatLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import ChatLayout from '@client/components/layout/ChatLayout.vue';
import ChatWindow from '@client/components/chat/ChatWindow.vue';
import WelcomePage from '@client/components/chat/WelcomePage.vue';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('Chat');
const route = useRoute();
const chatStore = useChatStore();
const userStore = useUserStore();

const currentChat = computed(() => chatStore.currentChat);
const currentChatId = computed(() => chatStore.currentChatId);

const handleNewChat = () => {
  chatStore.setCurrentChat(null);
};

const handleSelectChat = async (chatId: string) => {
  try {
    await chatStore.setCurrentChat(chatId);
    localStorage.setItem('lastChatId', chatId);
  } catch (error) {
    logger.error('Failed to select chat:', error);
  }
};

const handleSelectCharacter = async (characterId: string) => {
  try {
    const chat = await chatStore.createChat(characterId);
    await chatStore.setCurrentChat(chat.id);
    localStorage.setItem('lastChatId', chat.id);
  } catch (error) {
    logger.error('Failed to create chat:', error);
  }
};

const handleSelectCharacters = async (characterIds: string[]) => {
  try {
    const firstId = characterIds[0];
    const chat = await chatStore.createChat(firstId, undefined, characterIds);
    await chatStore.setCurrentChat(chat.id);
    localStorage.setItem('lastChatId', chat.id);
  } catch (error) {
    logger.error('Failed to create group chat:', error);
  }
};

onMounted(async () => {
  // Initialize WebSocket
  const token = userStore.token;
  if (token) {
    logger.info('Initializing WebSocket');
    chatStore.initWebSocket(token);
  } else {
    logger.warn('No token available, WebSocket not initialized');
  }

  // Load chats
  try {
    await chatStore.fetchChats();

    // Restore last selected chat from localStorage
    const lastChatId = localStorage.getItem('lastChatId');
    if (lastChatId && chatStore.chats.some(c => c.id === lastChatId)) {
      await chatStore.setCurrentChat(lastChatId);
    }
  } catch (error) {
    logger.error('Failed to initialize chat page:', error);
  }

  // If URL has characterId query param, auto-create a chat
  const characterId = route.query.characterId as string;
  if (characterId) {
    logger.info('Auto-creating chat for character from URL:', characterId);
    await handleSelectCharacter(characterId);
  }
});

// Watch for route query changes (e.g. navigating from marketplace)
watch(() => route.query.characterId, async (characterId) => {
  if (characterId && typeof characterId === 'string') {
    logger.info('Character ID from URL:', characterId);
    await handleSelectCharacter(characterId);
  }
});

onUnmounted(() => {
  chatStore.disconnectWebSocket();
});
</script>

<style scoped>
/* Chat page content fills the ChatLayout main area */
</style>
