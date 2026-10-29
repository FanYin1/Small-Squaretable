import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const port = Number(process.env.EXPLORATION_DEMO_PORT || 5188);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://127.0.0.1:${port}`;
const screenshots = '/tmp/squaretable-exploration-demo';
const storageKey = 'small-squaretable-exploration-demo-v1';
await mkdir(screenshots, { recursive: true });
for (const path of ['/.env.beta', '/api/v1/characters', '/%2e%2e/.env', '/README.md']) {
  assert.equal((await fetch(`${base}${path}`)).status, 404, path);
}
assert.equal((await fetch(base, { method: 'POST' })).status, 404);
const browser = await chromium.launch({ headless: true });
const errors = [];
const requests = [];
const failures = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
}
async function saved(page, story) {
  return page.evaluate(({ key, story }) => JSON.parse(localStorage.getItem(key)).stories[story], { key: storageKey, story });
}
async function finish(page) {
  await page.waitForFunction(() => document.querySelector('#stop-button').hidden);
}
async function act(page, action) {
  await page.locator(`#choices [data-action="${action}"]`).click();
  await finish(page);
}
async function switchStory(page, story) {
  await page.locator('#home-button').click();
  await page.locator(`[data-start="${story}"]`).click();
  await page.locator('#reader').waitFor();
}
async function reset(page) {
  await page.locator('#settings-button').click();
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
  await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  observe(page);
  await page.goto(base);
  assert.equal(await page.locator('[data-start]').count(), 2);
  await page.locator('[data-start="orbit"]').click();
  await page.locator('#reader').waitFor();
  assert.match(await page.locator('#scene-title').innerText(), /维修舱/);
  await page.locator('#choices [data-action="inspect"]').evaluate(button => { button.click(); button.click(); });
  await finish(page);
  assert.equal((await saved(page, 'orbit')).turns.length, 1);
  assert.equal((await saved(page, 'orbit')).facts.length, 1);
  await page.locator('#desktop-tab-map').click();
  const beforePreview = await saved(page, 'orbit');
  await page.locator('#desktop-state [data-node="dispatch"]').click();
  assert.deepEqual(await saved(page, 'orbit'), beforePreview);
  await page.locator('#desktop-state [data-action="travel_dispatch"]').click();
  await finish(page);
  assert.equal((await saved(page, 'orbit')).clock, '19:20');
  await act(page, 'source');
  assert.equal((await saved(page, 'orbit')).facts.filter(fact => fact.kind === 'clue').length, 2);
  await act(page, 'travel_repair');
  assert.equal((await saved(page, 'orbit')).clock, '19:30');
  await act(page, 'travel_dispatch');
  assert.equal((await saved(page, 'orbit')).clock, '19:40');
  await page.locator('#desktop-tab-items').click();
  await page.locator('#desktop-state [data-source="0"]').click();
  assert.ok(await page.locator('#turn-0').isVisible());
  await page.locator('#desktop-tab-items').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#desktop-tab-map').getAttribute('aria-selected'), 'true');
  const unknown = '我想跳舞 <img src=x onerror=alert(1)>';
  await page.locator('#action-input').fill(unknown);
  await page.locator('#send-button').click();
  assert.match(await page.locator('#error-text').innerText(), /尚未覆盖/);
  assert.equal(await page.locator('#action-input').inputValue(), unknown);
  const safeInput = '问问林澈 <img src=x onerror=alert(1)>';
  await page.locator('#action-input').fill(safeInput);
  await page.locator('#send-button').click();
  await finish(page);
  assert.equal(await page.locator('#transcript img').count(), 0);
  assert.equal(await page.locator('.user-action').last().textContent(), `你的行动${safeInput}`);
  await page.locator('#action-input').fill('下次继续查港务处');
  const orbitSnapshot = await saved(page, 'orbit');
  await switchStory(page, 'book');
  assert.equal(await page.locator('#desktop-tab-map').count(), 0);
  assert.equal(await page.locator('#desktop-tab-items').count(), 0);
  await page.locator('#action-input').fill('我想晚一点开门');
  await page.keyboard.press('Enter');
  await finish(page);
  await act(page, 'promise');
  await act(page, 'visit');
  assert.equal((await saved(page, 'book')).clock, '次日 10:30');
  assert.match(await page.locator('.turn').last().innerText(), /十点以后再来，我记得/);
  assert.deepEqual(await saved(page, 'orbit'), orbitSnapshot);
  await page.reload();
  await page.locator('#home-button').click();
  assert.match(await page.locator('[data-start="book"]').innerText(), /继续/);
  await page.locator('[data-start="book"]').click();
  assert.match(await page.locator('#scene-context').innerText(), /次日 10:30/);
  await switchStory(page, 'orbit');
  assert.equal(await page.locator('#action-input').inputValue(), '下次继续查港务处');
  await switchStory(page, 'book');
  await reset(page);
  assert.deepEqual(await saved(page, 'orbit'), orbitSnapshot);
  await act(page, 'promise');
  const originalPromise = (await saved(page, 'book')).facts[0];
  await act(page, 'hours');
  const adjusted = await saved(page, 'book');
  assert.deepEqual(adjusted.facts[0], originalPromise);
  assert.match(adjusted.facts.at(-1).text, /改为 10:30/);
  assert.equal(adjusted.facts.at(-1).turn, 1);
  await act(page, 'visit');
  assert.equal((await saved(page, 'book')).clock, '次日 10:30');
  await reset(page);
  await page.locator('#choices [data-action="hours"]').click();
  await page.waitForFunction(() => document.querySelector('#live-text').textContent.length > 5);
  await page.locator('#stop-button').click();
  const stopped = await saved(page, 'book');
  assert.equal(stopped.hours, '09:00');
  assert.equal(stopped.facts.length, 0);
  assert.equal(stopped.turns.length, 1);
  assert.match(stopped.turns[0].changes[0], /已停止/);
  assert.match(stopped.draft, /晚一点/);
  await page.locator('#settings-button').click();
  await page.locator('#arm-failure').click();
  await page.keyboard.press('Escape');
  await page.locator('#send-button').click();
  await page.locator('#retry-button').waitFor();
  assert.equal((await saved(page, 'book')).turns.length, 1);
  assert.equal((await saved(page, 'book')).hours, '09:00');
  assert.match(await page.locator('#error-text').innerText(), /失败/);
  await page.locator('#retry-button').click();
  await finish(page);
  assert.equal((await saved(page, 'book')).turns.length, 2);
  assert.equal((await saved(page, 'book')).hours, '10:00');
  await page.locator('#settings-button').click();
  await page.locator('[data-font="21"]').click();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--reading-size')), '21px');
  await page.keyboard.press('Escape');
  await page.locator('#theme-button').click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--reading-size')), '21px');
  console.log('PASS: transitions, duplicate submission, read-only map, provenance, keyboard tabs, input escaping, recovery, isolation, stop, failure/retry, preferences');
  await page.close();

  for (const width of [390, 768, 1440]) {
    const sample = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 } });
    observe(sample);
    await sample.goto(base);
    for (const theme of ['dark', 'light']) {
      await screenshot(sample, `${width}-${theme}-gallery`);
      for (const story of ['orbit', 'book']) {
        await sample.locator(`[data-start="${story}"]`).click();
        await sample.locator('#reader').waitFor();
        assert.equal(await sample.locator('#reading-scroll').evaluate(node => node.scrollTop), 0, 'new story starts at its opening');
        await screenshot(sample, `${width}-${theme}-${story}`);
        assert.ok(await sample.evaluate(() => document.querySelector('#send-button').getBoundingClientRect().bottom <= innerHeight), 'send button below viewport');
        if (width < 820) {
          await sample.locator('#state-button').click();
          await sample.locator(`#mobile-tab-${story === 'orbit' ? 'map' : 'promises'}`).click();
          await screenshot(sample, `${width}-${theme}-${story}-state`);
          await sample.keyboard.press('Escape');
          assert.equal(await sample.evaluate(() => document.activeElement.id), 'state-button');
        }
        await sample.locator('#home-button').click();
      }
      if (theme === 'dark') await sample.locator('#theme-button').click();
    }
    await sample.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  assert.ok(requests.every(url => url.startsWith(`${base}/`) && !url.includes('/api/')));
  console.log(`PASS: 390/768/1440px, light/dark, mobile drawer focus, 26 screenshots in ${screenshots}; no browser errors or external/API requests`);
} finally {
  await browser.close();
}
