/**
 * World Info Engine Service
 *
 * Scans chat messages against world book entries and returns
 * content to inject at various prompt positions.
 */

import type { Message } from '../../db/schema/chats';
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';
import { logger } from './logger.service';
import { applyMacros, type MacroContext } from './macro.service';

const wiLogger = logger.child({ module: 'worldinfo-engine' });

export interface WorldInfoDebugInfo {
  scannedEntries: number;
  activatedCount: number;
  budgetUsed: number;
  budgetLimit: number;
  scanTimeMs: number;
  matches: Array<{ entryId: string; keyword: string }>;
  skippedByProbability: number;
  skippedByDelay: number;
}

export interface WorldInfoResult {
  before?: string;
  after?: string;
  EMTop?: string;
  EMBottom?: string;
  ANTop?: string;
  ANBottom?: string;
  atDepth?: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }>;
  debugInfo?: WorldInfoDebugInfo;
}

export interface WorldInfoScanParams {
  chat: Message[];
  characterId: string;
  userId: string;
  chatId: string;
  maxContext: number;
  macroCtx?: MacroContext;
}

const DEFAULT_BUDGET = 2048;
const DEFAULT_MAX_MESSAGES = 10;

type EntrySettings = {
  keys?: string[];
  keysSecondary?: string[];
  selectiveLogic?: string | number;
  position?: string;
  depth?: number;
  /** 0=system, 1=user, 2=assistant (SillyTavern convention) */
  role?: number;
  constant?: boolean;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  probability?: number;
  delay?: number;
  sticky?: number;
  cooldown?: number;
};

function keywordMatches(text: string, keyword: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  if (!keyword || keyword.trim() === '') return false;
  const k = keyword.trim();
  if (!caseSensitive) {
    if (wholeWords) {
      const re = new RegExp(`\\b${escapeRegex(k)}\\b`, 'i');
      return re.test(text);
    }
    return text.toLowerCase().includes(k.toLowerCase());
  }
  if (wholeWords) {
    const re = new RegExp(`\\b${escapeRegex(k)}\\b`);
    return re.test(text);
  }
  return text.includes(k);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NUMERIC_SELECTIVE_LOGIC: Record<number, string> = {
  0: 'AND_ANY',
  1: 'AND_ALL',
  2: 'NOT_ANY',
  3: 'NOT_ALL',
};

function normalizeSelectiveLogic(value: unknown): string {
  if (typeof value === 'number' && value in NUMERIC_SELECTIVE_LOGIC) {
    return NUMERIC_SELECTIVE_LOGIC[value];
  }
  if (typeof value === 'string' && ['AND_ANY', 'AND_ALL', 'NOT_ANY', 'NOT_ALL'].includes(value)) {
    return value;
  }
  return 'AND_ANY';
}

function checkSecondaryKeys(
  text: string,
  secondaryKeys: string[],
  logic: string,
  caseSensitive: boolean,
  wholeWords: boolean,
): boolean {
  if (!secondaryKeys || secondaryKeys.length === 0) return true;
  const matches = secondaryKeys.map((k) => keywordMatches(text, k, caseSensitive, wholeWords));
  switch (logic) {
    case 'AND_ANY':
      return matches.some(Boolean);
    case 'AND_ALL':
      return matches.every(Boolean);
    case 'NOT_ANY':
      return !matches.some(Boolean);
    case 'NOT_ALL':
      return !matches.every(Boolean);
    default:
      return true;
  }
}

function evaluateSelectiveLogic(
  logic: string,
  primaryMatched: boolean,
  secondaryMatched: boolean
): boolean {
  switch (logic) {
    case 'AND_ANY':
      return primaryMatched || secondaryMatched;
    case 'AND_ALL':
      return primaryMatched && secondaryMatched;
    case 'NOT_ANY':
      return !(primaryMatched || secondaryMatched);
    case 'NOT_ALL':
      return !(primaryMatched && secondaryMatched);
    default:
      return primaryMatched;
  }
}

class WorldInfoEngine {
  async scan(params: WorldInfoScanParams): Promise<WorldInfoResult> {
    const startTime = Date.now();
    const { chat, characterId, userId, maxContext } = params;
    const budget = DEFAULT_BUDGET;
    const debugMatches: Array<{ entryId: string; keyword: string }> = [];
    let skippedByProbability = 0;
    let skippedByDelay = 0;

    // 1. Build scan text from last N messages
    const msgLimit = maxContext || DEFAULT_MAX_MESSAGES;
    const recentMessages = chat.slice(-msgLimit);
    const scanText = recentMessages.map((m) => m.content).join('\n');

    // 2. Fetch world books: character-scoped + global for user
    const [charBooks, userBooks] = await Promise.all([
      worldBookRepository.findByCharacter(characterId),
      worldBookRepository.findByUser(userId),
    ]);
    const globalBooks = userBooks.filter((b) => b.scope === 'global');
    const allBooks = [...charBooks, ...globalBooks];
    const enabledBooks = allBooks.filter((b) => b.isEnabled);

    // 3. Fetch all entries from enabled books
    const entryArrays = await Promise.all(
      enabledBooks.map((book) => worldBookEntryRepository.findByWorldBook(book.id)),
    );
    const allEntries = entryArrays.flat().filter((e) => e.isEnabled);

    // 4. Sort by insertion_order (position) ascending, then priority descending
    allEntries.sort((a, b) => {
      const orderA = a.position ?? 0;
      const orderB = b.position ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return b.priority - a.priority;
    });

    // 5. Match keywords with recursive scanning
    const activatedWithDepth = this.scanRecursive(
      scanText,
      allEntries,
      characterId,
      recentMessages,
      3 // max depth
    );

    // 6. Apply budget limits and timing controls
    let budgetUsed = 0;
    const activated: Array<{ entry: typeof allEntries[0]; matchedKeyword: string }> = [];

    for (const { entry, matchedKeyword, depth } of activatedWithDepth) {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const isConstant = settings.constant ?? false;

      // Timing controls: probability and delay
      const probability = settings.probability ?? 100;
      if (probability < 100 && Math.random() * 100 > probability) {
        skippedByProbability++;
        continue;
      }

      const delay = settings.delay ?? 0;
      if (delay > 0 && recentMessages.length < delay) {
        skippedByDelay++;
        continue;
      }

      // Budget check
      const contentLen = entry.content.length;
      if (budgetUsed + contentLen > budget && !isConstant) continue;
      budgetUsed += contentLen;
      activated.push({ entry, matchedKeyword });
      debugMatches.push({ entryId: entry.id, keyword: matchedKeyword });
    }

    // 6. Group by position
    const result: WorldInfoResult = {};
    const positionMap: Record<string, string[]> = {};

    for (const { entry } of activated) {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const pos = settings.position ?? 'before';
      const content = params.macroCtx ? applyMacros(entry.content, params.macroCtx) : entry.content;

      if (pos === 'atDepth') {
        if (!result.atDepth) result.atDepth = [];
        const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' } as const;
        const role = roleMap[settings.role as 0 | 1 | 2] ?? 'system';
        result.atDepth.push({ depth: settings.depth ?? 0, content, role });
      } else {
        const key = (['before', 'after', 'EMTop', 'EMBottom', 'ANTop', 'ANBottom'].includes(pos))
          ? pos
          : 'before';
        if (!positionMap[key]) positionMap[key] = [];
        positionMap[key].push(content);
      }
    }

    for (const [key, contents] of Object.entries(positionMap)) {
      (result as Record<string, unknown>)[key] = contents.join('\n');
    }

    // 7. Debug info
    const scanTimeMs = Date.now() - startTime;
    result.debugInfo = {
      scannedEntries: allEntries.length,
      activatedCount: activated.length,
      budgetUsed,
      budgetLimit: budget,
      scanTimeMs,
      matches: debugMatches,
      skippedByProbability,
      skippedByDelay,
    };

    wiLogger.info('world info scan complete', {
      characterId,
      scanned: allEntries.length,
      activated: activated.length,
      budgetUsed,
      scanTimeMs,
    });

    return result;
  }

  /**
   * Perform recursive scanning on entries
   * When an entry is triggered, its content is also scanned for keywords
   *
   * @param initialScanText - Initial text to scan (chat messages)
   * @param allEntries - All available entries
   * @param characterId - Current character ID for filtering
   * @param recentMessages - Recent messages for scan depth limiting
   * @param maxDepth - Maximum recursion depth (default: 3)
   * @returns Array of activated entries with matched keywords and depth
   */
  private scanRecursive(
    initialScanText: string,
    allEntries: any[],
    characterId: string,
    recentMessages: any[],
    maxDepth: number = 3
  ): Array<{ entry: any; matchedKeyword: string; depth: number }> {
    const activated = new Map<string, { entry: any; matchedKeyword: string; depth: number }>();
    let currentScanText = initialScanText;
    let recursionDepth = 0;

    while (recursionDepth < maxDepth) {
      const newlyActivated: Array<{ entry: any; matchedKeyword: string }> = [];

      for (const entry of allEntries) {
        // Skip if already activated
        if (activated.has(entry.id)) continue;

        // Skip if preventRecursion is true and we're in recursive scan
        const preventRecursion = (entry as any).preventRecursion ?? false;
        if (preventRecursion && recursionDepth > 0) continue;

        const settings = (entry.settings ?? {}) as EntrySettings;
        const caseSensitive = settings.caseSensitive ?? false;
        const wholeWords = settings.matchWholeWords ?? false;
        const isConstant = settings.constant ?? false;

        // Check character filter
        const characterFilter = (entry as any).characterFilter as string[] | undefined;
        if (characterFilter && characterFilter.length > 0) {
          if (!characterFilter.includes(characterId)) {
            continue;
          }
        }

        // Check scan depth limit
        const scanDepth = (entry as any).scanDepth as number | undefined;
        let scanTextForEntry = currentScanText;
        if (scanDepth && scanDepth > 0 && recursionDepth === 0) {
          // Only apply scan depth limit on first iteration
          const limitedMessages = recentMessages.slice(-scanDepth);
          scanTextForEntry = limitedMessages.map((m: any) => m.content).join('\n');
        }

        // Determine primary keys
        const primaryKeys: string[] = settings.keys && settings.keys.length > 0
          ? settings.keys
          : entry.keyword.split(',').map((k: string) => k.trim()).filter(Boolean);

        let matched = false;
        let matchedKeyword = '';

        if (isConstant && recursionDepth === 0) {
          // Constants only match on first iteration
          matched = true;
          matchedKeyword = '(constant)';
        } else {
          const hasSecondaryKeys = settings.keysSecondary && settings.keysSecondary.length > 0;
          const logic = normalizeSelectiveLogic(settings.selectiveLogic);

          if (primaryKeys.length === 0 && hasSecondaryKeys) {
            matched = checkSecondaryKeys(scanTextForEntry, settings.keysSecondary!, logic, caseSensitive, wholeWords);
            if (matched) matchedKeyword = '(secondary)';
          } else {
            // Check primary keys
            for (const key of primaryKeys) {
              if (keywordMatches(scanTextForEntry, key, caseSensitive, wholeWords)) {
                matchedKeyword = key;
                matched = true;
                break;
              }
            }
            // Check secondary keys if primary matched
            if (matched && hasSecondaryKeys) {
              const secondaryMatched = checkSecondaryKeys(scanTextForEntry, settings.keysSecondary!, logic, caseSensitive, wholeWords);
              if (!secondaryMatched) {
                matched = false;
                matchedKeyword = '';
              }
            }
          }
        }

        if (matched) {
          newlyActivated.push({ entry, matchedKeyword });
          activated.set(entry.id, { entry, matchedKeyword, depth: recursionDepth });
        }
      }

      // If no new entries activated, stop recursion
      if (newlyActivated.length === 0) break;

      // Add content of recursive entries to scan text for next iteration
      const recursiveEntries = newlyActivated.filter(({ entry }) => {
        const recursive = (entry as any).recursive ?? true;
        return recursive;
      });

      if (recursiveEntries.length > 0) {
        const additionalText = recursiveEntries.map(({ entry }) => entry.content).join('\n');
        currentScanText += '\n' + additionalText;
      } else {
        // No recursive entries, stop
        break;
      }

      recursionDepth++;
    }

    return Array.from(activated.values());
  }

  /**
   * Scan text against entries for testing purposes
   * Returns matched entries with their matched keys and recursion depth
   */
  scanText(
    text: string,
    entries: Array<{
      id: string;
      keys: string[];
      secondaryKeys?: string[];
      content: string;
      comment?: string;
      depth: number;
      constant: boolean;
      selectiveLogic?: string;
      recursive?: boolean;
      preventRecursion?: boolean;
    }>
  ): Array<{
    entry: typeof entries[0];
    matchedKeys: string[];
    recursionDepth: number;
  }> {
    // Convert entries to the format expected by scanRecursive
    const formattedEntries = entries.map(e => ({
      id: e.id,
      keyword: e.keys.join(','),
      content: e.content,
      position: 0,
      isEnabled: true,
      priority: 0,
      recursive: e.recursive ?? true,
      preventRecursion: e.preventRecursion ?? false,
      settings: {
        keys: e.keys,
        keysSecondary: e.secondaryKeys,
        selectiveLogic: e.selectiveLogic,
        constant: e.constant,
        caseSensitive: false,
        matchWholeWords: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Use recursive scanning
    const activatedWithDepth = this.scanRecursive(
      text,
      formattedEntries,
      '', // No character filter in test mode
      [], // No message history in test mode
      3 // max depth
    );

    // Build result with matched keys and recursion depth
    const matches: Array<{ entry: typeof entries[0]; matchedKeys: string[]; recursionDepth: number }> = [];

    for (const { entry: formattedEntry, matchedKeyword, depth } of activatedWithDepth) {
      // Find original entry
      const originalEntry = entries.find(e => e.id === formattedEntry.id);
      if (!originalEntry) continue;

      // Determine matched keys
      const matchedKeys: string[] = [];
      if (matchedKeyword === '(constant)') {
        matchedKeys.push('(constant)');
      } else if (matchedKeyword === '(secondary)') {
        matchedKeys.push('(secondary)');
      } else {
        matchedKeys.push(matchedKeyword);
      }

      matches.push({
        entry: originalEntry,
        matchedKeys,
        recursionDepth: depth,
      });
    }

    return matches;
  }
}

export const worldInfoEngine = new WorldInfoEngine();
