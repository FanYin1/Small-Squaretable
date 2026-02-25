# Iteration 44: Advanced Character Management (高级角色管理)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add version diff/comparison, batch tag management, and character analytics dashboard for creators.

**Architecture:** 5 tasks. T1 adds a version diff endpoint and component. T2 adds batch tag management (add/remove tags across selected characters). T3 adds a per-character analytics view. T4 adds component tests for VersionHistory and MyCharacters. T5 runs final verification. T1-T2 are independent; T3 depends on T1; T4 depends on T2.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add version diff/comparison

**Files:**
- Modify: `src/server/routes/characters.ts`
- Modify: `src/client/services/character.api.ts`
- Modify: `src/client/components/character/VersionHistory.vue`
- Create: `src/client/components/character/VersionDiff.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add a diff endpoint to the characters routes. Find the existing `GET /:id/versions/:version` route and add after it:

```ts
// GET /:id/versions/:fromVersion/diff/:toVersion — Compare two versions
characterRoutes.get(
  '/:id/versions/:fromVersion/diff/:toVersion',
  authMiddleware(),
  async (c) => {
    const characterId = c.req.param('id');
    const fromVersion = parseInt(c.req.param('fromVersion'));
    const toVersion = parseInt(c.req.param('toVersion'));
    const user = c.get('user') as { id: string; tenantId: string };

    // Verify ownership or collaborator access
    const character = await db.select({ id: characters.id, creatorId: characters.creatorId, tenantId: characters.tenantId })
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.tenantId, user.tenantId)))
      .limit(1);

    if (!character.length) {
      return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Character not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
    }

    const [fromVer, toVer] = await Promise.all([
      characterVersionService.getVersion(characterId, fromVersion),
      characterVersionService.getVersion(characterId, toVersion),
    ]);

    if (!fromVer || !toVer) {
      return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
    }

    // Compute diff — compare top-level cardData fields
    const allKeys = new Set([...Object.keys(fromVer.cardData), ...Object.keys(toVer.cardData)]);
    const changes: Array<{ field: string; from: unknown; to: unknown; type: 'added' | 'removed' | 'changed' | 'unchanged' }> = [];

    for (const key of allKeys) {
      const fromVal = fromVer.cardData[key];
      const toVal = toVer.cardData[key];
      if (fromVal === undefined) {
        changes.push({ field: key, from: null, to: toVal, type: 'added' });
      } else if (toVal === undefined) {
        changes.push({ field: key, from: fromVal, to: null, type: 'removed' });
      } else if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        changes.push({ field: key, from: fromVal, to: toVal, type: 'changed' });
      }
    }

    return c.json<ApiResponse>({
      success: true,
      data: {
        fromVersion: { version: fromVer.version, createdAt: fromVer.createdAt, changeNote: fromVer.changeNote },
        toVersion: { version: toVer.version, createdAt: toVer.createdAt, changeNote: toVer.changeNote },
        changes,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);
```

Check the existing route file for the correct import patterns (db, characters schema, characterVersionService, ApiResponse, authMiddleware, etc.).

2. Add API method to `character.api.ts`:
```ts
compareVersions: (characterId: string, fromVersion: number, toVersion: number) =>
  api.get<VersionDiff>(`/characters/${characterId}/versions/${fromVersion}/diff/${toVersion}`),
```

Add the `VersionDiff` interface:
```ts
export interface VersionDiffChange {
  field: string;
  from: unknown;
  to: unknown;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface VersionDiff {
  fromVersion: { version: number; createdAt: string; changeNote?: string };
  toVersion: { version: number; createdAt: string; changeNote?: string };
  changes: VersionDiffChange[];
}
```

3. Create `VersionDiff.vue` — a dialog component that shows the diff between two versions:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterApi, type VersionDiff } from '@client/services/character.api';

const props = defineProps<{
  characterId: string;
  fromVersion: number;
  toVersion: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const { t } = useI18n();
const diff = ref<VersionDiff | null>(null);
const loading = ref(false);

watch(() => props.visible, async (val) => {
  if (val && props.fromVersion && props.toVersion) {
    loading.value = true;
    try {
      diff.value = await characterApi.compareVersions(props.characterId, props.fromVersion, props.toVersion);
    } catch {
      diff.value = null;
    } finally {
      loading.value = false;
    }
  }
});
</script>
```

Template: An `el-dialog` showing:
- Header: "Version {from} → Version {to}"
- For each change: field name, type badge (added/removed/changed), from/to values
- Text fields show inline diff (old in red strikethrough, new in green)
- JSON fields show formatted JSON

4. Modify `VersionHistory.vue` — add a "Compare" button. When two versions are selected (via checkboxes), show a "Compare" button that opens the VersionDiff dialog.

Add to the template:
- Checkbox on each version item
- "Compare Selected" button (visible when exactly 2 are checked)
- `<VersionDiff>` dialog component

5. Add i18n keys under `characterEditor`:
- en-US: `"compareVersions": "Compare"`, `"selectToCompare": "Select 2 versions to compare"`, `"versionDiff": "Version Comparison"`, `"fieldChanged": "Changed"`, `"fieldAdded": "Added"`, `"fieldRemoved": "Removed"`, `"noChanges": "No changes"`
- zh-CN: `"compareVersions": "对比"`, `"selectToCompare": "选择2个版本进行对比"`, `"versionDiff": "版本对比"`, `"fieldChanged": "已修改"`, `"fieldAdded": "新增"`, `"fieldRemoved": "已删除"`, `"noChanges": "无变更"`

**Tests:** ~2 tests in `src/server/routes/character-version-diff.spec.ts`
- Returns diff between two versions with correct change types
- Returns 404 for non-existent version

**Commit:** `feat(characters): add version diff/comparison`

---

### Task 2: Add batch tag management

**Files:**
- Modify: `src/server/routes/characters.ts`
- Modify: `src/client/services/character.api.ts`
- Modify: `src/client/pages/MyCharacters.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add a batch tag endpoint. Find the existing `POST /batch-delete` route and add after it:

```ts
// POST /batch-tags — Add or remove tags from multiple characters
const batchTagsSchema = z.object({
  characterIds: z.array(z.string().uuid()).min(1).max(50),
  addTags: z.array(z.string().max(50)).max(20).default([]),
  removeTags: z.array(z.string().max(50)).max(20).default([]),
});

characterRoutes.post('/batch-tags', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string; tenantId: string };
  const body = batchTagsSchema.parse(await c.req.json());

  if (body.addTags.length === 0 && body.removeTags.length === 0) {
    return c.json<ApiResponse>({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Must specify addTags or removeTags' }, meta: { timestamp: new Date().toISOString() } }, 400);
  }

  // Verify ownership of all characters
  const owned = await db.select({ id: characters.id, tags: characters.tags })
    .from(characters)
    .where(and(
      inArray(characters.id, body.characterIds),
      eq(characters.creatorId, user.id),
      eq(characters.tenantId, user.tenantId),
    ));

  if (owned.length !== body.characterIds.length) {
    return c.json<ApiResponse>({ success: false, error: { code: 'FORBIDDEN', message: 'Some characters not found or not owned' }, meta: { timestamp: new Date().toISOString() } }, 403);
  }

  // Update each character's tags
  let updatedCount = 0;
  for (const char of owned) {
    let tags = [...(char.tags || [])];
    // Remove tags
    if (body.removeTags.length > 0) {
      tags = tags.filter(t => !body.removeTags.includes(t));
    }
    // Add tags (avoid duplicates)
    for (const tag of body.addTags) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    await db.update(characters)
      .set({ tags, updatedAt: new Date() })
      .where(eq(characters.id, char.id));
    updatedCount++;
  }

  return c.json<ApiResponse>({
    success: true,
    data: { updatedCount },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

Check the existing route file for the correct imports (`inArray` from drizzle-orm, etc.).

2. Add API method to `character.api.ts` (or the appropriate service file — check if batch operations are in `export.api.ts`):
```ts
batchUpdateTags: (characterIds: string[], addTags: string[], removeTags: string[]) =>
  api.post<{ updatedCount: number }>('/characters/batch-tags', { characterIds, addTags, removeTags }),
```

3. Modify `MyCharacters.vue` — add a "Manage Tags" button in the batch action bar. When clicked, show a dialog with:
- "Add Tags" input (el-select, multiple, filterable, allow-create)
- "Remove Tags" input (el-select, multiple, filterable, showing tags from selected characters)
- Apply button

Read the current MyCharacters.vue first to understand the batch mode UI. The batch action bar likely already has buttons for export, delete, add to collection. Add the tag management button there.

4. Add i18n keys under `myCharacters`:
- en-US: `"manageTags": "Manage Tags"`, `"addTags": "Add Tags"`, `"removeTags": "Remove Tags"`, `"tagsUpdated": "Tags updated for {count} characters"`, `"tagsPlaceholder": "Type to add tags..."`
- zh-CN: `"manageTags": "管理标签"`, `"addTags": "添加标签"`, `"removeTags": "移除标签"`, `"tagsUpdated": "已更新 {count} 个角色的标签"`, `"tagsPlaceholder": "输入标签..."`

**Tests:** ~2 tests in `src/server/routes/characters-batch-tags.spec.ts`
- Batch add tags returns updated count
- Returns 403 when character not owned

**Commit:** `feat(characters): add batch tag management`

---

### Task 3: Add character analytics view

**Files:**
- Modify: `src/client/pages/CharacterDetail.vue`
- Create: `src/client/components/character/CharacterStats.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `CharacterStats.vue` — a stats panel showing character performance metrics:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  character: {
    viewCount: number;
    downloadCount: number;
    favoriteCount: number;
    commentCount: number;
    ratingAvg: number | null;
    ratingCount: number;
    createdAt: string;
  };
}>();

const { t } = useI18n();

const stats = computed(() => [
  { label: t('characterStats.views'), value: props.character.viewCount, icon: 'View' },
  { label: t('characterStats.downloads'), value: props.character.downloadCount, icon: 'Download' },
  { label: t('characterStats.favorites'), value: props.character.favoriteCount, icon: 'Star' },
  { label: t('characterStats.comments'), value: props.character.commentCount, icon: 'ChatDotRound' },
  { label: t('characterStats.rating'), value: props.character.ratingAvg ? `${Number(props.character.ratingAvg).toFixed(1)} (${props.character.ratingCount})` : '-', icon: 'StarFilled' },
]);
</script>
```

Template: A grid of stat cards, each showing icon + value + label. Use Element Plus icons.

Style: 5-column grid on desktop, 2-column on mobile. Each card has a large number, small label, subtle background.

2. Integrate `CharacterStats` into `CharacterDetail.vue`. Read the current file first. Add the stats panel below the character info section, visible only to the character owner.

3. Add i18n keys under `characterStats`:
- en-US: `"views": "Views"`, `"downloads": "Downloads"`, `"favorites": "Favorites"`, `"comments": "Comments"`, `"rating": "Rating"`, `"stats": "Statistics"`
- zh-CN: `"views": "浏览量"`, `"downloads": "下载量"`, `"favorites": "收藏数"`, `"comments": "评论数"`, `"rating": "评分"`, `"stats": "统计数据"`

**Tests:** ~2 tests in `src/client/components/character/CharacterStats.spec.ts`
- Renders all stat values
- Shows rating with count

**Commit:** `feat(characters): add character analytics stats panel`

---

### Task 4: Add component tests for VersionHistory and MyCharacters

**Files:**
- Create: `src/client/components/character/VersionHistory.spec.ts`
- Create: `src/client/pages/MyCharacters.spec.ts`

**What to do:**

1. `VersionHistory.spec.ts` — ~3 tests:
- Renders toggle button
- Shows version list when expanded and data loaded
- Emits restore event when restore button clicked

Props: `characterId` (string).

Mock: `characterApi.getVersions` returning array of `CharacterVersion`.

2. `MyCharacters.spec.ts` — ~3 tests:
- Renders character cards
- Shows batch action bar when batch mode is active
- Shows empty state when no characters

Mock: `characterApi.getMyCharacters` (or whatever the list method is), `useRoute`, `useRouter`, `useUserStore`.

Follow the testing patterns from other component/page specs.

**Commit:** `test(characters): add VersionHistory and MyCharacters component tests`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1950+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Version diff endpoint works
   - Batch tag management works
   - Character stats panel renders
   - Component tests pass

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1950+ tests passing
- `npx tsc --noEmit` — 0 errors
- Version diff/comparison between any two versions
- Batch tag add/remove across selected characters
- Character analytics stats panel for owners
- VersionHistory and MyCharacters tested
