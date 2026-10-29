import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export async function checkStoryContext({ browser, base, sql, getRequests }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const root = '/tmp/squaretable-context-evidence';
  const evidence = `${root}/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const errors = [];
  const networkFailures = [];
  let remaining = 100;
  let resetAt = 0;
  function observeBudget(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    const nextRemaining = Number(headers['x-ratelimit-remaining']);
    remaining = nextReset > resetAt + 2000 ? nextRemaining : Math.min(remaining, nextRemaining);
    resetAt = Math.max(resetAt, nextReset);
  }
  async function waitForBudget() {
    if (remaining >= 70) return;
    console.info('Context check is waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
    remaining = 100;
  }
  let auth;
  let csrf;
  async function api(path, body, expected = body ? 201 : 200, method = body ? 'POST' : 'GET') {
    await waitForBudget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    observeBudget(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${path} status`);
    const result = await response.json();
    return result.data ?? result;
  }
  const invite = `CONTEXT-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
  const makeCard = (name, extension = {}) => api('/characters', { name, description: 'CONTEXT_FROZEN_IDENTITY：谨慎的灯塔记录员。',
    cardData: { name, first_mes: '', description: 'CONTEXT_FROZEN_IDENTITY：谨慎的灯塔记录员。', personality: '尊重玩家的选择。', extensions: extension } });
  const card = await makeCard('上下文验收记录员');
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const note = await api(`/chats/${story.id}/story-notes`, { kind: 'style', content: 'CONTEXT_STYLE_MARKER：对白克制，保留回应空间，记住灯塔会面。' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (!new URL(response.url()).pathname.startsWith('/api/v1/')) return;
    observeBudget(response.headers());
    if (response.status() >= 500 || response.status() === 429) networkFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  const received = [];
  const sent = [];
  page.on('websocket', socket => {
    socket.on('framereceived', ({ payload }) => { try { received.push(JSON.parse(payload.toString())); } catch {} });
    socket.on('framesent', ({ payload }) => { try { sent.push(JSON.parse(payload.toString())); } catch {} });
  });
  async function openStory(chatId) {
    await waitForBudget();
    await page.goto(`${base}/chat/${chatId}`);
    await expect(page.locator('.message-input textarea')).toBeVisible();
  }
  async function send(text, expectedStatus) {
    await waitForBudget();
    const receivedStart = received.length;
    await page.locator('.message-input textarea').fill(text);
    await expect(page.locator('.message-input .send-btn')).toBeEnabled({ timeout: 15000 });
    await page.locator('.message-input textarea').press('Enter');
    await expect.poll(() => received.slice(receivedStart).find(event => event.type === 'generation_finished')?.data.status, { timeout: 30000 }).toBe(expectedStatus);
    return received.slice(receivedStart);
  }
  async function facts(chatId) {
    const [facts] = await sql`SELECT
      (SELECT version FROM story_states WHERE chat_id = ${chatId}) AS version,
      (SELECT count(*)::int FROM messages WHERE chat_id = ${chatId} AND role = 'user') AS inputs,
      (SELECT count(*)::int FROM messages WHERE chat_id = ${chatId} AND role = 'assistant') AS replies,
      (SELECT count(*)::int FROM story_events WHERE chat_id = ${chatId}) AS events,
      (SELECT count(*)::int FROM credit_ledger WHERE chat_id = ${chatId} AND kind = 'charge') AS charges,
      (SELECT count(*)::int FROM credit_reservations WHERE chat_id = ${chatId}) AS holds`;
    return facts;
  }
  try {
    await openStory(story.id);
    const providerStart = getRequests().length;
    const longInput = '我想核对灯塔会面约定。'.repeat(250);
    assert.ok(longInput.length <= 4000);
    const overflow = await send(longInput, 'failed');
    const error = overflow.find(event => event.type === 'error');
    assert.equal(error?.data.code, 'CONTEXT_BUDGET_EXCEEDED');
    assert.equal(error.data.details.reason, 'latest');
    assert.equal(getRequests().length, providerStart);
    assert.equal(overflow.find(event => event.type === 'generation_finished').data.retryable, false);
    assert.deepEqual(await facts(story.id), { version: 0, inputs: 1, replies: 0, events: 0, charges: 0, holds: 0 });
    await expect(page.locator('.generation-error')).toContainText('本次输入及本轮对话');
    await expect(page.getByRole('button', { name: '重试本轮', exact: true })).toHaveCount(0);
    checks.push({ case: 'oversized accepted input is retained without body generation, credit hold or story effects', result: 'passed' });
    await page.screenshot({ path: `${evidence}/desktop-overflow.png`, fullPage: true });

    await page.locator('.message-input textarea').fill('已经开始写的新草稿');
    const sendsBeforeRecovery = sent.filter(event => event.type === 'user_message').length;
    await page.getByRole('button', { name: '取回文字修改', exact: true }).click();
    await expect(page.locator('.message-input textarea')).toHaveValue(`已经开始写的新草稿\n${longInput}`);
    assert.equal(sent.filter(event => event.type === 'user_message').length, sendsBeforeRecovery);
    checks.push({ case: 'input recovery appends to an existing draft without resending', result: 'passed' });
    await send('请简短确认灯塔会面的约定。', 'completed');
    assert.equal(getRequests().length, providerStart + 1);
    const request = getRequests().at(-1);
    const contents = request.messages.map(message => message.content).join('\n');
    assert.ok(contents.includes('CONTEXT_FROZEN_IDENTITY'));
    assert.ok(contents.includes('CONTEXT_STYLE_MARKER'));
    assert.ok(contents.includes('请简短确认灯塔会面的约定。'));
    assert.ok(!contents.includes(longInput));
    assert.equal(request.max_tokens, 2048);
    assert.deepEqual(await facts(story.id), { version: 1, inputs: 2, replies: 1, events: 1, charges: 1, holds: 1 });
    checks.push({ case: 'edited input generates once with frozen identity and saved style; oversized older input stays stored', result: 'passed' });

    for (let version = 2; version <= 26; version++) {
      const requestId = randomUUID();
      const [input] = await sql`INSERT INTO messages (chat_id, role, content) VALUES (${story.id}, 'user', ${`合成历史第${version}轮：` + '核对已记录的日程。'.repeat(12)}) RETURNING id`;
      const [reply] = await sql`INSERT INTO messages (chat_id, role, content, extra) VALUES (${story.id}, 'assistant', ${`合成回复第${version}轮：` + '按已确认日程核对。'.repeat(12)},
        ${sql.json({ storyRequestId: requestId, storyVersion: version, stateStatus: 'confirmed' })}) RETURNING id`;
      await sql`INSERT INTO story_events (chat_id, request_id, version, status, input_message_id, message_id, changes, excerpt)
        VALUES (${story.id}, ${requestId}, ${version}, 'confirmed', ${input.id}, ${reply.id}, '{}', '合成历史片段')`;
      await sql`UPDATE story_states SET version = ${version} WHERE chat_id = ${story.id}`;
    }
    const [summaryJob] = await sql`SELECT id, source_event_ids FROM story_memory_jobs WHERE chat_id = ${story.id} ORDER BY created_at, id LIMIT 1 OFFSET 1`;
    assert.ok(summaryJob);
    await sql`UPDATE messages SET content = content || ' 玩家明确要求短句，少用比喻。' WHERE id = (
      SELECT input_message_id FROM story_events WHERE chat_id = ${story.id} AND version = 6)`;
    const summaryRows = await sql`SELECT event.id, event.version, input.id AS input_id, reply.id AS reply_id, input.content AS input, reply.content AS reply
      FROM story_events event JOIN messages input ON input.id = event.input_message_id JOIN messages reply ON reply.id = event.message_id
      WHERE event.chat_id = ${story.id} AND event.id IN ${sql(summaryJob.source_event_ids)} ORDER BY event.version`;
    const summarySources = summaryRows.map(row => ({ eventId: row.id, version: row.version, inputMessageId: Number(row.input_id),
      messageId: Number(row.reply_id), input: row.input, reply: row.reply }));
    assert.equal(summarySources.length, 5);
    assert.ok(summarySources.every(source => Number.isSafeInteger(source.inputMessageId) && Number.isSafeInteger(source.messageId)));
    assert.deepEqual(summarySources.map(source => source.version), [6, 7, 8, 9, 10]);
    const summaryDigest = createHash('sha256').update(JSON.stringify(summarySources)).digest('hex');
    await sql`UPDATE story_memory_jobs SET status = 'succeeded', completed_at = now(), source_digest = ${summaryDigest},
      extracted = ${sql.json({ version: 1, facts: [{ type: 'preference', content: 'DERIVED_STYLE_05A：玩家要求短句，少用比喻。',
        sourceMessageIds: [summarySources[0].inputMessageId] }], summary: { content: 'SUMMARY_CONTEXT_CHECK：灯塔约定尚未履行，保持克制对白。',
        sourceMessageIds: [summarySources[0].messageId] } })} WHERE id = ${summaryJob.id}`;
    const [preference] = await sql`INSERT INTO character_memories (character_id, user_id, source_chat_id, source_message_id, type, content)
      VALUES (${card.id}, ${auth.user.id}, ${story.id}, ${summarySources[0].inputMessageId}, 'preference', 'DERIVED_STYLE_05A：玩家要求短句，少用比喻。') RETURNING id`;
    await sql`INSERT INTO story_memory_links (memory_id, job_id, event_id, message_id)
      VALUES (${preference.id}, ${summaryJob.id}, ${summarySources[0].eventId}, ${summarySources[0].inputMessageId})`;
    await api(`/characters/${card.id}/intelligence/memories?chatId=${story.id}`, undefined, 409);
    await api(`/characters/${card.id}/intelligence/extract-memories`, { chatId: story.id }, 409);
    const globals = await api(`/characters/${card.id}/intelligence/memories`);
    assert.equal(globals.memories.length, 0);
    await api(`/characters/${card.id}/intelligence/memories/${preference.id}`, undefined, 404, 'DELETE');
    await api(`/characters/${card.id}/intelligence/memories`, undefined, 200, 'DELETE');
    assert.equal((await sql`SELECT id FROM character_memories WHERE id = ${preference.id}`).length, 1);
    const [foreign] = await sql`SELECT id, character_id FROM chats WHERE user_id <> ${auth.user.id} AND character_id IS NOT NULL LIMIT 1`;
    assert.ok(foreign);
    await api(`/characters/${foreign.character_id}/intelligence/extract-memories`, { chatId: foreign.id }, 404);
    checks.push({ case: 'real legacy memory API rejects managed story reads and extraction; omitted scope does not expose story facts', result: 'passed' });
    checks.push({ case: 'real HTTP rejects foreign-story extraction and managed memory deletion; global clear preserves story derivation', result: 'passed' });
    await waitForBudget();
    await page.reload();
    await send('CONTEXT_LATEST_INPUT：继续核对约定。', 'completed');
    const resumed = getRequests().at(-1);
    const resumedText = resumed.messages.map(message => message.content).join('\n');
    assert.ok(resumedText.includes('CONTEXT_STYLE_MARKER') && resumedText.includes('CONTEXT_FROZEN_IDENTITY') && resumedText.includes('CONTEXT_LATEST_INPUT'));
    assert.ok(resumedText.includes('omitted from this request only'));
    assert.ok(resumed.messages.length < 50);
    assert.equal((await facts(story.id)).version, 27);
    assert.equal((await sql`SELECT content FROM story_notes WHERE id = ${note.id}`)[0].content.includes('CONTEXT_STYLE_MARKER'), true);
    checks.push({ case: 'nonempty long history is trimmed by whole turns while saved notes and current input reach the real provider boundary', result: 'passed', syntheticHistoricalTurns: 25 });
    assert.ok(resumedText.includes('SUMMARY_CONTEXT_CHECK'));
    assert.ok(resumedText.includes('DERIVED_STYLE_05A') && resumedText.includes('来源事件版本 6–6'));
    assert.ok(resumedText.includes('不是现实用户资料或当前状态'));
    checks.push({ case: 'sourced style preference without a vector survives reload and reaches the actual provider request independently of topic similarity', result: 'passed', fixture: 'explicit synthetic checkpoint and linked preference, not real extraction' });
    assert.equal(resumed.max_tokens, 2048);
    checks.push({ case: 'validated completed batch recap reaches the real WebSocket provider boundary alongside notes and latest input', result: 'passed', fixture: 'seeded synthetic completed summary, not real provider extraction' });
    await sql`UPDATE story_memory_jobs SET source_digest = 'invalidated-fixture-digest' WHERE id = ${summaryJob.id}`;
    await send('CONTEXT_AFTER_INVALIDATION：继续核对。', 'completed');
    const invalidatedText = getRequests().at(-1).messages.map(message => message.content).join('\n');
    assert.ok(!invalidatedText.includes('SUMMARY_CONTEXT_CHECK'));
    assert.ok(!invalidatedText.includes('DERIVED_STYLE_05A'));
    assert.ok(invalidatedText.includes('CONTEXT_STYLE_MARKER') && invalidatedText.includes('CONTEXT_AFTER_INVALIDATION'));
    assert.equal((await facts(story.id)).version, 28);
    checks.push({ case: 'changed source digest excludes stale recap from the next real continuation without dropping notes or latest input', result: 'passed' });

    const oversizedCard = await makeCard('超限作者资料卡', { depth_prompt: { prompt: 'CONTEXT_PRIVATE_DEPTH：' + '作者绑定资料'.repeat(600), depth: 1, role: 0 } });
    const oversizedStory = await api('/chats', { characterId: oversizedCard.id, clientRequestId: randomUUID() });
    await page.setViewportSize({ width: 390, height: 844 });
    await openStory(oversizedStory.id);
    const beforeCritical = getRequests().length;
    const critical = await send('开始。', 'failed');
    assert.equal(critical.find(event => event.type === 'error')?.data.details?.reason, 'critical');
    assert.equal(getRequests().length, beforeCritical);
    assert.deepEqual(await facts(oversizedStory.id), { version: 0, inputs: 1, replies: 0, events: 0, charges: 0, holds: 0 });
    const frame = JSON.stringify(critical.find(event => event.type === 'error'));
    assert.ok(!frame.includes('CONTEXT_PRIVATE_DEPTH'));
    await expect(page.locator('.generation-error')).toContainText('角色资料、故事状态和约定');
    await expect(page.getByRole('button', { name: '取回文字修改', exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidence}/mobile-critical-overflow.png`, fullPage: true });
    checks.push({ case: 'mobile critical depth material is preserved and rejected before generation; error metadata contains no private prompt', result: 'passed' });
    assert.deepEqual(errors, []);
    assert.deepEqual(networkFailures, []);
    const paths = ['scripts/story-context-browser-check.mjs', 'scripts/exploration-entry-check.mjs', 'scripts/beta-smoke-check.mjs',
      'src/server/services/context-budget.ts', 'src/server/services/context-manager.service.ts', 'src/server/routes/websocket.ts',
      'src/server/services/story-summary.service.ts', 'src/server/services/story-summary-context.ts', 'src/server/services/story-memory-extraction.ts',
      'src/server/services/story-memory-provenance.ts', 'src/server/services/story-knowledge.service.ts',
      'src/server/services/story-memory-selection.ts', 'src/server/services/legacy-memory-access.service.ts',
      'src/server/services/memory.service.ts', 'src/server/services/chat.service.ts', 'src/server/routes/intelligence.ts',
      'src/types/context-budget.ts', 'src/client/stores/chat.ts', 'src/client/components/chat/ChatWindow.vue',
      'src/client/i18n/locales/zh-CN.json', 'src/client/i18n/locales/en-US.json', 'dist/server/index.js', 'dist/client/index.html'];
    const sources = await Promise.all(paths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
    const report = { date: new Date().toISOString(), result: 'passed', backend: 'current built server with disposable PostgreSQL/Redis',
      model: 'controlled loopback provider; beta-smoke uses the existing unknown-model 4096/2048 metadata fallback',
      scope: 'real API, WebSocket, browser, database and credit effects; synthetic histories and provider output, not real long-form quality', checks, sources,
      screenshots: ['desktop-overflow.png', 'mobile-critical-overflow.png'] };
    await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    await writeFile(`${root}/latest.json`, JSON.stringify({ evidence, checks: checks.length }, null, 2), { mode: 0o600 });
    console.info(`Story context passed: ${checks.length} real API/browser checks; ${evidence}`);
  } catch (error) {
    await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ result: 'failed', checks, errors, networkFailures }, null, 2), { mode: 0o600 });
    console.error(`Context failure diagnostics: ${evidence}`);
    throw error;
  } finally { await context.close(); }
}
