import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { characterMemories, characterMemoryVectors } from '../../db/schema/memories';
import { storyEvents } from '../../db/schema/story-state';
import { storyMemoryJobs, storyMemoryLinks } from '../../db/schema/story-memory';
import { parseStoryMemoryResult, type StoryMemorySource } from './story-memory-extraction';
import { storyMemoryEvictionIds } from './story-memory-selection';

type Job = typeof storyMemoryJobs.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export interface StoryMemoryProviders {
  extract(sources: StoryMemorySource[], signal: AbortSignal): Promise<unknown>;
  embed(texts: string[], signal: AbortSignal): Promise<number[][]>;
}
export interface StoryMemoryWorkerOptions {
  maxAttempts: number;
  timeoutMs: number;
  maxInputChars: number;
  memoryLimit: number;
}

class MemoryJobError extends Error {
  constructor(readonly code: string, readonly terminal = false) { super(code); }
}

export class StoryMemoryWorker {
  constructor(private readonly database: Database, private readonly providers: StoryMemoryProviders,
    private readonly options: StoryMemoryWorkerOptions) {}

  private owned(job: Job) {
    return and(eq(storyMemoryJobs.id, job.id), eq(storyMemoryJobs.status, 'running'),
      eq(storyMemoryJobs.leaseToken, job.leaseToken!), sql`${storyMemoryJobs.leaseUntil} > now()`);
  }

  private async claim(): Promise<Job | undefined> {
    return this.database.transaction(async transaction => {
      await transaction.update(storyMemoryJobs).set({ status: 'failed', errorCode: 'ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null })
        .where(and(sql`${storyMemoryJobs.attempts} >= ${this.options.maxAttempts}`,
          or(inArray(storyMemoryJobs.status, ['pending', 'retry']),
            and(eq(storyMemoryJobs.status, 'running'), sql`${storyMemoryJobs.leaseUntil} <= now()`))));
      const [job] = await transaction.select().from(storyMemoryJobs).where(and(
        sql`${storyMemoryJobs.attempts} < ${this.options.maxAttempts}`,
        or(and(inArray(storyMemoryJobs.status, ['pending', 'retry']), lte(storyMemoryJobs.availableAt, sql`now()`)),
          and(eq(storyMemoryJobs.status, 'running'), sql`${storyMemoryJobs.leaseUntil} <= now()`)),
      )).orderBy(asc(storyMemoryJobs.availableAt), asc(storyMemoryJobs.createdAt), asc(storyMemoryJobs.id))
        .limit(1).for('update', { skipLocked: true });
      if (!job) return;
      const [claimed] = await transaction.update(storyMemoryJobs).set({ status: 'running', attempts: job.attempts + 1,
        leaseToken: randomUUID(), leaseUntil: sql`now() + ${2 * this.options.timeoutMs + 60000} * interval '1 millisecond'`,
        errorCode: null }).where(eq(storyMemoryJobs.id, job.id)).returning();
      return claimed;
    });
  }

  private async lockStory(job: Job, transaction: Transaction) {
    const [chat] = await transaction.select({ id: chats.id }).from(chats).where(eq(chats.id, job.chatId)).for('key share');
    if (!chat) throw new MemoryJobError('SOURCE_UNAVAILABLE', true);
  }

  private async sources(job: Job, transaction: Transaction) {
    await this.lockStory(job, transaction);
    const input = alias(messages, 'memory_input');
    const rows = await transaction.select({ eventId: storyEvents.id, version: storyEvents.version,
      inputMessageId: input.id, messageId: messages.id, input: input.content, reply: messages.content,
      userId: chats.userId, status: storyEvents.status, requestId: storyEvents.requestId, extra: messages.extra, inputExtra: input.extra,
    }).from(storyEvents)
      .innerJoin(chats, eq(chats.id, storyEvents.chatId))
      .innerJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, job.chatId), eq(messages.role, 'assistant')))
      .innerJoin(input, and(eq(input.id, storyEvents.inputMessageId), eq(input.chatId, job.chatId), eq(input.role, 'user')))
      .where(and(eq(storyEvents.chatId, job.chatId), inArray(storyEvents.id, job.sourceEventIds),
        sql`coalesce(${messages.characterId}, ${chats.characterId}) = ${job.characterId}::uuid`))
      .orderBy(asc(storyEvents.version)).for('share', { of: [storyEvents, chats, messages, input] });
    if (rows.length !== 5 || new Set(job.sourceEventIds).size !== 5 || rows.some(row => row.status !== 'confirmed' ||
      (row.extra as Record<string, unknown> | null)?.stateStatus !== 'confirmed' ||
      (row.extra as Record<string, unknown> | null)?.storyVersion !== row.version ||
      (row.extra as Record<string, unknown> | null)?.storyRequestId !== row.requestId ||
      ['interrupted', 'proposed'].includes(String((row.inputExtra as Record<string, unknown> | null)?.stateStatus)))) {
      throw new MemoryJobError('SOURCE_UNAVAILABLE', true);
    }
    const sources: StoryMemorySource[] = rows.map(({ eventId, version, inputMessageId, messageId, input: content, reply }) =>
      ({ eventId, version, inputMessageId, messageId, input: content, reply }));
    const text = JSON.stringify(sources);
    if (text.length > this.options.maxInputChars) throw new MemoryJobError('INPUT_BUDGET_EXCEEDED', true);
    return { sources, digest: createHash('sha256').update(text).digest('hex'), userId: rows[0].userId };
  }

  private async checkpoint(job: Job, extracted: unknown, digest: string) {
    return this.database.transaction(async transaction => {
      await this.lockStory(job, transaction);
      const [owned] = await transaction.select().from(storyMemoryJobs).where(this.owned(job)).for('update');
      if (!owned) throw new MemoryJobError('LEASE_LOST');
      const current = await this.sources(job, transaction);
      if (current.digest !== digest) throw new MemoryJobError('SOURCE_CHANGED', true);
      await transaction.update(storyMemoryJobs).set({ extracted, sourceDigest: digest }).where(this.owned(job));
    });
  }

  private async commit(job: Job, value: unknown, digest: string, vectors: number[][]) {
    return this.database.transaction(async transaction => {
      await this.lockStory(job, transaction);
      const [owned] = await transaction.select().from(storyMemoryJobs).where(this.owned(job)).for('update');
      if (!owned) throw new MemoryJobError('LEASE_LOST');
      const current = await this.sources(job, transaction);
      if (current.digest !== digest) throw new MemoryJobError('SOURCE_CHANGED', true);
      const { facts } = parseStoryMemoryResult(value, current.sources);
      const scope = `${job.characterId}:${current.userId}:${job.chatId}`;
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
      const scopeCondition = and(eq(characterMemories.characterId, job.characterId),
        eq(characterMemories.userId, current.userId), eq(characterMemories.sourceChatId, job.chatId));
      for (const [index, fact] of facts.entries()) {
        const [existing] = await transaction.select().from(characterMemories).where(and(scopeCondition,
          eq(characterMemories.type, fact.type), eq(characterMemories.content, fact.content)));
        const importance = { fact: '0.70', preference: '0.60', relationship: '0.80', event: '0.50' }[fact.type];
        const memory = existing ?? (await transaction.insert(characterMemories).values({ characterId: job.characterId,
          userId: current.userId, sourceChatId: job.chatId, sourceMessageId: fact.sourceMessageIds[0],
          type: fact.type, content: fact.content, importance }).returning())[0];
        await transaction.delete(characterMemoryVectors).where(eq(characterMemoryVectors.memoryId, memory.id));
        await transaction.insert(characterMemoryVectors).values({ memoryId: memory.id, embedding: vectors[index] });
        for (const source of current.sources) {
          for (const messageId of new Set(fact.sourceMessageIds)) {
            if (messageId !== source.inputMessageId && messageId !== source.messageId) continue;
            await transaction.insert(storyMemoryLinks).values({ memoryId: memory.id, jobId: job.id,
              eventId: source.eventId, messageId }).onConflictDoNothing();
          }
        }
      }
      const stored = await transaction.select({ id: characterMemories.id, type: characterMemories.type }).from(characterMemories).where(scopeCondition)
        .orderBy(asc(characterMemories.createdAt), asc(characterMemories.id));
      const excess = storyMemoryEvictionIds(stored, this.options.memoryLimit);
      if (excess.length) await transaction.delete(characterMemories).where(inArray(characterMemories.id, excess));
      const completed = await transaction.update(storyMemoryJobs).set({ status: 'succeeded', completedAt: sql`now()`,
        leaseToken: null, leaseUntil: null, errorCode: null }).where(this.owned(job)).returning({ id: storyMemoryJobs.id });
      if (!completed.length) throw new MemoryJobError('LEASE_LOST');
    });
  }

  async runOnce(): Promise<'idle' | 'succeeded' | 'retry' | 'failed' | 'superseded'> {
    const job = await this.claim();
    if (!job) return 'idle';
    let stage = 'SOURCE_UNAVAILABLE';
    try {
      const current = await this.database.transaction(transaction => this.sources(job, transaction));
      if (job.sourceDigest && job.sourceDigest !== current.digest) throw new MemoryJobError('SOURCE_CHANGED', true);
      stage = 'EXTRACTION_FAILED';
      const raw = job.extracted ?? await this.providers.extract(current.sources, AbortSignal.timeout(this.options.timeoutMs));
      stage = 'EXTRACTION_INVALID';
      const parsed = parseStoryMemoryResult(raw, current.sources);
      const { facts } = parsed;
      const checkpoint = parsed.summary ? { version: 1, facts, summary: parsed.summary } : facts;
      stage = 'CHECKPOINT_FAILED';
      if (job.extracted === null) await this.checkpoint(job, checkpoint, current.digest);
      stage = 'EMBEDDING_FAILED';
      const vectors = facts.length ? await this.providers.embed(facts.map(fact => fact.content), AbortSignal.timeout(this.options.timeoutMs)) : [];
      if (!Array.isArray(vectors) || vectors.length !== facts.length || vectors.some(vector => !Array.isArray(vector) || vector.length !== 384 ||
        !vector.every(value => typeof value === 'number' && Number.isFinite(value)) || !vector.some(value => value !== 0))) {
        throw new MemoryJobError('EMBEDDING_INVALID');
      }
      stage = 'COMMIT_FAILED';
      await this.commit(job, checkpoint, current.digest, vectors);
      return 'succeeded';
    } catch (error) {
      const code = error instanceof MemoryJobError ? error.code : stage;
      const terminal = error instanceof MemoryJobError && error.terminal;
      const status = terminal || job.attempts >= this.options.maxAttempts ? 'failed' : 'retry';
      const updated = await this.database.update(storyMemoryJobs).set({ status, errorCode: code,
        availableAt: sql`now() + ${15 * 2 ** (job.attempts - 1)} * interval '1 second'`, leaseToken: null, leaseUntil: null,
      }).where(this.owned(job)).returning({ id: storyMemoryJobs.id });
      return updated.length ? status : 'superseded';
    }
  }
}
