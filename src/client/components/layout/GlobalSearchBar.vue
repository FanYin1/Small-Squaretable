<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search, Clock, Right } from '@element-plus/icons-vue';
import { searchApi } from '@client/services/search.api';
import type { SearchSuggestion } from '@client/services/search.api';

const router = useRouter();
const { t } = useI18n();

const visible = ref(false);
const query = ref('');
const inputRef = ref<any>(null);
const suggestions = ref<SearchSuggestion | null>(null);
const loading = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

function open() {
  visible.value = true;
  nextTick(() => {
    inputRef.value?.focus();
  });
}

function close() {
  visible.value = false;
  query.value = '';
  suggestions.value = null;
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (visible.value) {
      close();
    } else {
      open();
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  if (debounceTimer) clearTimeout(debounceTimer);
});

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!val || val.trim().length < 2) {
    suggestions.value = null;
    return;
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true;
    try {
      suggestions.value = await searchApi.getSuggestions(val.trim());
    } catch {
      suggestions.value = null;
    } finally {
      loading.value = false;
    }
  }, 300);
});

function handleSearch() {
  const q = query.value.trim();
  if (!q) return;
  close();
  router.push({ name: 'Search', query: { q } });
}

function goToCharacter(id: string) {
  close();
  router.push({ name: 'CharacterDetail', params: { id } });
}

function searchRecent(term: string) {
  query.value = term;
  handleSearch();
}

defineExpose({ open });
</script>

<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    :close-on-click-modal="true"
    class="global-search-dialog"
    width="560px"
    top="15vh"
    append-to-body
  >
    <div class="search-container">
      <div class="search-input-wrapper">
        <el-icon class="search-icon" :size="20"><Search /></el-icon>
        <input
          ref="inputRef"
          v-model="query"
          class="search-input"
          :placeholder="t('search.placeholder')"
          @keydown.enter="handleSearch"
          @keydown.esc="close"
        />
        <kbd class="search-shortcut">ESC</kbd>
      </div>

      <!-- Suggestions -->
      <div v-if="suggestions" class="search-suggestions">
        <!-- Character suggestions -->
        <div v-if="suggestions.characters?.length" class="suggestion-section">
          <div class="suggestion-label">{{ t('search.characterSuggestions') }}</div>
          <div
            v-for="char in suggestions.characters"
            :key="char.id"
            class="suggestion-item character-item"
            @click="goToCharacter(char.id)"
          >
            <el-avatar :size="28" :src="char.avatarUrl || undefined">
              {{ char.name.charAt(0) }}
            </el-avatar>
            <span class="suggestion-name">{{ char.name }}</span>
            <el-icon class="suggestion-arrow"><Right /></el-icon>
          </div>
        </div>

        <!-- Recent searches -->
        <div v-if="suggestions.recentSearches?.length" class="suggestion-section">
          <div class="suggestion-label">{{ t('search.recentSearches') }}</div>
          <div
            v-for="term in suggestions.recentSearches"
            :key="term"
            class="suggestion-item"
            @click="searchRecent(term)"
          >
            <el-icon :size="16"><Clock /></el-icon>
            <span class="suggestion-name">{{ term }}</span>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="search-loading">
        <el-skeleton :rows="3" animated />
      </div>

      <!-- Shortcut hint -->
      <div v-else class="search-hint">
        <span>{{ t('search.shortcut') }}</span>
        <kbd>{{ isMac ? '⌘' : 'Ctrl' }}+K</kbd>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.search-container {
  padding: 0;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
}

.search-icon {
  color: var(--el-text-color-secondary, #909399);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  background: transparent;
  color: var(--el-text-color-primary, #303133);
}

.search-input::placeholder {
  color: var(--el-text-color-placeholder, #a8abb2);
}

.search-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  color: var(--el-text-color-secondary, #909399);
  flex-shrink: 0;
}

.search-suggestions {
  max-height: 360px;
  overflow-y: auto;
  padding: 8px 0;
}

.suggestion-section {
  padding: 4px 0;
}

.suggestion-section + .suggestion-section {
  border-top: 1px solid var(--el-border-color-extra-light, #f2f6fc);
  margin-top: 4px;
  padding-top: 8px;
}

.suggestion-label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  padding: 4px 16px 8px;
  font-weight: 500;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.suggestion-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.suggestion-name {
  flex: 1;
  font-size: 14px;
  color: var(--el-text-color-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-arrow {
  color: var(--el-text-color-placeholder, #a8abb2);
  flex-shrink: 0;
}

.search-loading {
  padding: 16px;
}

.search-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}

.search-hint kbd {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
}

@media (max-width: 768px) {
  .search-shortcut {
    display: none;
  }
}
</style>

<style>
/* Override dialog padding for search */
.global-search-dialog .el-dialog__body {
  padding: 0;
}

.global-search-dialog .el-dialog__header {
  display: none;
}
</style>
