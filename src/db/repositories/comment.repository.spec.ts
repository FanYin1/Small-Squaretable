/**
 * CommentRepository 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../index';
import { comments } from '../schema/social';
import { characters } from '../schema/characters';
import { users } from '../schema/users';
import { tenants } from '../schema/tenants';
import { CommentRepository } from './comment.repository';
import { eq } from 'drizzle-orm';

describe('CommentRepository', () => {
  let repository: CommentRepository;
  let testTenantId: string;
  let testUserId: string;
  let testUser2Id: string;
  let testCharacterId: string;

  beforeEach(async () => {
    repository = new CommentRepository(db);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-' + Date.now(),
    }).returning();
    testTenantId = tenant.id;

    // Create test users
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      displayName: 'Test User',
    }).returning();
    testUserId = user.id;

    const [user2] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test2-${Date.now()}@example.com`,
      passwordHash: 'hash',
      displayName: 'Test User 2',
    }).returning();
    testUser2Id = user2.id;

    // Create test character with commentCount = 0
    const [character] = await db.insert(characters).values({
      tenantId: testTenantId,
      creatorId: testUserId,
      name: 'Test Character',
      cardData: { name: 'Test' },
      isPublic: true,
    }).returning();
    testCharacterId = character.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(comments).where(eq(comments.characterId, testCharacterId));
    await db.delete(characters).where(eq(characters.id, testCharacterId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, testUser2Id));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  // --- createComment ---

  describe('createComment', () => {
    it('should insert a comment and increment commentCount', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'Hello world');

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(comment.userId).toBe(testUserId);
      expect(comment.characterId).toBe(testCharacterId);
      expect(comment.content).toBe('Hello world');
      expect(comment.parentId).toBeNull();
      expect(comment.isDeleted).toBe(false);
      expect(comment.createdAt).toBeDefined();
      expect(comment.updatedAt).toBeDefined();

      // Verify commentCount incremented
      const [char] = await db
        .select({ commentCount: characters.commentCount })
        .from(characters)
        .where(eq(characters.id, testCharacterId));
      expect(char.commentCount).toBe(1);
    });

    it('should create a reply with parentId', async () => {
      const parent = await repository.createComment(testUserId, testCharacterId, 'Parent comment');
      const reply = await repository.createComment(testUser2Id, testCharacterId, 'Reply', parent.id);

      expect(reply).toBeDefined();
      expect(reply.parentId).toBe(parent.id);
      expect(reply.content).toBe('Reply');
      expect(reply.userId).toBe(testUser2Id);

      // commentCount should be 2 (parent + reply)
      const [char] = await db
        .select({ commentCount: characters.commentCount })
        .from(characters)
        .where(eq(characters.id, testCharacterId));
      expect(char.commentCount).toBe(2);
    });
  });

  // --- updateComment ---

  describe('updateComment', () => {
    it('should update content and updatedAt', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'Original');

      // Small delay to ensure updatedAt differs
      await new Promise((r) => setTimeout(r, 50));

      const updated = await repository.updateComment(comment.id, testUserId, 'Updated content');

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('Updated content');
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(comment.updatedAt.getTime());
    });

    it('should return null for wrong userId', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'Original');

      const updated = await repository.updateComment(comment.id, testUser2Id, 'Hacked');

      expect(updated).toBeNull();
    });
  });

  // --- deleteComment ---

  describe('deleteComment', () => {
    it('should soft-delete and decrement commentCount', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'To delete');

      // Verify commentCount is 1
      const [charBefore] = await db
        .select({ commentCount: characters.commentCount })
        .from(characters)
        .where(eq(characters.id, testCharacterId));
      expect(charBefore.commentCount).toBe(1);

      const deleted = await repository.deleteComment(comment.id, testUserId);

      expect(deleted).toBe(true);

      // Verify soft-delete fields
      const [row] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, comment.id));
      expect(row.isDeleted).toBe(true);
      expect(row.content).toBe('[已删除]');

      // Verify commentCount decremented
      const [charAfter] = await db
        .select({ commentCount: characters.commentCount })
        .from(characters)
        .where(eq(characters.id, testCharacterId));
      expect(charAfter.commentCount).toBe(0);
    });

    it('should return false for wrong userId', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'Mine');

      const deleted = await repository.deleteComment(comment.id, testUser2Id);

      expect(deleted).toBe(false);

      // Verify comment is unchanged
      const [row] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, comment.id));
      expect(row.isDeleted).toBe(false);
      expect(row.content).toBe('Mine');
    });
  });

  // --- getCommentsByCharacter ---

  describe('getCommentsByCharacter', () => {
    it('should return paginated top-level comments with author', async () => {
      await repository.createComment(testUserId, testCharacterId, 'Comment 1');
      await repository.createComment(testUser2Id, testCharacterId, 'Comment 2');
      await repository.createComment(testUserId, testCharacterId, 'Comment 3');

      const result = await repository.getCommentsByCharacter(testCharacterId, 2, 0, 'newest');

      expect(result).toHaveLength(2);
      expect(result[0].author).toBeDefined();
      expect(result[0].author.id).toBeDefined();
      expect(typeof result[0].createdAt).toBe('string');
      expect(typeof result[0].updatedAt).toBe('string');
    });

    it('should exclude deleted comments', async () => {
      const c1 = await repository.createComment(testUserId, testCharacterId, 'Keep');
      const c2 = await repository.createComment(testUserId, testCharacterId, 'Delete me');

      await repository.deleteComment(c2.id, testUserId);

      const result = await repository.getCommentsByCharacter(testCharacterId, 10, 0, 'newest');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(c1.id);
    });

    it('should sort correctly (newest first)', async () => {
      await repository.createComment(testUserId, testCharacterId, 'First');
      await new Promise((r) => setTimeout(r, 50));
      await repository.createComment(testUserId, testCharacterId, 'Second');

      const newest = await repository.getCommentsByCharacter(testCharacterId, 10, 0, 'newest');
      expect(newest[0].content).toBe('Second');
      expect(newest[1].content).toBe('First');

      const oldest = await repository.getCommentsByCharacter(testCharacterId, 10, 0, 'oldest');
      expect(oldest[0].content).toBe('First');
      expect(oldest[1].content).toBe('Second');
    });
  });

  // --- getReplies ---

  describe('getReplies', () => {
    it('should return replies with author info', async () => {
      const parent = await repository.createComment(testUserId, testCharacterId, 'Parent');
      await repository.createComment(testUser2Id, testCharacterId, 'Reply 1', parent.id);
      await repository.createComment(testUserId, testCharacterId, 'Reply 2', parent.id);

      const replies = await repository.getReplies(parent.id, 10, 0);

      expect(replies).toHaveLength(2);
      expect(replies[0].parentId).toBe(parent.id);
      expect(replies[0].author).toBeDefined();
      expect(replies[0].author.id).toBeDefined();
      // Replies sorted by oldest first
      expect(replies[0].content).toBe('Reply 1');
      expect(replies[1].content).toBe('Reply 2');
    });
  });

  // --- getReplyCount ---

  describe('getReplyCount', () => {
    it('should return count of non-deleted replies', async () => {
      const parent = await repository.createComment(testUserId, testCharacterId, 'Parent');
      await repository.createComment(testUser2Id, testCharacterId, 'Reply 1', parent.id);
      const reply2 = await repository.createComment(testUserId, testCharacterId, 'Reply 2', parent.id);

      // Delete one reply
      await repository.deleteComment(reply2.id, testUserId);

      const count = await repository.getReplyCount(parent.id);
      expect(count).toBe(1);
    });
  });

  // --- getCommentById ---

  describe('getCommentById', () => {
    it('should return comment with author info', async () => {
      const comment = await repository.createComment(testUserId, testCharacterId, 'Test comment');

      const found = await repository.getCommentById(comment.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(comment.id);
      expect(found!.content).toBe('Test comment');
      expect(found!.author.id).toBe(testUserId);
      expect(found!.author.displayName).toBe('Test User');
      expect(typeof found!.createdAt).toBe('string');
      expect(typeof found!.updatedAt).toBe('string');
    });

    it('should return null for non-existent comment', async () => {
      const found = await repository.getCommentById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });
});
