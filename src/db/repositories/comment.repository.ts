/**
 * Comment Repository
 *
 * 处理角色评论的数据访问（支持嵌套回复、软删除、计数器同步）
 */

import { eq, and, sql, desc, asc, isNull, count } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { comments, commentLikes, type Comment } from '../schema/social';
import { characters } from '../schema/characters';
import { users } from '../schema/users';
import type { CommentWithAuthor } from '@/types/social';

export class CommentRepository extends BaseRepository {
  /**
   * Create a comment. Transaction: insert comment + increment commentCount on character.
   */
  async createComment(
    userId: string,
    characterId: string,
    content: string,
    parentId?: string,
  ): Promise<Comment> {
    return await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(comments)
        .values({
          userId,
          characterId,
          content,
          parentId: parentId ?? null,
        })
        .returning();

      await tx
        .update(characters)
        .set({
          commentCount: sql`${characters.commentCount} + 1`,
        })
        .where(eq(characters.id, characterId));

      return comment;
    });
  }

  /**
   * Update comment content (only if userId matches).
   * Return null if not found or not owner.
   */
  async updateComment(
    commentId: string,
    userId: string,
    content: string,
  ): Promise<Comment | null> {
    const result = await this.db
      .update(comments)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Soft-delete: set isDeleted=true, replace content with "[已删除]".
   * Transaction: update + decrement commentCount.
   * Return true if deleted, false if not found/not owner.
   */
  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const result = await tx
        .update(comments)
        .set({
          isDeleted: true,
          content: '[已删除]',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(comments.id, commentId),
            eq(comments.userId, userId),
            eq(comments.isDeleted, false),
          ),
        )
        .returning();

      if (result.length === 0) {
        return false;
      }

      await tx
        .update(characters)
        .set({
          commentCount: sql`GREATEST(${characters.commentCount} - 1, 0)`,
        })
        .where(eq(characters.id, result[0].characterId));

      return true;
    });
  }

  /**
   * Get paginated comments for a character (join with users for author info).
   * Exclude soft-deleted comments (isDeleted=false). Only top-level (parentId IS NULL).
   * Sort: 'newest' = desc(createdAt), 'oldest' = asc(createdAt)
   */
  async getCommentsByCharacter(
    characterId: string,
    limit: number,
    offset: number,
    sort: 'newest' | 'oldest',
  ): Promise<CommentWithAuthor[]> {
    const orderBy = sort === 'newest' ? desc(comments.createdAt) : asc(comments.createdAt);

    const rows = await this.db
      .select({
        id: comments.id,
        content: comments.content,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(
        and(
          eq(comments.characterId, characterId),
          eq(comments.isDeleted, false),
          isNull(comments.parentId),
        ),
      )
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      parentId: row.parentId,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      },
    }));
  }

  /**
   * Get replies to a comment (join with users). Exclude soft-deleted.
   */
  async getReplies(
    parentId: string,
    limit: number,
    offset: number,
  ): Promise<CommentWithAuthor[]> {
    const rows = await this.db
      .select({
        id: comments.id,
        content: comments.content,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(
        and(
          eq(comments.parentId, parentId),
          eq(comments.isDeleted, false),
        ),
      )
      .orderBy(asc(comments.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      parentId: row.parentId,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      },
    }));
  }

  /**
   * Get reply count for a comment (non-deleted only)
   */
  async getReplyCount(commentId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(
        and(
          eq(comments.parentId, commentId),
          eq(comments.isDeleted, false),
        ),
      );
    return count;
  }

  /**
   * Get single comment by ID with author info
   */
  async getCommentById(commentId: string): Promise<CommentWithAuthor | null> {
    const rows = await this.db
      .select({
        id: comments.id,
        content: comments.content,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.id, commentId));

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      content: row.content,
      parentId: row.parentId,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      },
    };
  }

  // --- Comment Likes ---

  /**
   * Like a comment (idempotent — ON CONFLICT DO NOTHING)
   */
  async likeComment(userId: string, commentId: string): Promise<void> {
    await this.db
      .insert(commentLikes)
      .values({ userId, commentId })
      .onConflictDoNothing();
  }

  /**
   * Unlike a comment
   */
  async unlikeComment(userId: string, commentId: string): Promise<boolean> {
    const result = await this.db
      .delete(commentLikes)
      .where(
        and(
          eq(commentLikes.userId, userId),
          eq(commentLikes.commentId, commentId),
        ),
      )
      .returning();
    return result.length > 0;
  }

  /**
   * Get like count for a comment
   */
  async getLikeCount(commentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(commentLikes)
      .where(eq(commentLikes.commentId, commentId));
    return result.count;
  }

  /**
   * Check if a user has liked a comment
   */
  async isLiked(userId: string, commentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: commentLikes.id })
      .from(commentLikes)
      .where(
        and(
          eq(commentLikes.userId, userId),
          eq(commentLikes.commentId, commentId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}

export const commentRepository = new CommentRepository(db);
