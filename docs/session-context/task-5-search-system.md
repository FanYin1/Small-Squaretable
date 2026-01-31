# Task #5: 全文搜索系统实现 - 子会话启动上下文

## 会话配置

- **模型**: Claude Haiku（中复杂度任务）
- **工作目录**: `/var/aichat/Small-Squaretable`
- **依赖**: 独立任务，仅依赖现有的 characters schema
- **必需技能**: `superpowers:test-driven-development`

## 任务概述

实现 PostgreSQL 全文搜索系统，支持角色搜索：
- 添加 search_vector 列和 GIN 索引
- 创建自动更新触发器
- SearchService 实现
- 搜索 API（关键词/过滤/排序）
- 性能优化

## 技术栈

- **数据库**: PostgreSQL 全文搜索（tsvector + GIN 索引）
- **ORM**: Drizzle ORM
- **HTTP框架**: Hono
- **验证**: Zod

## 项目结构

```
src/
├── db/
│   ├── migrations/
│   │   └── XXXX_add_search_vector.sql  # 待创建
│   └── schema/
│       └── characters.ts               # 待修改（添加 search_vector）
├── server/
│   ├── services/
│   │   └── search.service.ts           # 待创建
│   └── routes/
│       └── characters.ts               # 待修改（添加搜索端点）
└── types/
    └── search.ts                       # 待创建
```

## PostgreSQL 全文搜索架构

### 1. 添加 search_vector 列

```sql
-- 迁移文件：migrations/XXXX_add_search_vector.sql
ALTER TABLE characters
ADD COLUMN search_vector tsvector;

-- 创建 GIN 索引加速搜索
CREATE INDEX characters_search_idx ON characters USING GIN(search_vector);
```

### 2. 自动更新触发器

```sql
-- 触发器函数：自动更新搜索向量
CREATE OR REPLACE FUNCTION characters_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER characters_search_vector_trigger
BEFORE INSERT OR UPDATE ON characters
FOR EACH ROW EXECUTE FUNCTION characters_search_vector_update();
```

**权重说明**:
- `A` (name) - 最高权重
- `B` (description) - 中等权重
- `C` (tags) - 较低权重

### 3. 更新现有数据

```sql
-- 为现有记录生成搜索向量
UPDATE characters
SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C');
```

## Schema 更新

```typescript
// src/db/schema/characters.ts
import { ..., sql } from 'drizzle-orm/pg-core';

export const characters = pgTable('characters', {
  // ... 现有字段

  // 添加搜索向量列
  searchVector: sql`tsvector`.as('search_vector'),
});
```

## 搜索 API 设计

```typescript
GET /api/v1/characters/search?q=keyword&sort=relevance&filter=public&page=1&limit=20
```

### 查询参数

```typescript
export const searchCharactersSchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  sort: z.enum(['relevance', 'rating', 'popular', 'newest']).default('relevance'),
  filter: z.enum(['public', 'my', 'all']).default('public'),
  category: z.string().optional(),
  tags: z.string().optional(), // 逗号分隔
  isNsfw: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

### 排序选项

- `relevance` - 相关性排名（默认，使用 ts_rank）
- `rating` - 评分最高
- `popular` - 下载量最多
- `newest` - 最新创建

### 过滤选项

- `public` - 仅公开角色（默认）
- `my` - 我的角色（需要认证）
- `all` - 所有可见角色（公开 + 我的）

## SearchService 实现

```typescript
// src/server/services/search.service.ts
import { sql, and, or, eq, desc, asc } from 'drizzle-orm';
import { db } from '../../db';
import { characters } from '../../db/schema/characters';

export interface SearchOptions {
  query: string;
  sort: 'relevance' | 'rating' | 'popular' | 'newest';
  filter: 'public' | 'my' | 'all';
  category?: string;
  tags?: string[];
  isNsfw?: boolean;
  tenantId?: string;
  page: number;
  limit: number;
}

export class SearchService {
  async searchCharacters(options: SearchOptions) {
    const { query, sort, filter, category, tags, isNsfw, tenantId, page, limit } = options;
    const offset = (page - 1) * limit;

    // 构建搜索查询
    const tsQuery = sql`plainto_tsquery('english', ${query})`;

    // 基础条件：搜索向量匹配
    const conditions = [sql`${characters.searchVector} @@ ${tsQuery}`];

    // 过滤条件
    if (filter === 'public') {
      conditions.push(eq(characters.isPublic, true));
    } else if (filter === 'my' && tenantId) {
      conditions.push(eq(characters.tenantId, tenantId));
    } else if (filter === 'all' && tenantId) {
      conditions.push(
        or(
          eq(characters.isPublic, true),
          eq(characters.tenantId, tenantId)
        )
      );
    }

    // 分类过滤
    if (category) {
      conditions.push(eq(characters.category, category));
    }

    // NSFW 过滤
    if (isNsfw !== undefined) {
      conditions.push(eq(characters.isNsfw, isNsfw));
    }

    // 标签过滤
    if (tags && tags.length > 0) {
      conditions.push(sql`${characters.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]`);
    }

    // 排序
    let orderBy;
    switch (sort) {
      case 'relevance':
        orderBy = sql`ts_rank(${characters.searchVector}, ${tsQuery}) DESC`;
        break;
      case 'rating':
        orderBy = desc(characters.ratingAvg);
        break;
      case 'popular':
        orderBy = desc(characters.downloadCount);
        break;
      case 'newest':
        orderBy = desc(characters.createdAt);
        break;
    }

    // 执行查询
    const results = await db
      .select({
        ...characters,
        rank: sql<number>`ts_rank(${characters.searchVector}, ${tsQuery})`,
      })
      .from(characters)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // 计数查询
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(and(...conditions));

    const total = countResult[0]?.count ?? 0;

    return {
      items: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export const searchService = new SearchService();
```

## 实施顺序

### Task 1: 数据库迁移
1. 创建迁移文件（添加 search_vector 列和索引）
2. 创建触发器函数
3. 更新现有数据
4. 运行迁移：`npm run db:migrate`

### Task 2: Schema 更新
1. 更新 `characters.ts` schema
2. 类型检查验证

### Task 3: SearchService 实现
1. 编写测试
2. 实现 SearchService
3. 测试验证

### Task 4: 搜索 API
1. 创建搜索类型定义
2. 添加搜索端点到 characters 路由
3. 集成测试

### Task 5: 性能优化
1. 验证索引使用（EXPLAIN ANALYZE）
2. 查询优化
3. 性能测试

## 测试策略

### 单元测试
```typescript
describe('SearchService', () => {
  it('should search by keyword', async () => {
    const results = await searchService.searchCharacters({
      query: 'wizard',
      sort: 'relevance',
      filter: 'public',
      page: 1,
      limit: 20,
    });
    expect(results.items.length).toBeGreaterThan(0);
  });

  it('should filter by category', async () => {
    const results = await searchService.searchCharacters({
      query: 'fantasy',
      category: 'RPG',
      sort: 'relevance',
      filter: 'public',
      page: 1,
      limit: 20,
    });
    expect(results.items.every(c => c.category === 'RPG')).toBe(true);
  });

  it('should sort by rating', async () => {
    const results = await searchService.searchCharacters({
      query: 'hero',
      sort: 'rating',
      filter: 'public',
      page: 1,
      limit: 20,
    });
    // 验证排序
  });
});
```

### 性能测试
```sql
-- 验证索引使用
EXPLAIN ANALYZE
SELECT *, ts_rank(search_vector, plainto_tsquery('english', 'wizard')) AS rank
FROM characters
WHERE search_vector @@ plainto_tsquery('english', 'wizard')
  AND is_public = true
ORDER BY rank DESC
LIMIT 20;

-- 应该看到 "Bitmap Index Scan on characters_search_idx"
```

## 验收标准

- [ ] 数据库迁移成功执行
- [ ] search_vector 列和索引创建成功
- [ ] 触发器自动更新搜索向量
- [ ] SearchService 测试通过
- [ ] 搜索 API 正确工作
- [ ] 支持多条件过滤和排序
- [ ] 查询使用 GIN 索引（性能优化）
- [ ] 类型检查通过

## 性能指标

- 搜索响应时间 < 100ms（10万条记录）
- 索引大小合理（约为表大小的 30-50%）
- 查询计划使用 Bitmap Index Scan

## 启动命令

```bash
cd /var/aichat/Small-Squaretable

# 使用 TDD 技能
# 按 Task 顺序执行：迁移 → Schema → Service → API → 优化
```

## 完成后汇报

在主会话中汇报：
- 迁移执行结果
- 搜索功能测试结果
- 性能测试结果（查询计划）
- 提交的 commit 列表
