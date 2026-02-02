<template>
  <div class="chat-page">
    <div class="chat-layout">
      <!-- Sidebar -->
      <div :class="['chat-sidebar-container', { collapsed: sidebarCollapsed }]">
        <ChatSidebar
          @new-chat="handleNewChat"
          @select-chat="handleSelectChat"
        />
      </div>

      <!-- Toggle button for mobile -->
      <el-button
        class="sidebar-toggle"
        :icon="sidebarCollapsed ? Expand : Fold"
        @click="toggleSidebar"
        circle
      />

      <!-- Main chat area -->
      <div class="chat-main">
        <div v-if="!currentChat" class="chat-empty">
          <el-empty description="Select a chat or create a new one to start">
            <el-button type="primary" @click="handleNewChat">
              Start New Chat
            </el-button>
          </el-empty>
        </div>

        <ChatWindow v-else :current-chat="currentChat" />
      </div>
    </div>

    <!-- New Chat Dialog -->
    <el-dialog
      v-model="showNewChatDialog"
      title="Start New Chat"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="newChatForm" label-position="top">
        <el-form-item label="Select Character">
          <el-select
            v-model="newChatForm.characterId"
            placeholder="Choose a character"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="character in characters"
              :key="character.id"
              :label="character.name"
              :value="character.id"
            >
              <div style="display: flex; align-items: center; gap: 8px">
                <el-avatar :size="24" :src="character.avatar">
                  {{ character.name[0] }}
                </el-avatar>
                <span>{{ character.name }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Chat Title (Optional)">
          <el-input
            v-model="newChatForm.title"
            placeholder="Enter a title for this chat"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showNewChatDialog = false">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="!newChatForm.characterId"
          :loading="creating"
          @click="handleCreateChat"
        >
          Create Chat
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Expand, Fold } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { characterApi } from '@client/services';
import { api } from '@client/services/api';
import ChatSidebar from '@client/components/chat/ChatSidebar.vue';
import ChatWindow from '@client/components/chat/ChatWindow.vue';
import type { Character } from '@client/types';

const route = useRoute();
const chatStore = useChatStore();
const userStore = useUserStore();

const sidebarCollapsed = ref(false);
const showNewChatDialog = ref(false);
const creating = ref(false);
const characters = ref<Character[]>([]);

const newChatForm = ref({
  characterId: '',
  title: '',
});

const currentChat = computed(() => chatStore.currentChat);

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const handleNewChat = () => {
  showNewChatDialog.value = true;
};

const handleSelectChat = async (chatId: string) => {
  try {
    await chatStore.setCurrentChat(chatId);
    // Collapse sidebar on mobile after selection
    if (window.innerWidth < 768) {
      sidebarCollapsed.value = true;
    }
  } catch (error) {
    console.error('Failed to select chat:', error);
    ElMessage.error('Failed to load chat');
  }
};

const handleCreateChat = async () => {
  if (!newChatForm.value.characterId) {
    return;
  }

  creating.value = true;
  try {
    const chat = await chatStore.createChat(
      newChatForm.value.characterId,
      newChatForm.value.title || undefined
    );

    showNewChatDialog.value = false;
    newChatForm.value = { characterId: '', title: '' };

    // Select the newly created chat
    await chatStore.setCurrentChat(chat.id);

    ElMessage.success('Chat created successfully');
  } catch (error) {
    console.error('Failed to create chat:', error);
    ElMessage.error('Failed to create chat');
  } finally {
    creating.value = false;
  }
};

const loadCharacters = async () => {
  try {
    console.log('Loading characters for chat...');

    // 加载用户自己的角色
    let myCharacters: Character[] = [];
    try {
      const myCharsResponse = await characterApi.getCharacters({ limit: 100 });
      myCharacters = myCharsResponse.characters || [];
      console.log('My characters:', myCharacters.length);
    } catch (error) {
      console.error('Failed to load my characters:', error);
    }

    // 加载公开的角色（市场角色）
    let publicCharacters: Character[] = [];
    try {
      const publicCharsResponse = await api.get<any>('/characters/search?q=*&filter=public&limit=100');
      publicCharacters = publicCharsResponse.items || [];
      console.log('Public characters:', publicCharacters.length);
    } catch (error) {
      console.error('Failed to load public characters:', error);
    }

    // 合并两个列表，去重
    const allCharacters = [...myCharacters, ...publicCharacters];

    // 根据 ID 去重
    const uniqueCharacters = Array.from(
      new Map(allCharacters.map(char => [char.id, char])).values()
    );

    characters.value = uniqueCharacters;
    console.log('Total unique characters loaded:', characters.value.length);
  } catch (error) {
    console.error('Failed to load characters:', error);
    ElMessage.error('加载角色列表失败');
  }
};

const handleResize = () => {
  // Auto-collapse sidebar on mobile
  if (window.innerWidth < 768) {
    sidebarCollapsed.value = true;
  } else {
    sidebarCollapsed.value = false;
  }
};

onMounted(async () => {
  // Initialize WebSocket
  const token = userStore.token;
  if (token) {
    chatStore.initWebSocket(token);
  }

  // Load chats and characters
  try {
    await Promise.all([
      chatStore.fetchChats(),
      loadCharacters(),
    ]);
  } catch (error) {
    console.error('Failed to initialize chat page:', error);
  }

  // 检查 URL 参数，如果有 characterId，自动打开创建对话框
  const characterId = route.query.characterId as string;
  if (characterId) {
    console.log('Auto-opening chat dialog for character:', characterId);
    newChatForm.value.characterId = characterId;
    showNewChatDialog.value = true;
  }

  // Handle responsive sidebar
  handleResize();
  window.addEventListener('resize', handleResize);
});

// 监听路由变化，处理从市场页面跳转过来的情况
watch(() => route.query.characterId, (characterId) => {
  if (characterId && typeof characterId === 'string') {
    console.log('Character ID from URL:', characterId);
    newChatForm.value.characterId = characterId;
    showNewChatDialog.value = true;
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  // Disconnect WebSocket when leaving the page
  chatStore.disconnectWebSocket();
});
</script>

<style scoped>
.chat-page {
  height: 100vh;
  overflow: hidden;
}

.chat-layout {
  display: flex;
  height: 100%;
  position: relative;
}

.chat-sidebar-container {
  width: 320px;
  flex-shrink: 0;
  transition: transform 0.3s ease, width 0.3s ease;
  z-index: 10;
}

.chat-sidebar-container.collapsed {
  transform: translateX(-100%);
  width: 0;
}

.sidebar-toggle {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
  box-shadow: var(--el-box-shadow-light);
}

.chat-sidebar-container:not(.collapsed) ~ .sidebar-toggle {
  left: 336px;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background-color: var(--el-bg-color);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .chat-sidebar-container {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background-color: var(--el-bg-color);
    box-shadow: var(--el-box-shadow);
  }

  .chat-sidebar-container.collapsed {
    transform: translateX(-100%);
  }

  .sidebar-toggle {
    left: 16px;
  }

  .chat-sidebar-container:not(.collapsed) ~ .sidebar-toggle {
    left: 336px;
  }
}

@media (min-width: 769px) {
  .sidebar-toggle {
    display: none;
  }

  .chat-sidebar-container {
    transform: translateX(0) !important;
  }
}
</style>
