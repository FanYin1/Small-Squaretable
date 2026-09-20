# Recursive Scanning Implementation Guide

## 概述

递归扫描允许 World Info entries 的内容也被扫描，实现层级 lore 结构。

## 数据库字段

已添加到 `worldbook_entries` 表：
- `recursive` (BOOLEAN, DEFAULT TRUE) - 此 entry 的内容是否会被扫描
- `prevent_recursion` (BOOLEAN, DEFAULT FALSE) - 此 entry 是否不会被递归扫描触发

## 实现思路

### 1. 基本算法

```typescript
function scanRecursive(
  initialText: string,
  entries: Entry[],
  maxDepth: number = 3
): Entry[] {
  const activated = new Set<string>();
  let scanText = initialText;
  let depth = 0;

  while (depth < maxDepth) {
    const newlyActivated: Entry[] = [];

    for (const entry of entries) {
      // Skip if already activated
      if (activated.has(entry.id)) continue;

      // Skip if preventRecursion and depth > 0
      if (entry.preventRecursion && depth > 0) continue;

      // Check if entry matches keywords in scanText
      if (matchesKeywords(scanText, entry)) {
        activated.add(entry.id);
        newlyActivated.push(entry);
      }
    }

    // If no new entries, stop
    if (newlyActivated.length === 0) break;

    // Add recursive entries' content to scan text
    const recursiveContent = newlyActivated
      .filter(e => e.recursive)
      .map(e => e.content)
      .join('\n');

    if (recursiveContent) {
      scanText += '\n' + recursiveContent;
    } else {
      break; // No recursive entries
    }

    depth++;
  }

  return Array.from(activated);
}
```

### 2. 集成到现有代码

在 `worldinfo-engine.service.ts` 的 `scan` 方法中：

**当前实现：**
```typescript
// 5. Match keywords and collect activated entries
for (const entry of allEntries) {
  if (matchesKeywords(scanText, entry)) {
    activated.push(entry);
  }
}
```

**递归实现：**
```typescript
// 5. Match keywords with recursive scanning
const activatedWithDepth = this.scanRecursive(
  scanText,
  allEntries,
  characterId,
  recentMessages,
  3 // max depth
);

// Convert to existing format
const activated = activatedWithDepth.map(({ entry, matchedKeyword }) => ({
  entry,
  matchedKeyword
}));
```

### 3. 使用场景示例

**场景：幻想世界的怪物系统**

Entry 1:
- Keywords: ["monsters", "creatures"]
- Content: "This world has many monsters including goblins, orcs, and dragons."
- Recursive: true

Entry 2:
- Keywords: ["goblin", "goblins"]
- Content: "Goblins are small green creatures. The Goblin King rules them all."
- Recursive: true

Entry 3:
- Keywords: ["Goblin King"]
- Content: "The Goblin King is a powerful leader who commands all goblin tribes."
- Recursive: true
- PreventRecursion: false

**扫描流程：**

1. **Depth 0** - 扫描用户消息: "Tell me about the monsters"
   - 触发 Entry 1 (keyword: "monsters")
   - scanText += Entry 1 content

2. **Depth 1** - 扫描 Entry 1 的内容
   - 触发 Entry 2 (keyword: "goblins" in Entry 1)
   - scanText += Entry 2 content

3. **Depth 2** - 扫描 Entry 2 的内容
   - 触发 Entry 3 (keyword: "Goblin King" in Entry 2)
   - scanText += Entry 3 content

4. **Depth 3** - 扫描 Entry 3 的内容
   - 没有新的匹配
   - 停止递归

**最终结果：**
所有 3 个 entries 都被激活，形成完整的怪物 lore 层级。

### 4. 性能考虑

**优化措施：**
1. 限制最大递归深度 (默认 3)
2. 使用 Set 跟踪已激活的 entries，避免重复
3. 如果没有新的 entries 被激活，提前终止
4. 只扫描标记为 `recursive: true` 的 entries 的内容

**Token 预算：**
- 递归扫描可能激活更多 entries
- 需要在 budget 限制内选择最重要的 entries
- 按 priority 排序，优先包含高优先级的 entries

### 5. 前端 UI

在 World Book Entry 编辑器中添加：

```vue
<el-form-item label="Recursive Scanning">
  <el-switch
    v-model="entry.recursive"
    active-text="Content will be scanned"
    inactive-text="Content won't be scanned"
  />
  <div class="hint">
    When enabled, this entry's content will be scanned for other keywords
  </div>
</el-form-item>

<el-form-item label="Prevent Recursion">
  <el-switch
    v-model="entry.preventRecursion"
    active-text="Won't be triggered by recursion"
    inactive-text="Can be triggered by recursion"
  />
  <div class="hint">
    When enabled, this entry will only match in the original chat messages,
    not in other entries' content
  </div>
</el-form-item>
```

### 6. 测试用例

```typescript
describe('Recursive Scanning', () => {
  it('should trigger entries recursively', () => {
    const entries = [
      { id: '1', keywords: ['monsters'], content: 'goblins exist', recursive: true },
      { id: '2', keywords: ['goblins'], content: 'Goblin King rules', recursive: true },
      { id: '3', keywords: ['Goblin King'], content: 'He is powerful', recursive: true },
    ];

    const result = scanRecursive('Tell me about monsters', entries);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.entry.id)).toEqual(['1', '2', '3']);
  });

  it('should respect preventRecursion flag', () => {
    const entries = [
      { id: '1', keywords: ['monsters'], content: 'goblins exist', recursive: true },
      { id: '2', keywords: ['goblins'], content: 'text', preventRecursion: true },
    ];

    const result = scanRecursive('Tell me about monsters', entries);
    expect(result).toHaveLength(1); // Only entry 1, entry 2 prevented
  });

  it('should stop at max depth', () => {
    const entries = [
      { id: '1', keywords: ['a'], content: 'b', recursive: true },
      { id: '2', keywords: ['b'], content: 'c', recursive: true },
      { id: '3', keywords: ['c'], content: 'd', recursive: true },
      { id: '4', keywords: ['d'], content: 'e', recursive: true },
    ];

    const result = scanRecursive('a', entries, 2); // max depth 2
    expect(result).toHaveLength(3); // 1, 2, 3 (not 4)
  });
});
```

## 实施状态

- ✅ 数据库字段已添加
- ✅ Schema 已更新
- ✅ 核心递归逻辑已集成到 worldinfo-engine.service.ts
- ✅ 前端 UI 已实现
- ✅ 测试用例已编写（8 个测试，全部通过）
- ✅ World Book Tester 显示递归深度

## 下一步

1. ✅ 将 `scanRecursive` 方法添加到 `WorldInfoEngine` 类
2. ✅ 修改 `scan` 方法调用 `scanRecursive` 而不是简单循环
3. ✅ 在 World Book Entry 编辑器中添加 recursive 和 preventRecursion 开关
4. ✅ 编写单元测试验证递归逻辑
5. ✅ 在 World Book Tester 中显示递归深度信息

**全部完成！**

---

**最后更新：** 2026-03-01
**状态：** 完全实现，包括递归深度显示
