/**
 * Consent Repository
 *
 * Data access layer for user consent preferences (GDPR)
 */

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { userConsents, type UserConsent } from '../schema/user-consents';

export class ConsentRepository extends BaseRepository {
  async findByUserId(userId: string): Promise<UserConsent[]> {
    return await this.db
      .select()
      .from(userConsents)
      .where(eq(userConsents.userId, userId));
  }

  async upsert(userId: string, consentType: string, granted: boolean): Promise<UserConsent> {
    const now = new Date();
    const result = await this.db
      .insert(userConsents)
      .values({
        userId,
        consentType,
        granted,
        grantedAt: granted ? now : null,
        revokedAt: granted ? null : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userConsents.userId, userConsents.consentType],
        set: {
          granted,
          grantedAt: granted ? now : null,
          revokedAt: granted ? null : now,
          updatedAt: now,
        },
      })
      .returning();
    return result[0];
  }
}

export const consentRepository = new ConsentRepository(db);
