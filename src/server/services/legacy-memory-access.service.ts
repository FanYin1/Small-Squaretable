import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, type Database } from '../../db';
import { chats } from '../../db/schema/chats';
import { characterMemories } from '../../db/schema/memories';
import { AppError, NotFoundError, ValidationError } from '../../core/errors';

const identifier = z.string().uuid();
function checkIdentifier(value: string) {
  if (!identifier.safeParse(value).success) throw new ValidationError('Invalid memory scope identifier');
}

export async function assertLegacyMemoryScope(characterId: string, userId: string, tenantId: string,
  chatId?: string, database: Database = db) {
  checkIdentifier(characterId);
  if (chatId === undefined) return;
  checkIdentifier(chatId);
  const [chat] = await database.select({ version: chats.contentSnapshotVersion }).from(chats).where(and(
    eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.tenantId, tenantId),
    or(eq(chats.characterId, characterId), sql`EXISTS (SELECT 1 FROM chat_characters member
      WHERE member.chat_id = ${chats.id} AND member.character_id = ${characterId}::uuid)`),
  ));
  if (!chat) throw new NotFoundError('Chat');
  if (chat.version !== null) throw new AppError('请使用故事中的记忆整理与原文入口；旧记忆接口不支持此存档。', 409, 'STORY_MEMORY_MANAGED');
}

export async function deleteOwnedLegacyMemory(memoryId: string, characterId: string, userId: string,
  tenantId: string, database: Database = db) {
  checkIdentifier(memoryId);
  checkIdentifier(characterId);
  const [deleted] = await database.delete(characterMemories).where(and(
    eq(characterMemories.id, memoryId), eq(characterMemories.characterId, characterId), eq(characterMemories.userId, userId),
    sql`EXISTS (SELECT 1 FROM users owner WHERE owner.id = ${characterMemories.userId} AND owner.tenant_id = ${tenantId}::uuid)`,
    or(isNull(characterMemories.sourceChatId), sql`EXISTS (SELECT 1 FROM chats source
      WHERE source.id = ${characterMemories.sourceChatId} AND source.user_id = ${userId}::uuid
        AND source.tenant_id = ${tenantId}::uuid AND source.content_snapshot_version IS NULL)`),
  )).returning({ id: characterMemories.id });
  if (!deleted) throw new NotFoundError('Memory');
}
