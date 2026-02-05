// src/db/repositories/emotion.repository.ts
/**
 * Emotion Repository
 *
 * Data access layer for character emotions
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../index';
import { characterEmotions } from '../schema/emotions';
import type { CharacterEmotion, NewCharacterEmotion } from '../schema/emotions';

class EmotionRepository {
  async upsert(data: NewCharacterEmotion): Promise<CharacterEmotion> {
    // Use raw SQL for upsert with partial unique index
    const result = await db.execute(sql`
      INSERT INTO character_emotions (
        character_id, user_id, chat_id, valence, arousal, trigger_message_id, trigger_content
      ) VALUES (
        ${data.characterId}::uuid,
        ${data.userId}::uuid,
        ${data.chatId}::uuid,
        ${data.valence},
        ${data.arousal},
        ${data.triggerMessageId ?? null},
        ${data.triggerContent ?? null}
      )
      ON CONFLICT (character_id, user_id, chat_id) WHERE chat_id IS NOT NULL
      DO UPDATE SET
        valence = EXCLUDED.valence,
        arousal = EXCLUDED.arousal,
        trigger_message_id = EXCLUDED.trigger_message_id,
        trigger_content = EXCLUDED.trigger_content,
        created_at = NOW()
      RETURNING *
    `);

    // postgres-js returns RowList which is array-like
    return (result as unknown as CharacterEmotion[])[0];
  }

  async getCurrentEmotion(
    characterId: string,
    userId: string,
    chatId?: string
  ): Promise<CharacterEmotion | null> {
    const conditions = [
      eq(characterEmotions.characterId, characterId),
      eq(characterEmotions.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterEmotions.chatId, chatId));
    }

    const [emotion] = await db
      .select()
      .from(characterEmotions)
      .where(and(...conditions))
      .orderBy(desc(characterEmotions.createdAt))
      .limit(1);

    return emotion ?? null;
  }

  async getHistory(
    characterId: string,
    userId: string,
    limit = 50
  ): Promise<CharacterEmotion[]> {
    return await db
      .select()
      .from(characterEmotions)
      .where(
        and(
          eq(characterEmotions.characterId, characterId),
          eq(characterEmotions.userId, userId)
        )
      )
      .orderBy(desc(characterEmotions.createdAt))
      .limit(limit);
  }

  async deleteForChat(chatId: string): Promise<void> {
    await db.delete(characterEmotions).where(eq(characterEmotions.chatId, chatId));
  }

  async resetForCharacterUser(characterId: string, userId: string): Promise<void> {
    await db
      .delete(characterEmotions)
      .where(
        and(
          eq(characterEmotions.characterId, characterId),
          eq(characterEmotions.userId, userId)
        )
      );
  }
}

export const emotionRepository = new EmotionRepository();
