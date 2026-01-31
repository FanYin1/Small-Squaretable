/**
 * 认证服务
 *
 * 处理用户注册、登录、刷新令牌和登出
 */

import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { userRepository } from '../../db/repositories/user.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../core/jwt';
import { redis } from '../../core/redis';
import { UnauthorizedError, ValidationError } from '../../core/errors';
import type { RegisterInput, LoginInput, AuthTokens, AuthUser } from '../../types/auth';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export class AuthService {
  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const tenantId = nanoid();

    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      tenantId,
      displayName: input.displayName ?? null,
    });

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    await userRepository.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
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

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
  }

  private async generateTokens(userId: string, tenantId: string, email: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken({ userId, tenantId, email }),
      generateRefreshToken(userId),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
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

  private toAuthUser(user: any): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }
}

export const authService = new AuthService();
