import { and, desc, eq, sql } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats } from '../../db/schema/chats';
import { storyMemoryJobs } from '../../db/schema/story-memory';
import { NotFoundError } from '../../core/errors';
import type { StoryAudience } from '../../types/story-knowledge';
import { verifiedStoryMemoryBatches } from './story-memory-provenance';

export interface StorySummary {
  jobId: string;
  firstVersion: number;
  lastVersion: number;
  sourceMessageIds: number[];
  content: string;
}

export async function getStorySummaries(chatId: string, userId: string, tenantId: string, characterId: string,
  database: Database = db, audience?: StoryAudience): Promise<StorySummary[]> {
  return database.transaction(async transaction => {
    const [chat] = await transaction.select({ version: chats.contentSnapshotVersion }).from(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.tenantId, tenantId)));
    if (!chat) throw new NotFoundError('Chat');
    if (chat.version !== 1) return [];
    const jobs = await transaction.select({ id: storyMemoryJobs.id, sourceEventIds: storyMemoryJobs.sourceEventIds,
      extracted: storyMemoryJobs.extracted, sourceDigest: storyMemoryJobs.sourceDigest,
    }).from(storyMemoryJobs).where(and(eq(storyMemoryJobs.chatId, chatId), eq(storyMemoryJobs.characterId, characterId),
      eq(storyMemoryJobs.status, 'succeeded'), sql`jsonb_typeof(${storyMemoryJobs.extracted}) = 'object'`))
      .orderBy(desc(storyMemoryJobs.createdAt), desc(storyMemoryJobs.id)).limit(20);
    if (!jobs.length) return [];
    const summaries: StorySummary[] = [];
    const batches = await verifiedStoryMemoryBatches(chatId, characterId, jobs, transaction, audience);
    for (const [jobId, { sources, result }] of batches) {
      if (!result.summary) continue;
      summaries.push({ jobId, firstVersion: sources[0].version, lastVersion: sources.at(-1)!.version,
        sourceMessageIds: sources.flatMap(source => [source.inputMessageId, source.messageId]), content: result.summary.content });
    }
    return summaries.sort((left, right) => right.lastVersion - left.lastVersion);
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
