import { z } from 'zod';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from './character-worldbook';

const object = z.record(z.unknown());
const fileSchema = z.object({
  name: z.string().max(255).optional(),
  description: z.string().optional(),
  originalData: z.object({ name: z.string().max(255).optional(), description: z.string().optional() }).optional(),
  entries: z.union([z.array(object), z.record(object)]),
}).passthrough();

export function isStandaloneWorldbook(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return 'entries' in input && !['spec', 'data', 'first_mes', 'char_name'].some(field => field in input);
}

export function prepareStandaloneWorldbook(input: unknown) {
  const source = fileSchema.parse(input);
  const entries = Object.keys(source.entries).sort((left, right) => Number(left) - Number(right))
    .map(key => (source.entries as Record<string, Record<string, unknown>>)[key]);
  const normalized = characterWorldbookSchema.parse({ entries: entries.map(entry => ({
    ...entry,
    keys: entry.keys ?? entry.key ?? [],
    secondary_keys: entry.secondary_keys ?? entry.keysecondary ?? [],
    insertion_order: entry.insertion_order ?? entry.order ?? 100,
    enabled: entry.enabled ?? (typeof entry.disable === 'boolean' ? !entry.disable : true),
    position: entry.position ?? 'before',
    case_sensitive: entry.case_sensitive ?? entry.caseSensitive,
    match_whole_words: entry.match_whole_words ?? entry.matchWholeWords,
    prevent_recursion: entry.prevent_recursion ?? entry.preventRecursion,
    exclude_recursion: entry.exclude_recursion ?? entry.excludeRecursion,
  })) });
  return {
    name: source.name || source.originalData?.name || 'Imported World Book',
    description: source.description || source.originalData?.description || null,
    entries: normalized.entries.map(mapCharacterWorldbookEntry),
  };
}
