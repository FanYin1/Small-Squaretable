import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effectScope } from 'vue';

const { mockSearchCharacters, mockMapSearchItem } = vi.hoisted(() => ({
  mockSearchCharacters: vi.fn(),
  mockMapSearchItem: vi.fn((item: any) => ({ id: item.id, name: item.name || 'test' })),
}));

vi.mock('@client/services', () => ({
  characterApi: {
    searchCharacters: mockSearchCharacters,
  },
  mapSearchItemToCharacter: mockMapSearchItem,
}));

import { useCharacterSearch } from './useCharacterSearch';

describe('useCharacterSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores older success and failure while the newest request owns loading', async () => {
    let resolveOld!: (value: unknown) => void;
    let rejectMiddle!: (reason: Error) => void;
    let resolveLatest!: (value: unknown) => void;
    mockSearchCharacters
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((_, reject) => { rejectMiddle = reject; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveLatest = resolve; }));
    const search = useCharacterSearch();
    const old = search.fetchCharacters();
    search.searchQuery.value = 'new';
    const middle = search.fetchCharacters();
    const latest = search.fetchCharacters();
    resolveOld({ items: [{ id: 'old' }], pagination: { total: 90 } });
    rejectMiddle(new Error('Old failure'));
    await Promise.all([old, middle]);
    expect(search.characters.value).toEqual([]);
    expect(search.loading.value).toBe(true);
    expect(search.failed.value).toBe(false);
    resolveLatest({ items: [{ id: 'new', name: 'New' }], pagination: { total: 1 } });
    await latest;
    expect(search.characters.value[0].id).toBe('new');
    expect(search.total.value).toBe(1);
    expect(search.loading.value).toBe(false);
  });

  it('clears previous results on a failed new search and recovers on retry', async () => {
    mockSearchCharacters.mockResolvedValueOnce({ items: [{ id: 'old' }], pagination: { total: 1 } })
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ items: [], pagination: { total: 0 } });
    const search = useCharacterSearch();
    await search.fetchCharacters();
    await expect(search.fetchCharacters()).rejects.toThrow('Offline');
    expect(search.characters.value).toEqual([]);
    expect(search.total.value).toBe(0);
    expect(search.failed.value).toBe(true);
    await search.fetchCharacters();
    expect(search.failed.value).toBe(false);
  });

  it('does not publish a result after its scope is disposed', async () => {
    let resolveRequest!: (value: unknown) => void;
    mockSearchCharacters.mockReturnValueOnce(new Promise(resolve => { resolveRequest = resolve; }));
    const scope = effectScope();
    const search = scope.run(useCharacterSearch)!;
    const pending = search.fetchCharacters();
    scope.stop();
    resolveRequest({ items: [{ id: 'old' }], pagination: { total: 1 } });
    await pending;
    expect(search.characters.value).toEqual([]);
  });

  it('has correct initial state', () => {
    const result = useCharacterSearch();
    expect(result.searchQuery.value).toBe('');
    expect(result.selectedCategory.value).toBe('');
    expect(result.selectedTags.value).toEqual([]);
    expect(result.sortBy.value).toBe('popular');
    expect(result.characters.value).toEqual([]);
    expect(result.total.value).toBe(0);
    expect(result.currentPage.value).toBe(1);
    expect(result.pageSize.value).toBe(20);
    expect(result.loading.value).toBe(false);
  });

  it('fetchCharacters calls characterApi.searchCharacters with correct params', async () => {
    mockSearchCharacters.mockResolvedValue({
      items: [],
      pagination: { total: 0 },
    });

    const { fetchCharacters, searchQuery, sortBy, currentPage, pageSize } = useCharacterSearch();
    searchQuery.value = 'elf';
    sortBy.value = 'newest';
    currentPage.value = 2;
    pageSize.value = 10;

    await fetchCharacters();

    expect(mockSearchCharacters).toHaveBeenCalledWith({
      q: 'elf',
      sort: 'newest',
      filter: 'public',
      page: 2,
      limit: 10,
      category: undefined,
      tags: undefined,
    });
  });

  it('fetchCharacters maps response items and sets total', async () => {
    mockSearchCharacters.mockResolvedValue({
      items: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      pagination: { total: 42 },
    });

    const { fetchCharacters, characters, total } = useCharacterSearch();
    await fetchCharacters();

    expect(mockMapSearchItem).toHaveBeenCalledTimes(2);
    expect(characters.value).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    expect(total.value).toBe(42);
  });

  it('fetchCharacters uses "*" when searchQuery is empty', async () => {
    mockSearchCharacters.mockResolvedValue({
      items: [],
      pagination: { total: 0 },
    });

    const { fetchCharacters } = useCharacterSearch();
    await fetchCharacters();

    expect(mockSearchCharacters).toHaveBeenCalledWith(
      expect.objectContaining({ q: '*' }),
    );
  });

  it('fetchCharacters sets loading true during call and false after', async () => {
    let resolvePromise: (v: any) => void;
    mockSearchCharacters.mockReturnValue(
      new Promise((resolve) => { resolvePromise = resolve; }),
    );

    const { fetchCharacters, loading } = useCharacterSearch();
    const promise = fetchCharacters();

    expect(loading.value).toBe(true);

    resolvePromise!({ items: [], pagination: { total: 0 } });
    await promise;

    expect(loading.value).toBe(false);
  });

  it('fetchCharacters resets loading on error', async () => {
    mockSearchCharacters.mockRejectedValue(new Error('Network error'));

    const { fetchCharacters, loading } = useCharacterSearch();

    await expect(fetchCharacters()).rejects.toThrow('Network error');
    expect(loading.value).toBe(false);
  });

  it('fetchCharacters passes category and tags when set', async () => {
    mockSearchCharacters.mockResolvedValue({
      items: [],
      pagination: { total: 0 },
    });

    const { fetchCharacters, selectedCategory, selectedTags } = useCharacterSearch();
    selectedCategory.value = 'anime';
    selectedTags.value = ['rpg', 'fantasy'];

    await fetchCharacters();

    expect(mockSearchCharacters).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'anime',
        tags: ['rpg', 'fantasy'],
      }),
    );
  });

  // 平台不允许色情内容，排除在服务端强制执行，客户端不再发送这个参数——
  // 发了也会被忽略，留着只会让人以为它是可切换的偏好
  it('never sends an isNsfw preference', async () => {
    mockSearchCharacters.mockResolvedValue({ items: [], pagination: { total: 0 } });

    const { fetchCharacters } = useCharacterSearch();
    await fetchCharacters();

    const params = mockSearchCharacters.mock.calls[0][0];
    expect(params).not.toHaveProperty('isNsfw');
  });

  it('resetFilters resets all filter state', () => {
    const result = useCharacterSearch();
    result.searchQuery.value = 'test';
    result.selectedCategory.value = 'anime';
    result.selectedTags.value = ['rpg'];
    result.currentPage.value = 5;

    result.resetFilters();

    expect(result.searchQuery.value).toBe('');
    expect(result.selectedCategory.value).toBe('');
    expect(result.selectedTags.value).toEqual([]);
    expect(result.currentPage.value).toBe(1);
    // sortBy should remain unchanged
    expect(result.sortBy.value).toBe('popular');
  });

  it('setPage updates currentPage', () => {
    const { setPage, currentPage } = useCharacterSearch();
    expect(currentPage.value).toBe(1);

    setPage(3);
    expect(currentPage.value).toBe(3);

    setPage(7);
    expect(currentPage.value).toBe(7);
  });
});
