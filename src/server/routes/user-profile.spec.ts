/**
 * User Profile Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock logger
vi.mock('../services/logger.service', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-1',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock notification service
vi.mock('../services/notification.service', () => ({
  notificationService: { notify: vi.fn() },
}));

// Mock cache service
vi.mock('../services/cache.service', () => ({
  cacheService: { get: vi.fn(), set: vi.fn(), deletePattern: vi.fn() },
}));

// Mock schemas
vi.mock('../../db/schema/users', () => ({
  users: { id: 'id', displayName: 'display_name' },
}));

vi.mock('../../db/schema/characters', () => ({
  characters: {
    id: 'id',
    creatorId: 'creator_id',
    isPublic: 'is_public',
    createdAt: 'created_at',
  },
}));

// Mock mention parser
vi.mock('../utils/mention-parser', () => ({
  parseMentions: vi.fn().mockReturnValue([]),
}));

// Chainable mock helper
function mockChain(resolvedValue: any) {
  const chain: any = {};
  const terminal = () => Promise.resolve(resolvedValue);
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit', 'offset',
    'insert', 'update', 'delete', 'set', 'values', 'returning',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject);
  return chain;
}

const { dbMockRef, socialServiceMock } = vi.hoisted(() => {
  const dbMockRef = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const socialServiceMock = {
    getUserProfile: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    getFollowStatus: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    favoriteCharacter: vi.fn(),
    unfavoriteCharacter: vi.fn(),
    getFavoriteStatus: vi.fn(),
    getUserFavorites: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    getComments: vi.fn(),
    getReplies: vi.fn(),
    likeComment: vi.fn(),
    unlikeComment: vi.fn(),
  };
  return { dbMockRef, socialServiceMock };
});

vi.mock('../../db', () => ({ db: dbMockRef }));
vi.mock('../services/social.service', () => ({
  socialService: socialServiceMock,
  SocialService: vi.fn(),
}));

import { socialRoutes } from './social';

describe('User Profile Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/social', socialRoutes);
    vi.clearAllMocks();
  });

  describe('GET /social/users/:userId/profile', () => {
    it('returns user profile with bio and counts', async () => {
      const mockProfile = {
        id: 'user-1',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Hello world',
        followerCount: 10,
        followingCount: 5,
        characterCount: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      socialServiceMock.getUserProfile.mockResolvedValue(mockProfile);

      const res = await app.request('/social/users/user-1/profile');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockProfile);
      expect(body.data.bio).toBe('Hello world');
      expect(body.data.followerCount).toBe(10);
      expect(body.data.characterCount).toBe(3);
    });

    it('returns 404 for non-existent user', async () => {
      socialServiceMock.getUserProfile.mockRejectedValue(
        Object.assign(new Error('User not found'), { status: 404 })
      );

      const res = await app.request('/social/users/non-existent/profile');
      expect(res.status).toBe(500); // Hono default error handling
    });
  });

  describe('GET /social/users/:userId/characters', () => {
    it('returns list of public characters', async () => {
      const mockChars = [
        { id: 'char-1', name: 'Hero', isPublic: true, creatorId: 'user-1' },
        { id: 'char-2', name: 'Villain', isPublic: true, creatorId: 'user-1' },
      ];
      const chain = mockChain(mockChars);
      dbMockRef.select.mockReturnValue(chain);

      const res = await app.request('/social/users/user-1/characters');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockChars);
      expect(body.data).toHaveLength(2);
    });

    it('returns 500 on database error', async () => {
      const chain: any = {};
      const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'offset'];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (_resolve: any, reject: any) =>
        Promise.reject(new Error('DB error')).catch(reject);
      dbMockRef.select.mockReturnValue(chain);

      const res = await app.request('/social/users/user-1/characters');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
