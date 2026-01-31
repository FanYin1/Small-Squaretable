# Phase 2: 认证系统 + API + 社区功能

> **创建日期**: 2026-01-31
> **状态**: 设计完成
> **目标**: 实现完整的认证、CRUD API 和社区功能

---

## 目录

1. [认证系统架构](#1-认证系统架构)
2. [API 路由架构](#2-api-路由架构)
3. [多维度评分系统](#3-多维度评分系统)
4. [全文搜索系统](#4-全文搜索系统)
5. [数据流和错误处理](#5-数据流和错误处理)
6. [实现计划](#6-实现计划)

---

## 1. 认证系统架构

### 1.1 JWT 双 Token 机制

- **Access Token**: 短期有效（15分钟），用于 API 访问
- **Refresh Token**: 长期有效（7天），用于刷新 Access Token
- Refresh Token 存储在 Redis 中，支持撤销

### 1.2 认证端点

```typescript
POST /api/v1/auth/register    // 注册（邮箱 + 密码）
POST /api/v1/auth/login       // 登录
POST /api/v1/auth/refresh     // 刷新 token
POST /api/v1/auth/logout      // 登出（清除 refresh token）
GET  /api/v1/auth/me          // 获取当前用户信息
```

### 1.3 密码安全

- 使用 bcrypt 加密（已安装依赖）
- 最小长度 8 字符
- 密码强度验证（可选：大小写+数字+特殊字符）

### 1.4 认证中间件

- 验证 JWT token
- 提取用户信息并注入到 context
- 与现有的 tenant 中间件配合工作
- 支持可选认证（某些路由不需要登录）

### 1.5 数据存储

- `users` 表已存在，包含 `password_hash` 字段
- Refresh tokens 存储在 Redis：`refresh_token:{userId}` → token data

---

## 2. API 路由架构

### 2.1 用户管理 API

```typescript
GET    /api/v1/users/me           // 获取当前用户信息
PATCH  /api/v1/users/me           // 更新当前用户信息
DELETE /api/v1/users/me           // 删除账户
PATCH  /api/v1/users/me/password  // 修改密码
```

### 2.2 角色（Characters）API

```typescript
// 基础 CRUD
POST   /api/v1/characters              // 创建角色
GET    /api/v1/characters              // 列表（支持过滤和搜索）
GET    /api/v1/characters/:id          // 获取单个角色
PATCH  /api/v1/characters/:id          // 更新角色
DELETE /api/v1/characters/:id          // 删除角色

// 市场功能
POST   /api/v1/characters/:id/publish  // 发布到市场（设置 is_public=true）
POST   /api/v1/characters/:id/unpublish // 从市场下架
GET    /api/v1/characters/marketplace  // 浏览市场（仅公开角色）
POST   /api/v1/characters/:id/fork     // 复制公开角色到自己租户
```

### 2.3 聊天（Chats）API

```typescript
POST   /api/v1/chats                   // 创建聊天
GET    /api/v1/chats                   // 列表
GET    /api/v1/chats/:id               // 获取单个聊天
PATCH  /api/v1/chats/:id               // 更新聊天
DELETE /api/v1/chats/:id               // 删除聊天

// 消息管理
POST   /api/v1/chats/:id/messages      // 发送消息
GET    /api/v1/chats/:id/messages      // 获取消息列表（分页）
```

### 2.4 权限控制

- 用户只能操作自己租户内的资源
- 公开角色可以被所有人查看，但只有创建者可以修改
- Fork 操作会创建副本到当前用户租户

---

## 3. 多维度评分系统

### 3.1 评分维度

五个维度，每个维度 1-5 星：

1. **质量** (Quality) - 角色卡的完整性和细节
2. **创意** (Creativity) - 角色设定的原创性
3. **互动性** (Interactivity) - 对话体验的流畅度
4. **准确性** (Accuracy) - 角色人设的一致性
5. **娱乐性** (Entertainment) - 聊天的趣味性

### 3.2 数据库设计

**新增 `ratings` 表**：

```sql
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 五维度评分 (1-5)
    quality INT NOT NULL CHECK (quality BETWEEN 1 AND 5),
    creativity INT NOT NULL CHECK (creativity BETWEEN 1 AND 5),
    interactivity INT NOT NULL CHECK (interactivity BETWEEN 1 AND 5),
    accuracy INT NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
    entertainment INT NOT NULL CHECK (entertainment BETWEEN 1 AND 5),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 每个用户对每个角色只能评分一次
    UNIQUE(character_id, user_id)
);

CREATE INDEX ratings_character_id_idx ON ratings(character_id);
CREATE INDEX ratings_user_id_idx ON ratings(user_id);
```

**扩展 `characters` 表**：

```sql
ALTER TABLE characters ADD COLUMN rating_quality_avg DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN rating_creativity_avg DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN rating_interactivity_avg DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN rating_accuracy_avg DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN rating_entertainment_avg DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN rating_overall_avg DECIMAL(3,2);
```

### 3.3 评分 API

```typescript
POST   /api/v1/characters/:id/ratings  // 提交评分
GET    /api/v1/characters/:id/ratings  // 获取评分详情（含各维度平均）
PUT    /api/v1/characters/:id/ratings  // 更新自己的评分
DELETE /api/v1/characters/:id/ratings  // 删除自己的评分
```

### 3.4 评分响应格式

```json
{
  "overall": 4.2,
  "dimensions": {
    "quality": 4.5,
    "creativity": 4.0,
    "interactivity": 4.3,
    "accuracy": 4.1,
    "entertainment": 4.2
  },
  "count": 128,
  "userRating": {
    "quality": 5,
    "creativity": 4,
    "interactivity": 4,
    "accuracy": 4,
    "entertainment": 5
  }
}
```

---

## 4. 全文搜索系统

### 4.1 PostgreSQL 全文搜索配置

**创建搜索向量列**：

```sql
-- 在 characters 表中添加
ALTER TABLE characters
ADD COLUMN search_vector tsvector;

-- 创建 GIN 索引加速搜索
CREATE INDEX characters_search_idx ON characters USING GIN(search_vector);

-- 自动更新搜索向量的触发器
CREATE FUNCTION characters_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER characters_search_vector_trigger
BEFORE INSERT OR UPDATE ON characters
FOR EACH ROW EXECUTE FUNCTION characters_search_vector_update();
```

### 4.2 搜索 API

```typescript
GET /api/v1/characters/search?q=keyword&sort=relevance&filter=public
```

**查询参数**：
- `q`: 搜索关键词（必需）
- `sort`: 排序方式
  - `relevance` - 相关性（默认）
  - `rating` - 评分最高
  - `popular` - 下载量最多
  - `newest` - 最新创建
- `filter`: 过滤条件
  - `public` - 仅公开角色
  - `my` - 我的角色
  - `all` - 所有可见角色（公开 + 我的）
- `category`: 分类过滤
- `tags`: 标签过滤（逗号分隔）
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20，最大 100）

### 4.3 搜索实现

```typescript
// 使用 Drizzle ORM 的 SQL 查询
const results = await db.execute(sql`
  SELECT *, ts_rank(search_vector, query) AS rank
  FROM characters, plainto_tsquery('english', ${keyword}) query
  WHERE search_vector @@ query
    AND (is_public = true OR tenant_id = ${tenantId})
  ORDER BY rank DESC
  LIMIT ${limit} OFFSET ${offset}
`);
```

---

## 5. 数据流和错误处理

### 5.1 评分更新流程

**当用户提交评分时**：

1. 验证用户已登录且有权限
2. 检查角色是否存在且可访问
3. 使用事务处理：
   ```typescript
   await db.transaction(async (tx) => {
     // 插入或更新评分记录
     await tx.insert(ratings).values(ratingData)
       .onConflictDoUpdate({
         target: [ratings.characterId, ratings.userId],
         set: { ...ratingData, updatedAt: new Date() }
       });

     // 重新计算角色的平均评分
     const avgRatings = await tx
       .select({
         quality: avg(ratings.quality),
         creativity: avg(ratings.creativity),
         interactivity: avg(ratings.interactivity),
         accuracy: avg(ratings.accuracy),
         entertainment: avg(ratings.entertainment),
       })
       .from(ratings)
       .where(eq(ratings.characterId, characterId));

     // 计算综合评分
     const overall = (
       avgRatings.quality +
       avgRatings.creativity +
       avgRatings.interactivity +
       avgRatings.accuracy +
       avgRatings.entertainment
     ) / 5;

     // 更新角色表
     await tx.update(characters)
       .set({
         ratingQualityAvg: avgRatings.quality,
         ratingCreativityAvg: avgRatings.creativity,
         ratingInteractivityAvg: avgRatings.interactivity,
         ratingAccuracyAvg: avgRatings.accuracy,
         ratingEntertainmentAvg: avgRatings.entertainment,
         ratingOverallAvg: overall,
         ratingCount: sql`rating_count + 1`
       })
       .where(eq(characters.id, characterId));
   });
   ```

### 5.2 角色 Fork 流程

**当用户 Fork 公开角色时**：

1. 验证源角色是公开的
2. 创建副本到当前用户租户：
   ```typescript
   const forkedCharacter = {
     ...sourceCharacter,
     id: undefined,  // 生成新 ID
     tenantId: currentTenantId,
     creatorId: currentUserId,
     isPublic: false,  // 默认私有
     downloadCount: 0,
     ratingQualityAvg: null,
     ratingCreativityAvg: null,
     ratingInteractivityAvg: null,
     ratingAccuracyAvg: null,
     ratingEntertainmentAvg: null,
     ratingOverallAvg: null,
     ratingCount: 0,
     createdAt: new Date(),
     updatedAt: new Date()
   };
   ```
3. 更新源角色的下载计数

### 5.3 错误处理策略

**标准错误响应格式**：

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid rating value",
    "details": {
      "field": "quality",
      "value": 6,
      "constraint": "must be between 1 and 5"
    }
  }
}
```

**错误类型**：
- `VALIDATION_ERROR` - 输入验证失败
- `UNAUTHORIZED` - 未登录
- `FORBIDDEN` - 无权限
- `NOT_FOUND` - 资源不存在
- `CONFLICT` - 资源冲突（如重复评分）
- `RATE_LIMIT_EXCEEDED` - 超过速率限制

---

## 6. 实现计划

### 6.1 新增文件结构

```
src/
├── server/
│   ├── routes/
│   │   ├── auth.ts           # 认证路由
│   │   ├── users.ts          # 用户路由
│   │   ├── characters.ts     # 角色路由
│   │   ├── chats.ts          # 聊天路由
│   │   └── index.ts          # 路由聚合
│   ├── services/
│   │   ├── auth.service.ts   # 认证逻辑
│   │   ├── user.service.ts   # 用户逻辑
│   │   ├── character.service.ts
│   │   ├── chat.service.ts
│   │   └── search.service.ts # 全文搜索
│   └── middleware/
│       └── auth.ts           # 认证中间件
├── db/
│   ├── schema/
│   │   ├── ratings.ts        # 评分表 schema
│   │   └── messages.ts       # 消息表 schema
│   └── repositories/
│       ├── user.repository.ts
│       ├── character.repository.ts
│       ├── chat.repository.ts
│       ├── message.repository.ts
│       └── rating.repository.ts
└── core/
    └── jwt.ts                # JWT 工具
```

### 6.2 实现顺序

**Week 1：认证系统**
- Task 1: JWT 工具模块（生成、验证、刷新）
- Task 2: 认证中间件（验证 token，注入用户信息）
- Task 3: 注册 API（邮箱验证、密码加密）
- Task 4: 登录 API（验证凭据、生成 token）
- Task 5: 刷新和登出 API
- Task 6: 测试覆盖（单元测试 + 集成测试）

**Week 2：基础 CRUD API**
- Task 7: 用户 Repository 和 Service
- Task 8: 用户管理 API（获取、更新、删除）
- Task 9: 角色 Repository 和 Service
- Task 10: 角色 CRUD API
- Task 11: 聊天和消息 Repository
- Task 12: 聊天 CRUD API

**Week 3：社区功能**
- Task 13: 评分表 Schema 和 Repository
- Task 14: 评分 API（提交、更新、删除）
- Task 15: 评分聚合逻辑（更新角色平均分）
- Task 16: 角色市场 API（发布、下架）
- Task 17: Fork 功能实现
- Task 18: 测试覆盖

**Week 4：搜索和优化**
- Task 19: 全文搜索索引和触发器
- Task 20: 搜索 Service 实现
- Task 21: 搜索 API（关键词、过滤、排序）
- Task 22: 性能优化（索引、查询优化）
- Task 23: 集成测试
- Task 24: 文档更新

### 6.3 技术依赖

**已安装**：
- `hono` - HTTP 框架
- `drizzle-orm` - ORM
- `postgres` - PostgreSQL 驱动
- `redis` - Redis 客户端
- `bcrypt` - 密码加密
- `jose` - JWT 库
- `zod` - 数据验证

**需要添加**：
- 无（所有依赖已满足）

### 6.4 测试策略

**单元测试**：
- JWT 工具函数
- Service 层业务逻辑
- Repository 层数据访问

**集成测试**：
- 认证流程（注册→登录→刷新→登出）
- CRUD 操作（创建→读取→更新→删除）
- 评分流程（提交→聚合→查询）
- 搜索功能（关键词→过滤→排序）

**测试覆盖目标**：
- 代码覆盖率 > 80%
- 所有 API 端点有集成测试
- 边界条件和错误场景覆盖

---

## 总结

Phase 2 将实现：

✅ **认证系统**
- JWT 双 token 机制
- 注册、登录、刷新、登出
- 认证中间件

✅ **CRUD API**
- 用户管理
- 角色管理
- 聊天和消息管理

✅ **社区功能**
- 五维度评分系统
- 角色市场（公开/私有）
- Fork 功能

✅ **搜索功能**
- PostgreSQL 全文搜索
- 多条件过滤和排序
- 相关性排名

**预计工期**: 4 周
**测试覆盖**: > 80%
**API 端点**: ~30 个
