import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import WebSocket from 'ws';
import { checkWorldbookAuthoring } from './worldbook-authoring-check.mjs';

export async function checkWorldbookBindings({ browser, base, sql, getRequests }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const evidence = `/tmp/squaretable-worldbook-bindings-evidence/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const errors = [];
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
    if (remaining >= 45) return;
    console.info('Waiting for normal authoring API rate limit');
    while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
    remaining = 100;
  }
  async function client() {
    let auth;
    let csrf;
    async function api(path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) {
      await waitBudget();
      const response = await fetch(`${base}/api/v1${path}`, {
        method, headers: { 'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
      });
      observeBudget(Object.fromEntries(response.headers));
      assert.equal(response.status, expected, `${method} ${path} status`);
      const result = await response.json();
      return result.data ?? result;
    }
    const invite = `BIND-${randomUUID()}`.toUpperCase();
    await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
    auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
    csrf = (await api('/csrf-token')).csrfToken;
    await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
    return { auth, api };
  }
  const owner = await client();
  const other = await client();
  const makeCard = (agent, name) => agent.api('/characters', { name, cardData: { first_mes: '', extensions: { world: '港口常识' } } });
  const card = await makeCard(owner, '资料绑定验收角色');
  const second = await makeCard(owner, '同作者另一角色');
  const foreign = await makeCard(other, '其他作者的角色');
  const importBook = agent => agent.api('/worldbooks/import-file', { name: '港口常识', entries: { 0: { key: [], content: 'BINDING_HARBOR_RULE', constant: true } } });
  const book = await importBook(owner);
  const foreignBook = await importBook(other);
  const route = (characterId = card.id, bookId = book.worldBookId) => `/characters/${characterId}/worldbooks/${bookId}`;
  const change = (characterId, bookId, action, expectedCharacterId, expected = 200) => owner.api(route(characterId, bookId), { action, expectedCharacterId }, 'PUT', expected);
  const details = () => owner.api(`/characters/${card.id}/worldbooks`);
  const makeStory = () => owner.api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const snapshot = async chatId => (await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chatId}`)[0].snapshot;
  assert.equal((await details()).dependencies[0].status, 'unbound');
  await other.api(`/characters/${card.id}/worldbooks`, undefined, 'GET', 404);
  await other.api(route(), { action: 'bind', expectedCharacterId: null }, 'PUT', 404);
  await change(foreign.id, book.worldBookId, 'bind', null, 404);
  await change(card.id, foreignBook.worldBookId, 'bind', null, 404);
  await owner.api('/worldbooks', { name: 'Forged binding', characterId: foreign.id, scope: 'character' }, 'POST', 404);
  await owner.api('/worldbooks', { name: 'Invalid scope', characterId: card.id, scope: 'global' }, 'POST', 409);
  await owner.api(route(), { action: 'bind' }, 'PUT', 400);
  await owner.api('/characters/not-an-id/worldbooks', undefined, 'GET', 400);
  const personaBook = await owner.api('/worldbooks', { name: 'Persona-only reference', scope: 'persona' });
  await change(card.id, personaBook.id, 'bind', null, 409);
  checks.push('Owner/tenant checks reject foreign characters/books and reads; mutations require explicit expected binding');
  const beforeStory = await makeStory();
  assert.deepEqual((await snapshot(beforeStory.id)).bindings[0].books, []);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, owner.auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    observeBudget(response.headers());
    if (response.status() >= 400) console.info(`Browser response: ${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`);
  });
  await page.goto(`${base}/characters/${card.id}/edit`);
  const panel = page.locator('.worldbook-bindings');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('尚未绑定同名资料');
  await panel.getByLabel('添加已导入的资料').selectOption(book.worldBookId);
  assert.equal((await details()).dependencies[0].status, 'unbound', 'Selection alone must not bind');
  await panel.getByRole('button', { name: '绑定资料', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('绑定已保存');
  await expect(panel).toContainText('已绑定同名且有启用条目的资料');
  assert.equal((await details()).dependencies[0].status, 'bound');
  const [stored] = await sql`SELECT scope, character_id FROM worldbooks WHERE id = ${book.worldBookId}`;
  assert.equal(stored.scope, 'character');
  assert.equal(stored.character_id, card.id);
  await page.screenshot({ path: `${evidence}/bindings-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at 390px');
  await page.screenshot({ path: `${evidence}/bindings-mobile.png`, fullPage: true });
  const boundStory = await makeStory();
  await owner.api(`/worldbooks/${book.worldBookId}`, { scope: 'global' }, 'PATCH', 409);
  assert.equal((await snapshot(boundStory.id)).bindings[0].books.length, 1);
  assert.deepEqual((await snapshot(beforeStory.id)).bindings[0].books, []);
  checks.push('Production editor at 1440/390px: explicit selection/save, actual persisted binding, declared-name hint and frozen previous save');

  await change(second.id, book.worldBookId, 'bind', card.id, 409);
  await change(card.id, book.worldBookId, 'unbind', null, 409);
  await owner.api(`/worldbooks/${book.worldBookId}`, { isEnabled: false }, 'PATCH', 200);
  assert.equal((await details()).dependencies[0].status, 'disabled');
  await owner.api(`/worldbooks/${book.worldBookId}`, { isEnabled: true }, 'PATCH', 200);
  const [entry] = await sql`SELECT id FROM worldbook_entries WHERE worldbook_id = ${book.worldBookId}`;
  await owner.api(`/worldbooks/${book.worldBookId}/entries/${entry.id}`, { isEnabled: false }, 'PATCH', 200);
  assert.equal((await details()).dependencies[0].status, 'empty');
  await owner.api(`/worldbooks/${book.worldBookId}/entries/${entry.id}`, { isEnabled: true }, 'PATCH', 200);
  await page.reload();
  await expect(panel.getByRole('button', { name: '解除绑定：港口常识', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '解除绑定：港口常识', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('绑定已保存');
  await expect(panel).toContainText('尚未绑定同名资料');
  const [unbound] = await sql`SELECT scope, character_id FROM worldbooks WHERE id = ${book.worldBookId}`;
  assert.equal(unbound.character_id, null);
  assert.equal(unbound.scope, 'character', 'Unbinding must not promote a reference to global');
  const afterStory = await makeStory();
  assert.deepEqual((await snapshot(afterStory.id)).bindings[0].books, []);
  assert.equal((await snapshot(boundStory.id)).bindings[0].books.length, 1);
  checks.push('Unbind through UI preserves existing snapshot, excludes future starts and avoids global promotion; disabled/empty references diagnosed');

  const raceCsrf = (await owner.api('/csrf-token')).csrfToken;
  const raced = await Promise.all([card.id, second.id].map(async characterId => {
    const response = await fetch(`${base}/api/v1${route(characterId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.auth.tokens.accessToken}`,
        'X-Tenant-ID': owner.auth.user.tenantId, 'X-CSRF-Token': raceCsrf },
      body: JSON.stringify({ action: 'bind', expectedCharacterId: null }), signal: AbortSignal.timeout(15000),
    });
    return response.status;
  }));
  assert.deepEqual(raced.sort(), [200, 409]);
  checks.push('Concurrent binding attempts serialize: exactly one succeeds; the stale operation gets 409 without stealing another binding');

  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(owner.auth.tokens.accessToken)}`);
  const events = [];
  socket.on('message', raw => events.push(JSON.parse(raw.toString())));
  async function waitFor(predicate) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const event = events.find(predicate);
      if (event) return event;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Binding generation timed out');
  }
  const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
  try {
    await waitFor(event => event.type === 'connected');
    for (const [story, included] of [[beforeStory, false], [boundStory, true], [afterStory, false]]) {
      const start = getRequests().length;
      const requestId = randomUUID();
      send('join_chat', { chatId: story.id });
      send('user_message', { chatId: story.id, content: 'Look around the harbor.', clientMessageId: requestId });
      const event = await waitFor(item => item.type === 'generation_finished' && item.data.requestId === requestId);
      assert.equal(event.data.status, 'completed');
      const requests = getRequests().slice(start);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].messages.some(message => message.content.includes('BINDING_HARBOR_RULE')), included);
    }
  } finally { socket.terminate(); }
  checks.push('Three actual WebSocket generations read their own frozen binding versions across bind/unbind/rebind');
  await waitBudget();
  try { await checkWorldbookAuthoring({ page, owner, sql, base, evidence, checks }); }
  catch (error) {
    await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ message: error.message, errors, remaining, reset }, null, 2));
    console.info(`Authoring failure evidence: ${evidence}`);
    throw error;
  }
  assert.deepEqual(errors, [], 'No browser page errors');
  await context.close();
  const sources = [];
  for (const path of ['src/types/character-worldbook-bindings.ts', 'src/server/services/character-worldbook-bindings.service.ts',
    'src/server/routes/characters.ts', 'src/client/services/character-worldbook.api.ts',
    'src/client/components/worldbook/CharacterWorldbookBindings.vue', 'src/client/pages/CharacterEditor.vue',
    'src/client/i18n/locales/zh-CN.json', 'src/client/i18n/locales/en-US.json',
    'scripts/worldbook-bindings-check.mjs', 'scripts/worldbook-authoring-check.mjs', 'scripts/exploration-entry-check.mjs', 'scripts/beta-smoke-check.mjs',
    'src/server/services/story-diagnostics.service.ts', 'src/server/services/chat-creation.service.ts',
    'src/server/routes/worldbooks.ts', 'src/types/worldbook-export.ts', 'src/client/pages/WorldBookDetail.vue',
    'src/client/components/worldbook/WorldbookPurposeField.vue',
    'dist/server/index.js', 'dist/client/index.html']) {
    sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  await writeFile(`${evidence}/report.json`, JSON.stringify({ date: new Date().toISOString(), result: 'passed', task: 'EXP-03A',
    taskClosed: false, backend: 'production HTTP/WebSocket with disposable PostgreSQL/Redis',
    browser: 'Chromium 1440px and 390px, no API interception', provider: 'loopback controlled provider, synthetic material only',
    paidProviderTokens: 0, checks, pageErrors: errors, sources,
    limits: ['Single character per book; no shared multi-character bindings', 'Only extensions.world name hints; no full dependency or script diagnosis',
      'No source library gameplay, physical device signoff or live candidate deployment'] }, null, 2) + '\n', { mode: 0o600 });
  console.info(`PASS: ${checks.length} worldbook binding groups; ${evidence}/report.json`);
}
