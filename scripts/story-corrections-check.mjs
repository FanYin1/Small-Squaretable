import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { expect } from '@playwright/test';
import { stateClosureRules } from './story-state-closure-check.mjs';

export async function checkStoryCorrections({ browser, base, sql, auth, csrf, serviceEnvironment, restartServer, getStreamCount }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-corrections-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const checks = [];
  const check = name => { checks.push(name); console.info(`Correction check: ${name}`); };
  const streams = getStreamCount();
  const previous = Object.fromEntries(Object.keys(serviceEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, serviceEnvironment);
  const loader = register({ namespace: `corrections-${randomUUID()}` });
  const database = drizzle(sql);
  const errors = [];
  const httpFailures = [];
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const reset = Number(headers['x-ratelimit-reset']);
    remaining = reset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, reset);
  }
  async function budget() {
    if (remaining >= 45) return;
    while (Date.now() < resetAt + 1000) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1000 - Date.now())));
    remaining = 100;
  }
  async function api(path, body, expected = 200, method = body ? 'POST' : 'GET') {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, { method,
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    observe(Object.fromEntries(response.headers));
    const result = await response.json();
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(result.error ?? '')}`);
    return result.data ?? result;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    observe(response.headers());
    if (response.status() >= 400) httpFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('request', request => { csrf = request.headers()['x-csrf-token'] || csrf; });
  try {
    const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const card = await api('/characters', { name: '独立分支验收', cardData: { first_mes: '', extensions: { squaretable: { exploration: stateClosureRules } } } }, 201);
    const main = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
    const standalone = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
    async function turn(chat, actionId, text) {
      const [state] = await sql`SELECT version FROM story_states WHERE chat_id=${chat.id}`;
      const prepared = await prepareStoryTurn(chat, actionId === 'pay' ? '支付20枚' : '停留观察', { actionId, expectedVersion: state.version }, database);
      const [input] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${prepared.input || actionId}) RETURNING id`;
      return commitStoryTurn(prepared, Number(input.id), randomUUID(), text, false, database);
    }
    const first = await turn(main, 'pay', '已支付20枚。\n我们留在港口。');
    for (let index = 0; index < 34; index++) await turn(main, 'wait', `未来轮次${index + 1}。\n她仍认真回应。`);
    await sql`UPDATE chats SET summary='未来的秘密约定，禁止继承' WHERE id=${main.id}`;
    await sql`INSERT INTO story_notes(chat_id,kind,content) VALUES(${main.id},'style','未来笔记，禁止继承')`;
    const [latest] = await sql`SELECT id,content FROM messages WHERE chat_id=${main.id} ORDER BY id DESC LIMIT 1`;
    const layoutInput = { requestId: randomUUID(), messageId: Number(latest.id), kind: 'layout', content: latest.content.replace('\n', '\n\n') };
    const layout = await api(`/chats/${main.id}/story-readings`, layoutInput, 201);
    assert.equal((await api(`/chats/${main.id}/story-readings`, layoutInput, 201)).id, layout.id);
    await api(`/chats/${main.id}/story-readings`, { ...layoutInput, requestId: randomUUID(), content: '钱款现在999。' }, 409);
    await api(`/chats/${standalone.id}/story-readings`, { ...layoutInput, kind: 'annotation' }, 404);
    await api(`/chats/${main.id}/story-readings/${layout.id}`, undefined, 200, 'DELETE');
    await api(`/chats/${main.id}/story-readings`, layoutInput, 410);
    const annotation = await api(`/chats/${main.id}/story-readings`, { requestId: randomUUID(), messageId: Number(latest.id), kind: 'annotation', content: '仅阅读：下次再核对港口。' }, 201);
    const [unchanged] = await sql`SELECT content FROM messages WHERE id=${latest.id}`;
    assert.equal(unchanged.content, latest.content);
    await sql`INSERT INTO generation_requests(chat_id,request_id,payload_hash,status,created_at,finished_at) VALUES(${main.id},${randomUUID()},${'a'.repeat(64)},'failed',now()+interval '1 second',now())`;
    await api(`/chats/${main.id}/story-readings`, { ...layoutInput, requestId: randomUUID() }, 409);
    check('COR-01/02: reversible idempotent reading-only revisions; semantic changes, foreign sources, revoked retries and stale layouts rejected');

    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'evidenced', direction: '留在港口核对付款，不继承未来经历。', evidenceIds: [first.id] };
    const preview = await api(`/chats/${main.id}/story-branches/preview`, branchInput);
    assert.equal(preview.retainedMessages, 2); assert.equal(preview.discardedEvents, 34);
    assert.deepEqual(preview.fields.map(field => field.value), [80]);
    assert.ok(!JSON.stringify(preview).includes('秘密标记'));
    await api(`/chats/${main.id}/story-branches`, { input: branchInput, previewDigest: '0'.repeat(64) }, 409);
    const [branch, duplicate] = await Promise.all([
      api(`/chats/${main.id}/story-branches`, { input: branchInput, previewDigest: preview.digest }, [200, 201]),
      api(`/chats/${main.id}/story-branches`, { input: branchInput, previewDigest: preview.digest }, [200, 201]),
    ]);
    assert.equal(branch.chatId, duplicate.chatId);
    assert.equal(Number(branch.created) + Number(duplicate.created), 1);
    const child = { ...main, id: branch.chatId };
    const [childData] = await sql`SELECT summary FROM chats WHERE id=${child.id}`;
    assert.equal(childData.summary, null);
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${child.id}`)[0].count, 2);
    assert.equal((await sql`SELECT count(*)::int AS count FROM character_memories WHERE source_chat_id=${child.id}`)[0].count, 0);
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_notes WHERE chat_id=${child.id} AND content LIKE '%未来笔记%'`)[0].count, 0);
    assert.equal((await sql`SELECT cardinality(event_ids) AS count FROM story_memory_progress WHERE chat_id=${child.id}`)[0].count, 1);
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_readings WHERE chat_id=${child.id}`)[0].count, 0);
    const initialInput = { ...branchInput, requestId: randomUUID(), throughVersion: 0, mode: 'adaptation', evidenceIds: [] };
    const initialPreview = await corrections.preview(main.id, auth.user.id, auth.user.tenantId, initialInput);
    assert.equal(initialPreview.fields[0].value, 100);
    const [outsider] = await sql`INSERT INTO users(tenant_id,email,display_name) VALUES(${auth.user.tenantId},${`${randomUUID()}@example.test`},'隔离账户') RETURNING id`;
    await assert.rejects(() => corrections.preview(main.id, outsider.id, auth.user.tenantId, branchInput));
    await assert.rejects(() => corrections.preview(main.id, auth.user.id, randomUUID(), branchInput));
    await api(`/chats/${main.id}/story-branches`, { input: { ...branchInput, direction: '更换已经使用的请求内容。' }, previewDigest: preview.digest }, 409);
    assert.equal((await api(`/chats/${standalone.id}/story-branches`)).length, 1);
    check('COR-03/04/07: exact prefix state, isolated memory jobs and visible evidence; frozen snapshots retained, future notes/summary/readings excluded, same-card starts stay separate');

    await turn(child, 'wait', '分支独立续写。');
    assert.equal((await sql`SELECT version FROM story_states WHERE chat_id=${main.id}`)[0].version, 35);
    assert.equal((await sql`SELECT version FROM story_states WHERE chat_id=${child.id}`)[0].version, 2);
    const staleInput = { ...branchInput, requestId: randomUUID(), throughVersion: 2, mode: 'choice', evidenceIds: [] };
    const stale = await corrections.preview(child.id, auth.user.id, auth.user.tenantId, staleInput);
    await turn(child, 'wait', '分支又走了一步。');
    await assert.rejects(() => corrections.fork(child.id, auth.user.id, auth.user.tenantId, staleInput, stale.digest), /变化/);
    await restartServer();
    assert.equal((await api(`/chats/creation-requests/${branchInput.requestId}`)).chatId, child.id);
    assert.equal((await api(`/chats/${main.id}/story-branches`, { input: branchInput, previewDigest: preview.digest })).chatId, child.id);
    check('COR-04/05: independent continuation, stale-preview refusal, parallel idempotency and durable recovery after process restart');

    const partner = await api('/characters', { name: '多人分支同行者', cardData: { first_mes: '' } }, 201);
    const groupCard = await api('/characters', { name: '多人分支主角', cardData: { first_mes: '' } }, 201);
    const group = await api('/chats', { characterIds: [groupCard.id, partner.id], clientRequestId: randomUUID(), metadata: { groupStrategy: 'all', futureSecret: '不得复制' } }, 201);
    const [groupInput] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${group.id},'user','共同观察港口。') RETURNING id`;
    const groupRequestId = randomUUID();
    await sql`INSERT INTO generation_requests(chat_id,request_id,payload_hash,status,user_message_id) VALUES(${group.id},${groupRequestId},${'b'.repeat(64)},'running',${groupInput.id})`;
    for (const member of [groupCard.id, partner.id]) {
      const prepared = await prepareStoryTurn(group, '共同观察港口。', undefined, database, { characterId: member });
      await commitStoryTurn(prepared, Number(groupInput.id), `${groupRequestId}:${member}`, '我认真回应这次观察。', false, database, member);
    }
    const groupBranchInput = { requestId: randomUUID(), throughVersion: 2, mode: 'choice', direction: '留下来继续观察。', evidenceIds: [] };
    await assert.rejects(() => corrections.preview(group.id, auth.user.id, auth.user.tenantId, groupBranchInput), /尚未结束/);
    await sql`UPDATE generation_requests SET status='completed',finished_at=now() WHERE chat_id=${group.id}`;
    await assert.rejects(() => corrections.preview(group.id, auth.user.id, auth.user.tenantId, { ...groupBranchInput, throughVersion: 1 }), /完整轮次/);
    const groupPreview = await corrections.preview(group.id, auth.user.id, auth.user.tenantId, groupBranchInput);
    const groupChild = await corrections.fork(group.id, auth.user.id, auth.user.tenantId, groupBranchInput, groupPreview.digest);
    assert.deepEqual(groupChild.chat.metadata, { groupStrategy: 'all' });
    const nextGroupInput = { ...groupBranchInput, requestId: randomUUID() };
    const nextGroupPreview = await corrections.preview(groupChild.chat.id, auth.user.id, auth.user.tenantId, nextGroupInput);
    const groupGrandchild = await corrections.fork(groupChild.chat.id, auth.user.id, auth.user.tenantId, nextGroupInput, nextGroupPreview.digest);
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${groupGrandchild.chat.id}`)[0].count, 3);
    check('COR-03/04: active generation and half-group boundaries rejected; complete group can branch twice with completion proof, member order and reply strategy retained');

    await budget();
    await page.goto(`${base}/chat/${main.id}`);
    await expect(page.getByRole('button', { name: '纠正与分支', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '纠正与分支', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '阅读修订内容' }).fill('取消不应写入，但要保留草稿。');
    await dialog.getByRole('button', { name: '预览影响', exact: true }).click();
    await expect(dialog.getByLabel('阅读修订预览')).toBeVisible();
    await dialog.getByRole('button', { name: '暂不修改', exact: true }).click();
    await expect(page.getByRole('button', { name: '纠正与分支', exact: true })).toBeFocused();
    assert.equal((await api(`/chats/${main.id}/story-readings`)).length, 1);
    await page.getByRole('button', { name: '纠正与分支', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '阅读修订内容' })).toHaveValue('取消不应写入，但要保留草稿。');
    await dialog.getByText('纠正 / 改变选择', { exact: true }).click();
    await expect(dialog.getByRole('radio', { name: '纠正 / 改变选择', exact: true })).toBeChecked();
    await dialog.getByRole('textbox', { name: '新分支方向' }).fill('重新开始，留在港口探索。');
    await dialog.getByRole('button', { name: '预览影响', exact: true }).click();
    await expect(dialog.getByLabel('分支影响预览')).toContainText('之后');
    await page.screenshot({ path: `${directory}/branch-preview-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok((await page.locator('.chat-info').boundingBox()).width >= 350, 'Mobile story title must retain its own full row');
    assert.ok((await page.locator('.chat-info').boundingBox()).height <= 72, 'Mobile story heading must not wrap vertically');
    await page.screenshot({ path: `${directory}/branch-preview-mobile.png`, fullPage: true, animations: 'disabled' });
    await budget();
    let lostReply = false;
    const createRoute = `**/api/v1/chats/${main.id}/story-branches`;
    await page.route(createRoute, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      try {
        const response = await route.fetch({ timeout: 12000 });
        assert.equal(response.status(), 201);
        lostReply = true; await route.abort('failed');
      } catch (caught) { errors.push(`Lost-reply injection failed: ${caught.name}`); await route.abort('failed').catch(() => {}); }
    });
    await dialog.getByRole('button', { name: '确认，保留原档并建立分支', exact: true }).click();
    await expect.poll(() => lostReply, { timeout: 15000 }).toBe(true);
    await expect(dialog.getByRole('button', { name: '查回创建结果', exact: true })).toBeVisible({ timeout: 15000 });
    assert.equal(lostReply, true);
    await page.unroute(createRoute);
    await budget();
    await page.reload();
    await page.getByRole('button', { name: '纠正与分支', exact: true }).click();
    await dialog.getByRole('button', { name: '查回创建结果', exact: true }).click();
    await expect(page).not.toHaveURL(`${base}/chat/${main.id}`);
    const recoveredId = new URL(page.url()).pathname.split('/').at(-1);
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_branches WHERE parent_id=${main.id} AND through_version=0`)[0].count, 1);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.story-branch-family')).toContainText('事件 0 后分叉');
    const navigation = page.getByRole('complementary', { name: '独立分支导航' });
    await page.screenshot({ path: `${directory}/branch-navigation-desktop.png`, fullPage: true, animations: 'disabled' });
    await navigation.getByRole('button', { name: '分支存档', exact: true }).click();
    await expect(page.locator('.story-branch-family')).toHaveCount(0);
    await navigation.getByRole('button', { name: '展开分支存档', exact: true }).click();
    await expect(page.locator('.story-branch-family')).toBeVisible();
    await budget();
    await page.setViewportSize({ width: 390, height: 844 });
    await navigation.getByRole('button', { name: '分支存档', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '分支存档' });
    await expect(drawer.locator('.story-branch-family')).toBeVisible();
    await page.screenshot({ path: `${directory}/branch-navigation-mobile.png`, fullPage: true, animations: 'disabled' });
    assert.ok((await drawer.boundingBox()).x >= -1, 'Opened mobile navigation must not remain clipped offscreen');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(navigation.getByRole('button', { name: '分支存档', exact: true })).toBeFocused();
    await navigation.getByRole('button', { name: '分支存档', exact: true }).click();
    await drawer.getByRole('button', { name: /原始开始/ }).click();
    await expect(page).toHaveURL(`${base}/chat/${main.id}`);
    await expect(page.getByRole('dialog', { name: '分支存档' })).toBeHidden();
    check('COR-05/08: explicit preview/cancel/focus, isolated draft, desktop/mobile layout, lost create reply plus reload recovers exactly one independent branch');

    await budget();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/chat/${main.id}`);
    const container = page.locator('.chat-messages');
    await expect(container.locator('[data-message-id]').first()).toBeVisible();
    await container.evaluate(element => { element.scrollTop = Math.max(300, element.scrollHeight / 2); element.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('story-position:')))).toBe(true);
    const saved = await page.evaluate(id => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(key => key.startsWith('story-position:') && key.includes(id))) || 'null'), main.id);
    assert.equal(saved.latest, false);
    await budget();
    await page.reload();
    await expect.poll(() => container.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight > 100)).toBe(true);
    await expect(container.locator(`[data-message-id="${saved.messageId}"]`)).toBeVisible();
    check('COR-08: per-story message anchor resumes after reload instead of jumping to latest');

    const exported = await api(`/chats/${main.id}/export?format=json`);
    assert.ok(exported.readings.some(item => item.id === annotation.id));
    await api(`/chats/${main.id}`, undefined, 200, 'DELETE');
    assert.equal((await api(`/chats/${child.id}/story-branches`)).length, 2);
    assert.equal((await api(`/chats/${child.id}/story-state`)).version, 3);
    await api(`/chats/${recoveredId}`, undefined, 200, 'DELETE');
    assert.equal((await api(`/chats/${child.id}/story-state`)).version, 3);
    await api(`/chats/${main.id}/story-branches`, { input: initialInput, previewDigest: initialPreview.digest }, 404);
    check('COR-06: reading export includes annotations; deleting parent or sibling preserves child state and family independence');
    assert.equal(getStreamCount(), streams, 'Corrections and branches must not invoke a model');
    assert.deepEqual(errors, []);
    assert.deepEqual(httpFailures, []);
    await writeFile(`${directory}/result.json`, JSON.stringify({ checks, screenshots: ['branch-preview-desktop.png', 'branch-preview-mobile.png', 'branch-navigation-desktop.png', 'branch-navigation-mobile.png'], providerCalls: 0, browserErrors: errors }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${checks.length} correction groups; evidence ${directory}`);
  } catch (caught) {
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${directory}/failure.json`, JSON.stringify({ message: caught.message, checks, errors, httpFailures }, null, 2), { mode: 0o600 });
    console.info(`Correction failure evidence: ${directory}`);
    throw caught;
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close(); loader.unregister();
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
