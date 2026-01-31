# Task #2: Repository 层实现 - 子会话启动上下文

## 会话配置

- **模型**: Claude Haiku（中复杂度任务）
- **工作目录**: `/var/aichat/Small-Squaretable`
- **实施计划**: `docs/plans/2026-01-31-repositories-implementation.md`
- **必需技能**: `superpowers:executing-plans`

## 任务概述

实现数据访问层 Repository，提供标准 CRUD 和租户隔离：
- UserRepository（用户 CRUD）
- CharacterRepository（角色 CRUD + 市场查询）
- ChatRepository（聊天 CRUD）
- MessageRepository（消息 CRUD + 游标分页）

## 技术栈

- **ORM**: Drizzle ORM ^0.38.3
- **数据库**: PostgreSQL
- **语言**: TypeScript

## 项目结构

```
Small-Squaretable/
├── src/
│   ├── db/
│   │   ├── schema/
│   │   │   ├── users.ts       # 已存在
│   │   │   ├── characters.ts  # 已存在
│   │   │   ├── chats.ts       # 已存在（包含 messages）
│   │   │   └── tenants.ts     # 已存在
│   │   ├── repositories/
│   │   │   ├── base.repository.ts    # 已存在
│   │   │   ├── tenant.repository.ts  # 已存在（参考实现）
│   │   │   ├── user.repository.ts    # 待创建
│   │   │   ├── character.repository.ts # 待创建
│   │   │   ├── chat.repository.ts    # 待创建
│   │   │   ├── message.repository.ts # 待创建
│   │   │   └── index.ts              # 待更新
│   │   └── index.ts           # 数据库连接（已存在）
│   └── types/
│       └── api.ts             # 已存在（PaginationParams）
```

## 现有参考实现

### BaseRepository（已存在）
```typescript
export abstract class BaseRepository {
  constructor(protected db: Database) {}
}
```

### TenantRepository（参考）
```typescript
export class TenantRepository {
  async findById(id: string): Promise<Tenant | null> {
    const result = await db.select().from(tenants).where(eq(tenants.id, id));
    return result[0] ?? null;
  }
  // ... 其他方法
}
```

## Schema 结构

### users 表
- id (uuid, PK)
- tenantId (uuid, FK → tenants)
- email (varchar, unique)
- passwordHash (varchar)
- displayName (varchar)
- avatarUrl (varchar)
- isActive (boolean)
- emailVerified (boolean)
- createdAt, updatedAt, lastLoginAt (timestamp)

### characters 表
- id (uuid, PK)
- tenantId (uuid, FK → tenants)
- creatorId (uuid, FK → users)
- name (varchar)
- description (text)
- avatarUrl (varchar)
- cardData (jsonb)
- tags (text[])
- category (varchar)
- isPublic (boolean)
- isNsfw (boolean)
- downloadCount, viewCount, ratingCount (integer)
- ratingAvg (decimal)
- createdAt, updatedAt (timestamp)

### chats 表
- id (uuid, PK)
- tenantId (uuid, FK → tenants)
- userId (uuid, FK → users)
- characterId (uuid, FK → characters)
- title (varchar)
- summary (text)
- metadata (jsonb)
- createdAt, updatedAt (timestamp)

### messages 表
- id (bigserial, PK)
- chatId (uuid, FK → chats)
- role (enum: user/assistant/system)
- content (text)
- attachments (jsonb)
- extra (jsonb)
- sentAt (timestamp)

## 实施顺序（5个Task）

1. **UserRepository** - 基础 CRUD + 认证相关方法
2. **CharacterRepository** - CRUD + 市场查询 + 统计
3. **ChatRepository** - CRUD + 分页
4. **MessageRepository** - CRUD + 游标分页
5. **更新导出索引** - 统一导出所有 Repository

## 关键功能需求

### UserRepository
- findById, findByEmail, findByTenantId
- create, update, delete
- updateLastLogin, updatePassword

### CharacterRepository
- findById, findByTenantId, findPublic
- create, update, delete
- incrementDownloadCount, incrementViewCount
- countByTenantId, countPublic
- 支持分页和排序

### ChatRepository
- findById, findByIdAndTenant
- findByUserId, findByCharacterId
- create, update, delete
- 支持分页

### MessageRepository
- findByChatId（游标分页：before/after）
- findById
- create, createMany
- delete, deleteByChatId
- countByChatId

## 租户隔离原则

所有涉及租户数据的操作必须包含 tenantId 检查：

```typescript
// ✅ 正确：包含租户检查
async update(id: string, tenantId: string, data: Partial<T>) {
  return await db.update(table)
    .set(data)
    .where(and(eq(table.id, id), eq(table.tenantId, tenantId)))
    .returning();
}

// ❌ 错误：缺少租户检查
async update(id: string, data: Partial<T>) {
  return await db.update(table)
    .set(data)
    .where(eq(table.id, id))
    .returning();
}
```

## TDD 开发模式

每个 Repository 遵循：
1. 编写测试（可以使用 mock 或真实数据库）
2. 实现 Repository
3. 运行测试验证
4. 提交代码

## 验收标准

- [ ] 所有 Repository 测试通过
- [ ] 类型检查通过：`npm run type-check`
- [ ] 所有 CRUD 方法实现
- [ ] 租户隔离正确实现
- [ ] 分页功能正确工作
- [ ] 统计方法返回正确结果

## 启动命令

在新会话中执行：

```bash
cd /var/aichat/Small-Squaretable
# 使用 superpowers:executing-plans 技能
# 读取计划文件: docs/plans/2026-01-31-repositories-implementation.md
# 按 Task 顺序执行
```

## 关键注意事项

1. **租户隔离**: 所有查询必须包含 tenantId 检查（除了 public 查询）
2. **返回类型**: 单个结果返回 `T | null`，列表返回 `T[]`
3. **时间戳**: update 操作自动更新 `updatedAt`
4. **级联删除**: 依赖数据库外键约束
5. **分页**: 使用 `limit` 和 `offset`，Message 使用游标分页
6. **SQL 函数**: 使用 `sql` 模板标签进行计数和增量操作

## Drizzle ORM 常用操作

```typescript
// 查询
await db.select().from(table).where(eq(table.id, id));

// 插入
await db.insert(table).values(data).returning();

// 更新
await db.update(table).set(data).where(eq(table.id, id)).returning();

// 删除
await db.delete(table).where(eq(table.id, id)).returning();

// 复合条件
await db.select().from(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId)));

// 排序
await db.select().from(table).orderBy(desc(table.createdAt));

// 分页
await db.select().from(table).limit(20).offset(0);

// 计数
await db.select({ count: sql<number>`count(*)` }).from(table);

// 增量
await db.update(table).set({ count: sql`${table.count} + 1` });
```

## 完成后汇报

在主会话中汇报：
- 完成的 Repository 列表
- 测试结果
- 遇到的问题和解决方案
- 提交的 commit 列表
