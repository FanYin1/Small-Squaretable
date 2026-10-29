import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'squaretable-model-guard-'));
let calls = 0;
let release;
let started;
const held = new Promise(resolve => { release = resolve; });
const firstCall = new Promise(resolve => { started = resolve; });
const provider = createServer(async (request, response) => {
  for await (const _chunk of request) {}
  calls++;
  if (calls === 1) { started(); await held; }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'controlled guard response' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }));
});
const children = [];
const start = (extra = []) => {
  const child = spawn(process.execPath, ['scripts/character-journey-model-check.mjs', '--config', join(directory, 'test.env'), '--requests', join(directory, 'owned-requests.json'), '--token-budget', '30000', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  return { child, done: new Promise(resolve => child.on('exit', code => resolve({ code, output }))) };
};
try {
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  await writeFile(join(directory, 'test.env'), `CUSTOM_LLM_API_FORMAT=gemini\nCUSTOM_LLM_API_KEY=controlled-only\nCUSTOM_LLM_BASE_URL=http://127.0.0.1:${provider.address().port}\nCUSTOM_LLM_MODELS=owned-guard\n`, { mode: 0o600 });
  const scenarios = ['fog-harbor', 'late-bookshop'].map((key, index) => ({ key, requests: Array.from({ length: 3 }, (_unused, turn) => ({ messages: [{ role: 'system', content: `OWNED_BOUND_RULE_${index}\n[User Persona: Guard]` }, ...Array.from({ length: turn }, () => [{ role: 'user', content: 'Earlier test action' }, { role: 'assistant', content: 'The lantern opens a quiet path through the sleeping garden.' }]).flat(), { role: 'user', content: 'Test action' }], max_tokens: 2048 })) }));
  await writeFile(join(directory, 'owned-requests.json'), JSON.stringify(scenarios), { mode: 0o600 });
  const first = start();
  await Promise.race([firstCall, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Controlled request did not start')), 15000).unref())]);
  const duplicate = await start().done;
  assert.notEqual(duplicate.code, 0); assert.match(duplicate.output, /EEXIST/); assert.equal(calls, 1);
  release();
  const completed = await first.done;
  assert.equal(completed.code, 0); assert.equal(calls, 6);
  await assert.rejects(access(join(directory, 'owned-requests.json.model-check.lock')));
  await writeFile(join(directory, 'previous.json'), JSON.stringify([{ scenario: 'late-bookshop', turn: 1, output: 'controlled earlier reply' }]));
  const focused = await start(['--only-case', 'late-bookshop:2', '--previous', join(directory, 'previous.json')]).done;
  assert.equal(focused.code, 0); assert.equal(calls, 7);
  console.info('PASS: duplicate rejected before provider call; owner releases lock; focused check makes exactly one further request; paid tokens 0');
} finally {
  release();
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
