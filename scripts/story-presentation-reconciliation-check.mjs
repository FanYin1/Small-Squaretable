import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineeringBudget, requestDigest } from './lib/engineering-model-budget.mjs';
import { savePresentationReceipt } from './lib/presentation-receipts.mjs';
import { presentationRequest } from './lib/presentation-queue-provider.mjs';

export async function checkPresentationReconciliation({ loader, sql, owner, create, check }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-reconcile-cli-'));
  const budget = new EngineeringBudget(join(directory, 'ledger.json'));
  const config = join(directory, 'worker.env');
  const { collectPresentationSources, presentationSelectionPrompt } = await loader.import('../src/server/services/story-presentation-workflow.ts', import.meta.url);
  const originalCredits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${owner.tenantId} ORDER BY id`;
  try {
    await budget.initialize({ authorization: 100000, history: { known: 0, unreceipted: 0, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false } });
    const batch = await budget.createBatch({ scope: 'Synthetic offline reconciliation fixtures, no supplier', maxTokens: 50000, maxRequests: 12 });
    const ledgerId = (await budget.inspect()).ledger.id;
    const settings = { PRESENTATION_WORKER_DATABASE_URL: process.env.DATABASE_URL,
      PRESENTATION_WORKER_USER_ID: owner.userId, PRESENTATION_WORKER_TENANT_ID: owner.tenantId,
      ENGINEERING_MODEL_GATEWAY_LEDGER_ID: ledgerId, ENGINEERING_MODEL_GATEWAY_BATCH_ID: batch.id,
      CUSTOM_LLM_DEFAULT_MODEL: 'controlled', CUSTOM_LLM_API_FORMAT: 'openai' };
    const writeConfig = values => writeFile(config, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
    await writeConfig(settings);
    async function fixture(kind = 'selected') {
      const card = await create();
      const [job] = await sql`SELECT * FROM presentation_jobs WHERE character_id=${card.id}`;
      const sources = collectPresentationSources({ id: card.id, name: card.name, description: card.description, cardData: card.cardData });
      const selection = { version: 1, candidateId: kind === 'null' ? null : kind === 'invalid' ? 'f'.repeat(64) : sources.candidates[0].id };
      const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(selection) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 11, total_tokens: 41 } });
      const digest = presentationRequest(presentationSelectionPrompt(sources), 'controlled', 'openai').digest;
      const reserved = await budget.reserve(batch.id, 4000, digest);
      await budget.settle(reserved.id, 41, `sha256:${requestDigest(body)}`);
      const receipt = await savePresentationReceipt(directory, { version: 1, dispatchId: reserved.id, ledgerId, batchId: batch.id,
        format: 'openai', model: 'controlled', requestDigest: digest, responseDigest: requestDigest(body), body });
      await sql`UPDATE presentation_jobs SET status='unknown', dispatch_id=${reserved.id}, dispatch_until=now()-interval '1 second' WHERE id=${job.id}`;
      return { card, job, receipt };
    }
    async function cli(command, fixture, fingerprint, expectedCode = 0) {
      const args = ['scripts/story-presentation-reconcile.mjs', command, '--config', config, '--ledger', budget.path];
      if (command !== 'audit') args.push('--receipt', fixture.receipt, '--job', fixture.job.id);
      if (fingerprint !== undefined) args.push('--fingerprint', fingerprint);
      const child = spawn(process.execPath, args, { stdio: 'pipe' });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
      try { assert.equal((await once(child, 'exit'))[0], expectedCode, output); }
      finally { clearTimeout(timer); }
      assert.ok(!output.includes(fixture.card.cardData.first_mes));
      return JSON.parse(output.trim().split('\n').at(-1));
    }
    const normal = await fixture();
    const beforeJob = await sql`SELECT * FROM presentation_jobs WHERE id=${normal.job.id}`;
    const beforeLedger = await readFile(budget.path);
    const beforeMtime = (await stat(budget.path)).mtimeMs;
    const audit = await cli('audit', normal);
    assert.equal(audit.writes, 0); assert.equal(audit.paidCalls, 0);
    assert.equal(audit.jobs.find(job => job.jobId === normal.job.id).billing, 'settled');
    assert.ok(audit.jobs.some(job => job.billing === 'not-in-ledger'));
    const plan = await cli('plan', normal);
    assert.equal(plan.next, 'complete'); assert.equal(plan.applied, false);
    assert.deepEqual(await sql`SELECT * FROM presentation_jobs WHERE id=${normal.job.id}`, beforeJob);
    assert.deepEqual(await readFile(budget.path), beforeLedger);
    assert.equal((await stat(budget.path)).mtimeMs, beforeMtime);
    const concurrent = await Promise.all([cli('apply', normal, plan.fingerprint), cli('apply', normal, plan.fingerprint)]);
    assert.equal(concurrent.filter(result => result.applied).length, 1);
    assert.equal(concurrent.filter(result => result.alreadyApplied).length, 1);
    assert.equal((await sql`SELECT * FROM character_presentations WHERE character_id=${normal.card.id}`).length, 1);
    assert.equal((await sql`SELECT status FROM presentation_jobs WHERE id=${normal.job.id}`)[0].status, 'complete');
    assert.deepEqual(await readFile(budget.path), beforeLedger);
    check('RC-01: actual offline CLI read-only preview, atomic adoption, concurrent duplicate applies create one version, ledger bytes/mtime unchanged');

    const changed = await fixture();
    const originalPlan = await cli('plan', changed);
    await sql`UPDATE characters SET description='作者修改保留' WHERE id=${changed.card.id}`;
    assert.equal((await cli('apply', changed, originalPlan.fingerprint, 1)).error, 'PRESENTATION_RECONCILIATION_PLAN_STALE');
    const stale = await cli('plan', changed); assert.equal(stale.next, 'stale');
    await cli('apply', changed, stale.fingerprint);
    assert.equal((await sql`SELECT * FROM character_presentations WHERE character_id=${changed.card.id}`).length, 0);
    assert.equal((await sql`SELECT usage FROM presentation_jobs WHERE id=${changed.job.id}`)[0].usage.tokens, 41);
    check('RC-02: edited source invalidates old preview; new reconciliation retains usage without adopting or overwriting author');

    for (const kind of ['cancelled', 'public', 'invalid', 'null']) {
      const item = await fixture(kind);
      if (kind === 'cancelled') await sql`UPDATE presentation_jobs SET status='cancelled' WHERE id=${item.job.id}`;
      if (kind === 'public') await sql`UPDATE characters SET is_public=true WHERE id=${item.card.id}`;
      const preview = await cli('plan', item);
      assert.equal(preview.next, { cancelled: 'cancelled', public: 'stale', invalid: 'failed', null: 'skipped' }[kind]);
      await cli('apply', item, preview.fingerprint);
      assert.equal((await sql`SELECT usage FROM presentation_jobs WHERE id=${item.job.id}`)[0].usage.tokens, 41);
      assert.equal((await sql`SELECT * FROM character_presentations WHERE character_id=${item.card.id}`).length, 0);
    }
    check('RC-03: cancelled/public/invalid/null receipts retain known usage without revival, publication, invented introductions or retry');

    const other = await fixture();
    for (const key of ['PRESENTATION_WORKER_USER_ID', 'PRESENTATION_WORKER_TENANT_ID']) {
      await writeConfig({ ...settings, [key]: randomUUID() });
      assert.equal((await cli('plan', other, undefined, 1)).error, 'PRESENTATION_RECONCILIATION_NOT_FOUND');
    }
    await writeConfig(settings);
    assert.equal((await cli('plan', { ...other, receipt: normal.receipt }, undefined, 1)).error, 'PRESENTATION_RECONCILIATION_SCOPE');
    await sql`UPDATE presentation_jobs SET status='dispatching', dispatch_until=now()+interval '3 minutes' WHERE id=${other.job.id}`;
    assert.equal((await cli('plan', other, undefined, 1)).error, 'PRESENTATION_RECONCILIATION_ACTIVE');
    await sql`UPDATE presentation_jobs SET status='unknown' WHERE id=${other.job.id}`;
    const missing = { ...other, receipt: join(directory, 'missing.json') };
    assert.equal((await cli('plan', missing, undefined, 1)).error, 'PRESENTATION_RECONCILIATION_FAILED');
    await budget.closeBatch(batch.id);
    const closedPlan = await cli('plan', other);
    await cli('apply', other, closedPlan.fingerprint);
    assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${owner.tenantId} ORDER BY id`, originalCredits);
    check('RC-04: wrong owner/tenant/dispatch, active calls and absent bodies refused; closed-budget offline recovery needs no gateway credentials or network; credits unchanged');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
