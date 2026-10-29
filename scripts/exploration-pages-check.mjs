import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const port = Number(process.env.EXPLORATION_DEMO_PORT || 5188);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://127.0.0.1:${port}`;
const evidence = '/tmp/squaretable-exploration-pages';
const storageKey = 'small-squaretable-exploration-demo-v1';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const unexpectedRequests = [];
const failedResponses = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(`${base}/`) || request.url().includes('/api/')) unexpectedRequests.push(request.url()); });
  page.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()); });
  page.on('requestfailed', request => failedResponses.push(request.url()));
}
async function route(page, path) {
  await page.evaluate(hash => { location.hash = hash; }, path);
  await page.waitForFunction(hash => document.documentElement.dataset.page === hash.split('/')[0], path);
}
async function saveScreenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('main:visible').count(), 1, name);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow`);
  assert.ok(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return new Set(ids).size === ids.length; }), `${name}: duplicate element or artwork IDs`);
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  observe(page);
  await page.goto(`${base}/#stories`);
  assert.equal(await page.locator('.library-empty').count(), 1);
  await page.locator('.library-empty a').click();
  await page.locator('#gallery .card-detail-link').first().click();
  await page.locator('#page-detail .secondary-link').click();
  await page.locator('#identity-name').fill('远行者');
  await page.locator('#identity-form button[type=submit]').click();
  await page.locator('#reader').waitFor();
  assert.match(await page.locator('#scene-context').innerText(), /远行者/);
  await page.locator('#choices [data-action="inspect"]').click();
  await page.waitForFunction(() => document.querySelector('#stop-button').hidden);
  await page.locator('#action-input').fill('下次再去调度室');
  await route(page, 'stories');
  assert.equal(await page.locator('.library-card').count(), 1);
  assert.match(await page.locator('.library-card').innerText(), /远行者/);
  assert.match(await page.locator('.library-card').innerText(), /未发送的草稿/);
  await page.locator('.library-card button').click();
  assert.equal(await page.locator('#action-input').inputValue(), '下次再去调度室');
  await page.reload();
  await page.locator('#reader').waitFor();
  assert.match(await page.locator('#scene-context').innerText(), /远行者/);
  await route(page, 'setup/orbit');
  assert.equal(await page.locator('#identity-name').getAttribute('readonly'), '');
  await route(page, 'detail/book');
  await page.locator('#page-detail [data-start="book"]').click();
  await page.locator('#reader').waitFor();
  assert.match(await page.locator('#scene-title').innerText(), /书店/);
  await route(page, 'stories');
  assert.equal(await page.locator('.library-card').count(), 2);
  await route(page, 'create');
  await page.locator('#creator-title').fill('自定义的故事');
  await page.locator('#creator-opening').fill('<img src=x onerror=alert(1)> 一段等待回应的开场。');
  assert.equal(await page.locator('#preview-opening img').count(), 0);
  assert.match(await page.locator('#preview-opening').innerText(), /<img/);
  await page.locator('#creator-form button[type=submit]').click();
  assert.match(await page.locator('#creator-save-status').innerText(), /已保存/);
  await page.reload();
  await page.locator('#page-create').waitFor();
  assert.equal(await page.locator('#creator-title').inputValue(), '自定义的故事');
  assert.equal(await page.locator('#creator-opening').inputValue(), '<img src=x onerror=alert(1)> 一段等待回应的开场。');
  await route(page, 'account');
  assert.equal(await page.locator('.account-count strong').innerText(), '2');
  await page.locator('[data-theme-choice="light"]').click();
  await page.locator('#page-account [data-font="21"]').click();
  await page.reload();
  await page.locator('#page-account').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('#page-account [data-font="21"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#site-nav a[href="#stories"]').click();
  await page.locator('#page-stories').waitFor();
  await page.goBack();
  await page.locator('#page-account').waitFor();
  await page.goto(`${base}/#play/not-a-card`);
  await page.locator('#gallery').waitFor();
  assert.equal(new URL(page.url()).hash, '#discover');
  const stories = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).stories, storageKey);
  assert.equal(stories.orbit.identity, '远行者');
  assert.equal(stories.book.identity, undefined);
  await page.close();
  console.log('PASS: detail, optional identity, direct start, saved story excerpts, route refresh/back, separate progress, safe creator draft/save, account preferences, invalid route fallback');

  const pages = ['discover', 'detail/orbit', 'setup/orbit', 'play/orbit', 'stories', 'create', 'account'];
  for (const width of [390, 768, 1440]) {
    for (const theme of ['dark', 'light']) {
      const sample = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      observe(sample);
      await sample.goto(`${base}/#discover`);
      if (theme === 'light') await sample.locator('#theme-button').click();
      for (const path of pages) {
        await route(sample, path);
        if (path === 'stories') {
          await route(sample, 'play/orbit');
          await sample.locator('#choices [data-action="inspect"]').click();
          await sample.waitForFunction(() => document.querySelector('#stop-button').hidden);
          await route(sample, 'play/book');
          await sample.locator('#choices [data-action="hours"]').click();
          await sample.waitForFunction(() => document.querySelector('#stop-button').hidden);
          await route(sample, 'stories');
        }
        await saveScreenshot(sample, `${width}-${theme}-${path.replace('/', '-')}`);
      }
      await sample.close();
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(failedResponses, []);
  const labels = ['发现 · 选择一个起点', '详情 · 理解这段体验', '身份 · 可选的开局调整', '游玩 · 阅读、行动与查看', '故事 · 回到上次的经历', '创作 · 写下与预览', '我的 · 阅读与保存偏好'];
  for (const theme of ['dark', 'light']) {
    const background = theme === 'dark' ? '#151615' : '#f6f3ec';
    const foreground = theme === 'dark' ? '#ede9df' : '#2e332d';
    const composites = [];
    for (const [index, path] of pages.entries()) {
      const left = 24 + index % 2 * 756;
      const top = 20 + Math.floor(index / 2) * 550;
      const label = Buffer.from(`<svg width="720" height="48" xmlns="http://www.w3.org/2000/svg"><text x="8" y="32" font-size="25" fill="${foreground}" font-family="sans-serif">0${index + 1} / ${labels[index]}</text></svg>`);
      const preview = await sharp(`${evidence}/1440-${theme}-${path.replace('/', '-')}.png`).resize({ width: 720, height: 480, fit: 'contain', background }).png().toBuffer();
      composites.push({ input: label, left, top }, { input: preview, left, top: top + 52 });
    }
    await sharp({ create: { width: 1536, height: 2220, channels: 3, background } }).composite(composites).png().toFile(`${evidence}/overview-${theme}.png`);
  }
  console.log(`PASS: 7 page types × 3 widths × 2 themes = 42 screenshots in ${evidence}; no page errors, failed resources or external/API requests`);
} finally {
  await browser.close();
}
