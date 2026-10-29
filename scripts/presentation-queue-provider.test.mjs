import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { EngineeringBudget } from './lib/engineering-model-budget.mjs';
import { createEngineeringGateway } from './lib/engineering-model-gateway.mjs';
import { createPresentationQueueProvider } from './lib/presentation-queue-provider.mjs';
import { readPresentationReceipt } from './lib/presentation-receipts.mjs';

const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });
async function fixture(format = 'openai', content = JSON.stringify({ version: 1, candidateId: null }), usage = true) {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-queue-provider-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const budget = new EngineeringBudget(join(directory, 'ledger.json'));
  await budget.initialize({ authorization: 10000, history: { known: 0, unreceipted: 0, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false } });
  const batch = await budget.createBatch({ scope: 'Controlled presentation queue', maxTokens: 9000, maxRequests: 3 });
  let calls = 0;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(format === 'gemini' ? payload.generationConfig.maxOutputTokens : payload.max_tokens, 512);
    calls++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(format === 'gemini'
      ? { candidates: [{ content: { parts: [{ text: content }] }, finishReason: 'STOP' }], ...(usage ? { usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } } : {}) }
      : { choices: [{ message: { content }, finish_reason: 'stop' }], ...(usage ? { usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } } : {}) }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  cleanups.push(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const token = 'controlled-presentation-gateway-secret';
  const gateway = await createEngineeringGateway({ budget, batchId: batch.id, token,
    settings: { baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiKey: 'controlled-supplier', format, models: ['owned'] } });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  cleanups.push(() => gateway.stop());
  const state = await budget.read();
  const settings = { CUSTOM_LLM_BASE_URL: `http://127.0.0.1:${gateway.server.address().port}/${format === 'gemini' ? 'v1beta' : 'v1'}`,
    CUSTOM_LLM_API_KEY: token, CUSTOM_LLM_DEFAULT_MODEL: 'owned', CUSTOM_LLM_API_FORMAT: format,
    ENGINEERING_MODEL_GATEWAY_LEDGER_ID: state.ledger.id, ENGINEERING_MODEL_GATEWAY_BATCH_ID: batch.id,
    PRESENTATION_WORKER_USER_ID: randomUUID(), PRESENTATION_WORKER_TENANT_ID: randomUUID(), PRESENTATION_WORKER_RECEIPTS_DIR: directory };
  const adapter = format === 'gemini' ? await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url) : null;
  return { provider: createPresentationQueueProvider(settings, adapter), budget, settings, calls: () => calls };
}

for (const format of ['openai', 'gemini']) test(`${format} queue calls settle same ledger with persistent dispatch ID; replay never reaches supplier`, async () => {
  const context = await fixture(format);
  const dispatch = randomUUID();
  await context.provider.ready();
  const result = await context.provider.select('Owned public narrative', dispatch);
  assert.deepEqual(result.selection, { version: 1, candidateId: null });
  assert.equal(result.usage.tokens, 5);
  await assert.rejects(() => context.provider.select('Owned public narrative', dispatch));
  assert.equal(context.calls(), 1);
  const state = await context.budget.read();
  assert.equal(state.ledger.requests[0].id, dispatch);
  assert.equal(state.summary.knownNewTokens, 5);
  const saved = await readPresentationReceipt(join(context.settings.PRESENTATION_WORKER_RECEIPTS_DIR, `${dispatch}.json`), state.ledger);
  assert.equal(saved.actualTokens, result.usage.tokens);
  assert.equal(saved.receipt.responseDigest, result.usage.responseDigest);
});

test('invalid selection is returned for local rejection but still carries known billed usage', async () => {
  const { provider, budget } = await fixture('openai', 'not JSON');
  const result = await provider.select('Owned public narrative', randomUUID());
  assert.equal(result.selection, null);
  assert.equal(result.usage.tokens, 5);
  assert.equal((await budget.read()).summary.knownNewTokens, 5);
});

test('missing supplier usage remains held and stops subsequent requests', async () => {
  const context = await fixture('openai', '{}', false);
  await assert.rejects(() => context.provider.select('Owned public narrative', randomUUID()));
  await assert.rejects(() => context.provider.ready());
  assert.equal(context.calls(), 1);
  assert.ok((await context.budget.read()).summary.heldNewTokens > 0);
});

test('direct supplier URL, wrong batch and overlong prompt cannot dispatch', async () => {
  const context = await fixture();
  await assert.rejects(() => createPresentationQueueProvider({ ...context.settings, CUSTOM_LLM_BASE_URL: 'https://example.com/v1' }).ready());
  await assert.rejects(() => createPresentationQueueProvider({ ...context.settings, ENGINEERING_MODEL_GATEWAY_BATCH_ID: randomUUID() }).ready());
  await assert.rejects(() => context.provider.select('x'.repeat(20001), randomUUID()));
  await assert.rejects(() => context.provider.select('text', 'invalid-id'));
  assert.equal(context.calls(), 0);
});
