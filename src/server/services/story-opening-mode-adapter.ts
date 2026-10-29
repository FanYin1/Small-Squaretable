import { createHash } from 'node:crypto';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { openingModeSourceDigest } from '../../types/story-opening-mode';
import { reviewedSourceFingerprint } from './story-reviewed-source';

export function reviewedOpeningModeSource(content: StoryContentSnapshot, sources: StorySources) {
  if (reviewedSourceFingerprint(content, sources, 1) !== 'a3d71e549ed319431df22de6ec41c2063bb22708aea82593e638d853c8d82a28') return null;
  const book = sources.books.find(item => item.characterId === content.characters[0].id && item.scope === 'character')!;
  if (createHash('sha256').update(book.entries[0].content).digest('hex') !== openingModeSourceDigest) return null;
  return { bookId: book.id, entryIndex: 0, digest: openingModeSourceDigest };
}
