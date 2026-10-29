import { createHash, randomUUID } from 'node:crypto';
import { and, or, eq, lt, desc, sql } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { storyAdapterJobs } from '../../db/schema/story-adapter-jobs';
import { AppError, NotFoundError } from '../../core/errors';
import { adapterArtifactSchema, type AdapterJobView } from '../../types/story-adapter';
import type { StoryContentSnapshot } from '../../types/story-content';
import { collectStorySources, type StorySources } from './story-diagnostics.service';
import { captureStoryContent } from './story-content.service';
import { storyEntryRevision } from './story-entry.service';
import { runAdapterGraph } from './story-adapter-workflow';
import { logger } from './logger.service';
import { inspectStoryRuleSources } from './story-rule-inspection.service';
import { isCurrentStoryAdapter } from './story-adapter-compiler';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Job = typeof storyAdapterJobs.$inferSelect;
class AdapterLeaseLost extends Error {}
class AdapterSourceChanged extends Error {}

async function ownedSources(transaction: Transaction, characterId: string, userId: string, tenantId: string) {
  const [owner] = await transaction.select({ id: characters.id }).from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.creatorId, userId), eq(characters.tenantId, tenantId)));
  if (!owner) throw new NotFoundError('Character');
  const sources = await collectStorySources(transaction, [characterId]);
  const content = captureStoryContent([characterId], userId, sources);
  return { sources, content, revision: storyEntryRevision(content, sources) };
}

function jobView(job: Job, revision: string): AdapterJobView {
  const artifact = job.artifact ? adapterArtifactSchema.parse(job.artifact) : null;
  let result: AdapterJobView['result'] = null;
  if (artifact) {
    const { rules, sources, ...summary } = artifact;
    result = { ...summary, sourceCount: sources.length, fieldCount: rules?.fields.length ?? 0, actionCount: rules?.actions.length ?? 0 };
  }
  return { id: job.id, status: job.status, stage: job.stage, sourceRevision: job.sourceRevision, attempt: job.attempt,
    current: job.sourceRevision === revision, createdAt: job.createdAt.toISOString(),
    result };
}

export async function listAdapterJobs(characterId: string, userId: string, tenantId: string, database: Database = db) {
  return database.transaction(async transaction => {
    const { revision, content, sources } = await ownedSources(transaction, characterId, userId, tenantId);
    const jobs = await transaction.select().from(storyAdapterJobs).where(and(eq(storyAdapterJobs.characterId, characterId),
      eq(storyAdapterJobs.userId, userId), eq(storyAdapterJobs.tenantId, tenantId)))
      .orderBy(desc(storyAdapterJobs.createdAt), desc(storyAdapterJobs.id)).limit(10);
    const views = jobs.map(job => {
      const view = jobView(job, revision);
      if (view.current && job.status === 'ready' && job.artifact) {
        view.current = isCurrentStoryAdapter(adapterArtifactSchema.parse(job.artifact), content, sources);
      }
      return view;
    });
    const latest = views[0];
    if (latest?.status === 'ready' && latest.current && latest.result) {
      latest.result.inspection = inspectStoryRuleSources(content, sources, revision);
    }
    return views;
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function createAdapterJob(characterId: string, userId: string, tenantId: string, requestId: string, database: Database = db) {
  return database.transaction(async transaction => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${characterId}, 277))`);
    const { revision } = await ownedSources(transaction, characterId, userId, tenantId);
    const ownership = and(eq(storyAdapterJobs.characterId, characterId), eq(storyAdapterJobs.userId, userId), eq(storyAdapterJobs.tenantId, tenantId));
    const [previous] = await transaction.select().from(storyAdapterJobs).where(and(ownership, eq(storyAdapterJobs.requestId, requestId)));
    if (previous) return jobView(previous, revision);
    const [active] = await transaction.select().from(storyAdapterJobs).where(and(ownership,
      or(eq(storyAdapterJobs.status, 'queued'), eq(storyAdapterJobs.status, 'running'))));
    if (active) throw new AppError('已有检查正在进行，请等待或取消后重试。', 409, 'STORY_ADAPTATION_BUSY');
    const [job] = await transaction.insert(storyAdapterJobs).values({ characterId, userId, tenantId, requestId, sourceRevision: revision }).returning();
    return jobView(job, revision);
  });
}

export async function cancelAdapterJob(characterId: string, jobId: string, userId: string, tenantId: string, database: Database = db) {
  return database.transaction(async transaction => {
    const { revision } = await ownedSources(transaction, characterId, userId, tenantId);
    const ownership = and(eq(storyAdapterJobs.id, jobId), eq(storyAdapterJobs.characterId, characterId), eq(storyAdapterJobs.userId, userId), eq(storyAdapterJobs.tenantId, tenantId));
    await transaction.update(storyAdapterJobs).set({ status: 'cancelled', leaseId: null, leaseUntil: null, updatedAt: new Date() })
      .where(and(ownership, or(eq(storyAdapterJobs.status, 'queued'), eq(storyAdapterJobs.status, 'running'))));
    const [job] = await transaction.select().from(storyAdapterJobs).where(ownership);
    if (!job) throw new NotFoundError('Adaptation job');
    return jobView(job, revision);
  });
}

export async function runNextAdapterJob(database: Database = db, hooks?: { checkpoint?: (stage: AdapterJobView['stage'], job: Job) => Promise<void> }) {
  const expired = and(eq(storyAdapterJobs.status, 'running'), lt(storyAdapterJobs.leaseUntil, new Date()));
  await database.update(storyAdapterJobs).set({ status: 'failed', leaseId: null, leaseUntil: null, updatedAt: new Date() })
    .where(and(expired, sql`${storyAdapterJobs.attempt} >= 3`));
  const job = await database.transaction(async transaction => {
    const [candidate] = await transaction.select().from(storyAdapterJobs)
      .where(and(or(eq(storyAdapterJobs.status, 'queued'), expired), lt(storyAdapterJobs.attempt, 3)))
      .orderBy(storyAdapterJobs.createdAt, storyAdapterJobs.id).limit(1).for('update', { skipLocked: true });
    if (!candidate) return null;
    const [claimed] = await transaction.update(storyAdapterJobs).set({ status: 'running', leaseId: randomUUID(),
      leaseUntil: new Date(Date.now() + 30_000), attempt: candidate.attempt + 1, updatedAt: new Date() })
      .where(eq(storyAdapterJobs.id, candidate.id)).returning();
    return claimed;
  });
  if (!job) return false;
  const lease = and(eq(storyAdapterJobs.id, job.id), eq(storyAdapterJobs.status, 'running'),
    eq(storyAdapterJobs.leaseId, job.leaseId!), sql`${storyAdapterJobs.leaseUntil} > now()`);
  try {
    const artifact = await runAdapterGraph({ jobId: job.id, sourceRevision: job.sourceRevision,
      checkpoint: async stage => {
        await hooks?.checkpoint?.(stage, job);
        const updated = await database.update(storyAdapterJobs).set({ stage, leaseUntil: new Date(Date.now() + 30_000), updatedAt: new Date() })
          .where(lease).returning({ id: storyAdapterJobs.id });
        if (!updated.length) throw new AdapterLeaseLost();
      },
      collect: () => database.transaction(async transaction => {
        const current = await ownedSources(transaction, job.characterId, job.userId, job.tenantId);
        if (current.revision !== job.sourceRevision) throw new AdapterSourceChanged();
        return current;
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' }),
    });
    await hooks?.checkpoint?.('complete', job);
    await database.transaction(async transaction => {
      const current = await ownedSources(transaction, job.characterId, job.userId, job.tenantId);
      if (current.revision !== job.sourceRevision) throw new AdapterSourceChanged();
      await transaction.update(storyAdapterJobs).set({ status: 'ready', stage: 'complete', artifact,
        leaseId: null, leaseUntil: null, updatedAt: new Date() }).where(lease);
    });
  } catch (error) {
    if (!(error instanceof AdapterLeaseLost)) {
      await database.update(storyAdapterJobs).set({ status: error instanceof AdapterSourceChanged ? 'stale' : 'failed',
        leaseId: null, leaseUntil: null, updatedAt: new Date() }).where(lease);
      if (!(error instanceof AdapterSourceChanged) && !(error instanceof NotFoundError)) logger.warn('Story adapter job failed', { jobId: job.id });
    }
  }
  return true;
}

export async function attachStoryAdaptation(transaction: Pick<Transaction, 'select'>, content: StoryContentSnapshot, sources: StorySources) {
  if (content.characters.length !== 1) return;
  const source = sources.characters[0];
  if (!source?.creatorId) return;
  const revision = storyEntryRevision(content, sources);
  const [job] = await transaction.select().from(storyAdapterJobs).where(and(eq(storyAdapterJobs.characterId, source.id),
    eq(storyAdapterJobs.userId, source.creatorId), eq(storyAdapterJobs.sourceRevision, revision), eq(storyAdapterJobs.status, 'ready')))
    .orderBy(desc(storyAdapterJobs.createdAt), desc(storyAdapterJobs.id)).limit(1);
  if (!job) return;
  const artifact = adapterArtifactSchema.parse(job.artifact);
  if (artifact.jobId !== job.id || artifact.characterId !== source.id || artifact.sourceRevision !== revision) {
    throw new AppError('Adaptation artifact is inconsistent', 409, 'STORY_ADAPTATION_INVALID');
  }
  if (!isCurrentStoryAdapter(artifact, content, sources)) return;
  content.characters[0].adaptation = artifact;
  content.revision = createHash('sha256').update(JSON.stringify(content.characters)).digest('hex');
}

export function startStoryAdapterWorker() {
  let busy = false;
  let stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try { for (let count = 0; count < 4 && !stopped; count++) if (!await runNextAdapterJob()) break; }
    catch { logger.warn('Story adapter worker unavailable'); }
    finally { busy = false; }
  }
  const timer = setInterval(() => { void tick(); }, 2000);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
