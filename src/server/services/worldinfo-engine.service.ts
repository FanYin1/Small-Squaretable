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
  atDepth?: Array<{ depth: number; content: string }>;
  debugInfo?: WorldInfoDebugInfo;
}

export interface WorldInfoScanParams {
  chat: Message[];
  characterId: string;
  userId: string;
  chatId: string;
  maxContext: number;
}

const DEFAULT_BUDGET = 2048;
const DEFAULT_MAX_MESSAGES = 10;

type EntrySettings = {
  keys?: string[];
  keysSecondary?: string[];
  selectiveLogic?: string;
  position?: string;
  depth?: number;
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

    // 4. Sort by priority descending (higher priority first)
    allEntries.sort((a, b) => b.priority - a.priority);

    // 5. Match keywords and collect activated entries within budget
    let budgetUsed = 0;
    const activated: Array<{ entry: typeof allEntries[0]; matchedKeyword: string }> = [];

    for (const entry of allEntries) {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const caseSensitive = settings.caseSensitive ?? false;
      const wholeWords = settings.matchWholeWords ?? false;
      const isConstant = settings.constant ?? false;

      // Determine primary keys
      const primaryKeys: string[] = settings.keys && settings.keys.length > 0
        ? settings.keys
        : entry.keyword.split(',').map((k) => k.trim()).filter(Boolean);

      let matched = false;
      let matchedKeyword = '';

      if (isConstant) {
        matched = true;
        matchedKeyword = '(constant)';
      } else {
        // Check primary keys
        for (const key of primaryKeys) {
          if (keywordMatches(scanText, key, caseSensitive, wholeWords)) {
            matchedKeyword = key;
            matched = true;
            break;
          }
        }
        // Check secondary keys if primary matched
        if (matched && settings.keysSecondary && settings.keysSecondary.length > 0) {
          const logic = settings.selectiveLogic ?? 'AND_ANY';
          matched = checkSecondaryKeys(scanText, settings.keysSecondary, logic, caseSensitive, wholeWords);
        }
      }

      if (matched) {
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

        const contentLen = entry.content.length;
        if (budgetUsed + contentLen > budget && !isConstant) continue;
        budgetUsed += contentLen;
        activated.push({ entry, matchedKeyword });
        debugMatches.push({ entryId: entry.id, keyword: matchedKeyword });
      }
    }

    // 6. Group by position
    const result: WorldInfoResult = {};
    const positionMap: Record<string, string[]> = {};

    for (const { entry } of activated) {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const pos = settings.position ?? 'before';

      if (pos === 'atDepth') {
        if (!result.atDepth) result.atDepth = [];
        result.atDepth.push({ depth: settings.depth ?? 0, content: entry.content });
      } else {
        const key = (['before', 'after', 'EMTop', 'EMBottom', 'ANTop', 'ANBottom'].includes(pos))
          ? pos
          : 'before';
        if (!positionMap[key]) positionMap[key] = [];
        positionMap[key].push(entry.content);
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
}

export const worldInfoEngine = new WorldInfoEngine();
