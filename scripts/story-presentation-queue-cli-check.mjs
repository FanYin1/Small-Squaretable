import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineeringBudget } from './lib/engineering-model-budget.mjs';
import { createEngineeringGateway } from './lib/engineering-model-gateway.mjs';
import { createPresentationQueueProvider } from './lib/presentation-queue-provider.mjs';
import { parse } from 'dotenv';

export async function checkPresentationQueueCli({ sql, owner, create, check, runJob }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-queue-cli-'));
  const token = randomBytes(32).toString('hex');
  const budget = new EngineeringBudget(join(directory, 'ledger.json'));
  let calls = 0;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt = body.messages[0].content;
    const candidates = JSON.parse(prompt.slice(prompt.indexOf('{"characterId"'))).candidates;
    assert.ok(!prompt.includes('PRIVATE_NEVER_SENT'));
    calls++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ version: 1, candidateId: candidates[0].id }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 11, total_tokens: 41 } }));
  });
  let gateway;
  try {
    await budget.initialize({ authorization: 30000, history: { known: 0, unreceipted: 0, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false } });
    const batch = await budget.createBatch({ scope: 'Isolated controlled queue CLI', maxTokens: 25000, maxRequests: 2 });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    gateway = await createEngineeringGateway({ budget, batchId: batch.id, token,
      settings: { baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiKey: 'controlled', format: 'openai', models: ['controlled'] } });
    gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
    const config = join(directory, 'worker.env');
    await writeFile(config, Object.entries({
      PRESENTATION_WORKER_DATABASE_URL: process.env.DATABASE_URL, PRESENTATION_WORKER_USER_ID: owner.userId, PRESENTATION_WORKER_TENANT_ID: owner.tenantId,
      CUSTOM_LLM_API_FORMAT: 'openai', CUSTOM_LLM_DEFAULT_MODEL: 'controlled', CUSTOM_LLM_API_KEY: token,
      CUSTOM_LLM_BASE_URL: `http://127.0.0.1:${gateway.server.address().port}/v1`,
      ENGINEERING_MODEL_GATEWAY_LEDGER_ID: (await budget.read()).ledger.id, ENGINEERING_MODEL_GATEWAY_BATCH_ID: batch.id,
    }).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
    async function worker(expected) {
      const child = spawn(process.execPath, ['scripts/story-presentation-worker.mjs', '--config', config, '--max-jobs', '1'], { stdio: 'pipe' });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
      try { assert.equal((await once(child, 'exit'))[0], expected, output); }
      finally { clearTimeout(timeout); }
    }
    const card = await create();
    await worker(0);
    const [job] = await sql`SELECT * FROM presentation_jobs WHERE character_id=${card.id}`;
    assert.equal(job.status, 'complete');
    assert.equal(calls, 1);
    assert.equal((await budget.read()).ledger.requests[0].id, job.dispatch_id);
    assert.equal((await budget.read()).summary.knownNewTokens, 41);
    assert.equal((await sql`SELECT id FROM character_presentations WHERE character_id=${card.id}`).length, 1);
    const lost = await create();
    const receiptDirectory = join(directory, 'presentation-receipts');
    const provider = createPresentationQueueProvider({ ...parse(await readFile(config)), PRESENTATION_WORKER_RECEIPTS_DIR: receiptDirectory });
    await runJob({ ...provider, select: async (prompt, dispatchId) => {
      await provider.select(prompt, dispatchId);
      throw new Error('simulated process loss after private archive before database receipt');
    } });
    const [lostJob] = await sql`SELECT * FROM presentation_jobs WHERE character_id=${lost.id}`;
    assert.equal(lostJob.status, 'unknown'); assert.equal(lostJob.usage, null);
    assert.equal(calls, 2);
    assert.equal((await budget.inspect()).summary.knownNewTokens, 82);
    await budget.closeBatch(batch.id);
    const waiting = await create();
    await worker(1);
    assert.equal((await sql`SELECT status FROM presentation_jobs WHERE character_id=${waiting.id}`)[0].status, 'queued');
    await sql`UPDATE presentation_jobs SET status='cancelled' WHERE character_id=${waiting.id}`;
    assert.equal(calls, 2);
    check('PQ-08: independent CLI consumes actual isolated queue via authenticated budget gateway, links dispatch/ledger receipt, auto-adopts; closed batch cannot claim next job');
    await gateway.stop(); gateway = undefined;
    async function reconcile(command, fingerprint) {
      const args = ['scripts/story-presentation-reconcile.mjs', command, '--config', config, '--ledger', budget.path,
        '--receipt', join(receiptDirectory, `${lostJob.dispatch_id}.json`), '--job', lostJob.id];
      if (fingerprint) args.push('--fingerprint', fingerprint);
      const child = spawn(process.execPath, args, { stdio: 'pipe' });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
      try { assert.equal((await once(child, 'exit'))[0], 0, output); }
      finally { clearTimeout(timeout); }
      return JSON.parse(output.trim().split('\n').at(-1));
    }
    const preview = await reconcile('plan');
    assert.equal(preview.next, 'complete');
    assert.equal((await reconcile('apply', preview.fingerprint)).applied, true);
    assert.equal((await sql`SELECT status FROM presentation_jobs WHERE id=${lostJob.id}`)[0].status, 'complete');
    assert.equal((await sql`SELECT id FROM character_presentations WHERE character_id=${lost.id}`).length, 1);
    assert.equal(calls, 2);
    assert.equal((await budget.inspect()).summary.knownNewTokens, 82);
    check('RC-05: controlled HTTP response archived then app receipt lost; closed ledger and stopped gateway recover exact source via actual offline CLI without another supplier request');
  } finally {
    await gateway?.stop();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}
