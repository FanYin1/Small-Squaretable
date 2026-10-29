import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreTables, assertNonemptyStoryCoverage, assertMatchingStoryRestore } from './story-restore-evidence.mjs';

function sample() {
  return {
    protocol: 2,
    tables: Object.fromEntries(Object.keys(restoreTables).map(name => [name, { rows: 1, digest: 'a'.repeat(32) }])),
    coverage: { identities: 1, confirmedEvents: 1, interruptedEvents: 1, boundEntries: 1, sourcedMemories: 1, invalidMemorySources: 0, invalidEventSources: 0, invalidStateSources: 0, invalidMemoryLinks: 0 },
  };
}

test('accepts matching nonempty story evidence', () => assertMatchingStoryRestore(sample(), sample()));
for (const collection of ['messages', 'events', 'memories', 'vectors']) {
  test(`rejects matching empty ${collection} evidence`, () => {
    const empty = sample();
    empty.tables[collection] = { rows: 0, digest: 'd41d8cd98f00b204e9800998ecf8427e' };
    assert.throws(() => assertMatchingStoryRestore(empty, structuredClone(empty)), /Nonempty restore sample/);
  });
}
for (const coverage of ['interruptedEvents', 'sourcedMemories', 'boundEntries']) {
  test(`requires ${coverage} in the source sample`, () => {
    const incomplete = sample();
    incomplete.coverage[coverage] = 0;
    assert.throws(() => assertNonemptyStoryCoverage(incomplete), /Missing restore coverage/);
  });
}
for (const coverage of ['invalidMemorySources', 'invalidEventSources', 'invalidStateSources', 'invalidMemoryLinks']) {
  test(`rejects ${coverage} even when restored data matches`, () => {
    const invalid = sample();
    invalid.coverage[coverage] = 1;
    assert.throws(() => assertMatchingStoryRestore(invalid, structuredClone(invalid)), /Broken restore source links/);
  });
}
test('detects corrupted vectors with unchanged row counts', () => {
  const restored = sample();
  restored.tables.vectors.digest = 'b'.repeat(32);
  assert.throws(() => assertMatchingStoryRestore(sample(), restored), /must match/);
});
test('rejects the old count-free evidence format', () => {
  assert.throws(() => assertNonemptyStoryCoverage({ messages: 'd41d8cd98f00b204e9800998ecf8427e' }), /must include counts/);
});
