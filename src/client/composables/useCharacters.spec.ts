import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const mockCharacterStore = {
  characters: [],
  filteredCharacters: [],
  currentCharacter: null,
  loading: false,
  error: null,
  fetchCharacters: vi.fn(),
  fetchCharacter: vi.fn(),
  searchCharacters: vi.fn(),
  setSearchQuery: vi.fn(),
  setSelectedTags: vi.fn(),
  clearFilters: vi.fn(),
};

vi.mock('@client/stores', () => ({
  useCharacterStore: () => mockCharacterStore,
}));

import { useCharacters } from './useCharacters';

describe('useCharacters', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockCharacterStore.characters = [];
    mockCharacterStore.filteredCharacters = [];
    mockCharacterStore.currentCharacter = null;
    mockCharacterStore.loading = false;
    mockCharacterStore.error = null;
  });

  it('characters computed delegates to store', () => {
    const testChars = [{ id: '1', name: 'Alice' }];
    mockCharacterStore.characters = testChars as any;
    const { characters } = useCharacters();
    expect(characters.value).toBe(testChars);
  });

  it('filteredCharacters computed delegates to store', () => {
    const filtered = [{ id: '2', name: 'Bob' }];
    mockCharacterStore.filteredCharacters = filtered as any;
    const { filteredCharacters } = useCharacters();
    expect(filteredCharacters.value).toBe(filtered);
  });

  it('currentCharacter computed delegates to store', () => {
    const char = { id: '3', name: 'Charlie' };
    mockCharacterStore.currentCharacter = char as any;
    const { currentCharacter } = useCharacters();
    expect(currentCharacter.value).toBe(char);
  });

  it('loading computed delegates to store', () => {
    mockCharacterStore.loading = true;
    const { loading } = useCharacters();
    expect(loading.value).toBe(true);
  });

  it('error computed delegates to store', () => {
    mockCharacterStore.error = 'Something went wrong' as any;
    const { error } = useCharacters();
    expect(error.value).toBe('Something went wrong');
  });

  it('fetchCharacters calls store.fetchCharacters', async () => {
    const { fetchCharacters } = useCharacters();
    await fetchCharacters();
    expect(mockCharacterStore.fetchCharacters).toHaveBeenCalledOnce();
  });

  it('fetchCharacter calls store.fetchCharacter with id', async () => {
    const { fetchCharacter } = useCharacters();
    await fetchCharacter('abc-123');
    expect(mockCharacterStore.fetchCharacter).toHaveBeenCalledWith('abc-123');
  });

  it('searchCharacters calls store.searchCharacters with query', async () => {
    const { searchCharacters } = useCharacters();
    await searchCharacters('fantasy');
    expect(mockCharacterStore.searchCharacters).toHaveBeenCalledWith('fantasy');
  });

  it('setSearchQuery calls store.setSearchQuery', () => {
    const { setSearchQuery } = useCharacters();
    setSearchQuery('test query');
    expect(mockCharacterStore.setSearchQuery).toHaveBeenCalledWith('test query');
  });

  it('setSelectedTags calls store.setSelectedTags', () => {
    const { setSelectedTags } = useCharacters();
    setSelectedTags(['rpg', 'fantasy']);
    expect(mockCharacterStore.setSelectedTags).toHaveBeenCalledWith(['rpg', 'fantasy']);
  });

  it('clearFilters calls store.clearFilters', () => {
    const { clearFilters } = useCharacters();
    clearFilters();
    expect(mockCharacterStore.clearFilters).toHaveBeenCalledOnce();
  });
});
