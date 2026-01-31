/**
 * JWT 工具模块
 *
 * 使用 jose 库实现 JWT token 的生成和验证
 */

import * as jose from 'jose';
import { config } from './config';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

const getSecretKey = () => new TextEncoder().encode(config.jwtSecret);

export async function generateAccessToken(payload: AccessTokenPayload): Promise<string> {
  return await new jose.SignJWT({
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const tokenId = crypto.randomUUID();
  return await new jose.SignJWT({
    userId,
    tokenId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey());
  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
    email: payload.email as string,
  };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey());
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return {
    userId: payload.userId as string,
    tokenId: payload.tokenId as string,
  };
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
