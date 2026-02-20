/**
 * Admin API Service
 *
 * Handles admin panel API requests for user management,
 * content moderation, system stats, and audit logs.
 */

import { api } from './api';

// ── Types ──

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'moderator' | 'admin';
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AdminUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface ContentReport {
  id: string;
  reporterId: string;
  reporterEmail?: string;
  targetType: 'character' | 'comment' | 'chat_message';
  targetId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ReportListParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'resolved' | 'dismissed';
}

export interface ReportListResponse {
  reports: ContentReport[];
  total: number;
  page: number;
  limit: number;
}

export interface ResolveReportInput {
  action: 'approve' | 'reject' | 'dismiss';
  reason?: string;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers30d: number;
  totalCharacters: number;
  pendingReports: number;
  subscriptionBreakdown: {
    free: number;
    pro: number;
    team: number;
  };
  recentSignups7d: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditLogListParams {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
}

export interface AuditLogListResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ── API methods ──

function buildQuery<T extends object>(params: T): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export const adminApi = {
  // ── Users ──

  getUsers: (params: AdminUserListParams = {}) =>
    api.get<AdminUserListResponse>('/admin/users' + buildQuery(params)),

  getUser: (id: string) =>
    api.get<AdminUser>(`/admin/users/${id}`),

  changeRole: (id: string, role: 'user' | 'moderator' | 'admin') =>
    api.patch<AdminUser>(`/admin/users/${id}/role`, { role }),

  suspendUser: (id: string) =>
    api.post<AdminUser>(`/admin/users/${id}/suspend`),

  unsuspendUser: (id: string) =>
    api.post<AdminUser>(`/admin/users/${id}/unsuspend`),

  forcePasswordReset: (id: string) =>
    api.post<void>(`/admin/users/${id}/force-password-reset`),

  // ── Content Reports ──

  getReports: (params: ReportListParams = {}) =>
    api.get<ReportListResponse>('/admin/content/reports' + buildQuery(params)),

  getReport: (id: string) =>
    api.get<ContentReport>(`/admin/content/reports/${id}`),

  resolveReport: (id: string, data: ResolveReportInput) =>
    api.post<ContentReport>(`/admin/content/reports/${id}/resolve`, data),

  // ── System ──

  getSystemStats: () =>
    api.get<SystemStats>('/admin/system/stats'),

  // ── Audit Logs ──

  getAuditLogs: (params: AuditLogListParams = {}) =>
    api.get<AuditLogListResponse>('/admin/audit-logs' + buildQuery(params)),
};
