import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export async function checkStoryMemoryUI({ browser, base, sql, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const root = '/tmp/squaretable-memory-ui-evidence';
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
    console.info('Memory UI check is waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
    remaining = 100;
  }
  let auth;
  let csrf;
  async function api(path, body, expected = body ? 201 : 200) {
    await waitForBudget();
    const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    observeBudget(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${path} status`);
    const result = await response.json(); return result.data ?? result;
  }
  const invite = `MEMORY-UI-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
  const card = await api('/characters', { name: '灯塔记录员', description: '隔离记忆界面验收卡。', cardData: { name: '灯塔记录员', first_mes: '' } });
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  await api(`/chats/${story.id}/story-notes`, { kind: 'style', content: '保留克制的对白。' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
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
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => { try { received.push(JSON.parse(payload.toString())); } catch {} }));
  const panel = page.getByRole('region', { name: '自动记忆整理', exact: true });
  async function refresh() {
    await waitForBudget();
    const response = page.waitForResponse(response => response.url().includes(`/chats/${story.id}/story-memory`) && response.status() === 200);
    await panel.getByRole('button', { name: '刷新进度', exact: true }).click();
    await response; await expect(panel).toHaveAttribute('aria-busy', 'false');
  }
  try {
    await waitForBudget(); await page.goto(`${base}/chat/${story.id}`);
    await expect(page.locator('.message-input textarea')).toBeVisible();
    await page.getByRole('navigation', { name: '游玩资料' }).getByRole('button', { name: '记忆', exact: true }).click();
    await expect(panel).toContainText('还没有本批次的整理记录');
    await expect(page.getByRole('region', { name: '此次记忆', exact: true })).toContainText('保留克制的对白');
    checks.push('Empty automatic progress and saved personal notes remain distinct');
    for (let index = 1; index <= 5; index++) {
      await waitForBudget();
      const start = received.length;
      await page.locator('.message-input textarea').fill(`记忆界面验收第${index}轮。`);
      await expect(page.locator('.message-input .send-btn')).toBeEnabled();
      await page.locator('.message-input textarea').press('Enter');
      await expect.poll(() => received.slice(start).find(event => event.type === 'generation_finished')?.data.status, { timeout: 30000 }).toBe('completed');
      if (index === 3) { await refresh(); await expect(panel).toContainText('已累计 3 / 5 次完整回应'); }
    }
    await refresh(); await expect(panel).toContainText('等待整理');
    const [job] = await sql`SELECT * FROM story_memory_jobs WHERE chat_id = ${story.id}`;
    assert.ok(job); assert.equal(job.source_event_ids.length, 5);
    checks.push('Five real WebSocket turns create one durable batch; partial progress is visible after three');
    const streams = getStreamCount();
    await sql`UPDATE story_memory_jobs SET status = 'failed', error_code = 'PRIVATE_FAILURE', extracted = ${sql.json([{ content: 'PRIVATE_EXTRACTION' }])} WHERE id = ${job.id}`;
    await refresh(); await expect(panel).toContainText('有整理未完成');
    const view = await api(`/chats/${story.id}/story-memory`);
    assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
    assert.equal(view.jobs[0].sources.length, 5);
    await page.screenshot({ path: `${evidence}/desktop-memory-failed.png`, fullPage: true });
    checks.push('A controlled persisted failure is visible without exposing extraction or provider internals');
    await panel.locator('.memory-jobs summary').click();
    await panel.getByRole('button', { name: '阅读输入', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '历程原文' });
    await expect(dialog).toContainText('记忆界面验收第1轮。');
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await panel.getByRole('button', { name: '阅读回应', exact: true }).first().click();
    await expect(dialog).toContainText('The lantern');
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    checks.push('Both source links open actual saved input and reply through the authenticated message API');
    await sql`UPDATE story_memory_jobs SET status = 'running', lease_until = now() - interval '1 second' WHERE id = ${job.id}`;
    await refresh(); await expect(panel).toContainText('等待恢复整理');
    const [source] = await sql`SELECT id, message_id FROM story_events WHERE chat_id = ${story.id} AND status = 'confirmed' ORDER BY version LIMIT 1`;
    const [memory] = await sql`INSERT INTO character_memories (character_id, user_id, type, content, source_chat_id, source_message_id)
      VALUES (${card.id}, ${auth.user.id}, 'event', 'PRIVATE_DERIVED_TEXT', ${story.id}, ${source.message_id}) RETURNING id`;
    await sql`INSERT INTO story_memory_links (memory_id, job_id, event_id, message_id) VALUES (${memory.id}, ${job.id}, ${source.id}, ${source.message_id})`;
    await sql`UPDATE story_memory_jobs SET status = 'succeeded', completed_at = now(), lease_until = null WHERE id = ${job.id}`;
    await refresh(); await expect(panel).toContainText('当前保留 1 条辅助记忆');
    assert.ok(!(await page.textContent('body')).includes('PRIVATE_DERIVED_TEXT'));
    assert.equal(getStreamCount(), streams);
    checks.push('Expired lease and retained-memory counts reflect database state; reads never trigger generation');
    await waitForBudget(); await page.reload();
    await page.getByRole('navigation', { name: '游玩资料' }).getByRole('button', { name: '记忆', exact: true }).click();
    await expect(panel).toContainText('当前保留 1 条辅助记忆');
    const pattern = `**/api/v1/chats/${story.id}/story-memory*`;
    await page.route(pattern, route => route.abort('failed'));
    await panel.getByRole('button', { name: '刷新进度', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('下方保留上次读取的记录');
    await expect(panel).toContainText('当前保留 1 条辅助记忆');
    await page.unroute(pattern); await refresh();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    checks.push('Page reload preserves real progress; read failure is explicit, preserves last data, and recovers');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.dossier-toggle').click();
    await expect(panel).toBeVisible();
    await page.screenshot({ path: `${evidence}/mobile-memory-overview.png`, fullPage: true });
    await panel.locator('.memory-jobs summary').click();
    const mobileSource = panel.getByRole('button', { name: '阅读输入', exact: true }).first();
    await mobileSource.scrollIntoViewIfNeeded();
    await expect(mobileSource).toBeInViewport();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${evidence}/mobile-memory-sources.png`, fullPage: true });
    await mobileSource.click(); await expect(dialog).toContainText('记忆界面验收第1轮。');
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await panel.getByRole('button', { name: '刷新进度', exact: true }).focus();
    await page.keyboard.press('Escape'); await expect(page.locator('.dossier-toggle')).toBeFocused();
    await expect(panel).toBeHidden();
    checks.push('390px memory panel exposes source controls without horizontal overflow and Escape returns focus');
    assert.deepEqual(errors, []); assert.deepEqual(networkFailures, []);
    const paths = ['scripts/story-memory-browser-check.mjs', 'scripts/exploration-entry-check.mjs', 'scripts/beta-smoke-check.mjs',
      'src/server/services/story-memory-view.service.ts', 'src/server/routes/chats.ts', 'src/types/story-memory.ts',
      'src/client/services/story.api.ts', 'src/client/composables/useStoryMemory.ts', 'src/client/components/chat/StoryMemoryStatus.vue',
      'src/client/components/chat/StoryDossier.vue', 'dist/server/index.js', 'dist/client/index.html'];
    const sources = await Promise.all(paths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
    const report = { date: new Date().toISOString(), result: 'passed', checks, sources,
      scope: 'Real API/WebSocket/browser/database; five controlled-provider turns. Failure/lease/success states and derived memory are explicitly seeded UI fixtures; real worker behavior verified separately.',
      screenshots: ['desktop-memory-failed.png', 'mobile-memory-overview.png', 'mobile-memory-sources.png'], deployed: false };
    await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    await writeFile(`${root}/latest.json`, JSON.stringify({ evidence, checks: checks.length }), { mode: 0o600 });
    console.info(`Story memory UI passed: ${checks.length} checks; ${evidence}`);
  } catch (error) {
    await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ checks, errors, networkFailures }), { mode: 0o600 });
    console.error(`Memory UI diagnostics: ${evidence}`); throw error;
  } finally { await context.close(); }
}
