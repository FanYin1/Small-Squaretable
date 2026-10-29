import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { characterApi, mapSearchItemToCharacter } from '@client/services';
import type { Character } from '@client/types';
import type { SearchResult } from '@/types/search';

export function useCharacterSearch() {
  const searchQuery = ref('');
  const selectedCategory = ref('');
  const selectedTags = ref<string[]>([]);
  const sortBy = ref('popular');

  const characters = ref<Character[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);
  const failed = ref(false);
  let requestVersion = 0;
  if (getCurrentScope()) onScopeDispose(() => { requestVersion += 1; });

  const fetchCharacters = async () => {
    const version = ++requestVersion;
    loading.value = true;
    failed.value = false;
    characters.value = [];
    total.value = 0;
    try {
      const query = searchQuery.value.trim() || '*';
      const response: SearchResult = await characterApi.searchCharacters({
        q: query,
        sort: sortBy.value,
        filter: 'public',
        page: currentPage.value,
        limit: pageSize.value,
        category: selectedCategory.value || undefined,
        tags: selectedTags.value.length ? [...selectedTags.value] : undefined,
      });

      if (version !== requestVersion) return;
      characters.value = (response.items || []).map(mapSearchItemToCharacter);
      total.value = response.pagination.total;
    } catch (error) {
      if (version !== requestVersion) return;
      failed.value = true;
      throw error;
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  };

  const resetFilters = () => {
    searchQuery.value = '';
    selectedCategory.value = '';
    selectedTags.value = [];
    currentPage.value = 1;
  };

  const setPage = (page: number) => {
    currentPage.value = page;
  };

  return {
    searchQuery,
    selectedCategory,
    selectedTags,
    sortBy,
    characters,
    total,
    currentPage,
    pageSize,
    loading,
    failed,
    fetchCharacters,
    resetFilters,
    setPage,
  };
}
