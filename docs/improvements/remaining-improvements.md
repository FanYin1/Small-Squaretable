# 剩余改进项目

基于 SillyTavern 最佳实践的剩余未实现功能

---

## 已完成功能 ✅

### P0 (Critical)
- ✅ GLM Model Configuration
- ✅ Character Author's Note (depth 0 injection)
- ✅ Example Dialogues Parsing (`<START>` separator, `{{char}}`/`{{user}}` macros)
- ⚠️ **Token Strength Hierarchy** - 部分实现，需要优化顺序

### P1 (High)
- ✅ Depth-based Insertion (atDepth mechanism)
- ✅ Smart Context Trimming (pinned messages, importance scoring)
- ✅ Token Counter UI
- ⚠️ **Recursive Scanning** - 未实现

### P2 (Medium)
- ✅ Character Filters
- ✅ Scan Depth & Context Percent
- ✅ Character Card Editor
- ✅ Chat Summarization

---

## 需要优化的功能 ⚠️

### 1. Token Strength Hierarchy 优化

**当前问题：**
Memory 和 Emotion 注入位置太靠前（在 World Info 之前），影响力不够。

**当前顺序：**
```
1. Character description
2. Personality
3. Scenario
4. Example dialogues
5. World Info (before)
6. Memory ← 太早了
7. World Info (EMTop)
8. Emotion ← 太早了
9. World Info (EMBottom/ANTop/ANBottom/after)
10. Behavior guidelines
11. atDepth entries (Author's Note at depth 0)
```

**推荐顺序：**
```
1. Character description (lowest priority)
2. Personality
3. Scenario
4. Example dialogues
5. World Info (before/EMTop)
6. Behavior guidelines
7. World Info (EMBottom/ANTop)
8. Memory retrieval ← 移到这里
9. Emotion state ← 移到这里
10. World Info (ANBottom/after)
11. atDepth entries (Author's Note at depth 0, highest priority)
```

**实施建议：**
```typescript
// src/server/services/chat.service.ts
async buildEnhancedSystemPrompt(params: EnhancedPromptParams): Promise<EnhancedPromptResult> {
  const parts: string[] = [];

  // 1. Character basics (lowest priority)
  parts.push(...defaultPromptParts);

  // 2. Example dialogues
  if (cardData.mes_example) {
    parts.push(exampleBlock);
  }

  // 3. World Info: before, EMTop
  if (worldInfo?.before) parts.push(worldInfo.before);
  if (worldInfo?.EMTop) parts.push(worldInfo.EMTop);

  // 4. Behavior guidelines (middle priority)
  parts.push('\n## 行为指引');
  parts.push('- 根据记忆中的信息个性化回复');
  // ...

  // 5. World Info: EMBottom, ANTop
  if (worldInfo?.EMBottom) parts.push(worldInfo.EMBottom);
  if (worldInfo?.ANTop) parts.push(worldInfo.ANTop);

  // 6. Memory retrieval (higher priority) ← 移到这里
  if (memories.length > 0) {
    parts.push('\n## 关于用户的记忆');
    // ...
  }

  // 7. Emotion state (higher priority) ← 移到这里
  if (emotion) {
    parts.push(`\n## 当前情感状态`);
    // ...
  }

  // 8. World Info: ANBottom, after
  if (worldInfo?.ANBottom) parts.push(worldInfo.ANBottom);
  if (worldInfo?.after) parts.push(worldInfo.after);

  // 9. atDepth entries (Author's Note at depth 0, highest priority)
  // Handled separately in context building

  return { systemPrompt: parts.join('\n\n'), atDepthEntries };
}
```

**优先级：** P0 (影响生成质量)

---

## 未实现的功能 ❌

### 2. Recursive Scanning (P1)

**功能描述：**
当一个 World Info entry 被触发时，它的内容也会被扫描，可以触发其他 entries。

**使用场景：**
- 层级 lore 结构: "monsters" → "goblin" → "goblin_king"
- 复杂世界观的渐进式展开

**实施建议：**
```typescript
// src/db/schema/worldbooks.ts
export const worldbookEntries = pgTable('worldbook_entries', {
  // ... existing fields
  recursive: boolean('recursive').default(true),
  preventRecursion: boolean('prevent_recursion').default(false),
});

// src/server/services/worldinfo-engine.service.ts
function scanRecursive(
  scanText: string,
  entries: WorldBookEntry[],
  maxDepth: number = 3
): WorldBookEntry[] {
  const activated = new Set<string>();
  let currentScanText = scanText;
  let depth = 0;

  while (depth < maxDepth) {
    const newlyActivated: WorldBookEntry[] = [];

    for (const entry of entries) {
      if (activated.has(entry.id)) continue;
      if (entry.preventRecursion && depth > 0) continue;

      if (matchesKeywords(currentScanText, entry)) {
        activated.add(entry.id);
        newlyActivated.push(entry);
      }
    }

    if (newlyActivated.length === 0) break;

    // Add newly activated content to scan text for next iteration
    if (newlyActivated.some(e => e.recursive)) {
      currentScanText += '\n' + newlyActivated
        .filter(e => e.recursive)
        .map(e => e.content)
        .join('\n');
    }

    depth++;
  }

  return Array.from(activated).map(id =>
    entries.find(e => e.id === id)!
  );
}
```

**优先级：** P1 (复杂 lore 必需)

---

### 3. Prompt Templates (P3)

**功能描述：**
支持不同模型的 prompt 格式模板（Alpaca, ChatML, Vicuna 等）。

**实施建议：**
```typescript
// src/server/config/prompt-templates.ts
export const PROMPT_TEMPLATES = {
  default: {
    system: "{prompt}",
    user: "{message}",
    assistant: "{message}"
  },
  alpaca: {
    system: "### Instruction:\n{prompt}\n\n",
    user: "### Input:\n{message}\n\n",
    assistant: "### Response:\n{message}\n\n"
  },
  chatml: {
    system: "<|im_start|>system\n{prompt}<|im_end|>\n",
    user: "<|im_start|>user\n{message}<|im_end|>\n",
    assistant: "<|im_start|>assistant\n{message}<|im_end|>\n"
  },
  vicuna: {
    system: "{prompt}\n\n",
    user: "USER: {message}\n",
    assistant: "ASSISTANT: {message}\n"
  }
};

// Allow per-character or global template selection
```

**优先级：** P3 (高级用户功能)

---

### 4. Regex Scripts (P3)

**功能描述：**
对 AI 输出进行后处理的正则表达式脚本。

**当前状态：**
- ✅ 已有 regex-scripts.service.ts
- ✅ 支持基本的 find/replace
- ❌ 未集成到前端 UI
- ❌ 未支持 SillyTavern 的完整格式

**实施建议：**
- 在 Character Card Editor 中添加 Regex Scripts 标签页
- 支持 `markdownOnly` 标志（仅在显示时应用）
- 支持 `trimStrings` 正则（去除空白）

**优先级：** P3 (高级定制)

---

### 5. Quick Replies (P3)

**功能描述：**
预设的快速回复按钮，支持宏和变量替换。

**实施建议：**
```typescript
// src/db/schema/quick-replies.ts
export const quickReplies = pgTable('quick_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0),
});

// UI: 在 MessageInput 下方显示快速回复按钮
// 点击后自动填充到输入框，支持 {{char}}, {{user}} 等宏
```

**优先级：** P3 (便利功能)

---

## 实施优先级建议

### 立即实施 (本周)
1. **Token Strength Hierarchy 优化** - 调整 Memory/Emotion 注入顺序

### 短期实施 (本月)
2. **Recursive Scanning** - 实现层级 lore 扫描

### 长期实施 (未来)
3. Prompt Templates
4. Regex Scripts UI 集成
5. Quick Replies

---

## 总结

**已完成：**
- P0: 4/4 (100%) - 1 项需要优化
- P1: 3/4 (75%) - 1 项未实现
- P2: 4/4 (100%)

**待完成：**
- Token Strength Hierarchy 优化 (P0)
- Recursive Scanning (P1)
- Prompt Templates (P3)
- Regex Scripts UI (P3)
- Quick Replies (P3)

**最高优先级：**
调整 Memory 和 Emotion 的注入顺序，使其更接近生成位置，提高影响力。

---

**最后更新：** 2026-03-01
**状态：** 核心功能已完成，剩余优化和高级功能
