/**
 * World Book Route Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// --- Mocks (must precede router import) ---

vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: {
    findByUser: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: {
    create: vi.fn(),
    findByWorldBook: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { id: 'user-1', tenantId: 'tenant-1' });
    await next();
  },
}));

// --- Imports (after mocks) ---

import { worldbooksRouter } from './worldbooks';
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';

describe('World Book Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/worldbooks', worldbooksRouter);
    vi.clearAllMocks();
  });

  // --- GET / ---

  describe('GET /', () => {
    it('returns user world books', async () => {
      const mockBooks = [
        { id: 'wb-1', name: 'Lore A', scope: 'global', userId: 'user-1' },
        { id: 'wb-2', name: 'Lore B', scope: 'character', userId: 'user-1' },
      ];
      vi.mocked(worldBookRepository.findByUser).mockResolvedValue(mockBooks as any);

      const res = await app.request('/worldbooks', { method: 'GET' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockBooks);
      expect(worldBookRepository.findByUser).toHaveBeenCalledWith('user-1');
    });
  });

  // --- POST / ---

  describe('POST /', () => {
    it('creates a world book', async () => {
      const created = { id: 'wb-new', name: 'My Lore', scope: 'global', userId: 'user-1' };
      vi.mocked(worldBookRepository.create).mockResolvedValue(created as any);

      const res = await app.request('/worldbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Lore', scope: 'global' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(created);
      expect(worldBookRepository.create).toHaveBeenCalledWith({
        name: 'My Lore',
        scope: 'global',
        ownerId: 'user-1',
        characterId: undefined,
      });
    });
  });

  // --- GET /:id ---

  describe('GET /:id', () => {
    it('returns world book when user is owner', async () => {
      const wb = { id: 'wb-1', name: 'Lore', userId: 'user-1' };
      vi.mocked(worldBookRepository.findById).mockResolvedValue(wb as any);

      const res = await app.request('/worldbooks/wb-1', { method: 'GET' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(wb);
    });

    it('returns 404 when user is not owner', async () => {
      const wb = { id: 'wb-1', name: 'Lore', userId: 'other-user' };
      vi.mocked(worldBookRepository.findById).mockResolvedValue(wb as any);

      const res = await app.request('/worldbooks/wb-1', { method: 'GET' });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // --- POST /:id/entries ---

  describe('POST /:id/entries', () => {
    it('creates an entry for an owned world book', async () => {
      const wb = { id: 'wb-1', name: 'Lore', userId: 'user-1' };
      vi.mocked(worldBookRepository.findById).mockResolvedValue(wb as any);

      const entry = { id: 'e-1', worldbookId: 'wb-1', keyword: 'dragon', content: 'A fire-breathing creature' };
      vi.mocked(worldBookEntryRepository.create).mockResolvedValue(entry as any);

      const res = await app.request('/worldbooks/wb-1/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: 'dragon', content: 'A fire-breathing creature' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(entry);
      expect(worldBookEntryRepository.create).toHaveBeenCalledWith({
        worldBookId: 'wb-1',
        keys: ['dragon'],
        content: 'A fire-breathing creature',
        order: 0,
        enabled: true,
        depth: 0,
      });
    });
  });

  // --- POST /:id/import ---

  describe('POST /:id/import', () => {
    it('imports SillyTavern character_book format entries', async () => {
      const wb = { id: 'wb-1', name: 'Lore', userId: 'user-1' };
      vi.mocked(worldBookRepository.findById).mockResolvedValue(wb as any);
      vi.mocked(worldBookEntryRepository.create).mockResolvedValue({ id: 'e-imp' } as any);

      const importPayload = {
        entries: {
          '0': {
            keys: ['elf', 'elves'],
            secondary_keys: ['forest'],
            selectiveLogic: 1,
            content: 'Elves live in forests',
            comment: 'Elf lore',
            position: 0,
            depth: 4,
            insertion_order: 10,
            enabled: true,
            constant: false,
            probability: 100,
          },
          '1': {
            keys: ['dwarf'],
            content: 'Dwarves mine mountains',
            position: 1,
            enabled: false,
          },
        },
      };

      const res = await app.request('/worldbooks/wb-1/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importPayload),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.imported).toBe(2);
      expect(worldBookEntryRepository.create).toHaveBeenCalledTimes(2);
    });
  });
});
