import { z } from 'zod';
import { cardRecord } from './card-fields';

const entryOptions = z.object({
  position: z.union([z.string(), z.number().int()]).optional(),
  depth: z.number().int().optional(),
  probability: z.number().min(0).max(100).optional(),
  sticky: z.number().int().nonnegative().nullish(),
  cooldown: z.number().int().nonnegative().nullish(),
  delay: z.number().int().nonnegative().nullish(),
  case_sensitive: z.boolean().nullish(),
  match_whole_words: z.boolean().nullish(),
  prevent_recursion: z.boolean().optional(),
  exclude_recursion: z.boolean().optional(),
  recursive: z.boolean().optional(),
  role: z.number().int().min(0).max(2).nullable().optional(),
  selectiveLogic: z.union([z.number().int(), z.string()]).optional(),
  selective_logic: z.union([z.number().int(), z.string()]).optional(),
}).passthrough();

export const characterWorldbookSchema = z.object({
  name: z.string().max(255).optional(),
  entries: z.array(entryOptions.extend({
    keys: z.array(z.string()).default([]),
    secondary_keys: z.array(z.string()).default([]),
    content: z.string(),
    comment: z.string().nullable().optional(),
    name: z.string().optional(),
    insertion_order: z.number().int().default(100),
    enabled: z.boolean().default(true),
    constant: z.boolean().default(false),
    selective: z.boolean().optional(),
    extensions: entryOptions.optional(),
  }).passthrough()),
}).passthrough();

export function mapCharacterWorldbookEntry(entry: z.infer<typeof characterWorldbookSchema>['entries'][number]) {
  const options = { ...entry, ...Object.fromEntries(Object.entries(entry.extensions ?? {}).filter(([, value]) => value != null)) };
  const positions: Record<string, string> = {
    '0': 'before', before_char: 'before', before: 'before',
    '1': 'after', after_char: 'after', after: 'after',
    '2': 'ANTop', ANTop: 'ANTop', '3': 'ANBottom', ANBottom: 'ANBottom',
    '4': 'atDepth', atDepth: 'atDepth', '5': 'EMTop', EMTop: 'EMTop', '6': 'EMBottom', EMBottom: 'EMBottom',
  };
  const logics: Record<string, string> = {
    '0': 'AND_ANY', '1': 'AND_ALL', '2': 'NOT_ANY', '3': 'NOT_ALL',
    AND_ANY: 'AND_ANY', AND_ALL: 'AND_ALL', NOT_ANY: 'NOT_ANY', NOT_ALL: 'NOT_ALL',
  };
  return {
    keyword: entry.keys.join(','),
    content: entry.content,
    position: entry.insertion_order,
    isEnabled: entry.enabled,
    priority: options.depth ?? 4,
    preventRecursion: options.prevent_recursion ?? false,
    recursive: options.recursive ?? true,
    settings: {
      keys: entry.keys,
      keysSecondary: entry.selective === false ? [] : entry.secondary_keys,
      selectiveLogic: logics[String(options.selectiveLogic ?? options.selective_logic ?? 0)] ?? 'AND_ANY',
      comment: entry.comment || entry.name || null,
      position: positions[String(options.position)] ?? 'after',
      depth: options.depth ?? 4,
      order: entry.insertion_order,
      constant: entry.constant,
      probability: options.probability ?? 100,
      sticky: options.sticky ?? 0,
      cooldown: options.cooldown ?? 0,
      delay: options.delay ?? 0,
      caseSensitive: options.case_sensitive ?? false,
      matchWholeWords: options.match_whole_words ?? false,
      excludeRecursion: options.exclude_recursion ?? false,
      role: options.role ?? undefined,
      ...(typeof cardRecord(options.squaretable).purpose === 'string' ? { squaretablePurpose: cardRecord(options.squaretable).purpose } : {}),
    },
  };
}
