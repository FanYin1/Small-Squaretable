import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from 'redis';
import { expect } from '@playwright/test';

export async function checkCsrfSessions({ browser, base, sql }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const redisUrl = new URL(process.env.REDIS_URL);
  assert.equal(redisUrl.hostname, '127.0.0.1');
  assert.equal(redisUrl.port, '55449');
  const cache = createClient({ url: redisUrl.toString() });
  await cache.connect();
  const evidence = `/tmp/squaretable-csrf-session-evidence/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const contexts = [];
  const pageErrors = [];
  const mutationStatuses = [];
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    const count = Number(headers['x-ratelimit-remaining']);
    remaining = nextReset > resetAt + 2000 ? count : Math.min(remaining, count);
    resetAt = Math.max(resetAt, nextReset);
  }
  async function budget(minimum = 5) {
    if (remaining >= minimum) return;
    console.info('CSRF check is waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
    remaining = 100;
  }
  async function request(auth, csrf, path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(auth ? {
        Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
      } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    observe(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${method} ${path} status`);
    if (expected >= 400) return;
    const result = await response.json();
    return result.data ?? result;
  }
  async function signup() {
    const email = `${randomUUID()}@example.test`;
    const password = randomBytes(24).toString('hex');
    const invite = `CSRF-${randomUUID()}`.toUpperCase();
    await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
    const auth = await request(null, null, '/auth/register', { email, password, ageConfirmed: true, inviteCode: invite });
    const csrf = (await request(auth, null, '/csrf-token')).csrfToken;
    return { auth, csrf, email, password };
  }
  const key = actor => `csrf:v2:${createHash('sha256').update(actor.auth.tokens.accessToken).digest('hex')}`;
  try {
    await request(null, null, '/csrf-token', undefined, 'GET', 401);
    await request({ tokens: { accessToken: 'invalid-credential' }, user: { tenantId: randomUUID() } }, null, '/csrf-token', undefined, 'GET', 401);
    const first = await signup();
    const second = await signup();
    assert.equal(first.auth.tokens.accessToken.slice(0, 32), second.auth.tokens.accessToken.slice(0, 32), 'Exercise the original shared-prefix collision');
    assert.notEqual(first.csrf, second.csrf);
    const repeated = await Promise.all(Array.from({ length: 6 }, () => request(first.auth, null, '/csrf-token')));
    assert.ok(repeated.every(result => result.csrfToken === first.csrf));
    const thirdAuth = await request(null, null, '/auth/login', { email: first.email, password: first.password }, 'POST', 200);
    assert.notEqual(thirdAuth.tokens.accessToken, first.auth.tokens.accessToken);
    const third = { auth: thirdAuth, csrf: (await request(thirdAuth, null, '/csrf-token')).csrfToken };
    assert.notEqual(third.csrf, first.csrf);
    assert.equal(await cache.get(key(first)), first.csrf);
    assert.ok((await cache.ttl(key(first))) > 0);
    checks.push('Authenticated issuance only; shared-prefix accounts isolated; concurrent Redis issuance reuses one token; separate same-account login gets distinct credentials');

    const actors = [first, second, third];
    for (const [index, actor] of actors.entries()) {
      actor.card = await request(actor.auth, actor.csrf, '/characters', { name: `会话验收角色${index + 1}`, cardData: { first_mes: '' } });
      actor.book = await request(actor.auth, actor.csrf, '/worldbooks/import-file', { name: `会话资料${index + 1}`, entries: { 0: { content: 'Synthetic reference.', constant: true } } });
    }
    await request(first.auth, second.csrf, `/characters/${first.card.id}/worldbooks/${first.book.worldBookId}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 403);
    await request(second.auth, first.csrf, `/characters/${second.card.id}/worldbooks/${second.book.worldBookId}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 403);
    checks.push('Cached tokens remain usable after other logins; cross-session CSRF tokens are rejected');

    await budget(45);
    for (const actor of actors) {
      await budget(35);
      const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
      contexts.push(context);
      await context.addInitScript(({ tokens, user }) => {
        localStorage.setItem('token', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        localStorage.setItem('tenantId', user.tenantId);
        localStorage.setItem('locale', 'zh-CN');
      }, actor.auth);
      actor.page = await context.newPage();
      actor.page.on('pageerror', error => pageErrors.push(error.message));
      actor.page.on('response', response => {
        observe(response.headers());
        if (response.request().method() === 'PUT' && /\/characters\/[^/]+\/worldbooks\//.test(response.url())) mutationStatuses.push(response.status());
      });
      await actor.page.goto(`${base}/characters/${actor.card.id}/edit`);
      actor.panel = actor.page.locator('.worldbook-bindings');
      await expect(actor.panel).toBeVisible();
      await actor.panel.getByLabel('添加已导入的资料').selectOption(actor.book.worldBookId);
    }
    await Promise.all(actors.map(actor => actor.panel.getByRole('button', { name: '绑定资料', exact: true }).click()));
    for (const actor of actors) await expect(actor.panel.getByRole('status')).toContainText('绑定已保存');
    checks.push('Three isolated Chromium contexts across two accounts perform concurrent real UI writes without CSRF failures or token refresh workarounds');

    const refreshed = await request(third.auth, third.csrf, '/auth/refresh', { refreshToken: third.auth.tokens.refreshToken }, 'POST', 200);
    assert.equal(typeof refreshed.accessToken, 'string');
    assert.notEqual(refreshed.accessToken, third.auth.tokens.accessToken);
    const refreshedAuth = { ...third.auth, tokens: refreshed };
    await request(refreshedAuth, third.csrf, `/characters/${third.card.id}/worldbooks/${third.book.worldBookId}`, { action: 'unbind', expectedCharacterId: third.card.id }, 'PUT', 403);
    await third.page.evaluate(tokens => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
    }, refreshed);
    await budget(50);
    await Promise.all([first.page.reload(), second.page.reload()]);
    for (const actor of actors) await expect(actor.panel.getByRole('button', { name: `解除绑定：${actor.book.name}`, exact: true })).toBeVisible();
    await budget(20);
    await Promise.all(actors.map(actor => actor.panel.getByRole('button', { name: `解除绑定：${actor.book.name}`, exact: true }).click()));
    for (const actor of actors) await expect(actor.panel.getByRole('status')).toContainText('绑定已保存');
    assert.deepEqual(mutationStatuses, [200, 200, 200, 200, 200, 200]);
    assert.deepEqual(pageErrors, []);
    await first.page.screenshot({ path: `${evidence}/session-write.png`, fullPage: true });
    checks.push('Reloaded pages and a live page with a refreshed access credential unbind concurrently; first post-refresh write obtains the matching CSRF token');

    const oldSecondToken = second.csrf;
    await cache.sendCommand(['PEXPIRE', key(second), '1']);
    await new Promise(resolve => setTimeout(resolve, 10));
    await request(second.auth, oldSecondToken, '/characters', { name: 'Expired CSRF must not create', cardData: { first_mes: '' } }, 'POST', 403);
    const renewedCsrf = (await request(second.auth, null, '/csrf-token')).csrfToken;
    assert.notEqual(renewedCsrf, oldSecondToken);
    await request(second.auth, renewedCsrf, '/characters', { name: 'Renewed CSRF creation', cardData: { first_mes: '' } });
    await request(first.auth, first.csrf, '/characters', { name: 'Other session unaffected', cardData: { first_mes: '' } });
    const [failedCount] = await sql`SELECT count(*)::int AS count FROM characters WHERE name = 'Expired CSRF must not create'`;
    assert.equal(failedCount.count, 0);
    checks.push('Real Redis expiry rejects the old token before mutation; reacquisition works and another session stays valid');

    const sources = [];
    for (const path of ['src/server/middleware/csrf.ts', 'src/core/jwt.ts', 'src/server/index.ts', 'src/client/services/api.ts',
      'scripts/csrf-session-check.mjs', 'scripts/exploration-entry-check.mjs', 'scripts/beta-smoke-check.mjs', 'dist/server/index.js', 'dist/client/index.html']) {
      sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
    await writeFile(`${evidence}/report.json`, JSON.stringify({ date: new Date().toISOString(), task: 'EXP-07C-CSRF', result: 'passed',
      backend: 'production HTTP and actual disposable PostgreSQL/Redis', browser: 'three Chromium contexts, two accounts, no API interception',
      checks, mutationStatuses, pageErrors, paidProviderTokens: 0, sources,
      limits: ['Redis expiry forced with a short TTL; not a one-hour wall-clock endurance test',
        'Access refresh endpoint used and credential installed in the live page; automatic expired-access recovery separately unit tested',
        'Existing refresh-token per-user policy and CSRF-exempt route coverage unchanged; no live candidate deployment'] }, null, 2) + '\n', { mode: 0o600 });
    console.info(`PASS: ${checks.length} CSRF session groups; ${evidence}/report.json`);
  } finally {
    for (const context of contexts) await context.close();
    await cache.quit();
  }
}
