/**
 * Notification Preferences API
 *
 * Handles notification preference CRUD operations
 */

import { api } from './api';

export interface NotificationPreference {
  notificationType: string;
  inApp: boolean;
  email: boolean;
  emailFrequency: string;
}

export const notificationPreferencesApi = {
  getPreferences: () =>
    api.get<NotificationPreference[]>('/notification-preferences'),

  updatePreference: (type: string, settings: Partial<NotificationPreference>) =>
    api.put<NotificationPreference>(`/notification-preferences/${type}`, settings),

  bulkUpdatePreferences: (
    prefs: Array<{ type: string; inApp?: boolean; email?: boolean; emailFrequency?: string }>
  ) => api.put<NotificationPreference[]>('/notification-preferences', prefs),
};
