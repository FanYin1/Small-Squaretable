import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import { checkUndeclaredCharacters } from './character-undeclared-check.mjs';
import { checkCoverageImports } from './character-coverage-integration.mjs';

export async function checkCharacterDiagnostics({ browser, base, sql, api, auth, restartServer, evidence, getRequests }) {
  const checks = [];
  const samples = [];
  async function waitBudget() {
    const response = await fetch(`${base}/api/v1/csrf-token`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } });
    await response.arrayBuffer();
    if (Number(response.headers.get('x-ratelimit-remaining')) >= 65) return;
    const ready = Number(response.headers.get('x-ratelimit-reset')) + 1100;
    assert.ok(Number.isFinite(ready) && ready < Date.now() + 65000);
    console.info('03C checks waiting for the normal API rate-limit window');
    while (Date.now() < ready) await new Promise(resolve => setTimeout(resolve, Math.min(1000, ready - Date.now())));
  }
  if (process.env.CHARACTER_UNDECLARED_ONLY === '1') {
    return checkUndeclaredCharacters({ browser, base, sql, api, auth, restartServer, evidence, getRequests, waitBudget });
  }
  if (process.env.CHARACTER_COVERAGE_ONLY === '1') return checkCoverageImports({ api, sql, auth, waitBudget });
  await waitBudget();
  const fixedName = '澄舟';
  const fields = {
    name: '03C身份与资料示例', first_mes: '你好，{{user}}。你可以在这里问路，也可以先安静地观察。',
    alternate_greetings: ['另一处入口 <script>AUTHOR_CODE_MUST_NOT_RUN()</script>'],
    extensions: { world: 'PRIVATE_REQUIRED_BOOK', squaretable: { playerIdentity: { protocol: 1, fixedName } } },
  };
  for (const format of ['legacy', 'chara_card_v2', 'chara_card_v3']) {
    const source = format === 'legacy' ? fields : { spec: format, spec_version: format.endsWith('v3') ? '3.0' : '2.0', data: fields };
    const bytes = JSON.stringify(source);
    const form = new FormData();
    form.append('files', new Blob([bytes], { type: 'application/json' }), `${format}.json`);
    const imported = await api('/characters/import/batch', form, 'POST', 200);
    const characterId = imported.imported[0].id;
    const report = await api(`/characters/${characterId}/compatibility`);
    assert.equal(report.capabilities.scripted, true);
    assert.equal(report.identity.fixedName, fixedName);
    assert.deepEqual(report.books.dependencies, ['unbound']);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
    samples.push({ format, characterId, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  checks.push('Legacy/V2/V3 real file imports have identical dependency and alternate-opening diagnostics, with source hashes and no hidden payload in reports');
  const characterId = samples[2].characterId;
  const book = await api('/worldbooks/import-file', { name: 'PRIVATE_REQUIRED_BOOK', entries: [{ content: 'OWNED_DIAGNOSTIC_RULE <UpdateVariable>', constant: true, extensions: { squaretable: { purpose: 'knowledge' } } }] });
  const bookId = book.worldBookId;
  await api(`/characters/${characterId}/worldbooks/${bookId}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);
  let report = await api(`/characters/${characterId}/compatibility`);
  assert.deepEqual(report.books.dependencies, ['bound']);
  assert.deepEqual(report.books.purposes, ['knowledge']);
  assert.ok(report.capabilities.issues.includes('variable_framework'));
  await sql`UPDATE worldbooks SET is_enabled = false WHERE id = ${bookId}`;
  assert.deepEqual((await api(`/characters/${characterId}/compatibility`)).books.dependencies, ['disabled']);
  await sql`UPDATE worldbooks SET is_enabled = true WHERE id = ${bookId}`;
  await sql`UPDATE worldbook_entries SET is_enabled = false WHERE worldbook_id = ${bookId}`;
  assert.deepEqual((await api(`/characters/${characterId}/compatibility`)).books.dependencies, ['empty']);
  await sql`UPDATE worldbook_entries SET is_enabled = true WHERE worldbook_id = ${bookId}`;
  const duplicate = await api('/worldbooks/import-file', { name: 'PRIVATE_REQUIRED_BOOK', entries: [{ content: 'OWNED_DUPLICATE' }] });
  await api(`/characters/${characterId}/worldbooks/${duplicate.worldBookId}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);
  assert.deepEqual((await api(`/characters/${characterId}/compatibility`)).books.dependencies, ['ambiguous']);
  await api(`/characters/${characterId}/worldbooks/${duplicate.worldBookId}`, { action: 'unbind', expectedCharacterId: characterId }, 'PUT', 200);
  checks.push('Real binding service distinguishes missing, enabled, disabled, empty and ambiguous references; explicit knowledge purpose survives import; unbound same-name books never load');

  const before = Number((await sql`SELECT count(*) AS count FROM chats WHERE user_id = ${auth.user.id}`)[0].count);
  const rejectedKey = randomUUID();
  const conflict = await api('/chats', { characterId, clientRequestId: rejectedKey }, 'POST', 409);
  assert.equal(conflict.error.code, 'STORY_IDENTITY_CONFLICT');
  assert.equal(Number((await sql`SELECT count(*) AS count FROM chats WHERE user_id = ${auth.user.id}`)[0].count), before);
  assert.equal((await sql`SELECT * FROM chat_creation_requests WHERE request_id = ${rejectedKey}`).length, 0);
  const persona = await api('/personas', { name: fixedName, description: '本次公开身份' });
  const chat = await api('/chats', { characterIds: [characterId, samples[1].characterId], personaId: persona.id, clientRequestId: rejectedKey, metadata: { groupStrategy: 'all' } });
  const original = await api(`/chats/${chat.id}/characters`);
  assert.equal(original.length, 2);
  assert.equal(original[0].diagnostics.multipleCharacters, true);
  assert.equal(original[0].diagnostics.identity.fixedName, fixedName);
  assert.deepEqual(original[0].diagnostics.books.dependencies, ['bound']);
  assert.deepEqual(original[1].diagnostics.books.dependencies, ['unbound']);
  assert.ok(!JSON.stringify(original).includes('PRIVATE_'));
  const [stored] = await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chat.id}`;
  assert.equal(stored.snapshot.bindings[0].books.length, 1);
  assert.equal(stored.snapshot.bindings[1].books.length, 0);
  const incompatible = await api('/characters', { name: 'Conflicting identity', cardData: { name: 'Other', extensions: { squaretable: { playerIdentity: { protocol: 1, fixedName: '另一人' } } } } });
  assert.equal((await api('/chats', { characterIds: [characterId, incompatible.id], personaId: persona.id, clientRequestId: randomUUID() }, 'POST', 409)).error.code, 'STORY_IDENTITY_CONFLICT');
  const invalid = await api('/characters', { name: 'Invalid identity', cardData: { name: 'Invalid', extensions: { squaretable: { playerIdentity: { protocol: 2, fixedName } } } } });
  assert.equal((await api(`/characters/${invalid.id}/compatibility`)).identity.status, 'invalid');
  assert.equal((await api('/chats', { characterId: invalid.id, clientRequestId: randomUUID() }, 'POST', 409)).error.code, 'STORY_IDENTITY_INVALID');
  checks.push('Conflicting or malformed explicit identities fail transactionally before chat/request creation; compatible persona retries succeed; per-character group bindings stay separate');

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  try {
    await context.addInitScript(({ tokens, user }) => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
    }, auth);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await waitBudget();
    await page.goto(`${base}/characters/${characterId}`);
    await expect(page.locator('.story-diagnostics')).toContainText('常识与概念');
    await expect(page.locator('.story-diagnostics')).toContainText(fixedName);
    await page.screenshot({ path: `${evidence}/diagnostics-detail-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${evidence}/diagnostics-detail-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await waitBudget();
    await page.goto(`${base}/chat?characterId=${characterId}&storyEntry=quick`);
    await expect(page.getByText('所选称呼与作者固定身份不符，请选择符合要求的人设；多人物卡的固定称呼也须一致。', { exact: true })).toBeVisible();
    await page.locator('.persona-item').filter({ hasText: fixedName }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.waitForURL(/\/chat\/[a-f\d-]+$/);
    await expect(page.locator('.greeting-bubble')).toContainText(fixedName);
    assert.equal(await page.locator('iframe[sandbox*="allow-scripts"]').count(), 0);
    checks.push('Production mobile quick-start shows actionable identity error, preserves selection, and opens with a matching persona; author script remains inactive');
    await waitBudget();
    await page.goto(`${base}/chat/${chat.id}`);
    await expect(page.locator('.greeting-bubble')).toBeVisible();
    const requestsBefore = getRequests().length;
    await page.locator('.message-input textarea').fill('请先告诉我这里有什么可以观察的。');
    await page.locator('.message-input textarea').press('Enter');
    await expect.poll(async () => Number((await sql`SELECT count(*) AS count FROM messages WHERE chat_id = ${chat.id} AND role = 'assistant'
      AND id > (SELECT max(id) FROM messages WHERE chat_id = ${chat.id} AND role = 'user')`)[0].count), { timeout: 20000 }).toBe(2);
    const groupRequests = getRequests().slice(requestsBefore);
    assert.equal(groupRequests.length, 2);
    assert.equal(groupRequests.filter(request => request.messages.some(message => message.role === 'system' && message.content.includes('OWNED_DIAGNOSTIC_RULE'))).length, 1);
    await sql`UPDATE characters SET card_data = ${JSON.stringify({ name: fields.name, first_mes: 'Changed opening' })}::jsonb WHERE id = ${characterId}`;
    await sql`UPDATE worldbooks SET is_enabled = false WHERE id = ${bookId}`;
    report = await api(`/characters/${characterId}/compatibility`);
    assert.equal(report.identity.status, 'unverified');
    assert.equal(report.books.disabled, 1);
    assert.deepEqual(await api(`/chats/${chat.id}/characters`), original);
    await restartServer();
    assert.deepEqual(await api(`/chats/${chat.id}/characters`), original);
    await waitBudget();
    await page.reload();
    await page.locator('.reading-settings summary').click();
    await expect(page.locator('.story-diagnostics').first()).toContainText('本次开局时绑定 1 份资料');
    await expect(page.locator('.story-diagnostics').first()).toContainText('多人物故事');
    await page.screenshot({ path: `${evidence}/diagnostics-frozen-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `${evidence}/diagnostics-frozen-desktop.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    checks.push('Group free input uses its bound owned content; source edits and actual API restart do not alter frozen reports; mobile/desktop reading settings show historical scope');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const originalOwner = auth.user.id;
  const otherId = randomUUID();
  await sql`UPDATE characters SET creator_id = ${null}, is_public = false WHERE id = ${samples[0].characterId}`;
  await api(`/characters/${samples[0].characterId}/compatibility`, undefined, 'GET', 404);
  await sql`UPDATE characters SET creator_id = ${originalOwner} WHERE id = ${samples[0].characterId}`;
  const unauthorized = await fetch(`${base}/api/v1/characters/${otherId}/compatibility`, { headers: { 'X-Tenant-ID': auth.user.tenantId } });
  assert.equal(unauthorized.status, 401);
  checks.push('Compatibility endpoint rejects private cards not owned by the viewer and unauthenticated access');
  const undeclared = await checkUndeclaredCharacters({ browser, base, sql, api, auth, restartServer, evidence, getRequests, waitBudget });
  checks.push(...undeclared.checks);
  const coverage = process.env.CHARACTER_COVERAGE_MANIFEST ? await checkCoverageImports({ api, sql, auth, waitBudget }) : null;
  if (coverage) checks.push(...coverage.checks);
  return { checks, samples, undeclared, coverage, pageErrors: errors, provider: 'controlled loopback; only owned source generated', paidProviderTokens: 0 };
}
