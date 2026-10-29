import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { expect } from '@playwright/test';
import sharp from 'sharp';
import { parseCharacterFile } from '../src/types/character-card-import.ts';

export async function checkStoryOpeningPreparation({ browser, base, sql, auth, csrf, getStreamCount, getRequests }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = join('/tmp/squaretable-opening-evidence', randomUUID());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const samplePaths = JSON.parse(process.env.STORY_ENTRY_SAMPLE_PATHS || '[]');
  const token = auth.tokens.accessToken;
  const tenant = auth.user.tenantId;
  const checks = [];
  const images = [];
  const errors = [];
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
    console.info('Opening checks are waiting for the normal API rate-limit window');
    while (Date.now() < resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1100 - Date.now())));
    remaining = 100;
  }
  async function api(path, body, method = body ? 'POST' : 'GET', status = 200) {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenant, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    observe(Object.fromEntries(response.headers));
    assert.equal(response.status, status, `${method} ${path}`);
    return (await response.json()).data;
  }
  const cards = [];
  for (const file of samplePaths) {
    const bytes = await readFile(file);
    const parsed = await parseCharacterFile(bytes);
    const image = await sharp(bytes).resize({ width: 480, withoutEnlargement: true }).webp().toBuffer();
    const card = await api('/characters', { ...parsed.character, avatarUrl: `data:image/webp;base64,${image.toString('base64')}` }, 'POST', 201);
    cards.push({ id: card.id, file: basename(file), sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const synthetic = await api('/characters', { name: 'Opening verification', description: '', cardData: {
    first_mes: '<VariableInsert>{"private":1}</VariableInsert>[开场白]', alternate_greetings: ['The north platform.', 'The south platform.'],
  } }, 'POST', 201);
  cards.push({ id: synthetic.id, file: 'synthetic', sha256: null });
  const profiles = [];
  const generationCount = getStreamCount();
  const context = await browser.newContext();
  let page;
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await context.addInitScript(({ token, refreshToken, tenant, userId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tenantId', tenant);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem(`story-onboarding:v1:${JSON.stringify([tenant, userId])}`, 'done');
    }, { token, refreshToken: auth.tokens.refreshToken, tenant, userId: auth.user.id });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/v1/')) observe(response.headers()); });
    page.on('request', request => { csrf = request.headers()['x-csrf-token'] || csrf; });
    for (const card of cards) {
      await budget();
      const started = performance.now();
      const profile = await api(`/characters/${card.id}/story-entry`);
      if (profile.description.source === 'opening') assert.ok(profile.description.reference, 'Excerpt must identify its original opening');
      profiles.push({ ...card, count: profile.openings.length, kinds: profile.openings.map(opening => opening.kind), descriptionSource: profile.description.source,
        findingCodes: profile.openings[0].adaptationReport.findings.map(finding => finding.code),
        preparationMilliseconds: Math.round(performance.now() - started) });
      if (card.file !== 'synthetic') assert.equal(profile.openings[0].adaptationReport.runtime, 'unsupported');
      const [before] = await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`;
      await page.goto(`${base}/chat?characterId=${card.id}&storyEntry=quick`);
      await page.locator('[data-testid="opening-preparation"] .opening-options').waitFor();
      for (let index = 0; index < profile.openings.length; index++) {
        await page.locator(`[data-opening="${index}"]`).click();
        const opening = profile.openings[index];
        await expect(page.getByTestId('adaptation-report')).toContainText('当前所选开场');
        if (card.file !== 'synthetic') {
          await page.getByTestId('adaptation-report').locator('summary').click();
          await expect(page.getByTestId('adaptation-report')).toContainText('尚未');
          await page.getByTestId('adaptation-report').locator('summary').click();
        }
        await expect(page.locator(`[data-opening="${index}"]`)).toHaveAttribute('aria-pressed', 'true');
        const displayed = await page.locator('.opening-preview').innerText();
        assert.ok(!/<\/?(?:VariableInsert|VariableUpdate|era_data|script)\b/i.test(displayed));
        if (!['narrative', 'review'].includes(opening.kind)) await expect(page.getByTestId('opening-start')).toBeDisabled();
        if (opening.record?.status === 'initial-only') {
          await expect(page.getByTestId('opening-record')).toContainText('不会随剧情自动更新');
          for (const field of opening.record.fields) await expect(page.getByTestId('opening-record')).toContainText(String(field.value));
        }
      }
      const chosen = profile.openings.findIndex(opening => opening.kind === 'narrative' && opening.reference.source === 'alternate_greetings');
      assert.ok(chosen >= 0, 'Representative card must include a usable alternate opening');
      await page.locator(`[data-opening="${chosen}"]`).click();
      for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('theme-preference', value); }, theme);
        await expect(page.getByTestId('opening-start')).toBeEnabled();
        const startBox = await page.getByTestId('opening-start').boundingBox();
        assert.ok(startBox && startBox.y >= 0 && startBox.y + startBox.height <= page.viewportSize().height, 'Start action must remain reachable without scrolling through the full opening');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Preparation must fit the viewport');
        assert.equal(await page.locator('.opening-option').evaluateAll(options => options.every(option => {
          const bounds = option.getBoundingClientRect();
          return Array.from(option.children).every(child => {
            const content = child.getBoundingClientRect();
            return content.top >= bounds.top && content.bottom <= bounds.bottom + 1;
          });
        })), true, 'Opening choices must contain their text without overlapping other choices');
        const imagePath = join(directory, `${card.file.replace(/[^a-zA-Z0-9]/g, '_')}-${width}-${theme}.png`);
        await page.screenshot({ path: imagePath, fullPage: true, animations: 'disabled' });
        images.push(imagePath);
      }
      assert.equal((await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`)[0].count, before.count);
      await budget();
      await page.reload();
      await expect(page.locator(`[data-opening="${chosen}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('opening-start').click();
      await page.waitForURL(/\/chat\/[a-f\d-]+$/);
      const chatId = new URL(page.url()).pathname.split('/').at(-1);
      await page.locator('.message-assistant').first().waitFor();
      const [snapshot] = await sql`SELECT snapshot FROM story_content WHERE chat_id=${chatId}`;
      assert.deepEqual(snapshot.snapshot.characters[0].opening.reference, profile.openings[chosen].reference);
      assert.deepEqual(snapshot.snapshot.characters[0].openingRecord, profile.openings[chosen].record);
      assert.deepEqual(snapshot.snapshot.characters[0].adaptationReport, profile.openings[chosen].adaptationReport);
      const savedState = await api(`/chats/${chatId}/story-state`);
      assert.deepEqual(savedState.openingRecord, profile.openings[chosen].record);
      assert.deepEqual(savedState.adaptationReport, profile.openings[chosen].adaptationReport);
      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('theme-preference', value); }, theme);
        if (width === 390 && !await page.getByTestId('saved-adaptation-report').isVisible()) await page.locator('.dossier-toggle').click();
        const report = page.getByTestId('saved-adaptation-report');
        if (!await report.evaluate(element => element.open)) await report.locator('summary').click();
        await expect(report).toContainText('不随原卡后续编辑而改变');
        const imagePath = join(directory, `${card.file.replace(/[^a-zA-Z0-9]/g, '_')}-report-${width}-${theme}.png`);
        await report.screenshot({ path: imagePath, animations: 'disabled' });
        images.push(imagePath);
      }
      if (savedState.openingRecord.status === 'initial-only') {
        assert.equal(savedState.native, false);
        assert.deepEqual(savedState.fields, []);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByTestId('saved-opening-record').locator(':scope > summary').click();
        await expect(page.getByTestId('saved-opening-record')).toContainText('不代表当前余额');
        for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
          await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('theme-preference', value); }, theme);
          if (width === 390 && !await page.getByTestId('saved-opening-record').isVisible()) await page.locator('.dossier-toggle').click();
          await expect(page.getByTestId('saved-opening-record')).toBeVisible();
          const imagePath = join(directory, `${card.file.replace(/[^a-zA-Z0-9]/g, '_')}-saved-${width}-${theme}.png`);
          await page.getByTestId('saved-opening-record').screenshot({ path: imagePath, animations: 'disabled' });
          images.push(imagePath);
        }
      }
      assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${chatId}`)[0].count, 1);
      await budget();
      await page.reload();
      await page.locator('.message-assistant').first().waitFor();
      assert.deepEqual((await api(`/chats/${chatId}/story-state`)).openingRecord, savedState.openingRecord);
      assert.deepEqual((await api(`/chats/${chatId}/story-state`)).adaptationReport, savedState.adaptationReport);
      if (card.file !== 'synthetic') {
        await sql`UPDATE characters SET card_data = ${sql.json({ first_mes: 'Source changed after creation.' })} WHERE id=${card.id}`;
        assert.deepEqual((await api(`/chats/${chatId}/story-state`)).openingRecord, savedState.openingRecord);
        assert.deepEqual((await api(`/chats/${chatId}/story-state`)).adaptationReport, savedState.adaptationReport);
        const updated = await api(`/characters/${card.id}/story-entry`);
        assert.notEqual(updated.revision, profile.revision);
        await sql`UPDATE worldbooks SET is_enabled=false WHERE character_id=${card.id}`;
        const disabled = await api(`/characters/${card.id}/story-entry`);
        assert.equal(disabled.openings[0].adaptationReport.runtime, 'unverified');
        assert.deepEqual(disabled.openings[0].adaptationReport.findings, []);
        assert.deepEqual((await api(`/chats/${chatId}/story-state`)).adaptationReport, savedState.adaptationReport);
      }
      assert.equal((await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`)[0].count, before.count + 1);
      assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${chatId}`)[0].count, 1);
      checks.push(`${card.file}: every opening and compatibility report; four layouts; exact alternate, initial record and report are frozen once and survive refresh/source edits; disabled books degrade new previews without rewriting saved reports`);
    }
    assert.equal(getStreamCount(), generationCount, 'Preparation, creation and refresh must not generate');
    const requestsBefore = getRequests().length;
    await page.locator('textarea').fill('OPENING_CONTEXT_CHECK');
    await page.locator('textarea').press('Enter');
    await expect.poll(() => getRequests().length).toBe(requestsBefore + 1);
    const firstTurn = getRequests().at(-1);
    assert.ok(firstTurn.messages.some(message => message.role === 'assistant' && message.content === 'The north platform.'));
    assert.ok(!firstTurn.messages.some(message => message.role === 'assistant' && message.content.includes('The south platform.')));
    await expect(page.getByText('The lantern opens a quiet path through the sleeping garden.', { exact: true })).toBeVisible();
    checks.push('Controlled first-turn request includes the selected opening, without unselected alternatives');
    await budget();
    await page.goto(`${base}/chat?characterId=${synthetic.id}&storyEntry=quick`);
    await page.locator('[data-opening="1"]').click();
    const [beforeStale] = await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`;
    await api(`/characters/${synthetic.id}`, { description: 'The author edited this after preview.' }, 'PATCH');
    await page.getByTestId('opening-start').click();
    await expect(page.locator('.opening-preparation [role="alert"]')).toContainText('已经更新');
    assert.equal((await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`)[0].count, beforeStale.count);
    await page.locator('.opening-preparation [role="alert"] button').click();
    await page.locator('.opening-options').waitFor();
    await page.locator('.preparation-header .quiet').click();
    await page.waitForURL(`${base}/chat`);
    assert.equal((await sql`SELECT count(*)::int AS count FROM chats WHERE user_id=${auth.user.id}`)[0].count, beforeStale.count);
    checks.push('Source changes require review; cancellation creates no save');
    assert.equal(getStreamCount(), generationCount + 1, 'Only the explicit synthetic continuation may generate');
    assert.deepEqual(errors, []);
    const report = { generatedAt: new Date().toISOString(), checks, profiles, images, pageErrors: errors, generatedTurns: 1, scope: 'disposable database and controlled local provider; no production writes or paid model calls; real-card multi-turn quality untested' };
    await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile('/tmp/squaretable-opening-evidence/latest.json', `${JSON.stringify({ directory, ...report }, null, 2)}\n`, { mode: 0o600 });
    console.info(`Opening preparation passed: ${checks.length} groups, ${images.length} screenshots; ${directory}`);
  } catch (error) {
    if (page) await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(join(directory, 'failure.json'), JSON.stringify({ checks, pageErrors: errors, message: error.message }, null, 2), { mode: 0o600 });
    throw error;
  } finally { await context.close(); }
}
