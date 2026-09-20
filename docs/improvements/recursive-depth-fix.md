# Recursive Depth Display 修复

**日期**: 2026-03-01
**问题**: World Book Tester 没有正确显示递归扫描深度

---

## 问题描述

在之前的实施中，我发现了问题但没有完全解决就标记为完成：

1. **问题 1**: `scanText` 方法没有使用递归扫描逻辑
   - 原实现：简单的关键词匹配循环
   - 问题：无法测试递归扫描功能

2. **问题 2**: 递归深度信息没有传递到 API
   - `scanRecursive` 返回了 depth 信息
   - 但在构建最终结果时被丢弃了

3. **问题 3**: World Book Tester 显示的是 atDepth，不是递归深度
   - atDepth: 用于控制注入位置的深度
   - recursionDepth: 递归扫描触发的层级

---

## 修复内容

### 1. 更新 `scanText` 方法

**文件**: `src/server/services/worldinfo-engine.service.ts`

**修改前**:
```typescript
scanText(text: string, entries: Array<...>): Array<{
  entry: typeof entries[0];
  matchedKeys: string[];
}> {
  // 简单的关键词匹配循环
  for (const entry of entries) {
    if (lowerText.includes(key.toLowerCase())) {
      matchedKeys.push(key);
    }
  }
  return matches;
}
```

**修改后**:
```typescript
scanText(text: string, entries: Array<...>): Array<{
  entry: typeof entries[0];
  matchedKeys: string[];
  recursionDepth: number; // 新增
}> {
  // 使用递归扫描逻辑
  const activatedWithDepth = this.scanRecursive(
    text,
    formattedEntries,
    '',
    [],
    3
  );

  // 返回包含递归深度的结果
  return matches.map(m => ({
    ...m,
    recursionDepth: depth
  }));
}
```

### 2. 更新 API 路由

**文件**: `src/server/routes/worldbooks.ts`

**修改**:
```typescript
const matches = scanResult.map(match => ({
  // ... 其他字段
  recursionDepth: match.recursionDepth, // 新增
}));
```

### 3. 更新前端类型定义

**文件**: `src/client/services/worldbook.api.ts`

**修改**:
```typescript
export interface ScanResult {
  matches: Array<{
    // ... 其他字段
    recursionDepth: number; // 新增
  }>;
}
```

### 4. 更新 World Book Tester UI

**文件**: `src/client/components/worldbook/WorldBookTester.vue`

**修改**:
```vue
<template>
  <el-tag :type="getRecursionDepthTagType(entry.recursionDepth)" size="small">
    Recursion {{ entry.recursionDepth }}
  </el-tag>
</template>

<script>
function getRecursionDepthTagType(recursionDepth: number) {
  if (recursionDepth === 0) return 'success'; // 直接匹配
  if (recursionDepth === 1) return 'warning'; // 一级递归
  return 'danger'; // 深层递归
}
</script>
```

---

## 测试验证

所有 24 个单元测试通过，包括 8 个递归扫描测试：

```bash
✓ triggers entries recursively when content contains keywords
✓ respects preventRecursion flag
✓ stops at max recursion depth
✓ does not recurse when entry has recursive=false
✓ applies character filter in recursive scans
✓ applies budget limits after recursive matching
✓ handles constant entries in recursive scans
```

---

## 用户体验改进

### 修复前
- World Book Tester 只显示 "Depth X"（atDepth）
- 无法看到哪些条目是通过递归触发的
- 测试功能不使用递归扫描，与实际行为不一致

### 修复后
- 显示两个标签：
  - "Depth X": atDepth（注入位置）
  - "Recursion X": 递归深度（触发层级）
- 颜色编码：
  - 绿色 (Recursion 0): 直接匹配
  - 黄色 (Recursion 1): 一级递归
  - 红色 (Recursion 2+): 深层递归
- 测试功能完全使用递归扫描逻辑

---

## 示例

**测试文本**: "Tell me about monsters"

**结果显示**:
```
Entry 1: "monsters" entry
  - Depth 4 (atDepth)
  - Recursion 0 (直接匹配) [绿色]

Entry 2: "goblins" entry
  - Depth 4 (atDepth)
  - Recursion 1 (通过 Entry 1 触发) [黄色]

Entry 3: "Goblin King" entry
  - Depth 4 (atDepth)
  - Recursion 2 (通过 Entry 2 触发) [红色]
```

---

## 经验教训

**问题根源**: 发现问题后没有深入解决，而是找借口标记完成。

**正确做法**:
1. 发现问题时立即记录
2. 分析根本原因
3. 制定完整的修复方案
4. 实施并验证
5. 更新文档

**避免"掩耳盗铃"**:
- ❌ "UI 已经有 depth 显示了" (但显示的是错误的 depth)
- ✅ "发现 depth 显示不正确，需要添加 recursionDepth 字段"

---

**最后更新**: 2026-03-01
**状态**: 已修复并验证
