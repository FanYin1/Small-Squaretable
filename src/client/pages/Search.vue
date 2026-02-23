<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search as SearchIcon } from '@element-plus/icons-vue';
import ChatLayout from '@client/components/layout/ChatLayout.vue';
import SearchFilterPanel from '@client/components/search/SearchFilterPanel.vue';
import { searchApi } from '@client/services/search.api';
import type { GlobalSearchResult } from '@client/services/search.api';
import { highlightText } from '@client/utils/highlight';

interface SearchFilters {
  type: string;
  dateRange: [Date, Date] | null;
  category: string;
  tags: string[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const searchQuery = ref((route.query.q as string) || '');
const activeTab = ref('all');
const loading = ref(false);
const results = ref<GlobalSearchResult | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);

const filters = ref<SearchFilters>({
  type: 'all',
  dateRange: null,
  category: '',
  tags: [],
});

const totalResults = computed(() => results.value?.total ?? 0);
const characterCount = computed(() => results.value?.characters?.length ?? 0);
const messageCount = computed(() => results.value?.messages?.length ?? 0);
const worldbookCount = computed(() => results.value?.worldbooks?.length ?? 0);

const showCharacters = computed(() =>
  activeTab.value === 'all' || activeTab.value === 'characters'
);
const showMessages = computed(() =>
  activeTab.value === 'all' || activeTab.value === 'messages'
);
const showWorldbooks = computed(() =>
  activeTab.value === 'all' || activeTab.value === 'worldbooks'
);

async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;

  // Update URL query param
  router.replace({ query: { q } });

  loading.value = true;
  try {
    const type = filters.value.type === 'all' ? undefined : filters.value.type as any;
    results.value = await searchApi.globalSearch({
      q,
      type,
      page: currentPage.value,
      limit: pageSize.value,
      category: filters.value.category || undefined,
      tags: filters.value.tags.length ? filters.value.tags : undefined,
      dateFrom: filters.value.dateRange?.[0] ? String(filters.value.dateRange[0]) : undefined,
      dateTo: filters.value.dateRange?.[1] ? String(filters.value.dateRange[1]) : undefined,
    });
  } catch {
    results.value = null;
  } finally {
    loading.value = false;
  }
}

function handleTabChange(tab: string | number) {
  activeTab.value = String(tab);
  currentPage.value = 1;
  if (searchQuery.value.trim()) {
    doSearch();
  }
}

function handlePageChange(page: number) {
  currentPage.value = page;
  doSearch();
}

function goToCharacter(id: string) {
  router.push({ name: 'CharacterDetail', params: { id } });
}

function goToChat(chatId: string) {
  router.push({ name: 'ChatSession', params: { chatId } });
}

function goToWorldbook(worldbookId: string) {
  router.push({ name: 'WorldBookDetail', params: { id: worldbookId } });
}

// Watch for filter changes with debounce
let filterTimeout: ReturnType<typeof setTimeout>;
watch(filters, () => {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    currentPage.value = 1;
    if (searchQuery.value.trim()) {
      doSearch();
    }
  }, 300);
}, { deep: true });

// Watch for route query changes
watch(() => route.query.q, (newQ) => {
  if (newQ && newQ !== searchQuery.value) {
    searchQuery.value = newQ as string;
    doSearch();
  }
});

onMounted(() => {
  if (searchQuery.value.trim()) {
    doSearch();
  }
});
</script>

<template>
  <ChatLayout>
    <div class="search-page">
      <!-- Search header -->
      <div class="search-header">
        <h2 class="search-title">{{ t('search.title') }}</h2>
        <div class="search-bar">
          <el-input
            v-model="searchQuery"
            :placeholder="t('search.placeholder')"
            :prefix-icon="SearchIcon"
            size="large"
            clearable
            @keydown.enter="doSearch"
          />
        </div>
      </div>

      <div class="search-body">
        <!-- Filter sidebar (desktop) -->
        <aside class="search-sidebar">
          <SearchFilterPanel v-model="filters" />
        </aside>

        <!-- Results area -->
        <div class="search-results">
          <!-- Tabs -->
          <el-tabs v-model="activeTab" @tab-change="handleTabChange">
            <el-tab-pane name="all">
              <template #label>
                {{ t('search.tab.all') }}
                <el-badge v-if="totalResults > 0" :value="totalResults" :max="99" class="tab-badge" />
              </template>
            </el-tab-pane>
            <el-tab-pane name="characters">
              <template #label>
                {{ t('search.tab.characters') }}
                <el-badge v-if="characterCount > 0" :value="characterCount" :max="99" class="tab-badge" />
              </template>
            </el-tab-pane>
            <el-tab-pane name="messages">
              <template #label>
                {{ t('search.tab.messages') }}
                <el-badge v-if="messageCount > 0" :value="messageCount" :max="99" class="tab-badge" />
              </template>
            </el-tab-pane>
            <el-tab-pane name="worldbooks">
              <template #label>
                {{ t('search.tab.worldbooks') }}
                <el-badge v-if="worldbookCount > 0" :value="worldbookCount" :max="99" class="tab-badge" />
              </template>
            </el-tab-pane>
          </el-tabs>

          <!-- Loading -->
          <div v-if="loading" class="results-loading">
            <el-skeleton :rows="4" animated />
            <el-skeleton :rows="4" animated style="margin-top: 20px" />
          </div>

          <!-- Results content -->
          <template v-if="!loading && results">
            <!-- Empty state -->
            <el-empty
              v-if="totalResults === 0"
              :description="t('search.noResults')"
            />

            <template v-else>
              <!-- Character results -->
              <div v-if="showCharacters && results.characters?.length" class="result-section">
                <h3 class="section-title" v-if="activeTab === 'all'">{{ t('search.tab.characters') }}</h3>
                <div class="character-grid">
                  <el-card
                    v-for="char in results.characters"
                    :key="char.id"
                    class="character-card"
                    shadow="hover"
                    @click="goToCharacter(char.id)"
                  >
                    <div class="character-card-body">
                      <el-avatar :size="48" :src="char.avatarUrl || undefined">
                        {{ char.name?.charAt(0) }}
                      </el-avatar>
                      <div class="character-info">
                        <div class="character-name" v-html="highlightText(char.name || '', searchQuery)" />
                        <div class="character-desc" v-html="char.snippet || highlightText(char.description || '', searchQuery)" />
                        <div class="character-tags" v-if="char.tags?.length">
                          <el-tag v-for="tag in char.tags.slice(0, 3)" :key="tag" size="small" type="info">
                            {{ tag }}
                          </el-tag>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </div>
              </div>

              <!-- Message results -->
              <div v-if="showMessages && results.messages?.length" class="result-section">
                <h3 class="section-title" v-if="activeTab === 'all'">{{ t('search.tab.messages') }}</h3>
                <div class="message-list">
                  <div
                    v-for="msg in results.messages"
                    :key="msg.id"
                    class="message-item"
                    @click="goToChat(msg.chatId)"
                  >
                    <div class="message-header">
                      <span class="message-chat-title">{{ msg.chatTitle || t('search.untitledChat') }}</span>
                      <span class="message-time">{{ msg.sentAt }}</span>
                    </div>
                    <div class="message-content" v-html="highlightText(msg.content || '', searchQuery)" />
                  </div>
                </div>
              </div>

              <!-- Worldbook results -->
              <div v-if="showWorldbooks && results.worldbooks?.length" class="result-section">
                <h3 class="section-title" v-if="activeTab === 'all'">{{ t('search.tab.worldbooks') }}</h3>
                <div class="worldbook-list">
                  <div
                    v-for="entry in results.worldbooks"
                    :key="entry.id"
                    class="worldbook-item"
                    @click="goToWorldbook(entry.worldbookId)"
                  >
                    <div class="worldbook-header">
                      <el-tag size="small">{{ entry.keyword }}</el-tag>
                      <span class="worldbook-name">{{ entry.worldbookName }}</span>
                    </div>
                    <div class="worldbook-content" v-html="highlightText(entry.content || '', searchQuery)" />
                  </div>
                </div>
              </div>

              <!-- Pagination -->
              <div class="search-pagination" v-if="totalResults > pageSize">
                <el-pagination
                  :current-page="currentPage"
                  :page-size="pageSize"
                  :total="totalResults"
                  layout="prev, pager, next"
                  @current-change="handlePageChange"
                />
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </ChatLayout>
</template>

<style scoped>
.search-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 24px;
}

.search-header {
  margin-bottom: 24px;
}

.search-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  margin: 0 0 16px;
}

.search-bar {
  max-width: 640px;
}

.search-body {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.search-sidebar {
  width: 240px;
  flex-shrink: 0;
}

.search-results {
  flex: 1;
  min-width: 0;
}

.results-loading {
  padding: 16px 0;
}

.result-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-regular, #606266);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-extra-light, #f2f6fc);
}

/* Character grid */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.character-card {
  cursor: pointer;
  transition: transform 0.15s;
}

.character-card:hover {
  transform: translateY(-2px);
}

.character-card-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary, #303133);
  margin-bottom: 4px;
}

.character-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.character-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

/* Message list */
.message-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  cursor: pointer;
  transition: background-color 0.15s;
}

.message-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.message-chat-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--el-text-color-primary, #303133);
}

.message-time {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.message-content {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

/* Worldbook list */
.worldbook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.worldbook-item {
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  cursor: pointer;
  transition: background-color 0.15s;
}

.worldbook-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.worldbook-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.worldbook-name {
  font-size: 12px;
  color: var(--el-text-color-placeholder, #a8abb2);
}

.worldbook-content {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

/* Pagination */
.search-pagination {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

/* Highlight mark */
:deep(.search-highlight) {
  background-color: #fef08a;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}

.tab-badge {
  margin-left: 6px;
}

.tab-badge :deep(.el-badge__content) {
  font-size: 11px;
}

/* Responsive */
@media (max-width: 768px) {
  .search-page {
    padding: 16px;
  }

  .search-sidebar {
    display: none;
  }

  .character-grid {
    grid-template-columns: 1fr;
  }
}
</style>
