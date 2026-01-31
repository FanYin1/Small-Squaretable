# Repository 层实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 User/Character/Chat/Message Repository，提供标准 CRUD 和租户隔离的数据访问层

**Architecture:** 所有 Repository 继承 BaseRepository，使用 Drizzle ORM 进行类型安全的数据库操作，支持租户隔离查询

**Tech Stack:** Drizzle ORM, PostgreSQL, TypeScript

---

## 前置条件

- PostgreSQL 运行中
- 数据库表已创建（users, characters, chats, messages）
- BaseRepository 已存在

## 文件结构

```
src/db/repositories/
├── base.repository.ts      # 已存在
├── tenant.repository.ts    # 已存在
├── user.repository.ts      # Task 1
├── character.repository.ts # Task 2
├── chat.repository.ts      # Task 3
├── message.repository.ts   # Task 4
└── index.ts                # 导出聚合
```

---

## Task 1: User Repository

**Files:**
- Create: `src/db/repositories/user.repository.ts`
- Create: `src/db/repositories/user.repository.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/db/repositories/user.repository.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    repo = new UserRepository();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      // Test implementation
    });

    it('should return null when not found', async () => {
      // Test implementation
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      // Test implementation
    });
  });

  describe('findByTenantId', () => {
    it('should return all users in tenant', async () => {
      // Test implementation
    });
  });

  describe('create', () => {
    it('should create and return user', async () => {
      // Test implementation
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      // Test implementation
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      // Test implementation
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/db/repositories/user.repository.spec.ts
```

### Step 3: 实现 User Repository

```typescript
// src/db/repositories/user.repository.ts
import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { users, type User, type NewUser } from '../schema/users';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async create(data: NewUser): Promise<User> {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | null> {
    const result = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async updateLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
}

export const userRepository = new UserRepository();
```

### Step 4: 运行测试验证通过

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/db/repositories/user.repository.spec.ts
```

### Step 5: 提交

```bash
git add src/db/repositories/user.repository.ts src/db/repositories/user.repository.spec.ts && git commit -m "feat(db): add user repository"
```

---

## Task 2: Character Repository

**Files:**
- Create: `src/db/repositories/character.repository.ts`
- Create: `src/db/repositories/character.repository.spec.ts`

### Step 1: 实现 Character Repository

```typescript
// src/db/repositories/character.repository.ts
import { eq, and, or, desc, asc, sql, ilike } from 'drizzle-orm';
import { db } from '../index';
import { characters, type Character, type NewCharacter } from '../schema/characters';
import type { PaginationParams } from '../../types/api';

export interface CharacterFilters {
  tenantId?: string;
  creatorId?: string;
  isPublic?: boolean;
  isNsfw?: boolean;
  category?: string;
  tags?: string[];
}

export class CharacterRepository {
  async findById(id: string): Promise<Character | null> {
    const result = await db.select().from(characters).where(eq(characters.id, id));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string, pagination?: PaginationParams): Promise<Character[]> {
    let query = db.select().from(characters).where(eq(characters.tenantId, tenantId));

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);

      if (pagination.sortBy) {
        const column = characters[pagination.sortBy as keyof typeof characters];
        if (column) {
          query = pagination.sortOrder === 'asc'
            ? query.orderBy(asc(column))
            : query.orderBy(desc(column));
        }
      }
    }

    return await query;
  }

  async findPublic(pagination?: PaginationParams): Promise<Character[]> {
    let query = db.select().from(characters).where(eq(characters.isPublic, true));

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query.orderBy(desc(characters.downloadCount));
  }

  async create(data: NewCharacter): Promise<Character> {
    const result = await db.insert(characters).values(data).returning();
    return result[0];
  }

  async update(id: string, tenantId: string, data: Partial<NewCharacter>): Promise<Character | null> {
    const result = await db
      .update(characters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(characters.id, id), eq(characters.tenantId, tenantId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(characters)
      .where(and(eq(characters.id, id), eq(characters.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await db
      .update(characters)
      .set({ downloadCount: sql`${characters.downloadCount} + 1` })
      .where(eq(characters.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(characters)
      .set({ viewCount: sql`${characters.viewCount} + 1` })
      .where(eq(characters.id, id));
  }

  async countByTenantId(tenantId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(eq(characters.tenantId, tenantId));
    return result[0]?.count ?? 0;
  }

  async countPublic(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(eq(characters.isPublic, true));
    return result[0]?.count ?? 0;
  }
}

export const characterRepository = new CharacterRepository();
```

### Step 2: 提交

```bash
git add src/db/repositories/character.repository.ts src/db/repositories/character.repository.spec.ts && git commit -m "feat(db): add character repository with marketplace support"
```

---

## Task 3: Chat Repository

**Files:**
- Create: `src/db/repositories/chat.repository.ts`
- Create: `src/db/repositories/chat.repository.spec.ts`

### Step 1: 实现 Chat Repository

```typescript
// src/db/repositories/chat.repository.ts
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../index';
import { chats, type Chat, type NewChat } from '../schema/chats';
import type { PaginationParams } from '../../types/api';

export class ChatRepository {
  async findById(id: string): Promise<Chat | null> {
    const result = await db.select().from(chats).where(eq(chats.id, id));
    return result[0] ?? null;
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<Chat | null> {
    const result = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)));
    return result[0] ?? null;
  }

  async findByUserId(userId: string, pagination?: PaginationParams): Promise<Chat[]> {
    let query = db.select().from(chats).where(eq(chats.userId, userId));

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query.orderBy(desc(chats.updatedAt));
  }

  async findByCharacterId(characterId: string): Promise<Chat[]> {
    return await db
      .select()
      .from(chats)
      .where(eq(chats.characterId, characterId))
      .orderBy(desc(chats.updatedAt));
  }

  async create(data: NewChat): Promise<Chat> {
    const result = await db.insert(chats).values(data).returning();
    return result[0];
  }

  async update(id: string, tenantId: string, data: Partial<NewChat>): Promise<Chat | null> {
    const result = await db
      .update(chats)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(chats)
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }
}

export const chatRepository = new ChatRepository();
```

### Step 2: 提交

```bash
git add src/db/repositories/chat.repository.ts src/db/repositories/chat.repository.spec.ts && git commit -m "feat(db): add chat repository"
```

---

## Task 4: Message Repository

**Files:**
- Create: `src/db/repositories/message.repository.ts`
- Create: `src/db/repositories/message.repository.spec.ts`

### Step 1: 实现 Message Repository

```typescript
// src/db/repositories/message.repository.ts
import { eq, desc, gt, lt, sql } from 'drizzle-orm';
import { db } from '../index';
import { messages, type Message, type NewMessage } from '../schema/chats';

export interface MessagePagination {
  limit: number;
  before?: number;
  after?: number;
}

export class MessageRepository {
  async findByChatId(chatId: string, pagination?: MessagePagination): Promise<Message[]> {
    let query = db.select().from(messages).where(eq(messages.chatId, chatId));

    if (pagination) {
      if (pagination.before) {
        query = query.where(lt(messages.id, pagination.before));
      }
      if (pagination.after) {
        query = query.where(gt(messages.id, pagination.after));
      }
      query = query.limit(pagination.limit);
    }

    return await query.orderBy(desc(messages.sentAt));
  }

  async findById(id: number): Promise<Message | null> {
    const result = await db.select().from(messages).where(eq(messages.id, id));
    return result[0] ?? null;
  }

  async create(data: NewMessage): Promise<Message> {
    const result = await db.insert(messages).values(data).returning();
    return result[0];
  }

  async createMany(data: NewMessage[]): Promise<Message[]> {
    return await db.insert(messages).values(data).returning();
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(messages).where(eq(messages.id, id)).returning();
    return result.length > 0;
  }

  async deleteByChatId(chatId: string): Promise<number> {
    const result = await db.delete(messages).where(eq(messages.chatId, chatId)).returning();
    return result.length;
  }

  async countByChatId(chatId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatId, chatId));
    return result[0]?.count ?? 0;
  }
}

export const messageRepository = new MessageRepository();
```

### Step 2: 提交

```bash
git add src/db/repositories/message.repository.ts src/db/repositories/message.repository.spec.ts && git commit -m "feat(db): add message repository with cursor pagination"
```

---

## Task 5: 更新导出索引

**Files:**
- Modify: `src/db/repositories/index.ts`

```typescript
// src/db/repositories/index.ts
export * from './base.repository';
export * from './tenant.repository';
export * from './user.repository';
export * from './character.repository';
export * from './chat.repository';
export * from './message.repository';
```

### 提交

```bash
git add src/db/repositories/index.ts && git commit -m "feat(db): export all repositories"
```

---

## 验收标准检查清单

- [ ] UserRepository 测试通过
- [ ] CharacterRepository 测试通过
- [ ] ChatRepository 测试通过
- [ ] MessageRepository 测试通过
- [ ] 类型检查通过 (`npm run type-check`)
- [ ] 所有 Repository 支持租户隔离

## 运行验证

```bash
cd /var/aichat/Small-Squaretable
npm run type-check
npx vitest run src/db/repositories/
```
