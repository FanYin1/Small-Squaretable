/**
 * Admin Store
 *
 * Pinia composition store for admin panel state management.
 * Manages users, content reports, system stats, and audit logs.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  adminApi,
  type AdminUser,
  type ContentReport,
  type SystemStats,
  type AuditLog,
  type AdminUserListParams,
  type ReportListParams,
  type ResolveReportInput,
  type AuditLogListParams,
} from '@client/services/admin.api';

export const useAdminStore = defineStore('admin', () => {
  // ── State ──

  const users = ref<AdminUser[]>([]);
  const usersTotal = ref(0);
  const reports = ref<ContentReport[]>([]);
  const reportsTotal = ref(0);
  const systemStats = ref<SystemStats | null>(null);
  const auditLogs = ref<AuditLog[]>([]);
  const auditLogsTotal = ref(0);

  const loadingUsers = ref(false);
  const loadingReports = ref(false);
  const loadingStats = ref(false);
  const loadingAuditLogs = ref(false);
  const error = ref<string | null>(null);

  // ── Getters ──

  const isLoading = computed(() =>
    loadingUsers.value || loadingReports.value || loadingStats.value || loadingAuditLogs.value
  );

  // ── Actions ──

  async function fetchUsers(params: AdminUserListParams = {}) {
    loadingUsers.value = true;
    error.value = null;
    try {
      const result = await adminApi.getUsers(params);
      users.value = result.users;
      usersTotal.value = result.total;
    } catch (e: unknown) {
      error.value = 'Failed to load users';
      console.error('Failed to fetch users', e);
    } finally {
      loadingUsers.value = false;
    }
  }

  async function changeUserRole(id: string, role: 'user' | 'moderator' | 'admin') {
    try {
      const updated = await adminApi.changeRole(id, role);
      const idx = users.value.findIndex(u => u.id === id);
      if (idx !== -1) users.value[idx] = updated;
      return true;
    } catch (e: unknown) {
      error.value = 'Failed to change user role';
      console.error('Failed to change role', e);
      return false;
    }
  }

  async function suspendUser(id: string) {
    try {
      const updated = await adminApi.suspendUser(id);
      const idx = users.value.findIndex(u => u.id === id);
      if (idx !== -1) users.value[idx] = updated;
      return true;
    } catch (e: unknown) {
      error.value = 'Failed to suspend user';
      console.error('Failed to suspend user', e);
      return false;
    }
  }

  async function unsuspendUser(id: string) {
    try {
      const updated = await adminApi.unsuspendUser(id);
      const idx = users.value.findIndex(u => u.id === id);
      if (idx !== -1) users.value[idx] = updated;
      return true;
    } catch (e: unknown) {
      error.value = 'Failed to unsuspend user';
      console.error('Failed to unsuspend user', e);
      return false;
    }
  }

  async function forcePasswordReset(id: string) {
    try {
      await adminApi.forcePasswordReset(id);
      return true;
    } catch (e: unknown) {
      error.value = 'Failed to force password reset';
      console.error('Failed to force password reset', e);
      return false;
    }
  }

  async function fetchReports(params: ReportListParams = {}) {
    loadingReports.value = true;
    error.value = null;
    try {
      const result = await adminApi.getReports(params);
      reports.value = result.reports;
      reportsTotal.value = result.total;
    } catch (e: unknown) {
      error.value = 'Failed to load reports';
      console.error('Failed to fetch reports', e);
    } finally {
      loadingReports.value = false;
    }
  }

  async function resolveReport(id: string, data: ResolveReportInput) {
    try {
      const updated = await adminApi.resolveReport(id, data);
      const idx = reports.value.findIndex(r => r.id === id);
      if (idx !== -1) reports.value[idx] = updated;
      return true;
    } catch (e: unknown) {
      error.value = 'Failed to resolve report';
      console.error('Failed to resolve report', e);
      return false;
    }
  }

  async function fetchSystemStats() {
    loadingStats.value = true;
    error.value = null;
    try {
      systemStats.value = await adminApi.getSystemStats();
    } catch (e: unknown) {
      error.value = 'Failed to load system stats';
      console.error('Failed to fetch system stats', e);
    } finally {
      loadingStats.value = false;
    }
  }

  async function fetchAuditLogs(params: AuditLogListParams = {}) {
    loadingAuditLogs.value = true;
    error.value = null;
    try {
      const result = await adminApi.getAuditLogs(params);
      auditLogs.value = result.logs;
      auditLogsTotal.value = result.total;
    } catch (e: unknown) {
      error.value = 'Failed to load audit logs';
      console.error('Failed to fetch audit logs', e);
    } finally {
      loadingAuditLogs.value = false;
    }
  }

  function $reset() {
    users.value = [];
    usersTotal.value = 0;
    reports.value = [];
    reportsTotal.value = 0;
    systemStats.value = null;
    auditLogs.value = [];
    auditLogsTotal.value = 0;
    error.value = null;
  }

  return {
    // State
    users,
    usersTotal,
    reports,
    reportsTotal,
    systemStats,
    auditLogs,
    auditLogsTotal,
    error,

    // Loading
    loadingUsers,
    loadingReports,
    loadingStats,
    loadingAuditLogs,
    isLoading,

    // Actions
    fetchUsers,
    changeUserRole,
    suspendUser,
    unsuspendUser,
    forcePasswordReset,
    fetchReports,
    resolveReport,
    fetchSystemStats,
    fetchAuditLogs,
    $reset,
  };
});
