import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createClient } from 'redis';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { expect } from '@playwright/test';
import WebSocket from 'ws';

export async function checkStoryEffects({ browser, base, sql, auth, csrf, restartServer, getStreamCount, serviceEnvironment }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const evidence = `/tmp/squaretable-story-effects/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const sockets = [];
  const cache = createClient({ url: serviceEnvironment.REDIS_URL });
  await cache.connect();
  const connection = postgres(serviceEnvironment.DATABASE_URL, { max: 5 });
  const database = drizzle(connection);
  Object.assign(process.env, { JWT_SECRET: serviceEnvironment.JWT_SECRET, JWT_REFRESH_SECRET: serviceEnvironment.JWT_REFRESH_SECRET });
  const loader = register({ namespace: `effects-${randomUUID()}` });
  const legacy = await loader.import('../src/server/services/legacy-variables.service.ts', import.meta.url);
  const { closeRedis } = await loader.import('../src/core/redis.ts', import.meta.url);
  let remaining = 100;
  let reset = 0;
  function observeBudget(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    const nextRemaining = Number(headers['x-ratelimit-remaining']);
    remaining = nextReset > reset + 2000 ? nextRemaining : Math.min(remaining, nextRemaining);
    reset = Math.max(reset, nextReset);
  }
  async function waitBudget() {
    if (remaining < 45) {
      console.info('State effects check waiting for normal API rate limit');
      while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
      remaining = 100;
    }
  }
  async function api(path, body, expected = body ? 201 : 200) {
    await waitBudget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    observeBudget(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `State effects API ${path}`);
    const result = await response.json();
    return result.data ?? result;
  }
  async function socketFor(chatId) {
    const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(auth.tokens.accessToken)}`);
    sockets.push(socket);
    const events = [];
    socket.on('message', raw => events.push(JSON.parse(raw.toString())));
    const wait = async predicate => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const event = events.find(predicate);
        if (event) return event;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`State effects socket timed out: ${events.map(event => `${event.type}:${event.data?.code ?? event.data?.status ?? ''}`).join(',')}`);
    };
    const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
    await wait(event => event.type === 'connected');
    send('join_chat', { chatId });
    await wait(event => event.type === 'generation_state');
    return { events, wait, send, socket };
  }
  async function snapshot(chatId) {
    const [row] = await sql`SELECT
      (SELECT "values" FROM legacy_chat_variables WHERE chat_id = ${chatId}) AS variables,
      (SELECT count(*)::int FROM messages WHERE chat_id = ${chatId} AND role = 'assistant') AS replies,
      (SELECT count(*)::int FROM credit_ledger WHERE chat_id = ${chatId} AND kind = 'charge') AS charges,
      (SELECT count(*)::int FROM generation_requests WHERE chat_id = ${chatId}) AS requests`;
    return row;
  }
  let context;
  try {
    const budgetResponse = await fetch(`${base}/api/v1/credits/balance`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId }, signal: AbortSignal.timeout(20000) });
    observeBudget(Object.fromEntries(budgetResponse.headers));
    assert.ok(budgetResponse.ok || budgetResponse.status === 429, 'Unable to inspect the normal API budget');
    await budgetResponse.arrayBuffer();
    await waitBudget();
    const cards = [];
    for (const name of ['FIRST', 'SECOND']) cards.push(await api('/characters', {
      name: `04C ${name}`, description: `EFFECTS_CARD EFFECTS_${name}`, cardData: { first_mes: '', description: `EFFECTS_CARD EFFECTS_${name}` },
    }));
    const makeStory = async (group = false, old = true) => {
      const characterIds = group ? cards.map(card => card.id) : [cards[0].id];
      const story = old
        ? (await sql`INSERT INTO chats (tenant_id, user_id, character_id, title, metadata) VALUES (${auth.user.tenantId}, ${auth.user.id}, ${cards[0].id}, '04C legacy fixture', ${sql.json({ groupStrategy: 'all' })}) RETURNING id`)[0]
        : await api('/chats', { characterIds, clientRequestId: randomUUID(), metadata: { groupStrategy: 'all' } });
      if (old) for (const [sortOrder, characterId] of characterIds.entries()) {
        await sql`INSERT INTO chat_characters (chat_id, character_id, sort_order) VALUES (${story.id}, ${characterId}, ${sortOrder})`;
      }
      await cache.set(`chatvar:${story.id}`, JSON.stringify({ coins: '100', obsolete: 'remove', retained: 'seed' }));
      return story;
    };
    const atomic = await makeStory();
    const body = '<VariableInsert>{"coins":"90","pass":"yes"}</VariableInsert><VariableEdit>{"place":"pier"}</VariableEdit><VariableDelete>["obsolete"]</VariableDelete>';
    await sql.unsafe(`CREATE FUNCTION effects_fail_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content LIKE '%EFFECTS_ROLLBACK%' THEN RAISE EXCEPTION 'controlled message failure'; END IF; RETURN NEW; END $$`);
    await sql.unsafe('CREATE TRIGGER effects_fail_message BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION effects_fail_message()');
    await assert.rejects(legacy.saveLegacyAssistantMessage({ chatId: atomic.id, role: 'assistant', content: `${body} EFFECTS_ROLLBACK` }, 'atomic-failure', database));
    assert.deepEqual(await snapshot(atomic.id), { variables: null, replies: 0, charges: 0, requests: 0 });
    await sql.unsafe('DROP TRIGGER effects_fail_message ON messages');
    await sql.unsafe('DROP FUNCTION effects_fail_message()');
    const duplicate = { chatId: atomic.id, role: 'assistant', content: body };
    const commits = await Promise.all(Array.from({ length: 4 }, () => legacy.saveLegacyAssistantMessage(duplicate, 'same-commit', database)));
    assert.equal(new Set(commits.map(message => message.id)).size, 1);
    const committed = await snapshot(atomic.id);
    assert.deepEqual(committed.variables, { coins: '90', pass: 'yes', place: 'pier', retained: 'seed' });
    assert.equal(committed.replies, 1);
    await Promise.all(Array.from({ length: 8 }, () => legacy.mutateLegacyVariables(atomic.id, values => { values.count = String(Number(values.count ?? 0) + 1); }, database)));
    assert.equal((await legacy.getLegacyVariables(atomic.id, database)).count, '8');
    await legacy.saveLegacyAssistantMessage(duplicate, 'same-commit', database);
    assert.equal((await legacy.getLegacyVariables(atomic.id, database)).count, '8');
    checks.push({ case: 'atomic legacy response, rollback after variable write, concurrent idempotent commit and serialized increments', result: 'passed' });

    const malformed = await makeStory();
    await cache.set(`chatvar:${malformed.id}`, 'broken-json');
    await assert.rejects(legacy.saveLegacyAssistantMessage({ chatId: malformed.id, role: 'assistant', content: body }, 'bad-cache', database));
    assert.equal((await snapshot(malformed.id)).replies, 0);
    assert.equal((await snapshot(malformed.id)).variables, null);
    await cache.set(`chatvar:${malformed.id}`, JSON.stringify({ coins: '100' }));
    await legacy.saveLegacyAssistantMessage({ chatId: malformed.id, role: 'assistant', content: body }, 'bad-cache', database);
    checks.push({ case: 'invalid legacy cache fails closed and recovers without partial data', result: 'passed' });

    const unavailable = await makeStory();
    await cache.sendCommand(['ACL', 'SETUSER', 'default', '-get']);
    try {
      await assert.rejects(legacy.saveLegacyAssistantMessage({ chatId: unavailable.id, role: 'assistant', content: body }, 'cache-failure', database));
      assert.equal((await snapshot(unavailable.id)).replies, 0);
      assert.equal((await snapshot(unavailable.id)).variables, null);
    } finally {
      await cache.sendCommand(['ACL', 'SETUSER', 'default', '+get']);
    }
    await legacy.saveLegacyAssistantMessage({ chatId: unavailable.id, role: 'assistant', content: body }, 'cache-failure', database);
    await sql`DELETE FROM chats WHERE id = ${unavailable.id}`;
    assert.equal((await sql`SELECT count(*)::int AS count FROM legacy_chat_variables WHERE chat_id = ${unavailable.id}`)[0].count, 0);
    await assert.rejects(legacy.getLegacyVariables(unavailable.id, database));
    checks.push({ case: 'Redis read failure rolls back, retry succeeds, deletion cascades and stale cache cannot resurrect a story', result: 'passed' });

    const http = await makeStory();
    const httpMessage = await api(`/chats/${http.id}/messages`, { role: 'assistant', content: body, extra: { legacyResponseKey: 'untrusted-client-key' } });
    assert.equal(httpMessage.extra.legacyResponseKey, undefined);
    assert.equal((await snapshot(http.id)).variables.coins, '90');
    await api(`/chats/${http.id}/messages`, { role: 'assistant', content: '<VariableEdit>{"coins":"0"}</VariableEdit>', extra: { stateStatus: 'interrupted' } });
    assert.equal((await snapshot(http.id)).variables.coins, '90');
    const openingCard = await api('/characters', { name: '04C native opening', cardData: { first_mes: body } });
    const opening = await api('/chats', { characterId: openingCard.id, clientRequestId: randomUUID() });
    await api(`/chats/${opening.id}/messages`, { role: 'assistant', content: body });
    assert.equal((await snapshot(opening.id)).variables, null);
    checks.push({ case: 'HTTP legacy complete/interrupted openings and frozen-story ERA isolation', result: 'passed' });

    const single = await makeStory();
    const wire = await socketFor(single.id);
    const requestId = randomUUID();
    const input = { chatId: single.id, content: 'EFFECTS_CONTINUE', clientMessageId: requestId };
    const before = getStreamCount();
    wire.send('user_message', input);
    assert.equal((await wire.wait(event => event.type === 'generation_finished' && event.data.requestId === requestId)).data.status, 'completed');
    const singleState = await snapshot(single.id);
    assert.equal(singleState.variables.coins, '90');
    assert.equal(singleState.replies, 1);
    assert.equal(singleState.charges, 1);
    assert.ok(wire.events.find(event => event.type === 'assistant_message_done').data.variablesChanged);
    wire.send('user_message', input);
    await wire.wait(event => event.type === 'error' && event.data.code === 'GENERATION_ALREADY_ACCEPTED');
    assert.deepEqual(await snapshot(single.id), singleState);
    assert.equal(getStreamCount() - before, 1);
    await cache.del(`chatvar:${single.id}`);
    await restartServer();
    assert.equal((await api(`/chats/${single.id}/variables`)).variables.coins, '90');
    checks.push({ case: 'legacy WebSocket commit, replay, cache removal and process restart', result: 'passed', snapshot: singleState });

    for (const scenario of ['complete', 'fail', 'save-fail', 'derived-fail', 'stop', 'truncated', 'versioned']) {
      const story = await makeStory(true, scenario !== 'versioned');
      if (scenario === 'save-fail' || scenario === 'derived-fail') {
        await sql.unsafe('CREATE SEQUENCE effects_fault_count');
        await sql.unsafe(`CREATE FUNCTION effects_group_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${scenario === 'save-fail' ? "IF NEW.role = 'assistant' AND NEW.content LIKE 'Second reply.%' THEN" : ''} PERFORM nextval('effects_fault_count'); RAISE EXCEPTION 'controlled group persistence failure'; ${scenario === 'save-fail' ? 'END IF;' : ''} RETURN NEW; END $$`);
        await sql.unsafe(`CREATE TRIGGER effects_group_fault BEFORE INSERT ON ${scenario === 'save-fail' ? 'messages' : 'character_emotions'} FOR EACH ROW EXECUTE FUNCTION effects_group_fault()`);
      }
      const group = await socketFor(story.id);
      const groupRequest = randomUUID();
      const text = scenario === 'fail' ? 'EFFECTS_FAIL' : scenario === 'stop' ? 'EFFECTS_SLOW' : scenario === 'truncated' ? 'RECOVERY_TRUNCATED' : 'EFFECTS_CONTINUE';
      const streams = getStreamCount();
      const groupInput = { chatId: story.id, content: text, clientMessageId: groupRequest, mentionedCharacterIds: cards.map(card => card.id) };
      group.send('user_message', groupInput);
      if (scenario === 'stop') {
        await group.wait(event => event.type === 'assistant_message_chunk' && event.data.characterId === cards[1].id && event.data.chunk.includes('VariableInsert'));
        group.send('abort_generation', { chatId: story.id, requestId: groupRequest });
      }
      const finish = await group.wait(event => event.type === 'generation_finished' && event.data.requestId === groupRequest);
      assert.equal(finish.data.status, scenario === 'stop' ? 'stopped' : ['fail', 'save-fail', 'truncated'].includes(scenario) ? 'failed' : 'completed');
      const state = await snapshot(story.id);
      assert.equal(state.charges, ['fail', 'truncated'].includes(scenario) ? 1 : 2);
      const replies = await sql`SELECT character_id, content, extra FROM messages WHERE chat_id = ${story.id} AND role = 'assistant' ORDER BY id`;
      assert.equal(replies.length, ['fail', 'save-fail', 'truncated'].includes(scenario) ? 1 : 2);
      assert.equal(replies[0].character_id, cards[0].id);
      if (scenario === 'versioned') assert.equal(state.variables, null);
      else assert.equal(state.variables.coins, ['complete', 'derived-fail'].includes(scenario) ? '80' : scenario === 'truncated' ? '100' : '90');
      if (scenario === 'stop' || scenario === 'truncated') assert.equal(replies.at(-1).extra.stateStatus, 'interrupted');
      assert.equal((await api('/credits/balance')).heldTokens, 0);
      const streamTotal = getStreamCount();
      group.send('user_message', groupInput);
      await group.wait(event => event.type === 'error' && event.data.code === 'GENERATION_ALREADY_ACCEPTED');
      assert.deepEqual(await snapshot(story.id), state);
      assert.equal(getStreamCount(), streamTotal);
      if (scenario === 'save-fail' || scenario === 'derived-fail') {
        const [fault] = await sql.unsafe('SELECT last_value, is_called FROM effects_fault_count');
        assert.equal(fault.is_called, true);
        assert.ok(Number(fault.last_value) >= (scenario === 'derived-fail' ? 2 : 1));
        await sql.unsafe(`DROP TRIGGER effects_group_fault ON ${scenario === 'save-fail' ? 'messages' : 'character_emotions'}`);
        await sql.unsafe('DROP FUNCTION effects_group_fault()');
        await sql.unsafe('DROP SEQUENCE effects_fault_count');
      }
      checks.push({ case: `group ${scenario}, persisted character boundaries, replay and released holds`, result: 'passed', snapshot: state, providerStreams: streamTotal - streams });
    }

    const groupStory = await makeStory(true);
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ tokens, user }) => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
    }, auth);
    const page = await context.newPage();
    const errors = [];
    const networkFailures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (!new URL(response.url()).pathname.startsWith('/api/v1/')) return;
      observeBudget(response.headers());
      if (response.status() === 429 || response.status() >= 500) networkFailures.push(response.status());
    });
    let dropped = false;
    let disconnected = false;
    let connections = 0;
    const transports = [];
    const sent = [];
    const received = [];
    await page.routeWebSocket(url => url.pathname === '/ws', route => {
      connections++;
      const server = route.connectToServer();
      transports.push({ route, server });
      route.onMessage(raw => { sent.push(JSON.parse(raw.toString())); server.send(raw); });
      server.onMessage(raw => {
        const event = JSON.parse(raw.toString());
        received.push(event);
        if (event.type === 'assistant_message_done' && event.data.characterId === cards[0].id && !dropped) { dropped = true; return; }
        if (event.type === 'assistant_message_chunk' && event.data.characterId === cards[1].id && !disconnected) {
          disconnected = true;
          route.close({ code: 1012 });
          server.close({ code: 1001 });
          return;
        }
        route.send(raw);
      });
    });
    await waitBudget();
    await page.goto(`${base}/chat/${groupStory.id}`);
    const composer = page.locator('.message-input textarea');
    await expect(composer).toBeEnabled();
    await composer.fill('EFFECTS_SLOW');
    await composer.press('Enter');
    await expect.poll(() => connections, { timeout: 30000 }).toBeGreaterThan(1);
    await expect(page.locator('.message-assistant')).toHaveCount(2, { timeout: 30000 });
    await expect(page.locator('.message-assistant').nth(0)).toContainText('First reply.');
    await expect(page.locator('.message-assistant').nth(1)).toContainText('Second reply.');
    await expect(page.locator('.message-assistant').nth(1)).toContainText('Complete.');
    assert.equal(sent.filter(event => event.type === 'user_message').length, 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${evidence}/group-recovered.png`, fullPage: true });
    checks.push({ case: 'production browser recovers both group replies after lost first confirmation and second stream disconnect', result: 'passed', sends: 1, screenshot: 'group-recovered.png' });
    await waitBudget();
    await page.reload();
    await expect(page.locator('.message-assistant')).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${evidence}/group-mobile.png`, fullPage: true });
    checks.push({ case: 'reloaded group history remains ordered on desktop and mobile', result: 'passed', screenshot: 'group-mobile.png' });
    const pages = [];
    page.on('response', async response => {
      const url = new URL(response.url());
      if (url.pathname === `/api/v1/chats/${groupStory.id}/messages` && url.searchParams.has('after') && response.ok()) {
        const result = await response.json();
        pages.push({ after: Number(url.searchParams.get('after')), ids: result.data.map(message => message.id) });
      }
    });
    const restored = await sql`INSERT INTO messages ${sql(Array.from({ length: 105 }, (_, index) => ({ chat_id: groupStory.id, role: 'assistant', character_id: cards[index % 2].id, content: `Recovered history ${index}` })), 'chat_id', 'role', 'character_id', 'content')} RETURNING id`;
    const oldest = (await sql`SELECT id FROM messages WHERE chat_id = ${groupStory.id} ORDER BY id LIMIT 1`)[0].id;
    const zeroPage = await api(`/chats/${groupStory.id}/messages?after=0&limit=50`);
    assert.equal(zeroPage[0].id, Number(oldest));
    const streamsBeforeRecovery = getStreamCount();
    await waitBudget();
    const current = transports.at(-1);
    await Promise.all([current.route.close({ code: 1012 }), current.server.close({ code: 1001 })]);
    await expect.poll(() => pages.length, { timeout: 30000 }).toBeGreaterThanOrEqual(3);
    await expect.poll(() => new Set(pages.flatMap(item => item.ids)).size).toBe(105);
    assert.deepEqual(pages.flatMap(item => item.ids), restored.map(message => Number(message.id)));
    await expect(page.locator('.message-assistant').filter({ hasText: 'Recovered history 104' })).toBeVisible();
    assert.equal(getStreamCount(), streamsBeforeRecovery);
    checks.push({ case: '105 missing historical replies recover across three forward pages; zero cursor reads the oldest page', result: 'passed', recovered: 105, pages: 3, extraProviderCalls: 0 });
    const observerStory = await makeStory(true);
    dropped = false;
    disconnected = true;
    await waitBudget();
    await page.goto(`${base}/chat/${observerStory.id}`);
    await expect.poll(() => received.some(event => event.type === 'generation_state' && event.data.chatId === observerStory.id)).toBe(true);
    const observerWire = await socketFor(observerStory.id);
    const observerRequest = randomUUID();
    observerWire.send('user_message', { chatId: observerStory.id, content: 'EFFECTS_CONTINUE', clientMessageId: observerRequest, mentionedCharacterIds: cards.map(card => card.id) });
    await observerWire.wait(event => event.type === 'generation_finished' && event.data.requestId === observerRequest);
    await expect(page.locator('.message-assistant')).toHaveCount(2);
    await expect(page.locator('.message-assistant').nth(0)).toContainText('First reply.');
    await expect(page.locator('.message-assistant').nth(1)).toContainText('Second reply.');
    assert.ok(dropped);
    assert.equal(sent.filter(event => event.type === 'user_message').length, 1);
    await page.screenshot({ path: `${evidence}/observer-recovered.png`, fullPage: true });
    checks.push({ case: 'observer tab recovers missing first acknowledgement using the originating request identity, without disconnect or resend', result: 'passed', screenshot: 'observer-recovered.png' });
    assert.deepEqual(networkFailures, []);
    assert.deepEqual(errors, []);
    const sourceHashes = {};
    for (const file of ['src/server/services/legacy-variables.service.ts', 'src/server/services/chat-variable.service.ts', 'src/server/routes/websocket.ts', 'src/server/routes/chats.ts', 'src/server/services/chat.service.ts', 'src/db/repositories/message.repository.ts', 'src/client/stores/chat.ts', 'src/client/services/chat.api.ts', 'src/db/beta-migrations/0010_legacy_chat_variables.sql', 'dist/server/index.js', 'dist/client/index.html']) {
      sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
    const report = { scope: 'EXP-04C', provider: 'local controlled, no paid calls', checks, passed: true, sourceHashes, runtime: new Date().toISOString() };
    await writeFile(`${evidence}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.info(`State effects integration passed: ${checks.length} groups; ${evidence}/report.json`);
  } finally {
    for (const socket of sockets) socket.terminate();
    if (context) await context.close();
    await cache.quit();
    await closeRedis();
    await connection.end();
    await loader.unregister();
  }
}
