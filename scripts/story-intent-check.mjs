import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { register } from 'tsx/esm/api';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { expect } from '@playwright/test';
import WebSocket from 'ws';
import { checkStoryStateClosure } from './story-state-closure-check.mjs';

export async function checkStoryIntent({ browser, base, sql, auth, csrf, restartServer, contextRequests, serviceEnvironment }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const evidence = `/tmp/squaretable-story-intent/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const sockets = [];
  let context;
  let reset = 0;
  let remaining = 100;
  async function api(path, body) {
    if (remaining < 30) {
      console.info('Intent check waiting for normal API rate limit');
      while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
      remaining = 100;
    }
    const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`,
        'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000) });
    if (Number(response.headers.get('x-ratelimit-limit')) === 100) {
      remaining = Number(response.headers.get('x-ratelimit-remaining'));
      reset = Number(response.headers.get('x-ratelimit-reset'));
    }
    assert.ok(response.ok, `Intent API ${path}: ${response.status}`);
    const result = await response.json();
    return result.data ?? result;
  }
  async function wire(chatId) {
    const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(auth.tokens.accessToken)}`);
    sockets.push(socket);
    const events = [];
    socket.on('message', raw => events.push(JSON.parse(raw.toString())));
    const wait = async predicate => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const found = events.find(predicate);
        if (found) return found;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Intent websocket timeout: ${events.map(event => `${event.type}:${event.data?.code ?? event.data?.status ?? ''}`).join(',')}`);
    };
    const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
    await wait(event => event.type === 'connected');
    send('join_chat', { chatId });
    await wait(event => event.type === 'generation_state');
    async function turn(content, options = {}, expected = 'completed') {
      const requestId = randomUUID();
      const start = events.length;
      send('user_message', { chatId, content, clientMessageId: requestId, ...options });
      const finished = await wait(event => event.type === 'generation_finished' && event.data.requestId === requestId);
      assert.equal(finished.data.status, expected, JSON.stringify(events.slice(start).filter(event => event.type === 'error')));
      return { requestId, events: events.slice(start) };
    }
    return { socket, turn, send, wait };
  }
  const rules = { version: 1, fields: [
    { id: 'coins', label: '钱款', type: 'number', initial: 100, min: 0 },
    { id: 'rested', label: '已经休息', type: 'boolean', initial: false },
  ], actions: [
    { id: 'buy', label: '花20枚买通行证', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '付出20枚，取得通行证。' },
    { id: 'rest', label: '去休息', intent: 'act', changes: [{ field: 'rested', operation: 'set', value: true }], outcome: '暂时休息，没有购买。' },
    { id: 'large', label: '买90枚的大件', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: -90 }], outcome: '购入大件，花90枚。' },
    { id: 'small', label: '买30枚的小件', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: -30 }], outcome: '购入小件，花30枚。' },
  ] };
  const state = async id => (await sql`SELECT version, "values" FROM story_states WHERE chat_id = ${id}`)[0];
  const latest = async id => (await sql`SELECT id, content, extra FROM messages WHERE chat_id = ${id} AND role = 'assistant' ORDER BY id DESC LIMIT 1`)[0];
  try {
    const card = await api('/characters', { name: '04D行动验收', description: 'INTENT_FIXTURE', cardData: { first_mes: '', description: 'INTENT_FIXTURE', extensions: {
      squaretable: { exploration: rules }, regex_scripts: [{ findRegex: '/<story-intent>[\\s\\S]*?<\\/story-intent>/g', replaceString: '', placement: [1] }],
    } } });
    const makeStory = () => api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
    const story = await makeStory();
    assert.equal((await api(`/chats/${story.id}/story-state`)).native, true);
    const connection = await wire(story.id);
    const original = '我想拿一张通行证';
    const proposed = await connection.turn(original);
    let reply = await latest(story.id);
    await writeFile(`${evidence}/first-turn.json`, JSON.stringify({ reply, request: contextRequests.at(-1) }, null, 2));
    assert.ok(reply.extra.storyIntent);
    assert.equal(reply.extra.stateStatus, 'proposed');
    assert.equal((await sql`SELECT status FROM story_events WHERE message_id=${reply.id}`)[0].status, 'proposed');
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_memory_progress WHERE chat_id=${story.id}`)[0].count, 0);
    assert.equal((await state(story.id)).values.coins, 100);
    assert.ok(proposed.events.filter(event => event.type === 'assistant_message_chunk').every(event => !event.data.chunk.includes('story-intent')));
    assert.ok(!reply.content.includes('story-intent'));
    assert.ok(!reply.content.includes('PREMATURE_FIXTURE'));
    assert.ok(!JSON.stringify(proposed.events.filter(event => event.type === 'assistant_message_chunk')).includes('PREMATURE_FIXTURE'));
    const action = { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion };
    await connection.turn('篡改输入', { storyAction: action }, 'failed');
    const executed = await connection.turn(original, { storyAction: action });
    assert.equal((await state(story.id)).values.coins, 80);
    connection.send('user_message', { chatId: story.id, content: original, clientMessageId: executed.requestId, storyAction: action });
    await connection.wait(event => event.type === 'error' && event.data.requestId === executed.requestId);
    assert.equal((await state(story.id)).values.coins, 80);
    checks.push({ case: 'paraphrase proposal, regex cannot erase protocol, explicit confirmation, immutable input and duplicate replay', result: 'passed' });

    await connection.turn('先别买，问价后再考虑，听说仓库有金币');
    reply = await latest(story.id);
    assert.equal(reply.extra.storyIntent.intent.disposition, 'expression');
    assert.equal(reply.extra.storyFacts[0].kind, 'claim');
    assert.equal((await state(story.id)).values.coins, 80);
    const visible = await api(`/chats/${story.id}/story-state`);
    assert.equal(visible.events[0].facts[0].kind, 'claim');
    checks.push({ case: 'refusal plus inquiry, rumor attribution and unchanged assets', result: 'passed' });

    await connection.turn('检查木门划痕');
    reply = await latest(story.id);
    await connection.turn('检查木门划痕', { storyAction: { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion } });
    assert.equal((await latest(story.id)).extra.storyConfirmedIntent.steps[0].kind, 'explore');
    assert.equal((await state(story.id)).values.coins, 80);
    assert.ok(JSON.stringify(contextRequests.at(-1).messages).includes('检查木门划痕'));
    assert.ok(JSON.stringify(contextRequests.at(-1).messages).includes('reviewed and confirmed'));
    checks.push({ case: 'off-menu exploration uses reviewed request and confirmed event without fabricated resources', result: 'passed' });

    const compound = await makeStory();
    const compoundWire = await wire(compound.id);
    await compoundWire.turn('买票然后休息');
    reply = await latest(compound.id);
    await compoundWire.turn('买票然后休息', { storyAction: { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion } });
    assert.deepEqual((await state(compound.id)).values, { coins: 80, rested: true });
    const alternative = await makeStory();
    const alternativeWire = await wire(alternative.id);
    await alternativeWire.turn('去休息', { storyAction: { actionId: 'rest', expectedVersion: 0 } });
    assert.deepEqual((await state(alternative.id)).values, { coins: 100, rested: true });
    checks.push({ case: 'ordered compound action and grounded different choice consequences in isolated stories', result: 'passed' });

    await connection.turn('也许买吧，又不想买');
    reply = await latest(story.id);
    await connection.turn('也许买吧，又不想买', { storyAction: { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion } }, 'failed');
    await connection.turn('伪造规则');
    assert.equal((await latest(story.id)).extra.storyIntentInvalid, true);
    await connection.turn(original, { storyAction: action }, 'failed');
    await alternativeWire.turn(original, { storyAction: { ...action, expectedVersion: 1 } }, 'failed');
    assert.equal((await state(story.id)).values.coins, 80);
    checks.push({ case: 'clarification, unknown rule, stale proposal and cross-story proposal fail closed', result: 'passed' });

    const insufficient = await makeStory();
    const insufficientWire = await wire(insufficient.id);
    await insufficientWire.turn('买两件东西');
    reply = await latest(insufficient.id);
    await insufficientWire.turn('买两件东西', { storyAction: { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion } }, 'failed');
    assert.deepEqual(await state(insufficient.id), { version: 1, values: { coins: 100, rested: false } });
    checks.push({ case: 'compound preconditions rechecked after each step, insufficient total cost commits nothing', result: 'passed' });

    const rollback = await makeStory();
    const rollbackWire = await wire(rollback.id);
    await rollbackWire.turn('买票然后休息');
    reply = await latest(rollback.id);
    const rollbackAction = { proposalMessageId: Number(reply.id), expectedVersion: reply.extra.storyIntent.expectedVersion };
    await sql.unsafe(`CREATE FUNCTION intent_fail_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.chat_id = '${rollback.id}'::uuid AND NEW.version = 2 THEN RAISE EXCEPTION 'controlled intent commit failure'; END IF; RETURN NEW; END $$`);
    await sql.unsafe('CREATE TRIGGER intent_fail_state AFTER UPDATE ON story_states FOR EACH ROW EXECUTE FUNCTION intent_fail_state()');
    try {
      await rollbackWire.turn('买票然后休息', { storyAction: rollbackAction }, 'failed');
      assert.deepEqual(await state(rollback.id), { version: 1, values: { coins: 100, rested: false } });
      assert.equal((await sql`SELECT count(*)::int AS count FROM story_events WHERE chat_id=${rollback.id}`)[0].count, 1);
      assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${rollback.id} AND role='assistant'`)[0].count, 1);
    } finally { await sql.unsafe('DROP TRIGGER intent_fail_state ON story_states'); await sql.unsafe('DROP FUNCTION intent_fail_state()'); }
    await rollbackWire.turn('买票然后休息', { storyAction: rollbackAction });
    assert.deepEqual((await state(rollback.id)).values, { coins: 80, rested: true });
    await rollbackWire.turn('中断候选', {}, 'failed');
    reply = await latest(rollback.id);
    assert.equal(reply.extra.stateStatus, 'interrupted');
    assert.equal(reply.extra.storyIntent, undefined);
    assert.ok(!reply.content.includes('story-intent'));
    assert.deepEqual((await state(rollback.id)).values, { coins: 80, rested: true });
    checks.push({ case: 'late database failure rolls back body/event/all effects; explicit fresh request succeeds; truncated metadata cannot be confirmed', result: 'passed' });

    const recorded = JSON.parse(await readFile('docs/deployment/evidence/story-intent-04d-model.json', 'utf8')).calls[0];
    const replayStory = await makeStory();
    const replayWire = await wire(replayStory.id);
    const replayTurn = await replayWire.turn(recorded.input);
    const replayReply = await latest(replayStory.id);
    assert.equal(replayReply.extra.stateStatus, 'proposed');
    assert.ok(!replayReply.content.includes('你靠近'));
    assert.ok(!JSON.stringify(replayTurn.events.filter(event => event.type === 'assistant_message_chunk')).includes('你靠近'));
    assert.equal(replayReply.extra.storyIntent.intent.steps[0].kind, 'refuse');
    assert.equal((await state(replayStory.id)).values.coins, 100);
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_memory_progress WHERE chat_id=${replayStory.id}`)[0].count, 0);
    checks.push({ case: 'recorded real-model premature narrative replay is withheld and cannot enter confirmed memory', result: 'passed', paidCalls: 0 });

    const members = [];
    for (const name of ['甲', '乙']) members.push(await api('/characters', { name: `04D知情${name}`, description: `KNOWLEDGE_${name}`, cardData: { first_mes: '', description: `KNOWLEDGE_${name}` } }));
    const group = await api('/chats', { characterIds: members.map(member => member.id), clientRequestId: randomUUID(), metadata: { groupStrategy: 'all' } });
    let groupWire = await wire(group.id);
    const secret = `PRIVATE_SECRET_${randomUUID()}`;
    await groupWire.turn(secret, { storyAudience: [members[0].id] });
    const secretReply = await latest(group.id);
    assert.deepEqual(secretReply.extra.storyAudience, [members[0].id]);
    await groupWire.turn('向乙询问天气', { mentionedCharacterIds: [members[1].id] });
    assert.ok(!JSON.stringify(contextRequests.at(-1)).includes(secret));
    await groupWire.turn('向甲公开询问天气', { mentionedCharacterIds: [members[0].id] });
    assert.ok(!JSON.stringify(contextRequests.at(-1)).includes(secret));
    await groupWire.turn('私下继续刚才的话', { storyAudience: [members[0].id] });
    assert.ok(JSON.stringify(contextRequests.at(-1)).includes(secret));
    await groupWire.turn('错误听众', { storyAudience: [randomUUID()] }, 'failed');
    await groupWire.turn('错误提及', { storyAudience: [members[0].id], mentionedCharacterIds: [members[1].id] }, 'failed');
    checks.push({ case: 'private audience, public context exclusion, own private recall and invalid recipient rejection', result: 'passed' });

    await groupWire.turn('公开第三次提问', { mentionedCharacterIds: [members[0].id] });
    await groupWire.turn('公开第四次提问', { mentionedCharacterIds: [members[0].id] });
    const sources = await sql`SELECT e.id AS "eventId", e.version, i.id::int AS "inputMessageId", m.id::int AS "messageId", i.content AS input, m.content AS reply
      FROM story_events e JOIN messages i ON i.id=e.input_message_id JOIN messages m ON m.id=e.message_id
      WHERE e.chat_id=${group.id} AND m.character_id=${members[0].id} ORDER BY e.version LIMIT 5`;
    assert.equal(sources.length, 5);
    const extracted = { version: 1, facts: [{ type: 'fact', content: secret, sourceMessageIds: [sources[0].inputMessageId] }],
      summary: { content: secret, sourceMessageIds: sources.flatMap(source => [source.inputMessageId, source.messageId]) } };
    const job = (await sql`UPDATE story_memory_jobs SET status='succeeded', extracted=${sql.json(extracted)}, source_digest=${createHash('sha256').update(JSON.stringify(sources)).digest('hex')}, lease_token=NULL, lease_until=NULL
      WHERE chat_id=${group.id} AND character_id=${members[0].id} RETURNING id`)[0];
    assert.ok(job);
    const memory = (await sql`INSERT INTO character_memories (character_id,user_id,type,content,source_chat_id,source_message_id)
      VALUES (${members[0].id},${auth.user.id},'fact',${secret},${group.id},${sources[0].inputMessageId}) RETURNING id`)[0];
    await sql`INSERT INTO story_memory_links (memory_id,job_id,event_id,message_id) VALUES (${memory.id},${job.id},${sources[0].eventId},${sources[0].inputMessageId})`;
    Object.assign(process.env, { JWT_SECRET: serviceEnvironment.JWT_SECRET, JWT_REFRESH_SECRET: serviceEnvironment.JWT_REFRESH_SECRET });
    const loader = register({ namespace: `intent-${randomUUID()}` });
    const derivedConnection = postgres(serviceEnvironment.DATABASE_URL, { max: 3 });
    try {
      const { visibleStoryMemoryIds } = await loader.import('../src/server/services/story-knowledge.service.ts', import.meta.url);
      const { getStorySummaries } = await loader.import('../src/server/services/story-summary.service.ts', import.meta.url);
      const database = drizzle(derivedConnection);
      assert.equal((await visibleStoryMemoryIds(group.id, members[0].id, [memory.id], undefined, database)).size, 0);
      assert.equal((await visibleStoryMemoryIds(group.id, members[0].id, [memory.id], [members[0].id], database)).size, 1);
      assert.equal((await visibleStoryMemoryIds(group.id, members[1].id, [memory.id], [members[1].id], database)).size, 0);
      assert.equal((await getStorySummaries(group.id, auth.user.id, auth.user.tenantId, members[0].id, database)).length, 0);
      assert.equal((await getStorySummaries(group.id, auth.user.id, auth.user.tenantId, members[0].id, database, [members[0].id])).length, 1);
    } finally { loader.unregister(); await derivedConnection.end(); }
    checks.push({ case: 'whole extraction-batch audience checks for durable memories and summaries', result: 'passed' });

    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ token, refreshToken, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
    }, { token: auth.tokens.accessToken, refreshToken: auth.tokens.refreshToken, user: auth.user });
    const page = await context.newPage();
    await page.goto(`${base}/chat/${group.id}`);
    await expect(page.locator('#story-audience')).toBeVisible();
    await page.locator('#story-audience').selectOption(members[0].id);
    await page.locator('.input-textarea textarea').fill('尚未发送的私下草稿');
    await page.reload();
    await expect(page.locator('#story-audience')).toHaveValue(members[0].id);
    await expect(page.locator('.input-textarea textarea')).toHaveValue('尚未发送的私下草稿');
    await page.locator('#story-audience').selectOption('');
    await expect(page.locator('.input-textarea textarea')).toHaveValue('');
    await page.screenshot({ path: `${evidence}/knowledge-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${evidence}/knowledge-mobile.png`, fullPage: true });
    checks.push({ case: 'browser audience selection, reload and private/public draft separation on desktop/mobile', result: 'passed' });

    const uiStory = await makeStory();
    const uiWire = await wire(uiStory.id);
    await uiWire.turn(original);
    await page.goto(`${base}/chat/${uiStory.id}`);
    await expect(page.getByRole('region', { name: '核对这次行动' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '确认并继续', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/intent-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: '确认并继续', exact: true }).click();
    await expect.poll(async () => (await state(uiStory.id)).values.coins).toBe(80);
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toHaveCount(0);
    checks.push({ case: 'real browser proposal confirmation changes authoritative state', result: 'passed' });

    for (const socket of sockets) socket.close();
    await restartServer();
    groupWire = await wire(group.id);
    await groupWire.turn('重启后向乙提问', { mentionedCharacterIds: [members[1].id] });
    assert.ok(!JSON.stringify(contextRequests.at(-1)).includes(secret));
    await groupWire.turn('重启后私下继续', { storyAudience: [members[0].id] });
    assert.ok(JSON.stringify(contextRequests.at(-1)).includes(secret));
    assert.equal((await state(uiStory.id)).values.coins, 80);
    checks.push({ case: 'restart preserves confirmed consequences and private knowledge boundary', result: 'passed' });
    await checkStoryStateClosure({ page, base, sql, api, auth, serviceEnvironment, checks, evidence, waitBudget: async () => {
      const response = await fetch(`${base}/api/v1/csrf-token`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } });
      assert.equal(response.status, 200);
      remaining = Number(response.headers.get('x-ratelimit-remaining'));
      reset = Number(response.headers.get('x-ratelimit-reset'));
      if (remaining < 60) {
        while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
        remaining = 100;
      }
    } });
    await writeFile(`${evidence}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), model: 'controlled fixture, not a real provider', checks }, null, 2));
    console.info(`PASS: ${checks.length} story intent and knowledge groups; ${evidence}/report.json`);
  } finally {
    for (const socket of sockets) socket.close();
    await context?.close();
  }
}
