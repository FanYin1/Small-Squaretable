/**
 * Notification API
 *
 * Handles notification-related API requests
 */

import { api } from './api';
import type { NotificationItem } from '@/types/social';

export const notificationApi = {
  getNotifications: (limit = 20, offset = 0, unreadOnly = false) =>
    api.get<NotificationItem[]>(`/notifications?limit=${limit}&offset=${offset}&unreadOnly=${unreadOnly}`),
  getUnreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post<{ markedCount: number }>('/notifications/read-all'),
  deleteNotification: (id: string) => api.delete(`/notifications/${id}`),
};
