import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import WebSocket from 'ws';
import { build } from 'esbuild';
import { expect } from '@playwright/test';
import { formatCases } from './fixtures/character-card-formats.mjs';
import { checkCharacterCli } from './character-cli-check.mjs';
import { checkCharacterImportAudit } from './character-import-audit-check.mjs';
import { checkCharacterImportRepair } from './character-import-repair-check.mjs';
import { checkCharacterJourneys } from './character-journey-check.mjs';
import { checkCharacterDiagnostics } from './character-diagnostics-check.mjs';

function extractSampleCard(bytes) {
  let offset = 8;
  let original;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    assert.ok(offset + 12 + length <= bytes.length, 'Sample PNG chunk bounds');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    const separator = chunk.indexOf(0);
    const keyword = chunk.subarray(0, separator).toString();
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'tEXt' && ['chara', 'ccv3'].includes(keyword)) {
      const parsed = JSON.parse(Buffer.from(chunk.subarray(separator + 1).toString(), 'base64').toString());
      if (keyword === 'ccv3') return parsed;
      original = parsed;
    }
    offset += length + 12;
  }
  if (original) return original;
  throw new Error('Selected sample has no card payload');
}

export async function checkCharacterLibrary({ browser, base, sql, getRequests, restartServer }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const root = process.env.CARD_LIBRARY_SAMPLE_ROOT;
  assert.ok(root || process.env.CHARACTER_DIAGNOSTICS_ONLY === '1', 'Set CARD_LIBRARY_SAMPLE_ROOT to the authorized local library');
  const evidence = join('/tmp/squaretable-card-library-evidence', randomUUID());
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const samples = [];
  const cliReferences = [];
  const bundle = await build({ entryPoints: ['src/types/character-card-import.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  const { parseCharacterFile } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
  let auth;
  let csrf;
  let remaining = 100;
  let resetAt = 0;
  function observeLimit(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const reset = Number(headers['x-ratelimit-reset']);
    remaining = reset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, reset);
  }
  async function waitForBudget(minimum = 20) {
    if (remaining >= minimum) return;
    assert.ok(resetAt < Date.now() + 65000, 'Expected normal API rate-limit reset');
    console.info('Character library checks waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
    remaining = 100;
  }
  async function api(path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) {
    await waitForBudget();
    const multipart = body instanceof FormData;
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    observeLimit(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${method} ${path} status`);
    const result = await response.json();
    return result.data ?? result;
  }
  const invite = `LIBRARY-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
  if (process.env.CHARACTER_JOURNEYS_ONLY === '1') {
    const manifest = JSON.parse(await readFile('docs/deployment/evidence/local-card-library-samples.json', 'utf8'));
    const originalCards = [];
    for (const sample of manifest.samples.filter(sample => sample.kind === 'character-card')) {
      const bytes = await readFile(join(root, sample.relativePath));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256);
      const form = new FormData();
      form.append('files', new Blob([bytes], { type: 'image/png' }), basename(sample.relativePath));
      const imported = await api('/characters/import/batch', form, 'POST', 200);
      assert.equal(imported.failed.length, 0);
      assert.equal(imported.imported.length, 1);
      originalCards.push({ sha256: sample.sha256, id: imported.imported[0].id });
    }
    const { checkStoryReadingPosition } = await import('./story-reading-position-check.mjs');
    const reading = await checkStoryReadingPosition({ browser, base, sql, api, auth, evidence, waitForBudget });
    await writeFile(join(evidence, 'reading-report.json'), JSON.stringify(reading, null, 2), { mode: 0o600 });
    console.info(`PASS: ${reading.checks.length} reading recovery groups; continuing single-player journeys`);
    const journeys = await checkCharacterJourneys({ browser, base, sql, api, auth, restartServer, getRequests, evidence, originalCards });
    const sources = [];
    for (const path of ['scripts/character-journey-check.mjs', 'scripts/story-reading-position-check.mjs', 'scripts/character-library-check.mjs',
      'scripts/exploration-entry-check.mjs', 'src/client/composables/useStoryReadingPosition.ts', 'src/client/components/chat/ChatWindow.vue', 'dist/server/index.js', 'dist/client/index.html']) {
      sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
    await writeFile(join(evidence, 'journeys-report.json'), JSON.stringify({ date: new Date().toISOString(), result: 'passed',
      scope: 'single-player journeys and reading recovery only; not full library or group regression', journeys, reading, sources,
      paidProviderTokens: 0, provider: 'controlled loopback; no original third-party generation',
      limits: ['No full third-party mechanics or real-model acceptance', 'No human visual or physical phone signoff'] }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${journeys.checks.length} single-player journey groups and ${reading.checks.length} reading recovery groups; ${evidence}/journeys-report.json`);
    return;
  }
  if (process.env.CHARACTER_DIAGNOSTICS_ONLY === '1') {
    const diagnostics = await checkCharacterDiagnostics({ browser, base, sql, api, auth, restartServer, getRequests, evidence });
    const sources = [];
    for (const path of ['scripts/character-library-check.mjs', 'scripts/character-diagnostics-check.mjs', 'scripts/character-undeclared-check.mjs', 'scripts/character-coverage-integration.mjs',
      'src/types/story-diagnostics.ts', 'src/types/story-capabilities.ts', 'src/types/card-fields.ts', 'src/types/character-worldbook.ts', 'src/types/worldbook-import.ts', 'src/server/services/chat.service.ts',
      'src/server/services/chat-creation.service.ts', 'src/server/services/story-content.service.ts', 'src/server/services/story-worldbooks.service.ts',
      'src/client/components/character/StoryDiagnosticsView.vue', 'dist/server/index.js', 'dist/client/index.html']) {
      sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
    await writeFile(join(evidence, 'diagnostics-report.json'), JSON.stringify({ date: new Date().toISOString(), result: 'passed', diagnostics, sources, scope: 'focused diagnostic integration, not full library regression' }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${diagnostics.checks.length} focused diagnostic groups; ${evidence}/diagnostics-report.json`);
    return;
  }
  const makeStory = characterId => api('/chats', { characterId, clientRequestId: randomUUID() });
  const snapshot = async chatId => (await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chatId}`)[0].snapshot;
  async function books(characterId) {
    return sql`SELECT id, scope, user_id, tenant_id FROM worldbooks WHERE character_id = ${characterId} ORDER BY id`;
  }
  async function entries(bookId) {
    return sql`SELECT keyword, content, position, is_enabled, priority, settings, recursive, prevent_recursion
      FROM worldbook_entries WHERE worldbook_id = ${bookId} ORDER BY position, content`;
  }
  const manifest = JSON.parse(await readFile('docs/deployment/evidence/local-card-library-samples.json', 'utf8'));
  for (const sample of manifest.samples) {
    const bytes = await readFile(join(root, sample.relativePath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256, 'Selected sample fingerprint');
    if (sample.kind === 'standalone-worldbook') {
      const input = JSON.parse(bytes.toString());
      const result = await api('/worldbooks/import-file', input);
      const [book] = await sql`SELECT * FROM worldbooks WHERE id = ${result.worldBookId}`;
      assert.equal(book.scope, 'global');
      assert.equal(book.character_id, null);
      assert.equal(book.user_id, auth.user.id);
      assert.equal((await entries(book.id)).length, sample.standaloneEntries);
      samples.push({ relativePath: sample.relativePath, sha256: sample.sha256, entries: sample.standaloneEntries, result: 'persisted_unbound' });
      cliReferences.push({ ...sample, id: result.worldBookId });
      continue;
    }
    const original = extractSampleCard(bytes);
    const data = (await parseCharacterFile(bytes)).character;
    const single = await api('/characters', data);
    const form = new FormData();
    form.append('files', new Blob([bytes], { type: 'image/png' }), basename(sample.relativePath));
    const batch = await api('/characters/import/batch', form, 'POST', 200);
    assert.equal(batch.failed.length, 0, 'Selected PNG batch import must succeed');
    assert.equal(batch.imported.length, 1);
    const batchId = batch.imported[0].id;
    cliReferences.push({ ...sample, id: batchId });
    const [storedSingle] = await sql`SELECT card_data FROM characters WHERE id = ${single.id}`;
    const [storedBatch] = await sql`SELECT card_data FROM characters WHERE id = ${batchId}`;
    assert.ok(JSON.stringify(storedSingle.card_data) === JSON.stringify(storedBatch.card_data), 'Single and batch retain identical card data');
    assert.ok(isDeepStrictEqual(storedSingle.card_data._squaretableImport.original, original), 'Original selected payload preserved');
    const singleBooks = await books(single.id);
    const batchBooks = await books(batchId);
    assert.equal(singleBooks.length, sample.embeddedEntries ? 1 : 0);
    assert.equal(batchBooks.length, singleBooks.length);
    if (singleBooks.length) {
      assert.equal(batchBooks[0].scope, 'character');
      assert.equal(batchBooks[0].user_id, auth.user.id);
      assert.equal(batchBooks[0].tenant_id, auth.user.tenantId);
      const singleEntries = await entries(singleBooks[0].id);
      const batchEntries = await entries(batchBooks[0].id);
      assert.equal(singleEntries.length, sample.embeddedEntries);
      assert.ok(JSON.stringify(singleEntries) === JSON.stringify(batchEntries), 'Identical persisted entry mappings');
    }
    const chat = await makeStory(batchId);
    const frozen = await snapshot(chat.id);
    assert.equal(frozen.bindings[0].characterId, batchId);
    assert.equal(frozen.bindings[0].books.flatMap(book => book.entries).length, sample.embeddedEntries);
    samples.push({ relativePath: sample.relativePath, sha256: sample.sha256, entries: sample.embeddedEntries, result: 'single_batch_and_story_binding_passed' });
  }
  checks.push('Three original PNGs: single/batch persistence parity, original data retained, embedded books bound and captured');
  checks.push('Two standalone books persisted with owner attribution and no inferred character binding');
  const cli = await checkCharacterCli({ sql, email: auth.user.email, userId: auth.user.id, root, references: cliReferences });
  checks.push(...cli.groups);
  const audit = await checkCharacterImportAudit({ sql, api, user: auth.user, makeStory, snapshot });
  checks.push(...audit.groups);
  const repair = await checkCharacterImportRepair({ sql, api, user: auth.user, makeStory, snapshot });
  checks.push(...repair.groups);

  const fixtures = formatCases();
  const beforeFormats = (await sql`SELECT count(*)::int AS total FROM characters`)[0].total;
  for (let offset = 0; offset < fixtures.length; offset += 20) {
    const selection = fixtures.slice(offset, offset + 20);
    const form = new FormData();
    for (const fixture of selection) form.append('files', new Blob([fixture.bytes]), fixture.name);
    const response = await api('/characters/import/batch', form, 'POST', 200);
    assert.equal(response.total, selection.length);
    assert.equal(response.imported.length, selection.filter(item => !item.code).length);
    assert.deepEqual(response.failed.map(item => [item.filename, item.code]), selection.filter(item => item.code).map(item => [item.name, item.code]));
    for (const imported of response.imported) {
      const [stored] = await sql`SELECT card_data FROM characters WHERE id = ${imported.id}`;
      assert.ok(stored.card_data._squaretableImport.original);
    }
  }
  assert.equal((await sql`SELECT count(*)::int AS total FROM characters`)[0].total - beforeFormats, fixtures.filter(item => !item.code).length);
  checks.push(`${fixtures.length} synthetic raw-file API cases: JSON/V2/V3/iTXt/magic detection, corrupt/unsupported/ambiguous files produce no character rows`);

  const exportSource = fixtures.find(item => item.name === 'v3-only.png');
  const exportInput = (await parseCharacterFile(exportSource.bytes)).character;
  const exportCard = await api('/characters', {
    ...exportInput, name: 'Updated synthetic card',
    avatarUrl: `data:image/png;base64,${exportSource.bytes.toString('base64')}`,
    cardData: { ...exportInput.cardData, first_mes: 'Updated synthetic greeting' },
  });
  for (const format of ['json', 'png']) {
    const response = await fetch(`${base}/api/v1/characters/${exportCard.id}/export/${format}`, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    const reimported = (await parseCharacterFile(new Uint8Array(await response.arrayBuffer()))).character;
    assert.equal(reimported.name, 'Updated synthetic card');
    assert.equal(reimported.cardData.first_mes, 'Updated synthetic greeting');
    assert.equal(reimported.cardData.spec, 'chara_card_v3');
    assert.equal(reimported.cardData.root_extra, exportSource.original.root_extra);
    assert.equal(reimported.cardData._squaretableImport.original._squaretableImport, undefined);
    assert.ok(isDeepStrictEqual(reimported.cardData.extensions, exportInput.cardData.extensions));
  }
  checks.push('Actual JSON and PNG exports reimport current fields and V3 version, retain unknown fields, remove stale metadata and do not nest import archives');

  await waitForBudget(45);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on('response', response => observeLimit(response.headers()));
  const pageErrors = [];
  try {
    await context.addInitScript(({ tokens, user }) => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
    }, auth);
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${base}/my-characters`);
    const valid = fixtures.find(item => item.name === 'compressed-v3.png');
    const invalid = fixtures.find(item => item.name === 'invalid-base64.png');
    const upload = item => ({ name: item.name, mimeType: 'image/png', buffer: item.bytes });
    const beforeUi = (await sql`SELECT count(*)::int AS total FROM characters`)[0].total;
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/characters/import/batch') && response.request().method() === 'POST');
    await page.locator('input[type=file][multiple]').setInputFiles([upload(valid), upload(invalid)]);
    assert.equal((await responsePromise).status(), 200);
    const panel = page.getByTestId('import-result');
    await expect(panel).toContainText('成功 1 个，失败 1 个');
    await expect(panel).toContainText('invalid-base64.png');
    await expect(panel).toContainText('内嵌角色资料损坏');
    assert.equal((await sql`SELECT count(*)::int AS total FROM characters`)[0].total, beforeUi + 1);
    await panel.screenshot({ path: `${evidence}/import-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await panel.screenshot({ path: `${evidence}/import-mobile.png` });
    await page.locator('input[type=file][multiple]').setInputFiles([upload(invalid)]);
    await expect(panel).toContainText('成功 0 个，失败 1 个');
    assert.equal((await sql`SELECT count(*)::int AS total FROM characters`)[0].total, beforeUi + 1);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入角色卡', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(upload(fixtures.find(item => item.name === 'ztext-v3.png')));
    await expect.poll(async () => (await sql`SELECT count(*)::int AS total FROM characters`)[0].total).toBe(beforeUi + 2);
    const storedUi = await sql`SELECT card_data FROM characters ORDER BY created_at DESC LIMIT 2`;
    assert.ok(storedUi.every(row => row.card_data._squaretableImport?.original.spec === 'chara_card_v3'));
    let legacyCreateRequests = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/characters')) legacyCreateRequests++;
    });
    const oversizedChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入角色卡', exact: true }).click();
    await (await oversizedChooser).setFiles(upload(fixtures.find(item => item.name === 'compressed-over-limit.png')));
    await expect(panel).toContainText('角色资料解压后超过 10 MiB 上限，请精简资料后重新导入。');
    await page.evaluate(() => { Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined, configurable: true }); });
    const serverDecodedChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入角色卡', exact: true }).click();
    await (await serverDecodedChooser).setFiles(upload(valid));
    await expect(panel).toContainText('成功 1 个，失败 0 个');
    assert.equal(legacyCreateRequests, 0, 'Single and multiple imports both use the server file importer');
    assert.equal((await sql`SELECT count(*)::int AS total FROM characters`)[0].total, beforeUi + 3);
    assert.deepEqual(pageErrors, []);
  } finally { await context.close(); }
  checks.push('Production Chromium single/batch uploads, partial/all failure details, database counts, 1440px/390px layouts and zero page errors');
  checks.push('Unified Chromium compressed iTXt/zTXt imports; oversized data fails without a row; missing browser decompression uses the server importer successfully, with zero legacy JSON create requests');

  const marker = `IMPORT_ROLLBACK_${randomUUID()}`;
  const validEntry = { keys: ['gate'], content: 'A gate.' };
  const malformed = { name: marker, cardData: { character_book: { entries: [null] } } };
  await api('/characters', malformed, 'POST', 400);
  const broken = { name: marker, cardData: { character_book: { entries: [validEntry, { ...validEntry, keys: ['x'.repeat(300)] }] } } };
  const before = await sql`SELECT (SELECT count(*)::int FROM characters) AS characters,
    (SELECT count(*)::int FROM worldbooks) AS books, (SELECT count(*)::int FROM worldbook_entries) AS entries`;
  await api('/characters', broken, 'POST', 500);
  const mixed = new FormData();
  mixed.append('files', new Blob([JSON.stringify({ name: marker, first_mes: '', ...broken.cardData })]), 'broken.json');
  mixed.append('files', new Blob([JSON.stringify({ name: `${marker}_valid`, first_mes: '' })]), 'valid.json');
  const mixedResult = await api('/characters/import/batch', mixed, 'POST', 200);
  assert.equal(mixedResult.failed.length, 1);
  assert.equal(mixedResult.failed[0].error, 'Failed to import character');
  assert.equal(mixedResult.imported.length, 1);
  const after = await sql`SELECT (SELECT count(*)::int FROM characters) AS characters,
    (SELECT count(*)::int FROM worldbooks) AS books, (SELECT count(*)::int FROM worldbook_entries) AS entries`;
  assert.deepEqual([...after], [{ ...before[0], characters: before[0].characters + 1 }]);
  assert.equal((await sql`SELECT id FROM characters WHERE name = ${marker}`).length, 0);
  checks.push('Malformed book rejected; entry database failure rolls back character/book/prior entries; batch retains only its valid file');

  const makeEntry = (content, extra = {}) => ({ keys: ['gate'], content, ...extra });
  const card = await api('/characters', { name: 'Isolated binding rules', cardData: { first_mes: '', character_book: { entries: [
    makeEntry('BOUND_OLD_RULE'), makeEntry('DISABLED_RULE', { enabled: false, constant: true }),
    makeEntry('CONSTANT_RULE', { keys: [], constant: true }),
    makeEntry('SELECTIVE_RULE', { secondary_keys: ['silver'], selective: true, extensions: { selectiveLogic: 0 } }),
    makeEntry('NO_SECONDARY_REQUIRED', { secondary_keys: ['unspoken'], selective: false }),
    makeEntry('DEPTH_USER_RULE', { extensions: { position: 4, depth: 0, role: 1 } }),
    makeEntry('ZERO_PROBABILITY_RULE', { constant: true, extensions: { probability: 0 } }),
  ] } } });
  const plain = await makeStory(mixedResult.imported[0].id);
  assert.deepEqual((await snapshot(plain.id)).bindings[0].books, []);
  const global = await api('/worldbooks/import-file', { name: 'Unbound synthetic supplement', entries: { 0: { key: [], content: 'GLOBAL_MUST_NOT_LEAK', constant: true } } });
  const oldStory = await makeStory(card.id);
  const frozenBefore = await snapshot(oldStory.id);
  const [source] = await sql`SELECT entry.id, entry.worldbook_id FROM worldbook_entries entry
    JOIN worldbooks book ON book.id = entry.worldbook_id WHERE book.character_id = ${card.id} AND entry.content = 'BOUND_OLD_RULE'`;
  await api(`/worldbooks/${source.worldbook_id}/entries/${source.id}`, { content: 'BOUND_NEW_RULE' }, 'PATCH', 200);
  const newStory = await makeStory(card.id);
  assert.deepEqual(await snapshot(oldStory.id), frozenBefore);
  assert.ok((await snapshot(newStory.id)).bindings[0].books[0].entries.some(entry => entry.content === 'BOUND_NEW_RULE'));
  await api(`/worldbooks/${source.worldbook_id}`, undefined, 'DELETE', 200);
  const unboundStory = await makeStory(card.id);
  assert.deepEqual((await snapshot(unboundStory.id)).bindings[0].books, []);
  checks.push('Frozen old/new story revisions survive source edits/deletion; unrelated global books remain unbound');

  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(auth.tokens.accessToken)}`);
  const events = [];
  socket.on('message', raw => events.push(JSON.parse(raw.toString())));
  async function waitFor(predicate) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const event = events.find(predicate);
      if (event) return event;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Library generation event timed out');
  }
  const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
  async function generate(chatId, content) {
    const start = getRequests().length;
    const requestId = randomUUID();
    send('join_chat', { chatId });
    send('user_message', { chatId, content, clientMessageId: requestId });
    const finished = await waitFor(event => event.type === 'generation_finished' && event.data.requestId === requestId);
    assert.equal(finished.data.status, 'completed', 'Controlled generation completes');
    const requests = getRequests().slice(start);
    assert.equal(requests.length, 1, 'One controlled generation request');
    const messages = requests[0].messages;
    const text = messages.map(message => message.content).join('\n');
    for (const forbidden of ['DISABLED_RULE', 'ZERO_PROBABILITY_RULE', 'GLOBAL_MUST_NOT_LEAK']) assert.ok(!text.includes(forbidden), `${forbidden} must not be injected`);
    return { text, messages };
  }
  try {
    await waitFor(event => event.type === 'connected');
    const quiet = await generate(oldStory.id, 'Look around.');
    assert.ok(quiet.text.includes('CONSTANT_RULE'));
    assert.ok(!quiet.text.includes('BOUND_OLD_RULE'));
    const gate = await generate(oldStory.id, 'Inspect the gate.');
    assert.ok(gate.text.includes('BOUND_OLD_RULE') && !gate.text.includes('BOUND_NEW_RULE'));
    assert.ok(gate.text.includes('NO_SECONDARY_REQUIRED') && !gate.text.includes('SELECTIVE_RULE'));
    assert.ok(gate.messages.some(message => message.role === 'user' && message.content.includes('DEPTH_USER_RULE')));
    const silver = await generate(newStory.id, 'Inspect the silver gate.');
    assert.ok(silver.text.includes('BOUND_NEW_RULE') && !silver.text.includes('BOUND_OLD_RULE'));
    assert.ok(silver.text.includes('SELECTIVE_RULE'));
    const empty = await generate(unboundStory.id, 'Inspect the silver gate.');
    assert.ok(!empty.text.includes('BOUND_NEW_RULE') && !empty.text.includes('CONSTANT_RULE'));
    checks.push('Production WebSocket prompts: keyword/constant/disabled/zero-probability/secondary/atDepth role, frozen revisions and no global fallback');
  } finally {
    socket.terminate();
  }
  const journeys = await checkCharacterJourneys({ browser, base, sql, api, auth, restartServer, getRequests, evidence, originalCards: cliReferences.filter(sample => sample.kind !== 'standalone-worldbook') });
  checks.push(...journeys.checks);
  const diagnostics = await checkCharacterDiagnostics({ browser, base, sql, api, auth, restartServer, getRequests, evidence });
  checks.push(...diagnostics.checks);
  const sources = [];
  for (const path of ['src/types/character-worldbook.ts', 'src/types/character-card-import.ts', 'src/client/utils/sillytavern.ts',
    'src/types/worldbook-import.ts', 'src/db/character-import.ts', 'src/db/worldbook-import.ts', 'src/server/routes/worldbooks.ts',
    'scripts/import-cards.ts', 'scripts/character-cli-check.mjs', 'src/db/character-import-audit.ts',
    'src/db/character-import-audit.spec.ts', 'scripts/character-import-audit.ts', 'scripts/character-import-audit-check.mjs', 'tsconfig.import-cards.json',
    'src/db/character-import-repair.ts', 'src/db/schema/character-import-repairs.ts', 'src/db/schema/index.ts',
    'scripts/character-import-repair.ts', 'scripts/character-import-repair-check.mjs',
    'src/db/migrations/0049_character_import_repairs.sql', 'src/db/migrations/meta/_journal.json',
    'src/db/beta-migrations/0009_character_import_repairs.sql', 'src/db/beta-migrations/meta/_journal.json',
    'src/client/services/export.api.ts', 'src/client/pages/MyCharacters.vue', 'src/server/utils/png-embed.ts',
    'src/client/i18n/locales/zh-CN.json', 'src/client/i18n/locales/en-US.json',
    'scripts/fixtures/character-card-formats.mjs', 'src/db/repositories/character.repository.ts', 'src/server/routes/characters.ts',
    'src/server/services/story-worldbooks.service.ts', 'src/server/services/worldinfo-engine.service.ts', 'src/server/services/story-state.service.ts', 'src/server/services/story-turn-prompt.ts', 'src/server/services/chat.service.ts',
    'scripts/character-library-check.mjs', 'scripts/character-journey-check.mjs', 'src/types/story-capabilities.ts', 'src/types/story-content.ts', 'src/client/components/chat/StoryDossier.vue', 'src/client/components/chat/ChatWindow.vue', 'src/client/components/character/StoryCompatibility.vue', 'scripts/exploration-entry-check.mjs', 'scripts/beta-smoke-check.mjs', 'dist/server/index.js', 'dist/client/index.html']) {
    sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  for (const path of ['scripts/character-diagnostics-check.mjs', 'scripts/character-undeclared-check.mjs', 'scripts/character-coverage-integration.mjs', 'src/types/card-fields.ts', 'src/types/story-diagnostics.ts',
    'src/server/services/story-diagnostics.service.ts', 'src/server/services/story-content.service.ts', 'src/server/services/story-worldbooks.service.ts',
    'src/server/services/chat-creation.service.ts', 'src/client/components/character/StoryDiagnosticsView.vue', 'src/client/components/chat/StoryEntryPreview.vue',
    'src/client/pages/Chat.vue', 'src/client/pages/CharacterDetail.vue', 'src/client/services/character.api.ts', 'src/client/services/chat.api.ts',
    'src/client/stores/chat.ts', 'src/types/character-worldbook-bindings.ts']) {
    if (!sources.some(source => source.path === path)) sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  const report = { date: new Date().toISOString(), task: 'EXP-03C and EXP-03B regression', taskClosed: false, result: 'passed',
    database: 'disposable PostgreSQL with beta migrations', backend: 'production HTTP/WebSocket, no mocked repositories',
    provider: 'loopback controlled provider; synthetic prompts only', paidProviderTokens: 0,
    samples, checks, sources, cli, audit, repair, journeys, diagnostics, pageErrors, standaloneSyntheticBookCreated: Boolean(global.worldBookId),
    limits: ['No author scripts executed or original library contents submitted to any model',
      'Owned native cards have controlled-provider journeys; original cards have truthful degradation checks, not full author-mechanism or real-model acceptance; decompressed text bounded at 10 MiB',
      'Standalone books remain unbound; author binding UI is separately verified; no historical repair or cross-run import deduplication',
      'No live candidate deployment or user signoff'] };
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.info(`PASS: ${samples.length} library samples and ${checks.length} integration groups; ${evidence}/report.json`);
}
