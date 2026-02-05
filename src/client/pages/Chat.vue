<template>
  <DashboardLayout>
    <template #title>会话</template>
    <template #actions>
      <el-button
        type="primary"
        :icon="Plus"
        @click="handleNewChat"
        class="new-chat-btn"
      >
        新建聊天
      </el-button>
    </template>

    <div class="chat-content">
      <div :class="['chat-sidebar-container', { collapsed: sidebarCollapsed }]">
        <ChatSidebar
          @new-chat="handleNewChat"
          @select-chat="handleSelectChat"
        />
      </div>

      <el-button
        class="sidebar-toggle"
        :icon="sidebarCollapsed ? Expand : Fold"
        @click="toggleSidebar"
        circle
      />

      <div class="chat-window-container">
        <div v-if="!currentChat" class="chat-empty">
          <div class="empty-content">
            <div class="empty-icon">💬</div>
            <h3 class="empty-title">开始新的对话</h3>
            <p class="empty-description">选择一个聊天或创建新的对话开始交流</p>
            <el-button type="primary" size="large" @click="handleNewChat">
              创建新聊天
            </el-button>
          </div>
        </div>

        <ChatWindow v-else :current-chat="currentChat" />
      </div>
    </div>
  </DashboardLayout>

  <el-dialog
    v-model="showNewChatDialog"
    title="创建新聊天"
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form :model="newChatForm" label-position="top">
      <el-form-item label="选择角色">
        <el-select
          v-model="newChatForm.characterId"
          placeholder="选择一个角色"
          style="width: 100%"
        >
          <el-option
            v-for="character in characters"
            :key="character.id"
            :label="character.name"
            :value="character.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="聊天标题（可选）">
        <el-input
          v-model="newChatForm.title"
          placeholder="为这个聊天输入一个标题"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="showNewChatDialog = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!newChatForm.characterId"
        :loading="creating"
        @click="handleCreateChat"
      >
        创建聊天
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Expand, Fold, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElSelectV2 } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { characterApi, mapSearchItemToCharacter } from '@client/services';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
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

// 角色选项列表（用于 el-select-v2）
const characterOptions = computed(() => {
  return characters.value.map(c => ({
    value: c.id,
    label: c.name || '未命名角色',
  }));
});

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
      const publicCharsResponse = await characterApi.searchCharacters({
        q: '*',
        filter: 'public',
        limit: 100,
      });
      publicCharacters = (publicCharsResponse.items || []).map(mapSearchItemToCharacter);
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
    // 调试：打印第一个角色的数据结构
    if (characters.value.length > 0) {
      console.log('First character data:', JSON.stringify(characters.value[0], null, 2));
    }
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
.new-chat-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 500;
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.new-chat-btn:hover {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* 聊天内容区 */
.chat-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
  min-height: 600px;
}

.chat-sidebar-container {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color);
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
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.sidebar-toggle:hover {
  background: var(--bg-color-page);
  transform: scale(1.05);
}

.chat-sidebar-container:not(.collapsed) ~ .sidebar-toggle {
  left: 336px;
}

.chat-window-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
}

/* 空状态 */
.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, var(--bg-color) 0%, var(--bg-color-page) 100%);
}

.empty-content {
  text-align: center;
  max-width: 400px;
  padding: 48px 24px;
}

.empty-icon {
  font-size: 80px;
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-color-primary);
  margin: 0 0 12px 0;
}

.empty-description {
  font-size: 16px;
  color: var(--text-color-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.empty-content .el-button {
  font-size: 16px;
  padding: 14px 32px;
  border-radius: 12px;
  background: var(--color-primary);
  border-color: var(--color-primary);
  transition: all 0.2s ease;
}

.empty-content .el-button:hover {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* 对话框样式优化 */
:deep(.el-dialog) {
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:deep(.el-dialog__header) {
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--border-color);
}

:deep(.el-dialog__title) {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color-primary);
}

:deep(.el-dialog__body) {
  padding: 24px;
}

:deep(.el-dialog__footer) {
  padding: 16px 24px 24px;
  border-top: 1px solid var(--border-color);
}

:deep(.el-form-item__label) {
  font-weight: 600;
  color: var(--text-color-regular);
}

:deep(.el-select) {
  border-radius: 12px;
}

/* 强制设置选择框文字颜色 */
:deep(.el-select .el-select__wrapper) {
  color: #303133 !important;
}

:deep(.el-select .el-select__selected-item) {
  color: #303133 !important;
}

:deep(.el-select .el-select__placeholder) {
  color: #303133 !important;
}

:deep(.el-select .el-input__inner) {
  color: #303133 !important;
}

:deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:deep(.el-button--primary) {
  background: var(--color-primary);
  border-color: var(--color-primary);
  border-radius: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

:deep(.el-button--primary:hover) {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* 平板端适配 */
@media (max-width: 1023px) {
  .chat-sidebar-container {
    width: 280px;
  }

  .chat-sidebar-container:not(.collapsed) ~ .sidebar-toggle {
    left: 296px;
  }
}

/* 移动端适配 */
@media (max-width: 767px) {
  .new-chat-btn {
    width: 100%;
  }

  .chat-sidebar-container {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 280px;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .chat-sidebar-container.collapsed {
    transform: translateX(-100%);
  }

  .sidebar-toggle {
    left: 16px;
  }

  .chat-sidebar-container:not(.collapsed) ~ .sidebar-toggle {
    left: 296px;
  }

  .empty-content {
    padding: 32px 16px;
  }

  .empty-icon {
    font-size: 64px;
  }

  .empty-title {
    font-size: 20px;
  }

  .empty-description {
    font-size: 14px;
  }
}

/* 桌面端隐藏切换按钮 */
@media (min-width: 768px) {
  .sidebar-toggle {
    display: none;
  }

  .chat-sidebar-container {
    transform: translateX(0) !important;
  }
}
</style>
