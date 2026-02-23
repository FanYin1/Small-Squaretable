# Iteration 34: Search System Upgrade

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix XSS vulnerability in search highlighting, wire disconnected filters to the API, add search snippets via `ts_headline`, upgrade worldbook search from ILIKE to full-text search, and add search analytics logging — making the search system secure, functional, and observable.

**Architecture:** 6 tasks in dependency order. T1 fixes the XSS vulnerability (critical). T2 wires filters to the API. T3 adds `ts_headline` search snippets. T4 upgrades worldbook search to FTS. T5 adds search analytics. T6 adds i18n keys and runs final verification. T1-T5 are independent of each other.

**Tech Stack:** TypeScript strict, Hono.js, Drizzle ORM, PostgreSQL (tsvector, ts_headline, pg_trgm), Vue 3, Element Plus, Vitest

---

### Task 1: Fix XSS in search result highlighting

**Files:**
- Modify: `src/client/utils/highlight.ts`
- Modify: `src/client/pages/Search.vue`
- Create: `src/client/utils/highlight.spec.ts` (or add to existing spec)

**What to do:**

The `highlightText()` function wraps matches with `<mark>` tags, and the results are rendered via `v-html` in Search.vue. If the source text contains HTML (e.g. `<script>alert(1)</script>`), it gets injected directly into the DOM.

1. **highlight.ts** — HTML-escape the text before applying `<mark>` tags:
```ts
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function highlightText(text: string, query: string): string {
  if (!text || !query) return escapeHtml(text || '');

  const keywords = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex);

  if (keywords.length === 0) return escapeHtml(text);

  // Escape HTML first, then apply highlighting
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  return escaped.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
```

2. No changes needed in Search.vue — the `v-html` usage is now safe because `highlightText` escapes HTML before inserting `<mark>` tags.

**Tests**: ~5 tests
- Highlights matching keyword with `<mark>` tag
- Returns escaped HTML when no query provided
- Escapes `<script>` tags in source text before highlighting
- Handles multiple keywords
- Returns empty string for null/undefined input

**Commit:** `fix(search): escape HTML in highlightText to prevent XSS via v-html`

---

### Task 2: Wire search filters to the API

**Files:**
- Modify: `src/server/routes/search.ts` (add filter query params)
- Modify: `src/client/pages/Search.vue` (send filters in API call)
- Modify: `src/client/services/search.api.ts` (add filter params)
- Create: `src/server/routes/search.spec.ts`

**What to do:**

The Search.vue page collects `dateRange`, `category`, and `tags` filters via `SearchFilterPanel`, but `doSearch()` never sends them to the API. The server's global search endpoint doesn't accept them either.

1. **search.ts route** — extend `globalSearchSchema` to accept optional filters:
```ts
const globalSearchSchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(['all', 'characters', 'messages', 'worldbooks']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().max(50).optional(),
  tags: z.string().max(500).optional(), // comma-separated
  dateFrom: z.string().optional(), // ISO date string YYYY-MM-DD
  dateTo: z.string().optional(),
});
```

Pass these to `searchService.searchCharacters()`:
```ts
searchCharacters
  ? searchService.searchCharacters({
      query: q,
      sort: 'relevance',
      filter: 'all',
      userId: user.id,
      page,
      limit,
      category: category || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    })
  : null,
```

For `dateFrom`/`dateTo`, add date filtering to `SearchService.searchCharacters()` in `search.service.ts`:
```ts
// In SearchOptions interface (src/types/search.ts):
dateFrom?: string;
dateTo?: string;

// In searchCharacters conditions:
if (options.dateFrom) {
  conditions.push(sql`${characters.createdAt} >= ${options.dateFrom}::timestamptz`);
}
if (options.dateTo) {
  conditions.push(sql`${characters.createdAt} <= ${options.dateTo}::timestamptz`);
}
```

2. **search.api.ts** — extend `GlobalSearchParams`:
```ts
export interface GlobalSearchParams {
  q: string;
  type?: 'all' | 'characters' | 'messages' | 'worldbooks';
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}
```

Update `globalSearch` to send the new params:
```ts
if (params.category) searchParams.set('category', params.category);
if (params.tags?.length) searchParams.set('tags', params.tags.join(','));
if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
if (params.dateTo) searchParams.set('dateTo', params.dateTo);
```

3. **Search.vue** — update `doSearch()` to pass filters:
```ts
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
```

Also add debounce to the filter watcher to avoid rapid re-fetches:
```ts
import { useDebounceFn } from '@vueuse/core';
// or inline:
let filterTimeout: ReturnType<typeof setTimeout>;
watch(filters, () => {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    currentPage.value = 1;
    if (searchQuery.value.trim()) doSearch();
  }, 300);
}, { deep: true });
```
Check if `@vueuse/core` is available. If not, use `setTimeout` debounce.

**Tests** (search.spec.ts): ~6 tests
- Global search returns results for valid query
- Global search with category filter passes category to service
- Global search with tags filter splits comma-separated tags
- Global search with date range filters by date
- Global search returns 400 for empty query
- Suggestions endpoint returns character suggestions

**Commit:** `feat(search): wire filter panel (category, tags, dateRange) to search API`

---

### Task 3: Add search snippets with ts_headline

**Files:**
- Modify: `src/server/services/search.service.ts`
- Modify: `src/types/search.ts`
- Modify: `src/server/routes/search.ts`
- Modify: `src/client/pages/Search.vue`

**What to do:**

Currently search results return the full `description` field. Use PostgreSQL's `ts_headline()` to return highlighted snippets instead, which is both more useful and server-side safe (no client-side v-html XSS risk for snippets).

1. **search.ts types** — add `snippet` to `SearchResultItem`:
```ts
export interface SearchResultItem {
  // ... existing fields ...
  snippet?: string; // ts_headline HTML snippet
}
```

2. **search.service.ts** — add `ts_headline` to the select when a query is present:
```ts
// In the select object, replace the description field conditionally:
const selectFields = {
  id: characters.id,
  name: characters.name,
  description: characters.description,
  avatarUrl: characters.avatarUrl,
  category: characters.category,
  tags: characters.tags,
  isPublic: characters.isPublic,
  isNsfw: characters.isNsfw,
  downloadCount: characters.downloadCount,
  viewCount: characters.viewCount,
  ratingAvg: characters.ratingAvg,
  ratingCount: characters.ratingCount,
  createdAt: characters.createdAt,
  updatedAt: characters.updatedAt,
  rank: tsQuery
    ? sql<number>`ts_rank(${characters.searchVector}, ${tsQuery})`
    : sql<number>`1`,
  snippet: tsQuery
    ? sql<string>`ts_headline('english', coalesce(${characters.description}, ''), ${tsQuery}, 'MaxWords=35, MinWords=15, MaxFragments=1')`
    : sql<string>`substring(coalesce(${characters.description}, '') from 1 for 150)`,
};
```

Map `snippet` in the result items:
```ts
snippet: result.snippet || undefined,
```

3. **Search.vue** — use `snippet` instead of `description` for character results when available:
```html
<div class="character-desc" v-html="char.snippet || highlightText(char.description || '', searchQuery)" />
```

Note: `ts_headline` returns HTML with `<b>` tags by default. Configure it to use `<mark class="search-highlight">` instead:
```ts
sql<string>`ts_headline('english', coalesce(${characters.description}, ''), ${tsQuery}, 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=''<mark class="search-highlight">'', StopSel=''</mark>''')`
```

**Tests**: ~3 tests (add to search.service.spec.ts)
- searchCharacters returns snippet field when query is provided
- searchCharacters returns truncated description as snippet for wildcard query
- snippet field is included in result items

**Commit:** `feat(search): add ts_headline search snippets for character results`

---

### Task 4: Upgrade worldbook search from ILIKE to full-text search

**Files:**
- Modify: `src/db/repositories/worldbook-entry.repository.ts`
- Create: `src/db/migrations/0026_worldbook_search_vector.sql`
- Modify: `src/db/schema/worldbook-entries.ts` (or wherever worldbook_entries schema is defined)

**What to do:**

The `searchByUser` method uses `ILIKE` which doesn't scale and can't rank results. Add a `search_vector` column to `worldbook_entries` and use full-text search.

1. **Find the worldbook_entries schema** — check `src/db/schema/` for the worldbook entries table definition. Add a `searchVector` tsvector column:
```ts
searchVector: tsvector('search_vector'),
```

2. **Migration** (`0026_worldbook_search_vector.sql`):
```sql
-- Add search_vector to worldbook_entries
ALTER TABLE worldbook_entries ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE worldbook_entries SET search_vector =
  setweight(to_tsvector('english', coalesce(keyword, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

-- Create GIN index
CREATE INDEX IF NOT EXISTS idx_worldbook_entries_search_vector
  ON worldbook_entries USING gin(search_vector);

-- Create trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION worldbook_entries_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.keyword, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_worldbook_entries_search_vector ON worldbook_entries;
CREATE TRIGGER trg_worldbook_entries_search_vector
  BEFORE INSERT OR UPDATE ON worldbook_entries
  FOR EACH ROW EXECUTE FUNCTION worldbook_entries_search_vector_update();
```

3. **worldbook-entry.repository.ts** — update `searchByUser` to use FTS with ILIKE fallback for short queries:
```ts
async searchByUser(
  userId: string,
  query: string,
  limit = 20,
): Promise<Array<{ id: string; keyword: string; content: string; worldbookId: string; worldbookName: string }>> {
  // Short queries: fall back to ILIKE (same pattern as message.repository)
  if (query.length < 3) {
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    return await this.db
      .select({
        id: worldbookEntries.id,
        keyword: worldbookEntries.keyword,
        content: worldbookEntries.content,
        worldbookId: worldbookEntries.worldbookId,
        worldbookName: worldbooks.name,
      })
      .from(worldbookEntries)
      .innerJoin(worldbooks, eq(worldbookEntries.worldbookId, worldbooks.id))
      .where(
        sql`${worldbooks.userId} = ${userId} AND (${worldbookEntries.keyword} ILIKE ${pattern} OR ${worldbookEntries.content} ILIKE ${pattern})`,
      )
      .limit(limit);
  }

  // Full-text search with ranking
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  return await this.db
    .select({
      id: worldbookEntries.id,
      keyword: worldbookEntries.keyword,
      content: worldbookEntries.content,
      worldbookId: worldbookEntries.worldbookId,
      worldbookName: worldbooks.name,
    })
    .from(worldbookEntries)
    .innerJoin(worldbooks, eq(worldbookEntries.worldbookId, worldbooks.id))
    .where(
      sql`${worldbooks.userId} = ${userId} AND ${worldbookEntries.searchVector} @@ ${tsQuery}`,
    )
    .orderBy(sql`ts_rank(${worldbookEntries.searchVector}, ${tsQuery}) DESC`)
    .limit(limit);
}
```

**Tests**: ~3 tests (add to worldbook-entry.repository.spec.ts or create new)
- searchByUser with short query uses ILIKE fallback
- searchByUser with 3+ char query uses full-text search
- searchByUser returns results with correct shape

**Commit:** `feat(search): upgrade worldbook search from ILIKE to full-text search`

---

### Task 5: Add search analytics logging

**Files:**
- Modify: `src/server/routes/search.ts`

**What to do:**

Add structured logging for search queries to enable search analytics (popular queries, zero-result queries, latency).

1. **search.ts** — add timing and analytics logging to the global search handler:
```ts
// At the start of the handler:
const searchStart = Date.now();

// After building the data object:
const searchDuration = Date.now() - searchStart;

searchLogger.info('Search executed', {
  search: {
    query: q,
    type,
    page,
    limit,
    totalResults: data.total,
    characterCount: data.characters.length,
    messageCount: data.messages.length,
    worldbookCount: data.worldbooks.length,
    durationMs: searchDuration,
    hasResults: data.total > 0,
    cached: false,
  },
  userId: user.id,
});
```

Also log cache hits:
```ts
if (cached) {
  searchLogger.info('Search executed', {
    search: { query: q, type, cached: true, durationMs: Date.now() - searchStart },
    userId: user.id,
  });
  // ... return cached response
}
```

2. Add timing header to search responses:
```ts
c.header('X-Search-Duration', `${searchDuration}ms`);
```

**Tests**: ~2 tests (add to search.spec.ts)
- Search logs query analytics with correct structure
- Search response includes X-Search-Duration header

**Commit:** `feat(search): add search analytics logging with timing`

---

### Task 6: i18n + final verification

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add any new i18n keys needed for search enhancements. Check if any new UI strings were introduced. Likely minimal — the filter panel already has i18n keys.

2. Run full verification:
   - `npx vitest run` — expect 1783+ tests passing, 0 failures
   - `npx tsc --noEmit` — expect 0 errors

**Commit:** `chore: iteration 34 verification — search system upgrade`

---

## Verification

After all tasks:
- `npx vitest run` — 1783+ tests passing, 0 failures
- `npx tsc --noEmit` — 0 errors
- `highlightText` escapes HTML before inserting `<mark>` tags (no XSS)
- Search filters (category, tags, dateRange) are sent to API and applied
- Character search results include `snippet` from `ts_headline`
- Worldbook search uses full-text search with GIN index
- Search queries are logged with timing and result counts
