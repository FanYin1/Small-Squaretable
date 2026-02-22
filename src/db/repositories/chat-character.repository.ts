/**
 * Chat-Character Repository
 *
 * Data access for the chat_characters join table (multi-character chat).
 */

import { eq, and, asc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { chatCharacters, type ChatCharacter } from '../schema/chat-characters';
import { characters } from '../schema/characters';

export class ChatCharacterRepository extends BaseRepository {
  /**
   * Add a character to a chat. Idempotent — does nothing on duplicate.
   */
  async addCharacter(
    chatId: string,
    characterId: string,
    sortOrder = 0,
  ): Promise<ChatCharacter> {
    const [row] = await this.db
      .insert(chatCharacters)
      .values({ chatId, characterId, sortOrder })
      .onConflictDoNothing({
        target: [chatCharacters.chatId, chatCharacters.characterId],
      })
      .returning();

    // If conflict, return the existing row
    if (!row) {
      const [existing] = await this.db
        .select()
        .from(chatCharacters)
        .where(
          and(
            eq(chatCharacters.chatId, chatId),
            eq(chatCharacters.characterId, characterId),
          ),
        );
      return existing;
    }

    return row;
  }

  /**
   * Remove a character from a chat.
   */
  async removeCharacter(chatId: string, characterId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(chatCharacters)
      .where(
        and(
          eq(chatCharacters.chatId, chatId),
          eq(chatCharacters.characterId, characterId),
        ),
      )
      .returning();

    return deleted.length > 0;
  }

  /**
   * Get all characters in a chat, joined with character details.
   * Ordered by sortOrder ascending.
   */
  async getCharacters(
    chatId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      cardData: unknown;
      sortOrder: number;
    }>
  > {
    return await this.db
      .select({
        id: characters.id,
        name: characters.name,
        avatarUrl: characters.avatarUrl,
        cardData: characters.cardData,
        sortOrder: chatCharacters.sortOrder,
      })
      .from(chatCharacters)
      .innerJoin(characters, eq(chatCharacters.characterId, characters.id))
      .where(eq(chatCharacters.chatId, chatId))
      .orderBy(asc(chatCharacters.sortOrder));
  }

  /**
   * Get just the character IDs for a chat.
   */
  async getCharacterIds(chatId: string): Promise<string[]> {
    const rows = await this.db
      .select({ characterId: chatCharacters.characterId })
      .from(chatCharacters)
      .where(eq(chatCharacters.chatId, chatId))
      .orderBy(asc(chatCharacters.sortOrder));

    return rows.map((r) => r.characterId);
  }
}

export const chatCharacterRepository = new ChatCharacterRepository(db);
