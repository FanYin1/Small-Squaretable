import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../../core/errors';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock user repository
vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  },
}));

// Mock subscription repository
vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  },
}));

// Mock audit service
vi.mock('./audit.service', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

// Mock redis
vi.mock('../../core/redis', () => ({
  redis: {
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  },
}));

// Mock email
vi.mock('../../core/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock db (for direct queries in executeDeletion and processExpiredDeletions)
const mockDbUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});
const mockDbSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});
vi.mock('../../db', () => ({
  db: {
    update: (...args: any[]) => mockDbUpdate(...args),
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

vi.mock('../../db/schema/users', () => ({
  users: {
    id: 'id',
    deletionRequestedAt: 'deletion_requested_at',
  },
}));

vi.mock('../../db/schema/audit-logs', () => ({
  auditLogs: {
    actorId: 'actor_id',
  },
}));

// Mock remaining repositories used by exportUserData (not under test here but needed for import)
vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: { findByTenantId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: { findByChatId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/rating.repository', () => ({
  ratingRepository: { findByCharacterId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/comment.repository', () => ({
  commentRepository: {},
}));
vi.mock('../../db/repositories/favorite.repository', () => ({
  favoriteRepository: { getFavoritesByUser: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/follow.repository', () => ({
  followRepository: { getFollowing: vi.fn().mockResolvedValue([]), getFollowers: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/apiKey.repository', () => ({
  apiKeyRepository: { findByUserId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../db/repositories/plugin.repository', () => ({
  pluginRepository: { findInstallsByUserId: vi.fn().mockResolvedValue([]) },
}));
vi.mock('archiver', () => ({
  default: vi.fn(),
}));

const mockUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  displayName: 'Test User',
  avatarUrl: null,
  role: 'user' as const,
  isActive: true,
  emailVerified: true,
  emailVerificationToken: null,
  totpSecret: null,
  totpEnabled: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  lastLoginAt: null,
  deletionRequestedAt: null as Date | null,
  followerCount: 0,
  followingCount: 0,
};

describe('GDPR Deletion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestDeletion', () => {
    it('should set deletionRequestedAt with correct password', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const bcrypt = (await import('bcrypt')).default;

      vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser, deletionRequestedAt: null });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(userRepository.update).mockResolvedValue({ ...mockUser, deletionRequestedAt: new Date() });

      const result = await gdprService.requestDeletion('user-1', 'tenant-1', 'correct-password');

      expect(result.scheduledAt).toBeInstanceOf(Date);
      expect(result.scheduledAt.getTime()).toBeGreaterThan(Date.now());
      expect(userRepository.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        deletionRequestedAt: expect.any(Date),
      }));
    });

    it('should return 401 with wrong password', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const bcrypt = (await import('bcrypt')).default;

      vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        gdprService.requestDeletion('user-1', 'tenant-1', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should return existing scheduled date if already requested', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const bcrypt = (await import('bcrypt')).default;

      const requestedAt = new Date('2025-06-01');
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: requestedAt,
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await gdprService.requestDeletion('user-1', 'tenant-1', 'correct-password');

      // Should not call update again
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(result.scheduledAt.getTime()).toBe(
        requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
    });

    it('should create audit log on request', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { auditService } = await import('./audit.service');
      const bcrypt = (await import('bcrypt')).default;

      vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser, deletionRequestedAt: null });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(userRepository.update).mockResolvedValue({ ...mockUser });

      await gdprService.requestDeletion('user-1', 'tenant-1', 'correct-password');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          actorId: 'user-1',
          action: 'account_delete_request',
        }),
      );
    });
  });

  describe('cancelDeletion', () => {
    it('should clear deletionRequestedAt', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: new Date(),
      });
      vi.mocked(userRepository.update).mockResolvedValue({ ...mockUser, deletionRequestedAt: null });

      await gdprService.cancelDeletion('user-1', 'tenant-1');

      expect(userRepository.update).toHaveBeenCalledWith('user-1', { deletionRequestedAt: null });
    });

    it('should throw if no pending deletion', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: null,
      });

      await expect(
        gdprService.cancelDeletion('user-1', 'tenant-1'),
      ).rejects.toThrow(BadRequestError);
    });

    it('should create audit log on cancel', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { auditService } = await import('./audit.service');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: new Date(),
      });
      vi.mocked(userRepository.update).mockResolvedValue({ ...mockUser });

      await gdprService.cancelDeletion('user-1', 'tenant-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'account_delete_cancel',
          actorId: 'user-1',
        }),
      );
    });
  });

  describe('executeDeletion', () => {
    it('should delete user and anonymize audit logs', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { redis } = await import('../../core/redis');

      vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser });

      await gdprService.executeDeletion('user-1');

      // Should anonymize audit logs (db.update called)
      expect(mockDbUpdate).toHaveBeenCalled();
      // Should delete Redis refresh token
      expect(redis.del).toHaveBeenCalledWith('refresh_token:user-1');
      // Should delete user
      expect(userRepository.delete).toHaveBeenCalledWith('user-1');
    });

    it('should cancel Stripe subscription if active', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({ ...mockUser });
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
        id: 'sub-1',
        tenantId: 'tenant-1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
        plan: 'pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await gdprService.executeDeletion('user-1');

      expect(subscriptionRepository.update).toHaveBeenCalledWith('sub-1', expect.objectContaining({
        status: 'canceled',
        cancelAtPeriodEnd: true,
      }));
    });

    it('should throw NotFoundError for non-existent user', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(gdprService.executeDeletion('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('processExpiredDeletions', () => {
    it('should only process users past grace period', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      // Mock db.select to return one expired user
      const mockWhere = vi.fn().mockResolvedValue([{ id: 'expired-user' }]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      // Mock findById for executeDeletion
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        id: 'expired-user',
      });

      const count = await gdprService.processExpiredDeletions();

      expect(count).toBe(1);
      expect(userRepository.delete).toHaveBeenCalledWith('expired-user');
    });

    it('should return 0 when no expired deletions', async () => {
      const { gdprService } = await import('./gdpr.service');

      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const count = await gdprService.processExpiredDeletions();

      expect(count).toBe(0);
    });
  });

  describe('getDeletionStatus', () => {
    it('should return pending: false when no deletion requested', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: null,
      });

      const status = await gdprService.getDeletionStatus('user-1');

      expect(status.pending).toBe(false);
      expect(status.requestedAt).toBeNull();
      expect(status.scheduledAt).toBeNull();
    });

    it('should return correct status when deletion is pending', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const requestedAt = new Date('2025-06-01');
      vi.mocked(userRepository.findById).mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: requestedAt,
      });

      const status = await gdprService.getDeletionStatus('user-1');

      expect(status.pending).toBe(true);
      expect(status.requestedAt).toEqual(requestedAt);
      expect(status.scheduledAt!.getTime()).toBe(
        requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
    });

    it('should throw NotFoundError for non-existent user', async () => {
      const { gdprService } = await import('./gdpr.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(gdprService.getDeletionStatus('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});
