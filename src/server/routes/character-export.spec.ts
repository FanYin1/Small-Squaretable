/**
 * Character export tests — world book re-embedding
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../services/character.service');

vi.mock('../services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn(),
    invalidateCharacter: vi.fn(),
    invalidateMarketplace: vi.fn(),
    getCachedCharacter: vi.fn().mockResolvedValue(null),
    setCachedCharacter: vi.fn(),
    getCachedMarketplace: vi.fn().mockResolvedValue(null),
    setCachedMarketplace: vi.fn(),
    getCachedSearch: vi.fn().mockResolvedValue(null),
    setCachedSearch: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
}));

vi.mock('../services/character-version.service', () => ({
  characterVersionService: {
    saveVersion: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: { findByCharacter: vi.fn() },
}));

vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: { findByWorldBook: vi.fn() },
}));

describe('Character Export — World Book Re-embedding', () => {
  let app: Hono;

  const mockCharacter = {
    id: 'char-001',
    name: 'Test Char',
    description: 'A test character',
    tags: ['fantasy'],
    cardData: { first_mes: 'Hello!' },
    creatorId: 'user-123',
    tenantId: 'tenant-123',
    isPublic: false,
    avatarUrl: null,
  };

  async function setupAuth() {
    const { verifyAccessToken } = await import('../../core/jwt');
    const { userRepository } = await import('../../db/repositories/user.repository');
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      isActive: true,
    } as any);
  }

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('GET /:id/export/json', () => {
    it('should include character_book when world book exists', async () => {
      await setupAuth();
      vi.mocked(characterService.getById).mockResolvedValue(mockCharacter as any);
      vi.mocked(worldBookRepository.findByCharacter).mockResolvedValue([
        { id: 'wb-1', name: 'My Lorebook', characterId: 'char-001' },
      ] as any);
      vi.mocked(worldBookEntryRepository.findByWorldBook).mockResolvedValue([
        {
          id: 'entry-1',
          worldbookId: 'wb-1',
          keyword: 'dragon,fire',
          content: 'Dragons breathe fire.',
          position: 0,
          isEnabled: true,
          priority: 4,
          settings: {
            keys: ['dragon', 'fire'],
            keysSecondary: ['flame'],
            comment: 'Dragon lore',
            position: 'before_char',
            depth: 4,
            order: 10,
            constant: false,
            caseSensitive: false,
          },
        },
      ] as any);

      const res = await app.request('/api/v1/characters/char-001/export/json', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character_book).toBeDefined();
      expect(data.character_book.name).toBe('My Lorebook');
      expect(data.character_book.entries).toHaveLength(1);

      const entry = data.character_book.entries[0];
      expect(entry.keys).toEqual(['dragon', 'fire']);
      expect(entry.secondary_keys).toEqual(['flame']);
      expect(entry.content).toBe('Dragons breathe fire.');
      expect(entry.comment).toBe('Dragon lore');
      expect(entry.position).toBe('before_char');
      expect(entry.selective).toBe(true);
      expect(entry.constant).toBe(false);
    });

    it('should not include character_book when no world book exists', async () => {
      await setupAuth();
      vi.mocked(characterService.getById).mockResolvedValue(mockCharacter as any);
      vi.mocked(worldBookRepository.findByCharacter).mockResolvedValue([]);

      const res = await app.request('/api/v1/characters/char-001/export/json', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.character_book).toBeUndefined();
    });

    it('should correctly map entries from settings jsonb', async () => {
      await setupAuth();
      vi.mocked(characterService.getById).mockResolvedValue(mockCharacter as any);
      vi.mocked(worldBookRepository.findByCharacter).mockResolvedValue([
        { id: 'wb-2', name: 'Lore', characterId: 'char-001' },
      ] as any);
      vi.mocked(worldBookEntryRepository.findByWorldBook).mockResolvedValue([
        {
          id: 'e1',
          worldbookId: 'wb-2',
          keyword: 'elf',
          content: 'Elves are immortal.',
          position: 5,
          isEnabled: false,
          priority: 2,
          settings: {
            keys: ['elf', 'elven'],
            keysSecondary: [],
            comment: 'Elf entry',
            position: 'after_char',
            depth: 8,
            order: 20,
            constant: true,
            caseSensitive: true,
          },
        },
        {
          id: 'e2',
          worldbookId: 'wb-2',
          keyword: 'dwarf',
          content: 'Dwarves mine.',
          position: 3,
          isEnabled: true,
          priority: 0,
          settings: {},
        },
      ] as any);

      const res = await app.request('/api/v1/characters/char-001/export/json', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const entries = data.character_book.entries;
      expect(entries).toHaveLength(2);

      // First entry: full settings
      expect(entries[0].enabled).toBe(false);
      expect(entries[0].constant).toBe(true);
      expect(entries[0].case_sensitive).toBe(true);
      expect(entries[0].insertion_order).toBe(20);
      expect(entries[0].priority).toBe(8);
      expect(entries[0].selective).toBe(false); // empty keysSecondary

      // Second entry: empty settings — falls back to row fields
      expect(entries[1].keys).toEqual(['dwarf']);
      expect(entries[1].content).toBe('Dwarves mine.');
      expect(entries[1].enabled).toBe(true);
      expect(entries[1].insertion_order).toBe(3); // falls back to e.position
      expect(entries[1].priority).toBe(0); // falls back to e.priority
      expect(entries[1].position).toBe('after_char'); // default
    });
  });
});
