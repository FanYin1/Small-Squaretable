import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, type Database } from '../../db';
import { chats, messages, type NewMessage } from '../../db/schema/chats';
import { legacyChatVariables } from '../../db/schema/legacy-chat-variables';
import { redis } from '../../core/redis';
import { AppError, NotFoundError } from '../../core/errors';
import { extractVariableInserts, extractVariableEdits, extractVariableDeletes } from '../utils/variable-insert';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const variablesSchema = z.record(z.string());

async function lockStory(transaction: Transaction, chatId: string) {
  const [chat] = await transaction.select().from(chats).where(eq(chats.id, chatId)).for('update');
  if (!chat) throw new NotFoundError('Chat');
  return chat;
}

async function readVariables(transaction: Transaction, chatId: string) {
  const [stored] = await transaction.select().from(legacyChatVariables).where(eq(legacyChatVariables.chatId, chatId));
  if (stored) return variablesSchema.parse(stored.values);
  const cached = await redis.get(`chatvar:${chatId}`);
  return cached == null ? {} : variablesSchema.parse(JSON.parse(cached));
}

async function writeVariables(transaction: Transaction, chatId: string, values: Record<string, string>) {
  await transaction.insert(legacyChatVariables).values({ chatId, values })
    .onConflictDoUpdate({ target: legacyChatVariables.chatId, set: { values } });
}

export async function getLegacyVariables(chatId: string, database = db): Promise<Record<string, string>> {
  return database.transaction(async transaction => {
    const chat = await lockStory(transaction, chatId);
    if (chat.contentSnapshotVersion != null) return {};
    const values = await readVariables(transaction, chatId);
    await writeVariables(transaction, chatId, values);
    return values;
  });
}

export async function mutateLegacyVariables(chatId: string, mutate: (values: Record<string, string>) => void, database = db) {
  return database.transaction(async transaction => {
    const chat = await lockStory(transaction, chatId);
    if (chat.contentSnapshotVersion != null) return;
    const values = await readVariables(transaction, chatId);
    mutate(values);
    await writeVariables(transaction, chatId, values);
  });
}

export function applyLegacyVariables(content: string, previous: Record<string, string>) {
  const values = { ...previous };
  const assignments = [...extractVariableInserts(content), ...extractVariableEdits(content)];
  const deletions = extractVariableDeletes(content);
  for (const assignment of assignments) {
    Object.defineProperty(values, assignment.key, { value: assignment.value, enumerable: true, configurable: true, writable: true });
  }
  for (const key of deletions) delete values[key];
  return { values, changed: assignments.length + deletions.length > 0 };
}

export async function saveLegacyAssistantMessage(data: NewMessage, requestId?: string, database = db) {
  return database.transaction(async transaction => {
    const chat = await lockStory(transaction, data.chatId);
    if (chat.contentSnapshotVersion != null || data.role !== 'assistant') {
      throw new AppError('Legacy response cannot modify this story', 409, 'LEGACY_STORY_REQUIRED');
    }
    const extra = data.extra && typeof data.extra === 'object' ? { ...data.extra as Record<string, unknown> } : {};
    delete extra.legacyResponseKey;
    const responseKey = requestId ? JSON.stringify([requestId, data.characterId ?? null]) : undefined;
    if (responseKey) {
      const [existing] = await transaction.select().from(messages).where(and(
        eq(messages.chatId, data.chatId),
        sql`${messages.extra}->>'legacyResponseKey' = ${responseKey}`,
      )).limit(1);
      if (existing) return existing;
    }
    const previous = await readVariables(transaction, data.chatId);
    const result = extra.stateStatus === 'interrupted' ? { values: previous } : applyLegacyVariables(data.content, previous);
    await writeVariables(transaction, data.chatId, result.values);
    const [message] = await transaction.insert(messages).values({
      ...data, extra: { ...extra, ...(responseKey ? { legacyResponseKey: responseKey } : {}) },
    }).returning();
    return message;
  });
}
