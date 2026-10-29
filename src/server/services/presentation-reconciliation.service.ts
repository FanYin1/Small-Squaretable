import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { characterPresentations } from '../../db/schema/character-presentations';
import { presentationJobs } from '../../db/schema/presentation-jobs';
import { presentationCharacter } from '../../db/presentation-queue';
import { presentationUsageSchema, type PresentationUsage } from '../../types/presentation-job';
import type { PresentationDraft } from '../../types/story-presentation';
import { collectPresentationSources, presentationSelectionPrompt, verifyPresentationSelection } from './story-presentation-workflow';

type Job = typeof presentationJobs.$inferSelect;
type Character = typeof characters.$inferSelect;
type Receipt = {
  dispatchId: string; usage: PresentationUsage; selection: unknown;
  requestDigest: string; digestPrompt: (prompt: string) => string;
};
const ownerSchema = z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), jobId: z.string().uuid() }).strict();
type Owner = z.infer<typeof ownerSchema>;

export async function auditPresentationReconciliation(database: Database, owner: Omit<Owner, 'jobId'>) {
  ownerSchema.omit({ jobId: true }).parse(owner);
  return database.transaction(async transaction => {
    const jobs = await transaction.select({ jobId: presentationJobs.id, status: presentationJobs.status,
      dispatchId: presentationJobs.dispatchId, dispatchUntil: presentationJobs.dispatchUntil, usage: presentationJobs.usage })
      .from(presentationJobs).where(and(eq(presentationJobs.userId, owner.userId), eq(presentationJobs.tenantId, owner.tenantId),
        inArray(presentationJobs.status, ['unknown', 'dispatching', 'cancelled', 'failed'])))
      .orderBy(desc(presentationJobs.createdAt), desc(presentationJobs.id)).limit(101);
    return { limited: jobs.length > 100, jobs: jobs.slice(0, 100).map(job => ({ ...job,
      status: job.status === 'dispatching' && job.dispatchUntil && job.dispatchUntil.getTime() <= Date.now() ? 'unknown' : job.status })) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export function planPresentationReconciliation(job: Job, character: Character, receipt: Receipt) {
  const usage = presentationUsageSchema.parse(receipt.usage);
  if (!job.dispatchId || job.dispatchId !== receipt.dispatchId || job.characterId !== character.id
    || job.userId !== character.creatorId || job.tenantId !== character.tenantId) throw new Error('PRESENTATION_RECONCILIATION_SCOPE');
  if (job.usage && !isDeepStrictEqual(job.usage, usage)) throw new Error('PRESENTATION_RECONCILIATION_RECEIPT_CONFLICT');
  if (job.status === 'dispatching' && (!job.dispatchUntil || job.dispatchUntil.getTime() > Date.now())) {
    throw new Error('PRESENTATION_RECONCILIATION_ACTIVE');
  }
  if (job.status === 'queued' || job.status === 'received') throw new Error('PRESENTATION_RECONCILIATION_STATE');
  const sources = collectPresentationSources(presentationCharacter(character));
  const current = sources.sourceRevision === job.sourceRevision;
  let status = job.status;
  let draft: PresentationDraft | null = null;
  if (['unknown', 'dispatching'].includes(status)) {
    if (!current || character.isPublic) status = 'stale';
    else {
      if (receipt.digestPrompt(presentationSelectionPrompt(sources)) !== receipt.requestDigest) throw new Error('PRESENTATION_RECONCILIATION_REQUEST_MISMATCH');
      try {
        draft = verifyPresentationSelection(presentationCharacter(character), sources, receipt.selection);
        status = draft.status === 'draft' ? 'complete' : 'skipped';
      } catch { status = 'failed'; }
    }
  } else if (!['complete', 'skipped', 'cancelled', 'stale', 'failed'].includes(status)) throw new Error('PRESENTATION_RECONCILIATION_STATE');
  const alreadyApplied = Boolean(job.usage) && !['unknown', 'dispatching'].includes(job.status);
  const fingerprint = createHash('sha256').update(JSON.stringify({ job, currentRevision: sources.sourceRevision,
    isPublic: character.isPublic, receipt: { dispatchId: receipt.dispatchId, usage, requestDigest: receipt.requestDigest }, status, draft })).digest('hex');
  return { plan: { version: 1, jobId: job.id, dispatchId: job.dispatchId, previous: job.status, next: status,
    current, alreadyApplied, tokens: usage.tokens, ledgerId: usage.ledgerId, batchId: usage.batchId,
    responseDigest: usage.responseDigest, fingerprint }, draft, usage };
}

export async function reconcilePresentationJob(database: Database, owner: Owner, receipt: Receipt, expectedFingerprint?: string) {
  ownerSchema.parse(owner);
  if (expectedFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error('PRESENTATION_RECONCILIATION_FINGERPRINT');
  return database.transaction(async transaction => {
    const scope = and(eq(presentationJobs.id, owner.jobId), eq(presentationJobs.userId, owner.userId), eq(presentationJobs.tenantId, owner.tenantId));
    const query = transaction.select().from(presentationJobs).where(scope);
    const [job] = await (expectedFingerprint ? query.for('update') : query);
    if (!job) throw new Error('PRESENTATION_RECONCILIATION_NOT_FOUND');
    const characterQuery = transaction.select().from(characters).where(and(eq(characters.id, job.characterId),
      eq(characters.creatorId, owner.userId), eq(characters.tenantId, owner.tenantId)));
    const [character] = await (expectedFingerprint ? characterQuery.for('update') : characterQuery);
    if (!character) throw new Error('PRESENTATION_RECONCILIATION_NOT_FOUND');
    const { plan, draft, usage } = planPresentationReconciliation(job, character, receipt);
    if (!expectedFingerprint) return { ...plan, applied: false };
    if (plan.alreadyApplied) return { ...plan, applied: false };
    if (expectedFingerprint !== plan.fingerprint) throw new Error('PRESENTATION_RECONCILIATION_PLAN_STALE');
    if (draft?.status === 'draft') await transaction.insert(characterPresentations).values({ characterId: job.characterId,
      userId: owner.userId, tenantId: owner.tenantId, requestId: job.id, sourceRevision: job.sourceRevision, draft });
    await transaction.update(presentationJobs).set({ status: plan.next, usage, ...(draft ? { draft } : {}), updatedAt: new Date() }).where(scope);
    return { ...plan, applied: true };
  }, expectedFingerprint ? { isolationLevel: 'read committed' } : { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
