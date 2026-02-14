/**
 * Password Reset Token Repository
 *
 * CRUD operations for password reset tokens.
 * Tokens are stored as SHA-256 hashes; lookup is by hash.
 */

import { eq, and, isNull, gt, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import {
  passwordResetTokens,
  type PasswordResetToken,
} from '../schema/password-reset-tokens';

export class PasswordResetRepository extends BaseRepository {
  /**
   * Create a new password reset token record.
   */
  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    const result = await this.db
      .insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return result[0];
  }

  /**
   * Find a valid (unused + non-expired) token by its hash.
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      );
    return result[0] ?? null;
  }

  /**
   * Mark a token as used.
   */
  async markUsed(id: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  /**
   * Delete all tokens for a given user (cleanup before issuing a new one).
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }

  /**
   * Delete all expired tokens (housekeeping).
   */
  async deleteExpired(): Promise<number> {
    const result = await this.db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()))
      .returning();
    return result.length;
  }
}

export const passwordResetRepository = new PasswordResetRepository(db);
