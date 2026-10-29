import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { build } from 'esbuild';

export async function checkCharacterImportRepair({ sql, api, user, makeStory, snapshot }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-repair-check-'));
  const characters = [];
  const stories = [];
  const standaloneBooks = [];
  const connections = [];
  const groups = [];
  const embedded = { name: 'Synthetic repair book', entries: [
    { keys: ['repair-key'], content: 'PRIVATE_REPAIR_SOURCE', insertion_order: 7, recursive: false, extensions: { probability: 25, position: 4, depth: 2, role: 1 } },
    { keys: ['second'], content: 'Synthetic second entry', enabled: false },
  ] };
  const bundle = await build({ stdin: { contents: "export { repairCharacterImport } from './src/db/character-import-repair.ts'; export { auditCharacterImports } from './src/db/character-import-audit.ts';", resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node' });
  const { repairCharacterImport, auditCharacterImports } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
  function connection() {
    const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    connections.push(client);
    return client;
  }
  async function seed(cardData = { character_book: embedded }) {
    const created = await api('/characters', { name: 'Synthetic historical repair', cardData: { name: 'Synthetic historical repair' } });
    characters.push(created.id);
    await sql`UPDATE characters SET card_data = ${sql.json({ name: 'Synthetic historical repair', ...cardData })} WHERE id = ${created.id}`;
    return created.id;
  }
  async function review(characterId) {
    const report = await auditCharacterImports(sql, { tenantId: user.tenantId, ownerId: user.id, characterIds: [characterId] });
    return { tenantId: user.tenantId, ownerId: user.id, characterId, expectedReview: report.results[0].reviewFingerprint };
  }
  async function counts(characterId) {
    return (await sql`SELECT
      (SELECT count(*)::int FROM worldbooks WHERE character_id = ${characterId}) AS books,
      (SELECT count(*)::int FROM worldbook_entries WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = ${characterId})) AS entries,
      (SELECT count(*)::int FROM character_import_repairs WHERE character_id = ${characterId}) AS receipts`)[0];
  }
  async function invoke(scope, expectedCode = 0) {
    const report = join(directory, `${randomUUID()}.json`);
    const args = ['--import', 'tsx', 'scripts/character-import-repair.ts', '--tenant', scope.tenantId, '--owner', scope.ownerId,
      '--character', scope.characterId, '--expected-review', scope.expectedReview, '--apply', '--report', report];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
    });
    assert.equal(result.code, expectedCode, 'Repair CLI status');
    if (expectedCode) {
      assert.equal(result.stdout, '');
      assert.ok(!result.stderr.includes('PRIVATE_REPAIR_SOURCE'));
      await assert.rejects(stat(report), { code: 'ENOENT' });
      return JSON.parse(result.stderr);
    }
    assert.equal(result.stderr, '');
    const text = await readFile(report, 'utf8');
    assert.ok(!text.includes('PRIVATE_REPAIR_SOURCE'));
    assert.ok(!text.includes('Synthetic historical repair'));
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    const parsed = JSON.parse(text);
    assert.equal(JSON.parse(result.stdout).status, parsed.status);
    return parsed;
  }
  async function waitBlocked(blockerPid) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))) AS blocked`;
      if (row.blocked) return;
      await delay(25);
    }
    assert.fail('Expected database lock contention was not observed');
  }
  try {
    const target = await seed();
    const oldStory = await makeStory(target);
    stories.push(oldStory.id);
    const oldSnapshot = await snapshot(oldStory.id);
    assert.equal(oldSnapshot.bindings[0].books.length, 0);
    const scope = await review(target);
    const first = await invoke(scope);
    const retry = await invoke(scope);
    assert.equal(first.status, 'applied');
    assert.equal(retry.status, 'already_applied');
    assert.equal(retry.writePerformed, false);
    assert.equal(retry.currentStateRechecked, false);
    assert.equal(first.bookId, retry.bookId);
    assert.equal(first.appliedAt, retry.appliedAt);
    assert.deepEqual(await counts(target), { books: 1, entries: 2, receipts: 1 });
    const [settingsType] = await sql`SELECT bool_and(jsonb_typeof(settings) = 'object') AS valid FROM worldbook_entries WHERE worldbook_id = ${first.bookId}`;
    assert.equal(settingsType.valid, true);
    assert.equal((await sql`SELECT recursive FROM worldbook_entries WHERE worldbook_id = ${first.bookId} AND keyword = 'repair-key'`)[0].recursive, false);
    const audited = await auditCharacterImports(sql, { tenantId: user.tenantId, ownerId: user.id, characterIds: [target] });
    assert.equal(audited.results[0].status, 'matching_bound_book');
    await assert.rejects(repairCharacterImport(sql, await review(target)), { code: 'REPAIR_NOT_ELIGIBLE' });
    const newStory = await makeStory(target);
    stories.push(newStory.id);
    assert.equal((await snapshot(newStory.id)).bindings[0].books[0].entries.length, 2);
    assert.deepEqual(await snapshot(oldStory.id), oldSnapshot);
    groups.push('Real repair CLI creates mapped book/entries and a durable receipt; subprocess retry is a no-op; old story remains empty and new story captures the repaired book');

    const stale = await seed();
    const staleScope = await review(stale);
    await api(`/characters/${stale}`, { name: 'Edited after review' }, 'PATCH', 200);
    assert.equal((await invoke(staleScope, 1)).code, 'REPAIR_REVIEW_CHANGED');
    assert.deepEqual(await counts(stale), { books: 0, entries: 0, receipts: 0 });
    const other = await seed();
    const otherScope = await review(other);
    assert.equal((await invoke({ ...otherScope, tenantId: randomUUID() }, 1)).code, 'REPAIR_NOT_FOUND_IN_SCOPE');
    assert.equal((await invoke({ ...otherScope, ownerId: randomUUID() }, 1)).code, 'REPAIR_NOT_FOUND_IN_SCOPE');
    for (const cardData of [{}, { character_book: { entries: [] } }, { data: { character_book: embedded } },
      { _squaretableImport: { version: 1, original: { character_book: embedded } } }, { character_book: { entries: 'invalid' } },
      { character_book: embedded, data: { character_book: { entries: [] } } }]) {
      const ineligible = await seed(cardData);
      await assert.rejects(repairCharacterImport(sql, await review(ineligible)), { code: 'REPAIR_NOT_ELIGIBLE' });
      assert.deepEqual(await counts(ineligible), { books: 0, entries: 0, receipts: 0 });
    }
    groups.push('Stale source, foreign tenant/owner, empty/invalid/nested/archive/conflicting sources are rejected without book or receipt writes');

    const rollback = await seed({ character_book: { entries: [embedded.entries[0], { keys: ['x'.repeat(256)], content: 'Rejected second entry' }] } });
    await assert.rejects(repairCharacterImport(sql, await review(rollback)), { code: '22001' });
    assert.deepEqual(await counts(rollback), { books: 0, entries: 0, receipts: 0 });
    const receiptFailure = await seed();
    const receiptScope = await review(receiptFailure);
    await sql.unsafe(`CREATE FUNCTION repair_check_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.character_id = '${receiptFailure}'::uuid THEN RAISE EXCEPTION 'Synthetic receipt failure'; END IF; RETURN NEW; END; $$`);
    await sql.unsafe('CREATE TRIGGER repair_check_fail_receipt BEFORE INSERT ON character_import_repairs FOR EACH ROW EXECUTE FUNCTION repair_check_fail_receipt()');
    try {
      await assert.rejects(repairCharacterImport(sql, receiptScope), { code: 'P0001' });
      assert.deepEqual(await counts(receiptFailure), { books: 0, entries: 0, receipts: 0 });
    } finally {
      await sql.unsafe('DROP TRIGGER repair_check_fail_receipt ON character_import_repairs');
      await sql.unsafe('DROP FUNCTION repair_check_fail_receipt()');
    }
    assert.equal((await invoke(receiptScope)).status, 'applied');
    groups.push('Second-entry constraint failure and receipt-write failure roll back the entire book/entries/receipt; retry after removing the failure succeeds');

    const concurrent = await seed();
    const concurrentScope = await review(concurrent);
    const outcomes = await Promise.all([invoke(concurrentScope), invoke(concurrentScope)]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), ['already_applied', 'applied']);
    assert.deepEqual(await counts(concurrent), { books: 1, entries: 2, receipts: 1 });
    await sql`DELETE FROM worldbooks WHERE character_id = ${concurrent}`;
    assert.equal((await invoke(concurrentScope)).status, 'already_applied');
    assert.deepEqual(await counts(concurrent), { books: 0, entries: 0, receipts: 1 });
    groups.push('Concurrent CLI repairs create exactly one book and receipt; deleting the book does not erase the receipt or let the old request resurrect it');

    const bindTarget = await seed();
    const bindScope = await review(bindTarget);
    const independent = await api('/worldbooks', { name: 'Explicit reference', scope: 'global' });
    standaloneBooks.push(independent.id);
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    const client = connection();
    let blockerPid;
    const gated = { begin: (options, callback) => client.begin(options, async transaction => {
      blockerPid = (await transaction`SELECT pg_backend_pid() AS pid`)[0].pid;
      return callback(new Proxy(transaction, { get(targetSql, property) {
        if (property !== 'unsafe') return Reflect.get(targetSql, property);
        return async (...args) => {
          const result = await targetSql.unsafe(...args);
          if (args[0].includes('FROM characters') && args[0].includes('FOR UPDATE')) { held.resolve(); await release.promise; }
          return result;
        };
      } }));
    }) };
    const runningRepair = repairCharacterImport(gated, bindScope);
    runningRepair.catch(error => held.reject(error));
    let binding;
    try {
      await held.promise;
      binding = api(`/characters/${bindTarget}/worldbooks/${independent.id}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);
      binding.catch(() => {});
      await waitBlocked(blockerPid);
    } finally { release.resolve(); }
    const [repaired] = await Promise.all([runningRepair, binding]);
    assert.equal(repaired.status, 'applied');
    assert.deepEqual(await counts(bindTarget), { books: 2, entries: 2, receipts: 1 });
    const afterBinding = await auditCharacterImports(sql, { tenantId: user.tenantId, ownerId: user.id, characterIds: [bindTarget] });
    assert.equal(afterBinding.results[0].status, 'matching_with_additional_bindings');
    groups.push('Actual HTTP binding waits behind the repair character lock, then preserves both the repaired book and the explicitly selected additional reference');

    const bindFirstTarget = await seed();
    const bindFirstScope = await review(bindFirstTarget);
    const bindFirstBook = await api('/worldbooks', { name: 'Bind before repair', scope: 'global' });
    standaloneBooks.push(bindFirstBook.id);
    const bookHeld = Promise.withResolvers();
    const bookRelease = Promise.withResolvers();
    const locker = connection();
    const waitingRepairClient = connection();
    const locking = locker.begin(async transaction => {
      const pid = (await transaction`SELECT pg_backend_pid() AS pid`)[0].pid;
      await transaction`SELECT id FROM worldbooks WHERE id = ${bindFirstBook.id} FOR UPDATE`;
      bookHeld.resolve(pid);
      await bookRelease.promise;
    });
    locking.catch(error => bookHeld.reject(error));
    let firstBinding;
    let rejectedRepair;
    try {
      const pid = await bookHeld.promise;
      firstBinding = api(`/characters/${bindFirstTarget}/worldbooks/${bindFirstBook.id}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);
      firstBinding.catch(() => {});
      await waitBlocked(pid);
      const [waitingBinder] = await sql`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid)) LIMIT 1`;
      rejectedRepair = assert.rejects(repairCharacterImport(waitingRepairClient, bindFirstScope), { code: 'REPAIR_REVIEW_CHANGED' });
      rejectedRepair.catch(() => {});
      await waitBlocked(waitingBinder.pid);
    } finally { bookRelease.resolve(); }
    await Promise.all([locking, firstBinding, rejectedRepair]);
    assert.deepEqual(await counts(bindFirstTarget), { books: 1, entries: 0, receipts: 0 });
    groups.push('When the real HTTP binding holds the character share lock first, repair waits and then rejects the stale review without inserting an extra book');
    return { groups, durableRetriesVerified: true, concurrentBindingOrdersVerified: true, liveRepairs: 0 };
  } finally {
    await Promise.all(connections.map(client => client.end({ timeout: 5 })));
    if (stories.length) await sql`DELETE FROM chats WHERE id IN ${sql(stories)}`;
    if (characters.length) await sql`DELETE FROM characters WHERE id IN ${sql(characters)}`;
    if (standaloneBooks.length) await sql`DELETE FROM worldbooks WHERE id IN ${sql(standaloneBooks)}`;
    await rm(directory, { recursive: true, force: true });
  }
}
