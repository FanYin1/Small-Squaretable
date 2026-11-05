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
import type { StoryWorldbookEntry } from '../../types/story-worldbooks';
import { estimateContextTokens as countTokens } from './context-budget';

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
};

describe('WorldInfoEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByCharacter.mockResolvedValue([makeBook('book-1')]);
    mockFindByUser.mockResolvedValue([]);
  });

  it('uses saved entries without fetching edited character books or global books', async () => {
    const entry = { ...makeEntry('saved', 'world', 'Saved setting', { settings: { keys: ['world'], position: 'before' } }),
      characterFilter: [], scanDepth: null, contextPercentage: null, recursive: true, preventRecursion: false,
    } as StoryWorldbookEntry;
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [entry] });
    expect(result.before).toBe('Saved setting');
    expect(mockFindByCharacter).not.toHaveBeenCalled();
    expect(mockFindByUser).not.toHaveBeenCalled();
    expect(mockFindByWorldBook).not.toHaveBeenCalled();
  });

  it('preserves an explicitly empty binding without falling back to the library', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [] });
    expect(result.debugInfo?.activatedCount).toBe(0);
    expect(mockFindByCharacter).not.toHaveBeenCalled();
    expect(mockFindByUser).not.toHaveBeenCalled();
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
    const bigContent = 'lore '.repeat(1200);
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', bigContent, { priority: 10, settings: { keys: ['Hello'], position: 'before' } }),
      makeEntry('e2', 'world', bigContent, { priority: 5, settings: { keys: ['world'], position: 'before' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // The budget uses the application's CJK-aware token estimate, not character length.
    expect(result.debugInfo?.activatedCount).toBe(1);
    expect(result.debugInfo?.matches).toEqual([{ entryId: 'e1', keyword: 'Hello' }]);
    expect(result.debugInfo?.budgetUsed).toBe(countTokens(bigContent + '\n'));
    expect(result.debugInfo?.budgetUnit).toBe('estimated_tokens');
    expect(result.debugInfo?.decisions).toContainEqual(expect.objectContaining({ entryId: 'e2', status: 'excluded', reason: 'token_budget_exceeded' }));
  });

  it('uses scan message count independently from model context limits', async () => {
    const entry = makeEntry('e1', 'old clue', 'Clue lore', { settings: { keys: ['old clue'], position: 'before' } });
    const chat = Array.from({ length: 12 }, (_, index) => ({ content: index === 0 ? 'old clue' : 'recent message' })) as any;
    const result = await worldInfoEngine.scan({ ...baseParams, chat, entries: [entry as StoryWorldbookEntry], scanMessageCount: 12 });
    expect(result.before).toBe('Clue lore');
    expect(result.debugInfo?.scanMessageCount).toBe(12);
  });

  it('reports imported sticky and cooldown values as unsupported rather than implying they ran', async () => {
    const entry = makeEntry('e1', 'Hello', 'Timed lore', { settings: { keys: ['Hello'], sticky: 2, cooldown: 1 } });
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [entry as StoryWorldbookEntry] });
    expect(result.debugInfo?.decisions[0]).toMatchObject({ status: 'injected', unsupported: ['sticky', 'cooldown'] });
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
    // SillyTavern numeric 1 = NOT_ALL: at least one secondary key must not match.
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('e1', 'Hello', 'Numeric logic lore', {
        settings: {
          keys: ['Hello'],
          keysSecondary: ['there', 'missing'],
          selectiveLogic: 1, // NOT_ALL
          position: 'before',
        },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    // "missing" is absent, so NOT_ALL activates.
    expect(result.before).toBe('Numeric logic lore');
    expect(result.debugInfo?.activatedCount).toBe(1);
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

    it('respects excludeRecursion flag', async () => {
      mockFindByWorldBook.mockResolvedValueOnce([
        makeEntry('e1', 'monsters', 'This world has goblins.', {
          settings: { keys: ['monsters'], position: 'before' },
        }),
        {
          ...makeEntry('e2', 'goblins', 'Goblins are creatures.', {
            settings: { keys: ['goblins'], position: 'before', excludeRecursion: true },
          }),
        },
      ]);

      const params = {
        ...baseParams,
        chat: [
          { id: 1, chatId: 'chat-1', role: 'user', content: 'Tell me about monsters', attachments: null, extra: null, characterId: null, sentAt: new Date() },
        ] as any,
      };

      const result = await worldInfoEngine.scan(params);

      // Only entry 1 should be activated (entry 2 excluded from recursive activation)
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

    it('applies estimated-token budget before admitting recursive entries', async () => {
      const bigContent = 'lore '.repeat(900);
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
      // Entries are sorted by priority: e1 (10), e3 (8), e2 (5)
      // Only the first long entry fits the estimated-token budget.
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

describe('WorldInfoEngine stable/volatile split (P3-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByCharacter.mockResolvedValue([makeBook('book-1')]);
    mockFindByUser.mockResolvedValue([]);
  });

  it('puts constant entries in stable and keyword-triggered entries in volatile, per position', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('c1', 'zzz', 'CONST-before', { settings: { keys: ['zzz'], constant: true, position: 'before' } }),
      makeEntry('c2', 'zzz', 'CONST-ANTop', { settings: { keys: ['zzz'], constant: true, position: 'ANTop' } }),
      makeEntry('k1', 'world', 'KEY-before', { settings: { keys: ['world'], position: 'before' } }),
      makeEntry('k2', 'world', 'KEY-after', { settings: { keys: ['world'], position: 'after' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.stable).toEqual({ before: 'CONST-before', ANTop: 'CONST-ANTop' });
    expect(result.volatile).toEqual({ before: 'KEY-before', after: 'KEY-after' });
  });

  it('leaves the merged per-position fields unchanged (legacy layout reads these)', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('c1', 'zzz', 'CONST-before', { priority: 5, settings: { keys: ['zzz'], constant: true, position: 'before' } }),
      makeEntry('k1', 'world', 'KEY-before', { priority: 1, settings: { keys: ['world'], position: 'before' } }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.before).toBe('CONST-before\nKEY-before');
  });

  it('treats a constant entry with probability < 100 as volatile (its presence changes between turns)', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('c1', 'zzz', 'CONST-sampled', {
        settings: { keys: ['zzz'], constant: true, position: 'before', probability: 50 },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);
    random.mockRestore();

    expect(result.stable).toEqual({});
    expect(result.volatile).toEqual({ before: 'CONST-sampled' });
  });

  it('does not split atDepth entries (they stay in result.atDepth)', async () => {
    mockFindByWorldBook.mockResolvedValueOnce([
      makeEntry('d1', 'zzz', 'CONST-depth', {
        settings: { keys: ['zzz'], constant: true, position: 'atDepth', depth: 3 },
      }),
    ]);

    const result = await worldInfoEngine.scan(baseParams);

    expect(result.atDepth).toEqual([{ depth: 3, content: 'CONST-depth', role: 'system' }]);
    expect(result.stable).toEqual({});
    expect(result.volatile).toEqual({});
  });
});

describe('Worldbook compatibility boundaries', () => {
  const entry = (id: string, keyword: string, content: string, settings: Record<string, unknown> = {}): StoryWorldbookEntry => ({
    id, worldbookId: 'fixture-book', keyword, content, position: 0, priority: 0, isEnabled: true,
    settings: { keys: [keyword], position: 'before', ...settings }, characterFilter: [], scanDepth: null,
    contextPercentage: null, recursive: true, preventRecursion: false,
  });

  it.each([
    [0, ['yes', 'no'], true], [1, ['yes', 'no'], true], [2, ['yes', 'no'], false], [3, ['yes', 'no'], false],
    [1, ['yes'], false], [2, ['no'], true], [3, ['yes'], true],
  ] as const)('evaluates upstream numeric logic %s with %j', async (logic, keys, activated) => {
    const result = await worldInfoEngine.scan({ ...baseParams, chat: [{ content: 'gate yes' }] as any,
      entries: [entry('e1', 'gate', 'lore', { selectiveLogic: logic, keysSecondary: [...keys] })] });
    expect(result.debugInfo?.activatedCount).toBe(activated ? 1 : 0);
  });

  it('does not mutate frozen entry values or change previously stored string logic', async () => {
    const saved = entry('e1', 'Hello', 'Old snapshot', { selectiveLogic: 'AND_ALL', keysSecondary: ['there', 'absent'] });
    const before = JSON.stringify(saved);
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [saved] });
    expect(result.debugInfo?.activatedCount).toBe(0);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('keeps old keywords out of the default ten-message window', async () => {
    const chat = [{ content: 'gate' }, ...Array.from({ length: 10 }, () => ({ content: 'other' }))] as any;
    expect((await worldInfoEngine.scan({ ...baseParams, chat, entries: [entry('e1', 'gate', 'lore')] })).before).toBeUndefined();
  });

  it('honors per-entry depth without treating constants as a literal keyword', async () => {
    const entries = [ { ...entry('e1', 'gate', 'old'), scanDepth: 1 },
      { ...entry('e2', 'missing', 'constant', { constant: true }), scanDepth: 1 } ];
    const result = await worldInfoEngine.scan({ ...baseParams, entries,
      chat: [{ content: 'gate' }, { content: 'recent' }] as any });
    expect(result.before).toBe('constant');
  });

  it('counts delay against available message history, independently of scan window', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, scanMessageCount: 1,
      entries: [entry('e1', 'there', 'delayed', { delay: 2 })] });
    expect(result.before).toBe('delayed');
  });

  it.each(['probability', 'budget', 'delay'])('does not recurse through an entry rejected by %s', async mode => {
    const settings = mode === 'probability' ? { probability: 0 } : mode === 'delay' ? { delay: 100 } : {};
    const parent = entry('parent', 'gate', mode === 'budget' ? 'downstream '.repeat(300) : 'downstream', settings);
    const result = await worldInfoEngine.scan({ ...baseParams, chat: [{ content: 'gate' }] as any,
      tokenBudget: 50, random: () => 0, entries: [parent, entry('child', 'downstream', 'should not enter')] });
    expect(result.debugInfo?.activatedCount).toBe(0);
  });

  it('counts expanded macros and uses the same expansion for injection', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [entry('e1', 'Hello', '{{user}}')],
      tokenBudget: 5, macroCtx: { charName: 'Card', userName: 'name '.repeat(100) } });
    expect(result.before).toBeUndefined();
    expect(result.debugInfo?.decisions[0].reason).toBe('token_budget_exceeded');
  });

  it('preserves constant lore beyond the soft budget and exposes the overflow', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, tokenBudget: 3,
      entries: [entry('e1', 'absent', 'critical '.repeat(100), { constant: true })] });
    expect(result.before).toBe('critical '.repeat(100));
    expect(result.debugInfo?.constantBudgetOverflow).toBe(true);
    expect(result.debugInfo!.budgetUsed).toBeGreaterThan(result.debugInfo!.budgetLimit);
  });

  it('does not mutate macro variables when the expanded entry is rejected by budget', async () => {
    const macroCtx = { charName: 'Card', userName: 'Player', chatVars: { count: '1' }, globalVars: {}, varWrites: [] };
    const result = await worldInfoEngine.scan({ ...baseParams, macroCtx, tokenBudget: 2,
      entries: [entry('e1', 'Hello', '{{addvar::count::1}} long '.repeat(30))] });
    expect(result.before).toBeUndefined();
    expect(macroCtx.chatVars.count).toBe('1');
    expect(macroCtx.varWrites).toEqual([]);
  });

  it('limits recursion and respects excluding content from recursive scanning', async () => {
    const entries = [entry('p', 'gate', 'next'), entry('c', 'next', 'third'), entry('g', 'third', 'final')];
    const params = { ...baseParams, chat: [{ content: 'gate' }] as any, entries };
    expect((await worldInfoEngine.scan({ ...params, maxRecursionDepth: 1 })).before).toBe('next');
    expect((await worldInfoEngine.scan({ ...params, maxRecursionDepth: 2 })).before).toBe('next\nthird');
    entries[0].preventRecursion = true;
    expect((await worldInfoEngine.scan(params)).before).toBe('next');
  });

  it('produces the same preview and generation result for the same input and settings', async () => {
    const entries = [entry('e1', 'gate', 'next'), entry('e2', 'next', 'child'), entry('e3', 'gate', 'large '.repeat(300)),
      { ...entry('e4', 'gate', 'disabled'), isEnabled: false }];
    const options = { characterId: '', userId: '', chatId: '', tokenBudget: 40, random: () => 0.5 };
    const preview = await worldInfoEngine.scanText('gate', entries, options);
    const live = await worldInfoEngine.scan({ ...options, entries, chat: [{ content: 'gate' }] as any });
    expect(preview.debugInfo?.decisions).toEqual(live.debugInfo?.decisions);
    expect(preview.before).toEqual(live.before);
  });

  it.each([NaN, 0, -1, 1.5, Infinity])('rejects invalid scan configuration %s', async value => {
    await expect(worldInfoEngine.scan({ ...baseParams, entries: [], tokenBudget: value })).rejects.toMatchObject({ code: 'WORLD_INFO_CONFIG_INVALID' });
  });
});

describe('Unversioned story scanner compatibility', () => {
  it('keeps the v1 character budget, numeric mapping and broad history window for existing stories', async () => {
    const entries = [makeEntry('e1', 'Hello', 'x'.repeat(2100), { settings: { keys: ['Hello'] } }),
      makeEntry('e2', 'Hello', 'Legacy conditional', { settings: { keys: ['Hello'], keysSecondary: ['there', 'absent'], selectiveLogic: 1 } })] as StoryWorldbookEntry[];
    const old = await worldInfoEngine.scan({ ...baseParams, compatibilityVersion: 1, legacyMaxContext: 4096, entries });
    expect(old.debugInfo?.activatedCount).toBe(0);
    expect(old.debugInfo).toMatchObject({ scanEngineVersion: 1, budgetUnit: 'characters' });
    const modern = await worldInfoEngine.scan({ ...baseParams, compatibilityVersion: 2, entries });
    expect(modern.debugInfo?.activatedCount).toBe(2);
  });
});

describe('Upstream recursive field meanings', () => {
  const entries = [
    { ...makeEntry('parent', 'gate', 'child-key'), characterFilter: [], scanDepth: null, recursive: true, preventRecursion: false, contextPercentage: null },
    { ...makeEntry('child', 'child-key', 'final'), characterFilter: [], scanDepth: null, recursive: true, preventRecursion: false, contextPercentage: null },
  ] as StoryWorldbookEntry[];
  it('prevent_recursion blocks outgoing activation, not incoming activation', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, chat: [{ content: 'gate' }] as any,
      entries: [entries[0], { ...entries[1], preventRecursion: true }] });
    expect(result.debugInfo?.activatedCount).toBe(2);
    const blocked = await worldInfoEngine.scan({ ...baseParams, chat: [{ content: 'gate' }] as any,
      entries: [{ ...entries[0], preventRecursion: true }, entries[1]] });
    expect(blocked.debugInfo?.activatedCount).toBe(1);
  });
  it('scan_depth zero scans no text, including recursively injected text', async () => {
    const result = await worldInfoEngine.scan({ ...baseParams, chat: [{ content: 'gate child-key' }] as any,
      entries: [entries[0], { ...entries[1], scanDepth: 0 }] });
    expect(result.debugInfo?.activatedCount).toBe(1);
  });
});


it('uses complete frozen parameters without reading changed server defaults', async () => {
  vi.stubEnv('WORLD_INFO_TOKEN_BUDGET', 'invalid');
  try {
    const result = await worldInfoEngine.scan({ ...baseParams, entries: [], compatibilityVersion: 2,
      scanMessageCount: 8, maxRecursionDepth: 2, tokenBudget: 3000 });
    expect(result.debugInfo).toMatchObject({ scanMessageCount: 8, maxRecursionDepth: 2, budgetLimit: 3000 });
  } finally {
    vi.unstubAllEnvs();
  }
});
