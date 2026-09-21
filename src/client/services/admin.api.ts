/**
 * Admin API Service
 *
 * Handles admin panel API requests for user management,
 * content moderation, system stats, and audit logs.
 */

import { api } from './api';
import type { ModerationStatusValue, ViolationCategory } from '@/types/moderation';

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

export interface AdminUserDetail extends AdminUser {
  avatarUrl?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  oauthAccounts?: { provider: string; providerEmail?: string }[];
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

/**
 * 待审队列条目。
 *
 * 和举报不是一回事：举报队列只装被投诉过的内容，这里装的是作者主动提交、
 * 还没被任何人看过的角色。公开发现入口要求 approved，所以这批内容在审完
 * 之前对所有人不可见。
 */
export interface ModerationQueueItem {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorId: string;
  isNsfw?: boolean;
  moderationStatus: ModerationStatusValue;
  violationCategory?: ViolationCategory;
  moderationNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationQueueParams {
  status?: ModerationStatusValue;
  page?: number;
  limit?: number;
}

export interface ModerationQueueResponse {
  items: ModerationQueueItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RejectCharacterInput {
  category?: ViolationCategory;
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
    api.get<AdminUserDetail>(`/admin/users/${id}`),

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

  // ── Moderation Queue ──
  // 默认 pending：后台打开就该看到待办，而不是一张空列表。

  getModerationQueue: (params: ModerationQueueParams = {}) =>
    api.get<ModerationQueueResponse>(
      '/admin/content/characters' + buildQuery({ status: 'pending', ...params }),
    ),

  /** 通过 = unhide，服务端记 'approve' 动作并把状态写成 approved */
  approveCharacter: (id: string) =>
    api.post<void>(`/admin/content/unhide/character/${id}`),

  /**
   * 驳回：走 reject 而不是 hide。hide → 'hidden'，作者无法自行撤销；
   * reject → 'rejected'，作者改完能重新提交。分类和理由都会回显给作者。
   */
  rejectCharacter: (id: string, data: RejectCharacterInput) =>
    api.post<void>(`/admin/content/reject/character/${id}`, data),

  /** 下架已上线的内容：作者点发布也回不来，属于处置而非审核结论 */
  hideCharacter: (id: string, data: RejectCharacterInput = {}) =>
    api.post<void>(`/admin/content/hide/character/${id}`, data),

  // ── System ──

  getSystemStats: () =>
    api.get<SystemStats>('/admin/system/stats'),

  // ── Audit Logs ──

  getAuditLogs: (params: AuditLogListParams = {}) =>
    api.get<AuditLogListResponse>('/admin/audit-logs' + buildQuery(params)),
};
