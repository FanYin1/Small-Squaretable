import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { UnauthorizedError, ValidationError } from '../../core/errors';
import { InviteCodeError } from './invite-code.service';

const TX = { marker: 'tx' };
const { mockConsume, mockRecordUse, mockWithTransaction } = vi.hoisted(() => ({
  mockConsume: vi.fn(),
  mockRecordUse: vi.fn(),
  mockWithTransaction: vi.fn(),
}));

// 只 mock 到 repository 这一层：invite-code.service 的真实逻辑要参与，
// 这样测到的是「auth.service 是否真的把建号放进了邀请码事务」。
vi.mock('../../db/repositories/invite-code.repository', () => ({
  inviteCodeRepository: {
    withTransaction: mockWithTransaction,
    consume: mockConsume,
    recordUse: mockRecordUse,
  },
}));

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
    mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX));
    mockConsume.mockResolvedValue({ id: 'code-1' });
    mockRecordUse.mockResolvedValue(undefined);
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
        inviteCode: 'ABCD-2345-WXYZ',
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
          inviteCode: 'ABCD-2345-WXYZ',
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
        service.register({ email: 'test@example.com', password: 'password123', inviteCode: 'ABCD-2345-WXYZ' } as never)
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
        inviteCode: 'ABCD-2345-WXYZ',
      });

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ageConfirmedAt: expect.any(Date) }),
        expect.anything()
      );
    });

    it('IP 要哈希后再存，明文 IP 是没必要留的个人信息', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        ageConfirmed: true,
        inviteCode: 'ABCD-2345-WXYZ',
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
        inviteCode: 'ABCD-2345-WXYZ',
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
        inviteCode: 'ABCD-2345-WXYZ',
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

  describe('邀请码', () => {
    const base = {
      email: 'test@example.com',
      password: 'password123',
      ageConfirmed: true as const,
    };

    beforeEach(async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { tenantRepository } = await import('../../db/repositories/tenant.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
      } as any);
      vi.mocked(tenantRepository.create).mockResolvedValue({ id: '456', name: 'Test', plan: 'free' } as any);
    });

    async function expectNothingCreated() {
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { tenantRepository } = await import('../../db/repositories/tenant.repository');
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(tenantRepository.create).not.toHaveBeenCalled();
      expect(mockRecordUse).not.toHaveBeenCalled();
    }

    it.each([undefined, '', '   '])('缺码（%j）→ 400 INVITE_CODE_REQUIRED，不建租户不建用户', async (inviteCode) => {
      const err = await service.register({ ...base, inviteCode } as never).catch((e) => e);

      expect(err).toBeInstanceOf(InviteCodeError);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVITE_CODE_REQUIRED');
      expect(mockWithTransaction).not.toHaveBeenCalled();
      await expectNothingCreated();
    });

    it('错码 / 过期 / 用尽 / 禁用（consume 无返回行）→ 400 INVITE_CODE_INVALID，不建租户不建用户', async () => {
      mockConsume.mockResolvedValue(null);

      const err = await service
        .register({ ...base, inviteCode: 'WXYZ-2345-ABCD' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(InviteCodeError);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVITE_CODE_INVALID');
      await expectNothingCreated();
    });

    it('有效码：租户、用户、使用记录都在消费邀请码的同一个事务里', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { tenantRepository } = await import('../../db/repositories/tenant.repository');

      const result = await service.register({ ...base, inviteCode: ' abcd-2345-wxyz ' });

      expect(result.user.email).toBe('test@example.com');
      expect(mockConsume).toHaveBeenCalledWith('ABCD-2345-WXYZ', TX);
      expect(tenantRepository.create).toHaveBeenCalledWith(expect.anything(), TX);
      expect(userRepository.create).toHaveBeenCalledWith(expect.anything(), TX);
      expect(mockRecordUse).toHaveBeenCalledWith({ codeId: 'code-1', userId: '123' }, TX);
    });

    it('邮箱已注册 → 不消耗邀请码', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue({ id: '9' } as any);

      await expect(
        service.register({ ...base, inviteCode: 'ABCD-2345-WXYZ' })
      ).rejects.toThrow('Email already registered');

      expect(mockConsume).not.toHaveBeenCalled();
    });

    it('建用户失败 → 错误向外抛（事务回滚），不记录使用', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.create).mockRejectedValue(new Error('insert failed'));

      await expect(
        service.register({ ...base, inviteCode: 'ABCD-2345-WXYZ' })
      ).rejects.toThrow('insert failed');

      expect(mockRecordUse).not.toHaveBeenCalled();
    });

    it('使用邀请码写审计：谁、哪个码、来源', async () => {
      const { auditService } = await import('./audit.service');

      await service.register({ ...base, inviteCode: 'abcd-2345-wxyz', actorIp: '203.0.113.7' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'invite_code_use',
          actorId: '123',
          targetType: 'invite_code',
          targetId: 'code-1',
          metadata: expect.objectContaining({ code: 'ABCD-2345-WXYZ', source: 'register' }),
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
