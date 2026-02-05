import { ref } from 'vue';
import { characterApi, mapSearchItemToCharacter } from '@client/services';
import type { Character } from '@client/types';
import type { SearchResult } from '@/types/search';

export function useCharacterSearch() {
  const searchQuery = ref('');
  const selectedCategory = ref('');
  const selectedTags = ref<string[]>([]);
  const showNsfw = ref(false);
  const sortBy = ref('popular');

  const characters = ref<Character[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);

  const fetchCharacters = async () => {
    loading.value = true;
    try {
      const query = searchQuery.value.trim() || '*';
      const response: SearchResult = await characterApi.searchCharacters({
        q: query,
        sort: sortBy.value,
        filter: 'public',
        page: currentPage.value,
        limit: pageSize.value,
        category: selectedCategory.value || undefined,
        tags: selectedTags.value.length ? selectedTags.value : undefined,
        isNsfw: showNsfw.value || undefined,
      });

      characters.value = (response.items || []).map(mapSearchItemToCharacter);
      total.value = response.pagination.total;
    } finally {
      loading.value = false;
    }
  };

  const resetFilters = () => {
    searchQuery.value = '';
    selectedCategory.value = '';
    selectedTags.value = [];
    showNsfw.value = false;
    currentPage.value = 1;
  };

  const setPage = (page: number) => {
    currentPage.value = page;
  };

  return {
    searchQuery,
    selectedCategory,
    selectedTags,
    showNsfw,
    sortBy,
    characters,
    total,
    currentPage,
    pageSize,
    loading,
    fetchCharacters,
    resetFilters,
    setPage,
  };
}
