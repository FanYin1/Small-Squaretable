# Iteration 37: Character System Advanced (角色系统进阶)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add alternate greetings editor, expression sprite display, V3 card spec import/export, and fix the cardData round-trip bug in CharacterEditor.

**Architecture:** 6 tasks in dependency order. T1 fixes the critical cardData round-trip bug (all other tasks depend on it). T2 adds alternate greetings editor. T3 adds expression sprite infrastructure. T4 adds V3 card spec support. T5 adds greeting persistence. T6 runs final verification. T2-T5 are independent after T1.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Fix CharacterEditor cardData round-trip bug

**Files:**
- Modify: `src/client/pages/CharacterEditor.vue` (lines 104-114, 150-173)

**What to do:**

Critical bug: When editing a character, `handleSave()` builds a fresh `cardData` object with only the form fields (personality, scenario, first_mes, etc.). Any fields not in the form — `alternate_greetings`, `post_history_instructions`, `character_book`, `creator`, `character_version`, custom extensions — are silently dropped on save.

1. Add a ref to store the original cardData when loading:
```ts
const originalCardData = ref<Record<string, unknown>>({});
```

2. In `fetchCharacter()` (line 161), save the original:
```ts
const cd = character.cardData;
if (cd) {
  originalCardData.value = { ...cd };
  // ... existing field extraction
}
```

3. In `handleSave()` (lines 104-114), merge form fields into the original cardData instead of building from scratch:
```ts
const cardData: CharacterCardData = {
  ...originalCardData.value,
  personality: form.personality || undefined,
  scenario: form.scenario || undefined,
  first_mes: form.firstMessage || undefined,
  mes_example: form.exampleMessages || undefined,
  system_prompt: form.systemPrompt || undefined,
  creator_notes: form.creatorNotes || undefined,
  extensions: {
    ...(originalCardData.value.extensions as Record<string, unknown> || {}),
    voice: voiceConfig.value,
  },
};
```

This preserves `alternate_greetings`, `post_history_instructions`, `character_book`, `creator`, `character_version`, and any V3/custom fields through edits.

**Tests:** ~2 tests in `src/client/pages/CharacterEditor.spec.ts`
- Save preserves `alternate_greetings` from original cardData
- Save preserves `post_history_instructions` from original cardData

Mock `characterApi.getCharacter` to return a character with extra cardData fields, trigger save, verify `characterApi.updateCharacter` receives those fields.

**Commit:** `fix(editor): preserve unknown cardData fields on character save`

---

### Task 2: Add alternate greetings editor to CharacterEditor

**Files:**
- Modify: `src/client/pages/CharacterEditor.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

The greeting swipe UI already exists in ChatWindow.vue (lines 145-153, 696-732) and reads `cardData.alternate_greetings`. But there's no way to create/edit them. Add an editor section.

1. Add `alternateGreetings` to the form reactive:
```ts
const form = reactive({
  // ... existing fields
  alternateGreetings: [] as string[],
});
```

2. In `fetchCharacter()`, load alternate greetings:
```ts
if (cd.alternate_greetings && Array.isArray(cd.alternate_greetings)) {
  form.alternateGreetings = [...cd.alternate_greetings];
}
```

3. In `handleSave()`, include alternate greetings in cardData:
```ts
const cardData: CharacterCardData = {
  ...originalCardData.value,
  // ... existing fields
  alternate_greetings: form.alternateGreetings.length > 0 ? form.alternateGreetings : undefined,
};
```

4. Add UI section after the "First Message" textarea. Use a dynamic list with add/remove buttons:
```vue
<!-- Alternate Greetings -->
<el-form-item :label="t('characterEditor.alternateGreetings')">
  <div class="alternate-greetings-list">
    <div v-for="(_, index) in form.alternateGreetings" :key="index" class="greeting-item">
      <el-input
        v-model="form.alternateGreetings[index]"
        type="textarea"
        :rows="3"
        :placeholder="t('characterEditor.alternateGreetingPlaceholder', { n: index + 1 })"
      />
      <el-button type="danger" text @click="form.alternateGreetings.splice(index, 1)">
        {{ t('common.delete') }}
      </el-button>
    </div>
    <el-button @click="form.alternateGreetings.push('')" :disabled="form.alternateGreetings.length >= 10">
      {{ t('characterEditor.addGreeting') }}
    </el-button>
  </div>
</el-form-item>
```

5. Add i18n keys to both locale files:
- `characterEditor.alternateGreetings`: "Alternate Greetings" / "备选问候语"
- `characterEditor.alternateGreetingPlaceholder`: "Alternate greeting {n}..." / "备选问候语 {n}..."
- `characterEditor.addGreeting`: "Add Greeting" / "添加问候语"

6. Also load alternate greetings from templates in the `onMounted` template path:
```ts
if (template.cardData.alternate_greetings) {
  form.alternateGreetings = [...template.cardData.alternate_greetings];
}
```

**Tests:** ~2 tests in `src/client/pages/CharacterEditor.spec.ts`
- Alternate greetings loaded from character cardData
- Alternate greetings included in save payload

**Commit:** `feat(editor): add alternate greetings editor`

---

### Task 3: Add expression sprite display in chat

**Files:**
- Create: `src/client/components/chat/ExpressionSprite.vue`
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/types/index.ts`

**What to do:**

The emotion system already provides real-time emotion labels via `intelligenceStore.emotionLabel`. Map these to sprite images stored in `cardData.extensions.expressions`.

1. Add `ExpressionConfig` to `CharacterCardData` in `src/client/types/index.ts`:
```ts
export interface ExpressionConfig {
  [emotionLabel: string]: string; // emotion label -> image URL
}
```

Add to `CharacterCardData`:
```ts
export interface CharacterCardData {
  // ... existing fields
  alternate_greetings?: string[];
  post_history_instructions?: string;
  // V3 fields
  creation_date?: number;
  modification_date?: number;
  source?: string[];
  group_only_greetings?: string[];
  creator_notes_multilingual?: Record<string, string>;
}
```

2. Create `ExpressionSprite.vue` — a simple component that displays the sprite image for the current emotion:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { ExpressionConfig } from '@client/types';

const props = defineProps<{
  expressions: ExpressionConfig;
  emotionLabel: string;
}>();

const spriteUrl = computed(() => {
  return props.expressions[props.emotionLabel]
    || props.expressions['neutral']
    || props.expressions['default']
    || null;
});
</script>

<template>
  <div v-if="spriteUrl" class="expression-sprite">
    <img :src="spriteUrl" :alt="emotionLabel" class="sprite-image" />
  </div>
</template>
```

Style: max-height 200px, centered, with fade transition on emotion change.

3. In `ChatWindow.vue`, import and display `ExpressionSprite` above the messages area when the character has expressions configured:
```vue
<ExpressionSprite
  v-if="characterExpressions"
  :expressions="characterExpressions"
  :emotion-label="intelligenceStore.emotionLabel || 'neutral'"
/>
```

Where `characterExpressions` is a computed:
```ts
const characterExpressions = computed(() => {
  const cardData = chatStore.currentCharacter?.cardData;
  if (!cardData?.extensions?.expressions) return null;
  return cardData.extensions.expressions as ExpressionConfig;
});
```

4. Also support V3 `assets` array as a source for expressions. If `cardData.extensions.expressions` is not set but `cardData.assets` exists, build the expression map from assets with `type: 'expression'`:
```ts
const characterExpressions = computed(() => {
  const cardData = chatStore.currentCharacter?.cardData;
  // Check extensions.expressions first
  if (cardData?.extensions?.expressions) {
    return cardData.extensions.expressions as ExpressionConfig;
  }
  // Fall back to V3 assets
  if (cardData?.assets && Array.isArray(cardData.assets)) {
    const expressionAssets = cardData.assets.filter((a: any) => a.type === 'expression');
    if (expressionAssets.length > 0) {
      const map: Record<string, string> = {};
      for (const asset of expressionAssets) {
        map[asset.name] = asset.uri;
      }
      return map;
    }
  }
  return null;
});
```

**Tests:** ~3 tests in `src/client/components/chat/ExpressionSprite.spec.ts`
- Renders sprite image for matching emotion
- Falls back to neutral/default when emotion not found
- Renders nothing when no expressions configured

**Commit:** `feat(chat): add expression sprite display component`

---

### Task 4: Add V3 card spec import/export support

**Files:**
- Modify: `src/client/utils/sillytavern.ts`
- Modify: `src/server/routes/characters.ts` (JSON/PNG export handlers)

**What to do:**

The V3 spec adds: `alternate_greetings`, `creator_notes_multilingual`, `source`, `group_only_greetings`, `creation_date`, `modification_date`, `assets`. Currently the codebase hardcodes V2.

1. In `sillytavern.ts`, add `isV3Format()`:
```ts
export function isV3Format(data: any): boolean {
  return Boolean(data.spec === 'chara_card_v3' && data.data && typeof data.data === 'object' && data.data.name);
}
```

2. Update `normalizeSillyTavernData()` to handle V3 — the structure is the same as V2 (nested `data` block), just with additional fields. Update `isV2Format` check to also match V3:
```ts
export function normalizeSillyTavernData(data: any): SillyTavernCharacter {
  if (isV2Format(data) || isV3Format(data)) {
    // V2/V3 format: extract data from nested 'data' block
    const innerData = data.data;
    return {
      // ... existing extraction (unchanged)
    };
  }
  return data;
}
```

3. Update `SillyTavernCharacter` interface to include V3 fields:
```ts
export interface SillyTavernCharacter {
  // ... existing fields
  alternate_greetings?: string[];
  post_history_instructions?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings?: string[];
  creation_date?: number;
  modification_date?: number;
  assets?: Array<{ type: string; uri: string; name: string; ext: string }>;
}
```

4. Update `exportToSillyTavern()` to detect V3 fields and set spec accordingly:
```ts
// After building stCharacter, check if V3 fields are present
const hasV3Fields = cardData.alternate_greetings
  || cardData.creator_notes_multilingual
  || cardData.assets
  || cardData.source
  || cardData.group_only_greetings;

if (hasV3Fields) {
  stCharacter.spec = 'chara_card_v3';
  stCharacter.spec_version = '3.0';
}
```

5. Update server-side JSON export (`src/server/routes/characters.ts`) similarly — if cardData contains V3 fields, set `spec: 'chara_card_v3'`, `spec_version: '3.0'` instead of hardcoded V2. Also add `creation_date` and `modification_date` from the character's `createdAt`/`updatedAt` timestamps:
```ts
const hasV3Fields = cardData.alternate_greetings
  || cardData.creator_notes_multilingual
  || cardData.assets
  || cardData.source
  || cardData.group_only_greetings;

const exportData = {
  ...cardData,
  name: character.name,
  description: character.description || '',
  tags: character.tags || [],
  spec: hasV3Fields ? 'chara_card_v3' : 'chara_card_v2',
  spec_version: hasV3Fields ? '3.0' : '2.0',
  creation_date: Math.floor(new Date(character.createdAt).getTime() / 1000),
  modification_date: Math.floor(new Date(character.updatedAt).getTime() / 1000),
};
```

6. Apply the same V3 detection to the PNG export handler.

**Tests:** ~4 tests in `src/client/utils/sillytavern.spec.ts`
- `isV3Format` returns true for V3 cards
- Import normalizes V3 card correctly (preserves `alternate_greetings`, `assets`)
- Export sets `chara_card_v3` when V3 fields present
- Export keeps `chara_card_v2` when no V3 fields

**Commit:** `feat(cards): add V3 character card spec import/export support`

---

### Task 5: Persist selected greeting as first chat message

**Files:**
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/stores/chat.ts`

**What to do:**

Currently the greeting is display-only (rendered when `messages.length === 0`). When the user sends their first message, the selected greeting should be persisted as the first assistant message so it appears in chat history.

1. In `ChatWindow.vue`, expose the current greeting index so the chat store can access it. Add a method that persists the greeting:
```ts
async function persistGreeting() {
  if (messages.value.length > 0) return; // Already has messages
  if (!currentGreeting.value) return;
  const chatId = chatStore.currentChatId;
  if (!chatId) return;

  // Add greeting as first assistant message via the store
  await chatStore.addGreetingMessage(chatId, currentGreeting.value);
}
```

2. Call `persistGreeting()` before sending the first user message. In the message send handler (or watch for the first user message being added):
```ts
// In the send message flow, before sending:
if (messages.value.length === 0 && currentGreeting.value) {
  await persistGreeting();
}
```

3. In `src/client/stores/chat.ts`, add `addGreetingMessage`:
```ts
async function addGreetingMessage(chatId: string, content: string) {
  await chatApi.sendMessage(chatId, {
    role: 'assistant',
    content,
  });
}
```

Check the actual `sendMessage` / `addMessage` API to use the correct method. The goal is to create an assistant message record in the DB so the greeting persists across sessions.

4. After persisting, the greeting container should disappear (because `messages.length > 0`) and the message should appear in the normal message list.

**Tests:** ~2 tests in `src/client/components/chat/ChatWindow.spec.ts`
- Greeting is persisted when user sends first message
- Greeting is not persisted if messages already exist

**Commit:** `feat(chat): persist selected greeting as first assistant message`

---

### Task 6: Final verification + i18n

**What to do:**

1. Run `npx vitest run` — expect 1860+ tests passing, 0 failures
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - CharacterEditor preserves unknown cardData fields on save
   - Alternate greetings can be added/edited/removed in editor
   - Expression sprites display in chat when configured
   - V3 cards import/export correctly
   - Selected greeting persists as first message

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1860+ tests passing
- `npx tsc --noEmit` — 0 errors
- CharacterEditor preserves all cardData fields through edits
- Alternate greetings editable in CharacterEditor
- Expression sprites display based on emotion state
- V3 card spec supported in import/export
- Greeting persisted as first assistant message
