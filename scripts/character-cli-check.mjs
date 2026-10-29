import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { cardV1, formatCases } from './fixtures/character-card-formats.mjs';

export async function checkCharacterCli({ sql, email, userId, root, references }) {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-cli-check-'));
  const groups = [];
  const cardDirectory = join(directory, 'cards');
  const bookDirectory = join(directory, 'books');
  const mixedDirectory = join(directory, 'mixed');
  async function invoke(source, flags = [], expected = 0) {
    const args = ['--import', 'tsx', 'scripts/import-cards.ts', '--dir', source, '--email', email, ...flags];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
    });
    assert.equal(result.code, expected, 'CLI exit status');
    assert.equal(result.stderr, '', 'CLI must not leak raw failures');
    return JSON.parse(result.stdout);
  }
  const counts = async () => (await sql`SELECT
    (SELECT count(*)::int FROM characters WHERE creator_id = ${userId}) AS cards,
    (SELECT count(*)::int FROM worldbooks WHERE user_id = ${userId}) AS books,
    (SELECT count(*)::int FROM worldbook_entries WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE user_id = ${userId})) AS entries`)[0];
  const entries = bookId => sql`SELECT keyword, content, position, is_enabled, priority, settings, recursive, prevent_recursion
    FROM worldbook_entries WHERE worldbook_id = ${bookId} ORDER BY position, content`;
  async function compareEntries(cliId, webId) {
    const cliRows = [...await entries(cliId)];
    const webRows = [...await entries(webId)];
    const sameRows = isDeepStrictEqual(cliRows.map(row => JSON.stringify(row)).sort(), webRows.map(row => JSON.stringify(row)).sort());
    if (sameRows && !isDeepStrictEqual(cliRows, webRows)) {
      console.info('CLI parity: SQL ties returned in different order; all persisted entry fields match as a multiset.');
    }
    assert.ok(sameRows, 'CLI/web mapping parity includes all entry fields and authored position values');
  }
  try {
    await mkdir(cardDirectory); await mkdir(bookDirectory); await mkdir(mixedDirectory);
    for (const [index, reference] of references.entries()) {
      reference.cliFile = `sample-${index}.${reference.kind === 'standalone-worldbook' ? 'json' : 'png'}`;
      await copyFile(join(root, reference.relativePath), join(reference.kind === 'standalone-worldbook' ? bookDirectory : cardDirectory, reference.cliFile));
    }
    const before = await counts();
    const dry = await invoke(cardDirectory, ['--dry-run']);
    assert.equal(dry.summary.ready, 3); assert.equal(dry.summary.imported, 0);
    assert.deepEqual(await counts(), before);
    const skipped = await invoke(bookDirectory);
    assert.equal(skipped.summary.skipped, 2); assert.equal(skipped.summary.imported, 0);
    assert.deepEqual(await counts(), before);
    groups.push('CLI dry-run produces readiness only; default standalone skip performs no writes');

    const cards = await invoke(cardDirectory);
    assert.equal(cards.summary.imported, 3);
    for (const row of cards.results) {
      const reference = references.find(item => item.cliFile === row.file);
      const [web] = await sql`SELECT card_data, tags FROM characters WHERE id = ${reference.id}`;
      const [cli] = await sql`SELECT card_data, tags, creator_id, tenant_id, is_public FROM characters WHERE id = ${row.id}`;
      assert.ok(isDeepStrictEqual(cli.card_data, web.card_data), 'CLI and web card data including original metadata');
      assert.ok(isDeepStrictEqual(cli.tags, web.tags), 'CLI preserves author tags without directory injection');
      assert.equal(cli.creator_id, userId); assert.equal(cli.is_public, false);
      const webBooks = await sql`SELECT id FROM worldbooks WHERE character_id = ${reference.id}`;
      const cliBooks = await sql`SELECT id, user_id, tenant_id, scope FROM worldbooks WHERE character_id = ${row.id}`;
      assert.equal(cliBooks.length, webBooks.length);
      for (const [index, book] of cliBooks.entries()) {
        assert.equal(book.user_id, userId); assert.equal(book.tenant_id, cli.tenant_id); assert.equal(book.scope, 'character');
        await compareEntries(book.id, webBooks[index].id);
      }
    }
    groups.push('Three authorized PNGs imported by actual CLI match web fields, original metadata, tags, owner and embedded book rows');

    const books = await invoke(bookDirectory, ['--include-worldbooks']);
    assert.equal(books.summary.imported, 2);
    for (const row of books.results) {
      const reference = references.find(item => item.cliFile === row.file);
      const [stored] = await sql`SELECT scope, character_id, user_id FROM worldbooks WHERE id = ${row.id}`;
      assert.equal(stored.scope, 'global'); assert.equal(stored.character_id, null); assert.equal(stored.user_id, userId);
      await compareEntries(row.id, reference.id);
    }
    groups.push('Two explicitly selected standalone books match web mappings without inferred character bindings');

    const validEntry = { keys: ['door'], content: 'Synthetic safe content' };
    const invalidEntries = [validEntry, { keys: ['x'.repeat(300)], content: 'Rollback marker' }];
    const badCard = { ...cardV1, name: 'CLI_ROLLBACK', character_book: { entries: invalidEntries } };
    const fixtures = {
      'a-card.json': JSON.stringify(cardV1), 'b-duplicate.json': JSON.stringify(cardV1),
      'c-invalid.json': JSON.stringify(badCard), 'd-invalid-copy.json': JSON.stringify(badCard),
      'e-book.json': JSON.stringify({ name: 'CLI_BOOK_ROLLBACK', entries: invalidEntries }),
      'f-broken.png': 'PRIVATE_FIXTURE_MUST_NOT_APPEAR',
      'z-variant.json': JSON.stringify({ ...cardV1, first_mes: 'A different opening with the same name and description' }),
    };
    for (const [name, content] of Object.entries(fixtures)) await writeFile(join(mixedDirectory, name), content);
    const beforeMixed = await counts();
    const reportPath = join(directory, 'report.json');
    const mixed = await invoke(mixedDirectory, ['--include-worldbooks', '--report', reportPath], 2);
    assert.deepEqual(mixed.summary, { total: 7, ready: 0, imported: 2, failed: 4, duplicate: 1, skipped: 0 });
    assert.deepEqual(await counts(), { ...beforeMixed, cards: beforeMixed.cards + 2 });
    assert.equal((await sql`SELECT count(*)::int AS count FROM characters WHERE name = 'CLI_ROLLBACK' AND creator_id = ${userId}`)[0].count, 0);
    assert.equal((await sql`SELECT count(*)::int AS count FROM worldbooks WHERE name = 'CLI_BOOK_ROLLBACK' AND user_id = ${userId}`)[0].count, 0);
    assert.ok(!JSON.stringify(mixed).includes('PRIVATE_FIXTURE_MUST_NOT_APPEAR'));
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), mixed);
    groups.push('CLI partial failure exit 2, per-file character/book/entry rollback, next-file continuation, exact-byte dedup and same-name variants');
    const compressedDirectory = join(directory, 'compressed');
    await mkdir(compressedDirectory);
    const selected = formatCases().filter(item => ['compressed-v3.png', 'ztext-v3.png', 'compressed-over-limit.png', 'trailing-zlib.png', 'compressed-v3-no-fallback.png'].includes(item.name));
    for (const fixture of selected) await writeFile(join(compressedDirectory, fixture.name), fixture.bytes);
    const beforeCompressed = await counts();
    const compressed = await invoke(compressedDirectory, [], 2);
    assert.deepEqual(compressed.summary, { total: 5, ready: 0, imported: 2, failed: 3, duplicate: 0, skipped: 0 });
    assert.equal(compressed.results.find(item => item.file === 'compressed-over-limit.png').code, 'METADATA_TOO_LARGE');
    assert.deepEqual(await counts(), { cards: beforeCompressed.cards + 2, books: beforeCompressed.books + 2, entries: beforeCompressed.entries + 2 });
    groups.push('Actual CLI compressed iTXt/zTXt imports retain embedded books; overflow, trailing bytes and damaged selected V3 produce no records');
    return { result: 'passed', groups, samples: { cards: 3, worldbooks: 2 }, paidProviderTokens: 0 };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
