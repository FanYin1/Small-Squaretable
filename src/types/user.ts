/**
 * 用户相关类型定义
 */

import { z } from 'zod';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().max(4 * Math.ceil(MAX_AVATAR_BYTES / 3) + 64, '头像不能超过 5MB').optional(),
  bio: z.string().max(500).optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const updatePreferencesSchema = z.object({
  showNsfw: z.boolean(),
});

export type UpdateUserInput =z.infer<typeof updateUserSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
