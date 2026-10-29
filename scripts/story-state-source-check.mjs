import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function checkStoryStateSource({ page, base, api, storyId, sourceEventId, sourceMessage, checks, evidence, waitBudget = async () => {} }) {
  await waitBudget();
  const sourceRequests = [];
  let generationSends = 0;
  page.on('request', request => {
    if (request.url().includes(`/chats/${storyId}/story-events`)) sourceRequests.push(new URL(request.url()).pathname + new URL(request.url()).search);
  });
  page.on('websocket', socket => socket.on('framesent', frame => {
    if (JSON.parse(String(frame.payload)).type === 'user_message') generationSends++;
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/chat/${storyId}`);
  const dossier = page.locator('.story-dossier');
  await expect(dossier.locator('.story-facts')).toContainText('80');
  await dossier.getByRole('button', { name: '地图', exact: true }).click();
  await expect(dossier.locator('.story-map')).toContainText('港口');
  await expect(dossier.locator('.story-map .here')).toContainText('港口');
  await expect(dossier.locator('.story-map')).not.toContainText('秘密据点');
  await dossier.getByRole('button', { name: '概况', exact: true }).click();
  await dossier.getByRole('button', { name: '查看依据', exact: true }).click();
  await expect(dossier.getByRole('article', { name: '所选状态依据' })).toContainText('第 1 轮');
  assert.deepEqual(sourceRequests, [`/api/v1/chats/${storyId}/story-events/${sourceEventId}`]);
  await dossier.getByRole('button', { name: '阅读依据原文', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(sourceMessage);
  await page.getByRole('dialog').getByRole('button', { name: /close|关闭/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: `${evidence}/source-desktop.png`, fullPage: true });
  checks.push({ case: 'old field source opens in one actual request beyond the recent event window; raw text available; browsing the map does not travel or disclose undiscovered nodes', result: 'passed' });

  await waitBudget();
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = dossier.getByRole('button', { name: /^此次游玩/ });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await dossier.getByRole('button', { name: '概况', exact: true }).click();
  const eventRoute = `**/api/v1/chats/${storyId}/story-events/${sourceEventId}`;
  await page.route(eventRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEST_UNAVAILABLE', message: '故障注入' } }) }));
  await dossier.getByRole('button', { name: '查看依据', exact: true }).click();
  await expect(dossier.getByRole('alert')).toContainText('原状态没有改变');
  await page.unroute(eventRoute);
  await dossier.getByRole('button', { name: '重新读取依据', exact: true }).click();
  await expect(dossier.getByRole('article', { name: '所选状态依据' })).toContainText('第 1 轮');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${evidence}/source-mobile.png`, fullPage: true });
  await expect(dossier.getByRole('article', { name: '所选状态依据' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const current = await api(`/chats/${storyId}/story-state`);
  assert.equal(current.fields.find(field => field.id === 'coins').value, 80);
  assert.equal(generationSends, 0);
  checks.push({ case: '390px source failure is explicit and retry uses the real endpoint; Escape restores focus; no generation or state mutation', result: 'passed' });
}
