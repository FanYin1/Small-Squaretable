import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, chmod, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { EngineeringBudget, requestDigest } from './lib/engineering-model-budget.mjs';
import { readPrivateFile, readPresentationReceipt, savePresentationReceipt, verifyReceiptDirectory } from './lib/presentation-receipts.mjs';
import { decodePresentationResponse, presentationRequest } from './lib/presentation-queue-provider.mjs';
import { tsImport } from 'tsx/esm/api';

const directories = [];
afterEach(async () => { while (directories.length) await rm(directories.pop(), { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-receipt-'));
  directories.push(directory);
  const budget = new EngineeringBudget(join(directory, 'ledger.json'));
  await budget.initialize({ authorization: 10000, history: { known: 0, unreceipted: 0, unknownHold: 0, unknownBoundEvidence: null, hasUnboundedUnknown: false } });
  const batch = await budget.createBatch({ scope: 'controlled receipt', maxTokens: 5000, maxRequests: 1 });
  const request = await budget.reserve(batch.id, 1000, requestDigest('request'));
  const body = JSON.stringify({ choices: [{ message: { content: '{"version":1,"candidateId":null}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } });
  const receipt = { version: 1, dispatchId: request.id, ledgerId: (await budget.inspect()).ledger.id, batchId: batch.id,
    format: 'openai', model: 'controlled', requestDigest: request.digest, responseDigest: requestDigest(body), body };
  return { directory, budget, receipt };
}

test('private immutable receipt and truly read-only ledger inspection; no automatic settlement', async () => {
  const { directory, budget, receipt } = await fixture();
  const path = await savePresentationReceipt(directory, receipt);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await assert.rejects(() => readPresentationReceipt(path, ({})), /./);
  await assert.rejects(async () => readPresentationReceipt(path, (await budget.inspect()).ledger), /MISMATCH/);
  await budget.settle(receipt.dispatchId, 5, `sha256:${receipt.responseDigest}`);
  const before = await readFile(budget.path);
  const metadata = await stat(budget.path);
  assert.equal((await readPresentationReceipt(path, (await budget.inspect()).ledger)).actualTokens, 5);
  assert.deepEqual(await readFile(budget.path), before);
  assert.equal((await stat(budget.path)).mtimeMs, metadata.mtimeMs);
  await assert.rejects(() => savePresentationReceipt(directory, receipt), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), receipt);
});

test('receipt rejects another ledger, batch, dispatch, request, response, unknown usage and tampering', async () => {
  const { directory, budget, receipt } = await fixture();
  await budget.settle(receipt.dispatchId, 5, `sha256:${receipt.responseDigest}`);
  const { ledger } = await budget.inspect();
  const path = join(directory, 'modified.json');
  for (const modification of [{ ledgerId: randomUUID() }, { batchId: randomUUID() }, { dispatchId: randomUUID() },
    { requestDigest: 'b'.repeat(64) }, { responseDigest: 'b'.repeat(64) }, { body: `${receipt.body} ` }]) {
    await writeFile(path, JSON.stringify({ ...receipt, ...modification }), { mode: 0o600 });
    await assert.rejects(() => readPresentationReceipt(path, ledger), /MISMATCH/);
  }
  await writeFile(path, JSON.stringify(receipt));
  await assert.rejects(() => readPresentationReceipt(path, { ...ledger, requests: [{ ...ledger.requests[0], status: 'unknown' }] }), /MISMATCH/);
  await assert.rejects(() => savePresentationReceipt(directory, { ...receipt, body: 'x'.repeat(65537) }));
});

test('unsafe permissions, symlinks, directories and oversized files are refused', async () => {
  const { directory, receipt } = await fixture();
  const path = await savePresentationReceipt(directory, receipt);
  await assert.rejects(() => readPrivateFile(path, 1), /PRIVATE/);
  await assert.rejects(() => readPrivateFile(directory, 400000), /PRIVATE/);
  const alias = join(directory, 'alias');
  await symlink(path, alias);
  await assert.rejects(() => readPrivateFile(alias, 400000));
  await chmod(path, 0o644);
  await assert.rejects(() => readPrivateFile(path, 400000), /PRIVATE/);
  await chmod(directory, 0o755);
  await assert.rejects(() => verifyReceiptDirectory(directory), /PRIVATE/);
});

test('OpenAI/Gemini offline request fingerprints and response decoding preserve billed thinking tokens', async () => {
  const adapter = await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url);
  for (const format of ['openai', 'gemini']) {
    const offline = presentationRequest('source prompt', 'controlled', format, adapter);
    const online = presentationRequest('source prompt', 'controlled', format, adapter, 'http://127.0.0.1:44111/v1beta', 'private-key');
    assert.equal(offline.digest, online.digest);
    const raw = format === 'openai'
      ? { choices: [{ message: { content: '```json\n{"version":1,"candidateId":null}\n```' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } }
      : { candidates: [{ content: { parts: [{ text: '{"version":1,"candidateId":null}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, thoughtsTokenCount: 2, totalTokenCount: 7 } };
    assert.deepEqual(await decodePresentationResponse(JSON.stringify(raw), 'controlled', format, adapter), { selection: { version: 1, candidateId: null }, tokens: 7 });
  }
});
