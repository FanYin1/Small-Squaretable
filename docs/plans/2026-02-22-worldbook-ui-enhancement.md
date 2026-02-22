# Iteration 22: World Book UI Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the world book management system with full CRUD backend, entry editor UI, trigger condition visualization, scope management, and SillyTavern format import/export.

**Architecture:** The backend stubs (empty router, create-only repositories) are fleshed out into full CRUD. A new WorldBookDetail page provides an entry editor with all SillyTavern V2 fields (keywords, injection position, timing, recursion). The existing WorldBooks list page gains navigation to the detail page and import/export buttons. A Pinia store manages state. The world info engine stub is implemented with keyword matching for chat prompt injection.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono.js + Zod, Vue 3 + Pinia + Element Plus, Vitest

---

### Task 1: Complete worldbook repository CRUD operations

**Files:**
- Modify: `src/db/repositories/worldbook.repository.ts`

**What to do:**

The repository currently only has `create()`. Add the missing CRUD methods:

```ts
async findById(id: string) {
  const [row] = await this.db.select().from(worldbooks).where(eq(worldbooks.id, id));
  return row ?? null;
}

async findByUser(userId: string) {
  return this.db.select().from(worldbooks)
    .where(eq(worldbooks.userId, userId))
    .orderBy(worldbooks.createdAt);
}

async findByCharacter(characterId: string) {
  return this.db.select().from(worldbooks)
    .where(eq(worldbooks.characterId, characterId))
    .orderBy(worldbooks.createdAt);
}

async update(id: string, data: Partial<{ name: string; description: string | null; scope: string; isEnabled: boolean }>) {
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.scope) updateData.scope = data.scope as 'global' | 'character' | 'persona' | 'chat';
  const [row] = await this.db.update(worldbooks).set(updateData).where(eq(worldbooks.id, id)).returning();
  return row ?? null;
}

async delete(id: string) {
  await this.db.delete(worldbooks).where(eq(worldbooks.id, id));
}
```

Import `desc` from `drizzle-orm` if needed for ordering.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'worldbook.repository' | head -5`

**Commit:** `feat(db): complete worldbook repository CRUD`

---

### Task 2: Complete worldbook-entry repository CRUD operations

**Files:**
- Modify: `src/db/repositories/worldbook-entry.repository.ts`

**What to do:**

Add the missing CRUD methods for entries:

```ts
async findByWorldBook(worldbookId: string) {
  return this.db.select().from(worldbookEntries)
    .where(eq(worldbookEntries.worldbookId, worldbookId))
    .orderBy(worldbookEntries.position);
}

async findById(id: string) {
  const [row] = await this.db.select().from(worldbookEntries).where(eq(worldbookEntries.id, id));
  return row ?? null;
}

async update(id: string, data: {
  keyword?: string;
  content?: string;
  position?: number;
  isEnabled?: boolean;
  priority?: number;
  settings?: Record<string, unknown>;
}) {
  const updateData = { ...data, updatedAt: new Date() };
  const [row] = await this.db.update(worldbookEntries).set(updateData)
    .where(eq(worldbookEntries.id, id)).returning();
  return row ?? null;
}

async delete(id: string) {
  await this.db.delete(worldbookEntries).where(eq(worldbookEntries.id, id));
}

async countByWorldBook(worldbookId: string): Promise<number> {
  const result = await this.db.select({ count: sql<number>`count(*)::int` })
    .from(worldbookEntries)
    .where(eq(worldbookEntries.worldbookId, worldbookId));
  return result[0]?.count ?? 0;
}
```

Import `sql` from `drizzle-orm`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'worldbook-entry' | head -5`

**Commit:** `feat(db): complete worldbook-entry repository CRUD`

---

### Task 3: Implement worldbook API routes

**Files:**
- Modify: `src/server/routes/worldbooks.ts`

**What to do:**

Replace the empty stub with full CRUD routes. The router is already mounted at `/api/v1/worldbooks` in `src/server/index.ts` with tenant middleware.

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';
import type { ApiResponse } from '../../types/api';

export const worldbooksRouter = new Hono();

const createWorldBookSchema = z.object({
  name: z.string().min(1).max(255),
  scope: z.enum(['global', 'character', 'persona', 'chat']).default('global'),
  description: z.string().max(2000).optional(),
  characterId: z.string().uuid().optional(),
});

const updateWorldBookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  scope: z.enum(['global', 'character', 'persona', 'chat']).optional(),
  description: z.string().max(2000).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

const createEntrySchema = z.object({
  keyword: z.string().min(1),
  content: z.string().min(1),
  position: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  settings: z.record(z.unknown()).default({}),
});

const updateEntrySchema = z.object({
  keyword: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  position: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  settings: z.record(z.unknown()).optional(),
});
```

Endpoints to implement:

1. `GET /` — list user's world books (authMiddleware, filter by user.id)
2. `POST /` — create world book (authMiddleware, zValidator)
3. `GET /:id` — get world book by ID (authMiddleware, ownership check)
4. `PATCH /:id` — update world book (authMiddleware, ownership check)
5. `DELETE /:id` — delete world book (authMiddleware, ownership check)
6. `GET /:id/entries` — list entries for a world book (authMiddleware, ownership check)
7. `POST /:id/entries` — create entry (authMiddleware, ownership check, zValidator)
8. `PATCH /:id/entries/:entryId` — update entry (authMiddleware)
9. `DELETE /:id/entries/:entryId` — delete entry (authMiddleware)

All ownership checks: fetch world book, verify `worldbook.userId === user.id`, return 404 if not found or not owned.

Follow the pattern from `src/server/routes/chats.ts` for response format (`c.json<ApiResponse>(...)`).

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'worldbooks' | head -10`

**Commit:** `feat(server): implement worldbook CRUD API routes`

---

### Task 4: Create worldbook Pinia store

**Files:**
- Create: `src/client/stores/worldbook.ts`

**What to do:**

Create a Pinia composition store for world book state management:

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { worldbookApi } from '@client/services/worldbook.api';
import { createLogger } from '@client/utils/logger';
import type { WorldBookDto } from '@client/services/worldbook.api';

const logger = createLogger('WorldBookStore');

export interface WorldBookEntry {
  id: string;
  worldbookId: string;
  keyword: string;
  content: string;
  position: number;
  isEnabled: boolean;
  priority: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const useWorldBookStore = defineStore('worldbook', () => {
  const worldbooks = ref<WorldBookDto[]>([]);
  const currentWorldBook = ref<WorldBookDto | null>(null);
  const entries = ref<WorldBookEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Actions: fetchWorldBooks, fetchWorldBook, createWorldBook, updateWorldBook, deleteWorldBook
  // Actions: fetchEntries, createEntry, updateEntry, deleteEntry

  // Return all state and actions
});
```

Also update `src/client/services/worldbook.api.ts` to add entry API methods:

```ts
// Entry endpoints
getEntries: (worldbookId: string) => api.get<WorldBookEntry[]>(`/worldbooks/${worldbookId}/entries`),
createEntry: (worldbookId: string, data: CreateEntryInput) => api.post<WorldBookEntry>(`/worldbooks/${worldbookId}/entries`, data),
updateEntry: (worldbookId: string, entryId: string, data: Partial<CreateEntryInput>) => api.patch<WorldBookEntry>(`/worldbooks/${worldbookId}/entries/${entryId}`, data),
deleteEntry: (worldbookId: string, entryId: string) => api.delete(`/worldbooks/${worldbookId}/entries/${entryId}`),
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'worldbook' | head -10`

**Commit:** `feat(client): add worldbook Pinia store and entry API methods`

---

### Task 5: Create WorldBookDetail page with entry editor

**Files:**
- Create: `src/client/pages/WorldBookDetail.vue`
- Modify: `src/client/router/routes.ts` — add route

**What to do:**

Create the main world book detail/editor page. This is the core of the iteration.

Layout:
- Header: world book name (editable), scope tag, enabled toggle, back button
- Toolbar: "Add Entry" button, search/filter entries, import/export buttons
- Entry list: table or card list showing all entries with inline editing

Each entry card/row shows:
- Keywords (comma-separated tags)
- Content preview (truncated)
- Injection position label (using i18n `worldBookEditor.pos0`-`pos6`)
- Enabled toggle
- Priority badge
- Expand/edit button → opens full entry editor

Entry editor (inline expand or dialog):
- Keywords input (el-tag with add/remove, maps to `settings.keys`)
- Secondary keywords (el-tag, maps to `settings.keysSecondary`)
- Selective logic dropdown (AND_ANY, AND_ALL, NOT_ANY, NOT_ALL)
- Content textarea (the actual lore text)
- Comment/name input
- Injection position dropdown (7 positions: before, after, EMTop, EMBottom, ANTop, ANBottom, atDepth)
- Depth input (number, only when position is atDepth)
- Insertion order (number)
- Timing controls: constant (boolean), probability (0-100), sticky (number), cooldown (number), delay (number)
- Match options: caseSensitive, matchWholeWords
- Recursion: preventRecursion, excludeRecursion

Use existing i18n keys from `worldBookEditor.*` section — they already cover all these fields.

Route: `/worldbooks/:id` (name: `WorldBookDetail`, requires auth)

Read `src/client/pages/WorldBooks.vue` for the existing list page pattern. Add a click handler on the table row name to navigate to the detail page.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'WorldBookDetail|routes' | head -10`

**Commit:** `feat(client): add WorldBookDetail page with entry editor`

---

### Task 6: Add world book import/export

**Files:**
- Modify: `src/client/services/worldbook.api.ts` — add import/export methods
- Modify: `src/client/pages/WorldBookDetail.vue` — add import/export buttons
- Modify: `src/server/routes/worldbooks.ts` — add import/export endpoints

**What to do:**

1. Backend: Add two endpoints:

`POST /:id/import` — accepts a SillyTavern `character_book` JSON object, creates entries from it. Reuse the mapping logic from `src/server/routes/characters.ts` `createCharacterWorldBook()` helper (position code mapping, selective logic mapping). Extract the shared mapping into a utility or inline it.

`GET /:id/export` — returns the world book and all entries in SillyTavern `character_book` format:
```json
{
  "name": "...",
  "entries": {
    "0": { "keys": [...], "content": "...", "position": 0, ... },
    "1": { ... }
  }
}
```

2. Frontend: Add import/export buttons to the WorldBookDetail toolbar:
- Export: calls API, triggers JSON file download
- Import: file input, reads JSON, calls import API, refreshes entries

3. API service: Add `importEntries` and `exportWorldBook` methods.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'worldbook' | head -10`

**Commit:** `feat: add world book import/export (SillyTavern format)`

---

### Task 7: Update WorldBooks list page with navigation and entry counts

**Files:**
- Modify: `src/client/pages/WorldBooks.vue`

**What to do:**

1. Make world book names clickable — navigate to `WorldBookDetail` page on click:
```ts
router.push({ name: 'WorldBookDetail', params: { id: book.id } });
```

2. Add an "Entries" count column to the table showing how many entries each world book has. The backend `GET /worldbooks` should return `entriesCount` — if it doesn't, add a subquery or post-fetch count.

3. Add import button to the list page toolbar — allows importing a standalone world book JSON file (creates a new world book + entries).

4. Replace the inline `api.get/post/patch/delete` calls with the `worldbookApi` service (already defined in `worldbook.api.ts`) or the Pinia store actions.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'WorldBooks' | head -5`

**Commit:** `feat(client): update WorldBooks list with navigation and entry counts`

---

### Task 8: Implement world info engine keyword matching

**Files:**
- Modify: `src/server/services/worldinfo-engine.service.ts`
- Create: `src/server/services/worldinfo-engine.service.spec.ts`

**What to do:**

Replace the stub `scan()` with real keyword matching logic:

1. Fetch all enabled world book entries for the character (via `worldBookRepository.findByCharacter` + `worldBookEntryRepository.findByWorldBook`)
2. Also fetch global world books (scope = 'global') for the user
3. Scan the last N messages (configurable, default 10) for keyword matches
4. For each entry, check if any of its `settings.keys` appear in the scanned text
5. If `settings.keysSecondary` exists, apply selective logic (AND_ANY, AND_ALL, NOT_ANY, NOT_ALL)
6. Collect activated entries, respect token budget (sum content lengths, stop when budget exceeded)
7. Group activated entries by injection position
8. Return `WorldInfoResult` with content strings for each position
9. Populate `debugInfo` with scan metrics

Tests (mock repositories):
- "activates entry when keyword found in messages"
- "does not activate disabled entries"
- "respects selective logic AND_ANY"
- "respects selective logic NOT_ALL"
- "respects token budget limit"
- "returns empty result when no entries match"
- "scans both character and global world books"

**Verification:**
Run: `npx vitest run src/server/services/worldinfo-engine.service.spec.ts`

**Commit:** `feat(server): implement world info engine keyword matching`

---

### Task 9: Add i18n keys for new world book features

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Check if any new i18n keys are needed beyond the existing `worldBooks.*`, `worldBookEditor.*`, and `worldBookSettings.*` sections. The existing sections are comprehensive (~124 keys total). Add any missing keys for:

- Import/export buttons and dialogs
- Entry count column
- Any new UI elements added in Tasks 5-7

Likely additions to `worldBooks.*`:
```json
{
  "worldBooks": {
    "importBook": "Import World Book",
    "exportBook": "Export World Book",
    "importSuccess": "World book imported successfully",
    "importFailed": "Failed to import world book",
    "exportFailed": "Failed to export world book",
    "entriesCount": "{count} entries",
    "noEntries": "No entries yet",
    "addEntry": "Add Entry",
    "deleteEntry": "Delete Entry",
    "deleteEntryConfirm": "Delete this entry?",
    "entryDeleted": "Entry deleted",
    "viewEntries": "View Entries"
  }
}
```

Add corresponding zh-CN translations.

**Verification:**
Run: `node -e "JSON.parse(require('fs').readFileSync('src/client/i18n/locales/en-US.json'))"`

**Commit:** `feat(i18n): add world book import/export and entry management translations`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 22 entry:
```markdown
### 迭代 22: 世界书 UI 增强 ✅ (2026-02-22)
- ✅ **后端 CRUD** — worldbook + entry 完整 CRUD API (9 端点)
- ✅ **世界书详情页** — WorldBookDetail 条目编辑器 (全部 SillyTavern V2 字段)
- ✅ **触发条件可视化** — 关键词标签、选择逻辑、注入位置下拉
- ✅ **作用域管理** — global/character/persona/chat 四级作用域
- ✅ **导入/导出** — SillyTavern character_book JSON 格式
- ✅ **世界信息引擎** — 关键词匹配、选择逻辑、Token 预算、7 注入位置
- ✅ **i18n** — worldBooks.* 新增键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 22 (world book UI enhancement)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- World books can be created, edited, deleted from the list page
- Clicking a world book navigates to the detail page
- Entries can be added, edited, deleted with all SillyTavern V2 fields
- World books can be imported/exported in SillyTavern format
- World info engine activates entries based on keyword matching in chat
