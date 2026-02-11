import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { mfaRoutes } from './mfa';
import { AppError } from '../../core/errors';

// Mock dependencies
vi.mock('../services/totp.service', () => ({
  totpService: {
    generateSetup: vi.fn(),
    verify: vi.fn(),
    generateBackupCodes: vi.fn(),
    verifyBackupCode: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    findByEmail: vi.fn(),
    updateLastLogin: vi.fn(),
  },
}));

vi.mock('../../db/repositories/backup-code.repository', () => ({
  backupCodeRepository: {
    createBatch: vi.fn(),
    findUnusedByUserId: vi.fn(),
    markUsed: vi.fn(),
    deleteByUserId: vi.fn(),
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
  generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  generateRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
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
  totpSecret: null as string | null,
  totpEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  followerCount: 0,
  followingCount: 0,
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

/** Simple error handler that mirrors the real one for tests */
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

describe('MFA Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/auth/mfa', mfaRoutes);
    app.onError(testErrorHandler);
    vi.clearAllMocks();
  });

  describe('POST /setup', () => {
    it('should return QR code and secret', async () => {
      await setupAuthMocks();
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpEnabled: false, totpSecret: null,
      } as any);
      vi.mocked(totpService.generateSetup).mockResolvedValue({
        encryptedSecret: 'encrypted-secret',
        uri: 'otpauth://totp/...',
        qrDataUrl: 'data:image/png;base64,abc',
        base32Secret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(userRepository.update).mockResolvedValue({} as any);

      const res = await app.request('/api/v1/auth/mfa/setup', {
        method: 'POST', headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.qrDataUrl).toBe('data:image/png;base64,abc');
      expect(data.data.secret).toBe('JBSWY3DPEHPK3PXP');
    });
  });

  describe('POST /verify-setup', () => {
    it('should enable TOTP and return backup codes with correct code', async () => {
      await setupAuthMocks();
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { backupCodeRepository } = await import('../../db/repositories/backup-code.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: false,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(true);
      vi.mocked(userRepository.update).mockResolvedValue({} as any);
      vi.mocked(backupCodeRepository.deleteByUserId).mockResolvedValue();
      vi.mocked(totpService.generateBackupCodes).mockResolvedValue({
        plainCodes: ['code1', 'code2', 'code3'],
        hashedCodes: ['hash1', 'hash2', 'hash3'],
      });
      vi.mocked(backupCodeRepository.createBatch).mockResolvedValue();

      const res = await app.request('/api/v1/auth/mfa/verify-setup', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ code: '123456' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.backupCodes).toEqual(['code1', 'code2', 'code3']);
      expect(userRepository.update).toHaveBeenCalledWith('user-123', { totpEnabled: true });
    });

    it('should return 400 with wrong code', async () => {
      await setupAuthMocks();
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: false,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(false);

      const res = await app.request('/api/v1/auth/mfa/verify-setup', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ code: '000000' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /disable', () => {
    it('should disable TOTP with correct code', async () => {
      await setupAuthMocks();
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { backupCodeRepository } = await import('../../db/repositories/backup-code.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: true,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(true);
      vi.mocked(userRepository.update).mockResolvedValue({} as any);
      vi.mocked(backupCodeRepository.deleteByUserId).mockResolvedValue();

      const res = await app.request('/api/v1/auth/mfa/disable', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ code: '123456' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        totpEnabled: false, totpSecret: null,
      });
    });

    it('should return 400 with wrong code', async () => {
      await setupAuthMocks();
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: true,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(false);

      const res = await app.request('/api/v1/auth/mfa/disable', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ code: '000000' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /challenge', () => {
    it('should return JWT pair with valid mfaToken + TOTP code', async () => {
      const { redis } = await import('../../core/redis');
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(redis.get)
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('user-123');
      vi.mocked(redis.set).mockResolvedValue(null);
      vi.mocked(redis.del).mockResolvedValue(1);
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: true,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(true);
      vi.mocked(userRepository.updateLastLogin).mockResolvedValue();

      const res = await app.request('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'valid-mfa-token', code: '123456' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tokens.accessToken).toBe('mock-access-token');
      expect(data.data.tokens.refreshToken).toBe('mock-refresh-token');
      expect(data.data.user.id).toBe('user-123');
    });

    it('should return JWT pair with valid mfaToken + backup code', async () => {
      const { redis } = await import('../../core/redis');
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { backupCodeRepository } = await import('../../db/repositories/backup-code.repository');

      vi.mocked(redis.get)
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('user-123');
      vi.mocked(redis.set).mockResolvedValue(null);
      vi.mocked(redis.del).mockResolvedValue(1);
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: true,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(false);
      const backupRecord = {
        id: 'backup-1', userId: 'user-123',
        codeHash: 'hashed-backup', usedAt: null, createdAt: new Date(),
      };
      vi.mocked(backupCodeRepository.findUnusedByUserId).mockResolvedValue([backupRecord]);
      vi.mocked(totpService.verifyBackupCode).mockResolvedValue(backupRecord);
      vi.mocked(backupCodeRepository.markUsed).mockResolvedValue();
      vi.mocked(userRepository.updateLastLogin).mockResolvedValue();

      const res = await app.request('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'valid-mfa-token', code: 'abcd1234' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tokens.accessToken).toBe('mock-access-token');
      expect(backupCodeRepository.markUsed).toHaveBeenCalledWith('backup-1');
    });

    it('should return 401 with expired mfaToken', async () => {
      const { redis } = await import('../../core/redis');

      vi.mocked(redis.get)
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce(null);
      vi.mocked(redis.set).mockResolvedValue(null);

      const res = await app.request('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'expired-token', code: '123456' }),
      });

      expect(res.status).toBe(401);
    });

    it('should rate limit to 5 attempts per mfaToken', async () => {
      const { redis } = await import('../../core/redis');

      vi.mocked(redis.get).mockResolvedValueOnce('5');
      vi.mocked(redis.del).mockResolvedValue(1);

      const res = await app.request('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'rate-limited-token', code: '123456' }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.message).toContain('Too many MFA attempts');
    });

    it('should return 400 with invalid MFA code', async () => {
      const { redis } = await import('../../core/redis');
      const { totpService } = await import('../services/totp.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { backupCodeRepository } = await import('../../db/repositories/backup-code.repository');

      vi.mocked(redis.get)
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('user-123');
      vi.mocked(redis.set).mockResolvedValue(null);
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser, totpSecret: 'encrypted-secret', totpEnabled: true,
      } as any);
      vi.mocked(totpService.verify).mockReturnValue(false);
      vi.mocked(backupCodeRepository.findUnusedByUserId).mockResolvedValue([]);
      vi.mocked(totpService.verifyBackupCode).mockResolvedValue(null);

      const res = await app.request('/api/v1/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: 'valid-mfa-token', code: 'wrong-code' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
