# 智能角色系统设计文档

> **项目**: Small Squaretable
> **创建日期**: 2026-02-05
> **版本**: 1.0
> **状态**: 设计完成
> **分支**: feature/intelligent-character-system

---

## 目录

1. [概述](#1-概述)
2. [设计决策](#2-设计决策)
3. [系统架构](#3-系统架构)
4. [数据库设计](#4-数据库设计)
5. [Memory Service](#5-memory-service)
6. [Emotion Service](#6-emotion-service)
7. [Embedding Service](#7-embedding-service)
8. [Chat 集成](#8-chat-集成)
9. [API 设计](#9-api-设计)
10. [前端集成](#10-前端集成)
11. [测试策略](#11-测试策略)
12. [实施计划](#12-实施计划)

---

## 1. 概述

### 1.1 背景

当前系统的角色是静态的，定义在 `cardData` 中，不具备：
- 跨对话记忆能力
- 情感状态追踪
- 个性化演化

### 1.2 目标

实现智能角色系统，包含：
- **记忆系统**: 短期记忆 (当前对话) + 长期记忆 (跨对话)
- **情感状态机**: 二维情感模型 (Valence × Arousal)
- **向量搜索**: 语义相似度检索相关记忆

### 1.3 参考设计

基于 `docs/plans/2026-01-29-sillytavern-saas-transformation.md` 第6章设计。

---

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 向量存储 | pgvector (PostgreSQL 扩展) | 无需新依赖，架构简单，5M-50M 规模性能可接受 |
| 情感模型 | 二维模型 (Valence × Arousal) | 连续值表达更精确，支持 12 种情感标签映射 |
| 记忆检索 | 混合检索 | 0.5×相似度 + 0.3×重要性 + 0.2×时间衰减 |
| 情感检测 | MiniLM 轻量模型 | 127MB，10ms 延迟，无 API 成本 |
| 记忆提取时机 | 批量提取 | 对话结束或每 10 条消息，平衡成本和时效 |
| 记忆注入 | System Prompt 注入 | 所有 LLM 兼容，便于调试 |
| 记忆容量 | 按订阅等级差异化 | Free: 100条, Pro: 500条, Team: 2000条 |
| 记忆提取方式 | LLM 结构化提取 | 能理解隐含信息，输出结构化 |
| 数据库设计 | 新建独立表 | 符合范式，便于索引和限制 |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Intelligent Character System                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Chat       │───▶│   Memory     │───▶│   Emotion    │       │
│  │   Service    │    │   Service    │    │   Service    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         │                   ▼                   ▼                │
│         │            ┌──────────────┐    ┌──────────────┐       │
│         │            │   pgvector   │    │   MiniLM     │       │
│         │            │   (向量搜索)  │    │   (情感分析)  │       │
│         │            └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         └───────────────────┴───────────────────┘                │
│                             │                                    │
│                             ▼                                    │
│                    ┌──────────────────┐                         │
│                    │   PostgreSQL     │                         │
│                    │  • characters    │                         │
│                    │  • character_memories                      │
│                    │  • character_emotions                      │
│                    │  • memory_vectors │                        │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### 核心流程

1. 用户发送消息 → Chat Service 处理
2. Memory Service 检索相关记忆 (混合评分)
3. Emotion Service 分析当前情感状态
4. 记忆 + 情感注入 System Prompt
5. LLM 生成回复
6. 批量提取新记忆 (对话结束时)

---

## 4. 数据库设计

### 4.1 新增表结构

```sql
-- 1. 角色记忆表
CREATE TABLE character_memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 记忆内容
  type          VARCHAR(20) NOT NULL,  -- 'fact' | 'preference' | 'relationship' | 'event'
  content       TEXT NOT NULL,

  -- 权重因子
  importance    DECIMAL(3,2) DEFAULT 0.5,  -- 0-1
  access_count  INTEGER DEFAULT 0,

  -- 来源追踪
  source_chat_id   UUID REFERENCES chats(id),
  source_message_id BIGINT,

  created_at    TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),

  -- 索引
  CONSTRAINT unique_memory UNIQUE (character_id, user_id, content)
);

-- 2. 记忆向量表 (pgvector)
CREATE TABLE character_memory_vectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   UUID NOT NULL REFERENCES character_memories(id) ON DELETE CASCADE,
  embedding   vector(384),  -- MiniLM 输出维度

  created_at  TIMESTAMP DEFAULT NOW()
);

-- 3. 角色情感状态表
CREATE TABLE character_emotions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id       UUID REFERENCES chats(id) ON DELETE CASCADE,

  -- 二维情感值
  valence       DECIMAL(4,3) NOT NULL,  -- -1 到 1 (负面到正面)
  arousal       DECIMAL(4,3) NOT NULL,  -- 0 到 1 (平静到激动)

  -- 触发原因
  trigger_message_id BIGINT,
  trigger_content    TEXT,

  created_at    TIMESTAMP DEFAULT NOW(),

  -- 每个角色-用户对保留最新状态
  CONSTRAINT unique_current_emotion UNIQUE (character_id, user_id, chat_id)
);

-- 4. 索引优化
CREATE INDEX idx_memories_character_user ON character_memories(character_id, user_id);
CREATE INDEX idx_memories_type ON character_memories(type);
CREATE INDEX idx_memories_importance ON character_memories(importance DESC);
CREATE INDEX idx_memories_last_accessed ON character_memories(last_accessed DESC);

-- pgvector HNSW 索引 (高性能近似搜索)
CREATE INDEX idx_memory_vectors_embedding ON character_memory_vectors
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_emotions_character_user ON character_emotions(character_id, user_id);
CREATE INDEX idx_emotions_created ON character_emotions(created_at DESC);
```

### 4.2 订阅等级限制

| 订阅 | memories 上限 | vectors 上限 | emotions 历史 |
|------|--------------|--------------|---------------|
| Free | 100 条/角色 | 100 条 | 最近 10 条 |
| Pro | 500 条/角色 | 500 条 | 最近 50 条 |
| Team | 2000 条/角色 | 2000 条 | 最近 200 条 |

---

## 5. Memory Service

### 5.1 核心接口

```typescript
// src/server/services/memory.service.ts

interface MemoryFact {
  type: 'fact' | 'preference' | 'relationship' | 'event';
  content: string;
  importance: number;
}

interface MemoryQuery {
  characterId: string;
  userId: string;
  query: string;
  limit?: number;
}

interface ScoredMemory {
  id: string;
  content: string;
  type: string;
  score: number;
}

class MemoryService {
  constructor(
    private db: Database,
    private embeddingService: EmbeddingService,
    private llmService: LLMService
  ) {}

  // 检索相关记忆 (混合评分)
  async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]>;

  // 从对话中提取记忆 (LLM)
  async extractMemories(
    characterId: string,
    userId: string,
    messages: Message[]
  ): Promise<MemoryFact[]>;

  // 存储新记忆
  async storeMemory(
    characterId: string,
    userId: string,
    memory: MemoryFact,
    chatId?: string
  ): Promise<void>;
}
```

### 5.2 混合评分公式

```sql
score = 0.5 * similarity + 0.3 * importance + 0.2 * recency

-- recency = 1 - (seconds_since_access / 2592000)  -- 30天衰减
```

### 5.3 LLM 提取 Prompt

```
分析以下对话，提取关于用户的记忆信息。

对话内容:
${messages}

请以 JSON 格式输出:
{
  "facts": ["事实性信息..."],
  "preferences": ["用户偏好..."],
  "relationships": ["关系信息..."],
  "events": ["重要事件..."]
}

只提取明确或可合理推断的信息，不要编造。
```

---

## 6. Emotion Service

### 6.1 二维情感模型

```
        Arousal (激动)
            1.0
             │    angry    excited
             │      ●────────●
             │     /          \
        0.7 ─┼────fearful    surprised
             │      │    ●     │
             │      │ curious  │
        0.5 ─┼──disgusted     happy
             │      │          │
             │   confused    loving
        0.3 ─┼──────●──────────●
             │      │          │
             │    bored      calm
        0.0 ─┼──────●──────────●
             │      │          │
            ─┼──────┼──────────┼──────▶ Valence
           -1.0    0.0        1.0    (正面)
```

### 6.2 情感标签映射

```typescript
const EMOTION_MAP: EmotionLabel[] = [
  { name: 'excited',   valence: [0.5, 1],    arousal: [0.7, 1] },
  { name: 'happy',     valence: [0.3, 0.8],  arousal: [0.3, 0.7] },
  { name: 'loving',    valence: [0.5, 1],    arousal: [0.2, 0.5] },
  { name: 'calm',      valence: [0, 0.5],    arousal: [0, 0.3] },
  { name: 'curious',   valence: [0.1, 0.5],  arousal: [0.4, 0.7] },
  { name: 'surprised', valence: [-0.2, 0.5], arousal: [0.6, 1] },
  { name: 'confused',  valence: [-0.3, 0.1], arousal: [0.3, 0.6] },
  { name: 'bored',     valence: [-0.3, 0],   arousal: [0, 0.3] },
  { name: 'sad',       valence: [-0.8, -0.2],arousal: [0, 0.4] },
  { name: 'fearful',   valence: [-0.7, -0.2],arousal: [0.5, 0.9] },
  { name: 'angry',     valence: [-1, -0.4],  arousal: [0.6, 1] },
  { name: 'disgusted', valence: [-0.9, -0.4],arousal: [0.3, 0.7] },
];
```

### 6.3 情感平滑过渡

```typescript
// 避免情感突变，使用加权平均
const smoothed: EmotionState = {
  valence: current.valence * 0.7 + newEmotion.valence * 0.3,
  arousal: current.arousal * 0.7 + newEmotion.arousal * 0.3
};
```

---

## 7. Embedding Service

### 7.1 模型配置

| 模型 | 用途 | 大小 | 维度 |
|------|------|------|------|
| all-MiniLM-L6-v2 | 文本向量化 | 23MB | 384 |
| distilbert-base-uncased-finetuned-sst-2-english | 情感分析 | 268MB | - |

### 7.2 实现

```typescript
import { pipeline, env } from '@xenova/transformers';

env.cacheDir = './models';
env.allowLocalModels = true;

class EmbeddingService {
  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly SENTIMENT_MODEL = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

  async embed(text: string): Promise<number[]>;
  async analyzeSentiment(text: string): Promise<{ valence: number; arousal: number }>;
}
```

### 7.3 依赖

```bash
npm install @xenova/transformers
npm install onnxruntime-node  # 可选加速
```

---

## 8. Chat 集成

### 8.1 增强的 System Prompt

```
你是 {character_name}...
[基础角色设定]

## 关于用户的记忆
【事实】用户名叫小明；用户是一名后端程序员
【偏好】喜欢喝美式咖啡；偏好简洁直接的回复风格
【关系】用户称呼你为"小月"
【事件】上周讨论了 Python 异步编程

## 当前情感状态
当前情感: curious (适度)，Valence: 0.35, Arousal: 0.52

## 行为指引
- 根据记忆中的信息个性化回复
- 保持情感状态的一致性，情感变化应自然过渡
- 可以主动提及相关记忆，但不要生硬
```

### 8.2 消息处理流程

```typescript
async processMessage(chatId, userId, characterId, userMessage) {
  // 1. 分析用户消息情感，更新角色情感
  const userEmotion = await emotionService.analyzeEmotion(userMessage);
  await emotionService.updateEmotion(characterId, userId, chatId, userEmotion);

  // 2. 构建增强 System Prompt
  const systemPrompt = await buildEnhancedSystemPrompt(...);

  // 3. 调用 LLM
  const response = await llmService.chat({ systemPrompt, messages });

  // 4. 分析回复情感，更新状态
  const responseEmotion = await emotionService.analyzeEmotion(response);
  await emotionService.updateEmotion(...);

  // 5. 检查是否需要提取记忆 (批量)
  await checkAndExtractMemories(chatId, characterId, userId);

  return response;
}
```

---

## 9. API 设计

### 9.1 端点列表

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/characters/:id/memories` | 获取记忆列表 |
| POST | `/api/v1/characters/:id/memories` | 手动添加记忆 |
| DELETE | `/api/v1/characters/:id/memories/:memoryId` | 删除单条记忆 |
| DELETE | `/api/v1/characters/:id/memories` | 清空所有记忆 |
| GET | `/api/v1/characters/:id/emotion` | 获取当前情感 |
| GET | `/api/v1/characters/:id/emotions/history` | 情感历史 |
| POST | `/api/v1/characters/:id/emotion/reset` | 重置情感 |
| GET | `/api/v1/characters/:id/intelligence/stats` | 使用统计 |

### 9.2 请求/响应示例

**GET /api/v1/characters/:id/memories**

```json
{
  "success": true,
  "data": [
    {
      "id": "mem-uuid",
      "type": "fact",
      "content": "用户是程序员",
      "importance": 0.8,
      "createdAt": "2026-02-05T10:00:00Z",
      "lastAccessed": "2026-02-05T12:00:00Z"
    }
  ],
  "meta": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

**GET /api/v1/characters/:id/emotion**

```json
{
  "success": true,
  "data": {
    "valence": 0.35,
    "arousal": 0.52,
    "label": "curious",
    "description": "当前情感: curious (适度)"
  }
}
```

---

## 10. 前端集成

### 10.1 Pinia Store

```typescript
// src/client/stores/characterIntelligence.ts

export const useCharacterIntelligenceStore = defineStore('characterIntelligence', () => {
  const memories = ref<Memory[]>([]);
  const currentEmotion = ref<EmotionState | null>(null);
  const emotionHistory = ref<EmotionState[]>([]);
  const stats = ref<Stats | null>(null);

  const memoriesByType = computed(() => ({
    facts: memories.value.filter(m => m.type === 'fact'),
    preferences: memories.value.filter(m => m.type === 'preference'),
    relationships: memories.value.filter(m => m.type === 'relationship'),
    events: memories.value.filter(m => m.type === 'event')
  }));

  // Actions
  async function fetchMemories(characterId: string);
  async function addMemory(characterId: string, memory: MemoryInput);
  async function deleteMemory(characterId: string, memoryId: string);
  async function fetchEmotion(characterId: string, chatId?: string);
  // ...
});
```

### 10.2 组件

| 组件 | 功能 |
|------|------|
| `EmotionIndicator.vue` | 显示当前情感状态 (图标 + 标签) |
| `MemoryPanel.vue` | 记忆管理面板 (抽屉) |
| `MemoryList.vue` | 记忆列表展示 |

### 10.3 Chat 页面集成

```vue
<template>
  <div class="chat-container">
    <header class="chat-header">
      <CharacterAvatar :character="currentCharacter" />
      <div class="character-info">
        <h2>{{ currentCharacter?.name }}</h2>
        <EmotionIndicator show-label />
      </div>
      <el-button @click="showMemoryPanel = true">
        记忆 ({{ memoryCount }})
      </el-button>
    </header>

    <MessageList :messages="messages" />
    <ChatInput @send="handleSend" />

    <el-drawer v-model="showMemoryPanel" title="角色记忆">
      <MemoryPanel :character-id="currentCharacter?.id" />
    </el-drawer>
  </div>
</template>
```

---

## 11. 测试策略

### 11.1 单元测试

- `memory.service.spec.ts` - 记忆检索、存储、淘汰逻辑
- `emotion.service.spec.ts` - 情感标签映射、平滑过渡
- `embedding.service.spec.ts` - 向量生成、情感分析

### 11.2 E2E 测试

- 情感指示器显示
- 记忆面板操作 (添加、删除、清空)
- 发送消息后情感更新

---

## 12. 实施计划

| 阶段 | 任务 | 依赖 |
|------|------|------|
| **Phase 1: 基础设施** | | |
| 1.1 | 安装 pgvector 扩展 | - |
| 1.2 | 创建数据库迁移 (3 张新表) | 1.1 |
| 1.3 | 安装 @xenova/transformers | - |
| **Phase 2: 后端服务** | | |
| 2.1 | 实现 EmbeddingService | 1.3 |
| 2.2 | 实现 MemoryService | 1.2, 2.1 |
| 2.3 | 实现 EmotionService | 2.1 |
| 2.4 | 扩展 ChatService | 2.2, 2.3 |
| 2.5 | 实现 API 路由 | 2.2, 2.3 |
| **Phase 3: 前端集成** | | |
| 3.1 | 创建 characterIntelligence store | 2.5 |
| 3.2 | 实现 EmotionIndicator 组件 | 3.1 |
| 3.3 | 实现 MemoryPanel 组件 | 3.1 |
| 3.4 | 集成到 Chat 页面 | 3.2, 3.3 |
| **Phase 4: 测试与优化** | | |
| 4.1 | 单元测试 | 2.2, 2.3 |
| 4.2 | E2E 测试 | 3.4 |
| 4.3 | 性能优化 | 4.1, 4.2 |

---

## 附录

### A. 向量数据库对比

| 数据库 | 1M 向量延迟 | 100M 向量延迟 | 成本 |
|--------|------------|--------------|------|
| pgvector | 15ms | 85ms | $19-50/月 |
| Qdrant | 8ms | 24ms | $25+/月 |
| Pinecone | 12ms | 28ms | $50+/月 |

选择 pgvector 因为项目已使用 PostgreSQL，架构简单。

### B. 轻量模型对比

| 模型 | 参数量 | 大小 | 延迟 | 准确率 |
|------|--------|------|------|--------|
| ALBERT | 12M | 45MB | 32ms | 94.4% |
| MiniLM | 33M | 127MB | 10ms | 93.7% |
| DistilBERT | 66M | 255MB | 15ms | 93.2% |

选择 MiniLM 因为延迟最低，体积适中。

### C. 参考资料

- 设计文档: `docs/plans/2026-01-29-sillytavern-saas-transformation.md` 第6章
- pgvector: https://github.com/pgvector/pgvector
- Transformers.js: https://huggingface.co/docs/transformers.js
