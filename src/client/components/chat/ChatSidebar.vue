<template>
  <div class="chat-sidebar">
    <div class="sidebar-header">
      <h2 class="sidebar-title">{{ t('chat.title') }}</h2>
      <div class="sidebar-header-actions">
        <el-tooltip :content="t('chat.newChat')" placement="bottom">
          <el-button
            type="primary"
            :icon="Plus"
            @click="handleNewChat"
            size="small"
          >
            {{ t('chat.newChat') }}
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('chat.sidebar.collapse')" placement="bottom">
          <button class="collapse-btn" @click="emit('toggle-collapse')">
            <el-icon><Fold /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </div>

    <div class="sidebar-search">
      <el-input
        v-model="searchQuery"
        :placeholder="t('chat.searchChats')"
        :prefix-icon="Search"
        clearable
      >
        <template #suffix>
          <kbd class="search-shortcut">{{ searchShortcutLabel }}</kbd>
        </template>
      </el-input>
    </div>

    <div class="sidebar-tabs">
      <button
        :class="['tab-btn', { active: sidebarView === 'chats' }]"
        @click="sidebarView = 'chats'"
      >{{ t('chat.title') }}</button>
      <button
        :class="['tab-btn', { active: sidebarView === 'bookmarks' }]"
        @click="handleShowBookmarks"
      >{{ t('chat.bookmarks') }}</button>
    </div>

    <div class="sidebar-content">
      <template v-if="sidebarView === 'bookmarks'">
        <div v-if="bookmarkStore.loading" class="loading-container">
          <el-skeleton :rows="3" animated />
        </div>
        <div v-else-if="bookmarkStore.bookmarks.length === 0" class="empty-state">
          <el-empty :description="t('chat.noBookmarks')" />
        </div>
        <div v-else class="bookmarks-list">
          <div
            v-for="bookmark in bookmarkStore.bookmarks"
            :key="bookmark.id"
            class="bookmark-item"
            @click="navigateToBookmark(bookmark)"
          >
            <div class="bookmark-content">{{ bookmark.note || t('chat.bookmarkedMessage') }}</div>
            <div class="bookmark-time">{{ formatRelativeTime(bookmark.createdAt) }}</div>
          </div>
        </div>
      </template>

      <template v-else>
      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="filteredChats.length === 0" class="empty-state">
        <el-empty
          :description="searchQuery ? t('market.noResults') : t('chat.noChats')"
        >
          <el-button v-if="!searchQuery" type="primary" @click="handleNewChat">
            {{ t('chat.createFirst') }}
          </el-button>
        </el-empty>
      </div>

      <div v-else class="chat-list">
        <div v-for="group in groupedChats" :key="group.label" class="chat-group">
          <div class="chat-group-header">{{ group.label }}</div>
          <div
            v-for="chat in group.chats"
            :key="chat.id"
            :class="['chat-item', { active: chat.id === currentChatId }]"
            @click="handleSelectChat(chat.id)"
          >
            <!-- Group chat: show group icon badge on avatar -->
            <div v-if="chat.metadata?.groupStrategy" class="chat-avatar-wrapper">
              <el-avatar class="chat-avatar" :src="chat.characterAvatar">
                {{ chat.characterName?.[0] || '?' }}
              </el-avatar>
              <span class="group-badge" :title="t('groupChat.title')">👥</span>
            </div>
            <el-avatar v-else class="chat-avatar" :src="chat.characterAvatar">
              {{ chat.characterName[0] }}
            </el-avatar>
            <div class="chat-item-content">
              <div class="chat-item-header">
                <span class="chat-item-title">{{ chat.title || chat.characterName }}</span>
                <span class="chat-item-time">{{ formatRelativeTime(chat.lastMessageAt || chat.createdAt) }}</span>
              </div>
              <div class="chat-item-preview">
                {{ chat.lastMessage || t('chat.noMessages') }}
              </div>
            </div>
            <el-dropdown
              trigger="click"
              @command="(command: string) => handleChatAction(command, chat.id)"
            >
              <el-button
                link
                :icon="More"
                class="chat-item-menu"
                @click.stop
              />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename" :icon="Edit">
                    {{ t('common.rename') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Delete" divided>
                    {{ t('common.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
      </template>
    </div>

    <div class="sidebar-footer">
      <el-tooltip :content="t('nav.market')" placement="top">
        <button class="footer-btn" @click="router.push({ name: 'Market' })">
          <el-icon><Shop /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip :content="t('nav.myCharacters')" placement="top">
        <button class="footer-btn" @click="router.push({ name: 'MyCharacters' })">
          <el-icon><User /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip :content="t('nav.settings')" placement="top">
        <button class="footer-btn" @click="router.push({ name: 'Profile' })">
          <el-icon><Setting /></el-icon>
        </button>
      </el-tooltip>
      <el-dropdown trigger="click" @command="handleUserMenuCommand">
        <button class="footer-btn" :title="t('nav.user')">
          <el-icon><UserFilled /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="Profile">{{ t('nav.profile') }}</el-dropdown-item>
            <el-dropdown-item command="SecuritySettings">{{ t('nav.security') }}</el-dropdown-item>
            <el-dropdown-item command="AccountSettings">{{ t('nav.account') }}</el-dropdown-item>
            <el-dropdown-item command="Subscription">{{ t('nav.subscription') }}</el-dropdown-item>
            <el-dropdown-item command="PluginMarketplace">{{ t('nav.plugins') }}</el-dropdown-item>
            <el-dropdown-item command="DeveloperSettings">{{ t('nav.developer') }}</el-dropdown-item>
            <el-dropdown-item command="Analytics">{{ t('nav.analytics') }}</el-dropdown-item>
            <el-dropdown-item v-if="isAdminOrMod" command="AdminUsers">{{ t('nav.admin') }}</el-dropdown-item>
            <el-dropdown-item divided command="logout">{{ t('nav.logout') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Plus as _Plus, Search as _Search, More as _More, Edit as _Edit, Delete as _Delete, Shop, Setting, UserFilled, User, Fold } from '@element-plus/icons-vue';

const Plus = markRaw(_Plus);
const Search = markRaw(_Search);
const More = markRaw(_More);
const Edit = markRaw(_Edit);
const Delete = markRaw(_Delete);
import { ElMessageBox, ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useBookmarkStore } from '@client/stores/bookmark';
import type { BookmarkItem } from '@client/stores/bookmark';
import { useDateTime } from '@client/composables';
import { createLogger } from '@client/utils/logger';
import type { Chat } from '@client/types';

const logger = createLogger('ChatSidebar');

interface Emits {
  (e: 'new-chat'): void;
  (e: 'select-chat', chatId: string): void;
  (e: 'toggle-collapse'): void;
}

const emit = defineEmits<Emits>();

const { t } = useI18n();
const router = useRouter();
const { formatRelativeTime } = useDateTime();
const chatStore = useChatStore();
const userStore = useUserStore();
const bookmarkStore = useBookmarkStore();
const searchQuery = ref('');
const sidebarView = ref<'chats' | 'bookmarks'>('chats');

const chats = computed(() => chatStore.chats);
const currentChatId = computed(() => chatStore.currentChatId);
const loading = computed(() => chatStore.loading);

const isAdminOrMod = computed(() => {
  const role = userStore.user?.role;
  return role === 'admin' || role === 'moderator';
});

const searchShortcutLabel = computed(() =>
  navigator.userAgent.includes('Mac') ? '⌘K' : 'Ctrl+K'
);

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

interface ChatGroup {
  label: string;
  chats: Chat[];
}

const groupedChats = computed<ChatGroup[]>(() => {
  const groups: ChatGroup[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayChats: Chat[] = [];
  const yesterdayChats: Chat[] = [];
  const earlierChats: Chat[] = [];

  for (const chat of filteredChats.value) {
    const date = new Date(chat.lastMessageAt || chat.createdAt);
    if (date.toDateString() === today.toDateString()) {
      todayChats.push(chat);
    } else if (date.toDateString() === yesterday.toDateString()) {
      yesterdayChats.push(chat);
    } else {
      earlierChats.push(chat);
    }
  }

  if (todayChats.length > 0) groups.push({ label: t('time.today'), chats: todayChats });
  if (yesterdayChats.length > 0) groups.push({ label: t('time.yesterday'), chats: yesterdayChats });
  if (earlierChats.length > 0) groups.push({ label: t('time.earlier'), chats: earlierChats });

  return groups;
});

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
        t('chat.deleteConfirm'),
        t('chat.deleteTitle'),
        {
          confirmButtonText: t('common.delete'),
          cancelButtonText: t('common.cancel'),
          type: 'warning',
        }
      );

      await chatStore.deleteChat(chatId);
      ElMessage.success(t('chat.deleteSuccess'));
    } catch (error) {
      if (error !== 'cancel') {
        logger.error('Failed to delete chat', error);
        ElMessage.error(t('chat.deleteFailed'));
      }
    }
  } else if (command === 'rename') {
    try {
      const chat = chats.value.find(c => c.id === chatId);
      if (!chat) return;

      const { value } = await ElMessageBox.prompt(
        t('chat.renamePrompt'),
        t('chat.renameTitle'),
        {
          confirmButtonText: t('common.rename'),
          cancelButtonText: t('common.cancel'),
          inputValue: chat.title || chat.characterName,
          inputPattern: /.+/,
          inputErrorMessage: t('chat.renameEmpty'),
        }
      );

      await chatStore.renameChat(chatId, value);
      ElMessage.success(t('common.save') + '!');
    } catch (error) {
      if (error !== 'cancel') {
        logger.error('Failed to rename chat', error);
      }
    }
  }
};

const handleUserMenuCommand = async (command: string) => {
  if (command === 'logout') {
    await userStore.logout();
    router.push({ name: 'Login' });
  } else {
    router.push({ name: command });
  }
};

const handleShowBookmarks = () => {
  sidebarView.value = 'bookmarks';
  bookmarkStore.fetchBookmarks();
};

const navigateToBookmark = (bookmark: BookmarkItem) => {
  if (bookmark.chatId) {
    emit('select-chat', bookmark.chatId);
  }
  sidebarView.value = 'chats';
};
</script>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-surface);
  border-right: 1px solid var(--border-default);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-search {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.search-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-hover);
  color: var(--text-tertiary);
  border: 1px solid var(--border-default);
  font-family: inherit;
  line-height: 1;
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

.chat-group-header {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--border-default);
  position: relative;
}

.chat-item:hover {
  background-color: var(--surface-hover);
}

.chat-item.active {
  background-color: color-mix(in srgb, var(--accent) 10%, transparent);
  border-left: 3px solid var(--accent);
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
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.chat-item-time {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.chat-item-preview {
  font-size: 13px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item-menu {
  opacity: 0.3;
  transition: opacity 0.2s;
  z-index: 10;
  position: relative;
  padding: 4px 8px;
  flex-shrink: 0;
}

.chat-item:hover .chat-item-menu {
  opacity: 1;
}

.chat-item-menu:hover {
  background-color: var(--surface-hover);
  border-radius: 4px;
}

.chat-avatar {
  width: 48px;
  height: 48px;
  line-height: 48px;
  font-size: 16px;
  flex-shrink: 0;
}

.chat-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.group-badge {
  position: absolute;
  bottom: -2px;
  right: -4px;
  font-size: 12px;
  line-height: 1;
  background: var(--bg-surface);
  border-radius: 50%;
  padding: 1px;
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-footer {
  border-top: 1px solid var(--border-default);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  flex-shrink: 0;
}

.footer-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.footer-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px 8px;
}

.tab-btn {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--surface-hover);
  color: var(--text-primary);
  font-weight: 600;
}

.bookmark-item {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 8px;
  margin: 2px 8px;
  transition: background 0.15s;
}

.bookmark-item:hover {
  background: var(--surface-hover);
}

.bookmark-content {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-time {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Scrollbar styling */
.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: var(--bg-surface);
}

.sidebar-content::-webkit-scrollbar-thumb {
  background: var(--surface-active);
  border-radius: 3px;
}

.sidebar-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* Mobile breakpoint */
@media (max-width: 480px) {
  .sidebar-header {
    padding: 12px;
  }

  .sidebar-title {
    font-size: 16px;
  }

  .sidebar-search {
    padding: 8px 12px;
  }

  .loading-container {
    padding: 12px;
  }

  .empty-state {
    padding: 16px;
  }

  .chat-group-header {
    padding: 6px 12px 4px;
    font-size: 10px;
  }

  .chat-item {
    padding: 10px 12px;
    gap: 10px;
  }

  .chat-avatar {
    width: 36px;
    height: 36px;
    line-height: 36px;
    font-size: 13px;
  }

  .chat-item-title {
    font-size: 13px;
  }

  .chat-item-time {
    font-size: 11px;
  }

  .chat-item-preview {
    font-size: 12px;
  }

  .chat-item-menu {
    padding: 2px 6px;
  }
}
</style>
