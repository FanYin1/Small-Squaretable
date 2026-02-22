/**
 * CharacterVersionService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockCreate, mockGetLatestVersion, mockListByCharacter, mockGetByVersion } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({});
  const mockGetLatestVersion = vi.fn().mockResolvedValue(0);
  const mockListByCharacter = vi.fn().mockResolvedValue([]);
  const mockGetByVersion = vi.fn().mockResolvedValue(undefined);
  return { mockCreate, mockGetLatestVersion, mockListByCharacter, mockGetByVersion };
});

vi.mock('../../db/repositories/character-version.repository', () => ({
  characterVersionRepository: {
    create: mockCreate,
    getLatestVersion: mockGetLatestVersion,
    listByCharacter: mockListByCharacter,
    getByVersion: mockGetByVersion,
  },
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { CharacterVersionService } from './character-version.service';

describe('CharacterVersionService', () => {
  let service: CharacterVersionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CharacterVersionService();
  });

  describe('saveVersion', () => {
    it('should save a new version with incremented version number', async () => {
      mockGetLatestVersion.mockResolvedValueOnce(2);
      const fakeVersion = { id: 'v-1', characterId: 'char-1', version: 3 };
      mockCreate.mockResolvedValueOnce(fakeVersion);

      const result = await service.saveVersion(
        'char-1',
        { name: 'Test', description: 'A character' },
        'user-1',
        'Manual save',
      );

      expect(mockGetLatestVersion).toHaveBeenCalledWith('char-1');
      expect(mockCreate).toHaveBeenCalledWith({
        characterId: 'char-1',
        version: 3,
        cardData: { name: 'Test', description: 'A character' },
        changeNote: 'Manual save',
        createdBy: 'user-1',
      });
      expect(result).toEqual(fakeVersion);
    });

    it('should default changeNote to null when not provided', async () => {
      mockGetLatestVersion.mockResolvedValueOnce(0);
      mockCreate.mockResolvedValueOnce({ id: 'v-2', version: 1 });

      await service.saveVersion('char-2', { name: 'New' }, 'user-1');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ changeNote: null, version: 1 }),
      );
    });
  });

  describe('listVersions', () => {
    it('should list versions for a character', async () => {
      const fakeVersions = [{ id: 'v-3', version: 2 }, { id: 'v-4', version: 1 }];
      mockListByCharacter.mockResolvedValueOnce(fakeVersions);

      const result = await service.listVersions('char-1', 10, 5);

      expect(mockListByCharacter).toHaveBeenCalledWith('char-1', 10, 5);
      expect(result).toEqual(fakeVersions);
    });

    it('should use default limit and offset', async () => {
      await service.listVersions('char-1');

      expect(mockListByCharacter).toHaveBeenCalledWith('char-1', 20, 0);
    });
  });

  describe('getVersion', () => {
    it('should get a specific version', async () => {
      const fakeVersion = { id: 'v-5', characterId: 'char-1', version: 3 };
      mockGetByVersion.mockResolvedValueOnce(fakeVersion);

      const result = await service.getVersion('char-1', 3);

      expect(mockGetByVersion).toHaveBeenCalledWith('char-1', 3);
      expect(result).toEqual(fakeVersion);
    });
  });
});
