/**
 * AuditService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock the audit repository
const mockCreate = vi.fn();
const mockFindByTenant = vi.fn();
const mockDeleteOlderThan = vi.fn();

vi.mock('../../db/repositories/audit.repository', () => ({
  auditRepository: {
    create: (...args: unknown[]) => mockCreate(...args),
    findByTenant: (...args: unknown[]) => mockFindByTenant(...args),
    deleteOlderThan: (...args: unknown[]) => mockDeleteOlderThan(...args),
  },
}));

// Import after mocks are set up
import { auditService } from './audit.service';

// --- Helpers ---

const NOW = new Date('2026-02-11T12:00:00Z');

function fakeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    tenantId: 'tenant-1',
    actorId: 'user-1',
    actorIp: null,
    action: 'user.login',
    targetType: null,
    targetId: null,
    metadata: {},
    createdAt: NOW,
    ...overrides,
  };
}

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- log() ---
  describe('log', () => {
    it('should create audit record with correct fields', async () => {
      mockCreate.mockResolvedValue(fakeAuditLog());

      auditService.log({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'user.login',
        metadata: { browser: 'Chrome' },
      });

      // Give the fire-and-forget promise time to resolve
      await vi.waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });

      const createArg = mockCreate.mock.calls[0][0];
      expect(createArg.tenantId).toBe('tenant-1');
      expect(createArg.actorId).toBe('user-1');
      expect(createArg.action).toBe('user.login');
      expect(createArg.metadata).toEqual({ browser: 'Chrome' });
      expect(createArg.actorIp).toBeNull();
    });

    it('should hash IP address (not stored in plain text)', async () => {
      mockCreate.mockResolvedValue(fakeAuditLog());
      const rawIp = '192.168.1.100';

      auditService.log({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'user.login',
        actorIp: rawIp,
      });

      await vi.waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });

      const createArg = mockCreate.mock.calls[0][0];
      // Should NOT be the raw IP
      expect(createArg.actorIp).not.toBe(rawIp);
      // Should be a 16-char hex string (first 16 chars of SHA-256)
      expect(createArg.actorIp).toHaveLength(16);
      expect(createArg.actorIp).toMatch(/^[0-9a-f]{16}$/);
      // Should match the expected hash
      const expectedHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);
      expect(createArg.actorIp).toBe(expectedHash);
    });

    it('should not throw on DB error (fire-and-forget)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCreate.mockRejectedValue(new Error('DB connection lost'));

      // This should NOT throw
      expect(() => {
        auditService.log({
          tenantId: 'tenant-1',
          actorId: 'user-1',
          action: 'user.login',
        });
      }).not.toThrow();

      // Wait for the rejected promise to be caught
      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[AuditService] Failed to write audit log:',
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });

    it('should set actorIp to null when not provided', async () => {
      mockCreate.mockResolvedValue(fakeAuditLog());

      auditService.log({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'user.logout',
      });

      await vi.waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });

      expect(mockCreate.mock.calls[0][0].actorIp).toBeNull();
    });

    it('should default metadata to empty object when not provided', async () => {
      mockCreate.mockResolvedValue(fakeAuditLog());

      auditService.log({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'user.login',
      });

      await vi.waitFor(() => {
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });

      expect(mockCreate.mock.calls[0][0].metadata).toEqual({});
    });
  });

  // --- findByTenant() ---
  describe('findByTenant', () => {
    it('should return paginated results with filters', async () => {
      const paginatedResult = {
        items: [fakeAuditLog(), fakeAuditLog({ id: 'audit-2', action: 'character.create' })],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };
      mockFindByTenant.mockResolvedValue(paginatedResult);

      const result = await auditService.findByTenant(
        'tenant-1',
        { action: 'user.login' },
        { page: 1, limit: 20 },
      );

      expect(mockFindByTenant).toHaveBeenCalledWith(
        'tenant-1',
        { action: 'user.login' },
        { page: 1, limit: 20 },
      );
      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should pass through all filter parameters', async () => {
      mockFindByTenant.mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } });

      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-02-01');

      await auditService.findByTenant('tenant-1', {
        actorId: 'user-1',
        action: 'user.login',
        targetType: 'character',
        dateFrom,
        dateTo,
      });

      expect(mockFindByTenant).toHaveBeenCalledWith(
        'tenant-1',
        {
          actorId: 'user-1',
          action: 'user.login',
          targetType: 'character',
          dateFrom,
          dateTo,
        },
        undefined,
      );
    });
  });

  // --- deleteOlderThan() ---
  describe('deleteOlderThan', () => {
    it('should remove old records and return count', async () => {
      mockDeleteOlderThan.mockResolvedValue(5);

      const cutoffDate = new Date('2025-01-01');
      const count = await auditService.deleteOlderThan('tenant-1', cutoffDate);

      expect(mockDeleteOlderThan).toHaveBeenCalledWith('tenant-1', cutoffDate);
      expect(count).toBe(5);
    });

    it('should return 0 when no records to delete', async () => {
      mockDeleteOlderThan.mockResolvedValue(0);

      const count = await auditService.deleteOlderThan('tenant-1', new Date());

      expect(count).toBe(0);
    });
  });
});
