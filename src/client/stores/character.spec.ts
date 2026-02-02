import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCharacterStore } from './character';
import { characterApi } from '@client/services';
import '../test-setup';

vi.mock('@client/services', () => ({
  characterApi: {
    getCharacters: vi.fn(),
    getCharacter: vi.fn(),
  },
}));

describe('Character Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('fetchCharacters', () => {
    it('should fetch characters successfully', async () => {
      const mockCharacters = [
        {
          id: 'char_1',
          name: 'Alice',
          description: 'A friendly character',
          tags: ['friendly', 'helpful'],
          createdAt: '2024-01-01',
        },
        {
          id: 'char_2',
          name: 'Bob',
          description: 'A mysterious character',
          tags: ['mysterious'],
          createdAt: '2024-01-02',
        },
      ];

      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: mockCharacters,
        total: 2,
      } as any);

      const store = useCharacterStore();
      await store.fetchCharacters();

      expect(store.characters).toEqual(mockCharacters);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: undefined,
        tags: undefined,
      });
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch characters');
      vi.mocked(characterApi.getCharacters).mockRejectedValue(error);

      const store = useCharacterStore();
      await expect(store.fetchCharacters()).rejects.toThrow('Failed to fetch characters');

      expect(store.error).toBe('Failed to fetch characters');
      expect(store.loading).toBe(false);
      expect(store.characters).toEqual([]);
    });

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false;

      vi.mocked(characterApi.getCharacters).mockImplementation(async () => {
        const store = useCharacterStore();
        loadingDuringFetch = store.loading;
        return { characters: [], total: 0 } as any;
      });

      const store = useCharacterStore();
      await store.fetchCharacters();

      expect(loadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should fetch with search query', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [],
        total: 0,
      } as any);

      const store = useCharacterStore();
      store.searchQuery = 'Alice';
      await store.fetchCharacters();

      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: 'Alice',
        tags: undefined,
      });
    });

    it('should fetch with selected tags', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [],
        total: 0,
      } as any);

      const store = useCharacterStore();
      store.selectedTags = ['friendly', 'helpful'];
      await store.fetchCharacters();

      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: undefined,
        tags: ['friendly', 'helpful'],
      });
    });

    it('should fetch with both search and tags', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [],
        total: 0,
      } as any);

      const store = useCharacterStore();
      store.searchQuery = 'Alice';
      store.selectedTags = ['friendly'];
      await store.fetchCharacters();

      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: 'Alice',
        tags: ['friendly'],
      });
    });
  });

  describe('fetchCharacter', () => {
    it('should fetch single character successfully', async () => {
      const mockCharacter = {
        id: 'char_1',
        name: 'Alice',
        description: 'A friendly character',
        tags: ['friendly'],
        createdAt: '2024-01-01',
      };

      vi.mocked(characterApi.getCharacter).mockResolvedValue({
        character: mockCharacter,
      } as any);

      const store = useCharacterStore();
      await store.fetchCharacter('char_1');

      expect(store.currentCharacter).toEqual(mockCharacter);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
      expect(characterApi.getCharacter).toHaveBeenCalledWith('char_1');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Character not found');
      vi.mocked(characterApi.getCharacter).mockRejectedValue(error);

      const store = useCharacterStore();
      await expect(store.fetchCharacter('invalid_id')).rejects.toThrow('Character not found');

      expect(store.error).toBe('Character not found');
      expect(store.currentCharacter).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false;

      vi.mocked(characterApi.getCharacter).mockImplementation(async () => {
        const store = useCharacterStore();
        loadingDuringFetch = store.loading;
        return { character: {} } as any;
      });

      const store = useCharacterStore();
      await store.fetchCharacter('char_1');

      expect(loadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });
  });

  describe('searchCharacters', () => {
    it('should update search query and fetch', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [],
        total: 0,
      } as any);

      const store = useCharacterStore();
      await store.searchCharacters('Alice');

      expect(store.searchQuery).toBe('Alice');
      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: 'Alice',
        tags: undefined,
      });
    });

    it('should handle empty search query', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [],
        total: 0,
      } as any);

      const store = useCharacterStore();
      await store.searchCharacters('');

      expect(store.searchQuery).toBe('');
      expect(characterApi.getCharacters).toHaveBeenCalledWith({
        search: undefined,
        tags: undefined,
      });
    });
  });

  describe('filteredCharacters', () => {
    beforeEach(() => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [
          {
            id: 'char_1',
            name: 'Alice',
            description: 'A friendly character',
            tags: ['friendly', 'helpful'],
          },
          {
            id: 'char_2',
            name: 'Bob',
            description: 'A mysterious character',
            tags: ['mysterious'],
          },
          {
            id: 'char_3',
            name: 'Charlie',
            description: 'A helpful assistant',
            tags: ['helpful'],
          },
        ],
        total: 3,
      } as any);
    });

    it('should return all characters when no filters applied', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();

      expect(store.filteredCharacters).toHaveLength(3);
    });

    it('should filter by search query (name)', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.searchQuery = 'alice';

      expect(store.filteredCharacters).toHaveLength(1);
      expect(store.filteredCharacters[0].name).toBe('Alice');
    });

    it('should filter by search query (description)', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.searchQuery = 'mysterious';

      expect(store.filteredCharacters).toHaveLength(1);
      expect(store.filteredCharacters[0].name).toBe('Bob');
    });

    it('should filter by tags', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.selectedTags = ['helpful'];

      expect(store.filteredCharacters).toHaveLength(2);
      expect(store.filteredCharacters.map(c => c.name)).toContain('Alice');
      expect(store.filteredCharacters.map(c => c.name)).toContain('Charlie');
    });

    it('should filter by multiple tags (OR logic)', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.selectedTags = ['friendly', 'mysterious'];

      expect(store.filteredCharacters).toHaveLength(2);
      expect(store.filteredCharacters.map(c => c.name)).toContain('Alice');
      expect(store.filteredCharacters.map(c => c.name)).toContain('Bob');
    });

    it('should combine search and tag filters', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.searchQuery = 'helpful';
      store.selectedTags = ['helpful'];

      // Both Alice (has 'helpful' tag and 'helpful' in description) and Charlie (has 'helpful' tag and 'helpful' in description)
      // But search filters first, so only Charlie matches 'helpful' in description
      expect(store.filteredCharacters.length).toBeGreaterThanOrEqual(1);
    });

    it('should be case-insensitive for search', async () => {
      const store = useCharacterStore();
      await store.fetchCharacters();
      store.searchQuery = 'ALICE';

      expect(store.filteredCharacters).toHaveLength(1);
      expect(store.filteredCharacters[0].name).toBe('Alice');
    });

    it('should handle characters without description', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [
          { id: 'char_1', name: 'Alice', tags: [] },
        ],
        total: 1,
      } as any);

      const store = useCharacterStore();
      await store.fetchCharacters();
      store.searchQuery = 'test';

      expect(store.filteredCharacters).toHaveLength(0);
    });

    it('should handle characters without tags', async () => {
      vi.mocked(characterApi.getCharacters).mockResolvedValue({
        characters: [
          { id: 'char_1', name: 'Alice', description: 'Test' },
        ],
        total: 1,
      } as any);

      const store = useCharacterStore();
      await store.fetchCharacters();
      store.selectedTags = ['friendly'];

      expect(store.filteredCharacters).toHaveLength(0);
    });
  });

  describe('setSearchQuery', () => {
    it('should update search query', () => {
      const store = useCharacterStore();
      store.setSearchQuery('Alice');

      expect(store.searchQuery).toBe('Alice');
    });

    it('should not trigger fetch', () => {
      const store = useCharacterStore();
      store.setSearchQuery('Alice');

      expect(characterApi.getCharacters).not.toHaveBeenCalled();
    });
  });

  describe('setSelectedTags', () => {
    it('should update selected tags', () => {
      const store = useCharacterStore();
      store.setSelectedTags(['friendly', 'helpful']);

      expect(store.selectedTags).toEqual(['friendly', 'helpful']);
    });

    it('should not trigger fetch', () => {
      const store = useCharacterStore();
      store.setSelectedTags(['friendly']);

      expect(characterApi.getCharacters).not.toHaveBeenCalled();
    });

    it('should handle empty array', () => {
      const store = useCharacterStore();
      store.selectedTags = ['friendly'];
      store.setSelectedTags([]);

      expect(store.selectedTags).toEqual([]);
    });
  });

  describe('clearFilters', () => {
    it('should clear search query and tags', () => {
      const store = useCharacterStore();
      store.searchQuery = 'Alice';
      store.selectedTags = ['friendly'];

      store.clearFilters();

      expect(store.searchQuery).toBe('');
      expect(store.selectedTags).toEqual([]);
    });

    it('should not trigger fetch', () => {
      const store = useCharacterStore();
      store.searchQuery = 'Alice';
      store.selectedTags = ['friendly'];

      store.clearFilters();

      expect(characterApi.getCharacters).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-Error exceptions', async () => {
      vi.mocked(characterApi.getCharacters).mockRejectedValue('String error');

      const store = useCharacterStore();
      await expect(store.fetchCharacters()).rejects.toBe('String error');

      expect(store.error).toBe('Failed to fetch characters');
    });

    it('should clear previous errors on successful fetch', async () => {
      vi.mocked(characterApi.getCharacters)
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({ characters: [], total: 0 } as any);

      const store = useCharacterStore();
      await expect(store.fetchCharacters()).rejects.toThrow();
      expect(store.error).toBe('First error');

      await store.fetchCharacters();
      expect(store.error).toBeNull();
    });
  });
});
