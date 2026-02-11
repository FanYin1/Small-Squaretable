import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { gdprRoutes } from './gdpr';
import { AppError } from '../../core/errors';

// Mock dependencies
vi.mock('../services/gdpr.service', () => ({
  gdprService: {
    exportUserData: vi.fn(),
    requestDeletion: vi.fn(),
    cancelDeletion: vi.fn(),
    getDeletionStatus: vi.fn(),
  },
}));

vi.mock('../services/audit.service', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

vi.mock('../../db/repositories/consent.repository', () => ({
  consentRepository: {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../core/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header: string | undefined) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

const mockUser = {
  id: 'user-123',
  tenantId: 'tenant-456',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  role: 'user' as const,
  isActive: true,
  passwordHash: 'hashed',
  emailVerified: true,
  emailVerificationToken: null,
  totpSecret: null,
  totpEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  followerCount: 0,
  followingCount: 0,
  deletionRequestedAt: null,
};

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer valid-token',
  };
}

async function setupAuthMocks() {
  const { verifyAccessToken } = await import('../../core/jwt');
  const { userRepository } = await import('../../db/repositories/user.repository');
  vi.mocked(verifyAccessToken).mockResolvedValue({
    userId: 'user-123',
    tenantId: 'tenant-456',
    email: 'test@example.com',
    role: 'user',
  });
  vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser } as any);
}

function testErrorHandler(err: Error, c: any) {
  if (err instanceof AppError) {
    return c.json(
      { success: false, error: { code: err.code, message: err.message } },
      err.statusCode,
    );
  }
  return c.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
    500,
  );
}

describe('GDPR Consent Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/account', gdprRoutes);
    app.onError(testErrorHandler);
    vi.clearAllMocks();
  });

  describe('GET /consents', () => {
    it('should return all consent preferences with defaults', async () => {
      await setupAuthMocks();
      const { consentRepository } = await import('../../db/repositories/consent.repository');

      vi.mocked(consentRepository.findByUserId).mockResolvedValue([
        {
          id: 'c1', userId: 'user-123', consentType: 'analytics',
          granted: true, grantedAt: new Date(), revokedAt: null,
          updatedAt: new Date('2026-01-15T00:00:00Z'),
        },
      ]);

      const res = await app.request('/api/v1/account/consents', {
        method: 'GET', headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.consents.analytics.granted).toBe(true);
      expect(data.data.consents.marketing.granted).toBe(false);
      expect(data.data.consents.cookies.granted).toBe(false);
      expect(data.data.consents.marketing.updatedAt).toBeNull();
    });

    it('should return all consents when all are set', async () => {
      await setupAuthMocks();
      const { consentRepository } = await import('../../db/repositories/consent.repository');
      const now = new Date('2026-02-01T00:00:00Z');

      vi.mocked(consentRepository.findByUserId).mockResolvedValue([
        { id: 'c1', userId: 'user-123', consentType: 'analytics', granted: true, grantedAt: now, revokedAt: null, updatedAt: now },
        { id: 'c2', userId: 'user-123', consentType: 'marketing', granted: false, grantedAt: null, revokedAt: now, updatedAt: now },
        { id: 'c3', userId: 'user-123', consentType: 'cookies', granted: true, grantedAt: now, revokedAt: null, updatedAt: now },
      ]);

      const res = await app.request('/api/v1/account/consents', {
        method: 'GET', headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.consents.analytics.granted).toBe(true);
      expect(data.data.consents.marketing.granted).toBe(false);
      expect(data.data.consents.cookies.granted).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const res = await app.request('/api/v1/account/consents', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /consents', () => {
    it('should update a single consent type', async () => {
      await setupAuthMocks();
      const { consentRepository } = await import('../../db/repositories/consent.repository');
      const { auditService } = await import('../services/audit.service');
      const now = new Date('2026-02-10T00:00:00Z');

      vi.mocked(consentRepository.upsert).mockResolvedValue({
        id: 'c1', userId: 'user-123', consentType: 'analytics',
        granted: true, grantedAt: now, revokedAt: null, updatedAt: now,
      });

      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ analytics: true }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.consents.analytics.granted).toBe(true);
      expect(consentRepository.upsert).toHaveBeenCalledWith('user-123', 'analytics', true);
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should update multiple consent types', async () => {
      await setupAuthMocks();
      const { consentRepository } = await import('../../db/repositories/consent.repository');
      const now = new Date('2026-02-10T00:00:00Z');

      vi.mocked(consentRepository.upsert)
        .mockResolvedValueOnce({
          id: 'c1', userId: 'user-123', consentType: 'analytics',
          granted: true, grantedAt: now, revokedAt: null, updatedAt: now,
        })
        .mockResolvedValueOnce({
          id: 'c2', userId: 'user-123', consentType: 'marketing',
          granted: false, grantedAt: null, revokedAt: now, updatedAt: now,
        });

      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ analytics: true, marketing: false }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.consents.analytics.granted).toBe(true);
      expect(data.data.consents.marketing.granted).toBe(false);
      expect(consentRepository.upsert).toHaveBeenCalledTimes(2);
    });

    it('should return 400 with empty body', async () => {
      await setupAuthMocks();

      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 with invalid consent values', async () => {
      await setupAuthMocks();

      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ analytics: 'yes' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics: true }),
      });

      expect(res.status).toBe(401);
    });

    it('should revoke consent (set granted to false)', async () => {
      await setupAuthMocks();
      const { consentRepository } = await import('../../db/repositories/consent.repository');
      const now = new Date('2026-02-10T00:00:00Z');

      vi.mocked(consentRepository.upsert).mockResolvedValue({
        id: 'c1', userId: 'user-123', consentType: 'cookies',
        granted: false, grantedAt: null, revokedAt: now, updatedAt: now,
      });

      const res = await app.request('/api/v1/account/consents', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ cookies: false }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.consents.cookies.granted).toBe(false);
      expect(consentRepository.upsert).toHaveBeenCalledWith('user-123', 'cookies', false);
    });
  });
});
