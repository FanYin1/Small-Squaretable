import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { checkPresentationQueueCli } from './story-presentation-queue-cli-check.mjs';
import { checkRealPresentationQueue } from './story-presentation-queue-real-check.mjs';
import { checkPresentationReconciliation } from './story-presentation-reconciliation-check.mjs';

export async function checkPresentationQueue({ loader, database, sql, api, auth, page, base, directory, check }) {
  const { runNextPresentationJob, recoverPresentationJobs, listPresentationJobs, cancelPresentationJob } = await loader.import('../src/server/services/presentation-jobs.service.ts', import.meta.url);
  const { createCharacterWithWorldbook } = await loader.import('../src/db/character-import.ts', import.meta.url);
  const { enqueuePresentation } = await loader.import('../src/db/presentation-queue.ts', import.meta.url);
  const owner = { userId: auth.user.id, tenantId: auth.user.tenantId };
  await sql`UPDATE presentation_jobs SET status='cancelled' WHERE user_id=${owner.userId} AND tenant_id=${owner.tenantId} AND status='queued'`;
  const originalCredits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${owner.tenantId} ORDER BY id`;
  let calls = 0;
  const usage = { ledgerId: randomUUID(), batchId: randomUUID(), tokens: 41, responseDigest: 'a'.repeat(64) };
  const provider = { owner, ready: async () => {}, select: async prompt => {
    calls++;
    const candidates = JSON.parse(prompt.slice(prompt.indexOf('{"characterId"'))).candidates;
    return { selection: { version: 1, candidateId: candidates[0].id }, usage };
  } };
  const create = (overrides = {}) => createCharacterWithWorldbook(database, {
    tenantId: owner.tenantId, creatorId: owner.userId, name: `队列验收-${randomUUID()}`,
    cardData: { first_mes: '清晨你走进小镇，旅店主人递来一封等待已久的信。', personality: 'PRIVATE_NEVER_SENT' }, ...overrides,
  });
  const row = async card => (await sql`SELECT * FROM presentation_jobs WHERE character_id=${card.id}`)[0];
  const versions = async card => (await sql`SELECT * FROM character_presentations WHERE character_id=${card.id}`).length;

  const authored = await create({ description: '作者已经确认的介绍。' });
  const absent = await create({ cardData: {} });
  const published = await create({ isPublic: true });
  assert.equal((await row(authored)).status, 'skipped');
  assert.equal((await row(absent)).status, 'skipped');
  assert.equal(await row(published), undefined);
  const rolledBack = randomUUID();
  await assert.rejects(() => database.transaction(async transaction => {
    await createCharacterWithWorldbook(transaction, { id: rolledBack, tenantId: owner.tenantId, creatorId: owner.userId,
      name: '回滚测试', cardData: { first_mes: '你走进安静的车站，窗外的雨还没有停。', character_book: { entries: [{ keys: ['station'], content: '安静的车站' }] } } });
    throw new Error('rollback');
  }), /rollback/);
  assert.equal((await sql`SELECT id FROM characters WHERE id=${rolledBack}`).length, 0);
  assert.equal((await sql`SELECT id FROM presentation_jobs WHERE character_id=${rolledBack}`).length, 0);
  assert.equal((await sql`SELECT id FROM worldbooks WHERE character_id=${rolledBack}`).length, 0);
  check('PQ-01: shared import atomically enqueues; author/no-source skip, public excluded, card/book/job roll back together');

  const normal = await create();
  await database.transaction(transaction => enqueuePresentation(transaction, normal));
  assert.equal((await sql`SELECT id FROM presentation_jobs WHERE character_id=${normal.id}`).length, 1);
  const normalJob = await row(normal);
  for (const foreign of [{ ...owner, userId: randomUUID() }, { ...owner, tenantId: randomUUID() }]) {
    await assert.rejects(() => listPresentationJobs(normal.id, foreign.userId, foreign.tenantId, database));
    await assert.rejects(() => cancelPresentationJob(normal.id, normalJob.id, foreign.userId, foreign.tenantId, database));
  }
  await assert.rejects(() => runNextPresentationJob({ ...provider, ready: async () => { throw new Error('budget closed'); } }, database), /budget closed/);
  assert.equal((await row(normal)).status, 'queued');
  assert.equal(calls, 0);
  await Promise.all([runNextPresentationJob(provider, database), runNextPresentationJob(provider, database)]);
  assert.equal(calls, 1);
  assert.equal((await row(normal)).status, 'complete');
  assert.equal(await versions(normal), 1);
  assert.equal((await api(`/characters/${normal.id}`)).presentation.draft.text, normal.cardData.first_mes);
  check('PQ-02: owner/tenant isolation, source dedup, budget preflight before claim, concurrent workers send once and auto-adopt');

  const crashed = await create();
  await assert.rejects(() => runNextPresentationJob(provider, database, { afterDispatch: async () => { throw new Error('process exit'); } }), /process exit/);
  assert.equal((await row(crashed)).status, 'dispatching');
  await sql`UPDATE presentation_jobs SET dispatch_until=now()-interval '1 second' WHERE character_id=${crashed.id}`;
  const beforeRecovery = calls;
  await runNextPresentationJob(provider, database);
  assert.equal((await row(crashed)).status, 'unknown');
  assert.equal(calls, beforeRecovery);
  check('PQ-03: crash after durable dispatch becomes unknown, never reclaims or resends a possibly paid call');

  const received = await create();
  await assert.rejects(() => runNextPresentationJob(provider, database, { afterReceipt: async () => { throw new Error('after receipt'); } }), /after receipt/);
  assert.equal((await row(received)).status, 'received');
  assert.equal(await versions(received), 0);
  const beforeAdoption = calls;
  await runNextPresentationJob({ ...provider, ready: async () => { throw new Error('gateway offline'); } }, database);
  await recoverPresentationJobs(database, owner);
  assert.equal(calls, beforeAdoption);
  assert.equal((await row(received)).status, 'complete');
  assert.equal(await versions(received), 1);
  check('PQ-04: persisted receipt recovers adoption without network or budget availability, completion/version commit atomically once');

  const cancelled = await create();
  await runNextPresentationJob({ ...provider, select: async prompt => {
    const result = await provider.select(prompt);
    await cancelPresentationJob(cancelled.id, (await row(cancelled)).id, owner.userId, owner.tenantId, database);
    return result;
  } }, database);
  assert.equal((await row(cancelled)).status, 'cancelled');
  assert.deepEqual((await row(cancelled)).usage, usage);
  assert.equal(await versions(cancelled), 0);
  for (const change of ['source', 'public']) {
    const changing = await create();
    await runNextPresentationJob({ ...provider, select: async prompt => {
      const result = await provider.select(prompt);
      if (change === 'source') await sql`UPDATE characters SET description='用户手改介绍' WHERE id=${changing.id}`;
      else await sql`UPDATE characters SET is_public=true WHERE id=${changing.id}`;
      return result;
    } }, database);
    assert.equal((await row(changing)).status, 'stale');
    assert.equal(await versions(changing), 0);
  }
  check('PQ-05: cancellation retains paid receipt without adoption; concurrent authored edit/publication rejects late source results');

  const invalid = await create();
  await runNextPresentationJob({ ...provider, select: async () => ({ selection: { version: 1, candidateId: 'f'.repeat(64) }, usage }) }, database);
  assert.equal((await row(invalid)).status, 'failed');
  assert.deepEqual((await row(invalid)).usage, usage);
  const unknown = await create();
  await runNextPresentationJob({ ...provider, select: async () => { throw new Error('connection lost'); } }, database);
  assert.equal((await row(unknown)).status, 'unknown');
  assert.equal(await runNextPresentationJob(provider, database), false);
  assert.equal(await versions(invalid), 0);
  assert.equal(await versions(unknown), 0);
  check('PQ-06: invalid known reply remains failed with usage; lost response stays unknown; neither is automatically retried');

  const visible = await create();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/characters/${visible.id}`);
  const panel = page.getByRole('region', { name: '介绍整理进度', exact: true });
  await expect(panel).toContainText('等待受额度约束的整理服务');
  await page.screenshot({ path: `${directory}/presentation-queue-mobile.png`, fullPage: true, animations: 'disabled' });
  await runNextPresentationJob(provider, database);
  await expect(panel).toContainText('介绍摘录已保存', { timeout: 12000 });
  await expect(page.getByTestId('presentation-source')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${directory}/presentation-queue-desktop.png`, fullPage: true, animations: 'disabled' });
  const cancelViaUi = await create();
  await page.goto(`${base}/characters/${cancelViaUi.id}`);
  await panel.getByRole('button', { name: '停止采用本次整理', exact: true }).click();
  await expect(panel).toContainText('已停止采用本次整理');
  assert.equal((await row(cancelViaUi)).status, 'cancelled');
  assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${owner.tenantId} ORDER BY id`, originalCredits);
  check('PQ-07: real mobile queue status, read-only polling refreshes adopted intro, desktop provenance and cancel API; credits unchanged, controlled provider only');
  await checkPresentationQueueCli({ sql, owner, create, check, runJob: provider => runNextPresentationJob(provider, database) });
  await checkPresentationReconciliation({ loader, sql, owner, create, check });
  return checkRealPresentationQueue({ loader, sql, owner, create, api });
}
