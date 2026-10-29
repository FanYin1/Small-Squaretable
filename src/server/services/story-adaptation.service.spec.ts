import { describe, expect, it } from 'vitest';
import { inspectAdaptationFindings, prepareAdaptationReport } from './story-adaptation.service';
import { buildStoryEntryProfile, selectStoryOpening } from './story-entry.service';
import { storyContentSnapshotSchema, type StoryContentSnapshot } from '../../types/story-content';
import { storyAdaptationReportSchema } from '../../types/story-adaptation';
import { prepareOpeningRecord } from './story-opening-record.service';
import type { DiagnosticBook } from '../../types/story-diagnostics';

const characterId = '00000000-0000-4000-8000-000000000001';
const reference = { source: 'first_mes' as const, index: 0 };
const sources = { characters: [], books: [] };
function snapshot(): StoryContentSnapshot {
  return { protocol: 1, revision: 'a'.repeat(64), capturedAt: '2026-10-26T00:00:00.000Z', characters: [{
    id: characterId, name: 'Test', description: null, avatarUrl: null, promptTemplate: null,
    cardData: { first_mes: 'A quiet station.' },
  }] };
}

describe('source-bound compatibility reports', () => {
  it('does not infer mechanics from a name, prose, a claimed digest or embedded unbound books', () => {
    const content = snapshot();
    content.characters[0].name = '蔚蓝星域';
    content.characters[0].cardData.character_book = { entries: [{ content: 'Monthly settlement. Roll D20. Credit 100.' }] };
    const books: DiagnosticBook[] = [{ id: 'book', name: 'Secret', characterId, scope: 'character', isEnabled: true,
      entryCount: 1, enabledEntryCount: 1, entries: [{ content: 'Monthly settlement. Roll D20. Credit 100.', isEnabled: true,
        settings: { digest: '589038328226c02b9af1ffdb44a9bb9c056b6c2b8665d19802cd1d3c981f0d56' } }] }];
    expect(inspectAdaptationFindings(characterId, books)).toEqual([]);
    expect(buildStoryEntryProfile(content, sources).openings[0].adaptationReport).toMatchObject({ initial: 'unavailable', runtime: 'unverified', findings: [] });
  });

  it('freezes a selected report without rewriting the source and keeps old snapshots optional', () => {
    const content = snapshot();
    const original = structuredClone(content.characters[0].cardData);
    expect(storyContentSnapshotSchema.parse(content).characters[0].adaptationReport).toBeUndefined();
    const profile = buildStoryEntryProfile(content, sources);
    selectStoryOpening(content, sources, { characterId, revision: profile.revision, reference, reviewed: false });
    expect(content.characters[0].adaptationReport).toEqual(profile.openings[0].adaptationReport);
    expect(content.characters[0].cardData).toEqual(original);
    expect(storyContentSnapshotSchema.safeParse(content).success).toBe(true);
    const saved = structuredClone(content.characters[0].adaptationReport);
    content.characters[0].cardData.first_mes = 'Changed later.';
    expect(content.characters[0].adaptationReport).toEqual(saved);
  });

  it('binds the persisted report to the selected opening and preview revision', () => {
    const content = snapshot();
    const profile = buildStoryEntryProfile(content, sources);
    selectStoryOpening(content, sources, { characterId, revision: profile.revision, reference, reviewed: false });
    const report = content.characters[0].adaptationReport!;
    report.entryRevision = 'c'.repeat(64);
    expect(storyContentSnapshotSchema.safeParse(content).success).toBe(false);
    report.entryRevision = profile.revision;
    report.opening = { source: 'alternate_greetings', index: 1 };
    expect(storyContentSnapshotSchema.safeParse(content).success).toBe(false);
    report.opening = reference;
    delete content.characters[0].opening;
    expect(storyContentSnapshotSchema.safeParse(content).success).toBe(false);
  });

  it('separates native declarations, unsupported findings, invalid rules and conflicts', () => {
    const record = prepareOpeningRecord({ first_mes: 'Hello.' }, reference, false);
    const findings = [{ code: 'dice-resolution' as const, sourceDigests: ['d'.repeat(64)] }];
    for (const [rules, runtime] of [['unadapted', 'unsupported'], ['native', 'native'], ['invalid', 'invalid']] as const) {
      const report = prepareAdaptationReport('a'.repeat(64), reference, record, rules, findings);
      expect(report.runtime).toBe(runtime);
      expect(storyAdaptationReportSchema.safeParse(report).success).toBe(true);
    }
    const conflict = prepareOpeningRecord({ first_mes: '<VariableInsert>{"coins":1}</VariableInsert>Hello.' }, reference, true);
    expect(prepareAdaptationReport('a'.repeat(64), reference, conflict, 'native', findings)).toMatchObject({ initial: 'conflict', runtime: 'conflict' });
  });

  it('rejects forged fields, invalid references, duplicate findings and source-free conclusions', () => {
    const report = buildStoryEntryProfile(snapshot(), sources).openings[0].adaptationReport!;
    const finding = { code: 'model-updates', sourceDigests: ['d'.repeat(64)] };
    for (const changed of [
      { ...report, secretTitle: 'Hidden' }, { ...report, runtime: 'unsupported' },
      { ...report, opening: { source: 'first_mes', index: 1 } },
      { ...report, findings: [finding, finding] },
      { ...report, findings: [{ ...finding, sourceDigests: ['d'.repeat(64), 'd'.repeat(64)] }] },
      { ...report, findings: [{ ...finding, content: 'Hidden' }] },
    ]) expect(storyAdaptationReportSchema.safeParse(changed).success).toBe(false);
  });
});
