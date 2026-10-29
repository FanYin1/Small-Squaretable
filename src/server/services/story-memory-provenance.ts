import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { storyEvents } from '../../db/schema/story-state';
import { storyMemoryJobs } from '../../db/schema/story-memory';
import { storyKnowledgeVisible, type StoryAudience } from '../../types/story-knowledge';
import { parseStoryMemoryResult, type StoryMemorySource } from './story-memory-extraction';

type Checkpoint = Pick<typeof storyMemoryJobs.$inferSelect, 'id' | 'sourceEventIds' | 'extracted' | 'sourceDigest'>;

export async function verifiedStoryMemoryBatches(chatId: string, characterId: string, jobs: Checkpoint[],
  database: Pick<Database, 'select'>, audience?: StoryAudience) {
  const verified = new Map<string, { sources: StoryMemorySource[]; result: ReturnType<typeof parseStoryMemoryResult> }>();
  if (!jobs.length) return verified;
  const input = alias(messages, 'memory_provenance_input');
  const rows = await database.select({ eventId: storyEvents.id, version: storyEvents.version,
    inputMessageId: input.id, messageId: messages.id, input: input.content, reply: messages.content,
    inputExtra: input.extra, replyExtra: messages.extra,
  }).from(storyEvents).innerJoin(chats, eq(chats.id, storyEvents.chatId))
    .innerJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, chatId), eq(messages.role, 'assistant')))
    .innerJoin(input, and(eq(input.id, storyEvents.inputMessageId), eq(input.chatId, chatId), eq(input.role, 'user')))
    .where(and(eq(storyEvents.chatId, chatId), inArray(storyEvents.id, [...new Set(jobs.flatMap(job => job.sourceEventIds))]),
      eq(storyEvents.status, 'confirmed'), sql`coalesce(${messages.characterId}, ${chats.characterId}) = ${characterId}::uuid`,
      sql`${messages.extra}->>'stateStatus' = 'confirmed'`, sql`${messages.extra}->>'storyVersion' = ${storyEvents.version}::text`,
      sql`${messages.extra}->>'storyRequestId' = ${storyEvents.requestId}`,
      sql`coalesce(${input.extra}->>'stateStatus', '') NOT IN ('interrupted', 'proposed')`))
    .orderBy(asc(storyEvents.version));
  for (const job of jobs) {
    const matched = rows.filter(row => job.sourceEventIds.includes(row.eventId));
    if (new Set(job.sourceEventIds).size !== 5 || matched.length !== 5 || !job.sourceDigest) continue;
    if (matched.some(row => !storyKnowledgeVisible(row.inputExtra, characterId, audience) ||
      !storyKnowledgeVisible(row.replyExtra, characterId, audience))) continue;
    const sources = matched.map(({ eventId, version, inputMessageId, messageId, input: content, reply }) =>
      ({ eventId, version, inputMessageId, messageId, input: content, reply }));
    if (createHash('sha256').update(JSON.stringify(sources)).digest('hex') !== job.sourceDigest) continue;
    try { verified.set(job.id, { sources, result: parseStoryMemoryResult(job.extracted, sources) }); }
    catch { continue; }
  }
  return verified;
}
