import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Character } from '@client/types';

export const useCharacterStore = defineStore('character', () => {
  // State
  const characters = ref<Character[]>([]);
  const currentCharacter = ref<Character | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const searchQuery = ref('');
  const selectedTags = ref<string[]>([]);

  // Getters
  const filteredCharacters = computed(() => {
    let result = characters.value;

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
      );
    }

    if (selectedTags.value.length > 0) {
      result = result.filter(c =>
        c.tags?.some(t => selectedTags.value.includes(t))
      );
    }

    return result;
  });

  // Actions
  async function fetchCharacters(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Fetch characters called (API integration in Task 4)');
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch characters';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCharacter(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Fetch character called (API integration in Task 4):', id);
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch character';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function searchCharacters(query: string): Promise<void> {
    searchQuery.value = query;
    await fetchCharacters();
  }

  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  function setSelectedTags(tags: string[]): void {
    selectedTags.value = tags;
  }

  function clearFilters(): void {
    searchQuery.value = '';
    selectedTags.value = [];
  }

  return {
    characters,
    currentCharacter,
    loading,
    error,
    searchQuery,
    selectedTags,
    filteredCharacters,
    fetchCharacters,
    fetchCharacter,
    searchCharacters,
    setSearchQuery,
    setSelectedTags,
    clearFilters,
  };
});
