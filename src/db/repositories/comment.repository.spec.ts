/**
 * CommentRepository unit tests (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks that vi.mock factories can reference
const { mockDb, mockTx } = vi.hoisted(() => {
  function createChain() {
    const c: any = {};
    c.insert = vi.fn(() => c);
    c.values = vi.fn(() => c);
    c.returning = vi.fn();
    c.select = vi.fn(() => c);
    c.from = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.update = vi.fn(() => c);
    c.set = vi.fn(() => c);
    c.delete = vi.fn(() => c);
    c.innerJoin = vi.fn(() => c);
    c.orderBy = vi.fn(() => c);
    c.limit = vi.fn(() => c);
    c.offset = vi.fn();
    return c;
  }
  const mockTx = createChain();
  const mockDb = createChain();
  mockDb.transaction = vi.fn(async (fn: any) => fn(mockTx));
  return { mockDb, mockTx };
});

vi.mock('../index', () => ({ db: mockDb }));

vi.mock('../schema/social', () => ({
  comments: {
    id: 'id', userId: 'user_id', characterId: 'character_id',
    content: 'content', parentId: 'parent_id', isDeleted: 'is_deleted',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
}));

vi.mock('../schema/characters', () => ({
  characters: { id: 'id', commentCount: 'comment_count' },
}));

vi.mock('../schema/users', () => ({
  users: { id: 'id', displayName: 'display_name', avatarUrl: 'avatar_url' },
}));

import { CommentRepository } from './comment.repository';

const now = new Date('2026-01-01T00:00:00Z');

function resetChain(c: any) {
  c.insert.mockImplementation(() => c);
  c.values.mockImplementation(() => c);
  c.select.mockImplementation(() => c);
  c.from.mockImplementation(() => c);
  c.where.mockImplementation(() => c);
  c.update.mockImplementation(() => c);
  c.set.mockImplementation(() => c);
  c.delete.mockImplementation(() => c);
  c.innerJoin.mockImplementation(() => c);
  c.orderBy.mockImplementation(() => c);
  c.limit.mockImplementation(() => c);
}

describe('CommentRepository', () => {
  let repository: CommentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetChain(mockDb);
    resetChain(mockTx);
    mockDb.transaction.mockImplementation(async (fn: any) => fn(mockTx));
    repository = new CommentRepository(mockDb as any);
  });

  describe('createComment', () => {
    it('should insert a comment via transaction', async () => {
      const fakeComment = {
        id: 'c-1', userId: 'u-1', characterId: 'ch-1',
        content: 'Hello world', parentId: null, isDeleted: false,
        createdAt: now, updatedAt: now,
      };
      mockTx.returning.mockResolvedValueOnce([fakeComment]);

      const comment = await repository.createComment('u-1', 'ch-1', 'Hello world');

      expect(comment.id).toBe('c-1');
      expect(comment.content).toBe('Hello world');
      expect(comment.parentId).toBeNull();
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should create a reply with parentId', async () => {
      const fakeReply = {
        id: 'c-2', userId: 'u-2', characterId: 'ch-1',
        content: 'Reply', parentId: 'c-1', isDeleted: false,
        createdAt: now, updatedAt: now,
      };
      mockTx.returning.mockResolvedValueOnce([fakeReply]);

      const reply = await repository.createComment('u-2', 'ch-1', 'Reply', 'c-1');

      expect(reply.parentId).toBe('c-1');
      expect(reply.content).toBe('Reply');
    });
  });

  describe('updateComment', () => {
    it('should update content', async () => {
      const fakeUpdated = { id: 'c-1', content: 'Updated', updatedAt: now };
      mockDb.returning.mockResolvedValueOnce([fakeUpdated]);

      const updated = await repository.updateComment('c-1', 'u-1', 'Updated');

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated');
    });

    it('should return null for wrong userId', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const updated = await repository.updateComment('c-1', 'wrong', 'Hacked');
      expect(updated).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('should soft-delete via transaction', async () => {
      mockTx.returning.mockResolvedValueOnce([{ id: 'c-1', characterId: 'ch-1' }]);

      const deleted = await repository.deleteComment('c-1', 'u-1');

      expect(deleted).toBe(true);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should return false for wrong userId', async () => {
      mockTx.returning.mockResolvedValueOnce([]);

      const deleted = await repository.deleteComment('c-1', 'wrong');
      expect(deleted).toBe(false);
    });
  });

  describe('getCommentsByCharacter', () => {
    it('should return comments with author info', async () => {
      const rows = [{
        id: 'c1', content: 'Comment 1', parentId: null, isDeleted: false,
        createdAt: now, updatedAt: now,
        authorId: 'u-1', authorDisplayName: 'Test User', authorAvatarUrl: null,
      }];
      mockDb.offset.mockResolvedValueOnce(rows);

      const result = await repository.getCommentsByCharacter('ch-1', 2, 0, 'newest');

      expect(result).toHaveLength(1);
      expect(result[0].author.id).toBe('u-1');
      expect(typeof result[0].createdAt).toBe('string');
    });
  });

  describe('getReplies', () => {
    it('should return replies with author info', async () => {
      const rows = [{
        id: 'r1', content: 'Reply 1', parentId: 'c-1', isDeleted: false,
        createdAt: now, updatedAt: now,
        authorId: 'u-2', authorDisplayName: 'User 2', authorAvatarUrl: null,
      }];
      mockDb.offset.mockResolvedValueOnce(rows);

      const replies = await repository.getReplies('c-1', 10, 0);

      expect(replies).toHaveLength(1);
      expect(replies[0].parentId).toBe('c-1');
      expect(replies[0].author.id).toBe('u-2');
    });
  });

  describe('getReplyCount', () => {
    it('should return count of non-deleted replies', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);

      const count = await repository.getReplyCount('c-1');
      expect(count).toBe(1);
    });
  });

  describe('getCommentById', () => {
    it('should return comment with author info', async () => {
      const rows = [{
        id: 'c-1', content: 'Test comment', parentId: null, isDeleted: false,
        createdAt: now, updatedAt: now,
        authorId: 'u-1', authorDisplayName: 'Test User', authorAvatarUrl: null,
      }];
      mockDb.where.mockResolvedValueOnce(rows);

      const found = await repository.getCommentById('c-1');

      expect(found).toBeDefined();
      expect(found!.id).toBe('c-1');
      expect(found!.author.displayName).toBe('Test User');
      expect(typeof found!.createdAt).toBe('string');
    });

    it('should return null for non-existent comment', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const found = await repository.getCommentById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });
});
