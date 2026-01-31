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
    updateLastLogin: vi.fn(),
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
        service.register({ email: 'existing@example.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
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
