import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { checkLibraryRecovery } from './story-library-recovery-check.mjs';

export async function checkDeployedPresentations({ browser, execute, query, base, directory, screenshots, errors, mutations, budget, observeRateLimit }) {
  const manifest = JSON.parse(await readFile('backups/exploration/presentation-adoption-20261027/manifest.json', 'utf8'));
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  assert.equal(manifest.target, 'exploration-3081');
  for (const identifier of [manifest.userId, manifest.tenantId, ...manifest.cards.map(card => card.characterId)]) assert.match(identifier, uuid);
  const owner = JSON.parse(await query(`SELECT json_build_object('id',id,'tenantId',tenant_id,'email',email,'role',role) FROM users WHERE id='${manifest.userId}' AND tenant_id='${manifest.tenantId}'`));
  const signingCode = "import {SignJWT} from 'jose';const owner=JSON.parse(process.argv[1]);const token=await new SignJWT({userId:owner.id,tenantId:owner.tenantId,email:owner.email,role:owner.role,type:'access'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.JWT_SECRET));process.stdout.write(token)";
  const accessToken = (await execute('docker', ['exec', 'squaretable-exploration-app-1', 'node', '--input-type=module', '-e', signingCode, JSON.stringify(owner)])).stdout.trim();
  const response = await fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.user.id, owner.id);
  const cards = JSON.parse(await query(`SELECT coalesce(json_agg(json_build_object('id',c.id,'name',c.name,'text',p.draft->>'text')),'[]'::json) FROM characters c
    JOIN character_presentations p ON p.character_id=c.id WHERE c.creator_id='${owner.id}' AND c.tenant_id='${owner.tenantId}' AND NOT c.is_public`));
  assert.equal(cards.length, 3, 'Expected three private sourced introductions');
  assert.ok(cards.every(card => manifest.cards.some(entry => entry.characterId === card.id)));
  const context = await browser.newContext();
  let publicationPreviews = 0;
  let publicationGated = 0;
  const networkFailures = [];
  try {
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem('theme-preference', 'light');
      localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
    }, { token: accessToken, user: owner });
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/v1/') || request.method() === 'GET') return route.continue();
      if (url.pathname !== '/api/v1/analytics/vitals') mutations.push({ method: request.method(), path: url.pathname });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === base && !url.pathname.startsWith('/api/v1/analytics/')) networkFailures.push({ path: url.pathname, error: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (response.status() >= 400) networkFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    page.on('response', observeRateLimit);
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', frame => {
      if (JSON.parse(String(frame.payload)).type === 'user_message') mutations.push({ method: 'WebSocket', path: 'user_message' });
    }));
    async function screenshot(name) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
      await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
      screenshots.push(`${name}.png`);
    }
    for (const [index, card] of cards.entries()) {
      for (const width of [1440, 390]) {
        await budget();
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto(`${base}/characters/${card.id}`);
        await expect(page.locator('.story-summary')).toContainText(card.text);
        await expect(page.getByRole('region', { name: '整理与兼容检查', exact: true }).getByRole('button', { name: '检查这张卡', exact: true })).toBeEnabled();
        const compatibility = page.getByRole('region', { name: '体验支持情况', exact: true });
        await expect(compatibility.getByText('正在核对已绑定设定与身份声明…', { exact: true })).toHaveCount(0);
        await expect(compatibility.getByRole('alert')).toHaveCount(0);
        await expect(page.getByTestId('presentation-source')).toContainText('备选开场');
        await page.getByTestId('presentation-source').locator('summary').click();
        await screenshot(`real-presentation-${index + 1}-${width}`);
      }
      await budget();
      await page.goto(`${base}/characters/${card.id}/edit`);
      await expect(page.getByTestId('editor-presentation')).toContainText(card.text);
      await page.getByRole('button', { name: '玩家预览', exact: true }).click();
      await expect(page.getByTestId('creator-preview')).toContainText(card.text);
      await screenshot(`real-editor-${index + 1}-mobile`);
      await budget();
      await page.goto(`${base}/my-characters`);
      const item = page.locator('.character-card-wrapper').filter({ has: page.getByRole('button', { name: `查看故事: ${card.name}`, exact: true }) });
      await expect(item).toContainText(card.text);
      await item.locator('.private-story-more').click();
      const publish = page.getByRole('menuitem', { name: '提交发布', exact: true });
      if (await publish.isEnabled()) {
        await publish.click();
        await expect(page.getByTestId('publish-preview')).toContainText(card.text);
        await screenshot(`real-publish-preview-${index + 1}-mobile`);
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
        publicationPreviews++;
      } else {
        await page.keyboard.press('Escape');
        publicationGated++;
        await screenshot(`real-library-${index + 1}-mobile`);
      }
    }
    const preserved = manifest.cards.filter(entry => !cards.some(card => card.id === entry.characterId));
    assert.equal(preserved.length, 1);
    await budget();
    await page.goto(`${base}/characters/${preserved[0].characterId}`);
    await expect(page.locator('.story-summary')).toBeVisible();
    await expect(page.getByTestId('presentation-source')).toHaveCount(0);
    await screenshot('real-authored-introduction-mobile');
    if (process.argv.includes('--library-recovery')) {
      const recovery = await checkLibraryRecovery({ page, base, card: cards[0], budget, screenshot });
      await writeFile(`${directory}/library-recovery.json`, JSON.stringify({ result: 'passed', recovery,
        scope: 'Browser-injected hanging/429 reads followed by real read-only recovery; not the root cause of the prior intermittent load failure' }, null, 2), { mode: 0o600 });
    }
    return `Actual private card owner verified using a ten-minute local engineering access token, not a password-login test; three derived intros survive restart and appear on desktop/mobile detail, private library and creator; publication previews checked ${publicationPreviews}, unavailable under actual account feature gate ${publicationGated}; fourth card retains authored introduction; no saves, publication or stories submitted`;
  } catch (error) {
    for (const [index, page] of context.pages().entries()) {
      await page.screenshot({ path: `${directory}/presentation-failure-${index}.png`, fullPage: true }).catch(() => {});
      await writeFile(`${directory}/presentation-failure-${index}.html`, await page.content(), { mode: 0o600 }).catch(() => {});
    }
    await writeFile(`${directory}/presentation-network-failures.json`, JSON.stringify(networkFailures, null, 2), { mode: 0o600 });
    throw error;
  } finally {
    await context.close();
  }
}
