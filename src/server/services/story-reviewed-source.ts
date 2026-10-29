import { createHash } from 'node:crypto';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function reviewedSourceFingerprint(content: StoryContentSnapshot, sources: StorySources, entryCount: number,
  options: { maxCardLength?: number; disabledEntryDigests?: string[] } = {}): string | null {
  if (content.characters.length !== 1) return null;
  const character = content.characters[0];
  const card = Object.fromEntries(Object.entries(character.cardData).filter(([key]) => key !== '_squaretableImport'));
  if (JSON.stringify(card).length > (options.maxCardLength ?? 32_000) || character.promptTemplate !== null && character.promptTemplate !== 'default') return null;
  const books = sources.books.filter(book => book.characterId === character.id && book.scope === 'character');
  if (books.length !== 1 || !books[0].isEnabled || books[0].entries.length !== entryCount
    || books[0].entries.some(entry => entry.isEnabled === Boolean(options.disabledEntryDigests?.includes(
      createHash('sha256').update(entry.content).digest('hex'))))) return null;
  const entries = books[0].entries.map(entry => {
    const fields = entry as Record<string, unknown>;
    return { content: entry.content, isEnabled: entry.isEnabled, settings: entry.settings,
      keyword: fields.keyword, position: fields.position, priority: fields.priority,
      characterFilter: fields.characterFilter ?? [], scanDepth: fields.scanDepth ?? null,
      contextPercentage: fields.contextPercentage ?? null, recursive: fields.recursive,
      preventRecursion: fields.preventRecursion };
  }).sort((left, right) => left.content.localeCompare(right.content, 'en'));
  return createHash('sha256').update(JSON.stringify(canonical({ card, name: character.name,
    description: character.description, bookName: books[0].name, entries }))).digest('hex');
}
