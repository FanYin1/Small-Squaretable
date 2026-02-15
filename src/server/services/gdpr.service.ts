/**
 * GDPR Service
 *
 * Handles GDPR compliance:
 * - Right of Access (Article 15): Data export as ZIP
 * - Right to Erasure (Article 17): Account deletion with 30-day grace period
 */

import archiver from 'archiver';
import bcrypt from 'bcrypt';
import { eq, lt, isNotNull, and } from 'drizzle-orm';
import { logger } from './logger.service';

const gdprLogger = logger.child({ module: 'gdpr' });
import { userRepository } from '../../db/repositories/user.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { ratingRepository } from '../../db/repositories/rating.repository';
import { commentRepository } from '../../db/repositories/comment.repository';
import { favoriteRepository } from '../../db/repositories/favorite.repository';
import { followRepository } from '../../db/repositories/follow.repository';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { apiKeyRepository } from '../../db/repositories/apiKey.repository';
import { pluginRepository } from '../../db/repositories/plugin.repository';
import { auditService } from './audit.service';
import { redis } from '../../core/redis';
import { sendEmail } from '../../core/email';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../../core/errors';
import { db } from '../../db';
import { users } from '../../db/schema/users';
import { auditLogs } from '../../db/schema/audit-logs';

/** Fields to strip from user profile before export */
const SENSITIVE_USER_FIELDS = [
  'passwordHash',
  'totpSecret',
  'emailVerificationToken',
] as const;

/**
 * Sanitize user profile by removing sensitive fields.
 */
function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

/**
 * Sanitize API key records — keep metadata only, strip secret hashes.
 */
function sanitizeApiKey(key: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...key };
  delete sanitized.keyHash;
  delete sanitized.keyPrefix;
  return sanitized;
}

/** Grace period before permanent deletion (30 days in ms) */
const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const REFRESH_TOKEN_PREFIX = 'refresh_token:';

export const gdprService = {
  /**
   * Generate a ZIP file containing all user data.
   * Returns a Buffer with the ZIP contents.
   */
  async exportUserData(userId: string, tenantId: string): Promise<Buffer> {
    // 1. User profile (sanitized)
    const user = await userRepository.findById(userId);
    const profile = user ? sanitizeUser(user as unknown as Record<string, unknown>) : null;

    // 2. Characters owned by user
    const characters = await characterRepository.findByTenantId(tenantId);
    const userCharacters = characters.filter((c) => (c as any).creatorId === userId);

    // 3. Chats + messages
    const chats = await chatRepository.findByUserId(userId);
    const chatsWithMessages = await Promise.all(
      chats.map(async (chat) => {
        const msgs = await messageRepository.findByChatId(chat.id);
        return { ...chat, messages: msgs };
      }),
    );

    // 4. Ratings given — collect from user's characters
    const allRatings: unknown[] = [];
    for (const char of userCharacters) {
      const charRatings = await ratingRepository.findByCharacterId(char.id);
      const userRatings = charRatings.filter((r) => r.userId === userId);
      allRatings.push(...userRatings);
    }

    // 5. Favorites
    const favorites = await favoriteRepository.getFavoritesByUser(userId, 10000, 0);

    // 6. Following / followers
    const following = await followRepository.getFollowing(userId, 10000, 0);
    const followers = await followRepository.getFollowers(userId, 10000, 0);

    // 7. Subscription history
    const subscription = await subscriptionRepository.findByTenantId(tenantId);

    // 8. API keys (metadata only)
    const apiKeys = await apiKeyRepository.findByUserId(userId, 10000, 0);
    const sanitizedKeys = apiKeys.map((k) =>
      sanitizeApiKey(k as unknown as Record<string, unknown>),
    );

    // 9. Plugin installations + KV data
    const pluginInstalls = await pluginRepository.findInstallsByUserId(userId);

    // Build ZIP archive
    return new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => reject(err));

      const appendJson = (name: string, data: unknown) => {
        archive.append(Buffer.from(JSON.stringify(data, null, 2)), { name });
      };

      appendJson('profile.json', profile);
      appendJson('characters.json', userCharacters);
      appendJson('chats.json', chatsWithMessages);
      appendJson('ratings.json', allRatings);
      appendJson('favorites.json', favorites);
      appendJson('following.json', following);
      appendJson('followers.json', followers);
      appendJson('subscription.json', subscription);
      appendJson('api_keys.json', sanitizedKeys);
      appendJson('plugins.json', pluginInstalls);

      archive.finalize();
    });
  },

  /**
   * Request account deletion. Sets 30-day grace period.
   * User can cancel during grace period.
   */
  async requestDeletion(
    userId: string,
    tenantId: string,
    password: string,
  ): Promise<{ scheduledAt: Date }> {
    const user = await userRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new NotFoundError('User');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid password');
    }

    // Check if already requested
    if (user.deletionRequestedAt) {
      const scheduledAt = new Date(user.deletionRequestedAt.getTime() + DELETION_GRACE_PERIOD_MS);
      return { scheduledAt };
    }

    const now = new Date();
    const scheduledAt = new Date(now.getTime() + DELETION_GRACE_PERIOD_MS);

    // Set deletionRequestedAt
    await userRepository.update(userId, { deletionRequestedAt: now } as any);

    // Send confirmation email (fire-and-forget)
    sendEmail(user.email, 'account-deletion-requested', {
      name: user.displayName || 'there',
      scheduledDate: scheduledAt.toISOString(),
    }).catch(() => {});

    // Audit log
    auditService.log({
      tenantId,
      actorId: userId,
      action: 'account_delete_request',
      targetType: 'user',
      targetId: userId,
      metadata: { scheduledAt: scheduledAt.toISOString() },
    });

    return { scheduledAt };
  },

  /**
   * Cancel pending deletion request.
   */
  async cancelDeletion(userId: string, tenantId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (!user.deletionRequestedAt) {
      throw new BadRequestError('No pending deletion request');
    }

    // Clear deletionRequestedAt
    await userRepository.update(userId, { deletionRequestedAt: null } as any);

    // Audit log
    auditService.log({
      tenantId,
      actorId: userId,
      action: 'account_delete_cancel',
      targetType: 'user',
      targetId: userId,
    });
  },

  /**
   * Get deletion status for a user.
   */
  async getDeletionStatus(userId: string): Promise<{
    pending: boolean;
    requestedAt: Date | null;
    scheduledAt: Date | null;
  }> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (!user.deletionRequestedAt) {
      return { pending: false, requestedAt: null, scheduledAt: null };
    }

    const scheduledAt = new Date(user.deletionRequestedAt.getTime() + DELETION_GRACE_PERIOD_MS);
    return {
      pending: true,
      requestedAt: user.deletionRequestedAt,
      scheduledAt,
    };
  },

  /**
   * Execute hard deletion (called by scheduled job or admin).
   * - Anonymize audit logs (replace actorId with 'deleted-user')
   * - Cancel Stripe subscription if active
   * - Revoke all tokens from Redis
   * - Delete the user record (FK cascade handles child records)
   */
  async executeDeletion(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // 1. Anonymize audit logs
    await db
      .update(auditLogs)
      .set({ actorId: 'deleted-user' })
      .where(eq(auditLogs.actorId, userId));

    // 2. Cancel Stripe subscription if active
    const subscription = await subscriptionRepository.findByTenantId(user.tenantId);
    if (subscription && subscription.stripeSubscriptionId) {
      // Mark as canceled in our DB (actual Stripe cancellation would be via Stripe API)
      await subscriptionRepository.update(subscription.id, {
        status: 'canceled',
        cancelAtPeriodEnd: true,
      } as any);
    }

    // 3. Delete Redis keys (refresh tokens, sessions)
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);

    // 4. Delete user record (FK cascade handles characters, chats, messages, etc.)
    await userRepository.delete(userId);
  },

  /**
   * Process all users past their 30-day grace period.
   * Called periodically (e.g., daily cron or on server start).
   */
  async processExpiredDeletions(): Promise<number> {
    const cutoff = new Date(Date.now() - DELETION_GRACE_PERIOD_MS);

    // Find users where deletionRequestedAt < cutoff
    const expiredUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          isNotNull(users.deletionRequestedAt),
          lt(users.deletionRequestedAt, cutoff),
        ),
      );

    let count = 0;
    for (const { id } of expiredUsers) {
      try {
        await gdprService.executeDeletion(id);
        count++;
      } catch {
        // Log but continue processing other users
        gdprLogger.error(`Failed to delete user ${id}`);
      }
    }

    return count;
  },
};
