/**
 * 认证相关类型定义
 */

import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100).optional(),
  /**
   * 满 18 岁声明。用 literal(true) 而不是 boolean()：
   * 传 false 和不传都应该是 400，而不是「注册成功但没声明」。
   */
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm you are at least 18 years old' }),
  }),
  /** 邀请码（注册采用邀请码制）。大小写不敏感，归一化在 service 层做。 */
  inviteCode: z
    .string({ required_error: 'Invite code is required' })
    .trim()
    .min(1, 'Invite code is required')
    .max(64, 'Invite code is too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'moderator' | 'admin';
  mfaEnabled?: boolean;
}

export interface AuthContext {
  user: AuthUser;
  tenantId: string;
}
