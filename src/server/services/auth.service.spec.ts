import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { UnauthorizedError, ValidationError } from '../../core/errors';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(null),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
  },
}));

vi.mock('../../core/jwt', () => ({
  generateAccessToken: vi.fn().mockResolvedValue('access_token'),
  generateRefreshToken: vi.fn().mockResolvedValue('refresh_token'),
  verifyRefreshToken: vi.fn().mockResolvedValue({ userId: '123', tokenId: 'token123' }),
}));

vi.mock('../../core/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('token123'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../db/repositories/tenant.repository', () => ({
  tenantRepository: {
    create: vi.fn().mockResolvedValue({ id: '456', name: 'Test', plan: 'free' }),
    findById: vi.fn(),
  },
}));

vi.mock('../../db/repositories/password-reset.repository', () => ({
  passwordResetRepository: {
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    deleteByUserId: vi.fn(),
    markUsed: vi.fn(),
  },
}));

vi.mock('../../core/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../core/config', () => ({
  config: {
    appUrl: 'http://localhost:5173',
    jwtSecret: 'a'.repeat(32),
    jwtExpiresIn: '7d',
  },
}));

vi.mock('./audit.service', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
        displayName: null,
        avatarUrl: null,
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
    });

    it('should throw if email already exists', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: '123',
        email: 'existing@example.com',
      } as any);

      await expect(
        service.register({
          email: 'existing@example.com',
          password: 'password123',
          ageConfirmed: true,
        })
      ).rejects.toThrow('Email already registered');
    });
  });

  describe('满 18 岁声明', () => {
    beforeEach(async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
      } as any);
    });

    it('没勾成年声明就不能注册 —— 前端勾选不算证据，服务端必须自己拦', async () => {
      await expect(
        service.register({ email: 'test@example.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
    });

    it('声明为 false 时同样拒绝，不能靠字段存在与否判断', async () => {
      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          ageConfirmed: false,
        } as never)
      ).rejects.toThrow(ValidationError);
    });

    it('落库时记下声明时间点，只有 boolean 无法举证', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
      });

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ageConfirmedAt: expect.any(Date) })
      );
    });

    it('IP 要哈希后再存，明文 IP 是没必要留的个人信息', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
        actorIp: '203.0.113.7',
      });

      const call = vi.mocked(userRepository.create).mock.calls[0][0] as Record<string, unknown>;
      expect(call.ageConfirmedIp).toBeTruthy();
      expect(call.ageConfirmedIp).not.toBe('203.0.113.7');
      expect(call.ageConfirmedIp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('没有 IP 时照常注册，拿不到 IP 不该阻断注册', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
      });

      const call = vi.mocked(userRepository.create).mock.calls[0][0] as Record<string, unknown>;
      expect(call.ageConfirmedIp).toBeNull();
    });

    it('声明要留审计记录，和用户表分开存一份便于合规取证', async () => {
      const { auditService } = await import('./audit.service');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
        actorIp: '203.0.113.7',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'age_confirm',
          actorId: '123',
        })
      );
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
        displayName: null,
        avatarUrl: null,
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
    });

    it('should throw on invalid credentials', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@example.com', password: 'wrong' })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('refresh', () => {
    it('should refresh tokens', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
        displayName: null,
        avatarUrl: null,
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.refresh('refresh_token');
      expect(result.accessToken).toBe('access_token');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      await expect(service.logout('123')).resolves.not.toThrow();
    });
  });
});
