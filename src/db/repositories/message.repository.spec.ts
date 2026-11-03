import { describe, it, beforeEach, expect, vi } from 'vitest';
import { MessageRepository } from './message.repository';
import { db } from '../index';

describe('MessageRepository', () => {
  beforeEach(() => {
    new MessageRepository(db);
  });

  describe('findByChatId', () => {
    it('should return messages for chat', async () => {
      // Test implementation
    });

    it('should support cursor pagination with before/after', async () => {
      // Test implementation
    });
  });

  describe('findContextByChatId', () => {
    it('selects only prompt-relevant fields and orders messages chronologically', async () => {
      const rows = [{ id: 1, role: 'user', content: 'hello', pinned: false, importance: 0 }];
      const orderBy = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ orderBy }));
      const from = vi.fn(() => ({ where }));
      const select = vi.fn(() => ({ from }));
      const repo = new MessageRepository({ select } as unknown as typeof db);

      const result = await repo.findContextByChatId('chat-1');

      expect(select).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.anything(), role: expect.anything(), content: expect.anything(),
        pinned: expect.anything(), importance: expect.anything(),
      }));
      expect(Object.keys(select.mock.calls[0][0] as object)).toEqual(['id', 'role', 'content', 'pinned', 'importance']);
      expect(where).toHaveBeenCalledOnce();
      expect(orderBy).toHaveBeenCalledOnce();
      expect(result).toEqual(rows);
    });
  });

  describe('findRecentByChatId', () => {
    it('returns a bounded recent window in chronological order', async () => {
      const rows = [
        { id: 3, content: 'third' },
        { id: 2, content: 'second' },
      ];
      const limit = vi.fn().mockResolvedValue(rows);
      const orderBy = vi.fn(() => ({ limit }));
      const where = vi.fn(() => ({ orderBy }));
      const from = vi.fn(() => ({ where }));
      const select = vi.fn(() => ({ from }));
      const repo = new MessageRepository({ select } as unknown as typeof db);

      const result = await repo.findRecentByChatId('chat-1', 2);

      expect(limit).toHaveBeenCalledWith(2);
      expect(result).toEqual([...rows].reverse());
    });
  });

  describe('update', () => {
    // 链式 fake：update().set().where().returning() / select().from().where()
    function createFakeDb(row: Record<string, unknown>) {
      const set = vi.fn();
      const chain = {
        set: (v: unknown) => { set(v); return chain; },
        where: () => chain,
        returning: async () => [row],
        from: () => chain,
      };
      const fake = {
        update: vi.fn(() => chain),
        select: vi.fn(() => ({ from: () => ({ where: async () => [row] }) })),
      };
      return { fake: fake as unknown as typeof db, set };
    }

    it('persists pinned and importance, not just content', async () => {
      const { fake, set } = createFakeDb({ id: 1, pinned: true, importance: 9 });
      const repo = new MessageRepository(fake);

      const result = await repo.update(1, { pinned: true, importance: 9 });

      expect(set).toHaveBeenCalledWith({ pinned: true, importance: 9 });
      expect(result).toMatchObject({ pinned: true, importance: 9 });
    });

    it('does not overwrite fields that were not provided', async () => {
      const { fake, set } = createFakeDb({ id: 1, content: 'new' });
      const repo = new MessageRepository(fake);

      await repo.update(1, { content: 'new' });

      expect(set).toHaveBeenCalledWith({ content: 'new' });
    });

    it('skips the UPDATE when there is nothing to change', async () => {
      const { fake } = createFakeDb({ id: 1, content: 'same' });
      const repo = new MessageRepository(fake);

      const result = await repo.update(1, {});

      expect((fake as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 1 });
    });
  });

  describe('findById', () => {
    it('should return message when found', async () => {
      // Test implementation
    });

    it('should return null when not found', async () => {
      // Test implementation
    });
  });

  describe('create', () => {
    it('should create and return message', async () => {
      // Test implementation
    });
  });

  describe('createMany', () => {
    it('should create multiple messages', async () => {
      // Test implementation
    });
  });

  describe('delete', () => {
    it('should delete message', async () => {
      // Test implementation
    });
  });

  describe('deleteByChatId', () => {
    it('should delete all messages in chat', async () => {
      // Test implementation
    });
  });

  describe('countByChatId', () => {
    it('should return message count for chat', async () => {
      // Test implementation
    });
  });
});
