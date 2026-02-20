import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAdminStore } from './admin';
import { adminApi } from '@client/services/admin.api';
import type { AdminUser, ContentReport, SystemStats, AuditLog } from '@client/services/admin.api';

vi.mock('@client/services/admin.api', () => ({
  adminApi: {
    getUsers: vi.fn(),
    changeRole: vi.fn(),
    suspendUser: vi.fn(),
    unsuspendUser: vi.fn(),
    forcePasswordReset: vi.fn(),
    getReports: vi.fn(),
    resolveReport: vi.fn(),
    getSystemStats: vi.fn(),
    getAuditLogs: vi.fn(),
  },
}));

const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u-1',
  email: 'user@test.com',
  displayName: 'Test User',
  role: 'user',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeReport = (overrides: Partial<ContentReport> = {}): ContentReport => ({
  id: 'r-1',
  reporterId: 'u-1',
  targetType: 'character',
  targetId: 'c-1',
  reason: 'Inappropriate content',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeStats = (overrides: Partial<SystemStats> = {}): SystemStats => ({
  totalUsers: 100,
  activeUsers30d: 50,
  totalCharacters: 200,
  pendingReports: 5,
  subscriptionBreakdown: { free: 70, pro: 25, team: 5 },
  recentSignups7d: 10,
  ...overrides,
});

const makeAuditLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 'al-1',
  userId: 'u-1',
  action: 'user.login',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Admin Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. Initial state
  it('should have correct initial state', () => {
    const store = useAdminStore();
    expect(store.users).toEqual([]);
    expect(store.usersTotal).toBe(0);
    expect(store.reports).toEqual([]);
    expect(store.reportsTotal).toBe(0);
    expect(store.systemStats).toBeNull();
    expect(store.auditLogs).toEqual([]);
    expect(store.auditLogsTotal).toBe(0);
    expect(store.error).toBeNull();
    expect(store.loadingUsers).toBe(false);
    expect(store.loadingReports).toBe(false);
    expect(store.loadingStats).toBe(false);
    expect(store.loadingAuditLogs).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  // 2. isLoading getter — true when any loading flag is true
  it('should return isLoading true when any loading flag is true', () => {
    const store = useAdminStore();
    expect(store.isLoading).toBe(false);

    store.loadingUsers = true;
    expect(store.isLoading).toBe(true);

    store.loadingUsers = false;
    store.loadingReports = true;
    expect(store.isLoading).toBe(true);

    store.loadingReports = false;
    store.loadingStats = true;
    expect(store.isLoading).toBe(true);

    store.loadingStats = false;
    store.loadingAuditLogs = true;
    expect(store.isLoading).toBe(true);
  });

  // 3. fetchUsers — success
  it('should fetch users and set users + total', async () => {
    const mockUsers = [makeUser({ id: 'u-1' }), makeUser({ id: 'u-2' })];
    vi.mocked(adminApi.getUsers).mockResolvedValue({
      users: mockUsers,
      total: 42,
      page: 1,
      limit: 20,
    });

    const store = useAdminStore();
    await store.fetchUsers({ page: 1, limit: 20 });

    expect(store.users).toEqual(mockUsers);
    expect(store.usersTotal).toBe(42);
    expect(store.loadingUsers).toBe(false);
    expect(store.error).toBeNull();
    expect(adminApi.getUsers).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  // 4. fetchUsers — error
  it('should set error when fetchUsers fails', async () => {
    vi.mocked(adminApi.getUsers).mockRejectedValue(new Error('Network error'));

    const store = useAdminStore();
    await store.fetchUsers();

    expect(store.error).toBe('Failed to load users');
    expect(store.loadingUsers).toBe(false);
    expect(store.users).toEqual([]);
  });

  // 5. changeUserRole — success
  it('should change user role and update in-place', async () => {
    const updated = makeUser({ id: 'u-1', role: 'admin' });
    vi.mocked(adminApi.changeRole).mockResolvedValue(updated);

    const store = useAdminStore();
    store.users = [makeUser({ id: 'u-1', role: 'user' }), makeUser({ id: 'u-2' })];

    const result = await store.changeUserRole('u-1', 'admin');

    expect(result).toBe(true);
    expect(store.users[0].role).toBe('admin');
    expect(adminApi.changeRole).toHaveBeenCalledWith('u-1', 'admin');
  });

  // 6. changeUserRole — error
  it('should return false and set error when changeUserRole fails', async () => {
    vi.mocked(adminApi.changeRole).mockRejectedValue(new Error('Forbidden'));

    const store = useAdminStore();
    store.users = [makeUser({ id: 'u-1' })];

    const result = await store.changeUserRole('u-1', 'admin');

    expect(result).toBe(false);
    expect(store.error).toBe('Failed to change user role');
  });

  // 7. suspendUser — success
  it('should suspend user and update in-place', async () => {
    const updated = makeUser({ id: 'u-1', isActive: false });
    vi.mocked(adminApi.suspendUser).mockResolvedValue(updated);

    const store = useAdminStore();
    store.users = [makeUser({ id: 'u-1', isActive: true })];

    const result = await store.suspendUser('u-1');

    expect(result).toBe(true);
    expect(store.users[0].isActive).toBe(false);
    expect(adminApi.suspendUser).toHaveBeenCalledWith('u-1');
  });

  // 8. suspendUser — error
  it('should return false when suspendUser fails', async () => {
    vi.mocked(adminApi.suspendUser).mockRejectedValue(new Error('Server error'));

    const store = useAdminStore();
    const result = await store.suspendUser('u-1');

    expect(result).toBe(false);
    expect(store.error).toBe('Failed to suspend user');
  });

  // 9. unsuspendUser — success
  it('should unsuspend user and update in-place', async () => {
    const updated = makeUser({ id: 'u-1', isActive: true });
    vi.mocked(adminApi.unsuspendUser).mockResolvedValue(updated);

    const store = useAdminStore();
    store.users = [makeUser({ id: 'u-1', isActive: false })];

    const result = await store.unsuspendUser('u-1');

    expect(result).toBe(true);
    expect(store.users[0].isActive).toBe(true);
    expect(adminApi.unsuspendUser).toHaveBeenCalledWith('u-1');
  });

  // 10. unsuspendUser — error
  it('should return false when unsuspendUser fails', async () => {
    vi.mocked(adminApi.unsuspendUser).mockRejectedValue(new Error('Server error'));

    const store = useAdminStore();
    const result = await store.unsuspendUser('u-1');

    expect(result).toBe(false);
    expect(store.error).toBe('Failed to unsuspend user');
  });

  // 11. forcePasswordReset — success
  it('should return true on successful forcePasswordReset', async () => {
    vi.mocked(adminApi.forcePasswordReset).mockResolvedValue(undefined as never);

    const store = useAdminStore();
    const result = await store.forcePasswordReset('u-1');

    expect(result).toBe(true);
    expect(adminApi.forcePasswordReset).toHaveBeenCalledWith('u-1');
  });

  // 12. forcePasswordReset — error
  it('should return false when forcePasswordReset fails', async () => {
    vi.mocked(adminApi.forcePasswordReset).mockRejectedValue(new Error('Server error'));

    const store = useAdminStore();
    const result = await store.forcePasswordReset('u-1');

    expect(result).toBe(false);
    expect(store.error).toBe('Failed to force password reset');
  });

  // 13. fetchReports — success
  it('should fetch reports and set reports + total', async () => {
    const mockReports = [makeReport({ id: 'r-1' }), makeReport({ id: 'r-2' })];
    vi.mocked(adminApi.getReports).mockResolvedValue({
      reports: mockReports,
      total: 15,
      page: 1,
      limit: 20,
    });

    const store = useAdminStore();
    await store.fetchReports({ status: 'pending' });

    expect(store.reports).toEqual(mockReports);
    expect(store.reportsTotal).toBe(15);
    expect(store.loadingReports).toBe(false);
    expect(store.error).toBeNull();
    expect(adminApi.getReports).toHaveBeenCalledWith({ status: 'pending' });
  });

  // 14. fetchReports — error
  it('should set error when fetchReports fails', async () => {
    vi.mocked(adminApi.getReports).mockRejectedValue(new Error('Network error'));

    const store = useAdminStore();
    await store.fetchReports();

    expect(store.error).toBe('Failed to load reports');
    expect(store.loadingReports).toBe(false);
  });

  // 15. resolveReport — success
  it('should resolve report and update in-place', async () => {
    const updated = makeReport({ id: 'r-1', status: 'resolved', resolution: 'Content removed' });
    vi.mocked(adminApi.resolveReport).mockResolvedValue(updated);

    const store = useAdminStore();
    store.reports = [makeReport({ id: 'r-1', status: 'pending' }), makeReport({ id: 'r-2' })];

    const result = await store.resolveReport('r-1', { action: 'approve', reason: 'Violation confirmed' });

    expect(result).toBe(true);
    expect(store.reports[0].status).toBe('resolved');
    expect(adminApi.resolveReport).toHaveBeenCalledWith('r-1', { action: 'approve', reason: 'Violation confirmed' });
  });

  // 16. resolveReport — error
  it('should return false when resolveReport fails', async () => {
    vi.mocked(adminApi.resolveReport).mockRejectedValue(new Error('Server error'));

    const store = useAdminStore();
    const result = await store.resolveReport('r-1', { action: 'dismiss' });

    expect(result).toBe(false);
    expect(store.error).toBe('Failed to resolve report');
  });

  // 17. fetchSystemStats — success
  it('should fetch and set system stats', async () => {
    const stats = makeStats();
    vi.mocked(adminApi.getSystemStats).mockResolvedValue(stats);

    const store = useAdminStore();
    await store.fetchSystemStats();

    expect(store.systemStats).toEqual(stats);
    expect(store.loadingStats).toBe(false);
    expect(store.error).toBeNull();
  });

  // 18. fetchSystemStats — error
  it('should set error when fetchSystemStats fails', async () => {
    vi.mocked(adminApi.getSystemStats).mockRejectedValue(new Error('Network error'));

    const store = useAdminStore();
    await store.fetchSystemStats();

    expect(store.error).toBe('Failed to load system stats');
    expect(store.loadingStats).toBe(false);
    expect(store.systemStats).toBeNull();
  });

  // 19. fetchAuditLogs — success
  it('should fetch audit logs and set logs + total', async () => {
    const mockLogs = [makeAuditLog({ id: 'al-1' }), makeAuditLog({ id: 'al-2' })];
    vi.mocked(adminApi.getAuditLogs).mockResolvedValue({
      logs: mockLogs,
      total: 100,
      page: 1,
      limit: 20,
    });

    const store = useAdminStore();
    await store.fetchAuditLogs({ action: 'user.login' });

    expect(store.auditLogs).toEqual(mockLogs);
    expect(store.auditLogsTotal).toBe(100);
    expect(store.loadingAuditLogs).toBe(false);
    expect(store.error).toBeNull();
    expect(adminApi.getAuditLogs).toHaveBeenCalledWith({ action: 'user.login' });
  });

  // 20. fetchAuditLogs — error
  it('should set error when fetchAuditLogs fails', async () => {
    vi.mocked(adminApi.getAuditLogs).mockRejectedValue(new Error('Network error'));

    const store = useAdminStore();
    await store.fetchAuditLogs();

    expect(store.error).toBe('Failed to load audit logs');
    expect(store.loadingAuditLogs).toBe(false);
  });

  // 21. $reset — clears all state
  it('should reset all state to initial values', async () => {
    const store = useAdminStore();

    // Populate state
    store.users = [makeUser()];
    store.usersTotal = 10;
    store.reports = [makeReport()];
    store.reportsTotal = 5;
    store.systemStats = makeStats();
    store.auditLogs = [makeAuditLog()];
    store.auditLogsTotal = 50;
    store.error = 'Some error';

    store.$reset();

    expect(store.users).toEqual([]);
    expect(store.usersTotal).toBe(0);
    expect(store.reports).toEqual([]);
    expect(store.reportsTotal).toBe(0);
    expect(store.systemStats).toBeNull();
    expect(store.auditLogs).toEqual([]);
    expect(store.auditLogsTotal).toBe(0);
    expect(store.error).toBeNull();
  });
});
