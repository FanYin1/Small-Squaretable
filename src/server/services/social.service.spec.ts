/**
 * SocialService unit tests
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

describe('SocialService', () => {
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

  // --- Follow ---
  describe('followUser', () => {
    it('should call followRepo.follow, emit event, and create notification', async () => {
      const fakeFollow = { id: 'f-1', followerId: 'user-1', followingId: 'user-2' };
      followRepo.follow.mockResolvedValue(fakeFollow);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.followUser('user-1', 'user-2');

      expect(followRepo.follow).toHaveBeenCalledWith('user-1', 'user-2');
      expect(emitSpy).toHaveBeenCalledWith('social.follow', { followerId: 'user-1', followingId: 'user-2' });
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2', type: 'follow', actorId: 'user-1' }),
      );
      expect(result).toEqual(fakeFollow);
    });

    it('should throw BadRequestError when following yourself', async () => {
      await expect(service.followUser('user-1', 'user-1')).rejects.toThrow(BadRequestError);
      expect(followRepo.follow).not.toHaveBeenCalled();
    });
  });

  describe('unfollowUser', () => {
    it('should call followRepo.unfollow and emit event when successful', async () => {
      followRepo.unfollow.mockResolvedValue(true);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.unfollowUser('user-1', 'user-2');

      expect(followRepo.unfollow).toHaveBeenCalledWith('user-1', 'user-2');
      expect(emitSpy).toHaveBeenCalledWith('social.unfollow', { followerId: 'user-1', followingId: 'user-2' });
      expect(result).toBe(true);
    });

    it('should not emit event when unfollow returns false', async () => {
      followRepo.unfollow.mockResolvedValue(false);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.unfollowUser('user-1', 'user-2');

      expect(followRepo.unfollow).toHaveBeenCalledWith('user-1', 'user-2');
      expect(emitSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('getFollowStatus', () => {
    it('should return combined FollowInfo', async () => {
      followRepo.isFollowing.mockResolvedValue(true);
      followRepo.getFollowCounts.mockResolvedValue({ followerCount: 10, followingCount: 5 });

      const result = await service.getFollowStatus('user-1', 'user-2');

      expect(followRepo.isFollowing).toHaveBeenCalledWith('user-1', 'user-2');
      expect(followRepo.getFollowCounts).toHaveBeenCalledWith('user-2');
      expect(result).toEqual({ isFollowing: true, followerCount: 10, followingCount: 5 });
    });
  });

  // --- Favorite ---
  describe('favoriteCharacter', () => {
    it('should call favoriteRepo.favorite and emit event', async () => {
      const fakeFav = { id: 'fav-1', userId: 'user-1', characterId: 'char-1' };
      favoriteRepo.favorite.mockResolvedValue(fakeFav);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.favoriteCharacter('user-1', 'char-1');

      expect(favoriteRepo.favorite).toHaveBeenCalledWith('user-1', 'char-1');
      expect(emitSpy).toHaveBeenCalledWith('social.favorite', { userId: 'user-1', characterId: 'char-1' });
      expect(result).toEqual(fakeFav);
    });
  });

  describe('unfavoriteCharacter', () => {
    it('should call favoriteRepo.unfavorite and emit event when successful', async () => {
      favoriteRepo.unfavorite.mockResolvedValue(true);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.unfavoriteCharacter('user-1', 'char-1');

      expect(favoriteRepo.unfavorite).toHaveBeenCalledWith('user-1', 'char-1');
      expect(emitSpy).toHaveBeenCalledWith('social.unfavorite', { userId: 'user-1', characterId: 'char-1' });
      expect(result).toBe(true);
    });

    it('should not emit event when unfavorite returns false', async () => {
      favoriteRepo.unfavorite.mockResolvedValue(false);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.unfavoriteCharacter('user-1', 'char-1');

      expect(favoriteRepo.unfavorite).toHaveBeenCalledWith('user-1', 'char-1');
      expect(emitSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('getFavoriteStatus', () => {
    it('should return combined FavoriteInfo', async () => {
      favoriteRepo.isFavorited.mockResolvedValue(true);
      favoriteRepo.getFavoriteCount.mockResolvedValue(42);

      const result = await service.getFavoriteStatus('user-1', 'char-1');

      expect(favoriteRepo.isFavorited).toHaveBeenCalledWith('user-1', 'char-1');
      expect(favoriteRepo.getFavoriteCount).toHaveBeenCalledWith('char-1');
      expect(result).toEqual({ isFavorited: true, favoriteCount: 42 });
    });
  });

  // --- Comment ---
  describe('createComment', () => {
    it('should call commentRepo.createComment and emit event', async () => {
      const fakeComment = { id: 'c-1', userId: 'user-1', characterId: 'char-1', content: 'Great!' };
      commentRepo.createComment.mockResolvedValue(fakeComment);
      const emitSpy = vi.spyOn(eventBus, 'emit');

      const result = await service.createComment('user-1', 'char-1', 'Great!', undefined);

      expect(commentRepo.createComment).toHaveBeenCalledWith('user-1', 'char-1', 'Great!', undefined);
      expect(emitSpy).toHaveBeenCalledWith('social.comment', {
        userId: 'user-1', characterId: 'char-1', commentId: 'c-1', parentId: undefined,
      });
      expect(result).toEqual(fakeComment);
    });

    it('should pass parentId when creating a reply', async () => {
      const fakeReply = { id: 'c-2', userId: 'user-1', characterId: 'char-1', content: 'Reply' };
      commentRepo.createComment.mockResolvedValue(fakeReply);

      await service.createComment('user-1', 'char-1', 'Reply', 'c-1');

      expect(commentRepo.createComment).toHaveBeenCalledWith('user-1', 'char-1', 'Reply', 'c-1');
    });
  });

  describe('updateComment', () => {
    it('should call commentRepo.updateComment and return updated comment', async () => {
      const updated = { id: 'c-1', content: 'Updated!' };
      commentRepo.updateComment.mockResolvedValue(updated);

      const result = await service.updateComment('c-1', 'user-1', 'Updated!');

      expect(commentRepo.updateComment).toHaveBeenCalledWith('c-1', 'user-1', 'Updated!');
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundError when updateComment returns null', async () => {
      commentRepo.updateComment.mockResolvedValue(null);

      await expect(service.updateComment('c-999', 'user-1', 'Updated!')).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteComment', () => {
    it('should call commentRepo.deleteComment', async () => {
      commentRepo.deleteComment.mockResolvedValue(true);

      await expect(service.deleteComment('c-1', 'user-1')).resolves.toBeUndefined();
      expect(commentRepo.deleteComment).toHaveBeenCalledWith('c-1', 'user-1');
    });

    it('should throw NotFoundError when deleteComment returns false', async () => {
      commentRepo.deleteComment.mockResolvedValue(false);

      await expect(service.deleteComment('c-999', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getComments', () => {
    it('should delegate to commentRepo.getCommentsByCharacter', async () => {
      const fakeComments = [{ id: 'c-1' }, { id: 'c-2' }];
      commentRepo.getCommentsByCharacter.mockResolvedValue(fakeComments);

      const result = await service.getComments('char-1', 20, 0, 'newest');

      expect(commentRepo.getCommentsByCharacter).toHaveBeenCalledWith('char-1', 20, 0, 'newest');
      expect(result).toEqual(fakeComments);
    });
  });

  describe('getReplies', () => {
    it('should delegate to commentRepo.getReplies', async () => {
      const fakeReplies = [{ id: 'c-3' }];
      commentRepo.getReplies.mockResolvedValue(fakeReplies);

      const result = await service.getReplies('c-1', 10, 0);

      expect(commentRepo.getReplies).toHaveBeenCalledWith('c-1', 10, 0);
      expect(result).toEqual(fakeReplies);
    });
  });
});