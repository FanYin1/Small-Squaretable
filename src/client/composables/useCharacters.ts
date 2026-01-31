import { computed } from 'vue';
import { useCharacterStore } from '@client/stores';

export function useCharacters() {
  const characterStore = useCharacterStore();

  const characters = computed(() => characterStore.characters);
  const filteredCharacters = computed(() => characterStore.filteredCharacters);
  const currentCharacter = computed(() => characterStore.currentCharacter);
  const loading = computed(() => characterStore.loading);
  const error = computed(() => characterStore.error);

  async function fetchCharacters() {
    await characterStore.fetchCharacters();
  }

  async function fetchCharacter(id: string) {
    await characterStore.fetchCharacter(id);
  }

  async function searchCharacters(query: string) {
    await characterStore.searchCharacters(query);
  }

  function setSearchQuery(query: string) {
    characterStore.setSearchQuery(query);
  }

  function setSelectedTags(tags: string[]) {
    characterStore.setSelectedTags(tags);
  }

  function clearFilters() {
    characterStore.clearFilters();
  }

  return {
    characters,
    filteredCharacters,
    currentCharacter,
    loading,
    error,
    fetchCharacters,
    fetchCharacter,
    searchCharacters,
    setSearchQuery,
    setSelectedTags,
    clearFilters,
  };
}
