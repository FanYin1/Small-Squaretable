/**
 * World Info Engine Service (stub)
 *
 * Scans chat messages against world book entries and returns
 * content to inject at various prompt positions.
 */

import type { Message } from '../../db/schema/chats';

export interface WorldInfoDebugInfo {
  scannedEntries: number;
  activatedCount: number;
  budgetUsed: number;
  budgetLimit: number;
  scanTimeMs: number;
  matches: Array<{ entryId: string; keyword: string }>;
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

class WorldInfoEngine {
  async scan(_params: WorldInfoScanParams): Promise<WorldInfoResult> {
    return {};
  }
}

export const worldInfoEngine = new WorldInfoEngine();
