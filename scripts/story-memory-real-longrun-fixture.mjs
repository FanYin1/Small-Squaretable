import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { controlledMemoryResponse } from './story-memory-controlled-provider.mjs';

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/squaretable_real_memory_test');
assert.equal(url.username, 'real_memory_check');
assert.ok(process.env.REAL_MEMORY_FIXTURE && process.env.REAL_MEMORY_REPORT);
const seed = process.argv[2] === 'seed';
const controlled = process.env.REAL_MEMORY_CONTROLLED === 'true';
assert.ok(seed || process.argv[2] === 'verify');
const report = seed ? { model: process.env.CUSTOM_LLM_DEFAULT_MODEL, mode: controlled ? 'controlled' : 'real-provider',
  tokenAccounting: controlled ? 'synthetic usage, not provider spend' : 'recorded provider usage with estimator fallback',
  generatedTurns: 0, providerCalls: 0, controlledCalls: 0,
  extractionCalls: 0, trimmedTurns: 0, recapTurns: 0, checks: [], transcript: [], taskClosed: false }
  : JSON.parse(await readFile(process.env.REAL_MEMORY_REPORT, 'utf8'));
let phase = 'initialize';
let failEmbedding = false;
const { pipeline, env } = await import('@xenova/transformers');
env.cacheDir = '/tmp/squaretable-memory-models';
env.allowRemoteModels = false;
const embedding = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
const embed = async texts => (await embedding(texts, { pooling: 'mean', normalize: true })).tolist();
const ml = createServer(async (request, response) => {
  try {
    if (request.url !== '/embed/batch' || request.method !== 'POST') { response.writeHead(404).end(); return; }
    if (failEmbedding) { failEmbedding = false; response.writeHead(503).end(); return; }
    let body = '';
    for await (const chunk of request) { body += chunk; assert.ok(body.length < 50000); }
    const { texts } = JSON.parse(body);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ embeddings: await embed(texts) }));
  } catch { response.writeHead(500).end(); }
});
ml.listen(0, '127.0.0.1');
await once(ml, 'listening');
process.env.ML_SERVICE_URL = `http://127.0.0.1:${ml.address().port}`;
const originalFetch = globalThis.fetch;
const origin = new URL(process.env.CUSTOM_LLM_BASE_URL).origin;
globalThis.fetch = async (input, init) => {
  const remote = new URL(String(input)).origin === origin;
  if (new URL(String(input)).origin === origin) {
    const counter = controlled ? 'controlledCalls' : 'providerCalls';
    assert.ok(report[counter] < 145, 'Provider request budget exhausted');
    report[counter]++;
    if (String(input).includes(':generateContent')) report.extractionCalls++;
  }
  if (remote) report.lastRequest = { startedAt: new Date().toISOString(), streaming: String(input).includes(':streamGenerateContent') };
  const response = controlled && remote ? controlledMemoryResponse(input, init) : await originalFetch(input, init);
  if (remote) report.lastRequest.status = response.status;
  if (new URL(String(input)).origin === origin && String(input).includes(':generateContent')) {
    const body = await response.clone().json().catch(() => null);
    const text = (body?.candidates?.[0]?.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
    report.lastExtraction = { status: response.status, finishReason: body?.candidates?.[0]?.finishReason,
      characters: text.length, fenced: text.trim().startsWith('```') };
    try { parseStoryMemoryResponse(text); report.lastExtraction.schemaValid = true; }
    catch (error) {
      report.lastExtraction.schemaValid = false;
      report.lastExtraction.error = error?.name === 'SyntaxError' ? 'JSON_INVALID' : 'SCHEMA_INVALID';
      if (Array.isArray(error?.issues)) report.lastExtraction.issues = error.issues.map(issue => ({ code: issue.code, path: issue.path }));
    }
  }
  return response;
};
const client = postgres(url.toString(), { max: 4 });
const schema = await import('../src/db/schema/index.ts');
const database = drizzle(client, { schema });
const { ChatCreationService } = await import('../src/server/services/chat-creation.service.ts');
const { prepareStoryTurn, commitStoryTurn, addStoryNote } = await import('../src/server/services/story-state.service.ts');
const { loadStoryContent } = await import('../src/server/services/story-content.service.ts');
const { MemoryRepository } = await import('../src/db/repositories/memory.repository.ts');
const { contextManager } = await import('../src/server/services/context-manager.service.ts');
const { getStorySummaries } = await import('../src/server/services/story-summary.service.ts');
const { addStorySummaries } = await import('../src/server/services/story-summary-context.ts');
const { buildMemoryParts } = await import('../src/server/services/prompt-assembly.ts');
const { llmService } = await import('../src/server/services/llm.service.ts');
const { spendBreaker } = await import('../src/server/services/spend-breaker.service.ts');
const { getRedisClient, closeRedis } = await import('../src/core/redis.ts');
const { runStoryMemory } = await import('../src/server/jobs/story-memory.job.ts');
const { parseStoryMemoryResponse } = await import('../src/server/services/story-memory-extraction.ts');
const repository = new MemoryRepository(database);
const model = process.env.CUSTOM_LLM_DEFAULT_MODEL;
const topics = ['查看一本旧书的封面', '询问书页上的手写批注', '观察窗外的雨', '询问店内的修书工具', '看看柜台上的书签',
  '询问墙上照片的来历', '听听店员对旧书的看法', '询问一本书的作者', '看看书架的分类', '询问店内安静的角落'];

async function turn(chat, index, other = false) {
  const input = index === 1 ? other
    ? '我们约好第五夜在南门见面，凭证是红色缎带。今天第一夜，尚未赴约。'
    : '我们约好第三夜在北门见面，凭证是蓝色票据。今天第一夜，尚未赴约。'
    : index === 100 ? '我离开页面后回来了，请核对最初约定的会面时间、地点、凭证，以及是否已经履行。'
      : `我${topics[(index - 2) % topics.length]}。我仍留在书店，继续这一夜的交谈。`;
  const prepared = await prepareStoryTurn(chat, input, undefined, database);
  const snapshot = await loadStoryContent(chat.id, chat.userId, database);
  const queryVector = (await embed([input]))[0];
  const memories = await repository.hybridSearch({ characterId: chat.characterId, userId: chat.userId, chatId: chat.id, embedding: queryVector, limit: 5 });
  const rows = await client`SELECT id, role, content FROM messages WHERE chat_id = ${chat.id} AND coalesce(extra->>'stateStatus', '') <> 'interrupted' ORDER BY id`;
  const history = rows.map(row => ({ role: row.role, content: row.content, messageId: Number(row.id) }));
  history.push({ role: 'user', content: input });
  const system = `${snapshot.characters[0].cardData.system_prompt}\n${prepared.prompt}\n${buildMemoryParts(memories).join('\n')}`;
  const original = contextManager.buildContext(system, history, model);
  const summaries = await getStorySummaries(chat.id, chat.userId, chat.tenantId, chat.characterId, database);
  const context = addStorySummaries(system, history, model, 0, original, summaries);
  const text = context.messages.map(message => message.content).join('\n');
  if (!other) assert.ok(!text.includes('红色缎带'), 'Another story entered the prompt');
  report.trimmedTurns += Number(context.truncated);
  report.recapTurns += Number(Boolean(context.summarized));
  const response = await llmService.streamChatCompletion({ model, messages: context.messages, stream: true,
    temperature: 0.4, max_tokens: 1024, n: 1, presence_penalty: 0, frequency_penalty: 0 }, AbortSignal.timeout(60000));
  const stream = await response.text();
  assert.ok(stream.endsWith('data: [DONE]\n\n'));
  const frames = stream.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
  const reply = frames.flatMap(frame => frame.choices).map(choice => choice.delta?.content ?? '').join('');
  assert.ok(reply.trim());
  const finish = frames.flatMap(frame => frame.choices).findLast(choice => choice.finish_reason)?.finish_reason;
  const usage = frames.findLast(frame => frame.usage)?.usage;
  await spendBreaker.record(usage?.total_tokens ?? context.totalTokens + llmService.countTokens(reply));
  const [source] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: input }).returning();
  await commitStoryTurn(prepared, source.id, randomUUID(), reply, false, database);
  report.generatedTurns++;
  report.transcript.push({ story: other ? 'parallel' : 'main', turn: index, input, reply, truncated: context.truncated,
    summarized: Boolean(context.summarized), finishReason: finish, usage: usage ?? null, retrieval: memories.map(memory => memory.id) });
  if (index === 100) report.returnContext = { retrieved: memories.map(memory => ({ id: memory.id, content: memory.content })),
    sourceTurnOneRetained: original.messages.some(message => message.messageId === Number(rows[0]?.id)),
    styleRetained: text.includes('简短克制'), noOtherStoryCredential: !text.includes('红色缎带'), reply };
  await writeFile(process.env.REAL_MEMORY_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.info(`REAL_MEMORY_PROGRESS story=${other ? 'parallel' : 'main'} turn=${index} calls=${report.providerCalls}`);
}

async function batch(chat, expected = 'succeeded', checkpointOnly = false) {
  const [job] = await client`SELECT id FROM story_memory_jobs WHERE chat_id = ${chat.id} AND status IN ('pending', 'retry') ORDER BY created_at, id LIMIT 1`;
  assert.ok(job, 'Expected a pending memory batch');
  const before = report.extractionCalls;
  let stored;
  for (let attempt = 0; attempt < 3; attempt++) {
    await client`UPDATE story_memory_jobs SET available_at = '2000-01-01' WHERE id = ${job.id}`;
    try { await runStoryMemory(); } catch {}
    [stored] = await client`SELECT status, extracted, error_code, attempts FROM story_memory_jobs WHERE id = ${job.id}`;
    report.lastJob = { status: stored.status, errorCode: stored.error_code, attempts: stored.attempts };
    if (stored.status !== 'succeeded') {
      report.derivationFailures ??= [];
      report.derivationFailures.push({ ...report.lastJob, injected: expected === 'retry', generatedTurns: report.generatedTurns,
        extraction: report.lastExtraction });
    }
    if (stored.status === expected || stored.status !== 'retry') break;
  }
  assert.equal(stored.status, expected);
  assert.equal(stored.extracted?.version, 1);
  if (checkpointOnly) assert.equal(report.extractionCalls, before, 'Restored extraction was called again');
  return job.id;
}

async function captureMemoryBatches() {
  report.memoryBatches = await client`SELECT job.id, job.chat_id AS "chatId", job.status, job.extracted,
    (SELECT jsonb_agg(jsonb_build_object('version', event.version, 'inputMessageId', input.id,
      'messageId', reply.id, 'input', input.content, 'reply', reply.content) ORDER BY event.version)
      FROM story_events event JOIN messages input ON input.id = event.input_message_id
      JOIN messages reply ON reply.id = event.message_id
      WHERE event.id = ANY(job.source_event_ids)) AS sources
    FROM story_memory_jobs job ORDER BY job.created_at, job.id`;
}

try {
  let fixture;
  if (seed) {
    assert.equal((await client`SELECT count(*)::int AS count FROM users`)[0].count, 0);
    const [tenant] = await database.insert(schema.tenants).values({ name: 'Real-provider synthetic memory test' }).returning();
    const [user] = await database.insert(schema.users).values({ tenantId: tenant.id, email: `${randomUUID()}@example.test`, displayName: '合成验收玩家' }).returning();
    const cardData = { name: '小禾', description: '旧书店的店员，说话简短克制。', personality: '细心，尊重边界。', scenario: '第一夜的旧书店。',
      first_mes: '店员抬头招呼：请进，你想看看什么？', mes_example: '',
      system_prompt: '扮演旧书店店员小禾。始终是第一夜的店内交谈，除非玩家明确推进时间或出门。不要替玩家作决定或描述玩家内心。回应最多两句简短克制的对白，可带一个可观察动作，给玩家继续选择的空间。承诺只按已保存原文、来源记忆和笔记回应；不确定时明确说明。' };
    const [character] = await database.insert(schema.characters).values({ tenantId: tenant.id, creatorId: user.id, name: '合成百轮验收卡', cardData }).returning();
    const [book] = await database.insert(schema.worldbooks).values({ tenantId: tenant.id, userId: user.id,
      characterId: character.id, name: '合成书店背景', scope: 'character' }).returning();
    await database.insert(schema.worldbookEntries).values({ worldbookId: book.id, keyword: '书店',
      content: '这是一家旧书店。', settings: { constant: true } });
    const creation = new ChatCreationService(database);
    const create = async () => (await creation.create(user.id, tenant.id, { characterId: character.id, clientRequestId: randomUUID() })).chat;
    const main = await create(); const parallel = await create();
    const [coverage] = await client`SELECT count(*)::int AS entries FROM story_worldbooks,
      LATERAL jsonb_array_elements(snapshot->'bindings') binding,
      LATERAL jsonb_array_elements(binding->'books') book,
      LATERAL jsonb_array_elements(book->'entries') entry`;
    assert.equal(coverage.entries, 2, 'Restore fixture must freeze one bound entry per story before paid generation');
    for (const chat of [main, parallel]) await addStoryNote(chat.id, user.id, { kind: 'style', content: '请使用简短克制的对白，不替我决定行动，也不替我描述内心。' }, database);
    fixture = { main, parallel };
    phase = 'parallel-story';
    for (let index = 1; index <= 5; index++) await turn(parallel, index, true);
    await batch(parallel);
    phase = 'main-first-half';
    for (let index = 1; index <= 50; index++) {
      await turn(main, index);
      if (index === 25) {
        const prepared = await prepareStoryTurn(main, '这是一条中止行动。', undefined, database);
        const [source] = await database.insert(schema.messages).values({ chatId: main.id, role: 'user', content: '这是一条中止行动。', extra: { stateStatus: 'interrupted' } }).returning();
        await commitStoryTurn(prepared, source.id, randomUUID(), '未确认的中止片段，不得进入记忆。', true, database);
      }
      if (index % 5 === 0 && index <= 40) await batch(main);
      if (index === 45) {
        failEmbedding = true;
        fixture.checkpoint = await batch(main, 'retry');
        await client`UPDATE story_memory_jobs SET available_at = now() + interval '1 day' WHERE id = ${fixture.checkpoint}`;
      }
    }
    report.checks.push(`50 ${report.mode} turns and a parallel five-turn story persisted; embedding outage retained extraction checkpoint`);
    await writeFile(process.env.REAL_MEMORY_FIXTURE, JSON.stringify(fixture), { mode: 0o600 });
    report.result = 'ready_for_restore';
  } else {
    fixture = JSON.parse(await readFile(process.env.REAL_MEMORY_FIXTURE, 'utf8'));
    phase = 'restored-checkpoint';
    const [checkpoint] = await client`SELECT status, extracted FROM story_memory_jobs WHERE id = ${fixture.checkpoint}`;
    assert.equal(checkpoint.status, 'retry'); assert.equal(checkpoint.extracted.version, 1);
    await batch(fixture.main, 'succeeded', true);
    await batch(fixture.main);
    report.checks.push('New process and restored database resume failed embedding without repeating extraction');
    phase = 'main-second-half';
    for (let index = 51; index <= 100; index++) {
      await turn(fixture.main, index);
      if (index % 5 === 0) await batch(fixture.main);
    }
    const jobs = await client`SELECT status, source_event_ids FROM story_memory_jobs WHERE chat_id = ${fixture.main.id}`;
    assert.equal(jobs.length, 20); assert.ok(jobs.every(job => job.status === 'succeeded'));
    assert.equal(new Set(jobs.flatMap(job => job.source_event_ids)).size, 100);
    const [interrupted] = await client`SELECT id FROM story_events WHERE chat_id = ${fixture.main.id} AND status = 'interrupted'`;
    assert.ok(jobs.every(job => !job.source_event_ids.includes(interrupted.id)));
    assert.ok(report.trimmedTurns > 0 && report.recapTurns > 0);
    assert.equal(report.returnContext.sourceTurnOneRetained, false);
    assert.equal(report.returnContext.styleRetained, true);
    assert.equal(report.returnContext.noOtherStoryCredential, true);
    report.returnSignals = ['第三夜', '北门', '蓝色票据'].map(marker => ({ marker, present: report.returnContext.reply.includes(marker) }));
    report.checks.push(`100 ${report.mode} main-story turns span 20 source-checked batches; interrupted event excluded; retrieval and recaps used after trimming`);
    report.result = controlled ? 'controlled_harness_passed_not_real_quality' : 'engineering_passed_semantic_review_required';
  }
  report.tokens = Number(await (await getRedisClient()).get(spendBreaker.getDayKey()) ?? 0);
  report.phase = phase;
} catch (error) {
  report.result = 'failed'; report.phase = phase;
  report.error = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'REAL_MEMORY_ACCEPTANCE_FAILED';
  report.assertion = error?.code === 'ERR_ASSERTION' ? String(error.message).slice(0, 180) : undefined;
  report.errorName = ['TimeoutError', 'AbortError', 'TypeError', 'AppError', 'AssertionError'].includes(error?.name) ? error.name : 'OtherError';
  if (Number.isInteger(error?.statusCode)) report.status = error.statusCode;
  process.exitCode = 1;
} finally {
  try { await captureMemoryBatches(); }
  catch { report.memoryBatchCaptureFailed = true; }
  try { report.tokens = Number(await (await getRedisClient()).get(spendBreaker.getDayKey()) ?? 0); }
  catch { report.tokens = null; }
  await writeFile(process.env.REAL_MEMORY_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 });
  await client.end({ timeout: 1 });
  await closeRedis();
  ml.closeAllConnections(); ml.close();
  console.info(`REAL_MEMORY_RESULT ${report.result} phase=${phase} turns=${report.generatedTurns}`);
  process.exit(process.exitCode ?? 0);
}
