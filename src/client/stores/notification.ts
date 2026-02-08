import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createLogger } from '@client/utils/logger';
import { notificationApi } from '@client/services/notification.api';
import type { NotificationItem } from '@/types/social';

const logger = createLogger('NotificationStore');

export const useNotificationStore = defineStore('notification', () => {
  // State
  const notifications = ref<NotificationItem[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const hasMore = ref(true);

  // Getters
  const hasUnread = computed(() => unreadCount.value > 0);

  // Actions
  async function fetchUnreadCount() {
    try {
      const result = await notificationApi.getUnreadCount();
      unreadCount.value = result.count;
    } catch (e: unknown) {
      logger.error('Failed to fetch unread count', e);
    }
  }

  async function fetchNotifications(reset = false) {
    if (loading.value) return;
    loading.value = true;
    try {
      const offset = reset ? 0 : notifications.value.length;
      const result = await notificationApi.getNotifications(20, offset);
      if (reset) {
        notifications.value = result;
      } else {
        notifications.value.push(...result);
      }
      hasMore.value = result.length === 20;
    } catch (e: unknown) {
      logger.error('Failed to fetch notifications', e);
    } finally {
      loading.value = false;
    }
  }

  async function markAsRead(id: string) {
    try {
      await notificationApi.markAsRead(id);
      const n = notifications.value.find(n => n.id === id);
      if (n && !n.isRead) {
        n.isRead = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    } catch (e: unknown) {
      logger.error('Failed to mark as read', e);
    }
  }

  async function markAllAsRead() {
    try {
      await notificationApi.markAllAsRead();
      notifications.value.forEach(n => { n.isRead = true; });
      unreadCount.value = 0;
    } catch (e: unknown) {
      logger.error('Failed to mark all as read', e);
    }
  }

  async function deleteNotification(id: string) {
    try {
      await notificationApi.deleteNotification(id);
      const idx = notifications.value.findIndex(n => n.id === id);
      if (idx !== -1) {
        if (!notifications.value[idx].isRead) {
          unreadCount.value = Math.max(0, unreadCount.value - 1);
        }
        notifications.value.splice(idx, 1);
      }
    } catch (e: unknown) {
      logger.error('Failed to delete notification', e);
    }
  }

  // Handle real-time WebSocket notification push
  function handleWsNotification(data: NotificationItem) {
    notifications.value.unshift(data);
    unreadCount.value++;
  }

  function handleWsUnreadCount(count: number) {
    unreadCount.value = count;
  }

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    hasUnread,
    fetchUnreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    handleWsNotification,
    handleWsUnreadCount,
  };
});
