import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { storyExamples } from '../src/types/story-examples.ts';

export async function checkExplorationRecovery({ browser, base, sql, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const root = '/tmp/squaretable-recovery-evidence';
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
    console.info('Recovery check is waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
    remaining = 100;
  }
  let auth;
  let csrf;
  async function api(path, body, expected = body ? 201 : 200) {
    await waitForBudget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    observeBudget(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${path} status`);
    const result = await response.json();
    return result.data ?? result;
  }
  const invite = `RECOVERY-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
  const card = await api('/characters', { name: '恢复验收合成卡', description: '仅用于隔离故障测试。', cardData: { ...storyExamples[0].cardData, first_mes: '' } });
  const makeStory = () => api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  async function createPage() {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (!new URL(response.url()).pathname.startsWith('/api/v1/')) return;
      observeBudget(response.headers());
      if (response.status() >= 500 || response.status() === 429) networkFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    const wire = { connections: [], sent: [], received: [], dropCommit: false, dropStream: false, dropped: [], freeze: false, closed: [] };
    await page.routeWebSocket(url => url.pathname === '/ws', route => {
      const server = route.connectToServer();
      const connection = { route, server, closed: false };
      wire.connections.push(connection);
      route.onMessage(raw => {
        const event = JSON.parse(raw.toString());
        wire.sent.push(event);
        if (event.type === 'user_message') wire.freeze = false;
        server.send(raw);
      });
      server.onMessage(raw => {
        const event = JSON.parse(raw.toString());
        wire.received.push(event);
        if (connection.closed || wire.freeze) return;
        if (wire.dropStream && ['user_message', 'assistant_message_chunk'].includes(event.type)) {
          route.send(raw);
          wire.dropStream = false;
          connection.closed = true;
          wire.closed.push(Promise.all([route.close({ code: 1012 }), server.close({ code: 1001 })]));
          return;
        }
        if (wire.dropCommit && ['assistant_message_done', 'generation_finished'].includes(event.type)) {
          wire.dropped.push(event.type);
          if (event.type === 'generation_finished') {
            wire.dropCommit = false;
            connection.closed = true;
            wire.closed.push(Promise.all([route.close({ code: 1012 }), server.close({ code: 1001 })]));
          }
          return;
        }
        route.send(raw);
      });
    });
    return { page, wire };
  }
  const purchase = page => page.locator('.story-actions li').filter({ hasText: '花 20 枚钱购买临时通行凭证' });
  const travel = page => page.locator('.story-actions li').filter({ hasText: '沿着小路前往灯塔' });
  const latestInput = wire => wire.sent.filter(event => event.type === 'user_message').at(-1);
  async function settled(chatId, count) {
    await expect.poll(async () => (await sql`SELECT count(*)::int AS count FROM generation_requests WHERE chat_id = ${chatId} AND status = 'completed'`)[0].count, { timeout: 30000 }).toBe(count);
  }
  async function snapshot(chatId) {
    const [state] = await sql`SELECT version, values FROM story_states WHERE chat_id = ${chatId}`;
    const [counts] = await sql`SELECT
      (SELECT count(*)::int FROM messages WHERE chat_id = ${chatId}) AS messages,
      (SELECT count(*)::int FROM story_events WHERE chat_id = ${chatId}) AS events,
      (SELECT count(*)::int FROM generation_requests WHERE chat_id = ${chatId}) AS requests,
      (SELECT count(*)::int FROM credit_ledger WHERE chat_id = ${chatId} AND kind = 'charge') AS charges,
      (SELECT coalesce(sum(amount), 0)::int FROM credit_ledger WHERE chat_id = ${chatId}) AS tokens`;
    return { ...state, ...counts };
  }
  let first;
  let second;
  try {
    first = await createPage();
    const droppedStory = await makeStory();
    await waitForBudget();
    await first.page.goto(`${base}/chat/${droppedStory.id}`);
    await expect(purchase(first.page).getByRole('button')).toBeEnabled();
    const streamsBefore = getStreamCount();
    await waitForBudget();
    first.wire.dropCommit = true;
    await purchase(first.page).getByRole('button').click();
    await settled(droppedStory.id, 1);
    await expect.poll(() => first.wire.connections.length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    await expect(travel(first.page).getByRole('button')).toBeEnabled({ timeout: 20000 });
    await expect(first.page.locator('.message-assistant')).toHaveCount(1);
    await expect(first.page.locator('.message-assistant')).toContainText('The lantern opens a quiet path through the sleeping garden.');
    await expect(first.page.locator('.generation-error')).toHaveCount(0);
    assert.deepEqual(first.wire.dropped, ['assistant_message_done', 'generation_finished']);
    assert.equal(first.wire.sent.filter(event => event.type === 'user_message').length, 1);
    assert.equal(getStreamCount() - streamsBefore, 1);
    const committed = await snapshot(droppedStory.id);
    assert.equal(committed.version, 1);
    assert.equal(committed.values.coins, 100);
    assert.equal(committed.values.permit, true);
    assert.equal(committed.messages, 2);
    assert.equal(committed.events, 1);
    assert.equal(committed.charges, 1);
    assert.equal(committed.tokens, -120);
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    checks.push({ case: 'EX-09 committed turn acknowledgements lost', result: 'passed', dropped: first.wire.dropped, sends: 1, providerStreams: 1, persisted: committed });

    const replay = latestInput(first.wire);
    first.wire.connections.at(-1).server.send(JSON.stringify(replay));
    await expect.poll(() => first.wire.received.some(event => event.type === 'error' && event.data.requestId === replay.data.clientMessageId && event.data.code === 'GENERATION_ALREADY_ACCEPTED')).toBe(true);
    assert.deepEqual(await snapshot(droppedStory.id), committed);
    assert.equal(getStreamCount() - streamsBefore, 1);
    checks.push({ case: 'EX-09 explicit replay after reconnect', result: 'passed', stateEventsMessagesAndChargesUnchanged: true, providerStreamsUnchanged: true });

    const shared = await makeStory();
    await waitForBudget();
    await first.page.goto(`${base}/chat/${shared.id}`);
    second = await createPage();
    await waitForBudget();
    await second.page.goto(`${base}/chat/${shared.id}`);
    await expect(purchase(first.page).getByRole('button')).toBeEnabled();
    await expect(purchase(second.page).getByRole('button')).toBeEnabled();
    await second.page.locator('.message-input textarea').fill('这段草稿要保留。');
    await waitForBudget();
    second.wire.freeze = true;
    await purchase(first.page).getByRole('button').click();
    await settled(shared.id, 1);
    const beforeConflict = await snapshot(shared.id);
    const streamsAtConflict = getStreamCount();
    await waitForBudget();
    await purchase(second.page).getByRole('button').click();
    const stale = latestInput(second.wire);
    await expect(second.page.locator('.generation-error').filter({ hasText: '这条行动已不适用于当前剧情状态' })).toBeVisible();
    await expect(second.page.locator('.generation-retry')).toHaveCount(0);
    await expect(second.page.locator('.message-input textarea')).toHaveValue('这段草稿要保留。');
    await expect(travel(second.page).getByRole('button')).toBeEnabled();
    assert.equal(stale.data.storyAction.expectedVersion, 0);
    await expect.poll(() => second.wire.received.some(event => event.type === 'generation_finished' && event.data.requestId === stale.data.clientMessageId && event.data.retryable === false)).toBe(true);
    assert.deepEqual(await snapshot(shared.id), beforeConflict);
    assert.equal(getStreamCount(), streamsAtConflict);
    checks.push({ case: 'EX-10 stale action from a delayed second tab', result: 'passed', draftPreserved: true, unsafeRetryHidden: true, rejectedBeforeGenerationOrCharge: true });

    await waitForBudget();
    await travel(second.page).getByRole('button').click();
    await settled(shared.id, 2);
    const confirmed = latestInput(second.wire);
    assert.equal(confirmed.data.storyAction.expectedVersion, 1);
    assert.notEqual(confirmed.data.clientMessageId, stale.data.clientMessageId);
    const afterConfirmation = await snapshot(shared.id);
    assert.equal(afterConfirmation.version, 2);
    assert.equal(afterConfirmation.values.location, 'lighthouse');
    assert.equal(afterConfirmation.values.coins, 100);
    assert.equal(afterConfirmation.events, 2);
    assert.equal(afterConfirmation.messages, 4);
    assert.equal(afterConfirmation.charges, 2);
    await waitForBudget();
    await second.page.reload();
    await expect(second.page.locator('.story-dossier header')).toContainText('第 2 轮');
    await expect(second.page.locator('.message-assistant')).toHaveCount(2);
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    assert.deepEqual(await snapshot(droppedStory.id), committed);
    checks.push({ case: 'EX-10 explicit fresh action and reload', result: 'passed', newRequestAndCurrentVersion: true, otherStoryUnchanged: true, persisted: afterConfirmation });

    await first.page.close();
    const beforeSlow = getStreamCount();
    const eventsBeforeSlow = second.wire.received.length;
    const sendsBeforeSlow = second.wire.sent.filter(event => event.type === 'user_message').length;
    await waitForBudget();
    second.wire.dropStream = true;
    await second.page.locator('.message-input textarea').fill('RECOVERY_SLOW：停下来观察周围。');
    await second.page.locator('.message-input textarea').press('Enter');
    await settled(shared.id, 3);
    await expect.poll(() => second.wire.received.slice(eventsBeforeSlow).some(event => event.type === 'generation_state' && event.data.status === 'running'), { timeout: 15000 }).toBe(true);
    await expect(second.page.locator('.message-assistant')).toHaveCount(3);
    await expect(second.page.locator('.message-assistant').last()).toContainText('The lantern opens a quiet path through the sleeping garden.');
    await expect(second.page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    assert.equal(getStreamCount() - beforeSlow, 1);
    assert.equal(second.wire.sent.filter(event => event.type === 'user_message').length - sendsBeforeSlow, 1);
    const afterStreamRecovery = await snapshot(shared.id);
    assert.equal(afterStreamRecovery.messages, 6);
    assert.equal(afterStreamRecovery.events, 3);
    assert.equal(afterStreamRecovery.charges, 3);
    assert.equal(afterStreamRecovery.values.coins, 100);
    checks.push({ case: 'EX-09 reconnect while generation is still running', result: 'passed', completeSavedReplyDisplayed: true, automaticResends: 0, providerStreams: 1, persisted: afterStreamRecovery });

    const truncatedCard = await api('/characters', { name: '截断验收合成卡', cardData: {
      ...storyExamples[0].cardData, first_mes: '', system_prompt: `${storyExamples[0].cardData.system_prompt}\nRECOVERY_TRUNCATED`,
    } });
    const truncatedStory = await api('/chats', { characterId: truncatedCard.id, clientRequestId: randomUUID() });
    const beforeTruncated = await snapshot(truncatedStory.id);
    const streamsBeforeTruncated = getStreamCount();
    await waitForBudget();
    await second.page.goto(`${base}/chat/${truncatedStory.id}`);
    await purchase(second.page).getByRole('button').click();
    await expect.poll(async () => (await sql`SELECT count(*)::int AS count FROM generation_requests
      WHERE chat_id = ${truncatedStory.id} AND status = 'failed' AND error_code = 'GENERATION_OUTPUT_TRUNCATED'`)[0].count).toBe(1);
    await expect(second.page.locator('.generation-error')).toContainText('这段回复达到长度上限');
    await expect(second.page.locator('.generation-error').getByRole('button', { name: /重试/ })).toHaveCount(0);
    await expect(second.page.locator('.message-assistant')).toContainText('你伸手接过尚未');
    const afterTruncated = await snapshot(truncatedStory.id);
    assert.deepEqual(afterTruncated.values, beforeTruncated.values);
    assert.equal(afterTruncated.version, 1);
    assert.equal(afterTruncated.messages, 2);
    assert.equal(afterTruncated.charges, 1);
    assert.equal(afterTruncated.tokens, -120);
    assert.equal(getStreamCount() - streamsBeforeTruncated, 1);
    const [interrupted] = await sql`SELECT status FROM story_events WHERE chat_id = ${truncatedStory.id}`;
    assert.equal(interrupted.status, 'interrupted');
    const [derived] = await sql`SELECT
      (SELECT count(*)::int FROM story_memory_jobs WHERE chat_id = ${truncatedStory.id}) AS jobs,
      (SELECT coalesce(sum(cardinality(event_ids)), 0)::int FROM story_memory_progress WHERE chat_id = ${truncatedStory.id}) AS progress,
      (SELECT count(*)::int FROM character_memories WHERE source_chat_id = ${truncatedStory.id}) AS memories`;
    assert.deepEqual(derived, { jobs: 0, progress: 0, memories: 0 });
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    await waitForBudget();
    await second.page.reload();
    await expect(second.page.locator('.message-assistant')).toContainText('你伸手接过尚未');
    assert.deepEqual((await snapshot(truncatedStory.id)).values, beforeTruncated.values);
    await second.page.screenshot({ path: `${evidence}/truncated-response.png`, fullPage: true });
    checks.push({ case: 'EX-08 output limit keeps an interrupted fragment without confirming a purchase', result: 'passed',
      confirmedStateUnchanged: true, noMemoryProgress: true, noUnsafeRetry: true, chargedOnce: true,
      preservedAfterReload: true, providerStreams: 1, persisted: afterTruncated });
    assert.deepEqual(errors, []);
    assert.deepEqual(networkFailures, []);
    const paths = ['scripts/exploration-recovery-check.mjs', 'scripts/beta-smoke-check.mjs', 'src/server/routes/websocket.ts', 'src/client/stores/chat.ts', 'src/client/composables/useStoryState.ts', 'src/server/services/story-state.service.ts', 'dist/server/index.js', 'dist/client/index.html'];
    const sources = await Promise.all(paths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
    const report = { date: new Date().toISOString(), result: 'passed', database: 'disposable PostgreSQL', backend: 'current built server', model: 'controlled local provider; not real narrative quality', networkInterception: 'real WebSocket server; drop commit acknowledgements and delay other-tab frames; no success responses fabricated', checks, sources };
    await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    await writeFile(`${root}/latest.json`, JSON.stringify({ evidence, checks: checks.length }, null, 2), { mode: 0o600 });
    console.info(`Exploration recovery passed: ${checks.length} real API/browser failure checks; ${evidence}`);
  } catch (error) {
    await first?.page.screenshot({ path: `${evidence}/first-failure.png`, fullPage: true }).catch(() => {});
    await second?.page.screenshot({ path: `${evidence}/second-failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ result: 'failed', checks, errors, networkFailures }, null, 2), { mode: 0o600 });
    console.error(`Recovery failure diagnostics: ${evidence}`);
    throw error;
  } finally {
    await context.close();
    await Promise.allSettled([...(first?.wire.closed ?? []), ...(second?.wire.closed ?? [])]);
  }
}
