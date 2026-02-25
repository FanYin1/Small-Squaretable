# Iteration 43: Search Enhancement (搜索增强)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance the search system with a Ctrl+K global search shortcut, search history management, tab result count badges, and comprehensive test coverage.

**Architecture:** 5 tasks. T1 adds frontend component tests for Search.vue and SearchFilterPanel.vue. T2 implements a Ctrl+K command palette overlay for quick search. T3 adds search history management (clear history endpoint + UI). T4 adds result count badges on search tabs. T5 runs final verification. T1 is independent; T2 depends on T1; T3 depends on T2; T4 depends on T2.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add search component tests

**Files:**
- Create: `src/client/pages/Search.spec.ts`
- Create: `src/client/components/search/SearchFilterPanel.spec.ts`

**What to do:**

1. `Search.spec.ts` — ~4 tests:
- Renders search input and tabs
- Calls globalSearch on enter key
- Shows character results when data is returned
- Shows empty state when no results

Props/setup: Mount with vue-i18n plugin, stub Element Plus components, mock `searchApi.globalSearch`, mock `useRoute` to return `{ query: { q: '' } }`, mock `useRouter`.

2. `SearchFilterPanel.spec.ts` — ~3 tests:
- Renders all filter groups (type, date range, category, tags)
- Emits update:modelValue when type changes
- Emits update:modelValue when category changes

Props: `modelValue` with `{ type: 'all', dateRange: null, category: '', tags: [] }`.

Mock: `useI18n` (return `t` that returns the key).

Follow the testing patterns from other component specs (mount with i18n plugin, stub Element Plus components).

**Commit:** `test(search): add Search page and SearchFilterPanel component tests`

---

### Task 2: Implement Ctrl+K global search command palette

**Files:**
- Create: `src/client/components/search/SearchCommandPalette.vue`
- Modify: `src/client/App.vue` (or the root layout component that wraps all pages)
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `SearchCommandPalette.vue` — a modal overlay triggered by Ctrl+K (or Cmd+K on Mac):

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { searchApi } from '@client/services/search.api';
import type { SearchSuggestion } from '@client/services/search.api';

const { t } = useI18n();
const router = useRouter();

const visible = ref(false);
const query = ref('');
const suggestions = ref<SearchSuggestion | null>(null);
const loading = ref(false);

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
    visible.value = false;
    query.value = '';
    suggestions.value = null;
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

function goToSearch() {
  if (query.value.trim()) {
    router.push({ name: 'Search', query: { q: query.value.trim() } });
    visible.value = false;
    query.value = '';
    suggestions.value = null;
  }
}

function goToCharacter(id: string) {
  router.push({ name: 'CharacterDetail', params: { id } });
  visible.value = false;
  query.value = '';
  suggestions.value = null;
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>
```

Template: An `el-dialog` (or custom overlay) with:
- Search input (autofocus when opened)
- Character suggestions list (clickable → navigate to character)
- Recent searches list (clickable → fill input)
- "View all results" link at bottom → navigates to `/search?q=...`
- Press Enter → navigate to full search page

2. Register `SearchCommandPalette` in the root layout. Check `App.vue` or the layout component that wraps authenticated pages. Add `<SearchCommandPalette />` so it's always available.

3. Add i18n keys under `search`:
- en-US: `"commandPalette": "Quick Search"`, `"pressEnterToSearch": "Press Enter to search"`, `"viewAllResults": "View all results"`, `"noSuggestions": "No suggestions"`
- zh-CN: `"commandPalette": "快速搜索"`, `"pressEnterToSearch": "按回车搜索"`, `"viewAllResults": "查看全部结果"`, `"noSuggestions": "暂无建议"`

**Tests:** ~2 tests in `src/client/components/search/SearchCommandPalette.spec.ts`
- Opens on Ctrl+K keydown
- Navigates to search page on Enter

**Commit:** `feat(search): add Ctrl+K global search command palette`

---

### Task 3: Add search history management

**Files:**
- Modify: `src/server/routes/search.ts`
- Modify: `src/client/services/search.api.ts`
- Modify: `src/client/components/search/SearchCommandPalette.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add `DELETE /search/history` endpoint to clear a user's recent searches:
```ts
searchRoutes.delete(
  '/history',
  authMiddleware(),
  async (c) => {
    const user = c.get('user') as { id: string };
    try {
      const redisClient = await getRedisClient();
      await redisClient.del(`search:recent:${user.id}`);
      return c.json<ApiResponse>({
        success: true,
        data: null,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      searchLogger.error('Failed to clear search history', { error: String(error) });
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'CLEAR_HISTORY_ERROR', message: 'Failed to clear search history' },
        meta: { timestamp: new Date().toISOString() },
      }, 500);
    }
  },
);
```

2. Add `DELETE /search/history/:query` endpoint to remove a single recent search:
```ts
searchRoutes.delete(
  '/history/:query',
  authMiddleware(),
  async (c) => {
    const user = c.get('user') as { id: string };
    const queryToRemove = decodeURIComponent(c.req.param('query'));
    try {
      const redisClient = await getRedisClient();
      await redisClient.lRem(`search:recent:${user.id}`, 0, queryToRemove);
      return c.json<ApiResponse>({
        success: true,
        data: null,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      searchLogger.error('Failed to remove search history item', { error: String(error) });
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'REMOVE_HISTORY_ERROR', message: 'Failed to remove search history item' },
        meta: { timestamp: new Date().toISOString() },
      }, 500);
    }
  },
);
```

3. Add API methods to `search.api.ts`:
```ts
clearSearchHistory: () => api.delete<null>('/search/history'),
removeSearchHistoryItem: (query: string) => api.delete<null>(`/search/history/${encodeURIComponent(query)}`),
```

4. In `SearchCommandPalette.vue`, add:
- A "Clear history" link next to the "Recent Searches" header
- An "×" button on each recent search item to remove it individually
- Load recent searches when the palette opens (from the suggestions endpoint)

5. Add i18n keys under `search`:
- en-US: `"clearHistory": "Clear History"`, `"historyCleared": "Search history cleared"`, `"removeHistoryItem": "Remove"`
- zh-CN: `"clearHistory": "清除历史"`, `"historyCleared": "搜索历史已清除"`, `"removeHistoryItem": "删除"`

**Tests:** ~2 tests added to `src/server/routes/search.spec.ts`
- DELETE /history clears recent searches
- DELETE /history/:query removes single item

**Commit:** `feat(search): add search history management`

---

### Task 4: Add result count badges on search tabs

**Files:**
- Modify: `src/client/pages/Search.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. After search results are returned, compute per-type counts:
```ts
const characterCount = computed(() => results.value?.characters?.length ?? 0);
const messageCount = computed(() => results.value?.messages?.length ?? 0);
const worldbookCount = computed(() => results.value?.worldbooks?.length ?? 0);
```

2. Update the tab labels to include count badges when results exist:
```vue
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
<!-- Same for messages and worldbooks -->
```

3. Add CSS for the badge positioning:
```css
.tab-badge {
  margin-left: 6px;
}
.tab-badge :deep(.el-badge__content) {
  font-size: 11px;
}
```

4. No new i18n keys needed — badges are numeric.

**Tests:** ~1 test added to `src/client/pages/Search.spec.ts`
- Shows count badges on tabs when results exist

**Commit:** `feat(search): add result count badges on search tabs`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1935+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Search page tests pass
   - SearchFilterPanel tests pass
   - Ctrl+K opens command palette
   - Search history can be cleared
   - Tab badges show result counts

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1935+ tests passing
- `npx tsc --noEmit` — 0 errors
- Search component tests (7 tests)
- Ctrl+K command palette with suggestions
- Search history management (clear all / remove single)
- Result count badges on tabs
