import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { tsImport } from 'tsx/esm/api';

assert.equal(process.argv.length, 8, 'Use --config <private env> --synthetic-snapshot <review snapshot> --output <private report>');
assert.equal(process.argv[2], '--config');
assert.equal(process.argv[4], '--synthetic-snapshot');
assert.equal(process.argv[6], '--output');
const settings = parse(await readFile(process.argv[3]));
assert.equal(settings.CUSTOM_LLM_API_FORMAT, 'gemini');
const snapshot = JSON.parse(await readFile(process.argv[5], 'utf8'));
const { buildGeminiRequest, readGeminiCompletion } = await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url);
const { storyMemoryPrompt, parseStoryMemoryResponse, parseStoryMemoryResult } = await tsImport('../src/server/services/story-memory-extraction.ts', import.meta.url);
const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
const cases = snapshot.jobs.slice(0, 2).map((job, index) => ({ name: index === 0 ? 'uncertain-authorship' : 'unaccepted-overnight-stay',
  sources: job.sources.map(source => ({ ...source, eventId: `synthetic-${source.version}` })) }));
assert.equal(cases.length, 2);
assert.ok(cases[0].sources.some(source => source.reply.includes('多半是原主人的随笔')));
assert.ok(cases[1].sources.some(source => source.reply.includes('今晚先在店里避避风吧')));
cases.push(...[
  { name: 'invitation-and-unpaid-purchase', pairs: [
    ['我只想问价格，还没决定买。', '掌柜说：“这枚徽章要八枚银币，你愿意的话可以带走。”'],
    ['我先把徽章放回柜台，钱还没付。', '掌柜点头：“不着急，我替你留着。”'],
    ['我考虑明晚再来，但还没确定。', '掌柜说：“等你有空再说，不算约好了。”'],
    ['我在门边看看天色，没有出门。', '掌柜指着乌云：“也许会下雨。”'],
    ['我仍在柜台旁，没有购买或离开。', '掌柜继续擦拭柜台。'],
  ] },
  { name: 'rumor-denial-and-degree', pairs: [
    ['门上的封印是什么情况？', '守卫说：“听说封印可能松动了，我还没亲自检查。”'],
    ['这是已经证实的事吗？', '守卫摇头：“没有，这只是巡夜人转述的猜测。”'],
    ['我看看门板，没有碰封印。', '门板边缘有些褪色，纹样仍清楚可见。'],
    ['有人说我已经入城，但我还在城门外。', '守卫说：“对，你尚未入城。”'],
    ['我决定等检查结果，暂时不进去。', '守卫答应稍后检查，目前还未开始。'],
  ] },
].map(item => ({ name: item.name, sources: item.pairs.map(([input, reply], index) => ({
  eventId: `synthetic-${index + 1}`, version: index + 1, inputMessageId: index * 2 + 1, messageId: index * 2 + 2, input, reply,
})) })));
const report = { date: new Date().toISOString(), scope: 'four synthetic extraction cases; no long-run, database or user acceptance',
  model, maxCalls: 4, tokenThreshold: 20000, recordedTokens: 0, cases: [], taskClosed: false, sourceHashes: {} };
for (const file of ['src/server/services/story-memory-extraction.ts', 'src/server/services/gemini-adapter.ts', 'scripts/story-memory-semantic-check.mjs']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
}
try {
  for (const item of cases) {
    assert.ok(report.recordedTokens + 8000 <= report.tokenThreshold, 'Insufficient remaining semantic-check budget');
    const entry = { name: item.name, sources: item.sources };
    report.cases.push(entry);
    const request = buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY, {
      model, stream: false, temperature: 0.2, max_tokens: 2000, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Extract only sourced fictional story continuity. Output the specified versioned JSON object.' },
        { role: 'user', content: storyMemoryPrompt(item.sources) },
      ],
    }, false);
    const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(60000) });
    entry.status = response.status;
    const completion = await readGeminiCompletion(response, model);
    entry.usage = completion.usage ?? null;
    assert.ok(Number.isSafeInteger(entry.usage?.total_tokens) && entry.usage.total_tokens > 0, 'Missing actual token usage; stop further calls');
    report.recordedTokens += entry.usage.total_tokens;
    entry.finishReason = completion.choices[0].finish_reason;
    entry.extraction = parseStoryMemoryResult(parseStoryMemoryResponse(completion.choices[0].message.content), item.sources);
    entry.sourceValidationPassed = true;
    console.info(`Semantic case completed: ${item.name}; cumulative tokens=${report.recordedTokens}`);
    await writeFile(process.argv[7], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  report.result = 'structural_checks_passed_semantic_review_required';
} catch {
  report.result = 'failed';
  process.exitCode = 1;
} finally {
  await writeFile(process.argv[7], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
