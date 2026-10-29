import { createHash } from 'node:crypto';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { ritualSourceDigest } from '../../types/story-ritual';
import { reviewedSourceFingerprint } from './story-reviewed-source';

export function ritualSourceFingerprint(content: StoryContentSnapshot, sources: StorySources): string | null {
  return reviewedSourceFingerprint(content, sources, 3);
}

export function reviewedRitualSource(content: StoryContentSnapshot, sources: StorySources) {
  if (ritualSourceFingerprint(content, sources) !== '88d1cf8a78492cb789044515306572eb0862c5b308471afb1ad31839259ed00c') return null;
  const book = sources.books.find(item => item.characterId === content.characters[0].id && item.scope === 'character')!;
  const entryIndex = book.entries.findIndex(entry => createHash('sha256').update(entry.content).digest('hex') === ritualSourceDigest);
  if (entryIndex < 0) return null;
  return { bookId: book.id, entryIndex, digest: ritualSourceDigest };
}
