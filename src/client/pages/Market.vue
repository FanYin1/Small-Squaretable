<script setup lang="ts">
import { onMounted } from 'vue';
import { useToast } from '@client/composables/useToast';
import { useCharacterSearch } from '@client/composables/useCharacterSearch';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import SearchCombo from '@client/components/market/SearchCombo.vue';
import FilterToolbar from '@client/components/market/FilterToolbar.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import SkeletonCard from '@client/components/ui/SkeletonCard.vue';

const toast = useToast();

const {
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
} = useCharacterSearch();

onMounted(async () => {
  await loadCharacters();
});

async function loadCharacters() {
  try {
    await fetchCharacters();
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    toast.error('加载失败', {
      message: '无法加载角色列表，请稍后重试'
    });
  }
}

function handleSearch() {
  setPage(1);
  loadCharacters();
}

function handleFilterChange() {
  setPage(1);
  loadCharacters();
}

function handlePageChange(page: number) {
  setPage(page);
  loadCharacters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleClearFilters() {
  resetFilters();
  loadCharacters();
}

function handleBrowseAll() {
  handleClearFilters();
}

function handleCardClick(characterId: string) {
  // TODO: 打开角色详情
  console.log('Character clicked:', characterId);
}
</script>

<template>
  <DashboardLayout>
    <template #title>角色市场</template>
    <template #center>
      <SearchCombo
        v-model="searchQuery"
        @search="handleSearch"
      />
    </template>

    <div class="market-content">
      <FilterToolbar
        v-model:selected-category="selectedCategory"
        v-model:selected-tags="selectedTags"
        v-model:show-nsfw="showNsfw"
        v-model:sort-by="sortBy"
        @change="handleFilterChange"
      />

      <div class="characters-section">
        <div v-if="loading" class="skeleton-wrapper">
          <SkeletonCard :count="8" />
        </div>

        <div v-else-if="characters.length === 0">
          <EmptyState
            type="no-results"
            @action-primary="handleClearFilters"
            @action-secondary="handleBrowseAll"
          />
        </div>

        <div v-else class="character-grid">
          <CharacterCard
            v-for="character in characters"
            :key="character.id"
            :character="character"
            @click="handleCardClick(character.id)"
          />
        </div>

        <div v-if="total > pageSize" class="pagination-wrapper">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.market-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.characters-section {
  flex: 1;
  min-height: 400px;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px 0 8px;
}

.pagination-wrapper :deep(.el-pagination) {
  --el-pagination-button-color: var(--color-primary);
  --el-pagination-hover-color: var(--color-primary);
}

@media (max-width: 1023px) {
  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
  }
}

@media (max-width: 767px) {
  .market-content {
    gap: 16px;
  }

  .character-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .pagination-wrapper {
    padding: 16px 0 0;
  }
}
</style>
