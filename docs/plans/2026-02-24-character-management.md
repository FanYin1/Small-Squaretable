# Iteration 36: Character Management Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix security gaps in character endpoints, add tenant isolation to version history, harden batch import validation, fix collaborator bypass, and wire character growth XP to the chat flow.

**Architecture:** 6 tasks in dependency order. T1-T3 fix security issues (tenant isolation, import validation, collaborator bypass). T4 wires the growth system. T5 adds world book re-export on character export. T6 runs final verification. T1-T5 are independent.

**Tech Stack:** TypeScript strict, Hono.js, Drizzle ORM, PostgreSQL, Zod, Vitest

---

### Task 1: Add tenant isolation to character version endpoints

**Files:**
- Modify: `src/server/routes/characters.ts` (lines 981-1108)

**What to do:**

The version endpoints (`GET /:id/versions`, `GET /:id/versions/:version`, `POST /:id/versions`, `POST /:id/versions/:version/restore`) check auth but don't verify the character belongs to the requesting user. Any authenticated user can list/restore versions of any character by ID.

Add ownership verification to all 4 version endpoints. The pattern already exists throughout the file — use `characterService.getById(characterId)` and check `creatorId === user.id` (also allow editor collaborators).

1. **GET /:id/versions** (line 981) — add ownership check:
```ts
characterRoutes.get('/:id/versions', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  // Verify ownership or collaborator access
  const character = await characterService.getById(characterId);
  if (character.creatorId !== user.id) {
    const collab = await db.select().from(characterCollaborators)
      .where(and(
        eq(characterCollaborators.characterId, characterId),
        eq(characterCollaborators.userId, user.id),
      ))
      .limit(1);
    if (collab.length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
        meta: { timestamp: new Date().toISOString() },
      }, 403);
    }
  }

  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);
  const versions = await characterVersionService.listVersions(characterId, limit, offset);
  // ... rest unchanged
});
```

2. Apply the same ownership check to `GET /:id/versions/:version` (line 999).

3. `POST /:id/versions` (line 1027) already calls `characterService.getById` — add the ownership check after it.

4. `POST /:id/versions/:version/restore` (line 1065) — add ownership check. This one already has `user.tenantId` in the restore call, but doesn't verify the character belongs to the user.

Extract a helper to avoid repetition:
```ts
async function verifyCharacterAccess(characterId: string, userId: string): Promise<boolean> {
  const character = await characterService.getById(characterId);
  if (character.creatorId === userId) return true;
  const collab = await db.select().from(characterCollaborators)
    .where(and(
      eq(characterCollaborators.characterId, characterId),
      eq(characterCollaborators.userId, userId),
    ))
    .limit(1);
  return collab.length > 0;
}
```

Place this helper inside the file (before the version endpoints). Use it in all 4 version endpoints.

Note: `characterCollaborators`, `db`, `and`, `eq` are already imported in this file (used in the PATCH handler at line 678).

**Tests**: ~3 tests in a new `src/server/routes/character-versions.spec.ts`
- Version list returns versions for character owner
- Version list returns 403 for non-owner
- Version restore returns 403 for non-owner

Mock `characterService.getById` to return `{ creatorId: 'owner-id', cardData: {} }`.
Mock `characterVersionService` methods.
Mock `db.select().from().where().limit()` for collaborator check.

**Commit:** `fix(security): add tenant isolation to character version endpoints`

---

### Task 2: Validate batch import with Zod schema

**Files:**
- Modify: `src/server/routes/characters.ts` (lines 362-495, batch import)

**What to do:**

The batch import endpoint (`POST /import/batch`) parses JSON/PNG files and passes data directly to `characterService.create()` without running through `createCharacterSchema` Zod validation. This allows malformed or oversized data to bypass validation.

1. Import `createCharacterSchema` at the top of the file (it's already imported — verify).

2. After extracting `name`, `description`, `tags`, `cardData`, `avatarUrl` from the parsed file (around line 460), validate through the schema before creating:

```ts
// After extracting fields from parsed file data:
const validationResult = createCharacterSchema.safeParse({
  name,
  description,
  avatarUrl,
  cardData,
  tags: Array.isArray(tags) ? tags : [],
  isNsfw: false,
});

if (!validationResult.success) {
  failed.push({ filename: file.name, error: `Validation failed: ${validationResult.error.issues[0]?.message || 'Invalid data'}` });
  continue;
}

// Use validated data for creation
const character = await characterService.create(user.id, user.tenantId, validationResult.data);
```

3. The `avatarUrl` field uses `.url()` validation which rejects `data:` URIs. Fix the schema to also accept data URIs. In `src/types/character.ts`, change:
```ts
// From:
avatarUrl: z.string().url().max(5000000).optional(),
// To:
avatarUrl: z.string().max(5000000).refine(
  (val) => val.startsWith('data:') || z.string().url().safeParse(val).success,
  'Must be a valid URL or data URI'
).optional(),
```

Apply the same fix to `updateCharacterSchema.avatarUrl`.

4. Add a total `cardData` size check to prevent multi-GB payloads:
```ts
// In createCharacterSchema, after the existing refine:
cardData: z.record(cardDataValueSchema).refine(
  (data) => Object.keys(data).length > 0,
  'cardData must not be empty'
).refine(
  (data) => JSON.stringify(data).length <= 10_000_000, // 10MB max
  'cardData exceeds maximum size (10MB)'
),
```

**Tests**: ~3 tests in `src/types/character.spec.ts`
- `createCharacterSchema` accepts data URI avatarUrl
- `createCharacterSchema` rejects cardData over 10MB
- `createCharacterSchema` accepts valid character data

**Commit:** `fix(security): validate batch import data with Zod, accept data URIs, limit cardData size`

---

### Task 3: Fix collaborator bypass in PATCH /:id

**Files:**
- Modify: `src/server/routes/characters.ts` (lines 698-718)

**What to do:**

The collaborator path in `PATCH /:id` does a direct `db.update(characters).set({ ...input, updatedAt: new Date() })` bypassing the service layer. This means:
- No tenant isolation check (collaborator from tenant A could edit character in tenant B)
- The raw Zod-validated `input` is spread directly, which could include fields collaborators shouldn't modify (like `isPublic`, `isNsfw`)

1. Add tenant check for collaborators:
```ts
if (!isOwner) {
  // Verify collaborator is in the same tenant
  if (existing.tenantId !== user.tenantId) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden' },
      meta: { timestamp: new Date().toISOString() },
    }, 403);
  }

  const collaborator = await db.select().from(characterCollaborators)
    .where(and(
      eq(characterCollaborators.characterId, characterId),
      eq(characterCollaborators.userId, user.id),
      eq(characterCollaborators.role, 'editor')
    ))
    .limit(1);

  if (collaborator.length === 0) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden' },
      meta: { timestamp: new Date().toISOString() },
    }, 403);
  }
}
```

2. Restrict collaborator-editable fields (collaborators should only edit content, not publishing/visibility):
```ts
if (!isOwner) {
  // Collaborators can only edit content fields
  const { name, description, avatarUrl, cardData, tags, category } = input;
  const safeInput = { name, description, avatarUrl, cardData, tags, category };
  // Remove undefined keys
  const cleanInput = Object.fromEntries(
    Object.entries(safeInput).filter(([, v]) => v !== undefined)
  );

  const [updated] = await db.update(characters)
    .set({ ...cleanInput, updatedAt: new Date() })
    .where(eq(characters.id, characterId))
    .returning();
  // ...
}
```

**Tests**: ~2 tests (add to existing character route tests or create `src/server/routes/character-patch.spec.ts`)
- Collaborator update strips `isPublic`/`isNsfw` fields
- Collaborator from different tenant gets 403

**Commit:** `fix(security): add tenant check and field restriction for collaborator edits`

---

### Task 4: Wire character growth XP to chat message flow

**Files:**
- Modify: `src/server/routes/chats.ts` (around line 357, after message creation)

**What to do:**

The character growth system (`character-growth.repository.ts`) has `incrementMessages()` and `incrementChats()` methods that award XP, but they're only called from the chat creation endpoint (line 68-71 of chats.ts for `incrementChats`). The `incrementMessages` call exists at line 359-364 but only fires for the REST API message endpoint — WebSocket messages (which are the primary chat path) don't trigger growth.

1. In `src/server/routes/websocket.ts`, after saving the assistant message in `handleSingleCharacterResponse` (around line 287-290), add growth increment:

```ts
// After: const assistantMessage = await chatService.addMessage(chatId, { role: 'assistant', content: fullContent });
// Add:
if (character) {
  characterGrowthRepository.getOrCreate(character.id, userId)
    .then((growth) => characterGrowthRepository.incrementMessages(growth.id))
    .catch((err) => wsLogger.warn('Failed to increment message growth', { error: err }));
}
```

2. In `handleGroupChatResponse` (around line 382-387), after saving each character's message:

```ts
// After: const savedMessage = await messageRepository.create({ chatId, role: 'assistant', content: fullContent, characterId: character.id });
// Add:
characterGrowthRepository.getOrCreate(character.id, userId)
  .then((growth) => characterGrowthRepository.incrementMessages(growth.id))
  .catch((err) => wsLogger.warn('Failed to increment group message growth', { error: err }));
```

3. Add the import at the top of `websocket.ts`:
```ts
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
```

**Tests**: ~2 tests in `src/server/routes/websocket.spec.ts` (add to existing)
- Single character response increments growth
- Group chat response increments growth for each responding character

Mock `characterGrowthRepository.getOrCreate` and `incrementMessages`.

**Commit:** `feat(growth): wire character XP growth to WebSocket message flow`

---

### Task 5: Re-export world book data in character export

**Files:**
- Modify: `src/server/routes/characters.ts` (lines 1111-1130, JSON export)
- Modify: `src/server/routes/characters.ts` (lines 1132-1170, PNG export)

**What to do:**

When a character is imported with a `character_book`, the world book entries are stored in separate tables (`worldbooks`, `worldbook_entries`). But on export, only `character.cardData` is serialized — the world book data created during import is never re-serialized back into the export.

1. In the JSON export handler (`GET /:id/export/json`, line 1111), after building `cardData`, fetch and embed the world book:

```ts
import { worldbookRepository } from '../../db/repositories/worldbook.repository';
import { worldbookEntryRepository } from '../../db/repositories/worldbook-entry.repository';

// In the export handler:
// Fetch world book entries for this character
const worldbooks = await worldbookRepository.findByCharacter(characterId);
if (worldbooks.length > 0) {
  const entries = await worldbookEntryRepository.findByWorldbook(worldbooks[0].id);
  if (entries.length > 0) {
    cardData.character_book = {
      entries: entries.map((e, i) => ({
        keys: e.keys || [],
        secondary_keys: e.secondaryKeys || [],
        content: e.content || '',
        comment: e.comment || '',
        enabled: e.enabled !== false,
        insertion_order: e.insertionOrder ?? i,
        case_sensitive: e.caseSensitive ?? false,
        name: e.name || '',
        priority: e.priority ?? 10,
        id: i,
        position: e.position ?? 'after_char',
        extensions: {},
        selective: (e.secondaryKeys?.length ?? 0) > 0,
        constant: e.constant ?? false,
      })),
      name: worldbooks[0].name || `${character.name}'s World Book`,
    };
  }
}
```

Check the actual field names in `worldbook-entry.repository.ts` and `worldbooks` schema to match the correct column names.

2. Apply the same world book embedding to the PNG export handler (`GET /:id/export/png`, line 1132) — it builds the same `cardData` object.

3. Also apply to the batch export handler (`POST /export/batch`, line 497) which iterates characters.

**Tests**: ~2 tests
- JSON export includes `character_book` when world book exists
- JSON export omits `character_book` when no world book

Mock `worldbookRepository.findByCharacter` and `worldbookEntryRepository.findByWorldbook`.

**Commit:** `feat(export): re-embed world book data in character exports`

---

### Task 6: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1829+ tests passing, 0 failures (excluding pre-existing MessageInput failures)
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify no regressions in existing character tests

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1829+ tests passing
- `npx tsc --noEmit` — 0 errors
- Character version endpoints require ownership
- Batch import validates through Zod schema
- Collaborator edits are tenant-isolated and field-restricted
- Character growth XP fires on WebSocket messages
- Character exports include world book data
