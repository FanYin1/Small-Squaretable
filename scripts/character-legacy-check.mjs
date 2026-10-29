import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { build } from 'esbuild';
import { pngWithMetadata, textMetadata, cardV3 } from './fixtures/character-card-formats.mjs';
import { checkCharacterImportRepair } from './character-import-repair-check.mjs';

export async function checkCharacterLegacy({ sql, api, user, getStreamCount }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const evidence = `/tmp/squaretable-character-legacy/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const connections = [];
  const initialStreams = getStreamCount();
  const bundle = await build({ stdin: { contents: "export * from './src/db/character-legacy-reconciliation.ts';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
  const { planCharacterLegacy, applyCharacterLegacy, prepareLegacyExternalSource } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
  const embedded = { name: 'PRIVATE_LEGACY_NAME', entries: [
    { keys: ['legacy'], content: 'PRIVATE_LEGACY_SOURCE', recursive: false, extensions: { position: 4, depth: 2, role: 1, squaretable: { purpose: 'knowledge' } } },
    { keys: ['second'], content: 'Synthetic second source', enabled: false, insertion_order: 7 },
  ] };
  const sourceFile = `${evidence}/private-source.json`;
  await writeFile(sourceFile, JSON.stringify(embedded), { mode: 0o600 });
  const outputFault = `${evidence}/private-output-fault.mjs`;
  await writeFile(outputFault, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const originalOpen = fs.promises.open;
fs.promises.open = async function(path, ...args) {
  const file = await originalOpen.call(this, path, ...args);
  if (path === process.env.LEGACY_TEST_REPORT) file.writeFile = async () => { throw new Error('Synthetic output failure'); };
  return file;
};
syncBuiltinESMExports();
`, { mode: 0o600 });
  function connection() {
    const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    connections.push(client);
    return client;
  }
  async function seed(cardData = { character_book: embedded }) {
    const [created] = await sql`INSERT INTO characters (tenant_id, creator_id, name, card_data)
      VALUES (${user.tenantId}, ${user.id}, 'Synthetic legacy recovery', ${sql.json({ name: 'Synthetic legacy recovery', first_mes: 'A quiet beginning.', ...cardData })}) RETURNING id`;
    return created.id;
  }
  const request = (characterId, source = { kind: 'current' }, bindings = []) => ({ tenantId: user.tenantId, ownerId: user.id, characterId, source, bindings });
  async function addBook(characterId, content = 'Edited by author', enabled = true, scope = 'character') {
    const [book] = await sql`INSERT INTO worldbooks (tenant_id, user_id, character_id, name, is_enabled, scope)
      VALUES (${user.tenantId}, ${user.id}, ${characterId}, 'Existing synthetic book', ${enabled}, ${scope}) RETURNING id`;
    await sql`INSERT INTO worldbook_entries (worldbook_id, keyword, content) VALUES (${book.id}, 'existing', ${content})`;
    return book.id;
  }
  async function state(characterId) {
    const [row] = await sql`SELECT card_data,
      (SELECT coalesce(jsonb_agg(to_jsonb(book) ORDER BY book.id), '[]') FROM worldbooks book WHERE book.character_id = characters.id) AS books,
      (SELECT coalesce(jsonb_agg(to_jsonb(entry) ORDER BY entry.id), '[]') FROM worldbook_entries entry JOIN worldbooks book ON book.id = entry.worldbook_id WHERE book.character_id = characters.id) AS entries,
      (SELECT coalesce(jsonb_agg(to_jsonb(receipt) ORDER BY receipt.review_fingerprint), '[]') FROM character_import_repairs receipt WHERE receipt.character_id = characters.id) AS receipts
      FROM characters WHERE id = ${characterId}`;
    return row;
  }
  const makeStory = characterId => api('/chats', { characterId, clientRequestId: randomUUID() }, 'POST', 201);
  const snapshot = async chatId => (await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chatId}`)[0].snapshot;
  async function invoke(mode, input, options = {}) {
    const identifier = randomUUID();
    const inputFile = `${evidence}/private-${identifier}.json`;
    const report = `${evidence}/private-${identifier}-result.json`;
    await writeFile(inputFile, JSON.stringify(mode === 'apply' ? { plan: input } : input), { mode: 0o600 });
    const args = ['--import', 'tsx', 'scripts/character-legacy-reconcile.ts', '--mode', mode,
      mode === 'apply' ? '--plan' : mode === 'receipt' ? '--scope' : '--request', inputFile, '--report', report];
    if (mode !== 'plan') args.push('--expected-plan', options.expectedPlan ?? input.fingerprint);
    if (options.file) args.push('--source-file', options.file);
    if (options.failOutput) args.unshift('--import', outputFault);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: { ...process.env, ...(options.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}), ...(options.failOutput ? { LEGACY_TEST_REPORT: report } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
    });
    assert.equal(result.code, options.error ? 1 : 0, `CLI ${mode}: ${result.stderr}`);
    assert.ok(!result.stdout.includes('PRIVATE_') && !result.stderr.includes('PRIVATE_'));
    if (options.error) {
      assert.equal(JSON.parse(result.stderr).code, options.error);
      await assert.rejects(stat(report), { code: 'ENOENT' });
      return;
    }
    const text = await readFile(report, 'utf8');
    assert.ok(!text.includes('PRIVATE_') && !text.includes(evidence));
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    if (options.file) {
      assert.deepEqual(await readFile(`${report}.source`), await readFile(options.file));
      assert.equal((await stat(`${report}.source`)).mode & 0o777, 0o600);
    }
    return JSON.parse(text);
  }
  async function waitBlocked(pid) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
      if (row.blocked) return;
      await delay(20);
    }
    assert.fail('Expected actual lock contention');
  }
  async function lockedApply(plan, callback) {
    const client = connection();
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    let pid;
    const gated = { begin: (options, run) => client.begin(options, async transaction => {
      pid = (await transaction`SELECT pg_backend_pid() AS pid`)[0].pid;
      return run(new Proxy(transaction, { get(target, property) {
        if (property !== 'unsafe') return Reflect.get(target, property);
        return async (...args) => {
          const result = await target.unsafe(...args);
          if (args[0].startsWith('SELECT id FROM worldbook_entries') && args[0].includes('FOR UPDATE')) { held.resolve(); await release.promise; }
          return result;
        };
      } }));
    }) };
    const running = applyCharacterLegacy(gated, plan, plan.fingerprint);
    running.catch(error => held.reject(error));
    try { await held.promise; await callback(pid, release); }
    finally { release.resolve(); }
    return running;
  }
  try {
    for (const kind of ['current', 'nested', 'archive']) {
      const cardData = kind === 'current' ? { character_book: embedded } : kind === 'nested' ? { data: { character_book: embedded } } : { _squaretableImport: { version: 1, original: { data: { character_book: embedded } } } };
      const target = await seed(cardData);
      const before = await state(target);
      const { plan } = await invoke('plan', request(target, { kind }));
      assert.deepEqual(await state(target), before);
      const { receipt } = await invoke('apply', plan);
      const after = await state(target);
      assert.equal(receipt.status, 'applied');
      assert.deepEqual(after.card_data, before.card_data);
      assert.equal(after.books.length, 1);
      assert.equal(after.entries.find(entry => entry.keyword === 'legacy').recursive, false);
      assert.equal(after.entries.find(entry => entry.keyword === 'legacy').settings.squaretablePurpose, 'knowledge');
      assert.equal((await invoke('apply', plan)).receipt.status, 'already_applied');
      checks.push(`${kind} source: read-only plan, real CLI atomic copy, preserved source/recursive/purpose settings, durable retry`);
    }
    const externalTarget = await seed({});
    const externalRequest = request(externalTarget, { kind: 'file' });
    const externalPlan = (await invoke('plan', externalRequest, { file: sourceFile })).plan;
    const externalReceipt = (await invoke('apply', externalPlan, { file: sourceFile })).receipt;
    const png = `${evidence}/private-source.png`;
    await writeFile(png, pngWithMetadata([textMetadata('ccv3', cardV3, { type: 'iTXt', compressed: true })]), { mode: 0o600 });
    const pngTarget = await seed({});
    const pngPlan = (await invoke('plan', request(pngTarget, { kind: 'file' }), { file: png })).plan;
    await invoke('apply', pngPlan, { file: png });
    assert.equal((await state(pngTarget)).entries[0].content, cardV3.data.character_book.entries[0].content);
    checks.push('Explicit external JSON and compressed V3 PNG mapping; exact original bytes archived privately with file hashes, no name guessing');

    const edited = await seed();
    const existing = await addBook(edited, 'PRIVATE_EDITED_CONTENT', true, 'global');
    const oldStory = await makeStory(edited);
    const oldSnapshot = await snapshot(oldStory.id);
    const originalRows = await sql`SELECT * FROM worldbook_entries WHERE worldbook_id = ${existing}`;
    const editedPlan = (await invoke('plan', request(edited, { kind: 'current' }, [{ bookId: existing, action: 'detach' }]))).plan;
    assert.ok(editedPlan.bindings[0].differingFields.includes('content'));
    assert.equal(editedPlan.bindings[0].afterScope, 'character');
    await invoke('apply', editedPlan);
    assert.deepEqual(await sql`SELECT * FROM worldbook_entries WHERE worldbook_id = ${existing}`, originalRows);
    assert.deepEqual((await sql`SELECT character_id, scope FROM worldbooks WHERE id = ${existing}`)[0], { character_id: null, scope: 'character' });
    assert.deepEqual(await snapshot(oldStory.id), oldSnapshot);
    const newStory = await makeStory(edited);
    const currentSnapshot = await snapshot(newStory.id);
    assert.equal(currentSnapshot.bindings[0].books.length, 1);
    assert.ok(JSON.stringify(currentSnapshot).includes('PRIVATE_LEGACY_SOURCE'));
    assert.ok(!JSON.stringify(currentSnapshot).includes('PRIVATE_EDITED_CONTENT'));
    checks.push('Edited/global binding explicitly detached without deleting entries; old frozen story unchanged, new API-created story uses selected recovery only');

    const duplicates = await seed();
    const first = await addBook(duplicates, 'Same source', false, 'global');
    const second = await addBook(duplicates, 'Same source');
    const extra = await addBook(duplicates, 'Additional reference', false);
    const duplicatePlan = (await invoke('plan', request(duplicates, { kind: 'bound', bookId: first }, [
      { bookId: first, action: 'keep' }, { bookId: second, action: 'detach' }, { bookId: extra, action: 'keep' },
    ]))).plan;
    assert.equal(duplicatePlan.operation, 'select_bound');
    assert.equal(duplicatePlan.bindings.find(item => item.bookId === first).action, 'activate');
    await invoke('apply', duplicatePlan);
    assert.deepEqual((await sql`SELECT scope, is_enabled FROM worldbooks WHERE id = ${first}`)[0], { scope: 'character', is_enabled: true });
    assert.equal((await sql`SELECT is_enabled FROM worldbooks WHERE id = ${extra}`)[0].is_enabled, false);
    assert.equal((await state(duplicates)).books.length, 2);
    checks.push('Explicit duplicate selection enables the selected inactive book, preserves other disabled references and detaches only the specified duplicate');

    const missing = await seed({});
    await invoke('plan', request(missing), { error: 'LEGACY_SOURCE_REQUIRED' });
    const conflict = await seed({ _squaretableImport: { version: 1, original: { character_book: embedded, data: { character_book: { entries: [{ content: 'Different' }] } } } } });
    await invoke('plan', request(conflict, { kind: 'archive' }), { error: 'LEGACY_SOURCE_CONFLICT' });
    const detachedChoice = request(duplicates, { kind: 'bound', bookId: first }, [{ bookId: first, action: 'detach' }, { bookId: extra, action: 'keep' }]);
    await invoke('plan', detachedChoice, { error: 'LEGACY_SOURCE_SELECTION' });
    await invoke('plan', request(duplicates), { error: 'LEGACY_BINDINGS_CHANGED' });
    checks.push('No source, ambiguous archived source, contradictory selected binding and omitted binding dispositions all refuse without writes');

    for (const alteration of ['card', 'book', 'entry', 'insert', 'delete', 'binding']) {
      const target = await seed();
      const book = await addBook(target);
      const input = request(target, { kind: 'current' }, [{ bookId: book, action: 'keep' }]);
      const plan = await planCharacterLegacy(sql, input);
      if (alteration === 'card') await sql`UPDATE characters SET name = 'Edited after review' WHERE id = ${target}`;
      if (alteration === 'book') await sql`UPDATE worldbooks SET is_enabled = false WHERE id = ${book}`;
      if (alteration === 'entry') await sql`UPDATE worldbook_entries SET content = 'Changed after review' WHERE worldbook_id = ${book}`;
      if (alteration === 'insert') await sql`INSERT INTO worldbook_entries (worldbook_id, keyword, content) VALUES (${book}, 'later', 'Later')`;
      if (alteration === 'delete') await sql`DELETE FROM worldbook_entries WHERE worldbook_id = ${book}`;
      if (alteration === 'binding') await addBook(target);
      const before = await state(target);
      await assert.rejects(applyCharacterLegacy(sql, plan, plan.fingerprint), { code: alteration === 'binding' ? 'LEGACY_BINDINGS_CHANGED' : 'LEGACY_REVIEW_CHANGED' });
      assert.deepEqual(await state(target), before);
    }
    const fileTarget = await seed({});
    const originalExternal = await prepareLegacyExternalSource(Buffer.from(JSON.stringify(embedded)));
    const filePlan = await planCharacterLegacy(sql, request(fileTarget, { kind: 'file' }), originalExternal);
    const changedExternal = await prepareLegacyExternalSource(Buffer.from(JSON.stringify({ ...embedded, unknown: true })));
    await assert.rejects(applyCharacterLegacy(sql, filePlan, filePlan.fingerprint, changedExternal), { code: 'LEGACY_REVIEW_CHANGED' });
    checks.push('Stale character, book, entry edit/insert/delete, new binding and changed original file bytes reject the old preview atomically');

    for (const wrong of [{ tenantId: randomUUID() }, { ownerId: randomUUID() }, { characterId: randomUUID() }]) {
      await assert.rejects(planCharacterLegacy(sql, { ...request(missing), ...wrong }), { code: 'LEGACY_NOT_FOUND_IN_SCOPE' });
    }
    const wrongOwner = await seed();
    const wrongBook = await addBook(wrongOwner);
    await sql`UPDATE worldbooks SET tenant_id = ${randomUUID()} WHERE id = ${wrongBook}`;
    await assert.rejects(planCharacterLegacy(sql, request(wrongOwner, { kind: 'current' }, [{ bookId: wrongBook, action: 'detach' }])), { code: 'LEGACY_OWNERSHIP_CONFLICT' });
    checks.push('Missing, other tenant and other owner are indistinguishable; conflicting book ownership cannot be bypassed by detaching it');
    const [otherOwner] = await sql`INSERT INTO users (tenant_id, email) VALUES (${user.tenantId}, ${`${randomUUID()}@example.test`}) RETURNING id`;
    await sql`UPDATE worldbooks SET tenant_id = ${user.tenantId}, user_id = ${otherOwner.id} WHERE id = ${wrongBook}`;
    await assert.rejects(planCharacterLegacy(sql, request(wrongOwner, { kind: 'current' }, [{ bookId: wrongBook, action: 'keep' }])), { code: 'LEGACY_OWNERSHIP_CONFLICT' });
    checks.push('Same-tenant foreign-owner book is rejected independently of the tenant-conflict case');

    for (const group of [false, true]) {
      const target = await seed();
      const plan = await planCharacterLegacy(sql, request(target));
      const [chat] = await sql`INSERT INTO chats (tenant_id, user_id, character_id) VALUES (${user.tenantId}, ${user.id}, ${group ? null : target}) RETURNING id`;
      if (group) await sql`INSERT INTO chat_characters (chat_id, character_id) VALUES (${chat.id}, ${target})`;
      await assert.rejects(applyCharacterLegacy(sql, plan, plan.fingerprint), { code: 'LEGACY_UNFROZEN_STORY' });
      assert.equal((await state(target)).books.length, 0);
    }
    checks.push('Newly discovered unfrozen solo and group histories block apply; no silent migration of legacy stories');

    const concurrent = await seed();
    const concurrentPlan = await planCharacterLegacy(sql, request(concurrent));
    const outcomes = await Promise.all([invoke('apply', concurrentPlan), invoke('apply', concurrentPlan)]);
    assert.deepEqual(outcomes.map(result => result.receipt.status).sort(), ['already_applied', 'applied']);
    assert.equal((await state(concurrent)).books.length, 1);
    const recoveredBook = outcomes[0].receipt.bookId;
    await sql`DELETE FROM worldbooks WHERE id = ${recoveredBook}`;
    assert.equal((await invoke('apply', concurrentPlan)).receipt.status, 'already_applied');
    assert.equal((await state(concurrent)).books.length, 0);
    await unlink(sourceFile);
    const scope = { tenantId: user.tenantId, ownerId: user.id, characterId: externalTarget };
    const savedReceipt = (await invoke('receipt', scope, { expectedPlan: externalPlan.fingerprint })).receipt;
    assert.equal(savedReceipt.bookId, externalReceipt.bookId);
    assert.equal(savedReceipt.currentStateRechecked, false);
    assert.equal((await invoke('receipt', scope, { expectedPlan: '0'.repeat(64) })).receipt.status, 'not_applied');
    checks.push('Concurrent CLI calls write once; later deletion is not resurrected; receipt works without the original source file and distinguishes unknown requests');

    const lostOutput = await seed();
    const lostPlan = await planCharacterLegacy(sql, request(lostOutput));
    await invoke('apply', lostPlan, { failOutput: true, error: 'CHARACTER_LEGACY_RECONCILIATION_FAILED' });
    const lostScope = { tenantId: user.tenantId, ownerId: user.id, characterId: lostOutput };
    const found = (await invoke('receipt', lostScope, { expectedPlan: lostPlan.fingerprint })).receipt;
    assert.equal(found.status, 'already_applied');
    assert.equal((await invoke('apply', lostPlan)).receipt.bookId, found.bookId);
    assert.equal((await state(lostOutput)).books.length, 1);
    checks.push('Actual CLI report write fails after database commit; receipt lookup recovers the result and retry does not create a second book');

    const rollback = await seed();
    const rollbackBook = await addBook(rollback);
    const rollbackPlan = await planCharacterLegacy(sql, request(rollback, { kind: 'current' }, [{ bookId: rollbackBook, action: 'detach' }]));
    const rollbackBefore = await state(rollback);
    await sql.unsafe(`CREATE FUNCTION reject_legacy_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.character_id = '${rollback}'::uuid THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END $$`);
    await sql.unsafe('CREATE TRIGGER reject_legacy_receipt BEFORE INSERT ON character_import_repairs FOR EACH ROW EXECUTE FUNCTION reject_legacy_receipt()');
    try { await assert.rejects(applyCharacterLegacy(sql, rollbackPlan, rollbackPlan.fingerprint)); }
    finally { await sql.unsafe('DROP TRIGGER reject_legacy_receipt ON character_import_repairs'); await sql.unsafe('DROP FUNCTION reject_legacy_receipt()'); }
    assert.deepEqual(await state(rollback), rollbackBefore);
    checks.push('Failure after copy and detach rolls back book, every entry, binding changes and durable receipt together');

    const locked = await seed();
    const lockedBook = await addBook(locked);
    const lockedPlan = await planCharacterLegacy(sql, request(locked, { kind: 'current' }, [{ bookId: lockedBook, action: 'keep' }]));
    const editor = connection();
    let editing;
    await lockedApply(lockedPlan, async (pid, release) => {
      editing = editor`UPDATE worldbook_entries SET content = 'Later author change' WHERE worldbook_id = ${lockedBook}`.execute();
      editing.catch(() => {});
      await waitBlocked(pid);
      release.resolve();
    });
    await editing;
    assert.equal((await sql`SELECT content FROM worldbook_entries WHERE worldbook_id = ${lockedBook}`)[0].content, 'Later author change');
    checks.push('Real concurrent entry editor waits behind locked reviewed rows and its later change is preserved');

    const bindingTarget = await seed();
    const independent = await addBook(null);
    const bindingPlan = await planCharacterLegacy(sql, request(bindingTarget));
    let binding;
    await lockedApply(bindingPlan, async (pid, release) => {
      binding = api(`/characters/${bindingTarget}/worldbooks/${independent}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);
      binding.catch(() => {});
      await waitBlocked(pid);
      release.resolve();
    });
    await binding;
    assert.equal((await state(bindingTarget)).books.length, 2);
    checks.push('Real HTTP binding waits behind repair character lock, then preserves the explicit extra reference');

    const editFirst = await seed();
    const editFirstBook = await addBook(editFirst);
    const editFirstPlan = await planCharacterLegacy(sql, request(editFirst, { kind: 'current' }, [{ bookId: editFirstBook, action: 'keep' }]));
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    const writer = connection();
    const applying = connection();
    const writing = writer.begin(async transaction => {
      await transaction`UPDATE worldbook_entries SET content = 'Committed before repair' WHERE worldbook_id = ${editFirstBook}`;
      held.resolve((await transaction`SELECT pg_backend_pid() AS pid`)[0].pid);
      await release.promise;
    });
    writing.catch(error => held.reject(error));
    const writerPid = await held.promise;
    const refused = assert.rejects(applyCharacterLegacy(applying, editFirstPlan, editFirstPlan.fingerprint), { code: 'LEGACY_REVIEW_CHANGED' });
    refused.catch(() => {});
    try { await waitBlocked(writerPid); } finally { release.resolve(); }
    await Promise.all([writing, refused]);
    assert.equal((await state(editFirst)).books.length, 1);
    checks.push('When an entry editor commits first, repair waits then rejects the stale review with no partial writes');

    const insertTarget = await seed();
    const insertBook = await addBook(insertTarget);
    const insertPlan = await planCharacterLegacy(sql, request(insertTarget, { kind: 'current' }, [{ bookId: insertBook, action: 'keep' }]));
    const inserter = connection();
    let inserting;
    await lockedApply(insertPlan, async (pid, release) => {
      inserting = inserter`INSERT INTO worldbook_entries (worldbook_id, keyword, content) VALUES (${insertBook}, 'new', 'Post-repair insertion')`.execute();
      inserting.catch(() => {});
      await waitBlocked(pid);
      release.resolve();
    });
    await inserting;
    assert.equal((await sql`SELECT count(*)::int AS count FROM worldbook_entries WHERE worldbook_id = ${insertBook}`)[0].count, 2);
    checks.push('Book row locks also block a phantom entry insertion; explicit later author insertion survives');

    const oldRepair = await checkCharacterImportRepair({ sql, api: (path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) => api(path, body, method, expected), user, makeStory, snapshot });
    checks.push(`Existing narrow repair regression: ${oldRepair.groups.length} groups, including both real binding lock orders, rollback and frozen story checks`);
    const execute = promisify(execFile);
    const container = (await execute('docker', ['ps', '--filter', 'publish=55448', '--format', '{{.Names}}'])).stdout.trim();
    assert.match(container, /^squaretable-entry-db-[a-f0-9-]+$/);
    await execute('docker', ['exec', container, 'pg_dump', '-U', 'entry_check', '-d', 'squaretable_beta_test', '-Fc', '-f', '/tmp/legacy-recovery.dump']);
    await execute('docker', ['exec', container, 'createdb', '-U', 'entry_check', 'squaretable_legacy_restore_test']);
    await execute('docker', ['exec', container, 'pg_restore', '-U', 'entry_check', '-d', 'squaretable_legacy_restore_test', '--no-owner', '--no-privileges', '--exit-on-error', '/tmp/legacy-recovery.dump']);
    const restoreUrl = new URL(process.env.DATABASE_URL);
    restoreUrl.pathname = '/squaretable_legacy_restore_test';
    const restored = postgres(restoreUrl.toString(), { max: 1, onnotice: () => {} });
    connections.push(restored);
    assert.deepEqual((await restored`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${oldStory.id}`)[0].snapshot, oldSnapshot);
    assert.deepEqual(await restored`SELECT * FROM worldbook_entries WHERE worldbook_id = ${existing}`, originalRows);
    assert.equal((await invoke('receipt', scope, { expectedPlan: externalPlan.fingerprint, databaseUrl: restoreUrl.toString() })).receipt.bookId, externalReceipt.bookId);
    assert.equal((await invoke('apply', editedPlan, { databaseUrl: restoreUrl.toString() })).receipt.status, 'already_applied');
    assert.equal((await restored`SELECT count(*)::int AS count FROM worldbooks WHERE character_id = ${edited}`)[0].count, 1);
    checks.push('Nonempty custom dump restored into a second isolated database preserves detached original entries, frozen stories and durable CLI retry receipts');
    assert.equal(getStreamCount(), initialStreams);
    const sources = [];
    for (const path of ['src/db/character-legacy-reconciliation.ts', 'scripts/character-legacy-reconcile.ts', 'scripts/character-legacy-check.mjs', 'src/db/character-import-audit.ts', 'src/db/character-import-repair.ts']) {
      sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
    await writeFile(`${evidence}/report.json`, JSON.stringify({ result: 'passed', at: new Date().toISOString(), checks, oldRepair, sources,
      scope: 'disposable database and local controlled provider; no actual candidate repair, no paid model verification', addedStreams: getStreamCount() - initialStreams }, null, 2));
    console.info(`PASS: ${checks.length} legacy reconciliation groups; ${evidence}/report.json`);
  } catch (error) {
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ result: 'failed', completed: checks, error: error.message, stack: error.stack }, null, 2), { mode: 0o600 });
    throw error;
  } finally { await Promise.all(connections.map(client => client.end({ timeout: 5 }))); }
}
