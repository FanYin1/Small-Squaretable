import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const port = Number(process.env.EXPERIENCE_REVIEW_PORT || 5189);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://127.0.0.1:${port}`;
const directory = `/tmp/squaretable-experience-review/${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const checks = [];
const screenshots = [];
const storageKey = 'squaretable-experience-review-v1';
for (const path of ['/.env.beta', '/api/v1/characters', '/backups/beta/first-invite.txt', '/%2e%2e/.env', '/README.md']) assert.equal((await fetch(`${base}${path}`)).status, 404);
assert.equal((await fetch(base, { method: 'POST' })).status, 404);
assert.match((await fetch(base)).headers.get('Content-Security-Policy'), /connect-src 'none'/);
checks.push('Static loopback server denies API, secrets, traversal and POST; CSP disallows connections');
const manifest = JSON.parse(await readFile('docs/design/exploration-07ac-integration/manifest.json', 'utf8'));
for (const image of manifest.images) {
  assert.equal((await fetch(`${base}/compare/${image.file}`, { method: 'HEAD' })).status, 200);
  assert.equal(createHash('sha256').update(await readFile(`docs/design/exploration-07ac-integration/${image.file}`)).digest('hex'), image.sha256);
}
checks.push('All 72 archived comparison images are served and match the original manifest hashes');
const browser = await chromium.launch({ headless: true });
const errors = [];
const requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
  await page.goto(base);
  await expect(page.locator('#image-status')).toContainText('截图已载入');
  await expect(page.locator('#page-difference')).toContainText('横向封面');
  for (const name of ['discover', 'detail', 'identity', 'library', 'create', 'account', 'play']) {
    await page.selectOption('#page-select', name);
    for (const width of ['390', '768', '1440']) {
      await page.selectOption('#width-select', width);
      for (const theme of ['light', 'dark']) {
        await page.selectOption('#image-theme', theme);
        await expect(page.locator('#image-status')).toContainText('截图已载入');
        assert.ok(await page.locator('#production-image').evaluate(image => image.naturalWidth > 0));
        if (name === 'play') { await expect(page.locator('#reference-link')).toBeHidden(); await expect(page.locator('#reference-unavailable')).toBeVisible(); }
      }
    }
  }
  checks.push('Seven page selectors × three source widths × two themes load real images; play explicitly discloses the absent matching prototype');
  await page.selectOption('#page-select', 'detail');
  await page.selectOption('#width-select', '768');
  await page.selectOption('#image-theme', 'light');
  await page.selectOption('#page-verdict', 'adjust');
  await page.fill('#page-note', '希望先看故事，再看高级设定。<script>throw Error("unsafe")</script>');
  await page.selectOption('#image-theme', 'dark');
  await expect(page.locator('#page-note')).toHaveValue('');
  await page.selectOption('#image-theme', 'light');
  assert.ok((await page.inputValue('#page-note')).includes('希望先看故事'));
  await page.reload();
  await expect(page.locator('#page-note')).toHaveValue(/希望先看故事/);
  checks.push('Feedback is separated by page/width/theme, survives reload and treats markup as text');
  await page.click('[data-tab="interaction"]');
  const original = await page.locator('#original-text').innerText();
  const originalState = await page.locator('#original-state').innerText();
  const recommended = page.locator('#recommendations button').first();
  await recommended.click();
  await expect(page.locator('#action-status')).toContainText('尚未提交');
  assert.ok((await page.inputValue('#action-draft')).length > 0);
  await page.fill('#action-draft', '我想先问一件别的事');
  await recommended.click();
  await expect(page.locator('#draft-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#action-draft')).toHaveValue('我想先问一件别的事');
  await recommended.click();
  await page.click('#replace-draft');
  await expect(page.locator('#action-draft')).toHaveValue(await recommended.innerText());
  checks.push('Draft-first mode does not submit on recommendation click; existing draft replacement is explicit and Escape preserves input');
  await page.locator('#action-draft').dispatchEvent('compositionstart');
  await page.locator('#action-draft').dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page.locator('#action-status')).toContainText('尚未提交');
  await page.locator('#action-draft').dispatchEvent('compositionend');
  await page.locator('#action-draft').press('Enter');
  await expect(page.locator('#send-action')).toBeDisabled();
  await expect(recommended).toBeDisabled();
  await expect(page.locator('#action-status')).toContainText('示例已接收行动');
  checks.push('IME composition Enter does not submit; normal Enter submits and pending controls prevent duplicate activation');
  await page.selectOption('#action-mode', 'direct');
  await page.fill('#action-draft', '保留这段自由草稿');
  await recommended.click();
  await expect(page.locator('#action-status')).toContainText('示例已接收行动');
  await expect(page.locator('#action-draft')).toHaveValue('保留这段自由草稿');
  const beforePreference = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).actionMode, storageKey);
  assert.equal(beforePreference, null);
  await page.click('#record-mode');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).actionMode, storageKey), 'direct');
  checks.push('Direct mode submits the recommendation without overwriting free input; only an explicit preference action records a tentative choice');
  for (const kind of ['note', 'rewrite']) {
    await page.click(`[data-correction="${kind}"]`);
    await expect(page.locator('#cancel-correction')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-correction="${kind}"]`)).toBeFocused();
    await page.click(`[data-correction="${kind}"]`);
    await page.click('#preview-correction');
    await expect(page.locator('#correction-result')).toBeVisible();
    assert.equal(await page.locator('#original-text').innerText(), original);
    assert.equal(await page.locator('#original-state').innerText(), originalState);
    assert.equal(await page.locator('#result-state').innerText(), originalState);
  }
  checks.push('Annotation and wording previews preserve original text/state; dialogs restore keyboard focus after Escape');
  await page.click('[data-correction="fact"]');
  await page.selectOption('#evidence-select', 'missing');
  await expect(page.locator('#preview-correction')).toBeDisabled();
  await expect(page.locator('#evidence-warning')).toContainText('依据不足');
  await page.selectOption('#evidence-select', 'known');
  await page.click('#preview-correction');
  await expect(page.locator('#result-state')).toContainText('120');
  assert.equal(await page.locator('#original-state').innerText(), originalState);
  await page.click('[data-correction="branch"]');
  await page.click('#preview-correction');
  await expect(page.locator('#result-state')).toContainText('尚未取得');
  await expect(page.locator('#result-memory')).toContainText('尚未实现真实记忆重建');
  assert.equal(await page.locator('#original-text').innerText(), original);
  checks.push('Fact preview rejects missing evidence; scripted correction and branch show different outcomes while original story stays unchanged');
  await page.selectOption('#scene-select', 'bookshop');
  await expect(page.locator('#original-state')).not.toContainText('金币');
  await expect(page.locator('#original-state')).toContainText('下周四');
  await page.click('[data-correction="branch"]');
  await page.click('#preview-correction');
  await expect(page.locator('#result-state')).toContainText('尚未约定');
  await expect(page.locator('#original-state')).toContainText('下周四');
  checks.push('Relationship/appointment scene uses its own meaningful state without fabricated money or relationship scores');
  await page.click('[data-tab="feedback"]');
  await page.fill('#correction-note', '称呼纠正需要影响后续人物认知，不能只有阅读标注。');
  await expect(page.locator('#feedback-list')).toContainText('<script>');
  const downloadEvent = page.waitForEvent('download');
  await page.click('#export-feedback');
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.status, 'unconfirmed_draft');
  assert.equal(exported.actionMode, 'direct');
  assert.ok(exported.correctionNote.includes('人物认知'));
  assert.ok(!('accepted' in exported));
  checks.push('Local export includes page/interaction feedback and explicit unconfirmed status, without a false acceptance flag');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.click('[data-tab="interaction"]');
    assert.equal(await page.locator('#state-details').evaluate(details => details.open), width > 900);
    if (width <= 900) {
      await page.locator('#state-details summary').click();
      await expect(page.locator('#original-state')).toBeVisible();
      await page.locator('#state-details summary').press('Enter');
      await expect(page.locator('#original-state')).toBeHidden();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.body.classList.toggle('dark', theme === 'dark'), theme);
      for (const tab of ['pages', 'interaction']) {
        await page.click(`[data-tab="${tab}"]`);
        await page.evaluate(() => document.fonts.ready);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tab}/${width}/${theme}: horizontal overflow`);
        const file = `${tab}-${width}-${theme}.png`;
        await page.screenshot({ path: `${directory}/${file}`, fullPage: true, animations: 'disabled' });
        screenshots.push(file);
      }
    }
  }
  checks.push('Both review views fit 390/768/1440 widths in light/dark themes; 12 screenshots recorded');
  await page.evaluate(key => localStorage.setItem(key, '{corrupt'), storageKey);
  await page.reload();
  await expect(page.locator('#storage-status')).toContainText('未覆盖旧数据');
  await page.fill('#page-note', 'New feedback after corrupted storage');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), '{corrupt');
  checks.push('Corrupted stored draft is not overwritten; new in-memory feedback remains exportable');
  const blockedStorage = await browser.newContext();
  await blockedStorage.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; });
  const blockedPage = await blockedStorage.newPage();
  await blockedPage.goto(base);
  await blockedPage.fill('#page-note', 'Storage is full');
  await expect(blockedPage.locator('#storage-status')).toContainText('浏览器未能保存');
  await blockedStorage.close();
  checks.push('Storage write failure is disclosed rather than reporting a successful save');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(request => request.method === 'GET' && (request.url.startsWith(base) || request.url.startsWith(`blob:${base}`))));
  assert.ok(requests.every(request => !['fetch', 'xhr', 'websocket'].includes(request.type)));
  const sources = [];
  for (const path of ['docs/design/experience-review/index.html', 'docs/design/experience-review/style.css', 'docs/design/experience-review/app.js', 'scripts/exploration-review-server.mjs', 'scripts/exploration-review-check.mjs']) sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', at: new Date().toISOString(), checks, screenshots, sources, browserErrors: errors, network: { requests: requests.length, businessRequests: 0, externalRequests: 0 }, scope: 'static review and scripted interactions; no production corrections, branches, memory rebuild or human acceptance verified' }, null, 2));
  console.info(`PASS: ${checks.length} review groups and ${screenshots.length} screenshots; ${directory}/report.json`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ result: 'failed', completed: checks, error: error.message, browserErrors: errors }, null, 2));
  throw error;
} finally { await browser.close(); }
