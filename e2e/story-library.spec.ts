import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { setupRedesign } from './utils/redesign-fixtures';

for (const width of [1440, 390]) {
  test(`story library deletes only a confirmed save and supports retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await setupRedesign(page);
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    let stories = [
      { id: 'library-first', title: '雾港来信', characterId: 'redesign-story', characterName: '守灯人', createdAt: '2026-10-29T00:00:00Z', lastMessage: '渡轮离港之前，你收到了那封没有署名的信。', lastMessageAt: '2026-10-29T00:00:00Z' },
      { id: 'library-second', title: '雨夜的唱片店', characterId: 'redesign-story', characterName: '店主', createdAt: '2026-10-29T00:00:00Z', lastMessage: '雨还没有停，你决定留在店里听完这张唱片。', lastMessageAt: '2026-10-29T00:00:00Z' },
    ];
    let deletes = 0;
    await page.route('**/api/v1/chats', route => route.fulfill({ json: { success: true, data: { items: stories, pagination: { page: 1, total: stories.length, totalPages: 1, limit: 20, hasNext: false, hasPrev: false } } } }));
    await page.route('**/api/v1/chats/library-first', route => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deletes++;
      if (deletes === 1) return route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Try again' } } });
      stories = stories.filter(story => story.id !== 'library-first');
      return route.fulfill({ json: { success: true, data: null } });
    });
    await page.goto('/chat');
    await expect(page).toHaveTitle('小小方桌 · Small Squaretable');
    await expect(page.locator('.story-brand')).toContainText('小小方桌');
    const cards = page.locator('.library-story');
    await expect(cards).toHaveCount(2);
    const remove = page.getByRole('button', { name: '删除 雾港来信', exact: true });
    await expect(remove).toBeVisible();
    const cardBounds = (await cards.first().boundingBox())!;
    const buttonBounds = (await remove.boundingBox())!;
    expect(buttonBounds.x).toBeGreaterThan(cardBounds.x + cardBounds.width / 2);
    expect(buttonBounds.y - cardBounds.y).toBeLessThan(20);
    expect(buttonBounds.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.README_SCREENSHOTS === '1') {
      await mkdir('docs/images', { recursive: true });
      await page.screenshot({ path: `docs/images/story-library-${width === 390 ? 'mobile' : 'desktop'}.png`, fullPage: true });
    }
    await remove.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('雾港来信');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(deletes).toBe(0);
    await expect(page).toHaveURL(/\/chat$/);
    await remove.click();
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.getByText('删除失败', { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(2);
    await expect(remove).toBeEnabled();
    await remove.click();
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('雨夜的唱片店');
    expect(deletes).toBe(2);
    await page.reload();
    await expect(cards).toHaveCount(1);
    await expect(page).toHaveURL(/\/chat$/);
  });
}
