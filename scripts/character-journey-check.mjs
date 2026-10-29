import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { storyExamples } from '../src/types/story-examples.ts';
import { tsImport } from 'tsx/esm/api';
const { inspectStoryCapabilities } = await tsImport('../src/types/story-capabilities.ts', import.meta.url);
const { openingSelectable } = await tsImport('../src/types/story-opening.ts', import.meta.url);

export async function checkCharacterJourneys({ browser, base, sql, api, auth, restartServer, getRequests, evidence, originalCards }) {
  const checks = [];
  const stories = [];
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function waitForBudget(minimum = 40) {
    const response = await fetch(`${base}/api/v1/csrf-token`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } });
    await response.arrayBuffer();
    if (Number(response.headers.get('x-ratelimit-remaining')) >= minimum) return;
    const ready = Number(response.headers.get('x-ratelimit-reset')) + 1100;
    assert.ok(Number.isFinite(ready) && ready < Date.now() + 65000, 'Expected normal rate-limit reset');
    console.info('Card journeys waiting for the normal API rate-limit window');
    while (Date.now() < ready) await new Promise(resolve => setTimeout(resolve, Math.min(1000, ready - Date.now())));
  }
  async function navigate(path) { await waitForBudget(); await page.goto(`${base}${path}`); }
  const state = id => api(`/chats/${id}/story-state`);
  const value = (snapshot, field) => snapshot.fields.find(item => item.id === field)?.value;
  async function enter(characterId, fromDetail = false) {
    await waitForBudget(fromDetail ? 35 : 55);
    if (!fromDetail) await page.goto(`${base}/characters/${characterId}`);
    await page.getByTestId('enter-story').click();
    await expect.poll(async () => /\/chat\/[a-f\d-]+$/.test(new URL(page.url()).pathname)
      || await page.locator('.opening-options').isVisible(), { timeout: 20000 }).toBe(true);
    if (!/\/chat\/[a-f\d-]+$/.test(new URL(page.url()).pathname)) {
      await expect(page.locator('.opening-options')).toBeVisible();
      const profile = await api(`/characters/${characterId}/story-entry`);
      const selected = profile.openings.findIndex(opening => openingSelectable(opening) && opening.record?.status !== 'conflict');
      assert.ok(selected >= 0, 'This journey requires an available author opening');
      await page.locator(`[data-opening="${selected}"]`).click();
      if (profile.openings[selected].kind === 'review') await page.locator('.opening-preview input[type="checkbox"]').check();
      await expect(page.getByTestId('opening-start')).toBeEnabled();
      await page.getByTestId('opening-start').click();
    }
    await page.waitForURL(/\/chat\/[a-f\d-]+$/);
    const chatId = new URL(page.url()).pathname.split('/').at(-1);
    const [content] = await sql`SELECT snapshot FROM story_content WHERE chat_id = ${chatId}`;
    const character = content.snapshot.characters[0];
    assert.equal(character.id, characterId);
    assert.equal(character.opening.characterId, characterId);
    assert.ok(character.opening.reference.source !== 'none');
    const saved = await sql`SELECT id, role, content FROM messages WHERE chat_id = ${chatId} ORDER BY id`;
    assert.equal(saved.length, 1, 'Selected opening is saved exactly once before the first player input');
    assert.equal(saved[0].role, 'assistant');
    assert.ok(saved[0].content.length > 0);
    await expect(page.locator(`[data-message-id="${saved[0].id}"]`)).toBeVisible();
    await expect(page.locator('.greeting-bubble')).toHaveCount(0);
    return chatId;
  }
  async function act(chatId, label, free = false) {
    await waitForBudget(25);
    const before = await state(chatId);
    if (free) { await page.locator('.message-input textarea').fill(label); await page.locator('.message-input textarea').press('Enter'); }
    else await page.locator('.story-actions').getByRole('button').filter({ hasText: label }).click();
    await expect.poll(async () => (await state(chatId)).version, { timeout: 20000 }).toBe(before.version + 1);
    await expect(page.locator('.story-dossier header')).toContainText(`第 ${before.version + 1} 轮`);
  }
  try {
    for (const [index, example] of storyExamples.entries()) {
      const marker = `OWNED_BOUND_RULE_${index}`;
      const original = { spec: 'chara_card_v3', spec_version: '3.0', data: { ...example.cardData, name: `03B-${example.name}`, character_book: { name: `${example.name}设定`, entries: [{ id: 0, keys: [], content: marker, constant: true, enabled: true, insertion_order: 10 }] } } };
      const bytes = Buffer.from(JSON.stringify(original));
      await navigate('/my-characters');
      const imported = page.waitForResponse(response => response.url().endsWith('/characters/import/batch') && response.request().method() === 'POST');
      await page.locator('input[type=file][multiple]').setInputFiles([{ name: `${example.key}.json`, mimeType: 'application/json', buffer: bytes }]);
      const result = await (await imported).json();
      const importedCard = (result.data ?? result).imported[0];
      assert.ok(importedCard?.id);
      const characterId = importedCard.id;
      const chatId = await enter(characterId);
      const [binding] = await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chatId}`;
      assert.equal(binding.snapshot.bindings[0].books.length, 1);
      const initial = await state(chatId);
      assert.equal(initial.native, true);
      if (index === 0) {
        await act(chatId, '我不购买，只想问问通行凭证的价格。', true);
        assert.equal(value(await state(chatId), 'coins'), 120);
        const questionContext = getRequests().at(-1).messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
        assert.ok(questionContext.includes('Currently available player-facing actions'));
        assert.ok(questionContext.includes('花 20 枚钱购买临时通行凭证'));
        assert.ok(!questionContext.includes('旧灯塔守望员的标记'));
        await act(chatId, '花 20 枚钱购买临时通行凭证');
        assert.equal(value(await state(chatId), 'coins'), 100);
        await page.locator('.story-dossier nav').getByRole('button', { name: '地图', exact: true }).click();
        assert.equal((await state(chatId)).map.location, 'harbor');
        await act(chatId, '沿着小路前往灯塔');
        await expect(page.locator('.story-map .here')).toContainText('旧灯塔');
      } else {
        await expect(page.locator('.story-dossier nav').getByRole('button', { name: '地图', exact: true })).toHaveCount(0);
        await act(chatId, '我想先安静地坐一会儿');
        await act(chatId, '告诉苏禾我的名字');
        assert.ok(getRequests().at(-1).messages.some(message => message.role === 'system' && message.content.includes('[User Persona:')));
        await act(chatId, '约好明晚回来一起整理旧书');
        await act(chatId, '我想问问书店以前的故事，但今天不谈我的过去。', true);
        const saved = await state(chatId);
        assert.equal(value(saved, 'boundary'), '先安静陪伴，不追问过去');
        assert.equal(value(saved, 'appointment'), '明晚，一起整理旧书');
        assert.equal(saved.map, null);
      }
      const current = await state(chatId);
      const sourced = current.fields.filter(field => field.sourceEventId);
      assert.ok(sourced.length >= 2);
      for (const field of sourced) assert.ok(current.events.some(event => event.id === field.sourceEventId && event.messageId));
      const request = getRequests().at(-1);
      assert.ok(JSON.stringify(request.messages).includes(marker));
      await page.locator('.story-dossier nav').getByRole('button', { name: '记忆', exact: true }).click();
      await page.locator('#story-note-kind').selectOption('style');
      await page.locator('#story-note-content').fill('保留克制对白，不代替我决定。');
      await page.getByRole('button', { name: '保存到此次故事', exact: true }).click();
      await expect(page.locator('.story-notes')).toContainText('保留克制对白');
      const finalState = await state(chatId);
      await navigate('/my-characters');
      await navigate(`/chat/${chatId}`);
      await expect(page.locator('.story-dossier header')).toContainText(`第 ${finalState.version} 轮`);
      await waitForBudget();
      await page.reload();
      await expect(page.locator('.story-dossier header')).toContainText(`第 ${finalState.version} 轮`);
      assert.deepEqual(await state(chatId), finalState);
      const secondId = await enter(characterId);
      const second = await state(secondId);
      assert.notEqual(secondId, chatId);
      assert.equal(second.version, 0);
      assert.equal(second.notes.length, 0);
      assert.deepEqual(second.fields.map(field => [field.id, field.value]), initial.fields.map(field => [field.id, field.value]));
      stories.push({ key: example.key, characterId, chatId, secondId, sha256: createHash('sha256').update(bytes).digest('hex'), finalState });
      checks.push(`${example.key}: production browser file import, embedded binding, quick start, recommended/free actions, sourced state, leave/reload, same-card save isolation`);
      console.info(`Single-player journey passed: ${example.key}`);
    }
    await restartServer();
    for (const story of stories) {
      assert.deepEqual(await state(story.chatId), story.finalState);
      await navigate(`/chat/${story.chatId}`);
      await expect(page.locator('.story-dossier header')).toContainText(`第 ${story.finalState.version} 轮`);
      await page.screenshot({ path: `${evidence}/${story.key}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.dossier-toggle').click();
      await expect(page.locator('.dossier-body')).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${evidence}/${story.key}-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await act(story.chatId, story.key === 'fog-harbor' ? '回到雾港码头' : '问问桌上的旧笔记属于谁');
      assert.equal((await state(story.secondId)).version, 0);
    }
    checks.push('Both mechanisms survive actual API process restart and mobile re-entry, continue actions and keep alternate saves untouched');
    await writeFile(`${evidence}/owned-requests.json`, JSON.stringify(stories.map((story, index) => ({ key: story.key, requests: getRequests().filter(request => request.messages.some(message => message.role === 'system' && message.content.includes(`OWNED_BOUND_RULE_${index}`))) }))), { mode: 0o600 });
    const originalDiagnostics = [];
    for (const sample of originalCards) {
      const [row] = await sql`SELECT card_data FROM characters WHERE id = ${sample.id}`;
      const capabilities = inspectStoryCapabilities(row.card_data);
      await navigate(`/characters/${sample.id}`);
      await expect(page.locator('.story-compatibility')).toBeVisible();
      if (capabilities.issues.includes('regex_rules')) await expect(page.locator('.story-compatibility')).toContainText('正则');
      const chatId = await enter(sample.id, true);
      assert.equal((await state(chatId)).native, capabilities.native);
      await expect(page.locator('.era-script-runner')).toHaveCount(0);
      await page.locator('.reading-settings summary').click();
      if (capabilities.issues.length) await expect(page.getByLabel('当前故事兼容范围')).toBeVisible();
      assert.equal(await page.locator('iframe[sandbox*="allow-scripts"]').count(), 0);
      originalDiagnostics.push({ sha256: sample.sha256, capabilities, mode: 'frozen-narrative-with-explicit-limits', authorCodeExecuted: false });
    }
    assert.deepEqual(errors, []);
    checks.push('Three original library cards show truthful entry/frozen-story diagnostics and never execute author code or fabricate native state');
    return { checks, stories: stories.map(({ finalState, ...story }) => ({ ...story, confirmedTurns: finalState.version })), originalDiagnostics, pageErrors: errors, provider: 'controlled loopback; original third-party content not generated' };
  } catch (error) {
    await page.screenshot({ path: `${evidence}/journey-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
