<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Bell, Check, Delete, ChatLineSquare, Star, UserFilled, ChatDotRound, Setting, Plus, CopyDocument } from '@element-plus/icons-vue';
import { useNotificationStore } from '@client/stores/notification';
import { useDateTime } from '@client/composables/useDateTime';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import NotificationPreferences from '@client/components/notification/NotificationPreferences.vue';
import type { NotificationItem, NotificationType } from '@/types/social';

const { t } = useI18n();
const router = useRouter();
const notificationStore = useNotificationStore();
const { formatRelativeTime } = useDateTime();

const filter = ref<'all' | 'unread'>('all');
const showPreferences = ref(false);

const filteredNotifications = computed(() => {
  if (filter.value === 'unread') {
    return notificationStore.notifications.filter(n => !n.isRead);
  }
  return notificationStore.notifications;
});

onMounted(() => {
  notificationStore.fetchNotifications(true);
  notificationStore.fetchUnreadCount();
});

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'follow':
      return UserFilled;
    case 'favorite':
      return Star;
    case 'comment':
      return ChatLineSquare;
    case 'reply':
      return ChatDotRound;
    case 'mention':
      return ChatLineSquare;
    case 'collaborator_invite':
      return Plus;
    case 'collaborator_role_change':
      return Setting;
    case 'collaborator_removed':
      return Delete;
    case 'character_forked':
      return CopyDocument;
    case 'system':
      return Bell;
    default:
      return Bell;
  }
}

function getIconColor(type: NotificationType): string {
  switch (type) {
    case 'follow':
      return 'var(--accent-purple)';
    case 'favorite':
      return 'var(--color-warning)';
    case 'comment':
      return 'var(--color-success)';
    case 'reply':
      return 'var(--accent-cyan)';
    case 'mention':
      return 'var(--color-info, #409eff)';
    case 'collaborator_invite':
      return 'var(--color-success)';
    case 'collaborator_role_change':
      return 'var(--accent-purple)';
    case 'collaborator_removed':
      return 'var(--color-danger, #f56c6c)';
    case 'character_forked':
      return 'var(--accent-cyan)';
    case 'system':
      return 'var(--text-secondary)';
    default:
      return 'var(--text-secondary)';
  }
}

async function handleClick(item: NotificationItem) {
  if (!item.isRead) {
    await notificationStore.markAsRead(item.id);
  }
  if (item.targetType && item.targetId) {
    switch (item.targetType) {
      case 'character':
        router.push({ name: 'Market', query: { id: item.targetId } });
        break;
      case 'chat':
        router.push({ name: 'ChatSession', params: { chatId: item.targetId } });
        break;
      case 'user':
        router.push({ name: 'Profile', query: { userId: item.targetId } });
        break;
    }
  }
}

async function handleDelete(event: Event, id: string) {
  event.stopPropagation();
  await notificationStore.deleteNotification(id);
}

async function handleMarkAllRead() {
  await notificationStore.markAllAsRead();
}

function loadMore() {
  notificationStore.fetchNotifications(false);
}
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('notification.title') }}</template>

    <div class="notifications-page">
      <!-- Header -->
      <div class="notifications-header">
        <el-radio-group v-model="filter" size="default">
          <el-radio-button value="all">{{ t('notification.all') }}</el-radio-button>
          <el-radio-button value="unread">{{ t('notification.unreadOnly') }}</el-radio-button>
        </el-radio-group>

        <div class="header-actions">
          <el-button
            :icon="Setting"
            circle
            @click="showPreferences = true"
            :aria-label="t('notificationPrefs.title')"
          />
          <el-button
            :icon="Check"
            :disabled="!notificationStore.hasUnread"
            @click="handleMarkAllRead"
          >
            {{ t('notification.markAllRead') }}
          </el-button>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="notificationStore.loading && filteredNotifications.length === 0" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <!-- Notification list -->
      <div v-else-if="filteredNotifications.length > 0" class="notification-list">
        <div
          v-for="item in filteredNotifications"
          :key="item.id"
          :class="['notification-item', { unread: !item.isRead }]"
          role="button"
          tabindex="0"
          @click="handleClick(item)"
          @keydown.enter="handleClick(item)"
        >
          <!-- Unread indicator -->
          <div class="unread-dot-wrapper">
            <span v-if="!item.isRead" class="unread-dot" />
          </div>

          <!-- Avatar / Icon -->
          <el-avatar
            v-if="item.actor?.avatarUrl"
            :src="item.actor.avatarUrl"
            :size="40"
            class="notification-avatar"
          />
          <div v-else class="notification-icon" :style="{ color: getIconColor(item.type) }">
            <el-icon :size="20"><component :is="getNotificationIcon(item.type)" /></el-icon>
          </div>
          <!-- Content -->
          <div class="notification-content">
            <p class="notification-message">
              <span v-if="item.actor" class="actor-name">{{ item.actor.displayName || t('notification.unknownUser') }}</span>
              {{ item.message }}
            </p>
            <span class="notification-time">{{ formatRelativeTime(item.createdAt) }}</span>
          </div>

          <!-- Delete button -->
          <el-button
            class="delete-btn"
            :icon="Delete"
            size="small"
            text
            type="danger"
            :aria-label="t('common.delete')"
            @click="handleDelete($event, item.id)"
          />
        </div>

        <!-- Load more -->
        <div v-if="notificationStore.hasMore" class="load-more">
          <el-button
            :loading="notificationStore.loading"
            @click="loadMore"
          >
            {{ t('notification.loadMore') }}
          </el-button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="empty-state">
        <el-icon :size="64" color="var(--text-tertiary)"><Bell /></el-icon>
        <p class="empty-title">{{ t('notification.empty') }}</p>
        <p class="empty-subtitle">{{ t('notification.emptyHint') }}</p>
      </div>

      <!-- Preferences dialog -->
      <NotificationPreferences v-model="showPreferences" />
    </div>
  </DashboardLayout>
</template>

<style scoped>
.notifications-page {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  animation: fadeIn var(--duration-slow, 0.3s) var(--ease-out, ease-out) both;
}

.notifications-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Loading state */
.loading-state {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-default);
}

/* Notification list */
.notification-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface-card);
  border-radius: 12px;
  border: 1px solid var(--border-default);
  overflow: hidden;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom: 1px solid var(--border-default);
  position: relative;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item:hover {
  background: color-mix(in srgb, var(--accent-purple) 5%, var(--surface-card));
}

.notification-item:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: -2px;
}

.notification-item.unread {
  background: color-mix(in srgb, var(--accent-purple) 3%, var(--surface-card));
}

.notification-item.unread .notification-message {
  font-weight: 600;
  color: var(--text-primary);
}

/* Unread dot */
.unread-dot-wrapper {
  width: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-purple);
  flex-shrink: 0;
}

/* Avatar / Icon */
.notification-avatar {
  flex-shrink: 0;
}

.notification-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  flex-shrink: 0;
}

/* Content */
.notification-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.actor-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 4px;
}

.notification-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Delete button */
.delete-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.notification-item:hover .delete-btn {
  opacity: 1;
}

/* Load more */
.load-more {
  display: flex;
  justify-content: center;
  padding: 16px;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-title {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}

/* Mobile: always show delete button */
@media (hover: none) {
  .delete-btn {
    opacity: 1;
  }
}

@media (max-width: 767px) {
  .notifications-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: flex-end;
  }

  .notification-item {
    padding: 12px 16px;
  }

  .delete-btn {
    opacity: 1;
  }
}
</style>
