# 迭代 25: AI 对话增强

**日期**: 2026-02-23
**方向**: 流式响应优化、上下文窗口管理、多模型切换、对话分支

---

## 任务列表

### T1: 模型注册表 — 添加模型元数据 (上下文窗口大小、默认参数)
**文件**: `src/server/config/llm.config.ts`, `src/types/llm.ts`
- 在 `LLMProviderConfig` 中为每个模型添加 `ModelMeta` (contextWindow, defaultMaxTokens, defaultTemperature)
- 内置常见模型的上下文窗口大小 (GPT-4: 128k, Claude 3: 200k, etc.)
- 新增 `getModelMeta(model)` 函数
- 更新 `GET /api/v1/llm/models` 返回模型元数据

### T2: Token 计数器升级
**文件**: `src/server/utils/tokens.ts`
- 替换粗略的 `text.length / 4` 估算为更精确的分词计数
- 使用 `gpt-tokenizer` 或类似轻量库 (避免 WASM 依赖)
- 导出 `countTokens(text: string): number` 和 `countMessagesTokens(messages: LLMMessage[]): number`
- 考虑消息格式开销 (每条消息 ~4 token overhead)

### T3: 上下文窗口管理器
**文件**: `src/server/services/context-manager.service.ts` (新建)
- 创建 `ContextManager` 类，负责在 token 预算内裁剪消息
- 策略: 保留系统提示 + 最近 N 条消息 (滑动窗口)
- 预算分配: systemPrompt (不限) + messageHistory (contextWindow - systemTokens - maxResponseTokens)
- `buildContext(systemPrompt, messages, modelMeta)` → 返回裁剪后的消息数组
- 当消息被裁剪时，在第一条保留消息前插入 `[Earlier messages truncated]` 提示

### T4: WebSocket 处理器集成上下文管理
**文件**: `src/server/routes/websocket.ts`
- 在 `handleSingleCharacterResponse()` 和 `handleGroupChatResponse()` 中使用 ContextManager
- 替换当前的 "加载所有消息" 逻辑为 token 预算裁剪
- 将模型名称从硬编码改为从 chat metadata 读取
- 在 `ASSISTANT_MESSAGE_DONE` 事件中填充 `totalTokens` 字段

### T5: 聊天模型选择 — Schema + API
**文件**: `src/db/schema/chats.ts`, `src/server/routes/chats.ts`
- 在 chats 表的 metadata JSONB 中存储 `model` 字段 (无需 migration)
- 新增 `PATCH /api/v1/chats/:id/model` 端点设置聊天模型
- 新增 `GET /api/v1/llm/models` 返回可用模型列表 (含元数据)

### T6: 前端模型选择器
**文件**: `src/client/components/chat/ChatWindow.vue`, `src/client/services/llm.api.ts`, `src/client/stores/chat.ts`
- 在 ChatWindow 头部添加模型选择下拉框 (el-select)
- 从 `GET /api/v1/llm/models` 加载可用模型
- 切换模型时调用 `PATCH /api/v1/chats/:id/model`
- 在 chat store 中跟踪当前模型

### T7: 流式响应中止
**文件**: `src/server/routes/websocket.ts`, `src/types/websocket.ts`, `src/client/stores/chat.ts`, `src/client/components/chat/MessageInput.vue`
- 新增 `ABORT_GENERATION` WebSocket 消息类型
- 服务端: 收到 abort 时中止 LLM 请求 (AbortController)，保存已生成的部分内容
- 客户端: 流式生成时显示 "Stop" 按钮替代 "Send"
- 在 chat store 中添加 `abortGeneration()` 方法

### T8: 对话分支 — Schema + Repository
**文件**: `src/db/schema/chats.ts`, `src/db/repositories/message.repository.ts`
- 在 messages 表添加 `parentMessageId` 列 (bigint, nullable, self-FK)
- 在 chats metadata 中添加 `activeBranchLeafId` 字段
- 新增 repository 方法:
  - `findBranch(chatId, leafMessageId)` — 从叶子节点回溯到根，返回有序消息链
  - `findSiblings(messageId)` — 查找同一 parentMessageId 的所有消息
  - `createBranch(chatId, parentMessageId, message)` — 在指定消息后创建分支

### T9: 对话分支 — API + WebSocket
**文件**: `src/server/routes/chats.ts`, `src/server/routes/websocket.ts`
- 修改 `POST /:id/messages` 支持 `parentMessageId` 参数
- 新增 `GET /:id/branches/:messageId` 获取消息的兄弟分支
- 修改 `PATCH /:id` 支持更新 `activeBranchLeafId`
- WebSocket: regenerate 时创建新分支而非删除旧消息
- 上下文管理器使用 `findBranch()` 而非 `findByChatId()` 加载消息

### T10: 前端分支导航
**文件**: `src/client/components/chat/MessageBubble.vue`, `src/client/stores/chat.ts`, `src/client/services/chat.api.ts`
- MessageBubble: 当消息有多个兄弟时显示分支指示器 ("1/3 ◀ ▶")
- 点击左右箭头切换分支 (更新 activeBranchLeafId + 重新加载消息链)
- chat store: 添加 `switchBranch(messageId)`, `getBranches(messageId)` 方法
- regenerate 改为创建新分支

### T11: i18n + 最终验证
**文件**: `src/client/i18n/locales/en-US.json`, `zh-CN.json`
- 添加模型选择、上下文管理、分支导航相关 i18n 键
- 运行 tsc --noEmit, vitest, npm run build
- 更新 ROADMAP.md
