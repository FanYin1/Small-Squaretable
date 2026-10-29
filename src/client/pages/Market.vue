<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@client/composables/useToast';
import { useCharacterSearch } from '@client/composables/useCharacterSearch';
import { useContinueStory } from '@client/composables/useContinueStory';
import { readStoryDiscoveryQuery, writeStoryDiscoveryQuery } from '@client/utils/storyDiscoveryQuery';
import { useUserStore } from '@client/stores/user';
import { createLogger } from '@client/utils/logger';
import { useModulesStore } from '@client/stores/modules';

const logger = createLogger('Market');
import { recommendationApi } from '@client/services/recommendation.api';
import { characterApi } from '@client/services/character.api';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import StoryOnboarding from '@client/components/layout/StoryOnboarding.vue';
import SearchCombo from '@client/components/market/SearchCombo.vue';
import FilterToolbar from '@client/components/market/FilterToolbar.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import StoryCard from '@client/components/market/StoryCard.vue';
import SkeletonCardImmersive from '@client/components/ui/SkeletonCardImmersive.vue';
import RecommendationCarousel from '@client/components/recommendation/RecommendationCarousel.vue';
import type { Character } from '@client/types';

const toast = useToast();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const modulesStore = useModulesStore();
const userStore = useUserStore();
const owner = computed(() => userStore.isAuthenticated && userStore.user
  ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);
const { story: continuedStory, failed: continueFailed, loading: continueLoading, refresh: retryContinue } = useContinueStory(owner);
let active = true;
let scrollVersion = 0;
let pendingScroll: number | null = null;

// Trending state
const trendingLoading = ref(false);
const trendingCharacters = ref<Character[]>([]);

const {
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
} = useCharacterSearch();

if (modulesStore.isEnabled('recommendations')) void fetchTrending();

watch(() => route.query, () => {
  if (route.name !== 'Market') return;
  const state = readStoryDiscoveryQuery(route.query);
  searchQuery.value = state.q;
  selectedCategory.value = state.category;
  selectedTags.value = state.tags;
  sortBy.value = state.sort;
  setPage(state.page);
  const saved = window.history.state?.storyDiscoveryScroll;
  pendingScroll = typeof saved === 'number' && Number.isFinite(saved) && saved >= 0 ? saved : 0;
  scrollVersion += 1;
  void loadCharacters();
}, { immediate: true });

watch([loading, continueLoading, trendingLoading], restoreScroll, { flush: 'post' });

onBeforeRouteLeave(() => {
  window.history.replaceState({ ...window.history.state, storyDiscoveryScroll: window.scrollY }, '');
});

onBeforeUnmount(() => { active = false; scrollVersion += 1; });

async function restoreScroll() {
  if (loading.value || continueLoading.value || trendingLoading.value || failed.value || pendingScroll === null) return;
  const version = scrollVersion;
  await nextTick();
  requestAnimationFrame(() => {
    if (!active || version !== scrollVersion || pendingScroll === null || route.name !== 'Market') return;
    window.scrollTo({ top: pendingScroll, behavior: 'instant' });
    pendingScroll = null;
  });
}

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
    if (active) trendingCharacters.value = characters.filter((c): c is Character => c !== null);
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
    void restoreScroll();
  } catch (error) {
    logger.error('Failed to fetch characters', error);
    toast.error(t('chat.loadFailed'), {
      message: t('common.retry')
    });
  }
}

function handleSearch() {
  setPage(1);
  void applyFilters();
}

function handleFilterChange() {
  setPage(1);
  void applyFilters();
}

function handlePageChange(page: number) {
  setPage(page);
  void applyFilters();
}

function handleClearFilters() {
  resetFilters();
  void applyFilters();
}

function handleBrowseAll() {
  handleClearFilters();
}

async function applyFilters() {
  const query = writeStoryDiscoveryQuery({
    q: searchQuery.value, category: selectedCategory.value,
    tags: selectedTags.value, sort: sortBy.value, page: currentPage.value,
  }, route.query);
  pendingScroll = 0;
  scrollVersion += 1;
  if (router.resolve({ query }).fullPath === route.fullPath) {
    await loadCharacters();
  } else {
    await router.replace({ query, state: { storyDiscoveryScroll: 0 } });
  }
}
</script>

<template>
  <ExplorationLayout>
    <template #title>{{ t('market.discovery.title') }}</template>

    <div class="market-content">
      <div class="discovery-heading-row"><header class="discovery-intro">
        <p class="discovery-eyebrow">{{ t('market.discovery.eyebrow') }}</p>
        <h1>{{ t('exploration.discoverHeading') }}</h1>
        <p>{{ t('exploration.discoverDescription') }}</p>
      </header>
      <SearchCombo
        v-model="searchQuery"
        @search="handleSearch"
      />
      </div>

      <StoryOnboarding />
      <section v-if="continuedStory" class="continue-story" :aria-label="t('market.discovery.continue')">
        <div>
          <p class="discovery-eyebrow">{{ t('market.discovery.continue') }}</p>
          <h2>{{ continuedStory.title || continuedStory.characterName }}</h2>
          <p v-if="continuedStory.lastMessage" class="continue-excerpt">{{ continuedStory.lastMessage }}</p>
        </div>
        <RouterLink :to="{ name: 'ChatSession', params: { chatId: continuedStory.id } }" class="continue-link">
          {{ t('market.discovery.resume') }} <span aria-hidden="true">→</span>
        </RouterLink>
      </section>
      <div v-else-if="continueFailed" class="continue-error" role="status">
        <span>{{ t('market.discovery.continueFailed') }}</span>
        <button type="button" :disabled="continueLoading" @click="retryContinue">{{ t('common.retry') }}</button>
      </div>
      <RecommendationCarousel
        v-if="modulesStore.isEnabled('recommendations') && !searchQuery && (trendingLoading || trendingCharacters.length > 0)"
        :title="$t('market.trending')"
        :characters="trendingCharacters"
        :loading="trendingLoading"
        @click="handleTrendingClick"
      />

      <FilterToolbar
        v-model:selected-category="selectedCategory"
        v-model:selected-tags="selectedTags"
        v-model:sort-by="sortBy"
        @change="handleFilterChange"
      />

      <div class="characters-section" :aria-busy="loading">
        <div v-if="loading" class="skeleton-wrapper">
          <SkeletonCardImmersive :count="8" />
        </div>

        <div v-else-if="failed">
          <EmptyState type="error" @action-primary="loadCharacters" @action-secondary="router.push({ name: 'Dashboard' })" />
        </div>

        <div v-else-if="characters.length === 0">
          <EmptyState
            type="no-results"
            @action-primary="handleClearFilters"
            @action-secondary="handleBrowseAll"
          />
        </div>

        <div v-else class="character-grid">
          <StoryCard
            v-for="character in characters"
            :key="character.id"
            :character="character"
            quick-start
          />
        </div>

        <div v-if="!loading && !failed && total > pageSize" class="pagination-wrapper">
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
  </ExplorationLayout>
</template>

<style scoped lang="scss">
/* 配色全部走全站主题令牌（variables.css），本页不再有专属的深色作用域。 */
.market-content {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-bottom: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.discovery-heading-row { display:flex; align-items:flex-end; justify-content:space-between; gap:32px; padding-bottom:8px; }
.discovery-heading-row :deep(.search-combo) { max-width:340px; flex-shrink:0; }
.discovery-intro h1 { margin: 8px 0 16px; font-family:var(--font-display); font-weight:500; font-size: clamp(32px, 4vw, 52px); line-height: 1.3; color: var(--text-primary); }
.discovery-intro p { margin: 0; color: var(--text-secondary); line-height: 1.7; }
.discovery-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: var(--accent-text); }
.continue-story { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 24px; border: 1px solid var(--border-default); border-left: 3px solid var(--accent); border-radius: 12px; background: var(--bg-surface); }
.continue-story p { margin: 0; }
.continue-story h2 { margin: 8px 0 0; font-size: 20px; overflow-wrap: anywhere; }
.continue-story > div { min-width: 0; }
.continue-story .continue-excerpt { margin-top: 10px; max-width: 60ch; color: var(--text-secondary); line-height: 1.8; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.continue-link { flex-shrink: 0; display: inline-flex; align-items: center; gap: 12px; min-height: 44px; color: var(--accent-text); font-weight: 600; text-decoration: none; }
.continue-error { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; color: var(--text-secondary); }
.continue-error button { min-height: 44px; padding: 0 16px; color: var(--text-primary); background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 8px; cursor: pointer; }
.continue-link:focus-visible, .continue-error button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.characters-section {
  flex: 1;
  min-height: 400px;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  padding: 36px 0 8px;
}

.pagination-wrapper :deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-text-color: var(--text-secondary);
  --el-pagination-button-color: var(--text-secondary);
  --el-pagination-button-bg-color: var(--bg-surface);
  --el-pagination-button-disabled-color: var(--text-tertiary);
  --el-pagination-button-disabled-bg-color: var(--bg-subtle);
  --el-pagination-hover-color: var(--accent);
  --el-color-primary: var(--accent);
  --el-disabled-bg-color: var(--bg-subtle);
  --el-text-color-regular: var(--text-secondary);
  --el-fill-color-blank: var(--bg-surface);
  --el-fill-color: var(--bg-surface);
  --el-fill-color-light: var(--bg-hover);
}

/* 选中页码：琥珀底 + 炭黑字（≈8.5:1）。琥珀底配白字只有 ≈2.1:1，不达 AA。 */
.pagination-wrapper :deep(.el-pager li.is-active) {
  color: var(--accent-on);
  background: var(--accent);
  border-radius: 8px;
}

.pagination-wrapper :deep(.el-pagination button:focus-visible),
.pagination-wrapper :deep(.el-pager li:focus-visible) {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: 8px;
}

@include below(lg) {
  .discovery-heading-row { flex-direction:column; align-items:stretch; gap:24px; }
  .discovery-heading-row :deep(.search-combo) { max-width:none; }
  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
}

@include below(md) {
  .market-content {
    gap: 20px;
  }

  .character-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .continue-story { align-items: flex-start; flex-direction: column; padding: 20px; gap: 12px; }

  .pagination-wrapper {
    padding: 24px 0 0;
  }
}
</style>
