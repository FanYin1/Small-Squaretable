/**
 * Favorite Repository
 *
 * Handles data access for user-character favorites (bookmarks)
 */

import { eq, and, sql, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { favorites, type Favorite } from '../schema/social';
import { characters } from '../schema/characters';

export class FavoriteRepository extends BaseRepository {
  /**
   * Add a favorite. Uses a transaction to insert the favorite record
   * (ON CONFLICT DO NOTHING for idempotency) and increment the
   * character's favoriteCount atomically.
   */
  async favorite(userId: string, characterId: string): Promise<Favorite> {
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(favorites)
        .values({ userId, characterId })
        .onConflictDoNothing({
          target: [favorites.userId, favorites.characterId],
        })
        .returning();

      // If row is undefined the record already existed (conflict) — return existing
      if (!row) {
        const [existing] = await tx
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, userId),
              eq(favorites.characterId, characterId),
            ),
          );
        return existing;
      }

      // Increment favoriteCount on the character
      await tx
        .update(characters)
        .set({
          favoriteCount: sql`${characters.favoriteCount} + 1`,
        })
        .where(eq(characters.id, characterId));

      return row;
    });
  }

  /**
   * Remove a favorite. Uses a transaction to delete the favorite record
   * and decrement the character's favoriteCount (floored at 0).
   */
  async unfavorite(userId: string, characterId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(favorites)
        .where(
          and(
            eq(favorites.userId, userId),
            eq(favorites.characterId, characterId),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        return false;
      }

      // Decrement favoriteCount, floored at 0
      await tx
        .update(characters)
        .set({
          favoriteCount: sql`GREATEST(${characters.favoriteCount} - 1, 0)`,
        })
        .where(eq(characters.id, characterId));

      return true;
    });
  }

  /**
   * Check whether a user has favorited a specific character.
   */
  async isFavorited(userId: string, characterId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: favorites.id })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.characterId, characterId),
        ),
      );
    return rows.length > 0;
  }

  /**
   * Get paginated list of favorites for a user, joined with character info.
   */
  async getFavoritesByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      description: string | null;
      favoritedAt: Date;
    }>
  > {
    const rows = await this.db
      .select({
        id: characters.id,
        name: characters.name,
        avatarUrl: characters.avatarUrl,
        description: characters.description,
        favoritedAt: favorites.createdAt,
      })
      .from(favorites)
      .innerJoin(characters, eq(favorites.characterId, characters.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  /**
   * Count the total number of favorites for a user.
   */
  async countByUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    return row?.count ?? 0;
  }

  /**
   * Get the favoriteCount for a character directly from the characters table.
   */
  async getFavoriteCount(characterId: string): Promise<number> {
    const [row] = await this.db
      .select({ favoriteCount: characters.favoriteCount })
      .from(characters)
      .where(eq(characters.id, characterId));
    return row?.favoriteCount ?? 0;
  }
}

export const favoriteRepository = new FavoriteRepository(db);
