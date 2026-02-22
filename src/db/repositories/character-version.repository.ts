/**
 * Character Version Repository
 *
 * 处理角色版本历史的数据访问（创建版本、查询版本列表、按版本号查找）
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { characterVersions } from '../schema/character-versions';
import type { CharacterVersion, NewCharacterVersion } from '../schema/character-versions';

export class CharacterVersionRepository extends BaseRepository {
  /**
   * Create a new version snapshot.
   */
  async create(data: NewCharacterVersion): Promise<CharacterVersion> {
    const [version] = await this.db.insert(characterVersions).values(data).returning();
    return version;
  }

  /**
   * Get the latest version number for a character.
   * Returns 0 if no versions exist yet.
   */
  async getLatestVersion(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${characterVersions.version}), 0)` })
      .from(characterVersions)
      .where(eq(characterVersions.characterId, characterId));
    return Number(row.maxVersion);
  }

  /**
   * List versions for a character, ordered by version DESC.
   */
  async listByCharacter(characterId: string, limit = 20, offset = 0): Promise<CharacterVersion[]> {
    return await this.db
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.characterId, characterId))
      .orderBy(desc(characterVersions.version))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get a specific version by characterId + version number.
   */
  async getByVersion(characterId: string, version: number): Promise<CharacterVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(characterVersions)
      .where(
        and(
          eq(characterVersions.characterId, characterId),
          eq(characterVersions.version, version),
        ),
      );
    return row;
  }
}

export const characterVersionRepository = new CharacterVersionRepository(db);
