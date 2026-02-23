# Iteration 42: Character Collections & Collaboration Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add collaborator route tests, frontend component tests for CollectionSidebar and CollaboratorPanel, shareable/public collections, and "Add to Collection" from marketplace character cards.

**Architecture:** 5 tasks. T1 adds collaborator route tests. T2 adds frontend component tests. T3 adds shareable collections (isPublic flag + public view endpoint). T4 adds "Add to Collection" button on marketplace cards. T5 runs final verification. T1-T2 are independent; T3 depends on T1; T4 depends on T2.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add collaborator route tests

**Files:**
- Create: `src/server/routes/character-collaborators.spec.ts`

**What to do:**

The collaborator routes at `src/server/routes/character-collaborators.ts` have full CRUD but zero tests. Add comprehensive tests.

~8 tests:
- `POST /characters/:id/collaborators` — invite collaborator returns 201
- `POST /characters/:id/collaborators` — returns 404 for non-existent character
- `POST /characters/:id/collaborators` — returns 403 for non-owner
- `POST /characters/:id/collaborators` — returns 409 for duplicate collaborator
- `GET /characters/:id/collaborators` — list collaborators returns array with user info
- `GET /characters/:id/collaborators` — returns 403 for non-owner non-collaborator
- `PATCH /characters/:id/collaborators/:userId` — update role returns 200
- `DELETE /characters/:id/collaborators/:userId` — remove collaborator returns 200

Mock: `db` (select, insert, update, delete), `authMiddleware`, `requireFeature`, `notificationService.notify`.

Follow the mocking pattern from `src/server/routes/character-collections.spec.ts` — use the `mockChain` helper for drizzle query chains.

**Commit:** `test(collaboration): add character collaborator route tests`

---

### Task 2: Add frontend component tests

**Files:**
- Create: `src/client/components/character/CollectionSidebar.spec.ts`
- Create: `src/client/components/character/CollaboratorPanel.spec.ts`

**What to do:**

1. `CollectionSidebar.spec.ts` — ~3 tests:
- Renders collection list with names and item counts
- Emits 'select' with null when "All" is clicked
- Emits 'select' with collection ID when a collection is clicked

Props to pass: `collections` (array of `CharacterCollection` with id, name, color, itemCount), `activeCollection` (string | null).

Mock: `characterCollectionApi`, `useToast`, `ElMessageBox`.

2. `CollaboratorPanel.spec.ts` — ~3 tests:
- Renders collaborator list with names and roles
- Shows invite button when isOwner is true
- Hides invite button when isOwner is false

Props: `characterId` (string), `isOwner` (boolean).

Mock: `collaboratorApi.listCollaborators`.

Follow the testing patterns from other component specs (mount with i18n plugin, stub Element Plus components).

**Commit:** `test(ui): add CollectionSidebar and CollaboratorPanel component tests`

---

### Task 3: Add shareable/public collections

**Files:**
- Modify: `src/db/schema/character-collections.ts`
- Modify: `src/server/routes/character-collections.ts`
- Modify: `src/client/services/character-collection.api.ts`
- Modify: `src/client/components/character/CollectionSidebar.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add `isPublic` column to `characterCollections` schema:
```ts
isPublic: boolean('is_public').default(false).notNull(),
```

2. Add `isPublic` to the create and update schemas in the routes file.

3. Add a public endpoint to list a user's public collections (no auth required):
```ts
// GET /public/:userId — list user's public collections
characterCollectionRoutes.get('/public/:userId', async (c) => {
  const userId = c.req.param('userId');
  const collections = await db
    .select({
      id: characterCollections.id,
      name: characterCollections.name,
      description: characterCollections.description,
      color: characterCollections.color,
      itemCount: sql<number>`(SELECT COUNT(*) FROM character_collection_items WHERE collection_id = ${characterCollections.id})`.as('item_count'),
    })
    .from(characterCollections)
    .where(and(eq(characterCollections.userId, userId), eq(characterCollections.isPublic, true)))
    .orderBy(characterCollections.sortOrder);

  return c.json<ApiResponse>({ success: true, data: collections, meta: { timestamp: new Date().toISOString() } });
});
```

4. Add a public endpoint to view a specific public collection's characters:
```ts
// GET /public/:userId/:id/characters — view public collection characters
characterCollectionRoutes.get('/public/:userId/:id/characters', async (c) => {
  const userId = c.req.param('userId');
  const collectionId = c.req.param('id');

  const [collection] = await db.select({ id: characterCollections.id })
    .from(characterCollections)
    .where(and(
      eq(characterCollections.id, collectionId),
      eq(characterCollections.userId, userId),
      eq(characterCollections.isPublic, true),
    ));

  if (!collection) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  const items = await db
    .select({
      id: characters.id,
      name: characters.name,
      description: characters.description,
      avatarUrl: characters.avatarUrl,
      tags: characters.tags,
      category: characters.category,
    })
    .from(characterCollectionItems)
    .innerJoin(characters, eq(characterCollectionItems.characterId, characters.id))
    .where(eq(characterCollectionItems.collectionId, collectionId))
    .orderBy(characterCollectionItems.sortOrder);

  return c.json<ApiResponse>({ success: true, data: items, meta: { timestamp: new Date().toISOString() } });
});
```

5. Add `isPublic` toggle to CollectionSidebar create dialog and a share icon on public collections.

6. Add API methods:
```ts
getPublicCollections: (userId: string) =>
  api.get<CharacterCollection[]>(`/character-collections/public/${userId}`),
getPublicCollectionCharacters: (userId: string, collectionId: string) =>
  api.get<Character[]>(`/character-collections/public/${userId}/${collectionId}/characters`),
```

7. Add i18n keys under `collections`:
- en-US: `"makePublic": "Make Public"`, `"publicCollection": "Public"`, `"shareLink": "Share Link"`
- zh-CN: `"makePublic": "设为公开"`, `"publicCollection": "公开"`, `"shareLink": "分享链接"`

8. Integrate public collections into UserProfile.vue — show a "Collections" tab if the user has public collections.

**Tests:** ~3 tests added to `src/server/routes/character-collections.spec.ts`
- Get public collections returns only public ones
- Get public collection characters returns character data
- Returns 404 for non-public collection

**Commit:** `feat(collections): add shareable public collections`

---

### Task 4: Add "Add to Collection" from marketplace

**Files:**
- Modify: `src/client/pages/Market.vue`
- Modify: `src/client/pages/CharacterDetail.vue`

**What to do:**

1. In `Market.vue`, add an "Add to Collection" button on each character card (for authenticated users). When clicked, show a dropdown of the user's collections and add the character.

Check the current Market.vue structure — it likely has character cards. Add a small icon button (folder-add icon) that opens an `el-popover` or `el-dropdown` with the user's collections.

2. In `CharacterDetail.vue`, add an "Add to Collection" button in the action area.

3. Both should:
- Fetch collections on mount (or lazily on first click)
- Call `characterCollectionApi.addCharacters(collectionId, [characterId])`
- Show success toast

4. Add i18n keys:
- en-US under `collections`: `"addToCollection": "Add to Collection"`, `"addSuccess": "Added to collection"`
- zh-CN: `"addToCollection": "添加到收藏夹"`, `"addSuccess": "已添加到收藏夹"`

Check if these keys already exist (MyCharacters.vue uses `myCharacters.addToCollection`).

**Tests:** ~1 test in `src/client/pages/Market.spec.ts` (add to existing if exists)
- Add to Collection button visible for authenticated users

**Commit:** `feat(ui): add "Add to Collection" to marketplace and character detail`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1920+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Collaborator routes fully tested
   - CollectionSidebar and CollaboratorPanel tested
   - Public collections viewable without auth
   - Add to Collection works from marketplace

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1920+ tests passing
- `npx tsc --noEmit` — 0 errors
- Collaborator routes tested (8 tests)
- Frontend components tested (6 tests)
- Public/shareable collections
- Add to Collection from marketplace
