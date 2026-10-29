import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { tsImport } from 'tsx/esm/api';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 4, 'Use --config <private env file> --output <report path>');
assert.equal(args[0], '--config');
assert.equal(args[2], '--output');
const settings = parse(await readFile(args[1]));
await requireEngineeringGateway(settings);
assert.equal(settings.CUSTOM_LLM_API_FORMAT, 'gemini');
const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
const { buildGeminiRequest, convertGeminiStream, readGeminiCompletion } = await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url);
const { storyMemoryPrompt, parseStoryMemoryResult, parseStoryMemoryResponse } = await tsImport('../src/server/services/story-memory-extraction.ts', import.meta.url);
const report = { date: new Date().toISOString(), scope: 'real provider adapter, streaming and five-turn synthetic extraction; not long-run acceptance',
  model, apiFormat: 'gemini', calls: [], checks: [], taskClosed: false };

async function generate(kind, messages, maxTokens, stream = false) {
  assert.ok(report.calls.length < 3, 'Provider check call budget exhausted');
  const call = { kind, maxOutputTokens: maxTokens, stream, usable: false };
  report.calls.push(call);
  const native = buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY,
    { model, messages, max_tokens: maxTokens, temperature: 0.2, stream,
      ...(kind === 'memory-extraction' ? { response_format: { type: 'json_object' } } : {}) }, stream);
  const response = await fetch(native.url, { ...native.init, signal: AbortSignal.timeout(60000) });
  call.status = response.status;
  if (stream) {
    const text = await convertGeminiStream(response, model).text();
    assert.ok(text.endsWith('data: [DONE]\n\n'));
    const frames = text.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
    const content = frames.flatMap(frame => frame.choices).map(choice => choice.delta?.content ?? '').join('');
    assert.ok(content.trim());
    call.usable = true;
    call.outputCharacters = content.length;
    call.usage = frames.findLast(frame => frame.usage)?.usage ?? null;
    return content;
  }
  const result = await readGeminiCompletion(response, model);
  call.usable = true;
  call.finishReason = result.choices[0].finish_reason;
  call.outputCharacters = result.choices[0].message.content.length;
  call.usage = result.usage ?? null;
  return result.choices[0].message.content;
}

try {
  const messages = [{ role: 'system', content: '你是虚构书店的店员。只用一句简短对白回应，不替玩家行动。' },
    { role: 'user', content: '我站在门口，询问是否营业。' }];
  await generate('nonstream', messages, 128);
  report.checks.push('Native response converts to a nonempty chat completion');
  await generate('stream', messages, 128, true);
  report.checks.push('Native SSE converts to readable content, terminal completion and usage');
  const sources = Array.from({ length: 5 }, (_, index) => ({ eventId: `synthetic-${index + 1}`, version: index + 1,
    inputMessageId: index * 2 + 1, messageId: index * 2 + 2,
    input: index === 0 ? '约好第三夜在北门会面，凭证是蓝色票据。请简短回答，不替我行动。' : '现在仍是第一夜。我继续查看店内的书目，暂不离开。',
    reply: index === 0 ? '第三夜，北门。蓝色票据为凭，我会等你。' : '店员递来书目，等你选择。会面尚未发生。' }));
  const raw = await generate('memory-extraction', [
    { role: 'system', content: 'Extract only sourced fictional story continuity. Output the specified versioned JSON object.' },
    { role: 'user', content: storyMemoryPrompt(sources) },
  ], 2000);
  report.extractionFormat = { startsWithFence: raw.trim().startsWith('```'), startsWithObject: raw.trim().startsWith('{') };
  report.phase = 'parse-extraction';
  const extraction = parseStoryMemoryResult(parseStoryMemoryResponse(raw), sources);
  assert.equal(extraction.version, 1);
  const summary = extraction.summary.content;
  report.extraction = { facts: extraction.facts.length, sourceValidationPassed: true,
    anchorKeywordSignals: ['第三夜', '北门', '蓝色票据'].map(marker => ({ marker, present: JSON.stringify(extraction).includes(marker) })),
    summaryCharacters: summary.length, outputSha256: createHash('sha256').update(raw).digest('hex'),
    semanticReview: 'not performed; keyword signals do not prove correctness' };
  report.checks.push('Real extraction passes the production versioned schema and source-ID validation');
  report.result = 'provider_integration_verified_longrun_pending';
  report.phase = 'complete';
} catch (error) {
  report.result = 'failed';
  report.error = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'PROVIDER_CHECK_FAILED';
  if (error?.name === 'SyntaxError') report.error = 'EXTRACTION_JSON_INVALID';
  if (Array.isArray(error?.issues)) report.validation = error.issues.map(issue => ({ code: issue.code, path: issue.path }));
  process.exitCode = 1;
} finally {
  report.sourceHashes = {};
  for (const file of ['src/server/services/gemini-adapter.ts', 'src/server/services/llm.service.ts',
    'src/server/config/llm.config.ts', 'src/server/services/story-memory-extraction.ts', 'scripts/story-memory-real-provider-check.mjs']) {
    report.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  await writeFile(args[3], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.info(JSON.stringify(report, null, 2));
}
