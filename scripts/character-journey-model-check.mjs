import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { parse } from 'dotenv';
import { tsImport } from 'tsx/esm/api';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const args = process.argv.slice(2);
assert.ok([6, 10].includes(args.length), 'Use --config <private env> --requests <owned-requests.json> --token-budget <remaining allowance> [--only-case <key:turn> --previous <owned-transcripts.json>]');
assert.deepEqual([args[0], args[2], args[4]], ['--config', '--requests', '--token-budget']);
const settings = parse(await readFile(args[1]));
await requireEngineeringGateway(settings);
assert.equal(settings.CUSTOM_LLM_API_FORMAT, 'gemini');
const budget = Number(args[5]);
assert.ok(Number.isSafeInteger(budget) && budget > 0 && budget <= 51998);
const input = await readFile(args[3]);
const scenarios = JSON.parse(input);
let selection = null;
let previousTranscripts = [];
if (args.length === 10) {
  assert.deepEqual([args[6], args[8]], ['--only-case', '--previous']);
  const [key, turn] = args[7].split(':');
  selection = { key, turn: Number(turn) };
  assert.ok(scenarios.some(scenario => scenario.key === key && Number.isSafeInteger(selection.turn) && selection.turn > 0 && selection.turn <= scenario.requests.length));
  previousTranscripts = JSON.parse(await readFile(args[9]));
}
assert.deepEqual(scenarios.map(scenario => scenario.key), ['fog-harbor', 'late-bookshop']);
assert.ok(scenarios.every(scenario => scenario.requests.length >= 3 && scenario.requests.length <= 6));
const { buildGeminiRequest, readGeminiCompletion } = await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url);
const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
assert.ok(model && settings.CUSTOM_LLM_BASE_URL && settings.CUSTOM_LLM_API_KEY);
const directory = `/tmp/squaretable-card-model-${randomUUID()}`;
await mkdir(directory, { mode: 0o700 });
const report = { date: new Date().toISOString(), pid: process.pid, mode: 'engineering-gateway-owned-prompts', result: 'running', tokenBudget: budget, tokens: 0, calls: [], inputSha256: createHash('sha256').update(input).digest('hex'), limits: ['Production context replay with earlier controlled assistant messages replaced by real replies', 'Real replies are not persisted in app; browser/state/restart evidence is separate', 'Original third-party source and author code are not sent', 'Short two-mechanism sample, not long-term or human acceptance'] };
const transcripts = [];
report.selection = selection;
if (selection) report.previousTranscriptsSha256 = createHash('sha256').update(await readFile(args[9])).digest('hex');
report.sourceHashes = {};
for (const path of ['scripts/character-journey-model-check.mjs', 'src/server/services/gemini-adapter.ts']) report.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
const save = async () => {
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(`${directory}/owned-transcripts.json`, JSON.stringify(transcripts, null, 2), { mode: 0o600 });
};
const lockPath = `${args[3]}.model-check.lock`;
const lock = await open(lockPath, 'wx', 0o600);
await lock.writeFile(String(process.pid));
await lock.close();
const shutdown = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown.abort());
console.info(`Owned card model evidence: ${directory}`);
try {
  for (const [index, scenario] of scenarios.entries()) {
    if (selection && selection.key !== scenario.key) continue;
    const replies = selection ? Array.from({ length: selection.turn - 1 }, (_unused, previousIndex) => {
      const previous = previousTranscripts.find(item => item.scenario === scenario.key && item.turn === previousIndex + 1);
      assert.ok(typeof previous?.output === 'string' && previous.output.length > 0);
      return previous.output;
    }) : [];
    for (const [requestIndex, request] of scenario.requests.entries()) {
      if (selection && requestIndex + 1 !== selection.turn) continue;
      let previous = 0;
      const messages = request.messages.map(message => {
        if (message.role === 'assistant' && message.content.includes('The lantern opens a quiet path through the sleeping garden.')) return { ...message, content: replies[previous++] };
        return message;
      });
      assert.equal(previous, replies.length, 'Every prior generated assistant turn must be replaced');
      assert.ok(messages.some(message => message.role === 'system' && message.content.includes(`OWNED_BOUND_RULE_${index}`)));
      assert.ok(messages.every(message => typeof message.content === 'string'));
      if (selection?.key === 'late-bookshop' && selection.turn === 2) assert.ok(messages.some(message => message.role === 'system' && message.content.includes('[User Persona:')), 'Focused identity check requires the corrected production identity context');
      const maxOutput = Math.min(request.max_tokens ?? 2048, 2048);
      const reservation = Buffer.byteLength(JSON.stringify(messages)) + maxOutput;
      assert.ok(report.tokens + reservation <= budget, 'Insufficient remaining authorized budget for this request');
      const call = { scenario: scenario.key, turn: replies.length + 1, status: 'pending', reservation, promptSha256: createHash('sha256').update(JSON.stringify(messages)).digest('hex') };
      report.calls.push(call);
      await save();
      const native = buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY, { ...request, model, messages, stream: false, max_tokens: maxOutput, temperature: 0.4 });
      let response;
      try {
        response = await fetch(native.url, { ...native.init, signal: AbortSignal.any([AbortSignal.timeout(60000), shutdown.signal]) });
        call.httpStatus = response.status;
        const completion = await readGeminiCompletion(response, model);
        const tokens = completion.usage?.total_tokens;
        call.tokens = Number.isSafeInteger(tokens) ? tokens : reservation;
        report.tokens += call.tokens;
        call.finishReason = completion.choices[0].finish_reason;
        const output = completion.choices[0].message.content;
        transcripts.push({ scenario: scenario.key, turn: call.turn, input: messages.at(-1).content, output });
        replies.push(output);
        call.status = 'completed';
        await save();
        assert.equal(call.finishReason, 'stop', 'Truncated reply is not successful gameplay');
        assert.ok(Number.isSafeInteger(tokens), 'Missing usage prevents further paid calls');
        console.info(`${scenario.key} turn ${call.turn}: complete; cumulative ${report.tokens} tokens`);
      } catch {
        if (call.status !== 'completed') { call.status = 'failed'; call.tokens = reservation; report.tokens += reservation; call.usageEstimated = true; }
        await save();
        throw new Error('Real card check stopped; inspect sanitized evidence, no automatic paid retry');
      }
    }
  }
  report.result = 'completed-pending-semantic-review';
} catch (error) {
  report.result = 'incomplete';
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  await save();
  await unlink(lockPath);
  console.info(`Result: ${report.result}; accounted tokens ${report.tokens}; ${directory}/report.json`);
}
