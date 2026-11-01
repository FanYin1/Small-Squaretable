/**
 * 用户服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from './user.service';
import { userRepository } from '../../db/repositories/user.repository';
import { NotFoundError, ValidationError } from '../../core/errors';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../db/repositories/user.repository');
vi.mock('bcrypt');

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService(userRepository);
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        tenantId: 'tenant-123',
        isActive: true,
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);

      const result = await userService.getProfile(userId);

      expect(result).toEqual(mockUser);
      expect(userRepository.findById).toHaveBeenCalledWith(userId);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(userService.getProfile('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it.each(['missing', 'database-error'])('removes a newly uploaded avatar on %s', async failure => {
      const directory = await mkdtemp(join(tmpdir(), 'squaretable-user-avatar-'));
      try {
        const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#345678' } }).png().toBuffer();
        if (failure === 'missing') vi.mocked(userRepository.update).mockResolvedValue(null);
        else vi.mocked(userRepository.update).mockRejectedValueOnce(new Error('database unavailable'));
        await expect(new UserService(userRepository, directory).updateProfile('test', {
          avatarUrl: `data:image/png;base64,${image.toString('base64')}`,
        })).rejects.toThrow();
        expect(vi.mocked(userRepository.update).mock.calls[0][1].avatarUrl).toMatch(/^\/avatars\/.+\.webp$/);
        expect(await readdir(join(directory, 'avatars'))).toEqual([]);
      } finally { await rm(directory, { recursive: true, force: true }); }
    });

    it('should update user profile', async () => {
      const userId = 'user-123';
      const updateData = {
        displayName: 'Updated Name',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      };
      const mockUpdatedUser = {
        id: userId,
        email: 'test@example.com',
        ...updateData,
        tenantId: 'tenant-123',
        isActive: true,
      };

      vi.mocked(userRepository.update).mockResolvedValue(mockUpdatedUser as any);

      const result = await userService.updateProfile(userId, updateData);

      expect(result).toEqual(mockUpdatedUser);
      expect(userRepository.update).toHaveBeenCalledWith(userId, updateData);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(userRepository.update).mockResolvedValue(null);

      await expect(
        userService.updateProfile('non-existent', { displayName: 'New Name' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      const userId = 'user-123';
      const currentPassword = 'oldPassword123';
      const newPassword = 'newPassword123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed-old-password',
        tenantId: 'tenant-123',
        isActive: true,
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-new-password' as any);

      await userService.updatePassword(userId, currentPassword, newPassword);

      expect(userRepository.findById).toHaveBeenCalledWith(userId);
      expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(userRepository.updatePassword).toHaveBeenCalledWith(userId, 'hashed-new-password');
    });

    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(
        userService.updatePassword('non-existent', 'old', 'new')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if current password is incorrect', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        passwordHash: 'hashed-old-password',
      };

      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);

      await expect(
        userService.updatePassword(userId, 'wrongPassword', 'newPassword123')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      const userId = 'user-123';

      vi.mocked(userRepository.delete).mockResolvedValue(true);

      await userService.deleteAccount(userId);

      expect(userRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(userRepository.delete).mockResolvedValue(false);

      await expect(userService.deleteAccount('non-existent')).rejects.toThrow(NotFoundError);
    });
  });
});
