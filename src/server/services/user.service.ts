/**
 * 用户服务
 *
 * 处理用户资料管理、密码修改和账户删除
 */

import bcrypt from 'bcrypt';
import { userRepository } from '../../db/repositories/user.repository';
import { NotFoundError, ValidationError } from '../../core/errors';
import type { UpdateUserInput } from '../../types/user';

const SALT_ROUNDS = 12;

export class UserService {
  constructor(private userRepo = userRepository) {}

  async getProfile(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }

  async updateProfile(userId: string, data: UpdateUserInput) {
    const user = await this.userRepo.update(userId, data);
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (!user.passwordHash) {
      throw new ValidationError('User does not have a password set');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userRepo.updatePassword(userId, passwordHash);
  }

  async deleteAccount(userId: string) {
    const deleted = await this.userRepo.delete(userId);
    if (!deleted) {
      throw new NotFoundError('User');
    }
  }
}

export const userService = new UserService();
