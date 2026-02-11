/**
 * GDPR API Service
 *
 * Handles data export, account deletion, and consent management
 * for GDPR compliance.
 */

import { api } from './api';

// ── Types ──

export interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledAt: string | null;
}

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  cookies: boolean;
}

// ── API methods ──

export const gdprApi = {
  /**
   * Export user data as ZIP file.
   * Uses fetch directly to handle binary blob response.
   */
  exportData: async (): Promise<Blob> => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    const response = await fetch('/api/v1/account/export', {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to export data');
    }

    return response.blob();
  },

  /** Request account deletion (requires password confirmation). */
  requestDeletion: (password: string) =>
    api.post<{ message: string }>('/account/delete', { password }),

  /** Cancel a pending account deletion request. */
  cancelDeletion: () =>
    api.post<{ message: string }>('/account/delete/cancel'),

  /** Get current deletion request status. */
  getDeletionStatus: () =>
    api.get<DeletionStatus>('/account/delete/status'),

  /** Get current consent preferences. */
  getConsents: () =>
    api.get<ConsentPreferences>('/account/consents'),

  /** Update consent preferences. */
  updateConsents: (consents: Partial<ConsentPreferences>) =>
    api.put<ConsentPreferences>('/account/consents', consents),
};
