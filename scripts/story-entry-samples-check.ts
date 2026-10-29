import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseCharacterFile } from '../src/types/character-card-import';
import { buildStoryEntryProfile, selectStoryOpening } from '../src/server/services/story-entry.service';
import { openingContent, openingSelectable } from '../src/types/story-opening';
import type { StoryContentSnapshot } from '../src/types/story-content';
import { prepareOpeningRecord } from '../src/server/services/story-opening-record.service';
import { inspectAdaptationFindings } from '../src/server/services/story-adaptation.service';
import { storyContentSnapshotSchema } from '../src/types/story-content';
import type { StorySources } from '../src/server/services/story-diagnostics.service';

const paths = process.argv.slice(2);
assert.ok(paths.length > 0, 'Pass local character card paths; no database or model calls are made');
const results = [];
const expectedDefaultKinds = new Map([
  ['68b4c886ce67b078d58f4cd4b04ce4c19ff576d397bde0cc3f6503b518e6260f', 'directory'],
  ['e8031fa775dbd5e8130ef0767dd69dceca5353eacf8b8b6cba7e66a600d19c77', 'initialization'],
]);
for (const file of paths) {
  const bytes = await readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed = await parseCharacterFile(bytes);
  const characterId = randomUUID();
  const content: StoryContentSnapshot = {
    protocol: 1, revision: '0'.repeat(64), capturedAt: new Date().toISOString(), characters: [{
      id: characterId, name: parsed.character.name, description: parsed.character.description ?? null,
      avatarUrl: null, promptTemplate: null, cardData: parsed.character.cardData,
    }],
  };
  const before = JSON.stringify(content);
  const embedded = parsed.character.cardData.character_book as { entries?: Array<{ content: string; enabled?: boolean }> } | undefined;
  const entries = (embedded?.entries ?? []).map(entry => ({ content: entry.content, isEnabled: entry.enabled !== false }));
  const sources: StorySources = { characters: [], books: [{ id: randomUUID(), name: 'Private sample book', characterId, scope: 'character',
    isEnabled: true, entryCount: entries.length, enabledEntryCount: entries.filter(entry => entry.isEnabled).length, entries }] };
  const profile = buildStoryEntryProfile(content, sources);
  const findings = inspectAdaptationFindings(characterId, sources.books);
  assert.ok(findings.length > 0, 'Reviewed samples must include recognized source-backed limitations');
  assert.deepEqual(inspectAdaptationFindings(characterId, sources.books.map(book => ({ ...book, isEnabled: false }))), []);
  assert.deepEqual(inspectAdaptationFindings(randomUUID(), sources.books), []);
  assert.deepEqual(inspectAdaptationFindings(characterId, sources.books.map(book => ({ ...book, scope: 'global' }))), []);
  assert.deepEqual(inspectAdaptationFindings(characterId, sources.books.map(book => ({ ...book,
    entries: book.entries.map(entry => ({ ...entry, isEnabled: false })) }))), []);
  assert.deepEqual(inspectAdaptationFindings(characterId, sources.books.map(book => ({ ...book,
    entries: book.entries.map(entry => ({ ...entry, content: `${entry.content} ` })) }))), []);
  assert.deepEqual(inspectAdaptationFindings(characterId, [...sources.books, ...sources.books]), findings, 'Duplicate bindings cannot duplicate findings');
  const changedSources = structuredClone(sources);
  changedSources.books[0].entries[0].content += ' ';
  assert.notEqual(buildStoryEntryProfile(content, changedSources).revision, profile.revision);
  assert.throws(() => selectStoryOpening(structuredClone(content), changedSources, {
    characterId, revision: profile.revision, reference: profile.openings[1].reference, reviewed: true,
  }), /已经更新/);
  const expectedDefault = expectedDefaultKinds.get(sha256);
  if (expectedDefault) assert.equal(profile.openings[0].kind, expectedDefault, 'Known setup/menu samples must not become playable prose');
  if (sha256 === '68b4c886ce67b078d58f4cd4b04ce4c19ff576d397bde0cc3f6503b518e6260f') {
    assert.deepEqual(profile.openings.slice(1, 9).map(opening => opening.record?.fields[0]?.value), [0, 15020400, 150204000, 1000000, 300000000, 870000, 50, 25040300]);
    assert.equal(profile.openings[9].record?.status, 'unavailable');
  }
  if (sha256 === 'e8031fa775dbd5e8130ef0767dd69dceca5353eacf8b8b6cba7e66a600d19c77') {
    assert.equal(profile.openings[1].record?.fields[0]?.value, 115784);
    assert.ok(profile.openings.slice(1).every(opening => opening.record?.status === 'initial-only'));
  }
  if (profile.openings.some(opening => opening.record?.status === 'initial-only')) {
    const disabled = structuredClone(content.characters[0].cardData);
    const extensions = disabled.extensions as { regex_scripts: Array<{ disabled?: boolean; replaceString?: string }> };
    extensions.regex_scripts = extensions.regex_scripts.map(script => ({ ...script, disabled: true }));
    assert.equal(prepareOpeningRecord(disabled, profile.openings[1].reference, false).status, 'unsupported');
    extensions.regex_scripts = extensions.regex_scripts.map(script => ({ ...script, disabled: false, replaceString: `${script.replaceString ?? ''} ` }));
    assert.equal(prepareOpeningRecord(disabled, profile.openings[1].reference, false).status, 'unsupported');
  }
  const rawCard = content.characters[0].cardData;
  assert.equal(profile.openings.length, 1 + (Array.isArray(rawCard.alternate_greetings) ? rawCard.alternate_greetings.length : 0));
  for (const opening of profile.openings) {
    assert.ok(!/<\/?(?:VariableInsert|VariableEdit|VariableUpdate|VariableDelete|UpdateVariable|era_data|variablethink)\b/i.test(opening.preview));
    if (openingSelectable(opening)) {
      const frozen = structuredClone(content);
      const selected = selectStoryOpening(frozen, sources, {
        characterId, revision: profile.revision, reference: opening.reference, reviewed: true,
      });
      assert.equal(selected, openingContent(rawCard, opening.reference));
      assert.deepEqual(frozen.characters[0].openingRecord, opening.record);
      assert.deepEqual(frozen.characters[0].adaptationReport, opening.adaptationReport);
      assert.equal(opening.adaptationReport?.runtime, 'unsupported');
      assert.equal(storyContentSnapshotSchema.safeParse(frozen).success, true);
    }
  }
  assert.equal(JSON.stringify(content), before);
  results.push({ file: basename(file), sha256,
    descriptionSource: profile.description.source, rulesStatus: profile.rulesStatus,
    openingCount: profile.openings.length,
    openings: profile.openings.map(opening => ({ ...opening.reference, kind: opening.kind, previewLength: opening.preview.length, truncated: opening.truncated,
      recordStatus: opening.record?.status, recordReason: opening.record?.reason, recordFieldCount: opening.record?.fields.length })),
    sourceUnchanged: true, selectionReferencesVerified: true });
  results.at(-1)!.openings.forEach((opening, index) => Object.assign(opening, { adaptationReport: profile.openings[index].adaptationReport }));
}
const report = { generatedAt: new Date().toISOString(), scope: 'local source projection and selection only; no database, model or gameplay verification', cards: results };
if (process.env.STORY_ENTRY_SAMPLE_REPORT) await writeFile(process.env.STORY_ENTRY_SAMPLE_REPORT, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
