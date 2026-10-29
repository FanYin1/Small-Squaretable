import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { characters } from '../../db/schema/characters';
import { worldbooks, worldbookEntries } from '../../db/schema/worldbooks';
import { AppError, NotFoundError } from '../../core/errors';
import { diagnoseWorldbookDependencies, type CharacterWorldbookBindings, changeWorldbookBindingSchema } from '../../types/character-worldbook-bindings';
import type { z } from 'zod';

export class CharacterWorldbookBindingsService {
  constructor(private database: Database = db) {}

  async list(characterId: string, userId: string, tenantId: string): Promise<CharacterWorldbookBindings> {
    const [character] = await this.database.select({ cardData: characters.cardData }).from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.creatorId, userId), eq(characters.tenantId, tenantId)));
    if (!character) throw new NotFoundError('Character');
    const books = await this.database.select({
      id: worldbooks.id, name: worldbooks.name, characterId: worldbooks.characterId,
      scope: worldbooks.scope, isEnabled: worldbooks.isEnabled,
      entryCount: sql<number>`count(${worldbookEntries.id})::int`,
      enabledEntryCount: sql<number>`(count(${worldbookEntries.id}) filter (where ${worldbookEntries.isEnabled} = true))::int`,
    }).from(worldbooks).leftJoin(worldbookEntries, eq(worldbookEntries.worldbookId, worldbooks.id))
      .where(and(eq(worldbooks.userId, userId), eq(worldbooks.tenantId, tenantId)))
      .groupBy(worldbooks.id).orderBy(asc(worldbooks.name), asc(worldbooks.id));
    return { books, dependencies: diagnoseWorldbookDependencies(character.cardData, characterId, books) };
  }

  async change(characterId: string, bookId: string, userId: string, tenantId: string, input: z.infer<typeof changeWorldbookBindingSchema>) {
    return this.database.transaction(async transaction => {
      const [character] = await transaction.select({ id: characters.id }).from(characters)
        .where(and(eq(characters.id, characterId), eq(characters.creatorId, userId), eq(characters.tenantId, tenantId))).for('share');
      if (!character) throw new NotFoundError('Character');
      const [book] = await transaction.select().from(worldbooks)
        .where(and(eq(worldbooks.id, bookId), eq(worldbooks.userId, userId), eq(worldbooks.tenantId, tenantId))).for('update');
      if (!book) throw new NotFoundError('World book');
      if (input.action === 'bind' && !['global', 'character'].includes(book.scope)) {
        throw new AppError('This reference scope cannot be reassigned here', 409, 'WORLDBOOK_BINDING_SCOPE_UNSUPPORTED');
      }
      if (book.characterId !== input.expectedCharacterId || (book.characterId !== null && book.characterId !== characterId)) {
        throw new AppError('World book binding changed; reload before continuing', 409, 'WORLDBOOK_BINDING_CONFLICT');
      }
      if (input.action === 'unbind' && book.characterId !== characterId) {
        throw new AppError('World book is not bound to this character', 409, 'WORLDBOOK_BINDING_CONFLICT');
      }
      const [updated] = await transaction.update(worldbooks).set({
        characterId: input.action === 'bind' ? characterId : null,
        scope: 'character', updatedAt: new Date(),
      }).where(eq(worldbooks.id, bookId)).returning();
      return updated;
    });
  }
}

export const characterWorldbookBindingsService = new CharacterWorldbookBindingsService();
