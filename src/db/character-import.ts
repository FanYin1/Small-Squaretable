import type { Database } from './index';
import { characters, type NewCharacter } from './schema/characters';
import { worldbooks, worldbookEntries } from './schema/worldbooks';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../types/character-worldbook';
import { BadRequestError } from '../core/errors';
import { enqueuePresentation } from './presentation-queue';

export async function createCharacterWithWorldbook(database: Database, data: NewCharacter) {
    const embedded = (data.cardData as Record<string, unknown> | null)?.character_book;
    if (embedded == null) {
      return database.transaction(async transaction => {
        const [character] = await transaction.insert(characters).values(data).returning();
        await enqueuePresentation(transaction, character);
        return character;
      });
    }
    const parsed = characterWorldbookSchema.safeParse(embedded);
    if (!parsed.success) throw new BadRequestError('Invalid embedded world book');
    if (!data.creatorId) throw new BadRequestError('Embedded world books require a character owner');
    const ownerId = data.creatorId;
    return database.transaction(async transaction => {
      const [character] = await transaction.insert(characters).values(data).returning();
      const [book] = await transaction.insert(worldbooks).values({
        name: parsed.data.name || `${character.name}'s Lorebook`.slice(0, 255),
        tenantId: character.tenantId,
        userId: ownerId,
        characterId: character.id,
        scope: 'character',
      }).returning();
      for (const entry of parsed.data.entries) {
        await transaction.insert(worldbookEntries).values({
          worldbookId: book.id,
          ...mapCharacterWorldbookEntry(entry),
        });
      }
      await enqueuePresentation(transaction, character);
      return character;
    });
}
