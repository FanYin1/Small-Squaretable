import { createHash } from 'node:crypto';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { firstTaskSourceDigest, firstTaskOpeningDigest } from '../../types/story-first-task';
import { reviewedSourceFingerprint } from './story-reviewed-source';
import { openingContent, type OpeningReference } from '../../types/story-opening';
import { compileOpeningRecord } from './story-opening-record.service';
import { openingRecordSchema } from '../../types/story-opening-record';

export function prepareFirstTaskOpeningRecord(card: Record<string, unknown>, reference: OpeningReference) {
  const raw = openingContent(card, reference) ?? '';
  const digest = createHash('sha256').update(raw).digest('hex');
  if (reference.source !== 'first_mes' || reference.index !== 0 || digest !== firstTaskOpeningDigest) {
    return compileOpeningRecord(null, raw, reference, true);
  }
  return openingRecordSchema.parse({ version: 1, status: 'native', reason: 'reviewed-first-task', adapter: null,
    source: { opening: reference, digest }, fields: [] });
}

export function reviewedFirstTaskSource(content: StoryContentSnapshot, sources: StorySources) {
  if (reviewedSourceFingerprint(content, sources, 5, { maxCardLength: 80_000,
    disabledEntryDigests: ['a803b15178c93d87d15e30ee070820241fb468b6ac337b9ef8bd97e743ed40da'] }) !== 'd916882245c0a162282a4c32df532a4b61fd8a397a0b69b00f7de0201795e419') return null;
  const book = sources.books.find(item => item.characterId === content.characters[0].id && item.scope === 'character')!;
  const entryIndex = book.entries.findIndex(entry => createHash('sha256').update(entry.content).digest('hex') === firstTaskSourceDigest);
  if (entryIndex < 0) return null;
  return { bookId: book.id, entryIndex, digest: firstTaskSourceDigest };
}
