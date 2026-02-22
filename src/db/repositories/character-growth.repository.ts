/**
 * Character Growth Repository
 *
 * Data access layer for character leveling, XP, and milestones.
 */

import { eq, and, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { characterGrowth, type CharacterGrowthRecord } from '../schema/character-growth';

const XP_PER_LEVEL = 100;

export class CharacterGrowthRepository extends BaseRepository {
  async findByCharacterAndUser(characterId: string, userId: string): Promise<CharacterGrowthRecord | null> {
    const [row] = await this.db.select().from(characterGrowth)
      .where(and(
        eq(characterGrowth.characterId, characterId),
        eq(characterGrowth.userId, userId)
      ));
    return row ?? null;
  }

  async getOrCreate(characterId: string, userId: string): Promise<CharacterGrowthRecord> {
    const existing = await this.findByCharacterAndUser(characterId, userId);
    if (existing) return existing;
    const [row] = await this.db.insert(characterGrowth)
      .values({ characterId, userId })
      .returning();
    return row;
  }

  async addExperience(id: string, xp: number): Promise<CharacterGrowthRecord | null> {
    const [row] = await this.db.update(characterGrowth)
      .set({
        experience: sql`${characterGrowth.experience} + ${xp}`,
        level: sql`GREATEST(1, (${characterGrowth.experience} + ${xp}) / ${XP_PER_LEVEL} + 1)`,
        updatedAt: new Date(),
      })
      .where(eq(characterGrowth.id, id))
      .returning();
    return row ?? null;
  }

  async incrementMessages(id: string): Promise<CharacterGrowthRecord | null> {
    const [row] = await this.db.update(characterGrowth)
      .set({
        totalMessages: sql`${characterGrowth.totalMessages} + 1`,
        experience: sql`${characterGrowth.experience} + 10`,
        level: sql`GREATEST(1, (${characterGrowth.experience} + 10) / ${XP_PER_LEVEL} + 1)`,
        updatedAt: new Date(),
      })
      .where(eq(characterGrowth.id, id))
      .returning();
    return row ?? null;
  }

  async incrementChats(id: string): Promise<CharacterGrowthRecord | null> {
    const [row] = await this.db.update(characterGrowth)
      .set({
        totalChats: sql`${characterGrowth.totalChats} + 1`,
        experience: sql`${characterGrowth.experience} + 25`,
        level: sql`GREATEST(1, (${characterGrowth.experience} + 25) / ${XP_PER_LEVEL} + 1)`,
        updatedAt: new Date(),
      })
      .where(eq(characterGrowth.id, id))
      .returning();
    return row ?? null;
  }

  async addMilestone(id: string, milestone: { name: string; label: string; unlockedAt: string }): Promise<CharacterGrowthRecord | null> {
    const [row] = await this.db.update(characterGrowth)
      .set({
        milestones: sql`${characterGrowth.milestones}::jsonb || ${JSON.stringify([milestone])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(characterGrowth.id, id))
      .returning();
    return row ?? null;
  }
}

export const characterGrowthRepository = new CharacterGrowthRepository(db);
