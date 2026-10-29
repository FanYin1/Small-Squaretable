import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

export async function checkCharacterImportAudit({ sql, api, user, makeStory, snapshot }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-audit-check-'));
  const embedded = { entries: [{ keys: ['audit-key'], content: 'PRIVATE_AUDIT_SOURCE' }] };
  const cases = [];
  const stories = [];
  const groups = [];
  async function seed(status, cardData = { character_book: embedded }) {
    const created = await api('/characters', { name: 'Synthetic audit fixture', cardData: { name: 'Synthetic audit fixture', ...cardData } });
    cases.push({ id: created.id, status });
    return created.id;
  }
  async function invoke(ids, ownerId = user.id, expectedCode = 0, extra = [], tenantId = user.tenantId) {
    const report = join(directory, `${randomUUID()}.json`);
    const args = ['--import', 'tsx', 'scripts/character-import-audit.ts', '--tenant', tenantId, '--owner', ownerId,
      ...ids.flatMap(id => ['--character', id]), '--report', report, ...extra];
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
    assert.equal(result.code, expectedCode, 'Audit CLI status');
    if (expectedCode) {
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^CHARACTER_IMPORT_AUDIT_FAILED:/);
      await assert.rejects(stat(report), { code: 'ENOENT' });
      return;
    }
    assert.equal(result.stderr, '');
    const text = await readFile(report, 'utf8');
    assert.ok(!text.includes('PRIVATE_AUDIT_SOURCE'));
    assert.ok(!text.includes('Synthetic audit fixture'));
    assert.equal((await stat(report)).mode & 0o777, 0o600);
    const parsed = JSON.parse(text);
    assert.deepEqual(JSON.parse(result.stdout).summary, parsed.summary);
    return parsed;
  }
  async function databaseFingerprint() {
    const result = {};
    for (const table of ['characters', 'worldbooks', 'worldbook_entries', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states']) {
      const [row] = await sql.unsafe(`SELECT md5(coalesce(string_agg(digest, ',' ORDER BY digest), '')) AS digest
        FROM (SELECT md5(to_jsonb(item)::text) AS digest FROM ${table} AS item) AS hashes`);
      result[table] = row.digest;
    }
    return result;
  }
  try {
    const matched = await seed('matching_bound_book');
    const story = await makeStory(matched);
    stories.push(story.id);
    const frozen = await snapshot(story.id);
    const missing = await seed('missing_bound_book');
    await sql`DELETE FROM worldbooks WHERE character_id = ${missing}`;
    const edited = await seed('bound_content_differs');
    await sql`UPDATE worldbook_entries SET content = 'Edited by author' WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = ${edited})`;
    const inactive = await seed('matching_book_inactive');
    await sql`UPDATE worldbooks SET is_enabled = false WHERE character_id = ${inactive}`;
    const conflicting = await seed('binding_ownership_conflict');
    await sql`UPDATE worldbooks SET tenant_id = ${randomUUID()} WHERE character_id = ${conflicting}`;
    await seed('no_embedded_source', {});
    await seed('empty_embedded_source', { character_book: { entries: [] } });
    await seed('nested_source_only', { data: { character_book: embedded } });
    await seed('archive_source_only', { _squaretableImport: { version: 1, original: { data: { character_book: embedded } } } });
    const invalid = await seed('invalid_embedded_source', {});
    await sql`UPDATE characters SET card_data = ${sql.json({ character_book: { entries: 'invalid' } })} WHERE id = ${invalid}`;
    const limited = await seed('inspection_limit', {});
    await sql`INSERT INTO worldbooks (tenant_id, user_id, character_id, name, scope)
      SELECT ${user.tenantId}, ${user.id}, ${limited}, 'Synthetic limit book', 'character' FROM generate_series(1, 51)`;
    const large = await seed('inspection_limit', {});
    await sql`UPDATE characters SET card_data = jsonb_build_object('padding', repeat('x', 12582913)) WHERE id = ${large}`;
    const manyEntries = await seed('inspection_limit');
    await sql`INSERT INTO worldbook_entries (worldbook_id, keyword, content)
      SELECT book.id, '', 'Synthetic limit entry' FROM worldbooks AS book CROSS JOIN generate_series(1, 10000) WHERE book.character_id = ${manyEntries}`;
    const absent = randomUUID();
    cases.push({ id: absent, status: 'not_found_in_scope' });
    const before = await databaseFingerprint();
    const report = await invoke(cases.map(item => item.id));
    for (const item of cases) {
      const result = report.results.find(row => row.characterId === item.id);
      assert.equal(result.status, item.status, 'Historical audit classification');
      assert.equal(result.automaticRepairAllowed, false);
      if (['inspection_limit', 'not_found_in_scope'].includes(item.status)) assert.equal(result.reviewFingerprint, null);
    }
    assert.deepEqual(await databaseFingerprint(), before, 'Audit must not change stored rows');
    assert.deepEqual(await snapshot(story.id), frozen, 'Existing story snapshot must remain unchanged');
    groups.push('Real audit CLI classifies 14 synthetic historical cases, enforces source/book/entry limits and leaves eight database tables unchanged');

    const repeated = await invoke([matched]);
    const previous = report.results.find(row => row.characterId === matched).reviewFingerprint;
    assert.equal(repeated.results[0].reviewFingerprint, previous);
    await sql`UPDATE worldbook_entries SET settings = settings || '{"probability": 25}'::jsonb
      WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = ${matched})`;
    const changed = await invoke([matched]);
    assert.equal(changed.results[0].status, 'bound_content_differs');
    assert.notEqual(changed.results[0].reviewFingerprint, previous);
    assert.deepEqual(await snapshot(story.id), frozen);
    const foreign = await invoke([matched], randomUUID());
    assert.equal(foreign.results[0].status, 'not_found_in_scope');
    assert.equal(foreign.results[0].reviewFingerprint, null);
    const foreignTenant = await invoke([matched], user.id, 0, [], randomUUID());
    assert.equal(foreignTenant.results[0].status, 'not_found_in_scope');
    await invoke([matched], user.id, 1, ['--apply']);
    groups.push('Private reports omit source text; repeated fingerprints are stable, changed data invalidates them, foreign owners are hidden and apply is rejected');

    const bundle = await build({ entryPoints: ['src/db/character-import-audit.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
    const { auditCharacterImports } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
    let checked = false;
    const connection = {
      begin: (options, callback) => sql.begin(options, async transaction => {
        assert.equal((await transaction`SHOW transaction_read_only`)[0].transaction_read_only, 'on');
        assert.equal((await transaction`SHOW transaction_isolation`)[0].transaction_isolation, 'repeatable read');
        await assert.rejects(transaction.savepoint(inner => inner`UPDATE characters SET name = 'Must not write' WHERE id = ${matched}`), { code: '25006' });
        checked = true;
        return callback(transaction);
      }),
    };
    await auditCharacterImports(connection, { tenantId: user.tenantId, ownerId: user.id, characterIds: [matched] });
    assert.ok(checked);
    groups.push('Audit transaction is repeatable-read/read-only; PostgreSQL rejects an attempted write with 25006');
    return { groups, syntheticCases: cases.length, repairedRecords: 0, readOnlyVerified: true, privateReportsVerified: true };
  } finally {
    if (stories.length) await sql`DELETE FROM chats WHERE id IN ${sql(stories)}`;
    if (cases.length) await sql`DELETE FROM characters WHERE id IN ${sql(cases.map(item => item.id))}`;
    await rm(directory, { recursive: true, force: true });
  }
}
