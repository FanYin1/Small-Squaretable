/**
 * MFA Routes
 *
 * Endpoints for TOTP 2FA setup, verification, disable, and challenge.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { totpService } from '../services/totp.service';
import { userRepository } from '../../db/repositories/user.repository';
import { backupCodeRepository } from '../../db/repositories/backup-code.repository';
import { redis } from '../../core/redis';
import { generateAccessToken, generateRefreshToken } from '../../core/jwt';
import { BadRequestError, UnauthorizedError } from '../../core/errors';
import type { ApiResponse } from '../../types/api';

const MFA_TOKEN_PREFIX = 'mfa:';
const MFA_TOKEN_TTL = 300; // 5 minutes
const MFA_ATTEMPT_PREFIX = 'mfa_attempts:';
const MFA_MAX_ATTEMPTS = 5;

export const mfaRoutes = new Hono();

// --- Setup: generate TOTP secret + QR code ---
mfaRoutes.post('/setup', authMiddleware(), async (c) => {
  const user = c.get('user');
  const dbUser = await userRepository.findById(user.id);
  if (!dbUser) throw new BadRequestError('User not found');

  if (dbUser.totpEnabled) {
    throw new BadRequestError('TOTP is already enabled');
  }

  const setup = await totpService.generateSetup(dbUser.email);

  // Store encrypted secret on user (but don't enable yet)
  await userRepository.update(user.id, { totpSecret: setup.encryptedSecret } as any);

  return c.json<ApiResponse>({
    success: true,
    data: {
      qrDataUrl: setup.qrDataUrl,
      secret: setup.base32Secret,
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

// --- Verify Setup: confirm TOTP code, enable 2FA, return backup codes ---
const verifySetupSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

mfaRoutes.post(
  '/verify-setup',
  authMiddleware(),
  zValidator('json', verifySetupSchema),
  async (c) => {
    const user = c.get('user');
    const { code } = c.req.valid('json');
    const dbUser = await userRepository.findById(user.id);
    if (!dbUser || !dbUser.totpSecret) {
      throw new BadRequestError('TOTP setup not initiated');
    }

    if (dbUser.totpEnabled) {
      throw new BadRequestError('TOTP is already enabled');
    }

    const valid = totpService.verify(dbUser.totpSecret, code);
    if (!valid) {
      throw new BadRequestError('Invalid TOTP code');
    }

    // Enable TOTP
    await userRepository.update(user.id, { totpEnabled: true } as any);

    // Generate backup codes
    await backupCodeRepository.deleteByUserId(user.id);
    const { plainCodes, hashedCodes } = await totpService.generateBackupCodes();
    await backupCodeRepository.createBatch(user.id, hashedCodes);

    return c.json<ApiResponse>({
      success: true,
      data: { backupCodes: plainCodes },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// --- Disable: require current TOTP code to disable ---
const disableSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

mfaRoutes.post(
  '/disable',
  authMiddleware(),
  zValidator('json', disableSchema),
  async (c) => {
    const user = c.get('user');
    const { code } = c.req.valid('json');
    const dbUser = await userRepository.findById(user.id);
    if (!dbUser || !dbUser.totpSecret || !dbUser.totpEnabled) {
      throw new BadRequestError('TOTP is not enabled');
    }

    const valid = totpService.verify(dbUser.totpSecret, code);
    if (!valid) {
      throw new BadRequestError('Invalid TOTP code');
    }

    await userRepository.update(user.id, {
      totpEnabled: false,
      totpSecret: null,
    } as any);
    await backupCodeRepository.deleteByUserId(user.id);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'TOTP has been disabled' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// --- Challenge: verify mfaToken + TOTP/backup code, return JWT pair ---
const challengeSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1),
});

mfaRoutes.post(
  '/challenge',
  zValidator('json', challengeSchema),
  async (c) => {
    const { mfaToken, code } = c.req.valid('json');

    // Rate limit per mfaToken
    const attemptKey = `${MFA_ATTEMPT_PREFIX}${mfaToken}`;
    const attemptsStr = await redis.get(attemptKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
    if (attempts >= MFA_MAX_ATTEMPTS) {
      // Burn the mfaToken
      await redis.del(`${MFA_TOKEN_PREFIX}${mfaToken}`);
      await redis.del(attemptKey);
      throw new UnauthorizedError('Too many MFA attempts. Please login again.');
    }

    // Increment attempts
    await redis.set(attemptKey, String(attempts + 1), { EX: MFA_TOKEN_TTL });

    // Validate mfaToken
    const userId = await redis.get(`${MFA_TOKEN_PREFIX}${mfaToken}`);
    if (!userId) {
      throw new UnauthorizedError('Invalid or expired MFA token');
    }

    const user = await userRepository.findById(userId);
    if (!user || !user.totpSecret || !user.totpEnabled) {
      throw new UnauthorizedError('MFA not configured for this user');
    }

    // Try TOTP code first
    let verified = false;
    if (code.length === 6) {
      verified = totpService.verify(user.totpSecret, code);
    }

    // If not a valid TOTP code, try backup code
    if (!verified) {
      const unusedCodes = await backupCodeRepository.findUnusedByUserId(userId);
      const match = await totpService.verifyBackupCode(code, unusedCodes);
      if (match) {
        await backupCodeRepository.markUsed(match.id);
        verified = true;
      }
    }

    if (!verified) {
      throw new BadRequestError('Invalid MFA code');
    }

    // Clean up
    await redis.del(`${MFA_TOKEN_PREFIX}${mfaToken}`);
    await redis.del(attemptKey);

    // Generate JWT pair
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role ?? 'user',
      }),
      generateRefreshToken(user.id),
    ]);

    await userRepository.updateLastLogin(user.id);

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role ?? 'user',
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 60 * 60,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// --- Regenerate backup codes ---
mfaRoutes.get('/backup-codes', authMiddleware(), async (c) => {
  const user = c.get('user');
  const dbUser = await userRepository.findById(user.id);
  if (!dbUser || !dbUser.totpEnabled) {
    throw new BadRequestError('TOTP is not enabled');
  }

  await backupCodeRepository.deleteByUserId(user.id);
  const { plainCodes, hashedCodes } = await totpService.generateBackupCodes();
  await backupCodeRepository.createBatch(user.id, hashedCodes);

  return c.json<ApiResponse>({
    success: true,
    data: { backupCodes: plainCodes },
    meta: { timestamp: new Date().toISOString() },
  });
});
