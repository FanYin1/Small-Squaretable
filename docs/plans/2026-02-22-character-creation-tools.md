# Iteration 20: Character Creation Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a visual character editor that replaces the placeholder "Create Character" button with a full creation/editing form, including personality fields, avatar upload, character preview, and version history.

**Architecture:** A new `CharacterEditor.vue` page handles both create and edit modes via route params. The editor form covers all SillyTavern V2 card fields (name, description, personality, scenario, first message, example messages, system prompt, creator notes, tags). Avatar upload uses the existing storage service pattern (base64 data URL). A character preview panel shows a live preview of how the character card will look. Character versions are tracked in a new `character_versions` table for undo/history. The `characterApi` is extended with proper typed request/response for all cardData fields.

**Tech Stack:** Vue 3 + Element Plus, Pinia, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Extend character API types and client service

**Files:**
- Modify: `src/client/services/character.api.ts`
- Modify: `src/client/types/index.ts`

**What to do:**

1. In `src/client/types/index.ts`, extend the `Character` interface to include all cardData sub-fields as typed optional properties:

```ts
export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  creator_notes?: string;
  creator?: string;
  character_version?: string;
  tags?: string[];
  character_book?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

Add `cardData?: CharacterCardData` to the `Character` interface (replacing the existing `cardData?: Record<string, any>`).

2. In `src/client/services/character.api.ts`, update `CreateCharacterRequest` and `UpdateCharacterRequest` to include all editable fields:

```ts
export interface CreateCharacterRequest {
  name: string;
  description?: string;
  avatarUrl?: string;
  cardData: CharacterCardData;
  tags?: string[];
  category?: string;
  isNsfw?: boolean;
}

export interface UpdateCharacterRequest {
  name?: string;
  description?: string;
  avatarUrl?: string;
  cardData?: CharacterCardData;
  tags?: string[];
  category?: string;
  isNsfw?: boolean;
}
```

Import `CharacterCardData` from `@client/types`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'character\.(api|types)' | head -10`

**Commit:** `feat(types): extend character types with cardData fields`

---

### Task 2: Create CharacterEditor page (create mode)

**Files:**
- Create: `src/client/pages/CharacterEditor.vue`
- Modify: `src/client/router/routes.ts` — add create/edit routes

**What to do:**

1. Create `src/client/pages/CharacterEditor.vue` — a form page for creating/editing characters. Use `DashboardLayout`. The page should have:

- Route params: `id` (optional — if present, edit mode; if absent, create mode)
- Form fields using Element Plus `el-form` + `el-form-item`:
  - **Basic Info section:**
    - Name (`el-input`, required, max 255)
    - Description (`el-input` type="textarea", rows=3)
    - Category (`el-select` with options: assistant, entertainment, education, game, historical, modern)
    - Tags (`el-select` multiple, allow-create, filterable)
    - NSFW toggle (`el-switch`)
  - **Personality section:**
    - Personality (`el-input` type="textarea", rows=5, placeholder: "Character's personality traits...")
    - Scenario (`el-input` type="textarea", rows=3, placeholder: "The setting or context...")
    - System Prompt (`el-input` type="textarea", rows=5, placeholder: "System-level instructions...")
  - **Messages section:**
    - First Message (`el-input` type="textarea", rows=5, placeholder: "Character's opening message...")
    - Example Messages (`el-input` type="textarea", rows=8, placeholder: "Example conversation format...")
  - **Creator Info section:**
    - Creator Notes (`el-input` type="textarea", rows=3)
  - **Avatar section:**
    - Avatar preview (current avatar or placeholder)
    - Upload button (accepts image/png, image/jpeg, image/webp, max 5MB)
    - Convert uploaded file to base64 data URL for `avatarUrl`

- Save button: Calls `characterApi.createCharacter()` in create mode or `characterApi.updateCharacter()` in edit mode. Builds `cardData` from the form fields. On success, navigate to `MyCharacters`.

- In edit mode: Fetch character by ID on mount, populate form from `cardData` fields.

Use `useI18n` for all labels (keys will be added in Task 8).

2. In `src/client/router/routes.ts`, add routes:
```ts
{
  path: '/characters/new',
  name: 'CharacterCreate',
  component: () => import('../pages/CharacterEditor.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/characters/:id/edit',
  name: 'CharacterEdit',
  component: () => import('../pages/CharacterEditor.vue'),
  meta: { requiresAuth: true },
},
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'CharacterEditor' | head -10`

**Commit:** `feat(client): add CharacterEditor page with create/edit modes`

---

### Task 3: Wire up MyCharacters "Create" button and add "Edit" action

**Files:**
- Modify: `src/client/pages/MyCharacters.vue`
- Modify: `src/client/pages/CharacterDetail.vue`

**What to do:**

1. In `MyCharacters.vue`, change `handleCreateNew()` from showing a toast to navigating:
```ts
function handleCreateNew() {
  router.push({ name: 'CharacterCreate' });
}
```

2. Add an "Edit" action to each character card. Find the card actions section (where publish/delete/export buttons are) and add:
```ts
function handleEdit(character: Character) {
  router.push({ name: 'CharacterEdit', params: { id: character.id } });
}
```
Wire it to an Edit button/icon on each card.

3. In `CharacterDetail.vue`, add an "Edit" button that's visible only when the current user is the creator. Navigate to `CharacterEdit` with the character ID.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'MyCharacters|CharacterDetail' | head -10`

**Commit:** `feat(client): wire create/edit navigation from MyCharacters and CharacterDetail`

---

### Task 4: Character preview panel

**Files:**
- Create: `src/client/components/character/CharacterPreview.vue`
- Modify: `src/client/pages/CharacterEditor.vue` — add preview panel

**What to do:**

1. Create `src/client/components/character/CharacterPreview.vue` — a component that shows a live preview of the character being edited:
- Props: `character` (partial Character with cardData)
- Shows: avatar (or DiceBear fallback), name, description, personality snippet, first message preview, tags
- Styled like a character card but larger, read-only
- Updates reactively as the user types in the editor form

2. In `CharacterEditor.vue`, add the preview panel in a side-by-side layout:
- Left side (60%): The editor form
- Right side (40%): `CharacterPreview` component, sticky positioned
- On mobile (< 768px): Preview hidden or collapsible below the form

Use `el-row` + `el-col` for the layout with responsive `:span` values.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'CharacterPreview|CharacterEditor' | head -10`

**Commit:** `feat(client): add character preview panel to editor`

---

### Task 5: Character version history — schema + repository

**Files:**
- Create: `src/db/schema/character-versions.ts`
- Create: `src/db/repositories/character-version.repository.ts`
- Modify: `src/db/schema/index.ts` — add export

**What to do:**

1. Create `src/db/schema/character-versions.ts`:

```ts
import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterVersions = pgTable('character_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  cardData: jsonb('card_data').notNull(),
  changeNote: text('change_note'),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  characterIdx: index('idx_character_versions_character').on(table.characterId),
  versionIdx: index('idx_character_versions_version').on(table.characterId, table.version),
}));

export type CharacterVersion = typeof characterVersions.$inferSelect;
export type NewCharacterVersion = typeof characterVersions.$inferInsert;
```

2. Create `src/db/repositories/character-version.repository.ts`:

```ts
import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../index';
import { characterVersions } from '../schema/character-versions';
import type { CharacterVersion, NewCharacterVersion } from '../schema/character-versions';

class CharacterVersionRepository {
  async create(data: NewCharacterVersion): Promise<CharacterVersion> {
    const [version] = await db.insert(characterVersions).values(data).returning();
    return version;
  }

  async getLatestVersion(characterId: string): Promise<number> {
    const [result] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${characterVersions.version}), 0)` })
      .from(characterVersions)
      .where(eq(characterVersions.characterId, characterId));
    return result.maxVersion;
  }

  async listByCharacter(characterId: string, limit = 20, offset = 0): Promise<CharacterVersion[]> {
    return await db
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.characterId, characterId))
      .orderBy(desc(characterVersions.version))
      .limit(limit)
      .offset(offset);
  }

  async getByVersion(characterId: string, version: number): Promise<CharacterVersion | undefined> {
    const [result] = await db
      .select()
      .from(characterVersions)
      .where(and(
        eq(characterVersions.characterId, characterId),
        eq(characterVersions.version, version),
      ));
    return result;
  }
}

export const characterVersionRepository = new CharacterVersionRepository();
```

3. In `src/db/schema/index.ts`, add: `export * from './character-versions';`

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'character-version' | head -10`

**Commit:** `feat(db): add character version history schema and repository`

---

### Task 6: Character version service + API routes

**Files:**
- Create: `src/server/services/character-version.service.ts`
- Create: `src/server/services/character-version.service.spec.ts`
- Modify: `src/server/routes/characters.ts` — add version endpoints

**What to do:**

1. Create `src/server/services/character-version.service.ts`:

```ts
import { characterVersionRepository } from '../../db/repositories/character-version.repository';
import { logger } from './logger.service';

const versionLogger = logger.child({ module: 'character-version' });

export class CharacterVersionService {
  async saveVersion(
    characterId: string,
    cardData: Record<string, unknown>,
    userId: string,
    changeNote?: string
  ) {
    const latestVersion = await characterVersionRepository.getLatestVersion(characterId);
    return characterVersionRepository.create({
      characterId,
      version: latestVersion + 1,
      cardData,
      changeNote: changeNote ?? null,
      createdBy: userId,
    });
  }

  async listVersions(characterId: string, limit = 20, offset = 0) {
    return characterVersionRepository.listByCharacter(characterId, limit, offset);
  }

  async getVersion(characterId: string, version: number) {
    return characterVersionRepository.getByVersion(characterId, version);
  }
}

export const characterVersionService = new CharacterVersionService();
```

2. Create `src/server/services/character-version.service.spec.ts` with tests:
- "should save a new version with incremented version number"
- "should list versions for a character"
- "should get a specific version"

Mock `characterVersionRepository`.

3. In `src/server/routes/characters.ts`, add version endpoints:
- `GET /:id/versions` — list versions (paginated)
- `GET /:id/versions/:version` — get specific version
- `POST /:id/versions` — manually save a version snapshot

Also: modify the existing `PATCH /:id` handler to auto-save a version before applying the update. Call `characterVersionService.saveVersion()` with the current cardData before the update.

**Verification:**
Run: `npx vitest run src/server/services/character-version.service.spec.ts`
Run: `npx tsc --noEmit 2>&1 | grep 'character' | head -10`

**Commit:** `feat(server): add character version service and API routes`

---

### Task 7: Version history UI in editor

**Files:**
- Create: `src/client/components/character/VersionHistory.vue`
- Modify: `src/client/pages/CharacterEditor.vue` — add version history panel
- Modify: `src/client/services/character.api.ts` — add version API methods

**What to do:**

1. Add version API methods to `character.api.ts`:
```ts
  getVersions: (characterId: string, limit = 20, offset = 0) =>
    api.get<CharacterVersion[]>(`/characters/${characterId}/versions?limit=${limit}&offset=${offset}`),
  getVersion: (characterId: string, version: number) =>
    api.get<CharacterVersion>(`/characters/${characterId}/versions/${version}`),
```

Add `CharacterVersion` interface:
```ts
export interface CharacterVersion {
  id: string;
  characterId: string;
  version: number;
  cardData: Record<string, unknown>;
  changeNote?: string;
  createdBy?: string;
  createdAt: string;
}
```

2. Create `src/client/components/character/VersionHistory.vue`:
- Props: `characterId` (string)
- Fetches version list on mount
- Shows a timeline (`el-timeline`) of versions with version number, change note, and timestamp
- "Restore" button on each version — emits `restore` event with the version's cardData
- Collapsible panel (hidden by default, toggle button)

3. In `CharacterEditor.vue` (edit mode only):
- Add VersionHistory component below the preview or as a tab
- Handle `restore` event: populate form fields from the restored version's cardData
- Show a confirmation dialog before restoring

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'VersionHistory|CharacterEditor' | head -10`

**Commit:** `feat(client): add version history panel to character editor`

---

### Task 8: Character templates

**Files:**
- Create: `src/client/components/character/TemplateSelector.vue`
- Modify: `src/client/pages/CharacterEditor.vue` — show templates in create mode

**What to do:**

1. Create `src/client/components/character/TemplateSelector.vue`:
- A grid of predefined character templates the user can start from
- Templates are hardcoded (no DB needed):
  - **Blank** — empty template
  - **Assistant** — helpful AI assistant with system prompt
  - **Roleplay** — roleplay character with personality/scenario/first_mes
  - **Educator** — educational character with structured responses
  - **Storyteller** — narrative character with creative writing focus
- Each template card shows: icon, name, short description
- Clicking a template emits `select` with the template's cardData

2. In `CharacterEditor.vue`, show `TemplateSelector` at the top of the create mode form (before the form fields). When a template is selected, populate the form fields. The user can then customize.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'TemplateSelector|CharacterEditor' | head -10`

**Commit:** `feat(client): add character template selector for quick start`

---

### Task 9: Add i18n keys for character editor

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Add `characterEditor` section to both locale files:

en-US.json:
```json
{
  "characterEditor": {
    "createTitle": "Create Character",
    "editTitle": "Edit Character",
    "basicInfo": "Basic Info",
    "personality": "Personality",
    "messages": "Messages",
    "creatorInfo": "Creator Info",
    "avatar": "Avatar",
    "name": "Name",
    "namePlaceholder": "Character name",
    "description": "Description",
    "descriptionPlaceholder": "Brief description of the character",
    "category": "Category",
    "tags": "Tags",
    "tagsPlaceholder": "Add tags",
    "nsfw": "NSFW Content",
    "personalityField": "Personality",
    "personalityPlaceholder": "Character's personality traits, behavior patterns...",
    "scenario": "Scenario",
    "scenarioPlaceholder": "The setting or context for conversations...",
    "systemPrompt": "System Prompt",
    "systemPromptPlaceholder": "System-level instructions for the AI...",
    "firstMessage": "First Message",
    "firstMessagePlaceholder": "Character's opening message when starting a chat...",
    "exampleMessages": "Example Messages",
    "exampleMessagesPlaceholder": "Example conversation to guide the AI's style...",
    "creatorNotes": "Creator Notes",
    "creatorNotesPlaceholder": "Notes about the character for other creators...",
    "uploadAvatar": "Upload Avatar",
    "changeAvatar": "Change Avatar",
    "save": "Save Character",
    "saving": "Saving...",
    "saveSuccess": "Character saved",
    "saveFailed": "Failed to save character",
    "preview": "Preview",
    "chooseTemplate": "Choose a Template",
    "templateBlank": "Blank",
    "templateBlankDesc": "Start from scratch",
    "templateAssistant": "Assistant",
    "templateAssistantDesc": "Helpful AI assistant",
    "templateRoleplay": "Roleplay",
    "templateRoleplayDesc": "Roleplay character with personality",
    "templateEducator": "Educator",
    "templateEducatorDesc": "Educational character",
    "templateStoryteller": "Storyteller",
    "templateStorytellerDesc": "Narrative and creative writing",
    "versionHistory": "Version History",
    "version": "Version {version}",
    "restore": "Restore",
    "restoreConfirm": "Restore this version? Current changes will be replaced.",
    "restoreTitle": "Confirm Restore",
    "restored": "Version restored",
    "noVersions": "No version history yet"
  }
}
```

zh-CN.json:
```json
{
  "characterEditor": {
    "createTitle": "创建角色",
    "editTitle": "编辑角色",
    "basicInfo": "基本信息",
    "personality": "性格",
    "messages": "消息",
    "creatorInfo": "创作者信息",
    "avatar": "头像",
    "name": "名称",
    "namePlaceholder": "角色名称",
    "description": "描述",
    "descriptionPlaceholder": "角色的简要描述",
    "category": "分类",
    "tags": "标签",
    "tagsPlaceholder": "添加标签",
    "nsfw": "NSFW 内容",
    "personalityField": "性格特征",
    "personalityPlaceholder": "角色的性格特征、行为模式...",
    "scenario": "场景",
    "scenarioPlaceholder": "对话的背景或情境...",
    "systemPrompt": "系统提示词",
    "systemPromptPlaceholder": "给 AI 的系统级指令...",
    "firstMessage": "开场白",
    "firstMessagePlaceholder": "开始聊天时角色的第一条消息...",
    "exampleMessages": "示例对话",
    "exampleMessagesPlaceholder": "引导 AI 风格的示例对话...",
    "creatorNotes": "创作者备注",
    "creatorNotesPlaceholder": "给其他创作者的备注...",
    "uploadAvatar": "上传头像",
    "changeAvatar": "更换头像",
    "save": "保存角色",
    "saving": "保存中...",
    "saveSuccess": "角色已保存",
    "saveFailed": "保存角色失败",
    "preview": "预览",
    "chooseTemplate": "选择模板",
    "templateBlank": "空白",
    "templateBlankDesc": "从零开始",
    "templateAssistant": "助手",
    "templateAssistantDesc": "实用 AI 助手",
    "templateRoleplay": "角色扮演",
    "templateRoleplayDesc": "有个性的角色扮演",
    "templateEducator": "教育者",
    "templateEducatorDesc": "教育类角色",
    "templateStoryteller": "故事家",
    "templateStorytellerDesc": "叙事与创意写作",
    "versionHistory": "版本历史",
    "version": "版本 {version}",
    "restore": "恢复",
    "restoreConfirm": "恢复此版本？当前更改将被替换。",
    "restoreTitle": "确认恢复",
    "restored": "版本已恢复",
    "noVersions": "暂无版本历史"
  }
}
```

Also remove the `myCharacters.createComingSoon` key from both files (it's no longer needed).

**Verification:**
Run: `npx vitest run 2>&1 | tail -5`

**Commit:** `feat(i18n): add character editor translations (en-US + zh-CN)`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 20 entry:
```markdown
### 迭代 20: 角色创作工具 ✅ (2026-02-22)
- ✅ **角色编辑器** — CharacterEditor 页面 (创建/编辑模式), 完整 SillyTavern V2 字段
- ✅ **头像上传** — 图片上传转 base64, 实时预览
- ✅ **角色预览** — CharacterPreview 实时预览面板
- ✅ **版本历史** — character_versions 表, 自动保存版本, 恢复功能
- ✅ **角色模板** — 5 个预设模板 (空白/助手/角色扮演/教育者/故事家)
- ✅ **i18n** — characterEditor.* 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 20 (character creation tools)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- Character creation form works (navigate from MyCharacters → Create)
- Character editing works (navigate from MyCharacters → Edit)
- Avatar upload converts to base64 and displays
- Preview panel updates live as user types
- Version history shows saved versions with restore capability
- Templates populate form fields on selection
