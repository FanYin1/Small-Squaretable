<template>
  <div class="chat-page">
    <!-- 左侧导航栏 -->
    <LeftSidebar />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <h1 class="page-title">会话</h1>

        <!-- 新建聊天按钮 -->
        <div class="top-actions">
          <el-button
            type="primary"
            :icon="Plus"
            @click="handleNewChat"
            class="new-chat-btn"
          >
            新建聊天
          </el-button>
        </div>

        <!-- 用户菜单 -->
        <div class="user-menu-wrapper">
          <el-dropdown v-if="isLoggedIn" trigger="click" @command="handleUserCommand">
            <div class="user-avatar-btn">
              <el-avatar
                :size="40"
                :src="userStore.user?.avatar"
              >
                {{ userStore.user?.name?.[0] }}
              </el-avatar>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <div class="user-info">
                    <div class="user-name">{{ userStore.user?.name }}</div>
                    <div class="user-email">{{ userStore.user?.email }}</div>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item divided command="profile">
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item command="my-characters">
                  我的角色
                </el-dropdown-item>
                <el-dropdown-item command="subscription">
                  订阅管理
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div v-else class="auth-buttons">
            <el-button @click="$router.push('/login')">登录</el-button>
            <el-button type="primary" @click="$router.push('/register')">注册</el-button>
          </div>
        </div>
      </header>

      <!-- 聊天内容区 -->
      <div class="chat-content">
        <!-- 聊天侧边栏 -->
        <div :class="['chat-sidebar-container', { collapsed: sidebarCollapsed }]">
          <ChatSidebar
            @new-chat="handleNewChat"
            @select-chat="handleSelectChat"
          />
        </div>

        <!-- 侧边栏切换按钮（移动端） -->
        <el-button
          class="sidebar-toggle"
          :icon="sidebarCollapsed ? Expand : Fold"
          @click="toggleSidebar"
          circle
        />

        <!-- 聊天窗口 -->
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
    </div>

    <!-- New Chat Dialog -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Expand, Fold, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { characterApi } from '@client/services';
import { api } from '@client/services/api';
import LeftSidebar from '@client/components/layout/LeftSidebar.vue';
import ChatSidebar from '@client/components/chat/ChatSidebar.vue';
import ChatWindow from '@client/components/chat/ChatWindow.vue';
import type { Character } from '@client/types';

const route = useRoute();
const router = useRouter();
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
const isLoggedIn = computed(() => !!userStore.user);

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const handleUserCommand = (command: string) => {
  switch (command) {
    case 'profile':
      router.push('/profile');
      break;
    case 'my-characters':
      router.push('/my-characters');
      break;
    case 'subscription':
      router.push('/subscription');
      break;
    case 'settings':
      router.push('/profile');
      break;
    case 'logout':
      userStore.logout();
      break;
  }
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
  display: flex;
  min-height: 100vh;
  background: #F9FAFB;
}

/* 主内容区 */
.main-content {
  flex: 1;
  margin-left: 64px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 顶部栏 */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 32px;
  background: white;
  border-bottom: 1px solid #E5E7EB;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  white-space: nowrap;
}

.top-actions {
  flex: 1;
  display: flex;
  justify-content: center;
}

.new-chat-btn {
  background: #10B981;
  border-color: #10B981;
  font-weight: 500;
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.new-chat-btn:hover {
  background: #059669;
  border-color: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.user-menu-wrapper {
  margin-left: auto;
  flex-shrink: 0;
}

.user-avatar-btn {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.user-avatar-btn:hover {
  opacity: 0.8;
}

.user-info {
  padding: 8px 0;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.user-email {
  font-size: 12px;
  color: #9CA3AF;
}

.auth-buttons {
  display: flex;
  gap: 12px;
}

/* 聊天内容区 */
.chat-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.chat-sidebar-container {
  width: 320px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #E5E7EB;
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
  background: white;
  border: 1px solid #E5E7EB;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.sidebar-toggle:hover {
  background: #F3F4F6;
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
  background: white;
}

/* 空状态 */
.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
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
  color: #111827;
  margin: 0 0 12px 0;
}

.empty-description {
  font-size: 16px;
  color: #6B7280;
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.empty-content .el-button {
  font-size: 16px;
  padding: 14px 32px;
  border-radius: 12px;
  background: #3B82F6;
  border-color: #3B82F6;
  transition: all 0.2s ease;
}

.empty-content .el-button:hover {
  background: #2563EB;
  border-color: #2563EB;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
}

/* 对话框样式优化 */
:deep(.el-dialog) {
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:deep(.el-dialog__header) {
  padding: 24px 24px 16px;
  border-bottom: 1px solid #E5E7EB;
}

:deep(.el-dialog__title) {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
}

:deep(.el-dialog__body) {
  padding: 24px;
}

:deep(.el-dialog__footer) {
  padding: 16px 24px 24px;
  border-top: 1px solid #E5E7EB;
}

:deep(.el-form-item__label) {
  font-weight: 600;
  color: #374151;
}

:deep(.el-select) {
  border-radius: 12px;
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
  background: #3B82F6;
  border-color: #3B82F6;
  border-radius: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

:deep(.el-button--primary:hover) {
  background: #2563EB;
  border-color: #2563EB;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
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
  .main-content {
    margin-left: 0;
  }

  .top-bar {
    flex-wrap: wrap;
    padding: 12px 16px;
    gap: 12px;
  }

  .page-title {
    font-size: 20px;
    flex: 1;
  }

  .top-actions {
    order: 3;
    width: 100%;
    justify-content: stretch;
  }

  .new-chat-btn {
    width: 100%;
  }

  .user-menu-wrapper {
    margin-left: 0;
  }

  .auth-buttons {
    width: 100%;
  }

  .auth-buttons .el-button {
    flex: 1;
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
