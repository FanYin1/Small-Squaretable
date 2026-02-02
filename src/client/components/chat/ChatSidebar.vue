<template>
  <div class="chat-sidebar">
    <div class="sidebar-header">
      <h2 class="sidebar-title">Chats</h2>
      <el-button
        type="primary"
        :icon="Plus"
        @click="handleNewChat"
        size="small"
      >
        New Chat
      </el-button>
    </div>

    <div class="sidebar-search">
      <el-input
        v-model="searchQuery"
        placeholder="Search chats..."
        :prefix-icon="Search"
        clearable
      />
    </div>

    <div class="sidebar-content">
      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="filteredChats.length === 0" class="empty-state">
        <el-empty
          :description="searchQuery ? 'No chats found' : 'No chats yet'"
        >
          <el-button v-if="!searchQuery" type="primary" @click="handleNewChat">
            Create your first chat
          </el-button>
        </el-empty>
      </div>

      <div v-else class="chat-list">
        <div
          v-for="chat in filteredChats"
          :key="chat.id"
          :class="['chat-item', { active: chat.id === currentChatId }]"
          @click="handleSelectChat(chat.id)"
        >
          <el-avatar :size="48" :src="chat.characterAvatar">
            {{ chat.characterName[0] }}
          </el-avatar>
          <div class="chat-item-content">
            <div class="chat-item-header">
              <span class="chat-item-title">{{ chat.title || chat.characterName }}</span>
              <span class="chat-item-time">{{ formatTime(chat.lastMessageAt || chat.createdAt) }}</span>
            </div>
            <div class="chat-item-preview">
              {{ chat.lastMessage || 'No messages yet' }}
            </div>
          </div>
          <el-dropdown
            trigger="click"
            @command="(command: string) => handleChatAction(command, chat.id)"
            @click.stop
          >
            <el-button link :icon="More" class="chat-item-menu" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename" :icon="Edit">
                  Rename
                </el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete" divided>
                  Delete
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Plus, Search, More, Edit, Delete } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import type { Chat } from '@client/types';

interface Emits {
  (e: 'new-chat'): void;
  (e: 'select-chat', chatId: string): void;
}

const emit = defineEmits<Emits>();

const chatStore = useChatStore();
const searchQuery = ref('');

const chats = computed(() => chatStore.chats);
const currentChatId = computed(() => chatStore.currentChatId);
const loading = computed(() => chatStore.loading);

const filteredChats = computed(() => {
  if (!searchQuery.value) {
    return chats.value;
  }

  const query = searchQuery.value.toLowerCase();
  return chats.value.filter(chat => {
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.characterName.toLowerCase().includes(query) ||
      chat.lastMessage?.toLowerCase().includes(query)
    );
  });
});

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const handleNewChat = () => {
  emit('new-chat');
};

const handleSelectChat = (chatId: string) => {
  emit('select-chat', chatId);
};

const handleChatAction = async (command: string, chatId: string) => {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        'Are you sure you want to delete this chat? This action cannot be undone.',
        'Delete Chat',
        {
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel',
          type: 'warning',
        }
      );

      await chatStore.deleteChat(chatId);
      ElMessage.success('Chat deleted successfully');
    } catch (error) {
      if (error !== 'cancel') {
        console.error('Failed to delete chat:', error);
        ElMessage.error('Failed to delete chat');
      }
    }
  } else if (command === 'rename') {
    try {
      const chat = chats.value.find(c => c.id === chatId);
      if (!chat) return;

      const { value } = await ElMessageBox.prompt(
        'Enter a new name for this chat',
        'Rename Chat',
        {
          confirmButtonText: 'Rename',
          cancelButtonText: 'Cancel',
          inputValue: chat.title || chat.characterName,
          inputPattern: /.+/,
          inputErrorMessage: 'Chat name cannot be empty',
        }
      );

      // TODO: Implement rename API
      console.log('Rename chat:', chatId, value);
      ElMessage.success('Chat renamed successfully');
    } catch (error) {
      if (error !== 'cancel') {
        console.error('Failed to rename chat:', error);
      }
    }
  }
};
</script>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-search {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.loading-container {
  padding: 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
}

.chat-list {
  display: flex;
  flex-direction: column;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--el-border-color-lighter);
  position: relative;
}

.chat-item:hover {
  background-color: var(--el-fill-color-light);
}

.chat-item.active {
  background-color: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}

.chat-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.chat-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.chat-item-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.chat-item-preview {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item-menu {
  opacity: 0;
  transition: opacity 0.2s;
}

.chat-item:hover .chat-item-menu {
  opacity: 1;
}

/* Scrollbar styling */
.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: var(--el-fill-color-lighter);
}

.sidebar-content::-webkit-scrollbar-thumb {
  background: var(--el-fill-color-dark);
  border-radius: 3px;
}

.sidebar-content::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary);
}
</style>
