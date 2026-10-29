import { createHash } from 'node:crypto';
import type { DiagnosticBook } from '../../types/story-diagnostics';
import type { OpeningReference } from '../../types/story-opening';
import type { OpeningRecord } from '../../types/story-opening-record';
import type { AdaptationFindingCode, StoryAdaptationReport } from '../../types/story-adaptation';

const reviewedSources: ReadonlyArray<{ digest: string; codes: AdaptationFindingCode[] }> = [
  { digest: '85e323754685ef5916fc10b7774f7949115abeb67b0c8aedb911eaeef4d691ff', codes: ['dynamic-pricing'] },
  { digest: '8f3eb05bd30c900603ed50410225d1c8d35be2bc80a152e6c6553ee1414449d2', codes: ['model-updates', 'nested-state'] },
  { digest: 'cfdf83f037018dd5dae46111f87e62db5f8ff73b6a4dbd9c2de2be0994ba96f9', codes: ['nested-state'] },
  { digest: 'f8fce029a50ee8ad45cfef392f4e7a3238fba54726b02bd11683ffb1b760b57f', codes: ['model-updates', 'nested-state'] },
  { digest: 'f54035730fbc09c9af4960edb162b9e561f650e9af64713a4ee6ebebede00ce8', codes: ['model-updates'] },
  { digest: '589038328226c02b9af1ffdb44a9bb9c056b6c2b8665d19802cd1d3c981f0d56', codes: ['monthly-settlement'] },
  { digest: 'cf96e2335b11b8dce278f6117ad188996e95958c7bd37a3bf218555dec31e619', codes: ['nested-state'] },
  { digest: '4f3b8a70dda64abba90132745df41a56624da858fc4d18cecdbc02d4304b3147', codes: ['dice-resolution'] },
];

export function inspectAdaptationFindings(characterId: string, books: DiagnosticBook[]): StoryAdaptationReport['findings'] {
  const enabledDigests = new Set(books.filter(book => book.characterId === characterId && book.scope === 'character' && book.isEnabled)
    .flatMap(book => book.entries.filter(entry => entry.isEnabled).map(entry => createHash('sha256').update(entry.content).digest('hex'))));
  const findings = new Map<AdaptationFindingCode, Set<string>>();
  for (const source of reviewedSources) {
    if (!enabledDigests.has(source.digest)) continue;
    for (const code of source.codes) {
      if (!findings.has(code)) findings.set(code, new Set());
      findings.get(code)!.add(source.digest);
    }
  }
  return [...findings].map(([code, digests]) => ({ code, sourceDigests: [...digests].sort() }));
}

export function prepareAdaptationReport(entryRevision: string, opening: OpeningReference, record: OpeningRecord,
  rulesStatus: 'native' | 'adapted' | 'unadapted' | 'invalid', findings: StoryAdaptationReport['findings']): StoryAdaptationReport {
  return {
    version: 1, entryRevision, opening,
    initial: record.status === 'initial-only' ? 'recorded' : record.status === 'native' ? 'native'
      : record.status === 'conflict' ? 'conflict' : 'unavailable',
    runtime: rulesStatus === 'invalid' ? 'invalid' : record.status === 'conflict' ? 'conflict'
      : rulesStatus === 'native' ? 'native' : rulesStatus === 'adapted' ? 'adapted' : findings.length ? 'unsupported' : 'unverified',
    findings,
  };
}
