import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { expect } from '@playwright/test';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

export async function checkStoryRecommendations({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  assert.equal(base, 'http://127.0.0.1:55441');
  const settings = process.env.STORY_RECOMMENDATIONS_GATEWAY_CONFIG
    ? parse(await readFile(process.env.STORY_RECOMMENDATIONS_GATEWAY_CONFIG)) : null;
  const report = { mode: settings ? 'real-provider' : 'controlled-provider', turns: [], screenshots: [], complete: false };
  const save = () => writeFile(`${directory}/recommendations-private.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  const previous = { ...serviceEnvironment };
  serviceEnvironment.PLATFORM_DAILY_TOKEN_LIMIT = '10000000';
  async function gateway() {
    if (!settings) return null;
    const deadline = Date.now() + 10000;
    while (true) {
      try { return await requireEngineeringGateway(settings); }
      catch (error) {
        if (error.code !== 'ENGINEERING_GATEWAY_RECONCILIATION_REQUIRED' || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  try {
    if (settings) {
      const initial = await gateway();
      assert.equal(initial.batch.requests, 0);
      assert.equal(initial.batch.maxRequests, 4);
      report.batchId = initial.batch.id;
      for (const key of ['CUSTOM_LLM_API_FORMAT', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_MODELS', 'CUSTOM_LLM_DEFAULT_MODEL', 'CUSTOM_LLM_MODEL_LIMITS']) {
        if (settings[key]) serviceEnvironment[key] = settings[key];
      }
    } else serviceEnvironment.CUSTOM_LLM_MODEL_LIMITS = JSON.stringify({ 'beta-smoke': { contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 4096 } });
    await restartServer();
    const bytes = await readFile('backups/exploration/presentation-adoption-20261027/azure.png');
    const form = new FormData(); form.append('files', new Blob([bytes]), 'azure.png');
    const imported = await api('/characters/import/batch', form);
    assert.equal(imported.failed.length, 0);
    const characterId = imported.imported[0].id;
    await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 1000000)`;
    assert.ok((await api('/credits/balance')).availableTokens >= 500000, 'Isolated story test has enough token credit');
    const profile = await api(`/characters/${characterId}/story-entry`);
    const story = await api('/chats', { characterId, clientRequestId: randomUUID(), opening: {
      characterId, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false,
    } }, 201);
    report.storyId = story.id;
    async function saved(chatId) {
      const rows = await sql`SELECT id, content, extra FROM messages WHERE chat_id=${chatId} AND role='assistant' ORDER BY id DESC LIMIT 1`;
      return rows[0];
    }
    async function inspect(chatId, label) {
      await budget();
      await page.goto(`${base}/chat/${chatId}`);
      await expect(page.locator('.turn-recommendations button')).toHaveCount(3);
      await expect(page.locator('.turn-recommendations button').first()).toBeEnabled({ timeout: 15000 });
      const message = await saved(chatId);
      assert.equal(message.extra.storyRecommendations.length, 3);
      const labels = message.extra.storyRecommendations.map(item => item.label);
      assert.deepEqual(await page.locator('.turn-recommendations .story-action-label').allTextContents(), labels);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const button of await page.locator('.turn-recommendations button').all()) await expect(button).toBeInViewport();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const filename = `${label}-${width}.png`;
        await page.screenshot({ path: `${directory}/${filename}`, fullPage: true });
        report.screenshots.push(filename);
      }
      await page.reload();
      await expect(page.locator('.turn-recommendations button').first()).toBeEnabled({ timeout: 15000 });
      assert.deepEqual(await page.locator('.turn-recommendations .story-action-label').allTextContents(), labels);
      return message;
    }
    await inspect(story.id, 'opening');
    check('REC-1: real Azure alternate opening has persisted source-derived suggestions at two widths and after reload');
    async function turn(chatId, choose, index) {
      const before = await saved(chatId);
      const input = page.locator('.input-textarea textarea');
      await expect(input).toBeVisible();
      if (choose) {
        await input.fill('保留这份未发送的草稿');
        await page.locator('.turn-recommendations button').first().dblclick();
      } else {
        await input.fill('请简短解释当前情景中我能了解的线索，先不替我行动或改变数值。');
        await input.press('Enter');
      }
      await expect.poll(async () => {
        const error = await page.locator('.generation-error').allTextContents();
        if (error.length) { report.error = error; await save(); }
        return (await saved(chatId)).id;
      }, { timeout: 120000 }).not.toBe(before.id);
      const reply = await saved(chatId);
      report.turns.push({ index, chatId, reply }); await save();
      assert.equal(reply.extra.stateStatus, 'confirmed');
      assert.equal(reply.extra.storyRecommendationsSource, 'generated');
      assert.equal(reply.extra.storyRecommendations.length, 3);
      assert.equal(new Set(reply.extra.storyRecommendations.map(item => item.input)).size, 3);
      assert.ok(!reply.content.includes('<story-intent>'));
      await expect(page.locator('.turn-recommendations button').first()).toBeEnabled({ timeout: 15000 });
      if (choose) await expect(input).toHaveValue('保留这份未发送的草稿');
      const receipts = await sql`SELECT count(*)::int AS count FROM generation_requests WHERE chat_id=${chatId} AND status='completed'`;
      assert.equal(receipts[0].count, chatId === story.id ? index : 2);
      if (settings) {
        const current = await gateway();
        assert.equal(current.batch.requests, report.turns.length);
        report.gateway = current;
      }
      await inspect(chatId, `turn-${index}`);
      await save();
      return reply;
    }
    await turn(story.id, false, 1);
    await turn(story.id, true, 2);
    check('REC-2: free input then double-clicked recommendation each commit exactly one turn; draft and new suggestions retained');
    await restartServer();
    await inspect(story.id, 'restart');
    await turn(story.id, false, 3);
    check('REC-3: restart and reload preserve the latest recommendations; third turn generates a fresh set');
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '从这里继续询问线索，不改变数值。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, auth.user.id, auth.user.tenantId, branchInput);
    const branch = await corrections.fork(story.id, auth.user.id, auth.user.tenantId, branchInput, preview.digest);
    report.branchId = branch.chat.id;
    await inspect(branch.chat.id, 'branch');
    const branchReply = await saved(branch.chat.id);
    assert.deepEqual(branchReply.extra.storyRecommendations, report.turns[0].reply.extra.storyRecommendations);
    await turn(branch.chat.id, false, 4);
    assert.equal((await saved(story.id)).id, report.turns[2].reply.id);
    check('REC-4: early branch copies its own recommendations and continues without altering parent story');
    report.complete = true; await save();
    return { mode: report.mode, complete: true, turns: report.turns.length, screenshots: report.screenshots.length, batchId: report.batchId ?? null };
  } catch (error) {
    report.failure = error.message;
    report.pageErrors = await page.locator('.generation-error').allTextContents();
    report.ui = { url: page.url(), recommendationSections: await page.locator('.turn-recommendations').count(),
      storyActionsSections: await page.locator('.story-actions').count(), text: (await page.locator('body').innerText()).slice(-1800) };
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true });
    throw error;
  } finally {
    await save();
    Object.assign(serviceEnvironment, previous);
    for (const key of Object.keys(serviceEnvironment)) if (!(key in previous)) delete serviceEnvironment[key];
    await restartServer();
  }
}
