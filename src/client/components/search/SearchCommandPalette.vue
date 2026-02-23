<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search as SearchIcon } from '@element-plus/icons-vue';
import { searchApi } from '@client/services/search.api';
import type { SearchSuggestion } from '@client/services/search.api';

const { t } = useI18n();
const router = useRouter();

const visible = ref(false);
const query = ref('');
const suggestions = ref<SearchSuggestion | null>(null);
const loading = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout>;

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    visible.value = !visible.value;
    if (!visible.value) {
      query.value = '';
      suggestions.value = null;
    }
  }
  if (e.key === 'Escape' && visible.value) {
    close();
  }
}

watch(query, (val) => {
  clearTimeout(debounceTimer);
  if (!val.trim()) {
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
  }, 200);
});

watch(visible, (val) => {
  if (val) {
    setTimeout(() => inputRef.value?.focus(), 50);
  }
});
function goToSearch() {
  if (query.value.trim()) {
    router.push({ name: 'Search', query: { q: query.value.trim() } });
    close();
  }
}

function goToCharacter(id: string) {
  router.push({ name: 'CharacterDetail', params: { id } });
  close();
}

function fillQuery(q: string) {
  query.value = q;
}

async function clearHistory() {
  try {
    await searchApi.clearSearchHistory();
    if (suggestions.value) {
      suggestions.value = { ...suggestions.value, recentSearches: [] };
    }
  } catch {
    // silently fail
  }
}

async function removeHistoryItem(term: string) {
  try {
    await searchApi.removeSearchHistoryItem(term);
    if (suggestions.value) {
      suggestions.value = {
        ...suggestions.value,
        recentSearches: suggestions.value.recentSearches.filter(s => s !== term),
      };
    }
  } catch {
    // silently fail
  }
}

function close() {
  visible.value = false;
  query.value = '';
  suggestions.value = null;
}

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('command-palette-overlay')) {
    close();
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div
        v-if="visible"
        class="command-palette-overlay"
        @click="handleOverlayClick"
      >
        <div class="command-palette">
          <div class="palette-input-wrapper">
            <el-icon class="palette-search-icon"><SearchIcon /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              :placeholder="t('search.placeholder')"
              @keydown.enter="goToSearch"
            />
            <kbd class="palette-shortcut">ESC</kbd>
          </div>
          <div v-if="loading" class="palette-loading">
            <el-icon class="is-loading"><SearchIcon /></el-icon>
          </div>

          <div v-if="suggestions" class="palette-results">
            <div v-if="suggestions.characters.length" class="palette-section">
              <div class="palette-section-title">{{ t('search.characterSuggestions') }}</div>
              <div
                v-for="char in suggestions.characters"
                :key="char.id"
                class="palette-item"
                @click="goToCharacter(char.id)"
              >
                <img
                  v-if="char.avatarUrl"
                  :src="char.avatarUrl"
                  :alt="char.name"
                  class="palette-avatar"
                />
                <div v-else class="palette-avatar palette-avatar-placeholder">
                  {{ char.name.charAt(0) }}
                </div>
                <span class="palette-item-name">{{ char.name }}</span>
              </div>
            </div>

            <div v-if="suggestions.recentSearches.length" class="palette-section">
              <div class="palette-section-header">
                <span class="palette-section-title">{{ t('search.recentSearches') }}</span>
                <span class="palette-clear-history" @click.stop="clearHistory">{{ t('search.clearHistory') }}</span>
              </div>
              <div
                v-for="term in suggestions.recentSearches"
                :key="term"
                class="palette-item"
                @click="fillQuery(term)"
              >
                <el-icon class="palette-item-icon"><SearchIcon /></el-icon>
                <span class="palette-item-name">{{ term }}</span>
                <span class="palette-remove-item" @click.stop="removeHistoryItem(term)">×</span>
              </div>
            </div>
          </div>

          <div v-if="query.trim() && !loading && !suggestions" class="palette-empty">
            {{ t('search.noResults') }}
          </div>

          <div class="palette-footer">
            <span
              v-if="query.trim()"
              class="palette-view-all"
              @click="goToSearch"
            >
              {{ t('search.viewAllResults') }}
            </span>
            <span v-else class="palette-hint">{{ t('search.pressEnterToSearch') }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.command-palette {
  width: 100%;
  max-width: 560px;
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.palette-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.palette-search-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary, #909399);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  background: transparent;
  color: var(--el-text-color-primary, #303133);
}

.palette-input::placeholder {
  color: var(--el-text-color-placeholder, #a8abb2);
}

.palette-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-text-color-secondary, #909399);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  flex-shrink: 0;
}

.palette-loading {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.palette-results {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px 0;
}

.palette-section {
  padding: 4px 0;
}

.palette-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #909399);
  padding: 4px 16px 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.palette-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 16px 6px;
}

.palette-clear-history {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  cursor: pointer;
}

.palette-clear-history:hover {
  color: var(--el-color-primary, #409eff);
}

.palette-remove-item {
  margin-left: auto;
  font-size: 16px;
  color: var(--el-text-color-placeholder, #a8abb2);
  cursor: pointer;
  padding: 0 4px;
}

.palette-remove-item:hover {
  color: var(--el-color-danger, #f56c6c);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.palette-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.palette-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.palette-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-7, #c6e2ff);
  color: var(--el-color-primary, #409eff);
  font-size: 13px;
  font-weight: 600;
}

.palette-item-icon {
  font-size: 16px;
  color: var(--el-text-color-secondary, #909399);
}

.palette-item-name {
  font-size: 14px;
  color: var(--el-text-color-primary, #303133);
}

.palette-empty {
  text-align: center;
  padding: 20px 16px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 14px;
}

.palette-footer {
  display: flex;
  justify-content: center;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.palette-view-all {
  font-size: 13px;
  color: var(--el-color-primary, #409eff);
  cursor: pointer;
}

.palette-view-all:hover {
  text-decoration: underline;
}

.palette-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.15s ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
</style>
