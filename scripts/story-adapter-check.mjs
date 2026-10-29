import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { expect } from '@playwright/test';
import { checkPresentationIntegration } from './story-presentation-integration-check.mjs';
import { checkPresentationQueue } from './story-presentation-queue-check.mjs';
import { checkReviewedRitual } from './story-ritual-check.mjs';

export async function checkStoryAdapter({ browser, base, sql, auth, csrf, serviceEnvironment, restartServer, getStreamCount }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-adapter-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const checks = [];
  const check = name => { checks.push(name); console.info(`Adapter check: ${name}`); };
  const streams = getStreamCount();
  const previous = Object.fromEntries(Object.keys(serviceEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, serviceEnvironment);
  const loader = register({ namespace: `adapter-${randomUUID()}` });
  const database = drizzle(sql);
  const errors = [];
  const networkFailures = [];
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const reset = Number(headers['x-ratelimit-reset']);
    remaining = reset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, reset);
  }
  async function budget() {
    if (remaining >= 40) return;
    while (Date.now() < resetAt + 1000) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1000 - Date.now())));
    remaining = 100;
  }
  async function api(path, body, expected = 200, method = body ? 'POST' : 'GET') {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, { method,
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf,
        ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    observe(Object.fromEntries(response.headers));
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${JSON.stringify(result.error ?? '')}`);
    return result.data ?? result;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(base)) networkFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => observe(response.headers()));
  page.on('request', request => { csrf = request.headers()['x-csrf-token'] || csrf; });
  try {
    if (process.env.STORY_RECOMMENDATIONS_CHECK === '1') {
      const { checkStoryRecommendations } = await import('./story-recommendations-check.mjs');
      const gameplay = await checkStoryRecommendations({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget });
      assert.deepEqual(errors, []);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, gameplay, browserErrors: errors }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} recommendation groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_OPENING_MODE_GAMEPLAY_CHECK === '1') {
      const { checkOpeningModeGameplay } = await import('./story-opening-mode-gameplay-check.mjs');
      const gameplay = await checkOpeningModeGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget });
      assert.deepEqual(errors, []);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, gameplay, browserErrors: errors }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} opening mode gameplay groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_FIRST_TASK_GAMEPLAY_CHECK === '1') {
      const { checkFirstTaskGameplay } = await import('./story-first-task-gameplay-check.mjs');
      const gameplay = await checkFirstTaskGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget });
      assert.deepEqual(errors, []);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, gameplay, browserErrors: errors }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} first task gameplay groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_FIRST_TASK_CHECK === '1') {
      const { checkFirstTask } = await import('./story-first-task-check.mjs');
      const firstTask = await checkFirstTask({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget });
      assert.deepEqual(errors, []);
      assert.equal(getStreamCount(), streams);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, firstTask, browserErrors: errors, additionalModelCalls: 0 }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} original first task groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_OPENING_MODE_CHECK === '1') {
      const { checkOpeningModes } = await import('./story-opening-mode-check.mjs');
      const openingModes = await checkOpeningModes({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget });
      assert.deepEqual(errors, []);
      assert.equal(getStreamCount(), streams);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, openingModes, browserErrors: errors, additionalModelCalls: 0 }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} opening mode groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_RITUAL_IDENTITY_CHECK === '1') {
      const ritual = await checkReviewedRitual({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget });
      assert.deepEqual(errors, []);
      assert.equal(getStreamCount(), streams);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, ritual, browserErrors: errors, additionalModelCalls: 0 }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} ritual identity groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_ADAPTER_SOURCE_CHECK === '1') {
      const { checkAdapterSourceGates } = await import('./story-adapter-source-check.mjs');
      const sourceGates = await checkAdapterSourceGates({ loader, database, sql, api, auth, page, base, directory, restartServer, budget });
      assert.deepEqual(errors, []);
      assert.equal(getStreamCount(), streams);
      await writeFile(`${directory}/result.json`, JSON.stringify({ sourceGates, browserErrors: errors, additionalModelCalls: 0 }, null, 2), { mode: 0o600 });
      console.info(`PASS: source activation gates, obsolete receipts and frozen continuation; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_LIBRARY_RECOVERY_CHECK === '1') {
      const { checkLibraryRecovery } = await import('./story-library-recovery-check.mjs');
      const card = await api('/characters', { name: '故事库恢复隔离检查', description: '合成读取验收', cardData: { first_mes: '你好。' } }, 201);
      const screenshots = [];
      const screenshot = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
        screenshots.push(`${name}.png`);
      };
      const recovery = await checkLibraryRecovery({ page, base, card, budget, screenshot });
      assert.deepEqual(errors, []);
      assert.equal(getStreamCount(), streams);
      await writeFile(`${directory}/result.json`, JSON.stringify({ recovery, screenshots, browserErrors: errors, additionalModelCalls: 0 }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${recovery.length} library recovery groups; evidence ${directory}`);
      return;
    }
    if (process.env.STORY_RITUAL_GAMEPLAY_CHECK === '1') {
      const { checkRitualGameplay } = await import('./story-ritual-gameplay-check.mjs');
      const gameplay = await checkRitualGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget });
      assert.deepEqual(errors, []);
      await writeFile(`${directory}/result.json`, JSON.stringify({ checks, gameplay, browserErrors: errors }, null, 2), { mode: 0o600 });
      console.info(`PASS: ${checks.length} ritual gameplay groups; evidence ${directory}`);
      return;
    }
    const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
    const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const owner = [auth.user.id, auth.user.tenantId];
    const createJob = characterId => jobs.createAdapterJob(characterId, ...owner, randomUUID(), database);
    const readJob = async jobId => (await sql`SELECT * FROM story_adapter_jobs WHERE id=${jobId}`)[0];
    const cancelJob = (characterId, jobId) => jobs.cancelAdapterJob(characterId, jobId, ...owner, database);
    const rules = { version: 1, fields: [{ id: 'coins', label: '金币', type: 'number', initial: 10, min: 0 },
      { id: 'found', label: '已发现', type: 'boolean', initial: false }], actions: [
      { id: 'pay', label: '支付3枚', intent: 'act', requires: [{ field: 'coins', operator: 'gte', value: 3 }], changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: '支付3枚。' },
      { id: 'find', label: '调查', intent: 'observe', once: true, requires: [{ field: 'found', operator: 'eq', value: false }],
        changes: [{ field: 'found', operation: 'set', value: true }, { field: 'coins', operation: 'add', value: 2 }], outcome: '发现2枚。' },
    ] };
    const declaration = `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(rules)}\n\u0060\u0060\u0060`;
    const card = await api('/characters', { name: '显式规则隔离验收', description: '作者保留的港口介绍', cardData: {
      first_mes: '你站在港口，船长认真听着你的决定。', alternate_greetings: ['你刚刚走下渡轮。'],
      character_book: { entries: [{ keys: ['金币'], content: declaration, constant: true }] },
    } }, 201);
    const original = (await sql`SELECT card_data FROM characters WHERE id=${card.id}`)[0].card_data;
    const beforeCredits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`;
    const oldStory = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
    const staleProfile = await api(`/characters/${card.id}/story-entry`);
    const requestId = randomUUID();
    const [first, duplicate] = await Promise.all([
      api(`/characters/${card.id}/adaptations`, { requestId }, 202),
      api(`/characters/${card.id}/adaptations`, { requestId }, 202),
    ]);
    assert.equal(first.id, duplicate.id);
    await api(`/characters/${card.id}/adaptations`, { requestId: randomUUID() }, 409);
    await api(`/characters/${card.id}/adaptations/${randomUUID()}/cancel`, {}, 404);
    await assert.rejects(() => jobs.listAdapterJobs(card.id, randomUUID(), auth.user.tenantId, database));
    await assert.rejects(() => jobs.listAdapterJobs(card.id, auth.user.id, randomUUID(), database));
    assert.equal(await jobs.runNextAdapterJob(database), true);
    const ready = await readJob(first.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.artifact.conclusion, 'supported');
    assert.equal(ready.artifact.sources.length, 1);
    assert.equal((await api(`/characters/${card.id}/adaptations`))[0].result.fieldCount, 2);
    assert.equal((await cancelJob(card.id, first.id)).status, 'ready');
    check('AD-J01: durable idempotent queue, active-request conflict, author/tenant isolation, source proofs and immutable ready receipt');

    const selection = profile => ({ characterId: card.id, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false });
    await api('/chats', { characterId: card.id, clientRequestId: randomUUID(), opening: selection(staleProfile) }, 409);
    const profile = await api(`/characters/${card.id}/story-entry`);
    assert.equal(profile.rulesStatus, 'adapted');
    const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID(), opening: selection(profile) }, 201);
    const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
    assert.equal(frozen.characters[0].adaptation.jobId, first.id);
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields.find(field => field.id === 'coins').value, 10);
    assert.deepEqual((await api(`/chats/${oldStory.id}/story-state`)).fields, []);
    check('AD-J02: stale opening preview rejected; chosen opening, source revision and compiled artifact freeze atomically; old stories retain original rules');

    async function turn(chat, actionId, interrupted = false) {
      const [state] = await sql`SELECT version FROM story_states WHERE chat_id=${chat.id}`;
      const text = rules.actions.find(action => action.id === actionId).label;
      const prepared = await prepareStoryTurn(chat, text, { actionId, expectedVersion: state.version }, database);
      const [input] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${text}) RETURNING id`;
      const request = randomUUID();
      const output = interrupted ? '未完成的回应' : `${text}，船长认真回应。`;
      const committed = await commitStoryTurn(prepared, Number(input.id), request, output, interrupted, database);
      if (!interrupted) await commitStoryTurn(prepared, Number(input.id), request, output, interrupted, database);
      return committed;
    }
    await turn(story, 'pay');
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields[0].value, 7);
    await turn(story, 'pay', true);
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields[0].value, 7);
    await turn(story, 'find');
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields[0].value, 9);
    await assert.rejects(() => prepareStoryTurn(story, '调查', { actionId: 'find', expectedVersion: 3 }, database));
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '留在港口，重新调查。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, ...owner, branchInput);
    assert.equal(preview.fields[0].value, 7);
    const branch = await corrections.fork(story.id, ...owner, branchInput, preview.digest);
    assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${branch.chat.id}`)[0].snapshot.characters[0].adaptation, frozen.characters[0].adaptation);
    for (let index = 0; index < 2; index++) await turn(branch.chat, 'pay');
    assert.equal((await api(`/chats/${branch.chat.id}/story-state`)).fields[0].value, 1);
    await assert.rejects(() => prepareStoryTurn(branch.chat, '支付3枚', { actionId: 'pay', expectedVersion: 3 }, database));
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields[0].value, 9);
    check('AD-J03: adapted set/add/conditions/once run through existing turn commits; duplicate/interrupted turns cannot double-charge; branches replay frozen rules and remain independent');

    const queued = await createJob(card.id);
    await cancelJob(card.id, queued.id);
    assert.equal(await jobs.runNextAdapterJob(database), false);
    for (const stageToCancel of ['inspect', 'complete']) {
      const candidate = await createJob(card.id);
      await jobs.runNextAdapterJob(database, { checkpoint: async stage => {
        if (stage === stageToCancel) await cancelJob(card.id, candidate.id);
      } });
      assert.equal((await readJob(candidate.id)).status, 'cancelled');
      assert.equal((await readJob(candidate.id)).artifact, null);
    }
    const failed = await createJob(card.id);
    await jobs.runNextAdapterJob(database, { checkpoint: async () => { throw new Error('Injected unavailable compiler'); } });
    assert.equal((await readJob(failed.id)).status, 'failed');
    const recovered = await createJob(card.id);
    await jobs.runNextAdapterJob(database);
    assert.equal((await readJob(recovered.id)).status, 'ready');
    assert.equal((await jobs.createAdapterJob(card.id, ...owner, failed.requestId ?? (await readJob(failed.id)).request_id, database)).id, failed.id);
    check('AD-J04: queued/running/late cancellation never publishes; failed attempts preserve receipts and explicit retries create independent versions');

    const entry = (await sql`SELECT entry.id FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id WHERE book.character_id=${card.id}`)[0];
    for (const stageToChange of ['before', 'complete']) {
      const candidate = await createJob(card.id);
      const change = () => sql`UPDATE worldbook_entries SET content=content || E'\n资料修订' WHERE id=${entry.id}`;
      if (stageToChange === 'before') await change();
      await jobs.runNextAdapterJob(database, { checkpoint: async stage => { if (stage === stageToChange) await change(); } });
      assert.equal((await readJob(candidate.id)).status, 'stale');
      assert.equal((await readJob(candidate.id)).artifact, null);
    }
    assert.notEqual((await api(`/characters/${card.id}/story-entry`)).rulesStatus, 'adapted');
    assert.equal((await api(`/characters/${card.id}/adaptations`))[0].current, false);
    assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
    const fresh = await createJob(card.id);
    await jobs.runNextAdapterJob(database);
    assert.equal((await readJob(fresh.id)).status, 'ready');
    check('AD-J05: changes before collect or before publish invalidate work; old source results cannot enable new stories, existing snapshots remain byte-for-byte stable');

    const reclaimed = await createJob(card.id);
    let firstLease;
    await jobs.runNextAdapterJob(database, { checkpoint: async (stage, job) => {
      if (stage !== 'complete') return;
      firstLease = job.leaseId;
      await sql`UPDATE story_adapter_jobs SET lease_until=now()-interval '1 second' WHERE id=${job.id}`;
      await jobs.runNextAdapterJob(database);
    } });
    const reclaimedResult = await readJob(reclaimed.id);
    assert.ok(firstLease);
    assert.equal(reclaimedResult.status, 'ready');
    assert.equal(reclaimedResult.attempt, 2);
    const exhausted = await createJob(card.id);
    await sql`UPDATE story_adapter_jobs SET status='running',attempt=3,lease_id=${randomUUID()},lease_until=now()-interval '1 second' WHERE id=${exhausted.id}`;
    assert.equal(await jobs.runNextAdapterJob(database), false);
    assert.equal((await readJob(exhausted.id)).status, 'failed');
    assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${card.id}`)[0].card_data, original);
    await restartServer();
    assert.equal((await api(`/chats/${story.id}/story-state`)).fields[0].value, 9);
    assert.equal((await api(`/characters/${card.id}/adaptations`)).find(job => job.id === reclaimed.id).status, 'ready');
    check('AD-J06: expired leases are reclaimed, former worker cannot overwrite winner, retry limit terminates, restart preserves state and immutable author card');

    const realCards = [];
    for (const filename of ['蔚蓝星域.png', 't1.png', 't2.png', 't3.png']) {
      const body = new FormData();
      body.append('files', new Blob([await readFile(`/mnt/c/Users/19158/Desktop/${filename}`)], { type: 'image/png' }), filename);
      const imported = await api('/characters/import/batch', body);
      assert.equal(imported.failed.length, 0);
      const importedId = imported.imported[0].id;
      const before = (await sql`SELECT card_data FROM characters WHERE id=${importedId}`)[0].card_data;
      const task = await createJob(importedId);
      await jobs.runNextAdapterJob(database);
      const result = await readJob(task.id);
      assert.equal(result.status, 'ready');
      assert.equal(result.artifact.conclusion, 'unsupported');
      assert.equal(result.artifact.rules, undefined);
      const listed = (await api(`/characters/${importedId}/adaptations`))[0];
      assert.equal(listed.current, true);
      assert.equal(listed.result.inspection.sourceRevision, listed.sourceRevision);
      assert.equal(listed.result.inspection.coverage, 'complete');
      assert.ok(listed.result.inspection.groups.some(group => group.kind === 'numeric-change'));
      assert.ok(listed.result.inspection.groups.some(group => group.kind === 'periodic'));
      assert.equal(result.artifact.inspection, undefined);
      assert.ok(!JSON.stringify(listed.result.inspection).includes('content'));
      assert.ok(JSON.stringify(listed.result.inspection).length < 15000);
      assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${importedId}`)[0].card_data, before);
      realCards.push({ filename, conclusion: result.artifact.conclusion, reason: result.artifact.reason,
        inspection: { coverage: listed.result.inspection.coverage, sourceCount: listed.result.inspection.sourceCount,
          groups: listed.result.inspection.groups.map(group => ({ kind: group.kind, occurrences: group.occurrences })) } });
      await budget();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto(`${base}/characters/${importedId}`);
        const clues = page.getByRole('region', { name: '规则线索与依赖核对', exact: true });
        assert.equal(await clues.getAttribute('open'), null);
        await clues.locator('summary').first().click();
        await expect(clues).toContainText('文本线索不是已确认规则');
        await expect(clues).toContainText('周期与轮次线索');
        await clues.getByText('查看来源定位（最多3份）', { exact: true }).first().click();
        await expect(clues).toContainText('摘要');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${directory}/rule-clues-${realCards.length}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
    }
    check('AD-J07: four original local cards are imported and inspected without mutation; unsupported third-party mechanisms are not falsely marked as runnable');
    check('RI-01: four original cards expose bounded, owner-only current-source clue categories and locations on desktop/mobile; no source bodies, rules enabled, or stored artifact rewrites');

    await budget();
    await page.goto(`${base}/characters/${card.id}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel.getByRole('button', { name: '重新检查', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: '重新检查', exact: true }).click();
    await expect(panel.getByRole('button', { name: '取消检查', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '取消检查', exact: true }).click();
    await expect(panel.getByRole('status').filter({ hasText: '已取消' })).toBeVisible();
    await panel.getByRole('button', { name: '重新检查', exact: true }).click();
    await expect(panel.getByRole('button', { name: '取消检查', exact: true })).toBeVisible();
    await jobs.runNextAdapterJob(database);
    await expect(panel.getByText('2 项状态 · 2 项有限行动 · 1 份来源')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('region', { name: '体验支持情况' })).toContainText('已校验的有限数值规则');
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/adapter-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${directory}/adapter-mobile.png`, fullPage: true, animations: 'disabled' });
    const failedRoute = `**/api/v1/characters/${card.id}/adaptations`;
    await page.route(failedRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEST_UNAVAILABLE', message: '检查记录暂不可用' } }) }));
    await page.reload();
    await expect(panel.getByRole('alert')).toBeVisible();
    await page.unroute(failedRoute);
    await panel.getByRole('button', { name: '重新读取', exact: true }).click();
    await expect(panel.getByText('2 项状态 · 2 项有限行动 · 1 份来源')).toBeVisible();
    check('AD-J08: actual desktop/mobile detail shows stages, cancel/retry/version and result; completion refreshes compatibility in place, read failures recover explicitly without a model');
    await budget();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/chat/${story.id}`);
    const dossier = page.locator('.story-dossier');
    const current = page.getByTestId('current-story-state');
    await expect(current).toContainText('金币');
    await expect(current.locator('dd').first()).toContainText('9');
    const actions = page.getByRole('region', { name: '接下来', exact: true });
    await expect(actions.getByRole('button', { name: /支付3枚/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /调查/ })).toHaveCount(0);
    await expect(dossier.getByRole('button', { name: '地图', exact: true })).toHaveCount(0);
    await page.getByTestId('saved-adaptation-report').locator(':scope > summary').click();
    await expect(page.getByTestId('saved-adaptation-report')).toContainText('已校验的有限规则可运行');
    await expect(page.getByTestId('saved-adaptation-report')).toContainText('已冻结的规则声明');
    await expect(page.getByTestId('saved-adaptation-report')).toContainText('一次性触发，按本次冻结版本运行');
    await expect(page.getByTestId('saved-adaptation-report')).not.toContainText('没有可确认的第三方机制适配结论');
    await page.screenshot({ path: `${directory}/adapted-reader-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await dossier.locator('.dossier-toggle').click();
    await expect(current.locator('dd').first()).toContainText('9');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${directory}/adapted-reader-mobile.png`, fullPage: true, animations: 'disabled' });
    check('AD-J09: actual adapted reader preserves confirmed 9 after mobile refresh, offers only eligible actions, exposes frozen compatibility report and invents no map; no generation triggered');
    const ritual = await checkReviewedRitual({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget });
    await checkPresentationIntegration({ loader, database, sql, api, auth, page, base, directory, check });
    const queueRealProvider = await checkPresentationQueue({ loader, database, sql, api, auth, page, base, directory, check });
    assert.equal(getStreamCount(), streams);
    assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`, beforeCredits);
    assert.deepEqual(errors, []);
    await writeFile(`${directory}/result.json`, JSON.stringify({ checks, realCards, ritual, screenshots: ['adapter-desktop.png', 'adapter-mobile.png', 'adapted-reader-desktop.png', 'adapted-reader-mobile.png', 'presentation-detail-desktop.png', 'presentation-detail-mobile.png', 'presentation-editor-desktop.png', 'presentation-editor-mobile.png', 'presentation-queue-mobile.png', 'presentation-queue-desktop.png', ...[1, 2, 3, 4].flatMap(index => [1440, 390].map(width => `rule-clues-${index}-${width}.png`)), ...ritual.screenshots], providerCalls: queueRealProvider?.supplierCalls ?? 0, queueRealProvider, queueProvider: 'fault scenarios use controlled selections; optional real check separately recorded', browserErrors: errors }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${checks.length} adapter groups; evidence ${directory}`);
  } catch (caught) {
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${directory}/failure.json`, JSON.stringify({ message: caught.message, checks, errors, networkFailures }, null, 2), { mode: 0o600 });
    console.info(`Adapter failure evidence: ${directory}`);
    throw caught;
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close(); loader.unregister();
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
