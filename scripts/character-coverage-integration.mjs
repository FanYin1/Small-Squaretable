import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { tsImport } from 'tsx/esm/api';

const { parseCharacterFile } = await tsImport('../src/types/character-card-import.ts', import.meta.url);
const { inspectStoryCapabilities } = await tsImport('../src/types/story-capabilities.ts', import.meta.url);

export async function checkCoverageImports({ api, sql, auth, waitBudget }) {
  assert.ok(process.env.CHARACTER_COVERAGE_MANIFEST && process.env.CARD_LIBRARY_SAMPLE_ROOT);
  const root = await realpath(process.env.CARD_LIBRARY_SAMPLE_ROOT);
  const selected = JSON.parse(await readFile(process.env.CHARACTER_COVERAGE_MANIFEST, 'utf8'));
  assert.ok(Array.isArray(selected) && selected.length > 0 && selected.length <= 30);
  const samples = [];
  for (const source of selected) {
    await waitBudget();
    const file = await realpath(source.path);
    const location = relative(root, file);
    assert.ok(location && location !== '..' && !location.startsWith(`..${sep}`) && !location.startsWith(sep));
    const bytes = await readFile(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    const imported = (await parseCharacterFile(bytes)).character;
    const form = new FormData();
    form.append('files', new Blob([bytes]), `coverage-${source.sha256.slice(0, 12)}.${bytes[0] === 137 ? 'png' : 'json'}`);
    const result = await api('/characters/import/batch', form, 'POST', 200);
    assert.equal(result.failed.length, 0, `Selected external sample ${source.sha256} must import`);
    assert.equal(result.imported.length, 1);
    const characterId = result.imported[0].id;
    const [stored] = await sql`SELECT card_data FROM characters WHERE id = ${characterId}`;
    assert.deepEqual(stored.card_data._squaretableImport.original, imported.cardData._squaretableImport.original);
    const diagnostic = await api(`/characters/${characterId}/compatibility`);
    assert.deepEqual(diagnostic.capabilities, inspectStoryCapabilities(imported.cardData));
    assert.equal(diagnostic.identity.status, 'unverified');
    const story = await api('/chats', { characterId, clientRequestId: randomUUID() });
    const [content] = await sql`SELECT snapshot FROM story_content WHERE chat_id = ${story.id}`;
    const [book] = await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${story.id}`;
    assert.deepEqual(content.snapshot.characters[0].cardData, stored.card_data);
    assert.deepEqual(content.snapshot.characters[0].diagnostics, diagnostic);
    const previews = await api(`/chats/${story.id}/characters`);
    assert.deepEqual(previews[0].diagnostics, diagnostic);
    assert.deepEqual(Object.keys(previews[0].cardData).sort(), ['alternate_greetings', 'first_mes']);
    assert.ok(book.snapshot.bindings.every(binding => binding.characterId === characterId));
    const [messages] = await sql`SELECT count(*) AS count FROM messages WHERE chat_id = ${story.id}`;
    assert.equal(Number(messages.count), 0);
    assert.equal((await sql`SELECT count(*) AS count FROM chats WHERE id = ${story.id} AND user_id = ${auth.user.id}`)[0].count, '1');
    samples.push({ sha256: source.sha256, categories: source.categories, issues: diagnostic.capabilities.issues, boundBooks: diagnostic.books.bound,
      checks: ['original preserved in database', 'API diagnosis agrees with production normalization', 'story freezes original and diagnostic', 'safe preview contains no additional card fields', 'no generation or author execution'] });
  }
  return { checks: ['Selected external structures pass real import, binding diagnosis, frozen source and safe-preview checks without generation'], samples,
    provider: 'not called for external sources', paidProviderTokens: 0 };
}
