/**
 * 角色路由测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { errorHandler } from '../middleware/error-handler';
import { NotFoundError, ForbiddenError } from '../../core/errors';

vi.mock('../services/character.service');

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

describe('Character Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /api/v1/characters', () => {
    it('should create a new character', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const createData = {
        name: 'Test Character',
        description: 'A test character',
        cardData: { version: 2 },
        tags: ['test'],
        category: 'general',
        isNsfw: false,
      };

      const mockCreatedCharacter = {
        id: 'char-123',
        ...createData,
        tenantId: 'tenant-123',
        creatorId: 'user-123',
        isPublic: false,
        downloadCount: 0,
        viewCount: 0,
        ratingAvg: null,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

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
      vi.mocked(characterService.create).mockResolvedValue(mockCreatedCharacter as any);

      const res = await app.request('/api/v1/characters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid input', async () => {
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

      const res = await app.request('/api/v1/characters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          name: '', // Invalid: empty string
          cardData: {},
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/characters', () => {
    it('should return user characters with pagination', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockResponse = {
        items: [
          {
            id: 'char-1',
            name: 'Character 1',
            tenantId: 'tenant-123',
            creatorId: 'user-123',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

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
      vi.mocked(characterService.getByTenantId).mockResolvedValue(mockResponse as any);

      const res = await app.request('/api/v1/characters?page=1&limit=20', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/v1/characters/:id', () => {
    it('should return character by id', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockCharacter = {
        id: 'char-123',
        name: 'Test Character',
        tenantId: 'tenant-123',
        creatorId: 'user-123',
      };

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
      vi.mocked(characterService.getById).mockResolvedValue(mockCharacter as any);

      const res = await app.request('/api/v1/characters/char-123', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if character not found', async () => {
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
      vi.mocked(characterService.getById).mockRejectedValue(new NotFoundError('Character'));

      const res = await app.request('/api/v1/characters/non-existent', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/characters/:id', () => {
    it('should update character', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const updateData = { name: 'Updated Name' };
      const mockUpdatedCharacter = {
        id: 'char-123',
        ...updateData,
        tenantId: 'tenant-123',
        creatorId: 'user-123',
      };

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
      vi.mocked(characterService.update).mockResolvedValue(mockUpdatedCharacter as any);

      const res = await app.request('/api/v1/characters/char-123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 403 if user is not creator', async () => {
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
      vi.mocked(characterService.update).mockRejectedValue(
        new ForbiddenError('Only creator can update this character')
      );

      const res = await app.request('/api/v1/characters/char-123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/characters/:id', () => {
    it('should delete character', async () => {
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
      vi.mocked(characterService.delete).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/characters/char-123', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 403 if user is not creator', async () => {
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
      vi.mocked(characterService.delete).mockRejectedValue(
        new ForbiddenError('Only creator can delete this character')
      );

      const res = await app.request('/api/v1/characters/char-123', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/characters/:id/publish', () => {
    it('should publish character', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockPublishedCharacter = {
        id: 'char-123',
        name: 'Test Character',
        isPublic: true,
        tenantId: 'tenant-123',
        creatorId: 'user-123',
      };

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
      vi.mocked(characterService.publish).mockResolvedValue(mockPublishedCharacter as any);

      const res = await app.request('/api/v1/characters/char-123/publish', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/v1/characters/:id/unpublish', () => {
    it('should unpublish character', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockUnpublishedCharacter = {
        id: 'char-123',
        name: 'Test Character',
        isPublic: false,
        tenantId: 'tenant-123',
        creatorId: 'user-123',
      };

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
      vi.mocked(characterService.unpublish).mockResolvedValue(mockUnpublishedCharacter as any);

      const res = await app.request('/api/v1/characters/char-123/unpublish', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/v1/characters/marketplace', () => {
    it('should return public characters', async () => {
      const mockResponse = {
        items: [
          {
            id: 'char-1',
            name: 'Public Character',
            isPublic: true,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(characterService.getPublicCharacters).mockResolvedValue(mockResponse as any);

      const res = await app.request('/api/v1/characters/marketplace?page=1&limit=20');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/v1/characters/:id/fork', () => {
    it('should fork public character', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockForkedCharacter = {
        id: 'char-456',
        name: 'Original Character',
        tenantId: 'tenant-456',
        creatorId: 'user-456',
        isPublic: false,
      };

      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: 'user-456',
        tenantId: 'tenant-456',
        email: 'test2@example.com',
      });
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-456',
        tenantId: 'tenant-456',
        email: 'test2@example.com',
        isActive: true,
      } as any);
      vi.mocked(characterService.fork).mockResolvedValue(mockForkedCharacter as any);

      const res = await app.request('/api/v1/characters/char-123/fork', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if character is not public', async () => {
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
      vi.mocked(characterService.fork).mockRejectedValue(new NotFoundError('Public character'));

      const res = await app.request('/api/v1/characters/char-123/fork', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/characters/:id/ratings', () => {
    it('should submit rating', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

      const ratingData = {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

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
      vi.spyOn(ratingService, 'submitRating').mockResolvedValue(undefined);

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(ratingData),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid rating values', async () => {
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

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          quality: 6, // Invalid: > 5
          creativity: 4,
          interactivity: 4,
          accuracy: 4,
          entertainment: 5,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/characters/:id/ratings', () => {
    it('should get ratings with user rating', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

      const mockRatings = {
        overall: '4.20',
        dimensions: {
          quality: '4.50',
          creativity: '4.00',
          interactivity: '4.30',
          accuracy: '4.10',
          entertainment: '4.20',
        },
        count: 10,
        userRating: {
          quality: 5,
          creativity: 4,
          interactivity: 4,
          accuracy: 4,
          entertainment: 5,
        },
      };

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
      vi.spyOn(ratingService, 'getRatings').mockResolvedValue(mockRatings);

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.overall).toBe('4.20');
    });

    it('should get ratings without user rating when not authenticated', async () => {
      const { ratingService } = await import('../services/rating.service');

      const mockRatings = {
        overall: '4.20',
        dimensions: {
          quality: '4.50',
          creativity: '4.00',
          interactivity: '4.30',
          accuracy: '4.10',
          entertainment: '4.20',
        },
        count: 10,
        userRating: null,
      };

      vi.spyOn(ratingService, 'getRatings').mockResolvedValue(mockRatings);

      const res = await app.request('/api/v1/characters/char-123/ratings');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.userRating).toBeNull();
    });
  });

  describe('PUT /api/v1/characters/:id/ratings', () => {
    it('should update rating', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

      const ratingData = {
        quality: 3,
        creativity: 3,
        interactivity: 3,
        accuracy: 3,
        entertainment: 3,
      };

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
      vi.spyOn(ratingService, 'updateRating').mockResolvedValue(undefined);

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(ratingData),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if rating not found', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

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
      vi.spyOn(ratingService, 'updateRating').mockRejectedValue(new NotFoundError('Rating not found'));

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          quality: 3,
          creativity: 3,
          interactivity: 3,
          accuracy: 3,
          entertainment: 3,
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/characters/:id/ratings', () => {
    it('should delete rating', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

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
      vi.spyOn(ratingService, 'deleteRating').mockResolvedValue(undefined);

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if rating not found', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { ratingService } = await import('../services/rating.service');

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
      vi.spyOn(ratingService, 'deleteRating').mockRejectedValue(new NotFoundError('Rating not found'));

      const res = await app.request('/api/v1/characters/char-123/ratings', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });
});
