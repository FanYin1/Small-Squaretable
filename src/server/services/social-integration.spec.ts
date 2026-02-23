/**
 * Social Features Integration Tests
 *
 * Tests the full social features flow through the service layer
 * using mocked repositories, verifying follow, favorite, comment,
 * notification, and event emission behaviors end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.service';
import { SocialService } from './social.service';
import { NotFoundError, BadRequestError } from '../../core/errors';

// Mock the notificationService singleton used by social.service.ts
vi.mock('./notification.service', () => ({
  notificationService: {
    notify: vi.fn().mockResolvedValue({ id: 'n-1' }),
  },
}));

import { notificationService } from './notification.service';

// --- Mock repository factories (same pattern as social.service.spec.ts) ---

function createMockFollowRepo() {
  return {
    follow: vi.fn(),
    unfollow: vi.fn(),
    isFollowing: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    getFollowCounts: vi.fn(),
  };
}

function createMockFavoriteRepo() {
  return {
    favorite: vi.fn(),
    unfavorite: vi.fn(),
    isFavorited: vi.fn(),
    getFavoritesByUser: vi.fn(),
    getFavoriteCount: vi.fn(),
  };
}

function createMockCommentRepo() {
  return {
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    getCommentsByCharacter: vi.fn(),
    getReplies: vi.fn(),
  };
}

function createMockNotificationRepo() {
  return {
    createNotification: vi.fn(),
  };
}

type MockFollowRepo = ReturnType<typeof createMockFollowRepo>;
type MockFavoriteRepo = ReturnType<typeof createMockFavoriteRepo>;
type MockCommentRepo = ReturnType<typeof createMockCommentRepo>;
type MockNotificationRepo = ReturnType<typeof createMockNotificationRepo>;

describe('Social Features Integration', () => {
  let eventBus: EventBus;
  let followRepo: MockFollowRepo;
  let favoriteRepo: MockFavoriteRepo;
  let commentRepo: MockCommentRepo;
  let notificationRepo: MockNotificationRepo;
  let service: SocialService;

  beforeEach(() => {
    eventBus = new EventBus();
    followRepo = createMockFollowRepo();
    favoriteRepo = createMockFavoriteRepo();
    commentRepo = createMockCommentRepo();
    notificationRepo = createMockNotificationRepo();
    service = new SocialService(
      followRepo as any,
      favoriteRepo as any,
      commentRepo as any,
      notificationRepo as any,
      eventBus,
    );
  });

  // --- 1. Follow flow ---
  describe('Follow flow', () => {
    it('should follow → check status (isFollowing=true) → get followers → unfollow → check status (isFollowing=false)', async () => {
      // Step 1: Follow user-2
      const fakeFollow = { id: 'f-1', followerId: 'user-1', followingId: 'user-2' };
      followRepo.follow.mockResolvedValue(fakeFollow);

      const followResult = await service.followUser('user-1', 'user-2');
      expect(followResult).toEqual(fakeFollow);
      expect(followRepo.follow).toHaveBeenCalledWith('user-1', 'user-2');

      // Step 2: Check follow status shows isFollowing=true
      followRepo.isFollowing.mockResolvedValue(true);
      followRepo.getFollowCounts.mockResolvedValue({ followerCount: 1, followingCount: 0 });

      const statusAfterFollow = await service.getFollowStatus('user-1', 'user-2');
      expect(statusAfterFollow.isFollowing).toBe(true);
      expect(statusAfterFollow.followerCount).toBe(1);

      // Step 3: Get followers of user-2 includes user-1
      followRepo.getFollowers.mockResolvedValue([
        { id: 'f-1', followerId: 'user-1', followingId: 'user-2' },
      ]);

      const followers = await service.getFollowers('user-2', 20, 0);
      expect(followers).toHaveLength(1);
      expect(followers[0].followerId).toBe('user-1');

      // Step 4: Unfollow user-2
      followRepo.unfollow.mockResolvedValue(true);

      const unfollowResult = await service.unfollowUser('user-1', 'user-2');
      expect(unfollowResult).toBe(true);
      expect(followRepo.unfollow).toHaveBeenCalledWith('user-1', 'user-2');

      // Step 5: Check follow status shows isFollowing=false
      followRepo.isFollowing.mockResolvedValue(false);
      followRepo.getFollowCounts.mockResolvedValue({ followerCount: 0, followingCount: 0 });

      const statusAfterUnfollow = await service.getFollowStatus('user-1', 'user-2');
      expect(statusAfterUnfollow.isFollowing).toBe(false);
      expect(statusAfterUnfollow.followerCount).toBe(0);
    });
  });

  // --- 2. Self-follow prevention ---
  describe('Self-follow prevention', () => {
    it('should throw BadRequestError when following yourself', async () => {
      await expect(service.followUser('user-1', 'user-1')).rejects.toThrow(BadRequestError);
      await expect(service.followUser('user-1', 'user-1')).rejects.toThrow('Cannot follow yourself');
      expect(followRepo.follow).not.toHaveBeenCalled();
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });

  // --- 3. Favorite flow ---
  describe('Favorite flow', () => {
    it('should favorite → check status (isFavorited=true) → get favorites → unfavorite → check status (isFavorited=false)', async () => {
      // Step 1: Favorite character
      const fakeFav = { id: 'fav-1', userId: 'user-1', characterId: 'char-1' };
      favoriteRepo.favorite.mockResolvedValue(fakeFav);

      const favResult = await service.favoriteCharacter('user-1', 'char-1');
      expect(favResult).toEqual(fakeFav);
      expect(favoriteRepo.favorite).toHaveBeenCalledWith('user-1', 'char-1');

      // Step 2: Check favorite status shows isFavorited=true
      favoriteRepo.isFavorited.mockResolvedValue(true);
      favoriteRepo.getFavoriteCount.mockResolvedValue(1);

      const statusAfterFav = await service.getFavoriteStatus('user-1', 'char-1');
      expect(statusAfterFav.isFavorited).toBe(true);
      expect(statusAfterFav.favoriteCount).toBe(1);

      // Step 3: Get user favorites includes the character
      favoriteRepo.getFavoritesByUser.mockResolvedValue([
        { id: 'fav-1', userId: 'user-1', characterId: 'char-1' },
      ]);

      const favorites = await service.getUserFavorites('user-1', 20, 0);
      expect(favorites).toHaveLength(1);
      expect(favorites[0].characterId).toBe('char-1');

      // Step 4: Unfavorite character
      favoriteRepo.unfavorite.mockResolvedValue(true);

      const unfavResult = await service.unfavoriteCharacter('user-1', 'char-1');
      expect(unfavResult).toBe(true);

      // Step 5: Check favorite status shows isFavorited=false
      favoriteRepo.isFavorited.mockResolvedValue(false);
      favoriteRepo.getFavoriteCount.mockResolvedValue(0);

      const statusAfterUnfav = await service.getFavoriteStatus('user-1', 'char-1');
      expect(statusAfterUnfav.isFavorited).toBe(false);
      expect(statusAfterUnfav.favoriteCount).toBe(0);
    });
  });

  // --- 4. Comment flow ---
  describe('Comment flow', () => {
    it('should create comment → create reply → list comments → update comment → delete comment', async () => {
      // Step 1: Create a top-level comment
      const fakeComment = { id: 'c-1', userId: 'user-1', characterId: 'char-1', content: 'Great character!', parentId: null };
      commentRepo.createComment.mockResolvedValue(fakeComment);

      const comment = await service.createComment('user-1', 'char-1', 'Great character!');
      expect(comment).toEqual(fakeComment);
      expect(commentRepo.createComment).toHaveBeenCalledWith('user-1', 'char-1', 'Great character!', undefined);

      // Step 2: Create a reply to the comment
      const fakeReply = { id: 'c-2', userId: 'user-2', characterId: 'char-1', content: 'I agree!', parentId: 'c-1' };
      commentRepo.createComment.mockResolvedValue(fakeReply);

      const reply = await service.createComment('user-2', 'char-1', 'I agree!', 'c-1');
      expect(reply).toEqual(fakeReply);
      expect(commentRepo.createComment).toHaveBeenCalledWith('user-2', 'char-1', 'I agree!', 'c-1');

      // Step 3: List comments returns both
      commentRepo.getCommentsByCharacter.mockResolvedValue([fakeComment, fakeReply]);

      const comments = await service.getComments('char-1', 20, 0, 'newest');
      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe('c-1');
      expect(comments[1].id).toBe('c-2');

      // Step 4: Update the original comment
      const updatedComment = { ...fakeComment, content: 'Updated: Great character!' };
      commentRepo.updateComment.mockResolvedValue(updatedComment);

      const updated = await service.updateComment('c-1', 'user-1', 'Updated: Great character!');
      expect(updated.content).toBe('Updated: Great character!');
      expect(commentRepo.updateComment).toHaveBeenCalledWith('c-1', 'user-1', 'Updated: Great character!');

      // Step 5: Delete the comment
      commentRepo.deleteComment.mockResolvedValue(true);

      await expect(service.deleteComment('c-1', 'user-1')).resolves.toBeUndefined();
      expect(commentRepo.deleteComment).toHaveBeenCalledWith('c-1', 'user-1');
    });
  });

  // --- 5. Comment errors ---
  describe('Comment errors', () => {
    it('should throw NotFoundError when updating a non-existent comment', async () => {
      commentRepo.updateComment.mockResolvedValue(null);

      await expect(service.updateComment('c-999', 'user-1', 'Updated')).rejects.toThrow(NotFoundError);
      await expect(service.updateComment('c-999', 'user-1', 'Updated')).rejects.toThrow('Comment not found');
    });

    it('should throw NotFoundError when deleting a non-existent comment', async () => {
      commentRepo.deleteComment.mockResolvedValue(false);

      await expect(service.deleteComment('c-999', 'user-1')).rejects.toThrow(NotFoundError);
      await expect(service.deleteComment('c-999', 'user-1')).rejects.toThrow('Comment not found');
    });
  });

  // --- 6. Notification flow ---
  describe('Notification flow', () => {
    it('should create a notification with correct type/actorId/targetId when following a user', async () => {
      const fakeFollow = { id: 'f-1', followerId: 'user-1', followingId: 'user-2' };
      followRepo.follow.mockResolvedValue(fakeFollow);

      await service.followUser('user-1', 'user-2');

      // Verify notification was created via notificationService.notify
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          type: 'follow',
          actorId: 'user-1',
          targetType: 'user',
          targetId: 'user-1',
          message: 'started following you',
        }),
      );
    });

    it('should not create a notification when self-follow is attempted', async () => {
      await expect(service.followUser('user-1', 'user-1')).rejects.toThrow(BadRequestError);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });

  // --- 7. Event emission ---
  describe('Event emission', () => {
    it('should emit "social.follow" event when following a user', async () => {
      followRepo.follow.mockResolvedValue({ id: 'f-1' });
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.followUser('user-1', 'user-2');

      expect(emitSpy).toHaveBeenCalledWith('social.follow', {
        followerId: 'user-1',
        followingId: 'user-2',
      });
    });

    it('should emit "social.favorite" event when favoriting a character', async () => {
      favoriteRepo.favorite.mockResolvedValue({ id: 'fav-1' });
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.favoriteCharacter('user-1', 'char-1');

      expect(emitSpy).toHaveBeenCalledWith('social.favorite', {
        userId: 'user-1',
        characterId: 'char-1',
      });
    });

    it('should emit "social.comment" event when creating a comment', async () => {
      const fakeComment = { id: 'c-1', userId: 'user-1', characterId: 'char-1', content: 'Nice!' };
      commentRepo.createComment.mockResolvedValue(fakeComment);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.createComment('user-1', 'char-1', 'Nice!');

      expect(emitSpy).toHaveBeenCalledWith('social.comment', {
        userId: 'user-1',
        characterId: 'char-1',
        commentId: 'c-1',
        parentId: undefined,
      });
    });

    it('should emit "social.comment" event with parentId when creating a reply', async () => {
      const fakeReply = { id: 'c-2', userId: 'user-1', characterId: 'char-1', content: 'Reply' };
      commentRepo.createComment.mockResolvedValue(fakeReply);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.createComment('user-1', 'char-1', 'Reply', 'c-1');

      expect(emitSpy).toHaveBeenCalledWith('social.comment', {
        userId: 'user-1',
        characterId: 'char-1',
        commentId: 'c-2',
        parentId: 'c-1',
      });
    });

    it('should emit "social.unfollow" event when unfollowing a user', async () => {
      followRepo.unfollow.mockResolvedValue(true);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.unfollowUser('user-1', 'user-2');

      expect(emitSpy).toHaveBeenCalledWith('social.unfollow', {
        followerId: 'user-1',
        followingId: 'user-2',
      });
    });

    it('should emit "social.unfavorite" event when unfavoriting a character', async () => {
      favoriteRepo.unfavorite.mockResolvedValue(true);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      await service.unfavoriteCharacter('user-1', 'char-1');

      expect(emitSpy).toHaveBeenCalledWith('social.unfavorite', {
        userId: 'user-1',
        characterId: 'char-1',
      });
    });
  });
});
