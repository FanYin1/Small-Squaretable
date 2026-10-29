import { and, eq, inArray } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats } from '../../db/schema/chats';
import { characterMemories } from '../../db/schema/memories';
import { storyMemoryJobs, storyMemoryLinks } from '../../db/schema/story-memory';
import type { StoryAudience } from '../../types/story-knowledge';
import { verifiedStoryMemoryBatches } from './story-memory-provenance';

export interface StoryMemoryOrigin {
  content: string;
  type: string;
  firstVersion: number;
  lastVersion: number;
  sourceMessageIds: number[];
}

export async function verifiedStoryMemoryOrigins(chatId: string, characterId: string, memoryIds: string[], audience?: StoryAudience,
  database: Database = db): Promise<Map<string, StoryMemoryOrigin>> {
  if (!memoryIds.length) return new Map();
  return database.transaction(async transaction => {
  const links = await transaction.select({ memoryId: storyMemoryLinks.memoryId, jobId: storyMemoryJobs.id,
    eventId: storyMemoryLinks.eventId, messageId: storyMemoryLinks.messageId,
    primarySourceId: characterMemories.sourceMessageId,
    content: characterMemories.content, type: characterMemories.type,
    sourceEventIds: storyMemoryJobs.sourceEventIds, sourceDigest: storyMemoryJobs.sourceDigest,
    extracted: storyMemoryJobs.extracted, status: storyMemoryJobs.status }).from(storyMemoryLinks)
    .innerJoin(storyMemoryJobs, eq(storyMemoryJobs.id, storyMemoryLinks.jobId))
    .innerJoin(characterMemories, eq(characterMemories.id, storyMemoryLinks.memoryId))
    .innerJoin(chats, and(eq(chats.id, storyMemoryJobs.chatId), eq(chats.userId, characterMemories.userId)))
    .where(and(inArray(storyMemoryLinks.memoryId, memoryIds), eq(storyMemoryJobs.chatId, chatId),
      eq(storyMemoryJobs.characterId, characterId), eq(characterMemories.sourceChatId, chatId),
      eq(characterMemories.characterId, characterId), eq(chats.contentSnapshotVersion, 1)));
  if (!links.length) return new Map();
  const jobs = [...new Map(links.filter(link => link.status === 'succeeded')
    .map(link => [link.jobId, { ...link, id: link.jobId }])).values()];
  const verified = await verifiedStoryMemoryBatches(chatId, characterId, jobs, transaction, audience);
  const result = new Map<string, StoryMemoryOrigin>();
  for (const id of memoryIds) {
    const origins = links.filter(link => link.memoryId === id);
    const valid = origins.length > 0 && origins.some(link => link.messageId === origins[0].primarySourceId) && origins.every(link => {
      const batch = verified.get(link.jobId);
      if (!batch) return false;
      const facts = batch.result.facts.filter(fact => fact.type === link.type && fact.content === link.content);
      return facts.some(fact => fact.sourceMessageIds.includes(link.messageId) &&
        batch.sources.some(source => source.eventId === link.eventId &&
          [source.inputMessageId, source.messageId].includes(link.messageId)) &&
        fact.sourceMessageIds.every(messageId => origins.some(origin => origin.jobId === link.jobId && origin.messageId === messageId)));
    });
    if (!valid) continue;
    const versions = origins.map(link => verified.get(link.jobId)!.sources.find(source => source.eventId === link.eventId)!.version);
    result.set(id, { content: origins[0].content, type: origins[0].type,
      firstVersion: Math.min(...versions), lastVersion: Math.max(...versions),
      sourceMessageIds: [...new Set(origins.map(link => link.messageId))].sort((left, right) => left - right) });
  }
  return result;
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function visibleStoryMemoryIds(chatId: string, characterId: string, memoryIds: string[], audience?: StoryAudience,
  database: Database = db): Promise<Set<string>> {
  return new Set((await verifiedStoryMemoryOrigins(chatId, characterId, memoryIds, audience, database)).keys());
}
