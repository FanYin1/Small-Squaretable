# Intelligence Debug Panel Design

> 智能角色系统调试面板设计文档

**日期**: 2026-02-06
**目标**: 提供完整的记忆/情感系统监控，包含实时推送、性能指标和向量搜索可视化

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vue 3)                          │
├─────────────────────────────────────────────────────────────┤
│  IntelligenceDebugPanel.vue                                  │
│  ├── SystemPromptViewer.vue    (实际上下文查看)              │
│  ├── MemoryRetrievalLog.vue    (记忆检索日志+向量可视化)     │
│  ├── EmotionTimeline.vue       (情感变化时间线)              │
│  ├── ExtractionLog.vue         (记忆提取日志)                │
│  └── PerformanceMetrics.vue    (性能指标面板)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + REST API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Hono.js)                         │
├─────────────────────────────────────────────────────────────┤
│  GET  /api/v1/chats/:id/intelligence/debug                   │
│  GET  /api/v1/chats/:id/intelligence/system-prompt           │
│  GET  /api/v1/chats/:id/intelligence/retrieval-log           │
│  WebSocket: intelligence:* events                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 后端 API 设计

### 2.1 Debug 状态端点

```typescript
// GET /api/v1/chats/:chatId/intelligence/debug
interface IntelligenceDebugResponse {
  // 当前状态
  currentEmotion: {
    valence: number;
    arousal: number;
    label: string;
    updatedAt: string;
  } | null;

  // 记忆统计
  memoryStats: {
    total: number;
    byType: Record<'fact' | 'preference' | 'relationship' | 'event', number>;
    lastExtractedAt: string | null;
  };

  // 最近检索
  lastRetrieval: {
    query: string;
    results: Array<{
      id: string;
      content: string;
      type: string;
      score: number;
      similarity: number;
      importance: number;
      recency: number;
    }>;
    timestamp: string;
  } | null;

  // 性能指标
  performance: {
    embeddingLatency: number;      // ms
    retrievalLatency: number;      // ms
    emotionAnalysisLatency: number; // ms
    lastPromptTokenCount: number;
  };

  // 消息计数器（用于批量提取）
  messageCounter: number;
  extractionThreshold: number; // 10
}
```

### 2.2 系统提示端点

```typescript
// GET /api/v1/chats/:chatId/intelligence/system-prompt
interface SystemPromptResponse {
  // 完整系统提示
  fullPrompt: string;

  // 分段内容
  sections: {
    characterBase: string;      // 角色基础信息
    memories: string | null;    // 记忆部分
    emotion: string | null;     // 情感部分
    guidelines: string;         // 行为指引
  };

  // Token 统计
  tokenCount: {
    total: number;
    characterBase: number;
    memories: number;
    emotion: number;
    guidelines: number;
  };
}
```

### 2.3 WebSocket 事件

```typescript
// 情感变化事件
interface EmotionChangeEvent {
  type: 'intelligence:emotion_change';
  data: {
    chatId: string;
    characterId: string;
    previous: { valence: number; arousal: number; label: string } | null;
    current: { valence: number; arousal: number; label: string };
    trigger: string; // 触发消息内容
    timestamp: string;
  };
}

// 记忆检索事件
interface MemoryRetrievalEvent {
  type: 'intelligence:memory_retrieval';
  data: {
    chatId: string;
    query: string;
    results: Array<{
      id: string;
      content: string;
      score: number;
    }>;
    latencyMs: number;
    timestamp: string;
  };
}

// 记忆提取事件
interface MemoryExtractionEvent {
  type: 'intelligence:memory_extraction';
  data: {
    chatId: string;
    extracted: Array<{
      type: string;
      content: string;
      importance: number;
    }>;
    messageCount: number;
    timestamp: string;
  };
}

// 系统提示构建事件
interface PromptBuildEvent {
  type: 'intelligence:prompt_build';
  data: {
    chatId: string;
    tokenCount: number;
    memoriesIncluded: number;
    emotionIncluded: boolean;
    latencyMs: number;
    timestamp: string;
  };
}
```

---

## 3. 前端组件设计

### 3.1 IntelligenceDebugPanel.vue

主容器组件，可折叠/展开，包含标签页切换。

```vue
<template>
  <div class="debug-panel" :class="{ collapsed: isCollapsed }">
    <div class="debug-panel__header" @click="toggleCollapse">
      <span class="debug-panel__title">🔬 智能系统调试</span>
      <el-badge :value="eventCount" :hidden="eventCount === 0" />
      <el-icon><ArrowDown v-if="!isCollapsed" /><ArrowRight v-else /></el-icon>
    </div>

    <div v-show="!isCollapsed" class="debug-panel__content">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="系统提示" name="prompt">
          <SystemPromptViewer :chat-id="chatId" />
        </el-tab-pane>
        <el-tab-pane label="记忆检索" name="retrieval">
          <MemoryRetrievalLog :chat-id="chatId" />
        </el-tab-pane>
        <el-tab-pane label="情感时间线" name="emotion">
          <EmotionTimeline :chat-id="chatId" />
        </el-tab-pane>
        <el-tab-pane label="提取日志" name="extraction">
          <ExtractionLog :chat-id="chatId" />
        </el-tab-pane>
        <el-tab-pane label="性能指标" name="performance">
          <PerformanceMetrics :chat-id="chatId" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>
```

### 3.2 SystemPromptViewer.vue

显示实际发送给 LLM 的系统提示，支持语法高亮和分段查看。

**功能：**
- 完整提示查看（可复制）
- 分段折叠（角色/记忆/情感/指引）
- Token 计数显示
- 实时更新指示器

### 3.3 MemoryRetrievalLog.vue

显示记忆检索过程和结果。

**功能：**
- 检索历史列表
- 每次检索的详情：
  - 查询文本
  - 返回的记忆列表
  - 每条记忆的分数分解（相似度/重要性/时效性）
- 向量空间 2D 可视化（t-SNE 降维）
- 检索延迟显示

### 3.4 EmotionTimeline.vue

情感状态变化的时间线图表。

**功能：**
- 双轴折线图（Valence + Arousal）
- 情感标签标注
- 触发消息悬浮提示
- 时间范围选择器

### 3.5 ExtractionLog.vue

记忆提取日志。

**功能：**
- 提取历史列表
- 每次提取的详情：
  - 触发条件（消息数/手动）
  - 提取的记忆列表
  - LLM 原始响应
- 消息计数器进度条

### 3.6 PerformanceMetrics.vue

性能指标面板。

**功能：**
- 实时延迟指标：
  - 嵌入生成延迟
  - 向量检索延迟
  - 情感分析延迟
  - 提示构建延迟
- 历史趋势图
- 模型加载状态
- 内存使用情况

---

## 4. 数据流

### 4.1 消息发送流程（增强版）

```
用户发送消息
    │
    ▼
┌─────────────────────────────────────────┐
│ 1. 情感分析                              │
│    - 调用 embeddingService.analyzeSentiment │
│    - 发送 WebSocket: emotion_change      │
│    - 记录延迟                            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 2. 记忆检索                              │
│    - 生成查询嵌入                        │
│    - 执行混合搜索                        │
│    - 发送 WebSocket: memory_retrieval    │
│    - 记录延迟和结果                      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 3. 构建系统提示                          │
│    - 组装角色+记忆+情感+指引             │
│    - 发送 WebSocket: prompt_build        │
│    - 记录 token 数                       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 4. 调用 LLM                              │
│    - 发送增强后的提示                    │
│    - 返回响应                            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 5. 检查记忆提取                          │
│    - 消息计数器 +1                       │
│    - 如果 >= 10，触发提取                │
│    - 发送 WebSocket: memory_extraction   │
└─────────────────────────────────────────┘
```

### 4.2 前端状态管理

扩展 `characterIntelligence.ts` store：

```typescript
// 新增状态
const debugState = ref<IntelligenceDebugResponse | null>(null);
const systemPrompt = ref<SystemPromptResponse | null>(null);
const eventLog = ref<Array<WebSocketEvent>>([]);

// 新增 actions
async function fetchDebugState(chatId: string) { ... }
async function fetchSystemPrompt(chatId: string) { ... }
function handleWebSocketEvent(event: WebSocketEvent) { ... }
```

---

## 5. 实施任务

### Phase 1: 后端 API (4 tasks)

1. **创建 Debug 服务** - `src/server/services/intelligence-debug.service.ts`
2. **添加 Debug 路由** - 扩展 `src/server/routes/intelligence.ts`
3. **添加 WebSocket 事件** - 修改 `src/server/routes/websocket.ts`
4. **集成到消息处理流程** - 修改 `ChatService` 和 `LLM` 路由

### Phase 2: 前端组件 (6 tasks)

5. **创建 IntelligenceDebugPanel** - 主容器组件
6. **创建 SystemPromptViewer** - 系统提示查看器
7. **创建 MemoryRetrievalLog** - 记忆检索日志
8. **创建 EmotionTimeline** - 情感时间线图表
9. **创建 ExtractionLog** - 提取日志
10. **创建 PerformanceMetrics** - 性能指标面板

### Phase 3: 集成与测试 (3 tasks)

11. **扩展 Store** - 添加调试状态管理
12. **集成到 Chat 页面** - 添加调试面板入口
13. **编写测试** - 单元测试 + E2E 测试

---

## 6. 技术选型

| 功能 | 技术 |
|------|------|
| 图表 | ECharts (已有依赖) 或 Chart.js |
| 向量可视化 | 简化版 2D 散点图 (不做 t-SNE) |
| 代码高亮 | Prism.js 或 highlight.js |
| WebSocket | 复用现有 WebSocket 基础设施 |

---

## 7. 注意事项

1. **性能**: 调试面板仅在开发/调试模式下启用，生产环境可关闭
2. **安全**: Debug API 需要认证，且只返回当前用户的数据
3. **存储**: 事件日志仅保存在内存中，不持久化
4. **Token 计数**: 使用简单的字符估算，不需要精确的 tokenizer
