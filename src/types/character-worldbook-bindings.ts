import { z } from 'zod';
import { characterFields } from './card-fields';

export const changeWorldbookBindingSchema = z.object({
  action: z.enum(['bind', 'unbind']),
  expectedCharacterId: z.string().uuid().nullable(),
}).strict();

export interface CharacterWorldbookBinding {
  id: string;
  name: string;
  characterId: string | null;
  scope: string;
  isEnabled: boolean;
  entryCount: number;
  enabledEntryCount: number;
}

export interface WorldbookDependency {
  name: string;
  status: 'bound' | 'disabled' | 'empty' | 'unbound' | 'ambiguous';
}

export interface CharacterWorldbookBindings {
  books: CharacterWorldbookBinding[];
  dependencies: WorldbookDependency[];
}

export function diagnoseWorldbookDependencies(cardData: unknown, characterId: string, books: CharacterWorldbookBinding[]): WorldbookDependency[] {
  if (!cardData || typeof cardData !== 'object') return [];
  const fields = characterFields(cardData);
  const extensions = fields.extensions as Record<string, unknown> | undefined;
  const reference = typeof extensions?.world === 'string' ? extensions.world.trim() : '';
  if (!reference) return [];
  const matches = books.filter(book => book.characterId === characterId && book.scope === 'character' && book.name === reference);
  const active = matches.filter(book => book.isEnabled);
  const status = matches.length > 1 ? 'ambiguous' : active.some(book => book.enabledEntryCount > 0) ? 'bound'
    : active.length ? 'empty' : matches.length ? 'disabled' : 'unbound';
  return [{ name: reference, status }];
}
