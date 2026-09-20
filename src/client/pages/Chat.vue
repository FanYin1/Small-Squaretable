<template>
  <ChatLayout @new-chat="handleNewChat" @select-chat="handleSelectChat">
    <WelcomePage
      v-if="!currentChatId"
      v-loading="creatingChat"
      @select-character="handleSelectCharacter"
      @select-characters="handleSelectCharacters"
    />
    <ChatWindow
      v-else
      :current-chat="currentChat"
    />
    <PersonaSelector
      v-model="showPersonaSelector"
      @confirm="handlePersonaSelected"
    />
  </ChatLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import ChatLayout from '@client/components/layout/ChatLayout.vue';
import ChatWindow from '@client/components/chat/ChatWindow.vue';
import WelcomePage from '@client/components/chat/WelcomePage.vue';
import PersonaSelector from '@client/components/chat/PersonaSelector.vue';
import { userPersonaApi } from '@client/services/user-persona.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('Chat');
const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();

const currentChat = computed(() => chatStore.currentChat);
const currentChatId = computed(() => chatStore.currentChatId);
const creatingChat = ref(false);
const showPersonaSelector = ref(false);
const pendingCharacterId = ref<string | null>(null);
const pendingCharacterIds = ref<string[] | null>(null);

const handleNewChat = () => {
  chatStore.setCurrentChat(null);
};

const handleSelectChat = async (chatId: string) => {
  try {
    await chatStore.setCurrentChat(chatId);
    localStorage.setItem('lastChatId', chatId);
  } catch (error) {
    logger.error('Failed to select chat:', error);
    toast.error(t('chat.selectError'));
  }
};

/**
 * personaId 在 schema 和 createChatSchema 里都是 optional，所以选人设不能
 * 成为开聊的前置条件：只有「确实存在多个人设、且没有默认人设」时才值得打断
 * 用户。没有人设的新账号如果被弹窗拦住，只能去创建人设才能开始第一次对话。
 *
 * 返回 undefined 表示这次不带 personaId（服务端会存 null），
 * 返回 null 表示已经交给弹窗处理，调用方不要继续。
 */
const resolvePersonaId = async (): Promise<string | undefined | null> => {
  try {
    const personas = await userPersonaApi.list();
    if (personas.length === 0) return undefined;
    const preferred = personas.find((p) => p.isDefault);
    if (preferred) return preferred.id;
    if (personas.length === 1) return personas[0].id;
    showPersonaSelector.value = true;
    return null;
  } catch (error) {
    // 人设列表拉不到不该阻断开聊，退化成不带 personaId
    logger.error('Failed to load personas, creating chat without one:', error);
    return undefined;
  }
};

const startChat = async (personaId?: string) => {
  creatingChat.value = true;
  try {
    let chat;
    if (pendingCharacterIds.value) {
      // Group chat
      const firstId = pendingCharacterIds.value[0];
      chat = await chatStore.createChat(firstId, undefined, pendingCharacterIds.value, personaId);
    } else if (pendingCharacterId.value) {
      // Single chat
      chat = await chatStore.createChat(pendingCharacterId.value, undefined, undefined, personaId);
    } else {
      throw new Error('No character selected');
    }
    await chatStore.setCurrentChat(chat.id);
    localStorage.setItem('lastChatId', chat.id);
  } catch (error) {
    logger.error('Failed to create chat:', error);
    toast.error(t('chat.createError'));
  } finally {
    creatingChat.value = false;
    pendingCharacterId.value = null;
    pendingCharacterIds.value = null;
  }
};

const handleSelectCharacter = async (characterId: string) => {
  pendingCharacterId.value = characterId;
  pendingCharacterIds.value = null;
  const personaId = await resolvePersonaId();
  if (personaId === null) return;
  await startChat(personaId);
};

const handleSelectCharacters = async (characterIds: string[]) => {
  pendingCharacterId.value = null;
  pendingCharacterIds.value = characterIds;
  const personaId = await resolvePersonaId();
  if (personaId === null) return;
  await startChat(personaId);
};

const handlePersonaSelected = async (personaId: string) => {
  await startChat(personaId);
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
    toast.error(t('chat.loadError'));
  }

  // If URL has characterId query param, auto-create a chat
  const characterId = route.query.characterId as string;
  if (characterId) {
    logger.info('Auto-creating chat for character from URL:', characterId);
    await handleSelectCharacter(characterId);
    // Remove characterId from URL to prevent re-creation on refresh
    router.replace({ query: {} });
  }
});

// Watch for route query changes (e.g. navigating from marketplace)
watch(() => route.query.characterId, async (characterId) => {
  if (characterId && typeof characterId === 'string') {
    logger.info('Character ID from URL:', characterId);
    await handleSelectCharacter(characterId);
    router.replace({ query: {} });
  }
});

onUnmounted(() => {
  chatStore.disconnectWebSocket();
});
</script>

<style scoped>
/* Chat page content fills the ChatLayout main area */
</style>
