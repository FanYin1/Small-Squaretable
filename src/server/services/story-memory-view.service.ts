import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { storyEvents } from '../../db/schema/story-state';
import { storyMemoryJobs, storyMemoryLinks, storyMemoryProgress } from '../../db/schema/story-memory';
import { characterMemories } from '../../db/schema/memories';
import { AppError, NotFoundError } from '../../core/errors';
import { storyMemoryViewSchema, type StoryMemoryView } from '../../types/story-memory';
import { loadStoryContent } from './story-content.service';

export async function getStoryMemoryView(chatId: string, userId: string, tenantId: string,
  before?: string, database: Database = db): Promise<StoryMemoryView> {
  return database.transaction(async transaction => {
    const [chat] = await transaction.select({ contentSnapshotVersion: chats.contentSnapshotVersion }).from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.tenantId, tenantId)));
    if (!chat) throw new NotFoundError('Chat');
    const result: StoryMemoryView = { supported: chat.contentSnapshotVersion === 1, batchSize: 5,
      counts: { pending: 0, running: 0, retry: 0, failed: 0, succeeded: 0 }, accumulating: [], jobs: [], nextBefore: null };
    if (chat.contentSnapshotVersion == null) return result;
    if (chat.contentSnapshotVersion !== 1) throw new AppError('Unsupported saved content version', 409, 'STORY_CONTENT_VERSION');
    const snapshot = await loadStoryContent(chatId, userId, transaction);
    const names = new Map(snapshot.characters.map(character => [character.id, character.name]));
    const [cursor] = before ? await transaction.select({ createdAt: sql<string>`${storyMemoryJobs.createdAt}::text`, id: storyMemoryJobs.id })
      .from(storyMemoryJobs).where(and(eq(storyMemoryJobs.id, before), eq(storyMemoryJobs.chatId, chatId))) : [];
    if (before && !cursor) throw new AppError('Memory history cursor is unavailable', 400, 'STORY_MEMORY_CURSOR_INVALID');
    const jobs = await transaction.select({ id: storyMemoryJobs.id, characterId: storyMemoryJobs.characterId,
      sourceEventIds: storyMemoryJobs.sourceEventIds, status: storyMemoryJobs.status, sourceDigest: storyMemoryJobs.sourceDigest,
      recoveryPending: sql<boolean>`${storyMemoryJobs.status} = 'running' AND (${storyMemoryJobs.leaseUntil} IS NULL OR ${storyMemoryJobs.leaseUntil} <= now())`,
    }).from(storyMemoryJobs).where(and(eq(storyMemoryJobs.chatId, chatId), cursor ? or(
      sql`${storyMemoryJobs.createdAt} < ${cursor.createdAt}::timestamptz`,
      and(sql`${storyMemoryJobs.createdAt} = ${cursor.createdAt}::timestamptz`, lt(storyMemoryJobs.id, cursor.id))) : undefined))
      .orderBy(desc(storyMemoryJobs.createdAt), desc(storyMemoryJobs.id)).limit(21);
    const page = jobs.slice(0, 20);
    result.nextBefore = jobs.length > 20 ? page.at(-1)!.id : null;
    const totals = await transaction.select({ status: storyMemoryJobs.status, count: sql<number>`count(*)::int` })
      .from(storyMemoryJobs).where(eq(storyMemoryJobs.chatId, chatId)).groupBy(storyMemoryJobs.status);
    for (const total of totals) {
      if (Object.hasOwn(result.counts, total.status)) result.counts[total.status as keyof typeof result.counts] = total.count;
    }
    const progress = await transaction.select().from(storyMemoryProgress).where(eq(storyMemoryProgress.chatId, chatId));
    const eventIds = [...new Set([...page.flatMap(job => job.sourceEventIds), ...progress.flatMap(item => item.eventIds)])];
    const input = alias(messages, 'memory_view_input');
    const sources = eventIds.length ? await transaction.select({ eventId: storyEvents.id, version: storyEvents.version,
      inputMessageId: input.id, messageId: messages.id, input: input.content, reply: messages.content,
      characterId: sql<string>`coalesce(${messages.characterId}, ${chats.characterId})`,
    }).from(storyEvents).innerJoin(chats, eq(chats.id, storyEvents.chatId))
      .innerJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, chatId), eq(messages.role, 'assistant')))
      .innerJoin(input, and(eq(input.id, storyEvents.inputMessageId), eq(input.chatId, chatId), eq(input.role, 'user')))
      .where(and(eq(storyEvents.chatId, chatId), inArray(storyEvents.id, eventIds), eq(storyEvents.status, 'confirmed'),
        sql`${messages.extra}->>'stateStatus' = 'confirmed'`, sql`${messages.extra}->>'storyVersion' = ${storyEvents.version}::text`,
        sql`${messages.extra}->>'storyRequestId' = ${storyEvents.requestId}`,
        sql`coalesce(${input.extra}->>'stateStatus', '') <> 'interrupted'`)) : [];
    result.accumulating = progress.filter(item => names.has(item.characterId)).map(item => ({ characterId: item.characterId,
      characterName: names.get(item.characterId) ?? null,
      turns: sources.filter(source => source.characterId === item.characterId && item.eventIds.includes(source.eventId)).length,
    })).filter(item => item.turns > 0);
    const links = page.length ? await transaction.select({ jobId: storyMemoryLinks.jobId, memoryId: storyMemoryLinks.memoryId,
      eventId: storyMemoryLinks.eventId, messageId: storyMemoryLinks.messageId, characterId: characterMemories.characterId,
    }).from(storyMemoryLinks).innerJoin(characterMemories, eq(characterMemories.id, storyMemoryLinks.memoryId))
      .where(and(inArray(storyMemoryLinks.jobId, page.map(job => job.id)), eq(characterMemories.sourceChatId, chatId), eq(characterMemories.userId, userId))) : [];
    result.jobs = page.map(job => {
      const matched = sources.filter(source => source.characterId === job.characterId && job.sourceEventIds.includes(source.eventId))
        .sort((left, right) => left.version - right.version);
      const digest = createHash('sha256').update(JSON.stringify(matched.map(({ eventId, version, inputMessageId, messageId, input: content, reply }) =>
        ({ eventId, version, inputMessageId, messageId, input: content, reply })))).digest('hex');
      const sourcesAvailable = names.has(job.characterId) && new Set(job.sourceEventIds).size === 5 && matched.length === 5 &&
        (!job.sourceDigest || job.sourceDigest === digest);
      const retained = links.filter(link => link.jobId === job.id && link.characterId === job.characterId && matched.some(source =>
        source.eventId === link.eventId && [source.inputMessageId, source.messageId].includes(link.messageId)));
      return { id: job.id, characterName: names.get(job.characterId) ?? null, status: job.status as StoryMemoryView['jobs'][number]['status'],
        recoveryPending: job.recoveryPending, sourcesAvailable,
        retainedMemories: job.status === 'succeeded' && sourcesAvailable ? new Set(retained.map(link => link.memoryId)).size : 0,
        sources: sourcesAvailable ? matched.map(({ version, inputMessageId, messageId }) => ({ version, inputMessageId, messageId })) : [],
      };
    });
    return storyMemoryViewSchema.parse(result);
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
