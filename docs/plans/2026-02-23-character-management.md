# Iteration 33: Character Management Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add batch delete, character duplication, character grouping (collections), version restore, and a server-side JSON export endpoint — making character management more powerful for users with large libraries.

**Architecture:** 7 tasks in dependency order. T1 adds batch delete (server + client). T2 adds character duplication. T3 adds character collections (DB schema + API). T4 adds collection UI. T5 adds version restore. T6 adds server-side JSON export endpoint. T7 runs final verification. T1-T2 are independent. T3 must complete before T4. T5-T6 are independent of all others.

**Tech Stack:** TypeScript strict, Hono.js, Drizzle ORM, PostgreSQL, Vue 3, Element Plus, Vitest

---

### Task 1: Batch delete — server endpoint + client wiring

**Files:**
- Modify: `src/server/routes/characters.ts`
- Modify: `src/db/repositories/character.repository.ts`
- Modify: `src/client/services/character.api.ts`
- Modify: `src/client/pages/MyCharacters.vue`
- Create: `src/server/routes/characters-batch.spec.ts` (or add to existing spec)

**What to do:**

1. **Repository** — add `bulkDelete` to `character.repository.ts`:
```ts
async bulkDelete(ids: string[], tenantId: string): Promise<number> {
  const result = await this.db
    .delete(characters)
    .where(and(inArray(characters.id, ids), eq(characters.tenantId, tenantId)))
    .returning({ id: characters.id });
  return result.length;
}
```
Import `inArray` from `drizzle-orm`.

2. **Route** — add `POST /characters/batch-delete` in `characters.ts`:
```ts
const batchDeleteSchema = z.object({
  characterIds: z.array(z.string().uuid()).min(1).max(50),
});

characterRoutes.post('/batch-delete', authMiddleware(), zValidator('json', batchDeleteSchema), async (c) => {
  const user = c.get('user');
  const { characterIds } = c.req.valid('json');
  const deleted = await characterRepository.bulkDelete(characterIds, user.tenantId);
  // Invalidate cache for each deleted character
  for (const id of characterIds) {
    await cacheService.invalidateCharacter(id);
  }
  return c.json({ success: true, data: { deleted }, meta: { timestamp: new Date().toISOString() } });
});
```
Place this BEFORE the `/:id` routes to avoid route conflicts.

3. **Client API** — add to `character.api.ts`:
```ts
async batchDelete(characterIds: string[]): Promise<{ deleted: number }> {
  const res = await apiClient.post('/characters/batch-delete', { characterIds });
  return res.data;
}
```

4. **MyCharacters.vue** — add a batch delete button next to the existing batch export buttons. Wire it to call `characterApi.batchDelete(selectedIds.value)` with an `ElMessageBox.confirm` confirmation dialog. After success, refetch characters and clear selection.

**Tests**: ~4 tests
- Batch delete returns count of deleted characters
- Batch delete with empty array returns 400 (Zod validation)
- Batch delete with >50 IDs returns 400
- Batch delete only deletes characters belonging to the user's tenant

**Commit:** `feat(characters): add batch delete endpoint and UI`

---

### Task 2: Character duplication (clone)

**Files:**
- Modify: `src/server/routes/characters.ts`
- Modify: `src/client/services/character.api.ts`
- Modify: `src/client/pages/MyCharacters.vue`

**What to do:**

1. **Route** — add `POST /characters/:id/duplicate`:
```ts
characterRoutes.post('/:id/duplicate', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  const original = await characterService.getById(characterId);
  if (!original) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Character not found' } }, 404);
  }

  const duplicate = await characterRepository.create({
    tenantId: user.tenantId,
    creatorId: user.id,
    name: `${original.name} (Copy)`,
    description: original.description,
    avatarUrl: original.avatarUrl,
    cardData: original.cardData,
    tags: original.tags,
    category: original.category,
    isPublic: false, // Duplicates are always private
    isNsfw: original.isNsfw,
  });

  return c.json({ success: true, data: duplicate, meta: { timestamp: new Date().toISOString() } }, 201);
});
```

2. **Client API** — add `duplicateCharacter(id: string)` method.

3. **MyCharacters.vue** — add "Duplicate" to the per-card action dropdown menu. On click, call the API, show success toast, refetch characters.

**Tests**: ~3 tests
- Duplicate creates a new character with "(Copy)" suffix
- Duplicate sets isPublic to false
- Duplicate returns 404 for non-existent character

**Commit:** `feat(characters): add character duplication endpoint and UI`

---

### Task 3: Character collections — DB schema + API

**Files:**
- Create: `src/db/schema/character-collections.ts`
- Create: `src/db/migrations/0025_character_collections.sql`
- Create: `src/server/routes/character-collections.ts`
- Create: `src/server/routes/character-collections.spec.ts`
- Modify: `src/server/index.ts` (register route)

**What to do:**

1. **Schema** — create `character_collections` and `character_collection_items` tables:

```ts
// src/db/schema/character-collections.ts
import { pgTable, uuid, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

export const characterCollections = pgTable('character_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }), // hex color like #FF5733
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_collections_user').on(table.userId),
}));

export const characterCollectionItems = pgTable('character_collection_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => characterCollections.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  collectionIdx: index('idx_collection_items_collection').on(table.collectionId),
  characterIdx: index('idx_collection_items_character').on(table.characterId),
  uniqueItem: index('idx_collection_items_unique').on(table.collectionId, table.characterId),
}));
```

2. **Migration** (`0025_character_collections.sql`):
```sql
CREATE TABLE IF NOT EXISTS character_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS character_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES character_collections(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id, character_id)
);

CREATE INDEX idx_collections_user ON character_collections(user_id);
CREATE INDEX idx_collection_items_collection ON character_collection_items(collection_id);
CREATE INDEX idx_collection_items_character ON character_collection_items(character_id);
```

3. **Route** (`character-collections.ts`) — CRUD endpoints:
- `GET /` — list user's collections (with item count)
- `POST /` — create collection (name, description?, color?)
- `PATCH /:id` — update collection
- `DELETE /:id` — delete collection
- `POST /:id/characters` — add character(s) to collection (body: `{ characterIds: string[] }`)
- `DELETE /:id/characters/:characterId` — remove character from collection
- `GET /:id/characters` — list characters in a collection

All endpoints require `authMiddleware()`. Use direct Drizzle queries (no separate repository needed for this scope).

4. **Register** in `src/server/index.ts`:
```ts
import { characterCollectionRoutes } from './routes/character-collections';
app.route('/api/v1/character-collections', characterCollectionRoutes);
```
Add tenant middleware and CSRF protection for this route.

**Tests**: ~8 tests
- Create collection returns 201
- List collections returns user's collections with item counts
- Add character to collection succeeds
- Add duplicate character to collection returns 409
- Remove character from collection succeeds
- Delete collection cascades to items
- List characters in collection returns correct characters
- Cannot access another user's collections

**Commit:** `feat(characters): add character collections schema and API`

---

### Task 4: Character collections — frontend UI

**Files:**
- Create: `src/client/services/character-collection.api.ts`
- Create: `src/client/components/character/CollectionSidebar.vue`
- Modify: `src/client/pages/MyCharacters.vue`
- Modify: `src/client/types/index.ts`

**What to do:**

1. **Types** — add to `src/client/types/index.ts`:
```ts
export interface CharacterCollection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  itemCount: number;
  createdAt: string;
}
```

2. **API service** — create `character-collection.api.ts` with methods:
- `getCollections()` → `CharacterCollection[]`
- `createCollection(data)` → `CharacterCollection`
- `updateCollection(id, data)` → `CharacterCollection`
- `deleteCollection(id)` → void
- `addCharacters(collectionId, characterIds)` → void
- `removeCharacter(collectionId, characterId)` → void
- `getCollectionCharacters(collectionId)` → `Character[]`

3. **CollectionSidebar.vue** — a sidebar panel for MyCharacters page:
- Shows "All Characters" (default) + list of user's collections
- Each collection shows name, color dot, item count
- Click to filter characters by collection
- "+" button to create new collection (inline input or small dialog)
- Right-click or "..." menu on collection: Rename, Change Color, Delete
- In batch mode: "Add to Collection" button that shows collection picker

4. **MyCharacters.vue** — integrate CollectionSidebar:
- Add sidebar to the left of the character grid
- Add `activeCollection` ref (null = all, string = collection ID)
- When a collection is active, fetch characters from that collection instead of all
- Add "Add to Collection" to batch mode actions
- Add "Add to Collection" to per-card action dropdown

**Tests**: No unit tests needed for Vue components (covered by E2E). Focus on API service tests if time permits.

**Commit:** `feat(characters): add collection sidebar UI and integration`

---

### Task 5: Version restore endpoint

**Files:**
- Modify: `src/server/routes/characters.ts`
- Modify: `src/client/services/character.api.ts`

**What to do:**

The version history system already exists (list versions, get version, auto-save on update). What's missing is a **restore** endpoint that reverts a character to a previous version.

1. **Route** — add `POST /characters/:id/versions/:version/restore`:
```ts
characterRoutes.post('/:id/versions/:version/restore', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const version = Number(c.req.param('version'));

  // Get the version to restore
  const versionData = await characterVersionService.getVersion(characterId, version);
  if (!versionData) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404);
  }

  // Auto-save current state before restoring
  const current = await characterService.getById(characterId);
  if (current.cardData) {
    await characterVersionService.saveVersion(
      characterId,
      current.cardData as Record<string, unknown>,
      user.id,
      `Auto-save before restore to v${version}`,
    );
  }

  // Update character with the version's cardData
  const updated = await characterRepository.update(characterId, user.tenantId, {
    cardData: versionData.cardData,
    updatedAt: new Date(),
  });

  await cacheService.invalidateCharacter(characterId);

  return c.json({ success: true, data: updated, meta: { timestamp: new Date().toISOString() } });
});
```

2. **Client API** — add `restoreVersion(characterId, version)` method.

3. The `CharacterEditor.vue` already has a version history panel. If it doesn't have a "Restore" button per version, add one. Check the existing UI first.

**Tests**: ~3 tests
- Restore updates character cardData to the version's data
- Restore auto-saves current state before restoring
- Restore returns 404 for non-existent version

**Commit:** `feat(characters): add version restore endpoint`

---

### Task 6: Server-side JSON export endpoint

**Files:**
- Modify: `src/server/routes/characters.ts`

**What to do:**

Currently JSON export is client-side only (the frontend reads cardData and creates a download). Add a server-side endpoint for consistency with the PNG export endpoint.

```ts
characterRoutes.get('/:id/export/json', authMiddleware(), async (c) => {
  const characterId = c.req.param('id');
  const character = await characterService.getById(characterId);

  if (!character) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Character not found' } }, 404);
  }

  const cardData = {
    ...(character.cardData as Record<string, unknown>),
    name: character.name,
    description: character.description || '',
    tags: character.tags || [],
    spec: 'chara_card_v2',
    spec_version: '2.0',
  };

  const safeName = character.name.replace(/[^a-zA-Z0-9_-]/g, '_');

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="${safeName}.json"`);
  return c.body(JSON.stringify(cardData, null, 2));
});
```

Place this near the existing `/:id/export/png` endpoint.

**Tests**: ~2 tests
- Returns JSON with correct Content-Type and Content-Disposition headers
- Returns 404 for non-existent character

**Commit:** `feat(characters): add server-side JSON export endpoint`

---

### Task 7: i18n + final verification

**Files:**
- Modify: `src/client/locales/en-US.json`
- Modify: `src/client/locales/zh-CN.json`

**What to do:**

1. Add i18n keys for new UI strings:
```json
{
  "myCharacters": {
    "batchDelete": "Delete Selected",
    "batchDeleteConfirm": "Are you sure you want to delete {count} characters? This cannot be undone.",
    "batchDeleteSuccess": "Deleted {count} characters",
    "duplicate": "Duplicate",
    "duplicateSuccess": "Character duplicated",
    "addToCollection": "Add to Collection",
    "removeFromCollection": "Remove from Collection"
  },
  "collections": {
    "title": "Collections",
    "all": "All Characters",
    "create": "New Collection",
    "rename": "Rename",
    "changeColor": "Change Color",
    "delete": "Delete Collection",
    "deleteConfirm": "Delete this collection? Characters in it will not be deleted.",
    "empty": "No characters in this collection",
    "addSuccess": "Added to collection",
    "removeSuccess": "Removed from collection"
  },
  "versions": {
    "restore": "Restore",
    "restoreConfirm": "Restore to version {version}? Current state will be auto-saved.",
    "restoreSuccess": "Restored to version {version}"
  }
}
```

Add corresponding zh-CN translations.

2. Run full verification:
   - `npx vitest run` — expect 1756+ tests passing, 0 failures
   - `npx tsc --noEmit` — expect 0 errors

**Commit:** `feat(i18n): add character management enhancement i18n keys`

---

## Verification

After all tasks:
- `npx vitest run` — 1756+ tests passing, 0 failures
- `npx tsc --noEmit` — 0 errors
- Batch delete works from MyCharacters batch mode
- Character duplication creates a private copy
- Collections sidebar shows in MyCharacters, can create/manage collections
- Version restore reverts character to previous version
- JSON export endpoint returns downloadable file
