<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@client/composables/useToast';
import { useCharacterSearch } from '@client/composables/useCharacterSearch';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('Market');
import { recommendationApi } from '@client/services/recommendation.api';
import { characterApi } from '@client/services/character.api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import SearchCombo from '@client/components/market/SearchCombo.vue';
import FilterToolbar from '@client/components/market/FilterToolbar.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterCardImmersive from '@client/components/character/CharacterCardImmersive.vue';
import SkeletonCardImmersive from '@client/components/ui/SkeletonCardImmersive.vue';
import RecommendationCarousel from '@client/components/recommendation/RecommendationCarousel.vue';
import type { Character } from '@client/types';

// 样板面：沉浸叙事视觉语言，作用域限定在 .immersive 容器内
import '@client/styles/immersive.css';

const toast = useToast();
const router = useRouter();
const { t } = useI18n();

// Trending state
const trendingLoading = ref(false);
const trendingCharacters = ref<Character[]>([]);

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
  fetchTrending();
});

async function fetchTrending() {
  trendingLoading.value = true;
  try {
    const recs = await recommendationApi.getTrending(10);
    const items = Array.isArray(recs) ? recs : [];
    if (items.length === 0) {
      trendingLoading.value = false;
      return;
    }
    const characters = await Promise.all(
      items.map(async (rec) => {
        try {
          return await characterApi.getCharacter(rec.characterId);
        } catch {
          return null;
        }
      })
    );
    trendingCharacters.value = characters.filter((c): c is Character => c !== null);
  } catch {
    // Trending is non-critical, fail silently
  } finally {
    trendingLoading.value = false;
  }
}

function handleTrendingClick(characterId: string) {
  recommendationApi.sendFeedback({ characterId, action: 'click' }).catch(() => {});
  router.push({ name: 'CharacterDetail', params: { id: characterId } });
}

async function loadCharacters() {
  try {
    await fetchCharacters();
  } catch (error) {
    logger.error('Failed to fetch characters', error);
    toast.error(t('chat.loadFailed'), {
      message: t('common.retry')
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

// 卡片点击导航由 CharacterCardImmersive 自行处理（含键盘触发），
// 这里不再外部绑定 @click，避免与卡片内部的 router.push 重复触发。
</script>

<template>
  <!--
    immersive 通过 attribute fallthrough 落到 DashboardLayout 的根元素，
    因此侧栏和顶栏也进入同一套深色令牌——否则顶栏（SearchCombo 所在的
    #center 插槽）仍是浅色，会和下方深色内容区拼出一道明显接缝。
    整个样板面的回退方式就是删掉这一个 class。
  -->
  <DashboardLayout class="immersive">
    <template #title>{{ $t('market.title') }}</template>
    <template #center>
      <SearchCombo
        v-model="searchQuery"
        @search="handleSearch"
      />
    </template>

    <div class="market-content">
      <RecommendationCarousel
        v-if="!searchQuery && (trendingLoading || trendingCharacters.length > 0)"
        :title="$t('market.trending')"
        :characters="trendingCharacters"
        :loading="trendingLoading"
        @click="handleTrendingClick"
      />

      <FilterToolbar
        v-model:selected-category="selectedCategory"
        v-model:selected-tags="selectedTags"
        v-model:show-nsfw="showNsfw"
        v-model:sort-by="sortBy"
        @change="handleFilterChange"
      />

      <div class="characters-section">
        <div v-if="loading" class="skeleton-wrapper">
          <SkeletonCardImmersive :count="8" />
        </div>

        <div v-else-if="characters.length === 0">
          <EmptyState
            type="no-results"
            @action-primary="handleClearFilters"
            @action-secondary="handleBrowseAll"
          />
        </div>

        <div v-else class="character-grid">
          <CharacterCardImmersive
            v-for="character in characters"
            :key="character.id"
            :character="character"
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
/*
 * 样板面：沉浸叙事。所有视觉取值走 --im-* 令牌（见 styles/immersive.css），
 * 不读全局 --accent/--bg-*，因此该页的改动无法回流影响其它页面。
 */
/* 深色底由 .immersive（挂在 DashboardLayout 根上）提供，
   这里不再需要负 margin 去抵消内容区 padding。 */
.market-content {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-bottom: 16px;
}

.characters-section {
  flex: 1;
  min-height: 400px;
}

/* 3:4 竖卡：列宽比原来的 280px 更窄，否则单卡高度接近 400px 破坏节奏 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 20px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 36px 0 8px;
}

/* el-pagination 是本页唯一的 Element Plus 组件。
   只改 --el-* 变量，不重写其 DOM 结构，升级时不易崩。 */
.pagination-wrapper :deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-text-color: var(--im-content-muted);
  --el-pagination-button-color: var(--im-content-muted);
  --el-pagination-button-bg-color: var(--im-raised);
  --el-pagination-button-disabled-color: var(--im-content-faint);
  --el-pagination-button-disabled-bg-color: var(--im-surface);
  --el-pagination-hover-color: var(--im-accent);
  --el-color-primary: var(--im-accent);
  --el-disabled-bg-color: var(--im-surface);
  --el-text-color-regular: var(--im-content-muted);
  --el-fill-color-blank: var(--im-raised);
  --el-fill-color: var(--im-raised);
  --el-fill-color-light: var(--im-overlay);
}

/* 选中页码：琥珀底 + 炭黑字（≈8.5:1）。琥珀底配白字只有 ≈2.1:1，不达 AA。 */
.pagination-wrapper :deep(.el-pager li.is-active) {
  color: var(--im-accent-on);
  background: var(--im-accent);
  border-radius: 8px;
}

.pagination-wrapper :deep(.el-pagination button:focus-visible),
.pagination-wrapper :deep(.el-pager li:focus-visible) {
  outline: none;
  box-shadow: var(--im-focus-ring);
  border-radius: 8px;
}

@media (max-width: 1023px) {
  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 767px) {
  .market-content {
    gap: 20px;
  }

  /* 竖卡在窄屏走双列：单列会让 3:4 卡片高到需要滚动才能看完一张 */
  .character-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .pagination-wrapper {
    padding: 24px 0 0;
  }
}
</style>
