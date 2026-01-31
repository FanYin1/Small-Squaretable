/**
 * 角色服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterService } from './character.service';
import { characterRepository } from '../../db/repositories/character.repository';
import { NotFoundError, ForbiddenError } from '../../core/errors';

vi.mock('../../db/repositories/character.repository');

describe('CharacterService', () => {
  let characterService: CharacterService;

  beforeEach(() => {
    characterService = new CharacterService(characterRepository);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new character', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
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
        tenantId,
        creatorId: userId,
        isPublic: false,
        downloadCount: 0,
        viewCount: 0,
        ratingAvg: null,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(characterRepository.create).mockResolvedValue(mockCreatedCharacter as any);

      const result = await characterService.create(userId, tenantId, createData);

      expect(result).toEqual(mockCreatedCharacter);
      expect(characterRepository.create).toHaveBeenCalledWith({
        ...createData,
        tenantId,
        creatorId: userId,
      });
    });
  });

  describe('getById', () => {
    it('should return character by id', async () => {
      const mockCharacter = {
        id: 'char-123',
        name: 'Test Character',
        tenantId: 'tenant-123',
        creatorId: 'user-123',
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);

      const result = await characterService.getById('char-123');

      expect(result).toEqual(mockCharacter);
    });

    it('should throw NotFoundError if character does not exist', async () => {
      vi.mocked(characterRepository.findById).mockResolvedValue(null);

      await expect(characterService.getById('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('should update character if user is creator', async () => {
      const characterId = 'char-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const updateData = { name: 'Updated Name' };

      const mockCharacter = {
        id: characterId,
        name: 'Test Character',
        tenantId,
        creatorId: userId,
      };

      const mockUpdatedCharacter = {
        ...mockCharacter,
        ...updateData,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);
      vi.mocked(characterRepository.update).mockResolvedValue(mockUpdatedCharacter as any);

      const result = await characterService.update(characterId, userId, tenantId, updateData);

      expect(result).toEqual(mockUpdatedCharacter);
    });

    it('should throw ForbiddenError if user is not creator', async () => {
      const mockCharacter = {
        id: 'char-123',
        tenantId: 'tenant-123',
        creatorId: 'other-user',
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);

      await expect(
        characterService.update('char-123', 'user-123', 'tenant-123', { name: 'New Name' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if character does not exist', async () => {
      vi.mocked(characterRepository.findById).mockResolvedValue(null);

      await expect(
        characterService.update('non-existent', 'user-123', 'tenant-123', { name: 'New Name' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete character if user is creator', async () => {
      const characterId = 'char-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockCharacter = {
        id: characterId,
        tenantId,
        creatorId: userId,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);
      vi.mocked(characterRepository.delete).mockResolvedValue(true);

      await characterService.delete(characterId, userId, tenantId);

      expect(characterRepository.delete).toHaveBeenCalledWith(characterId, tenantId);
    });

    it('should throw ForbiddenError if user is not creator', async () => {
      const mockCharacter = {
        id: 'char-123',
        tenantId: 'tenant-123',
        creatorId: 'other-user',
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);

      await expect(
        characterService.delete('char-123', 'user-123', 'tenant-123')
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('publish', () => {
    it('should publish character if user is creator', async () => {
      const characterId = 'char-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockCharacter = {
        id: characterId,
        tenantId,
        creatorId: userId,
        isPublic: false,
      };

      const mockPublishedCharacter = {
        ...mockCharacter,
        isPublic: true,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);
      vi.mocked(characterRepository.update).mockResolvedValue(mockPublishedCharacter as any);

      const result = await characterService.publish(characterId, userId, tenantId);

      expect(result).toEqual(mockPublishedCharacter);
      expect(characterRepository.update).toHaveBeenCalledWith(characterId, tenantId, {
        isPublic: true,
      });
    });

    it('should throw ForbiddenError if user is not creator', async () => {
      const mockCharacter = {
        id: 'char-123',
        tenantId: 'tenant-123',
        creatorId: 'other-user',
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);

      await expect(
        characterService.publish('char-123', 'user-123', 'tenant-123')
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('unpublish', () => {
    it('should unpublish character if user is creator', async () => {
      const characterId = 'char-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockCharacter = {
        id: characterId,
        tenantId,
        creatorId: userId,
        isPublic: true,
      };

      const mockUnpublishedCharacter = {
        ...mockCharacter,
        isPublic: false,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);
      vi.mocked(characterRepository.update).mockResolvedValue(mockUnpublishedCharacter as any);

      const result = await characterService.unpublish(characterId, userId, tenantId);

      expect(result).toEqual(mockUnpublishedCharacter);
    });
  });

  describe('fork', () => {
    it('should fork public character to new tenant', async () => {
      const sourceId = 'char-123';
      const userId = 'user-456';
      const tenantId = 'tenant-456';

      const mockSourceCharacter = {
        id: sourceId,
        name: 'Original Character',
        tenantId: 'tenant-123',
        creatorId: 'user-123',
        isPublic: true,
        downloadCount: 5,
        viewCount: 10,
        ratingAvg: null,
        ratingCount: 0,
        ratingQualityAvg: '4.50',
        ratingCreativityAvg: '4.00',
        ratingInteractivityAvg: '4.30',
        ratingAccuracyAvg: '4.10',
        ratingEntertainmentAvg: '4.20',
        ratingOverallAvg: '4.22',
      };

      const mockForkedCharacter = {
        id: 'char-456',
        ...mockSourceCharacter,
        tenantId,
        creatorId: userId,
        isPublic: false,
        downloadCount: 0,
        viewCount: 0,
        ratingAvg: null,
        ratingCount: 0,
        ratingQualityAvg: null,
        ratingCreativityAvg: null,
        ratingInteractivityAvg: null,
        ratingAccuracyAvg: null,
        ratingEntertainmentAvg: null,
        ratingOverallAvg: null,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockSourceCharacter as any);
      vi.mocked(characterRepository.incrementDownloadCount).mockResolvedValue(undefined);
      vi.mocked(characterRepository.create).mockResolvedValue(mockForkedCharacter as any);

      const result = await characterService.fork(sourceId, userId, tenantId);

      expect(result).toEqual(mockForkedCharacter);
      expect(characterRepository.incrementDownloadCount).toHaveBeenCalledWith(sourceId);
      // Verify that rating stats are reset in forked character
      expect(result.ratingQualityAvg).toBeNull();
      expect(result.ratingOverallAvg).toBeNull();
      expect(result.ratingCount).toBe(0);
    });

    it('should throw NotFoundError if source character is not public', async () => {
      const mockCharacter = {
        id: 'char-123',
        isPublic: false,
      };

      vi.mocked(characterRepository.findById).mockResolvedValue(mockCharacter as any);

      await expect(
        characterService.fork('char-123', 'user-456', 'tenant-456')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPublicCharacters', () => {
    it('should return public characters with pagination', async () => {
      const mockCharacters = [
        {
          id: 'char-1',
          name: 'Public Character 1',
          isPublic: true,
        },
        {
          id: 'char-2',
          name: 'Public Character 2',
          isPublic: true,
        },
      ];

      vi.mocked(characterRepository.findPublic).mockResolvedValue(mockCharacters as any);
      vi.mocked(characterRepository.countPublic).mockResolvedValue(2);

      const result = await characterService.getPublicCharacters({ page: 1, limit: 20 });

      expect(result.items).toEqual(mockCharacters);
      expect(result.pagination.total).toBe(2);
    });
  });
});
