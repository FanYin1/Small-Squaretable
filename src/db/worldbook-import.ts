import type { Database } from './index';
import { worldbooks, worldbookEntries } from './schema/worldbooks';
import { prepareStandaloneWorldbook } from '../types/worldbook-import';

export async function importStandaloneWorldbook(database: Database, owner: { userId: string; tenantId: string }, input: unknown) {
  const prepared = prepareStandaloneWorldbook(input);
  return database.transaction(async transaction => {
    const [book] = await transaction.insert(worldbooks).values({
      name: prepared.name, description: prepared.description,
      userId: owner.userId, tenantId: owner.tenantId, scope: 'global',
    }).returning();
    for (const entry of prepared.entries) {
      await transaction.insert(worldbookEntries).values({ ...entry, worldbookId: book.id });
    }
    return { worldBookId: book.id, name: book.name, imported: prepared.entries.length };
  });
}
