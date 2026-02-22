/**
 * WorldInfoEngine unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockFindByCharacter, mockFindByUser, mockFindByWorldBook } = vi.hoisted(() => {
  const mockFindByCharacter = vi.fn().mockResolvedValue([]);
  const mockFindByUser = vi.fn().mockResolvedValue([]);
  const mockFindByWorldBook = vi.fn().mockResolvedValue([]);
  return { mockFindByCharacter, mockFindByUser, mockFindByWorldBook };
});

vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: {
    findByCharacter: mockFindByCharacter,
    findByUser: mockFindByUser,
  },
}));

vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: {
    findByWorldBook: mockFindByWorldBook,
  },
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { worldInfoEngine } from './worldinfo-engine.service';
import type { WorldInfoScanParams } from './worldinfo-engine.service';

// ── Helpers ──
const makeBook = (id: string, scope: string = 'character', isEnabled = true) => ({
  id,
  tenantId: 'tenant-1',
  userId: 'user-1',
  characterId: 'char-1',
  name: `Book ${id}`,
  description: null,
  scope,
  isEnabled,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeEntry = (
  id: string,
  keyword: string,
  content: string,
  opts: {
    isEnabled?: boolean;
    priority?: number;
    settings?: Record<string, unknown>;
  } = {},
) => ({
  id,
  worldbookId: 'book-1',
  keyword,
  content,
  position: 0,
  isEnabled: opts.isEnabled ?? true,
  priority: opts.priority ?? 0,
  settings: opts.settings ?? {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const baseParams: WorldInfoScanParams = {
  chat: [
    { id: 1, chatId: 'chat-1', role: 'user', content: 'Hello world', attachments: null, extra: null, characterId: null, sentAt: new Date() },
    { id: 2, chatId: 'chat-1', role: 'assistant', content: 'Hi there', attachments: null, extra: null, characterId: null, sentAt: new Date() },
  ] as any,
  characterId: 'char-1',
  userId: 'user-1',
  chatId: 'chat-1',
  maxContext: 10,
};

describe('WorldInfoEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByCharacter.mockResolvedValue([makeBook('book-1')]);
    mockFindByUser.mockResolvedValue([]);
  });

  it('activates entry when keyword found in messages', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'world', 'Lore about the world', { settings: { keys: ['world'], position: 'before' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Lore about the world');
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'world' }]);
  });

  it('does not activate disabled entries', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'world', 'Lore about the world', { isEnabled: false, settings: { keys: ['world'] } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
  });

  it('respects selective logic AND_ANY', async () => {
    // Primary key "Hello" matches, secondary "there" also matches → activated
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Greeting lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['there', 'missing'],
          selectiveLogic: 'AND_ANY',
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Greeting lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
  });

  it('respects selective logic NOT_ALL', async () => {
    // Primary "Hello" matches. Secondary: "there" matches but "xyz" does not.
    // NOT_ALL = not all secondary keys match → true (because "xyz" doesn't match)
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Conditional lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['there', 'xyz'],
          selectiveLogic: 'NOT_ALL',
          position: 'after',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.after).toBe('Conditional lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
  });

  it('respects token budget limit', async () => {
    // Budget is 2048 chars. Create entries that exceed it.
    const bigContent = 'x'.repeat(1500);
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', bigContent, { priority: 10, settings: { keys: ['Hello'], position: 'before' } }),
      makeEntry('e2', 'world', bigContent, { priority: 5, settings: { keys: ['world'], position: 'before' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // Only the first entry (higher priority) should fit within 2048 budget
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'Hello' }]);
    expect(result.debugInfo?.budgetUsed).toBe(1500);
  });

  it('returns empty result when no entries match', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'dragon', 'Dragon lore', { settings: { keys: ['dragon'] } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
    expect(result.debugInfo?.scannedEntries).toBe(1);
  });

  it('always activates constant entries', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'nonexistent', 'Always present lore', {
        settings: { keys: ['nonexistent'], constant: true, position: 'before' },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Always present lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: '(constant)' }]);
  });
});
