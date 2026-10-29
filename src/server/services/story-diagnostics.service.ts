import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { worldbooks, worldbookEntries } from '../../db/schema/worldbooks';
import { inspectStoryDiagnostics, type DiagnosticBook } from '../../types/story-diagnostics';

type Reader = Pick<Database, 'select'>;

const characterSourceFields = {
  id: characters.id, name: characters.name, description: characters.description, avatarUrl: characters.avatarUrl,
  promptTemplate: characters.promptTemplate, cardData: characters.cardData, creatorId: characters.creatorId,
  isPublic: characters.isPublic, moderationStatus: characters.moderationStatus, tenantId: characters.tenantId,
};

export async function collectStorySources(database: Reader, characterIds: string[]) {
  const firstRow = sql`row_number() over (partition by ${characters.id} order by ${worldbooks.createdAt}, ${worldbooks.id}, ${worldbookEntries.position}, ${worldbookEntries.id}) = 1`;
  const rows = characterIds.length ? await database.select({
    character: {
      ...characterSourceFields,
      cardData: sql<(typeof characters.$inferSelect)['cardData']>`case when ${firstRow} then ${characters.cardData} else null end`,
      avatarUrl: sql<string | null>`case when ${firstRow} then ${characters.avatarUrl} else null end`,
      description: sql<string | null>`case when ${firstRow} then ${characters.description} else null end`,
      promptTemplate: sql<string | null>`case when ${firstRow} then ${characters.promptTemplate} else null end`,
    },
    book: { id: worldbooks.id, name: worldbooks.name, characterId: worldbooks.characterId, scope: worldbooks.scope, isEnabled: worldbooks.isEnabled },
    entry: worldbookEntries,
  }).from(characters).leftJoin(worldbooks, and(
    eq(worldbooks.characterId, characters.id), eq(worldbooks.userId, characters.creatorId),
    eq(worldbooks.tenantId, characters.tenantId), eq(worldbooks.scope, 'character'),
  )).leftJoin(worldbookEntries, eq(worldbookEntries.worldbookId, worldbooks.id))
    .where(inArray(characters.id, characterIds))
    .orderBy(asc(worldbooks.createdAt), asc(worldbooks.id), asc(worldbookEntries.position), asc(worldbookEntries.id)) : [];
  const captured = new Map<string, (typeof rows)[number]['character']>();
  for (const row of rows) if (!captured.has(row.character.id)) captured.set(row.character.id, row.character);
  return {
    characters: [...captured.values()],
    books: groupDiagnosticBooks(rows),
  };
}

export type StorySources = Awaited<ReturnType<typeof collectStorySources>>;

export async function collectStoryDiagnosticBooks(database: Reader, characterIds: string[]) {
  const rows = characterIds.length ? await database.select({
    book: { id: worldbooks.id, name: worldbooks.name, characterId: worldbooks.characterId, scope: worldbooks.scope, isEnabled: worldbooks.isEnabled },
    entry: worldbookEntries,
  })
    .from(worldbooks).innerJoin(characters, and(eq(characters.id, worldbooks.characterId),
      eq(characters.creatorId, worldbooks.userId), eq(characters.tenantId, worldbooks.tenantId)))
    .leftJoin(worldbookEntries, eq(worldbookEntries.worldbookId, worldbooks.id))
    .where(and(inArray(worldbooks.characterId, characterIds), eq(worldbooks.scope, 'character')))
    .orderBy(asc(worldbooks.createdAt), asc(worldbooks.id), asc(worldbookEntries.position), asc(worldbookEntries.id)) : [];
  return groupDiagnosticBooks(rows);
}

function groupDiagnosticBooks(rows: Array<{
  book: Pick<DiagnosticBook, 'id' | 'name' | 'characterId' | 'scope' | 'isEnabled'> | null;
  entry: typeof worldbookEntries.$inferSelect | null;
}>) {
  const grouped = new Map<string, DiagnosticBook>();
  for (const { book, entry } of rows) {
    if (!book) continue;
    let result = grouped.get(book.id);
    if (!result) {
      result = { id: book.id, name: book.name, characterId: book.characterId, scope: book.scope,
        isEnabled: book.isEnabled, entryCount: 0, enabledEntryCount: 0, entries: [] };
      grouped.set(book.id, result);
    }
    if (entry) {
      result.entries.push(entry);
      result.entryCount++;
      if (entry.isEnabled) result.enabledEntryCount++;
    }
  }
  return [...grouped.values()];
}

export async function collectStoryDiagnostics(database: Reader, cards: Array<{ id: string; cardData: Record<string, unknown> }>) {
  const books = await collectStoryDiagnosticBooks(database, cards.map(card => card.id));
  return cards.map(card => inspectStoryDiagnostics(card.cardData, card.id, books, cards.length > 1));
}
