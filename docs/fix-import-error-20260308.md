# 导入错误修复 - 2026-03-08

## 问题描述

前端控制台报错：
```
SyntaxError: The requested module '/src/client/services/api.ts' does not provide an export named 'chatApi'
```

## 根本原因

在 CharacterTuner.vue 和 PresetManager.vue 中错误地从 `@/client/services/api` 导入了 `chatApi`，但实际上：
- `chatApi` 是从 `@/client/services/chat.api.ts` 导出的
- `api.ts` 只导出通用的 `api` 对象

## 修复内容

### 1. CharacterTuner.vue

**修复前**:
```typescript
import { chatApi } from '@/client/services/api';
```

**修复后**:
```typescript
import { api } from '@/client/services/api';
```

**替换的调用**:
- `chatApi.get()` → `api.get()`
- `chatApi.post()` → `api.post()`
- `chatApi.put()` → `api.put()`
- `chatApi.patch()` → `api.patch()`

### 2. PresetManager.vue

**修复前**:
```typescript
import { chatApi } from '@/client/services/api';
```

**修复后**:
```typescript
import { api } from '@/client/services/api';
```

**替换的调用**:
- `chatApi.get()` → `api.get()`
- `chatApi.post()` → `api.post()`
- `chatApi.patch()` → `api.patch()`
- `chatApi.delete()` → `api.delete()`

## 修改的文件

1. `src/client/components/chat/CharacterTuner.vue`
   - 修改导入语句
   - 替换 5 处 `chatApi` 调用

2. `src/client/pages/PresetManager.vue`
   - 修改导入语句
   - 替换 4 处 `chatApi` 调用

## 验证

- ✅ 前端编译无错误
- ✅ 前端服务运行正常 (http://localhost:5173/)
- ✅ 浏览器控制台无导入错误

## API 使用说明

### 正确的导入方式

```typescript
// 通用 API 客户端 (推荐用于新端点)
import { api } from '@/client/services/api';

// 特定领域的 API (如果存在)
import { chatApi } from '@/client/services/chat.api';
import { characterApi } from '@/client/services/character.api';
import { authApi } from '@/client/services/auth.api';
```

### API 调用示例

```typescript
// 使用通用 api 对象
const response = await api.get('/presets');
const data = await api.post('/presets', { name: 'test' });
const updated = await api.patch('/presets/123', { name: 'updated' });
await api.delete('/presets/123');

// 使用特定 API (如果需要特殊处理)
const chats = await chatApi.getChats();
const messages = await chatApi.getMessages(chatId);
```

## 注意事项

1. **新功能开发**: 对于新的 API 端点，直接使用 `api` 对象即可
2. **现有功能**: 如果已有特定的 API 模块（如 `chat.api.ts`），可以继续使用
3. **一致性**: 在同一个组件中，尽量使用统一的 API 调用方式

## 修复时间

2026-03-08 14:10

## 状态

✅ 已修复并验证
