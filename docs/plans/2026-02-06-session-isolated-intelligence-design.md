# 会话隔离智能系统设计

**日期**: 2026-02-06
**状态**: 已完成

## 背景

原有设计中，记忆和情感面板绑定到角色 (characterId)，所有会话共享同一套记忆和情感状态。用户希望每个会话 (Chat) 作为独立人格，拥有独立的记忆库和情感状态。

## 目标

- 每个会话 = 独立人格 = 独立的记忆库 + 独立的情感状态
- 切换会话时加载对应会话的记忆和情感
- 将智能系统按钮移到 ChatWindow header 右侧

## 架构改动

### 数据隔离

| 数据 | 改动前 | 改动后 |
|------|--------|--------|
| 记忆存储 | `characterId + userId` | `characterId + userId + chatId` |
| 记忆检索 | `characterId + userId` | `characterId + userId + chatId` |
| 情感状态 | `characterId + userId + chatId` | 不变（已支持） |

### UI 改动

将三个按钮从 `Chat.vue` 移到 `ChatWindow.vue` 的 header 右侧：

```
┌─────────────────────────────────────────────────────────────┐
│ [Avatar] 角色名                    [😊] [📚] [📊] [⋮]      │
│          会话标题                                           │
└─────────────────────────────────────────────────────────────┘
```

- 😊 情感状态 - 显示当前会话的情感
- 📚 角色记忆 - 显示当前会话的记忆
- 📊 智能调试 - 显示当前会话的调试信息

## 代码改动

### 前端

| 文件 | 改动 |
|------|------|
| `ChatWindow.vue` | 添加三个按钮到 header，添加面板组件，传入 `chatId` |
| `Chat.vue` | 移除三个按钮和面板（已移到 ChatWindow） |
| `MemoryPanel.vue` | 接收 `chatId` 参数 |
| `characterIntelligence.ts` | `fetchMemories`、`deleteMemory`、`clearAllMemories` 支持 `chatId` 参数 |

### 后端

| 文件 | 改动 |
|------|------|
| `intelligence.ts` | `clearAllMemories` 接口支持 `chatId` 查询参数 |
| `memory.service.ts` | `clearAllMemories` 方法支持 `chatId` 参数 |
| `memory.repository.ts` | `deleteAllForCharacterUser` 方法支持 `chatId` 参数 |

## 切换会话时的行为

```
用户切换会话
    ↓
ChatWindow 接收新的 currentChat
    ↓
watch 触发，调用 fetchMemories(characterId, chatId)
    ↓
watch 触发，调用 fetchEmotion(characterId, chatId)
    ↓
面板显示当前会话的数据
```

## 测试验证

1. 创建两个会话 A 和 B（同一角色）
2. 在会话 A 中对话，产生记忆和情感变化
3. 切换到会话 B，确认记忆和情感是独立的
4. 切换回会话 A，确认之前的记忆和情感仍在
