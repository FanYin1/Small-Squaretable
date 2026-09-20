<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Bell } from '@element-plus/icons-vue';
import { useNotificationStore } from '@client/stores/notification';
import { useDateTime } from '@client/composables/useDateTime';
import type { NotificationItem } from '@/types/social';

const { t } = useI18n();
const router = useRouter();
const notificationStore = useNotificationStore();
const { formatRelativeTime } = useDateTime();

const popoverVisible = ref(false);

const recentNotifications = computed(() =>
  notificationStore.notifications.slice(0, 5)
);

// Fetch unread count on mount
onMounted(() => {
  notificationStore.fetchUnreadCount();
});

function onPopoverShow() {
  notificationStore.fetchNotifications(true);
}

function handleMarkAllRead() {
  notificationStore.markAllAsRead();
}

function handleNotificationClick(item: NotificationItem) {
  if (!item.isRead) {
    notificationStore.markAsRead(item.id);
  }
  popoverVisible.value = false;
  // Navigate to target if available
  if (item.targetType && item.targetId) {
    if (item.targetType === 'character') {
      router.push({ name: 'character-detail', params: { id: item.targetId } });
    } else if (item.targetType === 'user') {
      router.push({ name: 'profile' });
    }
  }
}
function getActorInitial(item: NotificationItem): string {
  if (item.actor?.displayName) {
    return item.actor.displayName.charAt(0).toUpperCase();
  }
  return '?';
}

function handleViewAll() {
  popoverVisible.value = false;
  router.push('/notifications');
}
</script>

<template>
  <el-popover
    v-model:visible="popoverVisible"
    placement="bottom-end"
    :width="360"
    trigger="click"
    :show-arrow="false"
    popper-class="notification-popover"
    @show="onPopoverShow"
  >
    <template #reference>
      <div class="notification-bell" role="button" tabindex="0" :aria-label="t('notification.title')">
        <el-badge :value="notificationStore.unreadCount" :hidden="!notificationStore.hasUnread" :max="99">
          <el-icon :size="20"><Bell /></el-icon>
        </el-badge>
      </div>
    </template>

    <div class="notification-panel">
      <div class="notification-panel-header">
        <span class="notification-panel-title">{{ t('notification.title') }}</span>
        <el-button
          v-if="notificationStore.hasUnread"
          type="primary"
          link
          size="small"
          @click="handleMarkAllRead"
        >
          {{ t('notification.markAllRead') }}
        </el-button>
      </div>

      <div v-if="notificationStore.loading" class="notification-loading">
        <el-icon class="is-loading"><Bell /></el-icon>
      </div>

      <div v-else-if="recentNotifications.length === 0" class="notification-empty">
        {{ t('notification.empty') }}
      </div>

      <div v-else class="notification-list">
        <div
          v-for="item in recentNotifications"
          :key="item.id"
          class="notification-item"
          :class="{ 'is-unread': !item.isRead }"
          role="button"
          tabindex="0"
          @click="handleNotificationClick(item)"
          @keydown.enter="handleNotificationClick(item)"
        >
          <div class="notification-item-avatar">
            <el-avatar :size="36" :src="item.actor?.avatarUrl || undefined">
              {{ getActorInitial(item) }}
            </el-avatar>
          </div>
          <div class="notification-item-content">
            <p class="notification-item-message">{{ item.message }}</p>
            <span class="notification-item-time">{{ formatRelativeTime(item.createdAt) }}</span>
          </div>
          <div v-if="!item.isRead" class="notification-item-dot" />
        </div>
      </div>

      <div class="notification-panel-footer">
        <el-button type="primary" link @click="handleViewAll">
          {{ t('notification.viewAll') }}
        </el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.notification-bell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.notification-bell:hover {
  background: var(--bg-base);
  color: var(--accent-text);
}

.notification-bell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.notification-panel {
  display: flex;
  flex-direction: column;
  margin: -12px;
}

.notification-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
}

.notification-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.notification-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  color: var(--text-tertiary);
}

.notification-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.notification-list {
  max-height: 320px;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.notification-item:hover {
  background: var(--bg-base);
}

.notification-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.notification-item.is-unread {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.notification-item-avatar {
  flex-shrink: 0;
}

.notification-item-content {
  flex: 1;
  min-width: 0;
}

.notification-item-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-item.is-unread .notification-item-message {
  font-weight: 600;
}

.notification-item-time {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
  display: block;
}

.notification-item-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-danger, #f56c6c);
  margin-top: 6px;
}

.notification-panel-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-top: 1px solid var(--border-default);
}
</style>
