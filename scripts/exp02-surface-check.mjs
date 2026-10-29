import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { checkLibraryRecovery } from './story-library-recovery-check.mjs';

export async function checkExp02Surfaces({ browser, base, sql, auth, csrf, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-exp02-surfaces/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const checks = [];
  const screenshots = [];
  const errors = [];
  const initialStreams = getStreamCount();
  let closing = false;
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
    console.info('EXP-02 surfaces waiting for the normal rate-limit window');
    while (Date.now() < resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1100 - Date.now())));
    remaining = 100;
  }
  async function api(path, body) {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    observe(Object.fromEntries(response.headers));
    assert.ok(response.ok, `${path}: ${response.status}`);
    return (await response.json()).data;
  }
  const marker = `EXP02-${randomUUID()}`;
  const card = await api('/characters', { name: `${marker} 遥远的旅程`.repeat(3).slice(0, 240), description: '',
    avatarUrl: `${base}/missing-exp02-cover.png`, cardData: { first_mes: '雨落在窗边。你推开门，看见一封未拆的信。',
      alternate_greetings: ['午后，你在站台等待一位老朋友。'], system_prompt: 'EXP02_PRIVATE_AUTHOR_SECRET' } });
  const privateCard = await api('/characters', { name: `${marker}-private`, cardData: { first_mes: '这是私有故事，不应出现在公共发现页。' } });
  await sql`UPDATE characters SET is_public=true, moderation_status='approved' WHERE id=${card.id}`;
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => observe(response.headers()));
  page.on('request', request => { csrf = request.headers()['x-csrf-token'] || csrf; });
  async function screenshot(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: overflow`);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`${name}.png`);
  }
  const surfaces = [
    { name: 'discover', route: `/market?q=${marker}`, endpoint: '/characters/search', ready: '.story-card', loading: '.skeleton-wrapper', error: '.empty-state.error-variant' },
    { name: 'detail', route: `/characters/${card.id}`, endpoint: `/characters/${card.id}`, ready: '.story-hero', loading: '.el-loading-mask', error: '.error-state' },
    { name: 'opening', route: `/chat?characterId=${card.id}&storyEntry=quick`, endpoint: `/characters/${card.id}/story-entry`, ready: '.opening-options', loading: '[data-testid="opening-preparation"] [role="status"]', error: '[data-testid="opening-preparation"] [role="alert"]' },
    { name: 'stories', route: '/chat', endpoint: '/chats', ready: '.library-story', loading: '.chat-page-state[role="status"]', error: '.library-error' },
    { name: 'private', route: '/my-characters', endpoint: '/characters', ready: '.private-story-card', loading: '.el-loading-mask', error: '[data-testid="library-load-error"]' },
  ];
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.addInitScript(theme => localStorage.setItem('theme-preference', theme), width === 390 ? 'dark' : 'light');
      for (const surface of surfaces) {
        await budget();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let requests = 0;
        const matches = url => url.origin === base && url.pathname === `/api/v1${surface.endpoint}`;
        await page.route(matches, async route => {
          if (route.request().method() !== 'GET') return route.fallback();
          requests++;
          await gate;
          if (closing) return;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'EXP02_FAILURE', message: '验收注入：资料暂不可用' } }) });
        });
        try {
          await page.goto(`${base}${surface.route}`);
          await expect(page.locator(surface.loading).first()).toBeVisible();
          await screenshot(`${surface.name}-${width}-loading`);
          release();
          await expect(page.locator(surface.error).first()).toBeVisible();
          assert.ok(requests > 0);
          await screenshot(`${surface.name}-${width}-failure`);
          await page.unroute(matches);
          await page.locator(surface.error).first().getByRole('button').first().click();
          await expect(page.locator(surface.ready).first()).toBeVisible();
          await expect(page.locator(surface.error)).toHaveCount(0);
          await expect(page.locator('body')).not.toContainText('EXP02_PRIVATE_AUTHOR_SECRET');
          await screenshot(`${surface.name}-${width}-recovered`);
          if (surface.name === 'discover') {
            await expect(page.locator('.story-card')).toHaveCount(1);
            await expect(page.locator('.story-card .cover-initial')).toBeVisible();
            await expect(page.locator('.story-card')).not.toContainText(privateCard.name);
          }
          checks.push(`${surface.name}/${width}: visible loading, explicit failure and manual recovery; no author-secret leak`);
        } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
      }
      await budget();
      await page.goto(`${base}/market?q=NO-MATCH-${randomUUID()}`);
      await expect(page.locator('.empty-state[data-type="no-results"]')).toBeVisible();
      await expect(page.locator('.empty-state')).toHaveAttribute('role', 'status');
      await screenshot(`discover-${width}-no-results`);
      await page.locator('.empty-actions button').first().click();
      await expect(page.locator('.story-card').first()).toBeVisible();
      await budget();
      const matchChats = url => url.origin === base && url.pathname === '/api/v1/chats';
      const original = await api('/chats');
      await page.route(matchChats, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...original, items: [], pagination: { ...original.pagination, total: 0 } } }) }));
      try {
        await page.goto(`${base}/chat`);
        await expect(page.locator('.library-empty')).toBeVisible();
        await expect(page.locator('.library-error')).toHaveCount(0);
        await screenshot(`stories-${width}-empty-controlled`);
      } finally { await page.unroute(matchChats); }
    }
    await checkLibraryRecovery({ page, base, card: privateCard, budget, screenshot });
    checks.push('Private library timeout/429: exactly one manual retry; controlled empty list differs from failed reads');
    const writes = [];
    page.on('request', request => {
      if (['PATCH', 'POST'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/v1/characters/')) writes.push(request.url());
    });
    const ownCard = page.locator('.private-story-card').filter({ hasText: privateCard.name });
    await ownCard.locator('.private-story-more').click();
    await page.getByRole('menuitem', { name: '预览发布效果', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('publish-preview')).toContainText('不会保存或发布');
    const nameInput = dialog.locator('.el-form-item').first().locator('input');
    await expect(nameInput).toBeEnabled();
    await nameInput.fill('仅本机预览的新名称');
    await expect(dialog.getByTestId('publish-preview')).toContainText('仅本机预览的新名称');
    await expect(dialog.locator('.el-dialog__footer .el-button--primary')).toBeDisabled();
    await screenshot('publish-without-entitlement-preview');
    await dialog.locator('.el-dialog__footer button').first().click();
    assert.deepEqual(writes, []);
    assert.equal((await api(`/characters/${privateCard.id}`)).name, privateCard.name);
    checks.push('Account without publish entitlement can edit local preview, cannot submit, and cancel writes nothing');
    assert.equal(getStreamCount(), initialStreams);
    assert.deepEqual(errors, []);
    assert.equal((await api(`/chats/${story.id}/story-state`)).version, 0);
    await budget();
    await page.goto(`${base}/chat/${story.id}`);
    const suggestions = page.locator('.opening-suggestions');
    await expect(suggestions).toContainText('不是原卡规则选项');
    await expect(suggestions.getByRole('button')).toHaveCount(3);
    await page.locator('.message-input textarea').fill('保留尚未发送的自定义行动');
    await screenshot('opening-starter-suggestions');
    await suggestions.getByRole('button').first().evaluate(button => { button.click(); button.click(); });
    await expect.poll(async () => (await sql`SELECT count(*)::int AS count FROM generation_requests WHERE chat_id=${story.id} AND status='completed'`)[0].count, { timeout: 30000 }).toBe(1);
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${story.id} AND role='user'`)[0].count, 1);
    await expect(page.locator('.message-input textarea')).toHaveValue('保留尚未发送的自定义行动');
    await expect(suggestions).toHaveCount(0);
    const after = await api(`/chats/${story.id}/story-state`);
    assert.deepEqual(after.fields, []);
    assert.deepEqual(after.actions, []);
    assert.equal(after.map, null);
    await budget();
    await page.reload();
    await expect(page.locator('.message-input textarea')).toBeVisible();
    await expect(page.locator('.opening-suggestions')).toHaveCount(0);
    await screenshot('opening-starter-completed');
    assert.deepEqual(errors, []);
    checks.push('Generic starter sends one free-input turn via local deterministic provider, preserves draft, creates no fake fields/actions/map, and stays hidden after reload');
    await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', checks, screenshots, errors, paidProviderCalls: 0,
      scope: 'Synthetic approved card and private work in disposable database; actual API recovery, controlled empty list and transport failures; one local deterministic starter turn, no paid provider or real-device signoff' }, null, 2), { mode: 0o600 });
    console.info(`PASS: EXP-02 surfaces; ${directory}/report.json`);
  } catch (error) {
    closing = true;
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, checks, screenshots, errors }, null, 2), { mode: 0o600 });
    throw error;
  } finally { closing = true; await page.unrouteAll({ behavior: 'ignoreErrors' }); await context.close(); }
}
