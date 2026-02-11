/**
 * 认证服务
 *
 * 处理用户注册、登录、刷新令牌和登出
 */

import bcrypt from 'bcrypt';
import crypto, { randomUUID } from 'crypto';
import { userRepository } from '../../db/repositories/user.repository';
import { tenantRepository } from '../../db/repositories/tenant.repository';
import { passwordResetRepository } from '../../db/repositories/password-reset.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../core/jwt';
import { redis } from '../../core/redis';
import { UnauthorizedError, ValidationError, BadRequestError } from '../../core/errors';
import { sendEmail } from '../../core/email';
import { config } from '../../core/config';
import { auditService } from './audit.service';
import type { RegisterInput, LoginInput, AuthTokens, AuthUser } from '../../types/auth';
import type { User } from '../../db/schema/users';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export type LoginResult =
  | { requiresMfa: false; user: AuthUser; tokens: AuthTokens }
  | { requiresMfa: true; mfaToken: string };

export class AuthService {
  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Create tenant first
    const tenant = await tenantRepository.create({
      name: input.displayName ?? input.email.split('@')[0],
      plan: 'free',
    });

    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      tenantId: tenant.id,
      displayName: input.displayName ?? null,
    });

    // Generate email verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
    await userRepository.update(user.id, { emailVerificationToken: verifyHash } as any);

    // Send verification email (fire-and-forget, don't block registration)
    sendEmail(user.email, 'email-verification', {
      name: input.displayName || 'there',
      link: `${config.appUrl}/auth/verify-email?token=${verifyToken}`,
    }).catch(() => {});

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email, user.role ?? 'user');
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      auditService.log({ tenantId: user.tenantId, actorId: input.email, action: 'login_failed' });
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // If TOTP is enabled, return MFA challenge instead of tokens
    if (user.totpEnabled) {
      const mfaToken = crypto.randomBytes(32).toString('hex');
      await redis.set(`mfa:${mfaToken}`, user.id, { EX: 300 });
      return { requiresMfa: true, mfaToken };
    }

    await userRepository.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email, user.role ?? 'user');
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    auditService.log({ tenantId: user.tenantId, actorId: user.id, action: 'login' });

    return {
      requiresMfa: false,
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await verifyRefreshToken(refreshToken);

    const storedToken = await redis.get(`${REFRESH_TOKEN_PREFIX}${payload.userId}`);
    if (!storedToken || storedToken !== payload.tokenId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email, user.role ?? 'user');
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, tenantId?: string): Promise<void> {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
    if (tenantId) {
      auditService.log({ tenantId, actorId: userId, action: 'logout' });
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) return; // Silent — don't reveal if email exists

    // Delete any existing tokens for this user
    await passwordResetRepository.deleteByUserId(user.id);

    // Generate random token, hash it, store hash
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await passwordResetRepository.create(user.id, tokenHash, expiresAt);

    // Send email with unhashed token in link
    await sendEmail(user.email, 'password-reset', {
      name: user.displayName || 'there',
      link: `${config.appUrl}/auth/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await passwordResetRepository.findByTokenHash(tokenHash);

    if (!record) throw new BadRequestError('Invalid or expired reset token');

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userRepository.updatePassword(record.userId, hash);
    await passwordResetRepository.markUsed(record.id);

    // Audit the password change
    const user = await userRepository.findById(record.userId);
    if (user) {
      auditService.log({ tenantId: user.tenantId, actorId: record.userId, action: 'password_change' });
    }

    // Invalidate all refresh tokens for this user
    await redis.del(`${REFRESH_TOKEN_PREFIX}${record.userId}`);
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await userRepository.findByVerificationToken(tokenHash);
    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }
    await userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
    } as any);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    if (user.emailVerified) {
      throw new BadRequestError('Email is already verified');
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
    await userRepository.update(user.id, { emailVerificationToken: verifyHash } as any);

    await sendEmail(user.email, 'email-verification', {
      name: user.displayName || 'there',
      link: `${config.appUrl}/auth/verify-email?token=${verifyToken}`,
    });
  }

  private async generateTokens(userId: string, tenantId: string, email: string, role: 'user' | 'moderator' | 'admin' = 'user'): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken({ userId, tenantId, email, role }),
      generateRefreshToken(userId),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 60 * 60, // 1 hour in seconds
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const payload = await verifyRefreshToken(refreshToken);
    await redis.set(
      `${REFRESH_TOKEN_PREFIX}${userId}`,
      payload.tokenId,
      { EX: REFRESH_TOKEN_TTL }
    );
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role ?? 'user',
    };
  }
}

export const authService = new AuthService();
