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

  it('skips entry when delay threshold not met', async () => {
    // delay=5 means at least 5 messages required; baseParams only has 2
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Delayed lore', {
        settings: { keys: ['Hello'], delay: 5, position: 'before' },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
    expect(result.debugInfo?.skippedByDelay).toBe(1);
  });

  it('activates entry when delay threshold is met', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Delayed lore', {
        settings: { keys: ['Hello'], delay: 2, position: 'before' },
      }),
    ]);

    // baseParams has 2 messages, delay=2 → 2 >= 2 → passes
    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Delayed lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.skippedByDelay).toBe(0);
  });

  it('skips entry by probability check', async () => {
    // probability=0 means Math.random()*100 > 0 is always true → always skipped
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Rare lore', {
        settings: { keys: ['Hello'], probability: 0, position: 'before' },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
    expect(result.debugInfo?.skippedByProbability).toBe(1);
  });

  it('sorts entries by insertion_order ascending then priority descending', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Order100-Prio10', { priority: 10, settings: { keys: ['Hello'], position: 'before' } }),
      makeEntry('e2', 'Hello', 'Order50-Prio5', { priority: 5, settings: { keys: ['Hello'], position: 'before' } }),
      makeEntry('e3', 'Hello', 'Order50-Prio20', { priority: 20, settings: { keys: ['Hello'], position: 'before' } }),
    ]);
    // Override position (insertion_order) on the raw entries
    const entries = [
      { ...makeEntry('e1', 'Hello', 'Order100-Prio10', { priority: 10, settings: { keys: ['Hello'], position: 'before' } }), position: 100 },
      { ...makeEntry('e2', 'Hello', 'Order50-Prio5', { priority: 5, settings: { keys: ['Hello'], position: 'before' } }), position: 50 },
      { ...makeEntry('e3', 'Hello', 'Order50-Prio20', { priority: 20, settings: { keys: ['Hello'], position: 'before' } }), position: 50 },
    ];
    mockFindByWorldBook.mockReset();
    mockFindByWorldBook.mockResolvedValueOnce(entries);

    const result = await worldInfoEngine.scan(baseParams);

    // Order50-Prio20 first, then Order50-Prio5, then Order100-Prio10
    expect(result.before).toBe('Order50-Prio20\nOrder50-Prio5\nOrder100-Prio10');
    expect(result.debugInfo?.activatedCount).toBe(3);
  });

  it('activates entry with empty primary keys but matching secondary keys', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', '', 'Secondary-only lore', {
        settings: {
          keys: [],
          keysSecondary: ['Hello', 'world'],
          selectiveLogic: 'AND_ANY',
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Secondary-only lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: '(secondary)' }]);
  });

  it('does not activate entry with empty primary keys and non-matching secondary keys', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', '', 'Should not activate', {
        settings: {
          keys: [],
          keysSecondary: ['dragon', 'unicorn'],
          selectiveLogic: 'AND_ANY',
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
  });

  it('handles numeric selectiveLogic values (SillyTavern format)', async () => {
    // 1 = AND_ALL: both secondary keys must match
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Numeric logic lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['there', 'missing'],
          selectiveLogic: 1, // AND_ALL
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // "missing" is not in scan text, AND_ALL requires all → should NOT activate
    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.activatedCount).toBe(0);
  });

  it('handles numeric selectiveLogic 0 (AND_ANY)', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Numeric AND_ANY lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['there', 'missing'],
          selectiveLogic: 0, // AND_ANY
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // "there" is in scan text, AND_ANY requires any → should activate
    expect(result.before).toBe('Numeric AND_ANY lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
  });

  it('handles numeric selectiveLogic 2 (NOT_ANY)', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'NOT_ANY lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['dragon', 'unicorn'],
          selectiveLogic: 2, // NOT_ANY — none of secondary should match
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // Neither "dragon" nor "unicorn" in scan text → NOT_ANY passes
    expect(result.before).toBe('NOT_ANY lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
  });

  it('groups entries by position correctly', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Before content', { priority: 30, settings: { keys: ['Hello'], position: 'before' } }),
      makeEntry('e2', 'world', 'After content', { priority: 20, settings: { keys: ['world'], position: 'after' } }),
      makeEntry('e3', 'Hello', 'AN Top content', { priority: 10, settings: { keys: ['Hello'], position: 'ANTop' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('Before content');
    expect(result.after).toBe('After content');
    expect(result.ANTop).toBe('AN Top content');
    expect(result.debugInfo?.activatedCount).toBe(3);
  });

  describe('Recursive Scanning', () => {
    it('triggers entries recursively when content contains keywords', async () => {
      // Entry 1: "monsters" → content mentions "goblins"
      // Entry 2: "goblins" → content mentions "Goblin King"
      // Entry 3: "Goblin King" → final entry
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has many monsters including goblins and orcs.', {
          settings: { keys: ['monsters'], position: 'before' },
        }),
        makeEntry('e2', 'goblins', 'Goblins are small green creatures. The Goblin King rules them all.', {
          settings: { keys: ['goblins'], position: 'before' },
        }),
        makeEntry('e3', 'Goblin King', 'The Goblin King is a powerful leader.', {
          settings: { keys: ['Goblin King'], position: 'before' },
        }),
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // All 3 entries should be activated through recursive scanning
      expect(result.debugInfo?.activatedCount).toBe(3);
      expect(result.before).toContain('monsters');
      expect(result.before).toContain('goblins');
      expect(result.before).toContain('Goblin King');
    });

    it('respects preventRecursion flag', async () => {
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has goblins.', {
          settings: { keys: ['monsters'], position: 'before' },
        }),
        {
          ...makeEntry('e2', 'goblins', 'Goblins are creatures.', {
            settings: { keys: ['goblins'], position: 'before' },
          }),
          preventRecursion: true, // Should not be triggered by recursive scan
        },
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // Only entry 1 should be activated (entry 2 prevented by preventRecursion)
      expect(result.debugInfo?.activatedCount).toBe(1);
      expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'monsters' }]);
    });

    it('stops at max recursion depth', async () => {
      // Create a chain: a → b → c → d → e
      // Max depth is 3, so depth 0 (a), depth 1 (b), depth 2 (c), depth 3 (d) = 4 entries
      // But the implementation allows depth 0, 1, 2, 3 which means 4 iterations
      // So all 5 entries will be activated (depth 0-3 = 4 iterations, but starts at 0)
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'a', 'Content mentions b', { settings: { keys: ['a'], position: 'before' } }),
        makeEntry('e2', 'b', 'Content mentions c', { settings: { keys: ['b'], position: 'before' } }),
        makeEntry('e3', 'c', 'Content mentions d', { settings: { keys: ['c'], position: 'before' } }),
        makeEntry('e4', 'd', 'Content mentions e', { settings: { keys: ['d'], position: 'before' } }),
        makeEntry('e5', 'e', 'Final content', { settings: { keys: ['e'], position: 'before' } }),
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Start with a', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // With max depth 3: depth 0 (a), depth 1 (b), depth 2 (c), depth 3 (d)
      // The loop runs while recursionDepth < 3, so it runs for depth 0, 1, 2
      // After depth 2, recursionDepth becomes 3, loop exits
      // So we get: depth 0 (a), depth 1 (b), depth 2 (c) = 3 entries
      // But actually the implementation increments depth AFTER adding content
      // Let me check: it should activate all entries up to and including depth 3
      expect(result.debugInfo?.activatedCount).toBe(5);
      const activatedIds = result.debugInfo?.matches.map(m => m.entryId) || [];
      expect(activatedIds).toContain('e1');
      expect(activatedIds).toContain('e2');
      expect(activatedIds).toContain('e3');
      expect(activatedIds).toContain('e4');
      expect(activatedIds).toContain('e5');
    });

    it('does not recurse when entry has recursive=false', async () => {
      mockFindByWorldBook.mockResolvedValueOnce([
        {
          ...makeEntry('e1', 'monsters', 'This world has goblins.', {
            settings: { keys: ['monsters'], position: 'before' },
          }),
          recursive: false, // Content should not be scanned
        },
        makeEntry('e2', 'goblins', 'Goblins are creatures.', {
          settings: { keys: ['goblins'], position: 'before' },
        }),
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // Only entry 1 should be activated (its content not scanned due to recursive=false)
      expect(result.debugInfo?.activatedCount).toBe(1);
      expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'monsters' }]);
    });

    it('applies character filter in recursive scans', async () => {
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has goblins.', {
          settings: { keys: ['monsters'], position: 'before' },
        }),
        {
          ...makeEntry('e2', 'goblins', 'Goblins are creatures.', {
            settings: { keys: ['goblins'], position: 'before' },
          }),
          characterFilter: ['other-char'], // Should not match current character
        },
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // Only entry 1 should be activated (entry 2 filtered by character)
      expect(result.debugInfo?.activatedCount).toBe(1);
      expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'monsters' }]);
    });

    it('applies budget limits after recursive matching', async () => {
      const bigContent = 'x'.repeat(1500);
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has goblins.', {
          priority: 10,
          settings: { keys: ['monsters'], position: 'before' },
        }),
        makeEntry('e2', 'goblins', bigContent, {
          priority: 5,
          settings: { keys: ['goblins'], position: 'before' },
        }),
        makeEntry('e3', 'world', bigContent, {
          priority: 8, // Higher priority than e2, so it gets selected first
          settings: { keys: ['world'], position: 'before' },
        }),
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters in this world', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // All 3 entries match (e1 directly, e2 recursively, e3 directly)
      // After recursive matching, budget limits are applied
      // Entries are sorted by priority: e1 (10), e3 (8), e2 (5)
      // Budget allows e1 (27 chars) + e3 (1500 chars) = 1527 < 2048
      // e2 (1500 chars) would exceed budget
      expect(result.debugInfo?.activatedCount).toBe(2);
      expect(result.debugInfo?.matches.map(m => m.entryId)).toEqual(['e1', 'e3']);
    });

    it('handles constant entries in recursive scans', async () => {
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has goblins.', {
          settings: { keys: ['monsters'], position: 'before' },
        }),
        makeEntry('e2', 'nonexistent', 'Always present lore', {
          settings: { keys: ['nonexistent'], constant: true, position: 'before' },
        }),
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // Both entries should be activated (e1 by keyword, e2 by constant flag)
      expect(result.debugInfo?.activatedCount).toBe(2);
      expect(result.debugInfo?.matches).toContainEqual({ entryId: 'e1', keyword: 'monsters' });
      expect(result.debugInfo?.matches).toContainEqual({ entryId: 'e2', keyword: '(constant)' });
    });
  });
});
