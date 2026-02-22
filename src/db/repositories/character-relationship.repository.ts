import { eq, and, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { characterRelationships, type CharacterRelationship, type NewCharacterRelationship } from '../schema/character-relationships';

export class CharacterRelationshipRepository extends BaseRepository {
  async findByCharacter(characterId: string, userId: string): Promise<CharacterRelationship[]> {
    return await this.db.select().from(characterRelationships)
      .where(and(
        eq(characterRelationships.characterId, characterId),
        eq(characterRelationships.userId, userId)
      ));
  }

  async findById(id: string): Promise<CharacterRelationship | null> {
    const [row] = await this.db.select().from(characterRelationships)
      .where(eq(characterRelationships.id, id));
    return row ?? null;
  }

  async create(data: NewCharacterRelationship): Promise<CharacterRelationship> {
    const [row] = await this.db.insert(characterRelationships).values(data).returning();
    return row;
  }

  async update(id: string, userId: string, data: Partial<{
    type: string;
    affinity: string;
    label: string | null;
    description: string | null;
  }>): Promise<CharacterRelationship | null> {
    const updateData = { ...data, updatedAt: new Date() };
    const [row] = await this.db.update(characterRelationships)
      .set(updateData)
      .where(and(
        eq(characterRelationships.id, id),
        eq(characterRelationships.userId, userId)
      ))
      .returning();
    return row ?? null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(characterRelationships)
      .where(and(
        eq(characterRelationships.id, id),
        eq(characterRelationships.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async updateAffinity(id: string, delta: number): Promise<CharacterRelationship | null> {
    const [row] = await this.db.update(characterRelationships)
      .set({
        affinity: sql`LEAST(1, GREATEST(0, ${characterRelationships.affinity}::numeric + ${delta}))::numeric(4,3)`,
        updatedAt: new Date(),
      })
      .where(eq(characterRelationships.id, id))
      .returning();
    return row ?? null;
  }

  async incrementInteraction(id: string): Promise<void> {
    await this.db.update(characterRelationships)
      .set({
        interactionCount: sql`${characterRelationships.interactionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(characterRelationships.id, id));
  }
}

export const characterRelationshipRepository = new CharacterRelationshipRepository(db);