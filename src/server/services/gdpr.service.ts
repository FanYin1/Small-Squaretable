/**
 * GDPR Data Export Service
 *
 * Orchestrates collection of all user data and packages it into a ZIP archive
 * for GDPR Right of Access (Article 15) compliance.
 */

import archiver from 'archiver';
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
};
