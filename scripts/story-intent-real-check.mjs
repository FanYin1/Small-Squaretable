import assert from 'node:assert/strict';
import { readFile, writeFile, open } from 'node:fs/promises';
import { parse } from 'dotenv';
import { tsImport } from 'tsx/esm/api';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const [configPath, fixturePath, reportPath] = process.argv.slice(2);
assert.ok(configPath && fixturePath && reportPath, 'Provide private configuration, captured owned fixture, and a new report path');
const settings = parse(await readFile(configPath));
const gateway = await requireEngineeringGateway(settings);
const lock = await open('/tmp/squaretable-story-intent-paid-check.lock', 'wx', 0o600);
await lock.close();
assert.equal(settings.CUSTOM_LLM_API_FORMAT, 'gemini');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const { buildGeminiRequest, readGeminiCompletion } = await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url);
const { parseStoryIntentOutput } = await tsImport('../src/types/story-intent.ts', import.meta.url);
const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
const report = { createdAt: new Date().toISOString(), model, ledgerId: gateway.ledgerId, batchId: gateway.batch.id,
  authorization: gateway.summary.authorization, initialOccupied: gateway.summary.occupied, batchAvailableAtStart: gateway.batch.maxTokens - gateway.batch.occupied,
  scope: 'Two owned short semantic samples using captured production prompt; not full live gameplay or general card quality', calls: [] };
const samples = [
  { kind: 'refusal-and-off-menu', input: '先别买通行证。我想检查木门上的划痕，听说仓库有金币，但还没有证实。' },
  { kind: 'paraphrase', input: '我想拿一张通行证' },
];
try {
  for (const sample of samples) {
    const messages = fixture.request.messages.map(message => message.role === 'user' ? { ...message, content: sample.input } : message);
    const maxOutputTokens = 768;
    const reservation = Buffer.byteLength(JSON.stringify(messages)) + maxOutputTokens + 512;
    const accounted = report.calls.reduce((total, call) => total + (call.usage?.total_tokens ?? call.reservation), 0);
    assert.ok(accounted + reservation <= report.batchAvailableAtStart, 'Remaining batch allocation cannot cover conservative request reservation');
    const call = { kind: sample.kind, input: sample.input, reservation, maxOutputTokens, status: 'pending' };
    report.calls.push(call);
    await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
    const request = buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY,
      { model, messages, max_tokens: maxOutputTokens, temperature: 0.2, stream: false });
    const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(60000) });
    call.httpStatus = response.status;
    const result = await readGeminiCompletion(response, model);
    call.usage = result.usage;
    call.finishReason = result.choices[0].finish_reason;
    call.output = result.choices[0].message.content;
    const parsed = parseStoryIntentOutput(call.output, sample.input, ['buy', 'rest', 'large', 'small']);
    call.parsed = parsed;
    call.status = result.choices[0].finish_reason === 'stop' && parsed.intent ? 'schema-passed-semantic-review-needed' : 'failed';
    await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  }
} catch (error) {
  report.error = error?.code || (error?.name === 'AssertionError' ? 'BUDGET_RESERVATION_LIMIT' : 'PROVIDER_CHECK_FAILED');
  process.exitCode = 1;
} finally {
  report.knownNewTokens = report.calls.reduce((total, call) => total + (call.usage?.total_tokens ?? 0), 0);
  report.reservedNewTokens = report.calls.filter(call => !call.usage).reduce((total, call) => total + call.reservation, 0);
  const finalGateway = await requireEngineeringGateway(settings).catch(() => null);
  report.finalOccupied = finalGateway?.summary.occupied ?? null;
  report.remainingUnallocated = finalGateway?.summary.available ?? null;
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.info(JSON.stringify({ calls: report.calls.length, knownNewTokens: report.knownNewTokens, reservedNewTokens: report.reservedNewTokens,
    remainingUnallocated: report.remainingUnallocated, result: report.calls.map(call => call.status), error: report.error }));
}
