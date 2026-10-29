import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { EngineeringBudget } from './lib/engineering-model-budget.mjs';
import { createEngineeringGateway } from './lib/engineering-model-gateway.mjs';

const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });
const ownedCard = description => JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: {
  name: '合成旅人', description, personality: 'PRIVATE_PERSONALITY', scenario: 'PRIVATE_WORLD', mes_example: '',
  first_mes: '列车在黄昏抵达小镇，你拿着一封尚未拆开的信。\n\n站台上的旅人向你挥了挥手，邀请你去咖啡馆。',
  creator_notes: '', system_prompt: 'PRIVATE_SYSTEM', post_history_instructions: '', alternate_greetings: [], tags: [], creator: '', character_version: '', extensions: {},
} });
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/story-presentation-check.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}
async function fixture(format = 'openai', reply = 'valid', description = '') {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-presentation-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    calls++;
    try {
      const body = JSON.parse(Buffer.concat(chunks));
      const prompt = format === 'gemini' ? body.contents[0].parts[0].text : body.messages[0].content;
      for (const secret of ['PRIVATE_PERSONALITY', 'PRIVATE_WORLD', 'PRIVATE_SYSTEM']) assert.ok(!prompt.includes(secret));
      const sources = JSON.parse(prompt.split('\n').at(-1));
      const selection = reply === 'valid' ? { version: 1, candidateId: sources.candidates[1].id }
        : reply === 'invented' ? { version: 1, candidateId: 'f'.repeat(64) } : { version: 1, candidateId: null, text: '编造的新设定' };
      const text = JSON.stringify(selection);
      const payload = format === 'gemini' ? { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 17 } }
        : { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 } };
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(payload));
    } catch { response.destroy(); }
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  cleanups.push(async () => { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const budget = new EngineeringBudget(join(directory, 'ledger.json'));
  await budget.initialize({ authorization: 100_000, history: { known: 100, unreceipted: 20, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false } });
  const batch = await budget.createBatch({ scope: 'Owned presentation pipeline check', maxTokens: 50_000, maxRequests: 2 });
  const token = 'owned-private-presentation-gateway-token';
  const gateway = await createEngineeringGateway({ budget, batchId: batch.id, token,
    settings: { format, baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiKey: 'owned-upstream-key', models: ['owned-model'] } });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  cleanups.push(() => gateway.stop());
  const config = join(directory, 'gateway.env');
  await writeFile(config, [
    `ENGINEERING_MODEL_GATEWAY_LEDGER_ID=${(await budget.read()).ledger.id}`, `ENGINEERING_MODEL_GATEWAY_BATCH_ID=${batch.id}`,
    `CUSTOM_LLM_BASE_URL=http://127.0.0.1:${gateway.server.address().port}/${format === 'gemini' ? 'v1beta' : 'v1'}`,
    `CUSTOM_LLM_API_KEY=${token}`, `CUSTOM_LLM_API_FORMAT=${format}`, 'CUSTOM_LLM_MODELS=owned-model', 'CUSTOM_LLM_DEFAULT_MODEL=owned-model', '',
  ].join('\n'), { mode: 0o600 });
  const card = join(directory, 'owned-card.json'); const output = join(directory, 'report.json');
  await writeFile(card, ownedCard(description), { mode: 0o600 });
  return { directory, budget, card, output, config, calls: () => calls };
}

for (const format of ['openai', 'gemini']) test(`CLI ${format} selects an exact public excerpt through the shared gateway and preserves the card`, async () => {
  const context = await fixture(format);
  const before = createHash('sha256').update(await readFile(context.card)).digest('hex');
  const args = ['draft', '--config', context.config, '--card', context.card, '--output', context.output];
  const result = await run(args); assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(context.output, 'utf8'));
  assert.equal(report.result, 'draft'); assert.equal(report.modelCalls, 1); assert.equal(report.productAdopted, false);
  assert.equal(report.draft.text, '站台上的旅人向你挥了挥手，邀请你去咖啡馆。');
  assert.equal(report.draft.source.reference.source, 'first_mes'); assert.equal(report.usage.total_tokens, 17);
  assert.equal((await context.budget.read()).summary.knownNewTokens, 17);
  assert.equal((await stat(context.output)).mode & 0o077, 0);
  assert.equal(createHash('sha256').update(await readFile(context.card)).digest('hex'), before);
  assert.equal(report.cardDigest, before);
  assert.equal((await run(args)).code, 1); assert.equal(context.calls(), 1);
});

test('CLI preserves an existing introduction without paying for a model or adopting anything', async () => {
  const context = await fixture('openai', 'valid', '用户保留的公开介绍。');
  const result = await run(['draft', '--config', context.config, '--card', context.card, '--output', context.output]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(context.output, 'utf8'));
  assert.equal(report.result, 'preserved'); assert.equal(report.modelCalls, 0); assert.equal(context.calls(), 0);
  assert.equal(report.draft.text, '用户保留的公开介绍。');
});

for (const reply of ['invented', 'free-text']) test(`CLI rejects ${reply} model output without retry, preserving its billed usage`, async () => {
  const context = await fixture('openai', reply);
  const result = await run(['draft', '--config', context.config, '--card', context.card, '--output', context.output]);
  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(context.output, 'utf8'));
  assert.equal(report.result, 'failed'); assert.equal(report.modelCalls, 1); assert.equal(report.productAdopted, false);
  assert.equal(report.draft, undefined); assert.equal(context.calls(), 1);
  assert.equal((await context.budget.read()).summary.knownNewTokens, 17);
  assert.ok(!JSON.stringify(report).includes('编造的新设定'));
});

test('CLI source inspection sends no model request and does not archive full card contents', async () => {
  const context = await fixture();
  const result = await run(['inspect', '--card', context.card, '--output', context.output]); assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(context.output, 'utf8'));
  assert.equal(report.sources.candidates, 2); assert.equal(report.result, 'candidates-available-no-model-called');
  assert.equal(report.modelCalls, 0); assert.equal(context.calls(), 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_')); assert.equal(report.draft, undefined);
});

test('CLI refuses direct provider configuration before dispatch or report creation', async () => {
  const context = await fixture(); const direct = join(context.directory, 'direct.env');
  await writeFile(direct, 'CUSTOM_LLM_BASE_URL=https://invalid.example/v1\nCUSTOM_LLM_API_KEY=owned-key\nCUSTOM_LLM_MODELS=owned-model\n', { mode: 0o600 });
  const result = await run(['draft', '--config', direct, '--card', context.card, '--output', context.output]);
  assert.equal(result.code, 1); assert.ok(result.stderr.includes('ENGINEERING_GATEWAY_REQUIRED')); assert.equal(context.calls(), 0);
  await assert.rejects(stat(context.output), { code: 'ENOENT' });
});

test('CLI verifies a saved draft without a model and rejects edited source files', async () => {
  const context = await fixture();
  assert.equal((await run(['draft', '--config', context.config, '--card', context.card, '--output', context.output])).code, 0);
  const verified = join(context.directory, 'verified.json');
  const verify = output => run(['verify', '--card', context.card, '--draft', context.output, '--output', output]);
  assert.equal((await verify(verified)).code, 0);
  const report = JSON.parse(await readFile(verified, 'utf8'));
  assert.equal(report.verified, true); assert.equal(report.modelCalls, 0); assert.equal(report.productAdopted, false);
  assert.equal(context.calls(), 1);
  await writeFile(context.card, ownedCard('用户刚编辑的新介绍。'), { mode: 0o600 });
  const stale = join(context.directory, 'stale.json');
  assert.equal((await verify(stale)).code, 1);
  assert.equal(JSON.parse(await readFile(stale, 'utf8')).error, 'PRESENTATION_SOURCE_STALE');
  assert.equal(context.calls(), 1);
});

test('CLI rejects changed persisted evidence even when its selected text and card digest still match', async () => {
  const context = await fixture();
  assert.equal((await run(['draft', '--config', context.config, '--card', context.card, '--output', context.output])).code, 0);
  const previous = JSON.parse(await readFile(context.output, 'utf8'));
  previous.draft.coverage.omittedCandidates++;
  await writeFile(context.output, JSON.stringify(previous), { mode: 0o600 });
  const invalid = join(context.directory, 'invalid.json');
  const result = await run(['verify', '--card', context.card, '--draft', context.output, '--output', invalid]);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(await readFile(invalid, 'utf8')).error, 'PRESENTATION_DRAFT_INVALID');
  assert.equal(context.calls(), 1);
});
