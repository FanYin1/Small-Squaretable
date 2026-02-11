/**
 * OAuth Account Repository
 *
 * CRUD operations for OAuth provider account links.
 */

import { eq, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import {
  oauthAccounts,
  type OAuthAccount,
  type NewOAuthAccount,
} from '../schema/oauth-accounts';

export class OAuthRepository extends BaseRepository {
  /**
   * Find an OAuth account by provider + provider account ID.
   */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccount | null> {
    const result = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, providerAccountId),
        ),
      );
    return result[0] ?? null;
  }

  /**
   * Find all OAuth accounts linked to a user.
   */
  async findByUserId(userId: string): Promise<OAuthAccount[]> {
    return await this.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId));
  }

  /**
   * Create a new OAuth account link.
   */
  async create(data: NewOAuthAccount): Promise<OAuthAccount> {
    const result = await this.db
      .insert(oauthAccounts)
      .values(data)
      .returning();
    return result[0];
  }

  /**
   * Delete an OAuth account link by user ID and provider.
   */
  async deleteByUserIdAndProvider(
    userId: string,
    provider: string,
  ): Promise<boolean> {
    const result = await this.db
      .delete(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, userId),
          eq(oauthAccounts.provider, provider),
        ),
      )
      .returning();
    return result.length > 0;
  }
}

export const oauthRepository = new OAuthRepository(db);
