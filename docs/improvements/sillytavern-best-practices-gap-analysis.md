# SillyTavern Best Practices - Gap Analysis

基于 SillyTavern 官方文档和社区最佳实践指南的系统改进建议

**参考资料:**
- SillyTavern Wiki: https://sillytavern.wiki/
- Character Design: https://sillytavern.wiki/usage/core-concepts/characterdesign/
- Ali:Chat Guide: https://rentry.co/alichat
- kingbri Minimalist Guide: https://rentry.co/kingbri-chara-guide
- World Info Encyclopedia: https://rentry.co/world-info-encyclopedia

---

## 1. Character Card Format Support

### 当前状态 ✅
- 支持 SillyTavern V2 格式 (PNG metadata)
- 支持基本字段: name, description, personality, scenario, first_mes, mes_example, alternate_greetings

### 缺失功能 ❌

#### 1.1 Character Author's Note
**SillyTavern 功能:**
- 角色专属的 Author's Note，在每次生成时注入
- 通常用于放置 PLists 格式的压缩特征
- 位置: 在最后一条用户消息之前 (depth 0)

**我们的问题:**
- 没有 `character_book.character_author_note` 字段支持
- 无法实现 kingbri 推荐的 PLists 优化方法

**建议实现:**
```typescript
// src/types/character.ts
export interface CharacterCardData {
  // ... existing fields
  character_author_note?: string;  // NEW: Character-specific Author's Note
}

// src/server/services/chat.service.ts
// 在构建 context 时注入 character_author_note
if (character.cardData?.character_author_note) {
  chatMessages.splice(chatMessages.length - 1, 0, {
    role: 'system',
    content: character.cardData.character_author_note
  });
}
```

#### 1.2 Example Dialogues 格式化
**SillyTavern 功能:**
- 使用 `<START>` 分隔多个对话示例
- 支持 `{{char}}` 和 `{{user}}` 占位符
- 示例对话在 context 满之前保留

**我们的问题:**
- `mes_example` 字段存在但未正确处理
- 没有解析 `<START>` 分隔符
- 没有替换 `{{char}}` / `{{user}}` 占位符

**建议实现:**
```typescript
// src/server/services/chat.service.ts
function parseExampleDialogues(mesExample: string, charName: string, userName: string): Message[] {
  if (!mesExample) return [];

  const examples = mesExample.split('<START>').filter(e => e.trim());
  const messages: Message[] = [];

  for (const example of examples) {
    const lines = example.trim().split('\n');
    for (const line of lines) {
      const replaced = line
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName);

      if (replaced.startsWith(`${charName}:`)) {
        messages.push({ role: 'assistant', content: replaced.substring(charName.length + 1).trim() });
      } else if (replaced.startsWith(`${userName}:`)) {
        messages.push({ role: 'user', content: replaced.substring(userName.length + 1).trim() });
      }
    }
  }

  return messages;
}
```

#### 1.3 Depth-based Insertion
**SillyTavern 功能:**
- World Info entries 可以指定 depth (从最后一条消息往前数)
- depth 0 = 最后一条用户消息之前 (最高优先级)
- depth 4 = 往前数第 4 条消息之前

**我们的问题:**
- World Book entries 只有简单的 `enabled` 和 `position` 字段
- 没有 depth-based insertion 机制

**建议实现:**
```typescript
// src/db/schema/worldbook-entry.ts
export const worldbookEntries = pgTable('worldbook_entries', {
  // ... existing fields
  depth: integer('depth').default(4),  // NEW: Insertion depth (0 = highest priority)
  insertionOrder: integer('insertion_order').default(100),  // NEW: Order within same depth
});

// src/server/services/worldinfo-engine.service.ts
function insertEntriesByDepth(messages: Message[], entries: WorldBookEntry[]): Message[] {
  const grouped = groupBy(entries, e => e.depth);

  for (const [depth, depthEntries] of Object.entries(grouped)) {
    const insertIndex = Math.max(0, messages.length - parseInt(depth) - 1);
    const sorted = depthEntries.sort((a, b) => a.insertionOrder - b.insertionOrder);

    messages.splice(insertIndex, 0, {
      role: 'system',
      content: sorted.map(e => e.content).join('\n\n')
    });
  }

  return messages;
}
```

---

## 2. World Info / Lorebook 增强

### 当前状态 ✅
- 基本的 World Book 支持
- Keyword 触发机制
- 四层作用域 (Chat > Persona > Character > Global)

### 缺失功能 ❌

#### 2.1 Recursive Scanning
**SillyTavern 功能:**
- 当一个 entry 被触发时，它的内容也会被扫描
- 可以创建层级树: "monsters" → "goblin" → "goblin_king"
- `recursive` 和 `non_recursable` 标志控制行为

**我们的问题:**
- 只扫描用户消息，不扫描已触发的 entries
- 无法实现复杂的 lore 层级结构

**建议实现:**
```typescript
// src/db/schema/worldbook-entry.ts
export const worldbookEntries = pgTable('worldbook_entries', {
  // ... existing fields
  recursive: boolean('recursive').default(true),  // NEW: Allow recursive scanning
});

// src/server/services/worldinfo-engine.service.ts
function scanRecursive(
  text: string,
  entries: WorldBookEntry[],
  depth: number = 0,
  maxDepth: number = 3
): WorldBookEntry[] {
  if (depth >= maxDepth) return [];

  const triggered = entries.filter(e =>
    e.keys.some(key => text.toLowerCase().includes(key.toLowerCase()))
  );

  const childTexts = triggered.map(e => e.content).join('\n');
  const recursiveEntries = entries.filter(e => e.recursive);
  const children = scanRecursive(childTexts, recursiveEntries, depth + 1, maxDepth);

  return [...triggered, ...children];
}
```

#### 2.2 Character Filters
**SillyTavern 功能:**
- `character_filter` 字段限制 entry 只对特定角色生效
- `character_exclusion` 字段排除特定角色

**我们的问题:**
- 没有角色过滤机制
- 所有 entries 对所有角色生效

**建议实现:**
```typescript
// src/db/schema/worldbook-entry.ts
export const worldbookEntries = pgTable('worldbook_entries', {
  // ... existing fields
  characterFilter: text('character_filter').array(),  // NEW: Only for these characters
  characterExclusion: text('character_exclusion').array(),  // NEW: Exclude these characters
});

// src/server/services/worldinfo-engine.service.ts
function filterByCharacter(entries: WorldBookEntry[], characterId: string): WorldBookEntry[] {
  return entries.filter(e => {
    if (e.characterFilter?.length && !e.characterFilter.includes(characterId)) {
      return false;
    }
    if (e.characterExclusion?.includes(characterId)) {
      return false;
    }
    return true;
  });
}
```

#### 2.3 Scan Depth & Context Percent
**SillyTavern 功能:**
- `scan_depth`: 扫描最近 N 条消息 (默认 2, 推荐 4)
- `context_percent`: World Info 最多占用 context 的百分比 (默认 25%, 推荐 45%)

**我们的问题:**
- 扫描所有消息历史 (低效)
- 没有 token budget 限制

**建议实现:**
```typescript
// src/server/services/worldinfo-engine.service.ts
interface WorldInfoConfig {
  scanDepth: number;      // Default: 4
  contextPercent: number; // Default: 45
}

function scan(
  messages: Message[],
  entries: WorldBookEntry[],
  config: WorldInfoConfig,
  totalTokenBudget: number
): WorldBookEntry[] {
  // Only scan last N messages
  const recentMessages = messages.slice(-config.scanDepth);
  const scanText = recentMessages.map(m => m.content).join('\n');

  const triggered = scanRecursive(scanText, entries);

  // Enforce token budget
  const maxTokens = totalTokenBudget * (config.contextPercent / 100);
  return enforceTokenBudget(triggered, maxTokens);
}
```

---

## 3. Prompt Engineering 优化

### 当前状态 ✅
- 基本的 system prompt 构建
- Memory 和 Emotion 注入
- Author's Note 支持 (greeting continuity fix)

### 缺失功能 ❌

#### 3.1 Token Strength Hierarchy
**SillyTavern 原则:**
> "Bottom has the highest strength and the top is the lowest strength"

**含义:**
- 越靠近生成位置的内容，影响力越大
- 最后一条用户消息之前的内容 (depth 0) 最重要
- Character description 在最前面，影响力最低

**我们的问题:**
- System prompt 构建顺序不符合最佳实践
- 重要的 Memory/Emotion 放在 system prompt 开头

**建议优化:**
```typescript
// src/server/services/chat.service.ts
// 当前顺序 (错误):
// 1. System prompt (character description, personality, scenario)
// 2. Memory retrieval
// 3. Emotion state
// 4. Chat history
// 5. User message

// 推荐顺序 (正确):
// 1. Character description (lowest priority)
// 2. Personality
// 3. Scenario
// 4. Chat history (older messages)
// 5. World Info entries (by depth)
// 6. Memory retrieval (higher priority)
// 7. Emotion state (higher priority)
// 8. Character Author's Note (depth 0, highest priority)
// 9. User message (generation point)
```

#### 3.2 Jailbreak / System Prompt Templates
**SillyTavern 功能:**
- 可配置的 system prompt 模板
- 支持 Alpaca, Vicuna, ChatML 等格式
- 社区共享的 "jailbreak" prompts

**我们的问题:**
- 硬编码的 system prompt 格式
- 无法适配不同模型的最佳格式

**建议实现:**
```typescript
// src/server/config/prompt-templates.ts
export const PROMPT_TEMPLATES = {
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
  // ... more templates
};

// Allow users to select template per character or globally
```

---

## 4. Context Management 改进

### 当前状态 ✅
- Context Manager 根据 token budget 选择消息
- 从新到旧选择消息

### 缺失功能 ❌

#### 4.1 Smart Context Trimming
**SillyTavern 功能:**
- 保留重要消息 (标记为 "pinned")
- 优先删除短消息或系统消息
- 保留对话连贯性 (成对保留 user/assistant)

**我们的问题:**
- 简单的 FIFO 删除策略
- 可能破坏对话连贯性

**建议实现:**
```typescript
// src/db/schema/messages.ts
export const messages = pgTable('messages', {
  // ... existing fields
  pinned: boolean('pinned').default(false),  // NEW: Pin important messages
  importance: integer('importance').default(5),  // NEW: 1-10 importance score
});

// src/server/services/context-manager.service.ts
function selectMessages(
  messages: Message[],
  tokenBudget: number
): Message[] {
  // 1. Always include pinned messages
  const pinned = messages.filter(m => m.pinned);

  // 2. Sort remaining by importance and recency
  const unpinned = messages
    .filter(m => !m.pinned)
    .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);

  // 3. Add messages until budget exhausted, keeping user/assistant pairs
  const selected = [...pinned];
  for (let i = 0; i < unpinned.length; i++) {
    const msg = unpinned[i];
    const tokens = estimateTokens(msg.content);

    if (totalTokens + tokens <= tokenBudget) {
      selected.push(msg);
      totalTokens += tokens;

      // If this is a user message, try to include the assistant response
      if (msg.role === 'user' && unpinned[i + 1]?.role === 'assistant') {
        const nextTokens = estimateTokens(unpinned[i + 1].content);
        if (totalTokens + nextTokens <= tokenBudget) {
          selected.push(unpinned[i + 1]);
          totalTokens += nextTokens;
          i++; // Skip next iteration
        }
      }
    }
  }

  return selected.sort((a, b) => a.createdAt - b.createdAt);
}
```

#### 4.2 Summarization
**SillyTavern 功能:**
- 自动总结旧对话历史
- 将总结作为 context 保留，删除原始消息
- 节省 tokens 同时保留重要信息

**我们的问题:**
- 没有自动总结功能
- 长对话会耗尽 context

**建议实现:**
```typescript
// src/server/services/summarization.service.ts
export async function summarizeOldMessages(
  chatId: string,
  threshold: number = 50  // Summarize when > 50 messages
): Promise<void> {
  const messages = await messageRepository.findByChatId(chatId);

  if (messages.length <= threshold) return;

  // Summarize oldest 30% of messages
  const toSummarize = messages.slice(0, Math.floor(messages.length * 0.3));
  const summary = await llmService.generateCompletion({
    messages: [
      { role: 'system', content: 'Summarize the following conversation, preserving key events and character development:' },
      ...toSummarize
    ]
  });

  // Create summary message
  await messageRepository.create({
    chatId,
    role: 'system',
    content: `[Previous conversation summary: ${summary}]`,
    pinned: true,
    importance: 10
  });

  // Delete original messages
  await messageRepository.deleteMany(toSummarize.map(m => m.id));
}
```

---

## 5. UI/UX 改进

### 缺失功能 ❌

#### 5.1 Character Card Editor
**SillyTavern 功能:**
- 可视化编辑器，支持所有字段
- 实时 token 计数
- 格式化辅助 (PLists, Ali:Chat)

**我们的问题:**
- 只能上传 PNG 文件
- 无法在线编辑角色卡

**建议实现:**
- 创建 `CharacterEditor.vue` 组件
- 支持所有 V2 字段编辑
- 实时显示 permanent tokens / temporary tokens
- 提供格式化模板 (PLists, Ali:Chat, W++)

#### 5.2 World Info Management UI
**SillyTavern 功能:**
- 可视化 lorebook 编辑器
- 支持 import/export
- 显示 entry 触发状态 (调试)

**我们的问题:**
- World Book UI 功能有限
- 没有调试工具

**建议实现:**
- 增强 `WorldBookManager.vue`
- 添加 "Test Scan" 功能，显示哪些 entries 会被触发
- 支持 SillyTavern lorebook JSON 格式导入

#### 5.3 Token Counter
**SillyTavern 功能:**
- 实时显示当前 context 使用情况
- 分类显示: Character (permanent), World Info, Chat History, etc.

**我们的问题:**
- 用户不知道 token 使用情况
- 无法优化角色卡大小

**建议实现:**
```vue
<!-- src/client/components/chat/TokenCounter.vue -->
<template>
  <div class="token-counter">
    <el-progress
      :percentage="(usedTokens / maxTokens) * 100"
      :color="getColor()"
    />
    <div class="breakdown">
      <span>Character: {{ characterTokens }}</span>
      <span>World Info: {{ worldInfoTokens }}</span>
      <span>History: {{ historyTokens }}</span>
      <span>Available: {{ maxTokens - usedTokens }}</span>
    </div>
  </div>
</template>
```

---

## 6. 高级功能

### 缺失功能 ❌

#### 6.1 Group Chats
**SillyTavern 功能:**
- 多个角色同时参与对话
- 轮流发言或智能选择发言者

**建议实现:**
- 扩展 `chats` 表支持多个 `characterId`
- 实现发言者选择逻辑

#### 6.2 Regex Scripts
**SillyTavern 功能:**
- 用户可以编写正则表达式脚本
- 在生成前/后修改文本

**建议实现:**
- 创建 `regex_scripts` 表
- 在 LLM 生成前后应用脚本

#### 6.3 Quick Replies
**SillyTavern 功能:**
- 预设的快速回复按钮
- 支持变量替换

**建议实现:**
- 在 `ChatInput.vue` 添加快速回复按钮
- 支持 `{{char}}`, `{{user}}` 等占位符

---

## 优先级建议

### P0 (Critical - 立即实现)
1. ✅ **GLM Model Configuration** - 已修复
2. **Character Author's Note** - 核心功能缺失
3. **Example Dialogues Parsing** - 影响角色一致性
4. **Token Strength Hierarchy** - 影响生成质量

### P1 (High - 本周实现)
5. **Depth-based Insertion** - World Info 核心功能
6. **Recursive Scanning** - 复杂 lore 必需
7. **Smart Context Trimming** - 改善长对话体验
8. **Token Counter UI** - 用户体验关键

### P2 (Medium - 本月实现)
9. **Character Filters** - 多角色场景需要
10. **Scan Depth & Context Percent** - 性能优化
11. **Character Card Editor** - 降低使用门槛
12. **Summarization** - 长对话支持

### P3 (Low - 未来考虑)
13. **Prompt Templates** - 高级用户功能
14. **Group Chats** - 新功能
15. **Regex Scripts** - 高级定制
16. **Quick Replies** - 便利功能

---

## 实施计划

### Week 1: Core Prompt Engineering
- [ ] 实现 Character Author's Note
- [ ] 修复 Example Dialogues 解析
- [ ] 重构 prompt 构建顺序 (Token Strength Hierarchy)
- [ ] 添加 Token Counter UI

### Week 2: World Info Enhancement
- [ ] 实现 Depth-based Insertion
- [ ] 实现 Recursive Scanning
- [ ] 添加 Character Filters
- [ ] 优化 Scan Depth & Context Percent

### Week 3: Context Management
- [ ] 实现 Smart Context Trimming (pinned messages, importance)
- [ ] 实现自动 Summarization
- [ ] 优化 Context Manager 性能

### Week 4: UI/UX Polish
- [ ] 创建 Character Card Editor
- [ ] 增强 World Book Manager
- [ ] 添加调试工具 (entry trigger visualization)
- [ ] 文档更新

---

## 参考实现

### SillyTavern 源码
- Character Card: https://github.com/SillyTavern/SillyTavern/blob/release/src/character.js
- World Info: https://github.com/SillyTavern/SillyTavern/blob/release/src/world-info.js
- Context Builder: https://github.com/SillyTavern/SillyTavern/blob/release/src/context.js

### 社区资源
- Character Creation Guide: https://rentry.org/kingbri-chara-guide
- World Info Guide: https://rentry.org/world-info-encyclopedia
- Ali:Chat Format: https://rentry.co/alichat

---

**最后更新:** 2026-03-01
