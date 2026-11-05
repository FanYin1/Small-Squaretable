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
import type { StoryWorldbookEntry } from '../../types/story-worldbooks';
import { estimateContextTokens as countTokens } from './context-budget';
import { AppError } from '../../core/errors';
import { worldInfoScanDefaults } from '../config/worldinfo';
import { legacyWorldInfoEngine } from './worldinfo-legacy.service';

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
  decisions: Array<{ entryId: string; status: 'injected' | 'excluded'; reason: string; keyword?: string; recursionDepth?: number; tokens?: number; unsupported?: string[] }>;
  scanMessageCount: number;
  maxRecursionDepth: number;
  budgetUnit: 'estimated_tokens' | 'characters';
  scanEngineVersion: 1 | 2;
  constantBudgetOverflow: boolean;
}

/** 非 atDepth 的 6 个位置，按位置合并后的文本 */
export interface WorldInfoPositionGroups {
  before?: string;
  after?: string;
  EMTop?: string;
  EMBottom?: string;
  ANTop?: string;
  ANBottom?: string;
}

export interface WorldInfoResult extends WorldInfoPositionGroups {
  atDepth?: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }>;
  /**
   * P3-3：同样的内容按「是否跨轮稳定」拆成两份（上面的合并字段不变，legacy 布局只读它们）。
   * stable = constant 且无概率抽样（probability >= 100）：只要世界书没改，每轮内容与顺序都一样，
   * 可以放在历史之前参与前缀缓存。volatile = 其余（关键词触发、概率抽样）：随用户消息变化。
   * atDepth 条目不拆分——它们本来就按 depth 落在历史里。
   */
  stable?: WorldInfoPositionGroups;
  volatile?: WorldInfoPositionGroups;
  debugInfo?: WorldInfoDebugInfo;
}

export interface WorldInfoScanParams {
  chat: Message[];
  characterId: string;
  userId: string;
  chatId: string;
  compatibilityVersion?: 1 | 2;
  legacyMaxContext?: number;
  scanMessageCount?: number;
  maxRecursionDepth?: number;
  tokenBudget?: number;
  random?: () => number;
  macroCtx?: MacroContext;
  entries?: StoryWorldbookEntry[];
}

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
  excludeRecursion?: boolean;
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

function joinPositions(map: Record<string, string[]>): WorldInfoPositionGroups {
  const out: Record<string, string> = {};
  for (const [key, contents] of Object.entries(map)) {
    out[key] = contents.join('\n');
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NUMERIC_SELECTIVE_LOGIC: Record<number, string> = {
  0: 'AND_ANY',
  1: 'NOT_ALL',
  2: 'NOT_ANY',
  3: 'AND_ALL',
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

class WorldInfoEngine {
  async scan(params: WorldInfoScanParams): Promise<WorldInfoResult> {
    if (params.compatibilityVersion === 1) {
      const maxContext = params.legacyMaxContext ?? 4096;
      const legacy = await legacyWorldInfoEngine.scan({ ...params, maxContext });
      return { ...legacy, debugInfo: { ...legacy.debugInfo!, decisions: [], scanMessageCount: maxContext,
        maxRecursionDepth: 3, budgetUnit: 'characters', scanEngineVersion: 1,
        constantBudgetOverflow: (legacy.debugInfo?.budgetUsed ?? 0) > (legacy.debugInfo?.budgetLimit ?? 0),
      } };
    }
    // A frozen story must not depend on later environment changes, even invalid ones.
    const defaults = params.scanMessageCount !== undefined && params.maxRecursionDepth !== undefined && params.tokenBudget !== undefined
      ? { scanMessageCount: params.scanMessageCount, maxRecursionDepth: params.maxRecursionDepth, tokenBudget: params.tokenBudget }
      : worldInfoScanDefaults();
    const startTime = Date.now();
    const { chat, characterId, userId } = params;
    const random = params.random ?? Math.random;
    const scanMessageCount = params.scanMessageCount ?? defaults.scanMessageCount;
    const maxRecursionDepth = params.maxRecursionDepth ?? defaults.maxRecursionDepth;
    const budget = params.tokenBudget ?? defaults.tokenBudget;
    if (![scanMessageCount, maxRecursionDepth, budget].every(value => Number.isSafeInteger(value) && value > 0)
      || scanMessageCount > 1000 || maxRecursionDepth > 10 || budget > 100000) {
      throw new AppError('Invalid world book scan configuration', 400, 'WORLD_INFO_CONFIG_INVALID');
    }
    const debugMatches: Array<{ entryId: string; keyword: string }> = [];
    const decisions = new Map<string, WorldInfoDebugInfo['decisions'][number]>();
    let skippedByProbability = 0;
    let skippedByDelay = 0;

    // 1. Build scan text from last N messages
    const recentMessages = chat.slice(-scanMessageCount);
    const scanText = recentMessages.map((m) => m.content).join('\n');

    let entries = params.entries;
    if (entries === undefined) {
      const [charBooks, userBooks] = await Promise.all([
        worldBookRepository.findByCharacter(characterId), worldBookRepository.findByUser(userId),
      ]);
      const enabledBooks = [...charBooks, ...userBooks.filter(book => book.scope === 'global')]
        .filter(book => book.isEnabled);
      entries = (await Promise.all(enabledBooks.map(book => worldBookEntryRepository.findByWorldBook(book.id))))
        .flat() as StoryWorldbookEntry[];
    }
    const allEntries = entries.filter(entry => entry.isEnabled);
    for (const entry of entries) {
      const unsupported = ['sticky', 'cooldown'].filter(key => Number((entry.settings as EntrySettings | null)?.[key as 'sticky' | 'cooldown'] ?? 0) > 0);
      decisions.set(entry.id, { entryId: entry.id, status: 'excluded', reason: entry.isEnabled ? 'keyword_not_matched' : 'disabled',
        ...(unsupported.length ? { unsupported } : {}) });
    }

    // 4. Sort by insertion_order (position) ascending, then priority descending
    allEntries.sort((a, b) => {
      const orderA = a.position ?? 0;
      const orderB = b.position ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return b.priority - a.priority;
    });

    // Apply probability, delay and budget before permitting recursive activation.
    // A rejected entry must never activate downstream entries.
    let budgetUsed = 0;
    const expanded = new Map<string, string>();
    const accept = (entry: StoryWorldbookEntry, matchedKeyword: string, depth: number): boolean => {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const decision = { ...decisions.get(entry.id)!, keyword: matchedKeyword, recursionDepth: depth };
      const probability = settings.probability ?? 100;
      if (probability <= 0 || (probability < 100 && random() * 100 >= probability)) {
        skippedByProbability++;
        decisions.set(entry.id, { ...decision, reason: 'probability_check_failed' });
        return false;
      }
      const delay = settings.delay ?? 0;
      if (delay > 0 && chat.length < delay) {
        skippedByDelay++;
        decisions.set(entry.id, { ...decision, reason: 'delay_not_reached' });
        return false;
      }
      // Expand on an isolated context: rejected entries must not write variables.
      const macroCtx = params.macroCtx ? { ...params.macroCtx,
        chatVars: { ...params.macroCtx.chatVars }, globalVars: { ...params.macroCtx.globalVars }, varWrites: [],
      } : undefined;
      const content = macroCtx ? applyMacros(entry.content, macroCtx) : entry.content;
      expanded.set(entry.id, content);
      const contentTokens = countTokens(content + '\n');
      // Keep legacy always-on lore; the complete prompt still passes the model's
      // hard capacity check. This is a soft selection budget, not model capacity.
      if (budgetUsed + contentTokens > budget && !settings.constant) {
        decisions.set(entry.id, { ...decision, reason: 'token_budget_exceeded', tokens: contentTokens });
        return false;
      }
      if (macroCtx && params.macroCtx) {
        params.macroCtx.chatVars = macroCtx.chatVars;
        params.macroCtx.globalVars = macroCtx.globalVars;
        params.macroCtx.varWrites?.push(...macroCtx.varWrites);
      }
      budgetUsed += contentTokens;
      debugMatches.push({ entryId: entry.id, keyword: matchedKeyword });
      decisions.set(entry.id, { ...decision, status: 'injected', reason: 'included_in_prompt', tokens: contentTokens });
      return true;
    };
    const activated = this.scanRecursive(scanText, allEntries, characterId, recentMessages,
      maxRecursionDepth, accept, expanded, decisions);

    // 6. Group by position
    const result: WorldInfoResult = {};
    const positionMap: Record<string, string[]> = {};
    const stableMap: Record<string, string[]> = {};
    const volatileMap: Record<string, string[]> = {};

    for (const { entry } of activated) {
      const settings = (entry.settings ?? {}) as EntrySettings;
      const pos = settings.position ?? 'before';
      const content = expanded.get(entry.id)!;

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

        // P3-3：同时记一份按稳定性拆分的副本，不影响上面的合并结果
        const splitMap = (settings.constant ?? false) && (settings.probability ?? 100) >= 100
          ? stableMap
          : volatileMap;
        if (!splitMap[key]) splitMap[key] = [];
        splitMap[key].push(content);
      }
    }

    for (const [key, contents] of Object.entries(positionMap)) {
      (result as Record<string, unknown>)[key] = contents.join('\n');
    }
    result.stable = joinPositions(stableMap);
    result.volatile = joinPositions(volatileMap);

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
      decisions: [...decisions.values()],
      scanMessageCount,
      maxRecursionDepth,
      budgetUnit: 'estimated_tokens',
      scanEngineVersion: 2,
      constantBudgetOverflow: budgetUsed > budget,
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
    allEntries: StoryWorldbookEntry[],
    characterId: string,
    recentMessages: Pick<Message, 'content'>[],
    maxDepth: number,
    accept: (entry: StoryWorldbookEntry, keyword: string, depth: number) => boolean,
    expanded: Map<string, string>,
    decisions: Map<string, WorldInfoDebugInfo['decisions'][number]>,
  ): Array<{ entry: StoryWorldbookEntry; matchedKeyword: string; depth: number }> {
    const activated = new Map<string, { entry: StoryWorldbookEntry; matchedKeyword: string; depth: number }>();
    let recursiveText = '';
    const processed = new Set<string>();
    let recursionDepth = 0;

    while (recursionDepth < maxDepth) {
      const newlyActivated: Array<{ entry: StoryWorldbookEntry; matchedKeyword: string }> = [];

      for (const entry of allEntries) {
        // Skip if already activated
        if (processed.has(entry.id)) continue;

        // Upstream exclude_recursion prevents activation via other lore entries.
        const excludeRecursion = (entry.settings as EntrySettings)?.excludeRecursion ?? false;
        if (excludeRecursion && recursionDepth > 0) {
          decisions.set(entry.id, { ...decisions.get(entry.id)!, reason: 'recursion_disabled' });
          continue;
        }

        const settings = (entry.settings ?? {}) as EntrySettings;
        const caseSensitive = settings.caseSensitive ?? false;
        const wholeWords = settings.matchWholeWords ?? false;
        const isConstant = settings.constant ?? false;

        // Check character filter
        const characterFilter = entry.characterFilter;
        if (characterFilter && characterFilter.length > 0) {
          if (!characterFilter.includes(characterId)) {
            decisions.set(entry.id, { ...decisions.get(entry.id)!, reason: 'character_filter' });
            continue;
          }
        }

        // Check scan depth limit
        const scanDepth = entry.scanDepth;
        const scanTextForEntry = scanDepth === 0 ? '' : (scanDepth && scanDepth > 0
          ? recentMessages.slice(-scanDepth).map(message => message.content).join('\n')
          : initialScanText) + recursiveText;

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
          processed.add(entry.id);
          if (!accept(entry, matchedKeyword, recursionDepth)) continue;
          newlyActivated.push({ entry, matchedKeyword });
          activated.set(entry.id, { entry, matchedKeyword, depth: recursionDepth });
        }
      }

      // If no new entries activated, stop recursion
      if (newlyActivated.length === 0) break;

      // Add content of recursive entries to scan text for next iteration
      const recursiveEntries = newlyActivated.filter(({ entry }) => {
        const recursive = entry.recursive ?? true;
        return recursive && !entry.preventRecursion;
      });

      if (recursiveEntries.length > 0) {
        const additionalText = recursiveEntries.map(({ entry }) => expanded.get(entry.id) ?? entry.content).join('\n');
        recursiveText += '\n' + additionalText;
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
  scanText(text: string, entries: StoryWorldbookEntry[], options: Omit<WorldInfoScanParams, 'chat' | 'entries'> = { characterId: '', userId: '', chatId: '' }): Promise<WorldInfoResult> {
    return this.scan({
      chat: [{ role: 'user', content: text } as Message],
      ...options, entries,
    });
  }
}

export const worldInfoEngine = new WorldInfoEngine();
