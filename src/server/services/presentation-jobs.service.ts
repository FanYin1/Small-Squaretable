import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { characterPresentations } from '../../db/schema/character-presentations';
import { presentationJobs } from '../../db/schema/presentation-jobs';
import { presentationCharacter } from '../../db/presentation-queue';
import { NotFoundError } from '../../core/errors';
import { presentationUsageSchema, type PresentationJobView, type PresentationUsage } from '../../types/presentation-job';
import { collectPresentationSources, revalidatePresentationDraft, runPresentationGraph } from './story-presentation-workflow';

type Job = typeof presentationJobs.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type PresentationProvider = {
  owner: { userId: string; tenantId: string };
  ready: () => Promise<void>;
  select: (prompt: string, dispatchId: string) => Promise<{ selection: unknown; usage: PresentationUsage }>;
};

async function ownedCharacter(transaction: Pick<Transaction, 'select'>, characterId: string, userId: string, tenantId: string) {
  const [character] = await transaction.select().from(characters).where(and(eq(characters.id, characterId),
    eq(characters.creatorId, userId), eq(characters.tenantId, tenantId)));
  if (!character) throw new NotFoundError('Character');
  return character;
}

function view(job: Job, revision: string): PresentationJobView {
  return { id: job.id, status: job.status === 'dispatching' && job.dispatchUntil && job.dispatchUntil.getTime() <= Date.now()
    ? 'unknown' : job.status, current: revision === job.sourceRevision, createdAt: job.createdAt.toISOString() };
}

export async function listPresentationJobs(characterId: string, userId: string, tenantId: string, database: Database = db) {
  return database.transaction(async transaction => {
    const character = await ownedCharacter(transaction, characterId, userId, tenantId);
    const revision = collectPresentationSources(presentationCharacter(character)).sourceRevision;
    const jobs = await transaction.select().from(presentationJobs).where(and(eq(presentationJobs.characterId, characterId),
      eq(presentationJobs.userId, userId), eq(presentationJobs.tenantId, tenantId)))
      .orderBy(desc(presentationJobs.createdAt), desc(presentationJobs.id)).limit(10);
    return jobs.map(job => view(job, revision));
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function cancelPresentationJob(characterId: string, jobId: string, userId: string, tenantId: string, database: Database = db) {
  return database.transaction(async transaction => {
    const character = await ownedCharacter(transaction, characterId, userId, tenantId);
    const scope = and(eq(presentationJobs.id, jobId), eq(presentationJobs.characterId, characterId),
      eq(presentationJobs.userId, userId), eq(presentationJobs.tenantId, tenantId));
    await transaction.update(presentationJobs).set({ status: 'cancelled', draft: null, updatedAt: new Date() })
      .where(and(scope, inArray(presentationJobs.status, ['queued', 'dispatching', 'received', 'unknown'])));
    const [job] = await transaction.select().from(presentationJobs).where(scope);
    if (!job) throw new NotFoundError('Presentation job');
    return view(job, collectPresentationSources(presentationCharacter(character)).sourceRevision);
  });
}

export async function recoverPresentationJobs(database: Database = db, owner?: PresentationProvider['owner']) {
  const scope = owner ? and(eq(presentationJobs.userId, owner.userId), eq(presentationJobs.tenantId, owner.tenantId)) : undefined;
  await database.update(presentationJobs).set({ status: 'unknown', updatedAt: new Date() })
    .where(and(scope, eq(presentationJobs.status, 'dispatching'), lt(presentationJobs.dispatchUntil, new Date())));
  return database.transaction(async transaction => {
    const [job] = await transaction.select().from(presentationJobs).where(and(scope, eq(presentationJobs.status, 'received')))
      .orderBy(presentationJobs.createdAt, presentationJobs.id).limit(1).for('update', { skipLocked: true });
    if (!job) return false;
    const [character] = await transaction.select().from(characters).where(and(eq(characters.id, job.characterId),
      eq(characters.creatorId, job.userId), eq(characters.tenantId, job.tenantId))).for('update');
    let draft;
    if (character && !character.isPublic) {
      try { draft = revalidatePresentationDraft(presentationCharacter(character), job.draft); }
      catch { draft = undefined; }
    }
    if (!draft || draft.sourceRevision !== job.sourceRevision) {
      await transaction.update(presentationJobs).set({ status: 'stale', draft: null, updatedAt: new Date() }).where(eq(presentationJobs.id, job.id));
      return true;
    }
    if (draft.status === 'draft') {
      await transaction.insert(characterPresentations).values({ characterId: job.characterId, userId: job.userId,
        tenantId: job.tenantId, requestId: job.id, sourceRevision: job.sourceRevision, draft });
    }
    await transaction.update(presentationJobs).set({ status: draft.status === 'draft' ? 'complete' : 'skipped', updatedAt: new Date() })
      .where(eq(presentationJobs.id, job.id));
    return true;
  });
}

export async function runNextPresentationJob(provider: PresentationProvider, database: Database = db,
  hooks?: { afterDispatch?: () => Promise<void>; afterReceipt?: () => Promise<void> }) {
  if (await recoverPresentationJobs(database, provider.owner)) return true;
  const owner = and(eq(presentationJobs.userId, provider.owner.userId), eq(presentationJobs.tenantId, provider.owner.tenantId));
  const [pending] = await database.select({ id: presentationJobs.id }).from(presentationJobs)
    .where(and(owner, eq(presentationJobs.status, 'queued'))).limit(1);
  if (!pending) return false;
  await provider.ready();
  const claimed = await database.transaction(async transaction => {
    const [job] = await transaction.select().from(presentationJobs).where(and(owner, eq(presentationJobs.status, 'queued')))
      .orderBy(presentationJobs.createdAt, presentationJobs.id).limit(1).for('update', { skipLocked: true });
    if (!job) return null;
    const character = await ownedCharacter(transaction, job.characterId, job.userId, job.tenantId);
    const source = presentationCharacter(character);
    const sources = collectPresentationSources(source);
    if (character.isPublic || sources.sourceRevision !== job.sourceRevision) {
      await transaction.update(presentationJobs).set({ status: 'stale', updatedAt: new Date() }).where(eq(presentationJobs.id, job.id));
      return { skipped: true as const };
    }
    if (sources.existingIntroduction || sources.limited || !sources.candidates.length) {
      await transaction.update(presentationJobs).set({ status: 'skipped', updatedAt: new Date() }).where(eq(presentationJobs.id, job.id));
      return { skipped: true as const };
    }
    const dispatchId = randomUUID();
    await transaction.update(presentationJobs).set({ status: 'dispatching', dispatchId,
      dispatchUntil: new Date(Date.now() + 180_000), updatedAt: new Date() }).where(eq(presentationJobs.id, job.id));
    return { skipped: false as const, job, source, sources, dispatchId };
  });
  if (!claimed) return false;
  if (claimed.skipped) return true;
  await hooks?.afterDispatch?.();
  const scope = and(eq(presentationJobs.id, claimed.job.id), eq(presentationJobs.dispatchId, claimed.dispatchId));
  let usage: PresentationUsage | undefined;
  let draft;
  try {
    draft = await runPresentationGraph({ character: claimed.source, select: async prompt => {
      const result = await provider.select(prompt, claimed.dispatchId);
      usage = presentationUsageSchema.parse(result.usage);
      return result.selection;
    } });
  } catch { draft = undefined; }
  if (!usage) {
    await database.update(presentationJobs).set({ status: 'unknown', updatedAt: new Date() })
      .where(and(scope, eq(presentationJobs.status, 'dispatching')));
    return true;
  }
  await database.transaction(async transaction => {
    const [job] = await transaction.select().from(presentationJobs).where(scope).for('update');
    if (!job) return;
    if (['dispatching', 'unknown'].includes(job.status)) {
      await transaction.update(presentationJobs).set({ status: draft ? 'received' : 'failed', draft: draft ?? null,
        usage, updatedAt: new Date() }).where(scope);
    } else if (job.status === 'cancelled') {
      await transaction.update(presentationJobs).set({ usage, updatedAt: new Date() }).where(scope);
    }
  });
  await hooks?.afterReceipt?.();
  await recoverPresentationJobs(database, provider.owner);
  return true;
}
