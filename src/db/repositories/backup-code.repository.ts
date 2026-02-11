/**
 * Backup Code Repository
 *
 * CRUD operations for TOTP backup codes.
 * Codes are stored as bcrypt hashes.
 */

import { eq, and, isNull } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { backupCodes, type BackupCode } from '../schema/backup-codes';

export class BackupCodeRepository extends BaseRepository {
  async createBatch(userId: string, codeHashes: string[]): Promise<void> {
    const values = codeHashes.map((codeHash) => ({
      userId,
      codeHash,
    }));
    await this.db.insert(backupCodes).values(values);
  }

  async findUnusedByUserId(userId: string): Promise<BackupCode[]> {
    return await this.db
      .select()
      .from(backupCodes)
      .where(
        and(
          eq(backupCodes.userId, userId),
          isNull(backupCodes.usedAt),
        ),
      );
  }

  async markUsed(id: string): Promise<void> {
    await this.db
      .update(backupCodes)
      .set({ usedAt: new Date() })
      .where(eq(backupCodes.id, id));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db
      .delete(backupCodes)
      .where(eq(backupCodes.userId, userId));
  }
}

export const backupCodeRepository = new BackupCodeRepository(db);
