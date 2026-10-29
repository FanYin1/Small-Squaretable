import { cardRecord } from './card-fields';

export const worldbookPositions = ['before', 'after', 'ANTop', 'ANBottom', 'atDepth', 'EMTop', 'EMBottom'] as const;
export const worldbookLogics = ['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL'] as const;

export function exportWorldbookEntry(entry: {
  keyword: string; content: string; position: number; isEnabled: boolean; settings: unknown;
  recursive?: boolean; preventRecursion?: boolean;
}) {
  const settings = cardRecord(entry.settings);
  const position = typeof settings.position === 'string' ? worldbookPositions.indexOf(settings.position as typeof worldbookPositions[number]) : -1;
  const logic = typeof settings.selectiveLogic === 'string' ? worldbookLogics.indexOf(settings.selectiveLogic as typeof worldbookLogics[number]) : settings.selectiveLogic;
  return {
    keys: Array.isArray(settings.keys) ? settings.keys : entry.keyword.split(',').map(key => key.trim()).filter(Boolean),
    secondary_keys: Array.isArray(settings.keysSecondary) ? settings.keysSecondary : [],
    selectiveLogic: typeof logic === 'number' && logic >= 0 && logic <= 3 ? logic : 0,
    content: entry.content,
    comment: typeof settings.comment === 'string' ? settings.comment : '',
    position: position < 0 ? 0 : position,
    depth: typeof settings.depth === 'number' ? settings.depth : 4,
    insertion_order: entry.position,
    enabled: entry.isEnabled,
    constant: settings.constant === true,
    probability: typeof settings.probability === 'number' ? settings.probability : 100,
    sticky: typeof settings.sticky === 'number' ? settings.sticky : 0,
    cooldown: typeof settings.cooldown === 'number' ? settings.cooldown : 0,
    delay: typeof settings.delay === 'number' ? settings.delay : 0,
    case_sensitive: settings.caseSensitive === true,
    match_whole_words: settings.matchWholeWords === true,
    prevent_recursion: entry.preventRecursion ?? false,
    exclude_recursion: settings.excludeRecursion === true,
    recursive: entry.recursive ?? true,
    extensions: {
      ...(typeof settings.role === 'number' ? { role: settings.role } : {}),
      ...(typeof settings.squaretablePurpose === 'string' ? { squaretable: { purpose: settings.squaretablePurpose } } : {}),
    },
  };
}
