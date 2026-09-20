import { eq, and, desc } from 'drizzle-orm';
import { db } from '../index';
import { characterPresets, type CharacterPreset, type NewCharacterPreset } from '../schema';

export class CharacterPresetRepository {
  /**
   * Create a new character preset
   */
  async create(data: NewCharacterPreset): Promise<CharacterPreset> {
    const [preset] = await db.insert(characterPresets).values(data).returning();
    return preset;
  }

  /**
   * Find preset by ID
   */
  async findById(id: string): Promise<CharacterPreset | undefined> {
    const [preset] = await db.select().from(characterPresets).where(eq(characterPresets.id, id));
    return preset;
  }

  /**
   * Find all presets for a user
   */
  async findByUserId(userId: string): Promise<CharacterPreset[]> {
    return db
      .select()
      .from(characterPresets)
      .where(eq(characterPresets.userId, userId))
      .orderBy(desc(characterPresets.useCount), desc(characterPresets.createdAt));
  }

  /**
   * Find presets for a specific character
   */
  async findByCharacterId(userId: string, characterId: string): Promise<CharacterPreset[]> {
    return db
      .select()
      .from(characterPresets)
      .where(
        and(
          eq(characterPresets.userId, userId),
          eq(characterPresets.characterId, characterId)
        )
      )
      .orderBy(desc(characterPresets.useCount), desc(characterPresets.createdAt));
  }

  /**
   * Find global presets for a user
   */
  async findGlobalPresets(userId: string): Promise<CharacterPreset[]> {
    return db
      .select()
      .from(characterPresets)
      .where(
        and(
          eq(characterPresets.userId, userId),
          eq(characterPresets.isGlobal, true)
        )
      )
      .orderBy(desc(characterPresets.useCount), desc(characterPresets.createdAt));
  }

  /**
   * Update a preset
   */
  async update(
    id: string,
    data: Partial<Omit<CharacterPreset, 'id' | 'userId' | 'createdAt'>>
  ): Promise<CharacterPreset | undefined> {
    const [updated] = await db
      .update(characterPresets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(characterPresets.id, id))
      .returning();
    return updated;
  }

  /**
   * Increment use count
   */
  async incrementUseCount(id: string): Promise<void> {
    await db
      .update(characterPresets)
      .set({
        useCount: db.$count(characterPresets.useCount, '+', 1),
        updatedAt: new Date(),
      })
      .where(eq(characterPresets.id, id));
  }

  /**
   * Delete a preset
   */
  async delete(id: string): Promise<void> {
    await db.delete(characterPresets).where(eq(characterPresets.id, id));
  }

  /**
   * Delete all presets for a character
   */
  async deleteByCharacterId(characterId: string): Promise<void> {
    await db.delete(characterPresets).where(eq(characterPresets.characterId, characterId));
  }
}

export const characterPresetRepository = new CharacterPresetRepository();
