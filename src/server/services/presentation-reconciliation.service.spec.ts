import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planPresentationReconciliation } from './presentation-reconciliation.service';
import { collectPresentationSources } from './story-presentation-workflow';

function fixture() {
  const character = { id: randomUUID(), creatorId: randomUUID(), tenantId: randomUUID(), name: '回执测试',
    description: null, cardData: { first_mes: '你走进安静的车站，一封没有署名的信正在等你。' }, isPublic: false };
  const sources = collectPresentationSources(character);
  const job = { id: randomUUID(), characterId: character.id, userId: character.creatorId, tenantId: character.tenantId,
    sourceRevision: sources.sourceRevision, status: 'unknown', dispatchId: randomUUID(), dispatchUntil: new Date(0), draft: null, usage: null };
  const receipt = { dispatchId: job.dispatchId, selection: { version: 1, candidateId: sources.candidates[0].id },
    usage: { ledgerId: randomUUID(), batchId: randomUUID(), tokens: 7, responseDigest: 'a'.repeat(64) },
    requestDigest: 'b'.repeat(64), digestPrompt: () => 'b'.repeat(64) };
  return { character, job, receipt };
}
function plan(input = fixture()) {
  return planPresentationReconciliation(input.job as Parameters<typeof planPresentationReconciliation>[0],
    input.character as Parameters<typeof planPresentationReconciliation>[1], input.receipt);
}

describe('offline receipt reconciliation, no model execution or credit writes', () => {
  it('previews exact source-backed adoption without mutating inputs or exposing text', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const result = plan(input);
    expect(result.plan).toMatchObject({ previous: 'unknown', next: 'complete', current: true, alreadyApplied: false, tokens: 7 });
    expect(result.draft?.text).toBe(input.character.cardData.first_mes);
    expect(JSON.stringify(result.plan)).not.toContain(input.character.cardData.first_mes);
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each(['cancelled', 'stale', 'failed', 'skipped', 'complete'])('never revives terminal %s', status => {
    const input = fixture(); input.job.status = status;
    expect(plan(input)).toMatchObject({ plan: { next: status }, draft: null });
  });
  it.each(['description', 'opening', 'public'])('rejects late adoption after %s changes but retains known usage', change => {
    const input = fixture();
    if (change === 'description') Object.assign(input.character, { description: '用户修改' });
    if (change === 'opening') input.character.cardData.first_mes += '新内容。';
    if (change === 'public') input.character.isPublic = true;
    expect(plan(input)).toMatchObject({ plan: { next: 'stale', tokens: 7 }, draft: null });
  });
  it('known invalid selections fail, explicit null skips, neither silently retries', () => {
    const invalid = fixture(); invalid.receipt.selection.candidateId = 'f'.repeat(64);
    expect(plan(invalid).plan.next).toBe('failed');
    const empty = fixture(); Object.assign(empty.receipt, { selection: { version: 1, candidateId: null } });
    expect(plan(empty).plan.next).toBe('skipped');
  });
  it('rejects wrong dispatch, owner, tenant and prompt, active calls and unclaimed jobs', () => {
    for (const key of ['dispatch', 'owner', 'tenant', 'prompt', 'active', 'queued', 'received']) {
      const input = fixture();
      if (key === 'dispatch') input.receipt.dispatchId = randomUUID();
      if (key === 'owner') input.job.userId = randomUUID();
      if (key === 'tenant') input.job.tenantId = randomUUID();
      if (key === 'prompt') input.receipt.requestDigest = 'c'.repeat(64);
      if (key === 'active') { input.job.status = 'dispatching'; input.job.dispatchUntil = new Date(Date.now() + 60000); }
      if (['queued', 'received'].includes(key)) input.job.status = key;
      expect(() => plan(input)).toThrow();
    }
  });
  it('allows expired dispatch, binds fingerprints to cancellation and source changes', () => {
    const input = fixture(); input.job.status = 'dispatching';
    const before = plan(input).plan.fingerprint;
    input.job.status = 'cancelled';
    expect(plan(input).plan.fingerprint).not.toBe(before);
    input.character.cardData.first_mes += '另一个开场。';
    expect(plan(input).plan.fingerprint).not.toBe(before);
  });
  it('same terminal usage is idempotent; conflicting billing evidence is never overwritten', () => {
    const input = fixture(); input.job.status = 'complete';
    Object.assign(input.job, { usage: input.receipt.usage });
    expect(plan(input).plan.alreadyApplied).toBe(true);
    input.receipt.usage = { ...input.receipt.usage, tokens: 8 };
    expect(() => plan(input)).toThrow(/RECEIPT_CONFLICT/);
  });
});
