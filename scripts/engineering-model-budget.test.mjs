import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { EngineeringBudget, requestDigest } from './lib/engineering-model-budget.mjs';
import { createEngineeringGateway } from './lib/engineering-model-gateway.mjs';
import { parse } from 'dotenv';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });
const history = { known: 100, unreceipted: 20, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false };
async function fixture(authorization = 10_000, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-budget-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'ledger.json');
  const budget = new EngineeringBudget(path);
  await budget.initialize({ authorization, history: { ...history, ...overrides } });
  return { budget, path, directory };
}
const digest = requestDigest('owned synthetic input');
async function batch(budget, maxTokens = 5000, maxRequests = 5) {
  return budget.createBatch({ scope: 'Owned synthetic engineering test', maxTokens, maxRequests });
}
async function provider(handler) {
  let calls = 0;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls++;
    try { await handler(request, response, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { response.destroy(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  cleanups.push(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { url: `http://127.0.0.1:${server.address().port}`, calls: () => calls };
}
const token = 'controlled-local-gateway-token-only';
const requestBody = { model: 'owned-model', messages: [{ role: 'user', content: 'Owned test' }], max_tokens: 32 };
const geminiBody = { contents: [{ role: 'user', parts: [{ text: 'Owned test' }] }], generationConfig: { maxOutputTokens: 32 } };
const completion = { choices: [{ message: { role: 'assistant', content: 'Owned reply' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } };
async function gatewayFixture(handler, format = 'openai', options = {}) {
  const context = await fixture();
  const upstream = await provider(handler);
  const currentBatch = await batch(context.budget);
  const gateway = await createEngineeringGateway({ budget: context.budget, batchId: currentBatch.id, token,
    settings: { baseUrl: upstream.url, apiKey: 'private-controlled-upstream-key', format, models: ['owned-model'], embeddingModels: ['owned-embedding'] }, ...options });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  cleanups.push(() => gateway.stop());
  const url = `http://127.0.0.1:${gateway.server.address().port}`;
  const send = (body = requestBody, route = '/v1/chat/completions', headers = {}) => fetch(`${url}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body),
  });
  return { ...context, ...gateway, upstream, currentBatch, send };
}

test('batch reservation, receipt settlement and closing do not double count history or free unknown usage', async () => {
  const { budget } = await fixture(1000);
  const current = await batch(budget, 400);
  assert.equal((await budget.read()).summary.occupied, 520);
  const request = await budget.reserve(current.id, 150, digest);
  await budget.settle(request.id, 80, 'owned receipt 1');
  assert.equal((await budget.read()).summary.occupied, 520);
  const closed = await budget.closeBatch(current.id);
  assert.equal(closed.occupied, 200); assert.equal(closed.available, 800);
  assert.equal(closed.knownNewTokens, 80);
});

test('existing authorization cannot be reinitialized and an unbounded historical failure blocks paid dispatch', async () => {
  const { budget } = await fixture(1000, { hasUnboundedUnknown: true, unknownHold: 200 });
  await assert.rejects(budget.initialize({ authorization: 1000, history }), /BUDGET_ALREADY_INITIALIZED/);
  await assert.rejects(batch(budget, 100), /BUDGET_RECONCILIATION_REQUIRED/);
  assert.equal((await budget.read()).summary.reason, 'HISTORICAL_UNKNOWN_UNBOUNDED');
});

test('concurrent batch allocation shares one authorization', async () => {
  const { budget, path } = await fixture(1000);
  const results = await Promise.allSettled([batch(budget, 600), batch(new EngineeringBudget(path), 600)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await budget.read()).summary.occupied, 720);
});

test('independent processes cannot both reserve the same remaining batch capacity', async () => {
  const { budget, path } = await fixture();
  const current = await batch(budget, 100, 2);
  const script = `import { EngineeringBudget } from './scripts/lib/engineering-model-budget.mjs'; const budget = new EngineeringBudget(process.argv[1]); try { await budget.reserve(process.argv[2], 80, process.argv[3]); } catch { process.exitCode = 1; }`;
  const run = () => new Promise(resolve => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script, path, current.id, digest], { stdio: 'ignore' });
    child.once('exit', code => resolve(code));
  });
  assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 1]);
  assert.equal((await budget.read()).summary.heldNewTokens, 80);
});

test('duplicate request IDs never dispatch twice and receipts are immutable and idempotent', async () => {
  const { budget } = await fixture(); const current = await batch(budget);
  const id = randomUUID(); await budget.reserve(current.id, 100, digest, id);
  await assert.rejects(budget.reserve(current.id, 100, digest, id), /BUDGET_REQUEST_ALREADY_DISPATCHED/);
  await budget.settle(id, 10, 'owned receipt'); await budget.settle(id, 10, 'owned receipt');
  await assert.rejects(budget.settle(id, 9, 'owned receipt'), /BUDGET_RECEIPT_CONFLICT/);
  assert.equal((await budget.read()).summary.knownNewTokens, 10);
});

test('pending crash reservation survives restart and prevents closing or gateway restart', async () => {
  const { budget, path } = await fixture(); const current = await batch(budget);
  await budget.reserve(current.id, 100, digest);
  const restarted = new EngineeringBudget(path);
  await assert.rejects(restarted.closeBatch(current.id), /BUDGET_PENDING_REQUEST/);
  await assert.rejects(createEngineeringGateway({ budget: restarted, batchId: current.id }), /BUDGET_RECONCILIATION_REQUIRED/);
  assert.equal((await restarted.read()).summary.heldNewTokens, 100);
});

test('unknown usage freezes all further calls and closing retains the hold until an evidenced receipt', async () => {
  const { budget } = await fixture(); const current = await batch(budget);
  const request = await budget.reserve(current.id, 100, digest); await budget.unknown(request.id);
  await assert.rejects(budget.reserve(current.id, 100, digest), /BUDGET_RECONCILIATION_REQUIRED/);
  const summary = await budget.closeBatch(current.id);
  assert.equal(summary.occupied, 220); assert.equal(summary.halted, true);
  await assert.rejects(batch(budget, 100), /BUDGET_RECONCILIATION_REQUIRED/);
  await budget.settle(request.id, 70, 'verified owned provider receipt');
  assert.equal((await budget.read()).summary.occupied, 190);
  assert.equal((await budget.read()).summary.halted, false);
});

test('unexpected usage above its reservation is retained and blocks further calls even within batch capacity', async () => {
  const { budget } = await fixture(); const current = await batch(budget);
  const request = await budget.reserve(current.id, 100, digest);
  const result = await budget.settle(request.id, 101, 'provider overrun receipt');
  assert.equal(result.knownNewTokens, 101); assert.equal(result.reason, 'USAGE_EXCEEDS_RESERVATION');
  await assert.rejects(budget.reserve(current.id, 100, digest), /BUDGET_RECONCILIATION_REQUIRED/);
});

test('request count limits prevent unlimited cheap retries', async () => {
  const { budget } = await fixture(); const current = await batch(budget, 1000, 1);
  const request = await budget.reserve(current.id, 100, digest); await budget.settle(request.id, 1, 'receipt');
  await assert.rejects(budget.reserve(current.id, 100, digest), /BUDGET_BATCH_EXHAUSTED/);
});

test('a stale writer lock is never automatically cleared and ledger stays private', async () => {
  const { budget, path } = await fixture();
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await mkdir(`${path}.lock`, { mode: 0o700 });
  await assert.rejects(budget.read(), /BUDGET_LEDGER_LOCKED/);
  assert.equal((await stat(`${path}.lock`)).isDirectory(), true);
});

test('symlink, malformed and inconsistent ledger files fail closed', async () => {
  const { budget, path, directory } = await fixture();
  const original = await readFile(path, 'utf8');
  await rm(path); await writeFile(join(directory, 'other.json'), original, { mode: 0o600 });
  await symlink(join(directory, 'other.json'), path); await assert.rejects(budget.read());
  await rm(path); await writeFile(path, '{broken', { mode: 0o600 }); await assert.rejects(budget.read());
  const invalid = JSON.parse(original); invalid.requests.push({ id: randomUUID() });
  await writeFile(path, JSON.stringify(invalid)); await assert.rejects(budget.read());
});

test('OpenAI completion, SSE and embedding calls share one batch and include final usage', async () => {
  const context = await gatewayFixture((request, response, body) => {
    assert.equal(request.headers.authorization, 'Bearer private-controlled-upstream-key');
    if (request.url === '/v1/embeddings') { response.end(JSON.stringify({ data: [{ embedding: [0.1] }], usage: { prompt_tokens: 4, total_tokens: 4 } })); return; }
    if (body.stream) {
      assert.equal(body.stream_options.include_usage, true);
      response.write('data: {"choices":[{"delta":{"content":"Owned"},"finish_reason":null}]}\n\n');
      response.end(`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }], usage: completion.usage })}\n\ndata: [DONE]\n\n`);
    } else response.end(JSON.stringify(completion));
  });
  assert.equal((await context.send()).status, 200);
  const streaming = await context.send({ ...requestBody, stream: true }); assert.match(await streaming.text(), /\[DONE\]/);
  assert.equal((await context.send({ model: 'owned-embedding', input: ['Owned memory'] }, '/v1/embeddings')).status, 200);
  assert.equal(context.upstream.calls(), 3);
  const { ledger, summary } = await context.budget.read();
  assert.equal(summary.knownNewTokens, 20); assert.equal(summary.heldNewTokens, 0);
  assert.equal(ledger.requests.every(request => request.batchId === context.currentBatch.id && request.status === 'settled'), true);
  assert.equal(JSON.stringify(ledger).includes('Owned memory'), false);
  assert.equal(JSON.stringify(ledger).includes('private-controlled-upstream-key'), false);
});

test('Gemini nonstream and split SSE usage include reasoning tokens without exposing upstream credentials', async () => {
  const payload = { candidates: [{ content: { parts: [{ text: 'Owned reply' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 3, totalTokenCount: 9 } };
  const context = await gatewayFixture((request, response) => {
    assert.equal(request.headers['x-goog-api-key'], 'private-controlled-upstream-key');
    assert.equal(request.headers.authorization, undefined);
    if (request.url.includes('streamGenerateContent')) {
      const frame = `data: ${JSON.stringify(payload)}\r\n\r\n`;
      response.write(frame.slice(0, 24)); response.end(frame.slice(24));
    } else response.end(JSON.stringify(payload));
  }, 'gemini');
  assert.equal((await context.send(geminiBody, '/v1beta/models/owned-model:generateContent')).status, 200);
  const streaming = await context.send(geminiBody, '/v1beta/models/owned-model:streamGenerateContent?alt=sse');
  assert.match(await streaming.text(), /usageMetadata/);
  assert.equal((await context.budget.read()).summary.knownNewTokens, 18);
});

test('Gemini native API-key authentication reaches the fixed upstream while invalid local keys are refused', async () => {
  const context = await gatewayFixture((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Owned reply' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } }));
  }, 'gemini');
  const url = `http://127.0.0.1:${context.server.address().port}/v1beta/models/owned-model:generateContent`;
  const sendNative = key => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(geminiBody) });
  assert.equal((await sendNative('invalid-local-key')).status, 401);
  assert.equal(context.upstream.calls(), 0);
  assert.equal((await sendNative(token)).status, 200);
  assert.equal((await context.budget.read()).summary.knownNewTokens, 8);
  assert.equal(context.upstream.calls(), 1);
});

test('unauthorized, arbitrary routes, tools, multimodal, unbounded output and oversized requests never reach upstream', async () => {
  const context = await gatewayFixture((_request, response) => response.end(JSON.stringify(completion)), 'openai', { maxInputBytes: 512 });
  assert.equal((await context.send(requestBody, '/v1/chat/completions', { authorization: 'Bearer wrong' })).status, 401);
  for (const [body, path] of [
    [requestBody, '/v1/chat/completions?redirect=evil'], [{ ...requestBody, max_tokens: undefined }, '/v1/chat/completions'],
    [{ ...requestBody, model: 'other' }, '/v1/chat/completions'], [{ ...requestBody, tools: [] }, '/v1/chat/completions'],
    [{ ...requestBody, messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }, '/v1/chat/completions'],
    [{ ...requestBody, max_tokens: 5000 }, '/v1/chat/completions'],
    [{ ...requestBody, messages: [{ role: 'user', content: 'large'.repeat(150) }] }, '/v1/chat/completions'],
  ]) assert.equal((await context.send(body, path)).status, 400);
  assert.equal(context.upstream.calls(), 0);
  assert.equal((await context.budget.read()).ledger.requests.length, 0);
});

for (const failure of ['missing-usage', 'inconsistent-usage', 'provider-error', 'redirect', 'timeout', 'broken-stream']) {
  test(`${failure} retains reservation and prevents any automatic paid retry`, async () => {
    const context = await gatewayFixture(async (_request, response) => {
      if (failure === 'timeout') { await new Promise(resolve => setTimeout(resolve, 150)); if (!response.destroyed) response.end('{}'); return; }
      if (failure === 'provider-error') { response.writeHead(429); response.end('{}'); return; }
      if (failure === 'redirect') { response.writeHead(302, { location: '/v1/chat/completions' }); response.end(); return; }
      if (failure === 'broken-stream') { response.end(`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }], usage: completion.usage })}\n\n`); return; }
      response.end(JSON.stringify({ ...completion, usage: failure === 'missing-usage' ? undefined : { prompt_tokens: 100, completion_tokens: 10, total_tokens: 1 } }));
    }, 'openai', { timeoutMs: 50 });
    const result = await context.send(failure === 'broken-stream' ? { ...requestBody, stream: true } : requestBody);
    await result.text().catch(() => undefined);
    const state = await context.budget.read();
    assert.equal(state.summary.unknown, 1); assert.equal(state.summary.heldNewTokens > 1000, true);
    assert.equal(state.summary.knownNewTokens, 0);
    assert.equal((await context.send()).status, 400);
    assert.equal(context.upstream.calls(), 1);
  });
}

test('concurrent foreground/background submissions cannot overtake an unresolved upstream request', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  let started; const firstCall = new Promise(resolve => { started = resolve; });
  const context = await gatewayFixture(async (_request, response) => { started(); await held; response.end(JSON.stringify(completion)); });
  const foreground = context.send(); await firstCall;
  const background = await context.send(); assert.equal(background.status, 429); assert.equal(context.upstream.calls(), 1);
  release(); assert.equal((await foreground).status, 200);
  assert.equal((await context.send()).status, 200); assert.equal(context.upstream.calls(), 2);
});

test('gateway shutdown aborts upstream work, retains unknown usage and never restarts a pending call', async () => {
  let started; const dispatched = new Promise(resolve => { started = resolve; });
  const context = await gatewayFixture((_request, _response) => { started(); });
  const request = context.send().catch(() => undefined); await dispatched;
  await context.stop(); await request;
  const state = await context.budget.read();
  assert.equal(state.summary.unknown, 1); assert.equal(state.summary.halted, true);
  assert.equal(context.upstream.calls(), 1);
  await assert.rejects(createEngineeringGateway({ budget: context.budget, batchId: context.currentBatch.id }), /BUDGET_RECONCILIATION_REQUIRED/);
});

test('a reservation committed before a lost local acknowledgement blocks the next request without dispatch', async () => {
  const context = await gatewayFixture((_request, response) => response.end(JSON.stringify(completion)));
  const original = context.budget.reserve.bind(context.budget);
  context.budget.reserve = async (...args) => { await original(...args); throw new Error('Owned simulated fsync acknowledgement loss'); };
  assert.equal((await context.send()).status, 400);
  assert.equal((await context.budget.read()).summary.pending, 1);
  assert.equal((await context.send()).status, 400);
  assert.equal(context.upstream.calls(), 0);
});

test('shutdown during durable reservation never starts a late upstream call', async () => {
  const context = await gatewayFixture((_request, response) => response.end(JSON.stringify(completion)));
  const reserve = context.budget.reserve.bind(context.budget);
  let reached;
  const reserved = new Promise(resolveReached => { reached = resolveReached; });
  let release;
  const resume = new Promise(resolveResume => { release = resolveResume; });
  context.budget.reserve = async (...args) => {
    const result = await reserve(...args); reached(); await resume; return result;
  };
  const pending = context.send().catch(() => undefined);
  await reserved;
  const stopped = context.stop(); release();
  await stopped; await pending;
  assert.equal(context.upstream.calls(), 0);
  assert.equal((await context.budget.read()).summary.unknown, 1);
});

async function cli(argumentsList) {
  const child = spawn(process.execPath, ['scripts/engineering-model-budget.mjs', ...argumentsList], { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr };
}

test('CLI preserves historical authorization, refuses reset and cannot erase unresolved historical usage', async () => {
  const { path, directory } = await fixture();
  const actualPath = join(directory, 'engineering.json');
  const policyPath = join(directory, 'policy.json');
  const policy = { authorization: 1_450_000, history: { known: 448_496, unreceipted: 6591,
    unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: true } };
  await writeFile(policyPath, JSON.stringify(policy), { mode: 0o600 });
  const initialized = await cli(['init', '--ledger', actualPath, '--policy', policyPath]);
  assert.equal(initialized.code, 0);
  assert.equal(JSON.parse(initialized.stdout).reason, 'HISTORICAL_UNKNOWN_UNBOUNDED');
  assert.equal((await cli(['init', '--ledger', actualPath, '--policy', policyPath])).code, 1);
  assert.equal((await cli(['status', '--ledger', actualPath, '--unexpected', path])).code, 1);
  await writeFile(policyPath, JSON.stringify({ ...policy, history: { ...policy.history, hasUnboundedUnknown: false } }));
  const invalid = await cli(['init', '--ledger', join(directory, 'invalid.json'), '--policy', policyPath]);
  assert.match(invalid.stderr, /BUDGET_HISTORICAL_BASELINE_REQUIRED/);
  const status = await cli(['status', '--ledger', actualPath]);
  assert.equal(JSON.parse(status.stdout).occupied, 455087);
});

test('CLI gateway startup, exclusive ownership, dispatch, settlement and signal cleanup work across processes', async () => {
  const { budget, path, directory } = await fixture();
  const policyPath = join(directory, 'batch.json');
  await writeFile(policyPath, JSON.stringify({ scope: 'Owned CLI integration', maxTokens: 5000, maxRequests: 2 }), { mode: 0o600 });
  const opened = await cli(['open', '--ledger', path, '--batch-policy', policyPath]);
  assert.equal(opened.code, 0);
  const currentBatch = JSON.parse(opened.stdout);
  const upstream = await provider((_request, response) => response.end(JSON.stringify(completion)));
  const configPath = join(directory, 'upstream.env');
  const outputPath = join(directory, 'gateway.env');
  const modelLimits = { 'owned-model': { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 2048 } };
  await writeFile(configPath, `CUSTOM_LLM_API_FORMAT=openai\nCUSTOM_LLM_BASE_URL=${upstream.url}\nCUSTOM_LLM_API_KEY=owned-private-key\nCUSTOM_LLM_MODELS=owned-model\nCUSTOM_LLM_MODEL_LIMITS='${JSON.stringify(modelLimits)}'\n`, { mode: 0o600 });
  const argumentsList = ['serve', '--ledger', path, '--batch', currentBatch.id, '--config', configPath, '--output', outputPath,
    '--max-input-bytes', '131072', '--max-output-tokens', '64000'];
  const child = spawn(process.execPath, ['scripts/engineering-model-budget.mjs', ...argumentsList], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const exited = once(child, 'exit');
  cleanups.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; } });
  await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => rejectReady(new Error('Controlled gateway startup timed out')), 5000);
    child.once('exit', () => { clearTimeout(timeout); rejectReady(new Error('Controlled gateway exited before ready')); });
    child.stdout.on('data', chunk => { logs += chunk; if (logs.includes('engineering-gateway-ready')) { clearTimeout(timeout); resolveReady(); } });
  });
  const ready = JSON.parse(logs.trim().split('\n').at(-1));
  assert.equal(ready.maxInputBytes, 131072);
  assert.equal(ready.maxOutputTokens, 64000);
  assert.equal(upstream.calls(), 0);
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  const configuration = parse(await readFile(outputPath));
  assert.notEqual(configuration.CUSTOM_LLM_API_KEY, 'owned-private-key');
  assert.deepEqual(JSON.parse(configuration.CUSTOM_LLM_MODEL_LIMITS), modelLimits);
  const verified = await requireEngineeringGateway(configuration);
  assert.equal(verified.batch.id, currentBatch.id);
  await assert.rejects(requireEngineeringGateway({ ...configuration, ENGINEERING_MODEL_GATEWAY_BATCH_ID: randomUUID() }), /ENGINEERING_GATEWAY_RECONCILIATION_REQUIRED/);
  const duplicate = await cli(argumentsList);
  assert.equal(duplicate.code, 1);
  const response = await fetch(`${configuration.CUSTOM_LLM_BASE_URL}/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${configuration.CUSTOM_LLM_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(requestBody) });
  assert.equal(response.status, 200); await response.text();
  const probe = spawn(process.execPath, ['scripts/story-memory-provider-probe.mjs', '--config', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let probeOutput = ''; let probeError = '';
  probe.stdout.on('data', chunk => { probeOutput += chunk; });
  probe.stderr.on('data', chunk => { probeError += chunk; });
  const [probeCode] = await once(probe, 'exit');
  assert.equal(probeCode, 0); assert.equal(probeError, '');
  assert.equal(JSON.parse(probeOutput).usable, true);
  child.kill('SIGTERM'); const [code] = await exited;
  assert.equal(code, 0); assert.equal(errors, '');
  assert.equal(logs.includes('owned-private-key'), false);
  assert.equal(logs.includes(configuration.CUSTOM_LLM_API_KEY), false);
  await assert.rejects(stat(`${path}.gateway.lock`), { code: 'ENOENT' });
  const closed = await cli(['close', '--ledger', path, '--batch', currentBatch.id]);
  assert.equal(closed.code, 0); assert.equal(JSON.parse(closed.stdout).knownNewTokens, 16);
  assert.equal((await budget.read()).summary.occupied, 136);
  assert.equal(upstream.calls(), 2);
});

test('all five existing paid engineering entry points reject a direct provider before any network dispatch', async () => {
  const { directory } = await fixture();
  const upstream = await provider((_request, response) => response.end(JSON.stringify(completion)));
  const configPath = join(directory, 'direct.env');
  await writeFile(configPath, `CUSTOM_LLM_API_FORMAT=gemini\nCUSTOM_LLM_BASE_URL=${upstream.url}\nCUSTOM_LLM_API_KEY=owned-private-key\nCUSTOM_LLM_MODELS=owned-model\n`, { mode: 0o600 });
  for (const [script, argumentsList] of [
    ['character-journey-model-check.mjs', ['--config', configPath, '--requests', join(directory, 'unused.json'), '--token-budget', '1000']],
    ['story-memory-real-provider-check.mjs', ['--config', configPath, '--output', join(directory, 'unused-report.json')]],
    ['story-memory-provider-probe.mjs', ['--config', configPath]],
    ['story-memory-real-longrun.mjs', ['--config', configPath]],
    ['story-intent-real-check.mjs', [configPath, join(directory, 'unused.json'), join(directory, 'unused-report.json')]],
  ]) {
    const child = spawn(process.execPath, [`scripts/${script}`, ...argumentsList], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 1, script); assert.match(output, /ENGINEERING_GATEWAY_REQUIRED/, script);
    assert.equal(output.includes('owned-private-key'), false);
  }
  assert.equal(upstream.calls(), 0);
});
