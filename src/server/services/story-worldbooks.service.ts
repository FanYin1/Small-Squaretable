import { createHash } from 'node:crypto';
import { and, eq, inArray, asc } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { chats } from '../../db/schema/chats';
import { worldbooks, worldbookEntries } from '../../db/schema/worldbooks';
import { storyWorldbooks } from '../../db/schema/story-worldbooks';
import { AppError } from '../../core/errors';
import { storyWorldbookEntrySchema, storyWorldbooksSnapshotSchema, type StoryWorldbooksSnapshot } from '../../types/story-worldbooks';
import type { DiagnosticBook } from '../../types/story-diagnostics';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function captureStoryWorldbooks(transaction: Transaction, characterIds: string[], diagnosticBooks?: DiagnosticBook[]): Promise<StoryWorldbooksSnapshot> {
  const bindings: StoryWorldbooksSnapshot['bindings'] = characterIds.map(characterId => ({ characterId, books: [] }));
  if (diagnosticBooks) {
    for (const binding of bindings) binding.books = diagnosticBooks
      .filter(book => book.characterId === binding.characterId && book.scope === 'character' && book.isEnabled)
      .map(book => ({ id: book.id, name: book.name, entries: book.entries.map(entry => storyWorldbookEntrySchema.parse(entry))
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)) }));
  } else if (characterIds.length) {
    const rows = await transaction.select({
      characterId: worldbooks.characterId, bookId: worldbooks.id, name: worldbooks.name, entry: worldbookEntries,
    }).from(worldbooks).innerJoin(characters, and(
      eq(characters.id, worldbooks.characterId), eq(characters.creatorId, worldbooks.userId),
      eq(characters.tenantId, worldbooks.tenantId),
    )).leftJoin(worldbookEntries, eq(worldbookEntries.worldbookId, worldbooks.id))
      .where(and(inArray(worldbooks.characterId, characterIds), eq(worldbooks.scope, 'character'), eq(worldbooks.isEnabled, true)))
      .orderBy(asc(worldbooks.createdAt), asc(worldbooks.id), asc(worldbookEntries.position), asc(worldbookEntries.id));
    for (const row of rows) {
      const binding = bindings.find(item => item.characterId === row.characterId)!;
      let book = binding.books.find(item => item.id === row.bookId);
      if (!book) {
        book = { id: row.bookId, name: row.name, entries: [] };
        binding.books.push(book);
      }
      if (row.entry) book.entries.push(storyWorldbookEntrySchema.parse(row.entry));
    }
  }
  return storyWorldbooksSnapshotSchema.parse({ protocol: 1, bindings,
    revision: createHash('sha256').update(JSON.stringify(bindings)).digest('hex'), capturedAt: new Date().toISOString(),
  });
}

export async function loadStoryWorldbookEntries(chatId: string, userId: string, characterId: string, database: Database = db) {
  const [row] = await database.select({ snapshot: storyWorldbooks.snapshot }).from(storyWorldbooks)
    .innerJoin(chats, eq(chats.id, storyWorldbooks.chatId))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.worldbookSnapshotVersion, 1)));
  if (!row) throw new AppError('Saved worldbook bindings are unavailable', 409, 'STORY_WORLDBOOKS_UNAVAILABLE');
  const snapshot = storyWorldbooksSnapshotSchema.parse(row.snapshot);
  const binding = snapshot.bindings.find(item => item.characterId === characterId);
  if (!binding) throw new AppError('This character has no starting worldbook binding', 409, 'STORY_WORLDBOOKS_UNBOUND');
  return binding.books.flatMap(book => book.entries);
}
