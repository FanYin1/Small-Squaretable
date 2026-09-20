# 角色卡参数动态调整方案

## 概述

针对角色卡（Character Card）中的各项参数，提供灵活的动态调整机制，支持：
- **会话级覆盖**：临时调整参数，不影响原始角色卡
- **预设配置**：保存常用的参数组合
- **实时调整**：对话中动态修改参数
- **A/B 测试**：对比不同参数效果

## 当前角色卡结构

### SillyTavern V2 格式
```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Rina",
    "description": "角色描述...",
    "personality": "性格特征",
    "scenario": "场景设定",
    "first_mes": "第一条消息",
    "mes_example": "对话示例",
    "system_prompt": "系统提示词",
    "post_history_instructions": "历史后指令",
    "alternate_greetings": [],
    "tags": [],
    "creator_notes": "创作者备注"
  }
}
```

### 可调整的关键参数
1. **描述类**：description, personality, scenario
2. **提示词类**：system_prompt, post_history_instructions
3. **对话类**：first_mes, mes_example, alternate_greetings
4. **元数据类**：tags, creator_notes

## 方案 1: 会话级参数覆盖（Session Override）

### 数据库 Schema

```typescript
// src/db/schema/chat-overrides.ts
export const chatOverrides = pgTable('chat_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  // 覆盖的参数（部分覆盖）
  overrides: jsonb('overrides').notNull(),

  // 是否启用
  enabled: boolean('enabled').default(true).notNull(),

  // 备注
  note: text('note'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  chatIdIdx: index('idx_chat_overrides_chat_id').on(table.chatId),
}));
```

### 覆盖示例

```json
{
  "overrides": {
    "personality": "更加友善和耐心",
    "scenario": "在咖啡厅的轻松对话",
    "system_prompt": "你现在处于放松模式，回复更加简短"
  }
}
```

### 使用流程

```typescript
// 1. 获取原始角色卡
const character = await characterRepository.findById(characterId);
const baseCardData = character.cardData;

// 2. 获取会话覆盖
const override = await chatOverrideRepository.findByChatId(chatId);

// 3. 合并参数
const effectiveCardData = override?.enabled
  ? { ...baseCardData, ...override.overrides }
  : baseCardData;

// 4. 使用合并后的参数构建提示词
const systemPrompt = buildSystemPrompt(effectiveCardData);
```

## 方案 2: 参数预设系统（Parameter Presets）

### 数据库 Schema

```typescript
// src/db/schema/character-presets.ts
export const characterPresets = pgTable('character_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .references(() => characters.id, { onDelete: 'cascade' }),

  // 预设名称
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),

  // 预设参数
  preset: jsonb('preset').notNull(),

  // 是否为全局预设（适用于所有角色）
  isGlobal: boolean('is_global').default(false).notNull(),

  // 使用次数统计
  useCount: integer('use_count').default(0).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_character_presets_user_id').on(table.userId),
  characterIdIdx: index('idx_character_presets_character_id').on(table.characterId),
}));
```

### 预设示例

```json
{
  "name": "简短回复模式",
  "description": "适合快速对话，回复更简洁",
  "preset": {
    "system_prompt": "请用简短的语言回复，每次回复不超过50字。",
    "post_history_instructions": "保持简洁。"
  }
}
```

```json
{
  "name": "详细叙述模式",
  "description": "适合深度角色扮演，回复更详细",
  "preset": {
    "system_prompt": "请详细描述场景、动作和心理活动。",
    "description": "{{original}} 注重细节描写和氛围营造。"
  }
}
```

```json
{
  "name": "友善模式",
  "description": "让角色更加友好和支持性",
  "preset": {
    "personality": "友善、支持、鼓励",
    "scenario": "在一个轻松愉快的环境中"
  }
}
```

## 方案 3: 实时参数调整（Runtime Adjustment）

### 前端 UI 组件

```vue
<!-- src/client/components/chat/CharacterTuner.vue -->
<template>
  <el-drawer
    v-model="visible"
    title="角色参数调整"
    size="400px"
  >
    <!-- 快速预设 -->
    <div class="section">
      <h3>快速预设</h3>
      <el-select v-model="selectedPreset" @change="applyPreset">
        <el-option
          v-for="preset in presets"
          :key="preset.id"
          :label="preset.name"
          :value="preset.id"
        />
      </el-select>
    </div>

    <!-- 参数调整 -->
    <div class="section">
      <h3>参数调整</h3>

      <!-- 性格 -->
      <el-form-item label="性格特征">
        <el-input
          v-model="overrides.personality"
          type="textarea"
          :rows="3"
          placeholder="留空使用原始设定"
        />
      </el-form-item>

      <!-- 场景 -->
      <el-form-item label="场景设定">
        <el-input
          v-model="overrides.scenario"
          type="textarea"
          :rows="3"
          placeholder="留空使用原始设定"
        />
      </el-form-item>

      <!-- 系统提示词 -->
      <el-form-item label="系统提示词">
        <el-input
          v-model="overrides.system_prompt"
          type="textarea"
          :rows="4"
          placeholder="留空使用原始设定"
        />
      </el-form-item>

      <!-- 回复风格 -->
      <el-form-item label="回复长度">
        <el-slider
          v-model="responseLength"
          :min="1"
          :max="5"
          :marks="lengthMarks"
          @change="updateResponseStyle"
        />
      </el-form-item>

      <!-- 情感强度 -->
      <el-form-item label="情感表达">
        <el-slider
          v-model="emotionalIntensity"
          :min="1"
          :max="5"
          :marks="intensityMarks"
          @change="updateEmotionalStyle"
        />
      </el-form-item>
    </div>

    <!-- 操作按钮 -->
    <template #footer>
      <el-button @click="resetToDefault">重置为默认</el-button>
      <el-button @click="saveAsPreset">保存为预设</el-button>
      <el-button type="primary" @click="applyOverrides">应用</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const overrides = ref({
  personality: '',
  scenario: '',
  system_prompt: '',
  post_history_instructions: '',
});

const responseLength = ref(3);
const emotionalIntensity = ref(3);

const lengthMarks = {
  1: '极简',
  2: '简短',
  3: '适中',
  4: '详细',
  5: '冗长'
};

const intensityMarks = {
  1: '克制',
  2: '平淡',
  3: '适中',
  4: '丰富',
  5: '强烈'
};

function updateResponseStyle() {
  const styles = {
    1: '请用极简的语言回复，每次不超过20字。',
    2: '请简短回复，每次不超过50字。',
    3: '请适度回复，每次50-150字。',
    4: '请详细回复，包含场景描写。',
    5: '请详尽回复，充分展开描写和对话。'
  };

  overrides.value.post_history_instructions = styles[responseLength.value];
}

function updateEmotionalStyle() {
  const styles = {
    1: '保持克制，情感表达含蓄。',
    2: '情感表达平淡自然。',
    3: '情感表达适中。',
    4: '情感表达丰富生动。',
    5: '情感表达强烈，充分展现内心活动。'
  };

  const current = overrides.value.post_history_instructions || '';
  overrides.value.post_history_instructions = current + ' ' + styles[emotionalIntensity.value];
}

async function applyOverrides() {
  await chatOverrideApi.createOrUpdate(chatId, {
    overrides: overrides.value,
    enabled: true
  });

  toast.success('参数已应用');
  emit('applied');
}
</script>
```

## 方案 4: 动态宏变量系统（Dynamic Macro Variables）

### 扩展宏语法

```typescript
// 原有宏
{{char}}  // 角色名
{{user}}  // 用户名
{{time}}  // 当前时间

// 新增动态宏
{{char.mood}}           // 角色当前情绪
{{char.energy}}         // 角色精力状态
{{char.relationship}}   // 与用户的关系状态
{{session.style}}       // 会话风格
{{session.length}}      // 回复长度偏好
```

### 使用示例

```json
{
  "system_prompt": "你是 {{char}}。{{char.mood}}。当前与{{user}}的关系是{{char.relationship}}。请以{{session.style}}的风格回复。",
  "description": "{{char}} 现在感到{{char.energy}}，表现得{{char.mood}}。"
}
```

### 动态变量存储

```typescript
// src/db/schema/chat-variables.ts
export const chatVariables = pgTable('chat_variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  // 变量键值对
  variables: jsonb('variables').notNull(),

  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 变量示例

```json
{
  "variables": {
    "char.mood": "开心愉悦",
    "char.energy": "精力充沛",
    "char.relationship": "亲密朋友",
    "session.style": "轻松幽默",
    "session.length": "适中"
  }
}
```

## 方案 5: 条件化参数（Conditional Parameters）

### 基于上下文的自动调整

```typescript
// src/server/services/adaptive-character.service.ts
export class AdaptiveCharacterService {
  /**
   * 根据对话上下文自动调整角色参数
   */
  async adaptParameters(
    character: Character,
    chatHistory: Message[],
    context: {
      timeOfDay: string;
      messageCount: number;
      lastEmotionState: string;
    }
  ): Promise<Record<string, any>> {
    const baseCardData = character.cardData;
    const adaptations: Record<string, any> = {};

    // 1. 根据对话长度调整
    if (context.messageCount > 50) {
      adaptations.system_prompt =
        (baseCardData.system_prompt || '') +
        ' 你们已经聊了很久，可以更加随意和亲密。';
    }

    // 2. 根据时间调整
    if (context.timeOfDay === 'night') {
      adaptations.scenario =
        (baseCardData.scenario || '') +
        ' 现在是深夜，氛围更加私密和安静。';
    }

    // 3. 根据情感状态调整
    if (context.lastEmotionState === 'sad') {
      adaptations.personality =
        (baseCardData.personality || '') +
        ' 此刻表现得更加温柔和关怀。';
    }

    return { ...baseCardData, ...adaptations };
  }
}
```

## 方案 6: 参数版本控制（Parameter Versioning）

### 支持参数历史和回滚

```typescript
// src/db/schema/character-parameter-history.ts
export const characterParameterHistory = pgTable('character_parameter_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  // 参数快照
  snapshot: jsonb('snapshot').notNull(),

  // 变更原因
  reason: varchar('reason', { length: 255 }),

  // 是否为自动调整
  isAutomatic: boolean('is_automatic').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  chatIdCreatedAtIdx: index('idx_param_history_chat_created')
    .on(table.chatId, table.createdAt),
}));
```

### 前端时间轴

```vue
<template>
  <el-timeline>
    <el-timeline-item
      v-for="version in parameterHistory"
      :key="version.id"
      :timestamp="version.createdAt"
    >
      <div class="version-card">
        <div class="version-reason">{{ version.reason }}</div>
        <el-button size="small" @click="rollbackTo(version)">
          恢复此版本
        </el-button>
      </div>
    </el-timeline-item>
  </el-timeline>
</template>
```

## 实现优先级建议

### 第一阶段（核心功能）
1. ✅ **会话级参数覆盖** - 最灵活，立即可用
2. ✅ **参数预设系统** - 提升用户体验
3. ✅ **前端调整 UI** - 可视化操作

### 第二阶段（增强功能）
4. ⏳ **动态宏变量** - 更强大的表达能力
5. ⏳ **条件化参数** - 智能自适应

### 第三阶段（高级功能）
6. ⏳ **参数版本控制** - 便于实验和回滚
7. ⏳ **A/B 测试框架** - 数据驱动优化

## API 设计

### 创建/更新覆盖
```typescript
POST /api/v1/chats/:chatId/overrides
{
  "overrides": {
    "personality": "更友善",
    "system_prompt": "简短回复"
  },
  "enabled": true,
  "note": "测试友善模式"
}
```

### 应用预设
```typescript
POST /api/v1/chats/:chatId/apply-preset
{
  "presetId": "uuid"
}
```

### 获取有效参数
```typescript
GET /api/v1/chats/:chatId/effective-parameters
Response: {
  "base": { /* 原始角色卡 */ },
  "overrides": { /* 覆盖参数 */ },
  "effective": { /* 合并后的有效参数 */ }
}
```

## 总结

推荐实现顺序：
1. **会话级覆盖** - 简单直接，立即解决问题
2. **预设系统** - 提升易用性
3. **可视化调整器** - 降低使用门槛
4. **动态宏变量** - 增强表达能力
5. **自适应调整** - 智能化体验

这套方案可以让用户灵活调整角色行为，而不需要修改原始角色卡，支持实验、对比和快速切换。
