import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { checkStoryStateClosure } from './story-state-closure-check.mjs';

export async function checkStoryOverview({ browser, base, sql, auth, csrf, serviceEnvironment, getStreamCount }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-overview-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const checks = [];
  const screenshots = [];
  const errors = [];
  const generationCount = getStreamCount();
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const reset = Number(headers['x-ratelimit-reset']);
    remaining = reset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, reset);
  }
  async function waitBudget() {
    if (remaining >= 45) return;
    console.info('Overview checks waiting for the normal rate-limit window');
    while (Date.now() < resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1100 - Date.now())));
    remaining = 100;
  }
  async function api(path, body) {
    await waitBudget();
    const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    observe(Object.fromEntries(response.headers));
    assert.ok(response.ok, `${path}: ${response.status}`);
    return (await response.json()).data;
  }
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
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
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`${name}.png`);
  }
  const loader = register({ namespace: `overview-${randomUUID()}` });
  const previousEnvironment = Object.fromEntries(Object.keys(serviceEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, serviceEnvironment);
  try {
    const fixture = await checkStoryStateClosure({ page, base, sql, api, auth, serviceEnvironment, checks, evidence: directory, waitBudget });
    screenshots.push('source-desktop.png', 'source-mobile.png');
    await waitBudget();
    await page.goto(`${base}/chat/${fixture.storyId}`);
    const dossier = page.locator('.story-dossier');
    await expect(page.getByTestId('current-story-state')).toContainText('80');
    await expect(dossier.locator('.current-location')).toContainText('港口');
    await expect(dossier).not.toContainText('秘密据点');
    for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      if (width === 390 && await dossier.locator('.dossier-toggle').getAttribute('aria-expanded') !== 'true') await dossier.locator('.dossier-toggle').click();
      await expect(page.getByTestId('current-story-state')).toBeVisible();
      if (width === 390) {
        await expect(dossier.locator('.dossier-toggle-title')).toContainText('港口 · 第 35 轮');
        const panel = await dossier.locator('.dossier-body').boundingBox();
        assert.ok(panel.height <= 844 * .52 + 1, 'Mobile dossier stays within 52% of viewport');
        const content = dossier.locator('.dossier-content');
        await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect(dossier.locator('.dossier-close')).toBeInViewport();
        await expect(dossier.locator('nav')).toBeInViewport();
        await content.evaluate(element => { element.scrollTop = 0; });
      }
      await screenshot(`native-${width}-${theme}`);
    }
    await dossier.locator('.dossier-close').click();
    await expect(dossier.locator('.dossier-toggle')).toBeFocused();
    await expect(dossier.locator('.dossier-body')).toBeHidden();
    checks.push({ case: 'Actual state endpoint supplies confirmed 80 and only discovered harbor; four layouts, close control and keyboard focus', result: 'passed' });
    await screenshot('reading-mobile-collapsed');
    const sourceMessage = page.locator('.message-wrapper').last();
    const sourceMessageId = Number(await sourceMessage.getAttribute('data-message-id'));
    const readingMenu = sourceMessage.getByRole('button', { name: '此段阅读操作', exact: true });
    await expect(sourceMessage.locator('.story-reading-actions')).toHaveCount(0);
    await readingMenu.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '标注 / 纠正此处', exact: true }).click();
    const correction = page.getByRole('dialog');
    await expect(correction.locator('.el-select').first()).toContainText(`#${sourceMessageId}`);
    await correction.getByRole('textbox', { name: '阅读修订内容' }).fill('只属于此次阅读的线索标注。');
    await correction.getByRole('button', { name: '预览影响', exact: true }).click();
    await expect(correction.getByLabel('阅读修订预览')).toContainText('只属于此次阅读的线索标注。');
    await correction.getByRole('button', { name: '确认保存阅读修订', exact: true }).click();
    await expect(correction).toBeHidden();
    await expect(readingMenu).toBeFocused();
    const annotation = sourceMessage.getByLabel('阅读标注', { exact: true });
    await expect(annotation).toContainText('只属于此次阅读的线索标注。');
    await screenshot('reading-mobile-annotation');
    await annotation.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(sourceMessage.locator('.story-reading-actions')).toHaveCount(0);
    await readingMenu.click();
    await page.getByRole('button', { name: '标注 / 纠正此处', exact: true }).click();
    await correction.getByRole('button', { name: '暂不修改', exact: true }).click();
    await expect(readingMenu).toBeFocused();
    await dossier.locator('.dossier-toggle').click();
    await dossier.getByRole('button', { name: '历程', exact: true }).click();
    await dossier.locator('.story-history button').first().click();
    await expect(dossier.locator('.dossier-body')).toBeHidden();
    await expect(page.getByRole('dialog')).toContainText('预写来源验收');
    await page.getByRole('dialog').getByRole('button', { name: /close|关闭/i }).click();
    await expect(dossier.locator('.dossier-toggle')).toBeFocused();
    checks.push({ case: 'Mobile panel bounded with persistent close/navigation; message menu selects correct original, annotation preview/save/undo and cancel restore focus; evidence reading closes panel; no generation', result: 'passed' });
    await waitBudget();
    const nativeState = await api(`/chats/${fixture.storyId}/story-state`);
    const route = `**/api/v1/chats/${fixture.storyId}/story-state`;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(route, async handler => {
      await gate;
      await handler.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'OVERVIEW_UNAVAILABLE', message: '概况读取故障注入' } }) });
    });
    await page.reload();
    await dossier.locator('.dossier-toggle').click();
    await expect(dossier.locator('.state-loading')).toBeVisible();
    assert.equal(await dossier.locator('.story-facts').count(), 0);
    release();
    await expect(dossier.locator('header')).toContainText('读取失败');
    await screenshot('unavailable-mobile');
    await page.unroute(route);
    await dossier.getByRole('button', { name: '重新读取', exact: true }).click();
    await expect(page.getByTestId('current-story-state')).toContainText('80');
    await expect(dossier.getByRole('alert')).toHaveCount(0);
    assert.deepEqual(await api(`/chats/${fixture.storyId}/story-state`), nativeState);
    await page.route(route, handler => handler.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'OVERVIEW_UNAVAILABLE', message: '概况读取故障注入' } }) }));
    await dossier.getByRole('button', { name: '重新核对记录', exact: true }).click();
    await expect(page.getByTestId('state-freshness')).toContainText('本次未更新');
    await expect(page.getByTestId('current-story-state')).toContainText('80');
    await screenshot('retained-state-mobile');
    await page.unroute(route);
    await dossier.getByRole('button', { name: '重新读取', exact: true }).click();
    await expect(page.getByTestId('state-freshness')).toHaveCount(0);
    checks.push({ case: 'Delayed first read shows no fabricated values; failure and explicit retry recover actual state without mutation', result: 'passed' });
    const card = await api('/characters', { name: '概况验收 · 雨夜来信', description: '本机合成验收故事', cardData: { first_mes: '窗外落着雨。桌上留着一封尚未拆开的信。' } });
    const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
    const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
    const database = drizzle(sql);
    async function commit(input, narrative, facts, disposition = 'expression', interrupted = false) {
      const prepared = await prepareStoryTurn(story, input, undefined, database);
      const [source] = await sql`INSERT INTO messages(chat_id,role,content) VALUES (${story.id},'user',${input}) RETURNING id`;
      const intent = { version: 1, disposition, steps: disposition === 'proposal' ? [{ kind: 'explore', intent: 'act', description: input, evidence: input }] : [], facts };
      await commitStoryTurn(prepared, Number(source.id), randomUUID(), `${narrative}\n<story-intent>${JSON.stringify(intent)}</story-intent>`, interrupted, database);
    }
    await commit('听说这封信值一百枚钱。', '窗外下起雨。', [
      { kind: 'claim', speaker: 'player', content: '这封信值一百枚钱，尚未证实。', evidence: '这封信值一百枚钱' },
      { kind: 'observation', speaker: 'character', content: '窗外下起雨。', evidence: '窗外下起雨。' },
    ]);
    await commit('拆开信封', '尚未执行的拆信。', [{ kind: 'observation', speaker: 'character', content: '尚未执行的拆信。', evidence: '尚未执行的拆信。' }], 'proposal');
    await commit('继续等待', '中断的设想。', [{ kind: 'observation', speaker: 'character', content: '中断的设想。', evidence: '中断的设想。' }], 'expression', true);
    const narrativeState = await api(`/chats/${story.id}/story-state`);
    assert.equal(narrativeState.native, false);
    assert.deepEqual(narrativeState.fields, []);
    assert.deepEqual(narrativeState.events.map(event => event.status), ['interrupted', 'proposed', 'confirmed']);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/chat/${story.id}`);
    await expect(page.getByTestId('current-story-state')).toContainText('暂无可运行的数值规则');
    const expressions = page.getByTestId('story-narrative-facts');
    await expect(expressions).not.toHaveAttribute('open');
    await expressions.locator('summary').click();
    await expect(expressions).toContainText('主张 · 未证实');
    await expect(expressions).not.toContainText('尚未执行的拆信');
    await expect(expressions).not.toContainText('中断的设想');
    assert.equal(await dossier.locator('nav').getByRole('button', { name: '地图', exact: true }).count(), 0);
    await screenshot('narrative-desktop');
    await dossier.locator('.unsettled-events').click();
    const historicalProposal = dossier.locator('.story-history li').nth(1);
    await expect(historicalProposal).toContainText('第 2 轮 · 当时保存的行动候选');
    await expect(historicalProposal).not.toContainText('尚未执行');
    await expect(dossier.locator('.story-history li').first()).toContainText('第 3 轮 · 已停止，状态未推进');
    checks.push({ case: 'Service-committed claim/observation retain attribution; proposed/interrupted expressions excluded from overview but present in history; no fake assets or map', result: 'passed' });
    await dossier.getByRole('button', { name: '记忆', exact: true }).click();
    await expect(dossier.getByRole('heading', { name: '我的手记' })).toBeVisible();
    await dossier.getByRole('button', { name: '概况', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await dossier.locator('.dossier-toggle').click();
    await screenshot('narrative-mobile');
    await page.keyboard.press('Escape');
    await expect(dossier.locator('.dossier-toggle')).toBeFocused();
    await expect(dossier.locator('.dossier-body')).toBeHidden();
    assert.deepEqual(await api(`/chats/${story.id}/story-state`), narrativeState);
    assert.equal(getStreamCount(), generationCount);
    assert.deepEqual(errors, []);
    checks.push({ case: 'Memory and narrative remain reachable; mobile Escape closes and restores focus; overview browsing makes no generation calls or state changes', result: 'passed' });
    if (process.env.STORY_OVERVIEW_SAMPLE) {
      await waitBudget();
      const { parseCharacterFile } = await loader.import('../src/types/character-card-import.ts', import.meta.url);
      const parsed = await parseCharacterFile(await readFile(process.env.STORY_OVERVIEW_SAMPLE));
      const imported = await api('/characters', parsed.character);
      const profile = await api(`/characters/${imported.id}/story-entry`);
      const chosen = profile.openings.find(opening => opening.kind === 'narrative' && opening.record?.status === 'initial-only');
      assert.ok(chosen, 'Real sample must offer a sourced initial-only narrative opening');
      const saved = await api('/chats', { characterId: imported.id, clientRequestId: randomUUID(), opening: { characterId: imported.id, revision: profile.revision, reference: chosen.reference, reviewed: false } });
      const frozen = await api(`/chats/${saved.id}/story-state`);
      assert.equal(frozen.native, false);
      assert.deepEqual(frozen.fields, []);
      assert.deepEqual(frozen.openingRecord, chosen.record);
      for (const width of [1440, 390]) {
        await waitBudget();
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto(`${base}/chat/${saved.id}`);
        if (width === 390) await dossier.locator('.dossier-toggle').click();
        await expect(page.getByTestId('current-story-state')).toContainText('暂无可运行的数值规则');
        assert.equal(await dossier.locator('.current-facts').count(), 0);
        const opening = page.getByTestId('saved-opening-record');
        await expect(opening).not.toHaveAttribute('open');
        await expect(page.getByTestId('saved-adaptation-report')).not.toHaveAttribute('open');
        await screenshot(`private-initial-only-${width}-collapsed`);
        await opening.locator(':scope > summary').click();
        await expect(opening).toContainText('不代表当前余额');
        for (const field of frozen.openingRecord.fields) await expect(opening).toContainText(String(field.value));
        await screenshot(`private-initial-only-${width}-expanded`);
      }
      await waitBudget();
      await page.reload();
      await dossier.locator('.dossier-toggle').click();
      await expect(page.getByTestId('saved-opening-record')).not.toHaveAttribute('open');
      assert.deepEqual((await api(`/chats/${saved.id}/story-state`)).openingRecord, frozen.openingRecord);
      assert.equal(getStreamCount(), generationCount);
      assert.deepEqual(errors, []);
      checks.push({ case: 'Real t1 sample in disposable database: selected opening initial values remain folded history, never current assets; desktop/mobile disclosure and frozen reload pass; screenshots private', result: 'passed' });
    }
    await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', checks, screenshots, errors, paidProviderCalls: 0, scope: 'Disposable database and controlled local provider; synthetic stories and optional private imported sample, not real-provider quality or user acceptance' }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${checks.length} overview groups; ${directory}/report.json`);
  } catch (error) {
    await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, checks, errors }, null, 2), { mode: 0o600 });
    throw error;
  } finally {
    loader.unregister(); await context.close();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
