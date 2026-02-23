/**
 * Social Service
 *
 * Orchestrates follow, favorite, and comment operations.
 * Emits events via EventBus and creates notifications.
 */

import type { FollowRepository } from '@db/repositories/follow.repository';
import type { FavoriteRepository } from '@db/repositories/favorite.repository';
import type { CommentRepository } from '@db/repositories/comment.repository';
import type { NotificationRepository } from '@db/repositories/notification.repository';
import type { UserRepository } from '@db/repositories/user.repository';
import type { EventBus } from './event-bus.service';
import type { FollowInfo, FavoriteInfo } from '@/types/social';
import { NotFoundError, BadRequestError } from '@/core/errors';
import { notificationService } from './notification.service';
import { db } from '@db/index';
import { characters } from '@db/schema/characters';
import { comments as commentsTable } from '@db/schema/social';
import { eq, and, sql } from 'drizzle-orm';

export class SocialService {
  constructor(
    private followRepo: FollowRepository,
    private favoriteRepo: FavoriteRepository,
    private commentRepo: CommentRepository,
    private notificationRepo: NotificationRepository,
    private eventBus: EventBus,
    private userRepo: UserRepository,
  ) {}

  // --- Follow ---

  async followUser(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestError('Cannot follow yourself');
    const follow = await this.followRepo.follow(userId, targetId);
    await this.eventBus.emit('social.follow', { followerId: userId, followingId: targetId });
    // Create notification for the followed user
    await notificationService.notify({ userId: targetId, type: 'follow', actorId: userId, targetType: 'user', targetId: userId, message: 'started following you' });

    return follow;
  }

  async unfollowUser(userId: string, targetId: string) {
    const result = await this.followRepo.unfollow(userId, targetId);
    if (result) {
      await this.eventBus.emit('social.unfollow', { followerId: userId, followingId: targetId });
    }
    return result;
  }

  async getFollowStatus(userId: string, targetId: string): Promise<FollowInfo> {
    const [isFollowing, counts] = await Promise.all([
      this.followRepo.isFollowing(userId, targetId),
      this.followRepo.getFollowCounts(targetId),
    ]);
    return { isFollowing, ...counts };
  }

  async getFollowers(userId: string, limit: number, offset: number) {
    return this.followRepo.getFollowers(userId, limit, offset);
  }

  async getFollowing(userId: string, limit: number, offset: number) {
    return this.followRepo.getFollowing(userId, limit, offset);
  }

  // --- Favorite ---

  async favoriteCharacter(userId: string, characterId: string) {
    const fav = await this.favoriteRepo.favorite(userId, characterId);
    await this.eventBus.emit('social.favorite', { userId, characterId });

    // Notify the character creator (not yourself)
    try {
      const [char] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (char?.creatorId && char.creatorId !== userId) {
        await notificationService.notify({
          userId: char.creatorId,
          type: 'favorite',
          actorId: userId,
          targetType: 'character',
          targetId: characterId,
          message: 'favorited your character',
          groupKey: `favorite:${characterId}`,
        });
      }
    } catch {
      // Notification failure should never break the main operation
    }

    return fav;
  }

  async unfavoriteCharacter(userId: string, characterId: string) {
    const result = await this.favoriteRepo.unfavorite(userId, characterId);
    if (result) {
      await this.eventBus.emit('social.unfavorite', { userId, characterId });
    }
    return result;
  }

  async getFavoriteStatus(userId: string, characterId: string): Promise<FavoriteInfo> {
    const [isFavorited, favoriteCount] = await Promise.all([
      this.favoriteRepo.isFavorited(userId, characterId),
      this.favoriteRepo.getFavoriteCount(characterId),
    ]);
    return { isFavorited, favoriteCount };
  }

  async getUserFavorites(userId: string, limit: number, offset: number) {
    return this.favoriteRepo.getFavoritesByUser(userId, limit, offset);
  }

  // --- Comment ---

  async createComment(userId: string, characterId: string, content: string, parentId?: string) {
    const comment = await this.commentRepo.createComment(userId, characterId, content, parentId);
    await this.eventBus.emit('social.comment', { userId, characterId, commentId: comment.id, parentId });

    // Notify the character creator for top-level comments
    try {
      const [char] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (char?.creatorId && char.creatorId !== userId) {
        await notificationService.notify({
          userId: char.creatorId,
          type: 'comment',
          actorId: userId,
          targetType: 'character',
          targetId: characterId,
          message: 'commented on your character',
          groupKey: `comment:${characterId}`,
        });
      }
    } catch {
      // Notification failure should never break the main operation
    }

    // Notify the parent comment author for replies
    if (parentId) {
      try {
        const [parentComment] = await db
          .select({ userId: commentsTable.userId })
          .from(commentsTable)
          .where(eq(commentsTable.id, parentId))
          .limit(1);

        if (parentComment && parentComment.userId !== userId) {
          await notificationService.notify({
            userId: parentComment.userId,
            type: 'reply',
            actorId: userId,
            targetType: 'character',
            targetId: characterId,
            message: 'replied to your comment',
            groupKey: `reply:${parentId}`,
          });
        }
      } catch {
        // Notification failure should never break the main operation
      }
    }

    return comment;
  }

  async updateComment(commentId: string, userId: string, content: string) {
    const updated = await this.commentRepo.updateComment(commentId, userId, content);
    if (!updated) throw new NotFoundError('Comment');
    return updated;
  }

  async deleteComment(commentId: string, userId: string) {
    const deleted = await this.commentRepo.deleteComment(commentId, userId);
    if (!deleted) throw new NotFoundError('Comment');
  }

  async getComments(characterId: string, limit: number, offset: number, sort: 'newest' | 'oldest') {
    return this.commentRepo.getCommentsByCharacter(characterId, limit, offset, sort);
  }

  async getReplies(commentId: string, limit: number, offset: number) {
    return this.commentRepo.getReplies(commentId, limit, offset);
  }

  // --- Comment Likes ---

  async likeComment(userId: string, commentId: string) {
    await this.commentRepo.likeComment(userId, commentId);
    await this.eventBus.emit('social.commentLike', { userId, commentId });
  }

  async unlikeComment(userId: string, commentId: string) {
    const result = await this.commentRepo.unlikeComment(userId, commentId);
    if (result) {
      await this.eventBus.emit('social.commentUnlike', { userId, commentId });
    }
    return result;
  }

  // --- User Profile ---

  async getUserProfile(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User');

    // Get public character count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(characters)
      .where(and(eq(characters.creatorId, userId), eq(characters.isPublic, true)));

    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio || '',
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      characterCount: countResult[0]?.count ?? 0,
      createdAt: user.createdAt,
    };
  }
}

// Singleton
import { followRepository } from '@db/repositories/follow.repository';
import { favoriteRepository } from '@db/repositories/favorite.repository';
import { commentRepository } from '@db/repositories/comment.repository';
import { notificationRepository } from '@db/repositories/notification.repository';
import { userRepository } from '@db/repositories/user.repository';
import { eventBus } from './event-bus.service';

export const socialService = new SocialService(
  followRepository, favoriteRepository, commentRepository, notificationRepository, eventBus, userRepository,
);
