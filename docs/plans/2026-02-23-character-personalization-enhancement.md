# Iteration 24: Character Personalization Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance character personalization with voice TTS customization (per-character voice settings), emotion visualization upgrade (2D scatter plot + emoji mood ring), character relationship graph (tracking inter-character and user-character relationships), and a character growth/leveling system based on interaction metrics.

**Architecture:** Voice settings are stored in the character's `cardData.extensions.voice` field (no schema migration needed). Emotion visualization gets a 2D Valence-Arousal scatter plot component using ECharts. Relationships use a new `character_relationships` table tracking affinity scores between entities. Growth uses a new `character_growth` table tracking XP, level, and milestones per user-character pair.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono.js + Zod, Vue 3 + Pinia + Element Plus + ECharts, Vitest

---

### Task 1: Add character voice settings to TTS system

**Files:**
- Modify: `src/client/composables/useTextToSpeech.ts`
- Modify: `src/client/components/chat/MessageBubble.vue`

**What to do:**

1. Extend `useTextToSpeech` to support voice configuration:

```ts
export interface VoiceConfig {
  lang?: string;       // e.g. 'en-US', 'zh-CN', 'ja-JP'
  rate?: number;       // 0.5 - 2.0
  pitch?: number;      // 0 - 2
  voiceName?: string;  // specific SpeechSynthesisVoice name
}

// Add getAvailableVoices() function
function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSupported.value) return [];
  return window.speechSynthesis.getVoices();
}

// Update speak() to accept VoiceConfig
function speak(text: string, config?: VoiceConfig): void {
  // ... existing logic ...
  utterance.lang = config?.lang || 'zh-CN';
  utterance.rate = config?.rate || 1;
  utterance.pitch = config?.pitch || 1;
  if (config?.voiceName) {
    const voice = getAvailableVoices().find(v => v.name === config.voiceName);
    if (voice) utterance.voice = voice;
  }
  // ...
}
```

2. In `MessageBubble.vue`, pass character voice config when calling TTS:

Read the character's voice settings from `props.message` or a new prop. The voice config comes from `character.cardData.extensions.voice`. Pass it through from ChatWindow → MessageBubble as a prop `voiceConfig?: VoiceConfig`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'useTextToSpeech|MessageBubble' | head -5`

**Commit:** `feat(client): add per-character voice configuration to TTS system`

---

### Task 2: Create character voice settings UI

**Files:**
- Create: `src/client/components/character/VoiceSettings.vue`
- Modify: `src/client/pages/CharacterEditor.vue` (or CharacterDetail.vue)

**What to do:**

Create a VoiceSettings component for configuring per-character voice:

```vue
<template>
  <div class="voice-settings">
    <div class="setting-row">
      <label>{{ t('character.voiceLanguage') }}</label>
      <el-select v-model="voiceConfig.lang" :placeholder="t('character.selectLanguage')">
        <el-option v-for="lang in availableLanguages" :key="lang" :label="lang" :value="lang" />
      </el-select>
    </div>
    <div class="setting-row">
      <label>{{ t('character.voiceName') }}</label>
      <el-select v-model="voiceConfig.voiceName" :placeholder="t('character.selectVoice')" clearable>
        <el-option v-for="voice in filteredVoices" :key="voice.name" :label="voice.name" :value="voice.name" />
      </el-select>
    </div>
    <div class="setting-row">
      <label>{{ t('character.voiceRate') }}</label>
      <el-slider v-model="voiceConfig.rate" :min="0.5" :max="2" :step="0.1" show-input />
    </div>
    <div class="setting-row">
      <label>{{ t('character.voicePitch') }}</label>
      <el-slider v-model="voiceConfig.pitch" :min="0" :max="2" :step="0.1" show-input />
    </div>
    <el-button size="small" @click="testVoice">{{ t('character.testVoice') }}</el-button>
  </div>
</template>
```

The component:
- Lists available `SpeechSynthesisVoice` entries from the browser
- Filters voices by selected language
- Has a "Test Voice" button that speaks a sample sentence
- Emits `update:config` with the VoiceConfig object

Integrate into CharacterEditor.vue as a collapsible section. Store voice config in `cardData.extensions.voice`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'VoiceSettings|CharacterEditor' | head -5`

**Commit:** `feat(client): add VoiceSettings component for per-character voice configuration`

---

### Task 3: Create emotion 2D scatter plot component

**Files:**
- Create: `src/client/components/debug/EmotionScatterPlot.vue`
- Modify: `src/client/components/debug/EmotionTimeline.vue`

**What to do:**

Create a 2D Valence-Arousal scatter plot using ECharts (already a project dependency via `vue-echarts`):

```vue
<template>
  <div class="emotion-scatter">
    <v-chart :option="chartOption" autoresize style="height: 300px" />
  </div>
</template>
```

The chart shows:
- X-axis: Valence (-1 to 1), labeled "Negative ← → Positive"
- Y-axis: Arousal (0 to 1), labeled "Calm ← → Excited"
- Background quadrant labels: "Angry/Fearful" (top-left), "Excited/Happy" (top-right), "Sad/Bored" (bottom-left), "Calm/Loving" (bottom-right)
- Emotion history as scatter points (colored by recency, most recent = larger)
- Current emotion as a highlighted point with emoji label
- EMOTION_MAP regions as semi-transparent colored areas

Integrate into EmotionTimeline.vue — add a tab toggle between "Timeline" (existing list) and "2D Map" (new scatter plot).

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'EmotionScatter|EmotionTimeline' | head -5`

**Commit:** `feat(client): add 2D Valence-Arousal emotion scatter plot`

---

### Task 4: Create character relationships schema and repository

**Files:**
- Create: `src/db/schema/character-relationships.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/repositories/character-relationship.repository.ts`

**What to do:**

1. Schema (`character-relationships.ts`):

```ts
import { pgTable, uuid, varchar, decimal, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterRelationships = pgTable('character_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  targetCharacterId: uuid('target_character_id').references(() => characters.id, { onDelete: 'cascade' }),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'cascade' }),

  // Relationship type and strength
  type: varchar('type', { length: 50 }).notNull(), // 'friend', 'rival', 'mentor', 'student', 'lover', 'family', 'acquaintance'
  affinity: decimal('affinity', { precision: 4, scale: 3 }).default('0.5').notNull(), // 0 to 1
  label: varchar('label', { length: 100 }),
  description: text('description'),

  // Interaction tracking
  interactionCount: integer('interaction_count').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterRelationship = typeof characterRelationships.$inferSelect;
export type NewCharacterRelationship = typeof characterRelationships.$inferInsert;
```

2. Add export to `src/db/schema/index.ts`.

3. Repository with methods:
- `findByCharacter(characterId, userId)` — all relationships for a character
- `findById(id)` — single relationship
- `create(data)` — insert
- `update(id, userId, data)` — update with ownership check
- `delete(id, userId)` — delete with ownership check
- `updateAffinity(id, delta)` — increment/decrement affinity (clamped 0-1)
- `incrementInteraction(id)` — increment interactionCount

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'character-relationship' | head -5`

**Commit:** `feat(db): add character relationships schema and repository`

---

### Task 5: Add character relationships API routes

**Files:**
- Create: `src/server/routes/character-relationships.ts`
- Modify: `src/server/index.ts`

**What to do:**

Create routes mounted at `/api/v1/characters/:characterId/relationships`:

1. `GET /` — list relationships for a character (auth, ownership via character)
2. `POST /` — create relationship (auth, zValidator)
3. `PATCH /:id` — update relationship (auth, ownership)
4. `DELETE /:id` — delete relationship (auth, ownership)

Validation schemas:
```ts
const createRelationshipSchema = z.object({
  targetCharacterId: z.string().uuid().optional(),
  type: z.enum(['friend', 'rival', 'mentor', 'student', 'lover', 'family', 'acquaintance']),
  affinity: z.number().min(0).max(1).default(0.5),
  label: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});
```

Mount in `src/server/index.ts`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'character-relationship|index\.ts' | head -5`

**Commit:** `feat(server): add character relationships API routes`

---

### Task 6: Create character growth schema, repository, and routes

**Files:**
- Create: `src/db/schema/character-growth.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/repositories/character-growth.repository.ts`
- Modify: `src/server/routes/intelligence.ts` (or create new route file)

**What to do:**

1. Schema (`character-growth.ts`):

```ts
import { pgTable, uuid, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterGrowth = pgTable('character_growth', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Growth metrics
  level: integer('level').default(1).notNull(),
  experience: integer('experience').default(0).notNull(),
  totalMessages: integer('total_messages').default(0).notNull(),
  totalChats: integer('total_chats').default(0).notNull(),

  // Milestones achieved
  milestones: jsonb('milestones').default([]).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterGrowthRecord = typeof characterGrowth.$inferSelect;
export type NewCharacterGrowthRecord = typeof characterGrowth.$inferInsert;
```

2. Repository with methods:
- `findByCharacterAndUser(characterId, userId)` — get or null
- `getOrCreate(characterId, userId)` — find or create with defaults
- `addExperience(id, xp)` — add XP, auto-level-up (100 XP per level)
- `incrementMessages(id)` — increment totalMessages + add 10 XP
- `incrementChats(id)` — increment totalChats + add 25 XP
- `addMilestone(id, milestone)` — append to milestones jsonb array

3. API endpoints (add to intelligence routes or create `src/server/routes/character-growth.ts`):
- `GET /api/v1/characters/:characterId/growth` — get growth data (auth)
- `GET /api/v1/characters/:characterId/growth/milestones` — list milestones

Level thresholds: Level N requires N * 100 XP total. Milestones are predefined:
```ts
const MILESTONES = [
  { level: 5, name: 'first_friend', label: 'First Friend' },
  { level: 10, name: 'regular', label: 'Regular Companion' },
  { level: 25, name: 'best_friend', label: 'Best Friend' },
  { level: 50, name: 'soulmate', label: 'Soulmate' },
];
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'character-growth' | head -5`

**Commit:** `feat: add character growth/leveling schema, repository, and API`

---

### Task 7: Frontend — relationship graph component

**Files:**
- Create: `src/client/services/character-relationship.api.ts`
- Create: `src/client/components/character/RelationshipGraph.vue`

**What to do:**

1. API service with CRUD methods for relationships.

2. RelationshipGraph component using ECharts graph chart:

```vue
<template>
  <div class="relationship-graph">
    <div class="graph-header">
      <span>{{ t('character.relationships') }}</span>
      <el-button size="small" @click="showAddDialog = true">{{ t('character.addRelationship') }}</el-button>
    </div>
    <v-chart v-if="relationships.length" :option="graphOption" autoresize style="height: 400px" />
    <el-empty v-else :description="t('character.noRelationships')" />
    <!-- Add relationship dialog -->
  </div>
</template>
```

The graph shows:
- Center node: current character (larger, highlighted)
- Connected nodes: related characters (sized by affinity)
- Edge labels: relationship type
- Edge thickness: affinity strength
- Node colors: by relationship type
- Click node to view/edit relationship

Include an "Add Relationship" dialog with a character selector dropdown and relationship type/affinity inputs.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'RelationshipGraph|character-relationship' | head -5`

**Commit:** `feat(client): add character relationship graph component`

---

### Task 8: Frontend — character growth display

**Files:**
- Create: `src/client/services/character-growth.api.ts`
- Create: `src/client/components/character/GrowthPanel.vue`
- Modify: `src/client/components/chat/ChatWindow.vue`

**What to do:**

1. API service for growth endpoints.

2. GrowthPanel component showing:
- Level badge with XP progress bar
- Total messages and chats count
- Milestone badges (locked/unlocked)
- Level-up animation (when XP crosses threshold)

```vue
<template>
  <div class="growth-panel">
    <div class="level-display">
      <span class="level-badge">Lv.{{ growth.level }}</span>
      <el-progress :percentage="xpPercentage" :stroke-width="8" />
      <span class="xp-text">{{ growth.experience % 100 }} / 100 XP</span>
    </div>
    <div class="stats-row">
      <div class="stat">
        <span class="stat-value">{{ growth.totalMessages }}</span>
        <span class="stat-label">{{ t('character.totalMessages') }}</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ growth.totalChats }}</span>
        <span class="stat-label">{{ t('character.totalChats') }}</span>
      </div>
    </div>
    <div class="milestones">
      <div v-for="ms in allMilestones" :key="ms.name"
        :class="['milestone', { unlocked: isUnlocked(ms) }]">
        {{ ms.label }}
      </div>
    </div>
  </div>
</template>
```

3. Add a "Growth" button to ChatWindow header (next to Memory/Debug buttons) that opens the GrowthPanel in a drawer or dialog.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'GrowthPanel|ChatWindow' | head -5`

**Commit:** `feat(client): add character growth panel with level, XP, and milestones`

---

### Task 9: Wire growth XP to chat events

**Files:**
- Modify: `src/server/routes/chats.ts`

**What to do:**

After a message is sent (in the `POST /:id/messages` handler), increment the character's growth:

```ts
// After message creation succeeds:
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';

// In the message handler, after saving the message:
if (chat.characterId) {
  const growth = await characterGrowthRepository.getOrCreate(chat.characterId, user.id);
  await characterGrowthRepository.incrementMessages(growth.id);
}
```

Similarly, in the `POST /` (create chat) handler:
```ts
if (primaryCharacterId) {
  const growth = await characterGrowthRepository.getOrCreate(primaryCharacterId, user.id);
  await characterGrowthRepository.incrementChats(growth.id);
}
```

These should be fire-and-forget (don't await, or wrap in try/catch to not block the main flow).

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'chats\.ts' | head -5`

**Commit:** `feat(server): wire character growth XP to chat and message events`

---

### Task 10: Add i18n keys for all new features

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Add keys to the `character` section:

```json
{
  "character": {
    "voiceSettings": "Voice Settings",
    "voiceLanguage": "Language",
    "selectLanguage": "Select language",
    "voiceName": "Voice",
    "selectVoice": "Select voice",
    "voiceRate": "Speed",
    "voicePitch": "Pitch",
    "testVoice": "Test Voice",
    "relationships": "Relationships",
    "addRelationship": "Add Relationship",
    "editRelationship": "Edit Relationship",
    "deleteRelationship": "Delete Relationship",
    "noRelationships": "No relationships yet",
    "relationshipType": "Type",
    "relationshipAffinity": "Affinity",
    "relationshipLabel": "Label",
    "friend": "Friend",
    "rival": "Rival",
    "mentor": "Mentor",
    "student": "Student",
    "lover": "Lover",
    "family": "Family",
    "acquaintance": "Acquaintance",
    "growth": "Growth",
    "level": "Level",
    "experience": "Experience",
    "totalMessages": "Messages",
    "totalChats": "Chats",
    "milestones": "Milestones",
    "firstFriend": "First Friend",
    "regular": "Regular Companion",
    "bestFriend": "Best Friend",
    "soulmate": "Soulmate"
  }
}
```

Add corresponding zh-CN translations. Also add `debug.emotion.scatterPlot` and `debug.emotion.timeline` keys for the emotion tab toggle.

**Verification:**
Run: `node -e "JSON.parse(require('fs').readFileSync('src/client/i18n/locales/en-US.json'))"`

**Commit:** `feat(i18n): add character voice, relationship, growth, and emotion translations`

---

### Task 11: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 24 entry:
```markdown
### 迭代 24: 角色个性化增强 ✅ (2026-02-23)
- ✅ **语音定制** — 每角色 TTS 配置 (语言/语速/音调/声音选择)
- ✅ **情绪可视化** — 2D Valence-Arousal 散点图 (ECharts)
- ✅ **关系图谱** — character_relationships 表 + ECharts 关系图
- ✅ **成长系统** — character_growth 表 + 等级/经验/里程碑
- ✅ **i18n** — character.* 新增 35+ 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 24 (character personalization enhancement)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- Characters can have custom voice settings for TTS playback
- Emotion history shows on a 2D scatter plot with quadrant labels
- Character relationships can be created, viewed as a graph, and edited
- Characters gain XP and level up through chat interactions
- Milestones unlock at level thresholds
