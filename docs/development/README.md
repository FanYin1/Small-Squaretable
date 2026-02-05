# Small Squaretable 开发者指南

> 开发环境设置、代码规范和测试指南
>
> **版本**: 1.0.0
> **更新日期**: 2026-02-04

---

## 目录

1. [开发环境设置](#开发环境设置)
2. [项目结构](#项目结构)
3. [代码规范](#代码规范)
4. [测试指南](#测试指南)
5. [数据库操作](#数据库操作)
6. [API 开发](#api-开发)
7. [前端开发](#前端开发)
8. [调试技巧](#调试技巧)
9. [常见问题](#常见问题)

---

## 开发环境设置

### 系统要求

| 软件 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Node.js | 20.0.0 | 20.x LTS |
| PostgreSQL | 15 | 15+ |
| Redis | 7 | 7+ |
| npm | 10 | 10+ |

### 快速开始

```bash
# 1. 克隆仓库
git clone <repository-url>
cd Small-Squaretable

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis 和其他服务

# 4. 启动数据库服务（使用 Docker）
docker run -d \
  --name sillytavern-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sillytavern_saas \
  -p 5432:5432 \
  postgres:15

docker run -d \
  --name sillytavern-redis \
  -p 6379:6379 \
  redis:7

# 5. 运行数据库迁移
npm run db:migrate

# 6. 启动开发服务器
npm run dev          # 后端服务器 (端口 3000)
npm run dev:client   # 前端服务器 (端口 5175)
```

### 环境变量配置

创建 `.env` 文件并配置以下变量：

```bash
# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sillytavern_saas
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# 服务器
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# JWT 认证
JWT_SECRET=your-development-secret-key-at-least-32-chars
JWT_EXPIRES_IN=7d

# 存储
STORAGE_TYPE=local
STORAGE_PATH=./uploads

# LLM 提供商（可选）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# Stripe（可选，用于订阅功能）
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# 日志
LOG_LEVEL=debug
```

### IDE 配置

#### VS Code 推荐扩展

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "Vue.volar",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

#### VS Code 设置

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## 项目结构

```
Small-Squaretable/
├── src/
│   ├── client/              # 前端 Vue 应用
│   │   ├── components/      # Vue 组件
│   │   ├── views/           # 页面视图
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── services/        # API 服务层
│   │   ├── router/          # Vue Router 配置
│   │   └── utils/           # 前端工具函数
│   │
│   ├── server/              # 后端 Hono 服务器
│   │   ├── routes/          # API 路由
│   │   ├── middleware/      # 中间件
│   │   ├── services/        # 业务服务
│   │   └── config/          # 配置文件
│   │
│   ├── core/                # 核心业务逻辑
│   │   ├── jwt.ts           # JWT 处理
│   │   ├── redis.ts         # Redis 客户端
│   │   ├── config.ts        # 配置管理
│   │   └── errors.ts        # 错误定义
│   │
│   ├── db/                  # 数据库层
│   │   ├── schema/          # Drizzle 表定义
│   │   ├── repositories/    # 数据访问层
│   │   └── migrations/      # 数据库迁移
│   │
│   ├── types/               # TypeScript 类型定义
│   ├── adapters/            # 外部服务适配器
│   ├── services/            # 共享服务
│   └── utils/               # 工具函数
│
├── tests/                   # 单元测试
├── e2e/                     # E2E 测试
├── docs/                    # 文档
├── k8s/                     # Kubernetes 配置
└── scripts/                 # 脚本工具
```

### 关键文件说明

| 文件 | 说明 |
|------|------|
| `src/server/index.ts` | 服务器入口点 |
| `src/client/main.ts` | 前端入口点 |
| `src/db/schema/index.ts` | 数据库 Schema 导出 |
| `drizzle.config.ts` | Drizzle ORM 配置 |
| `vite.config.ts` | Vite 构建配置 |
| `vitest.config.ts` | Vitest 测试配置 |
| `playwright.config.ts` | Playwright E2E 配置 |

---

## 代码规范

### TypeScript 规范

#### 命名约定

```typescript
// 接口：PascalCase，以 I 开头（可选）
interface UserProfile {
  id: string;
  email: string;
}

// 类型别名：PascalCase
type UserId = string;

// 枚举：PascalCase，成员也是 PascalCase
enum UserRole {
  Admin = 'admin',
  User = 'user',
}

// 常量：UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// 函数：camelCase
function getUserById(id: string): Promise<User> {}

// 类：PascalCase
class UserService {}

// 文件名：kebab-case
// user-service.ts, auth.middleware.ts
```

#### 类型安全

```typescript
// 使用严格类型，避免 any
// Bad
function process(data: any) {}

// Good
function process(data: UserInput) {}

// 使用 unknown 代替 any 进行类型收窄
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}

// 使用 Zod 进行运行时验证
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type UserInput = z.infer<typeof userSchema>;
```

### ESLint 规则

项目使用 ESLint 进行代码检查：

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

主要规则：
- 使用 TypeScript 严格模式
- 禁止使用 `any`（除非必要）
- 强制使用 `const` 和 `let`，禁止 `var`
- 强制使用单引号
- 强制使用分号

### Git 提交规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### 类型（type）

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具相关 |

#### 示例

```bash
feat(auth): add JWT refresh token support

- Implement refresh token generation
- Add token rotation on refresh
- Update auth middleware

Closes #123
```

### 分支命名

```
<type>/<description>

# 示例
feature/user-authentication
fix/login-validation
refactor/database-queries
```

---

## 测试指南

### 测试框架

- **单元测试**: Vitest
- **E2E 测试**: Playwright
- **测试覆盖率**: @vitest/coverage-v8

### 运行测试

```bash
# 运行所有单元测试
npm test

# 运行特定测试文件
npx vitest run src/server/routes/auth.spec.ts

# 监听模式
npx vitest watch

# 生成覆盖率报告
npm run test:coverage

# E2E 测试
npm run test:e2e

# E2E 测试（带 UI）
npm run test:e2e:ui

# E2E 测试（调试模式）
npm run test:e2e:debug
```

### 单元测试示例

```typescript
// src/server/routes/auth.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../services/auth.service';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user with valid input', async () => {
      const input = {
        email: 'test@example.com',
        password: 'SecurePass123',
      };

      const result = await authService.register(input);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result.user.email).toBe(input.email);
    });

    it('should throw error for duplicate email', async () => {
      const input = {
        email: 'existing@example.com',
        password: 'SecurePass123',
      };

      await expect(authService.register(input)).rejects.toThrow('Email already exists');
    });
  });
});
```

### E2E 测试示例

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'SecurePass123');
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('[data-testid="email-input"]', 'wrong@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
  });
});
```

### 测试最佳实践

1. **使用 `vi.spyOn` 而非 `vi.mock`**
   ```typescript
   // 推荐
   vi.spyOn(userService, 'getById').mockResolvedValue(mockUser);

   // 避免
   vi.mock('../services/user.service');
   ```

2. **每个测试独立**
   ```typescript
   beforeEach(() => {
     vi.clearAllMocks();
   });
   ```

3. **使用 data-testid 进行 E2E 测试**
   ```html
   <button data-testid="submit-button">Submit</button>
   ```

4. **测试边界条件**
   - 空输入
   - 最大/最小值
   - 特殊字符
   - 并发请求

---

## 数据库操作

### Drizzle ORM

项目使用 Drizzle ORM 进行数据库操作。

#### Schema 定义

```typescript
// src/db/schema/users.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### 数据库命令

```bash
# 生成迁移
npm run db:generate

# 运行迁移
npm run db:migrate

# 推送 Schema（开发环境）
npm run db:push

# 打开 Drizzle Studio
npm run db:studio
```

#### Repository 模式

```typescript
// src/db/repositories/user.repository.ts
import { db } from '../index';
import { users } from '../schema/users';
import { eq } from 'drizzle-orm';

export class UserRepository {
  async findById(id: string) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async findByEmail(email: string) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async create(data: NewUser) {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  }
}
```

---

## API 开发

### Hono 框架

项目使用 Hono 作为 HTTP 框架。

#### 路由定义

```typescript
// src/server/routes/users.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { updateUserSchema } from '../../types/user';

export const userRoutes = new Hono();

// GET /api/v1/users/me
userRoutes.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: user,
    meta: { timestamp: new Date().toISOString() },
  });
});

// PATCH /api/v1/users/me
userRoutes.patch(
  '/me',
  authMiddleware(),
  zValidator('json', updateUserSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    // ... 更新逻辑
  }
);
```

#### 中间件

```typescript
// src/server/middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import { verifyAccessToken } from '../../core/jwt';

export const authMiddleware = () =>
  createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED' } }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);

    c.set('user', payload);
    c.set('tenantId', payload.tenantId);

    await next();
  });
```

#### 错误处理

```typescript
// src/server/middleware/error-handler.ts
import { createMiddleware } from 'hono/factory';
import { AppError } from '../../core/errors';

export const errorHandler = () =>
  createMiddleware(async (c, next) => {
    try {
      await next();
    } catch (error) {
      if (error instanceof AppError) {
        return c.json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
          meta: { timestamp: new Date().toISOString() },
        }, error.statusCode);
      }

      console.error('Unhandled error:', error);
      return c.json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        meta: { timestamp: new Date().toISOString() },
      }, 500);
    }
  });
```

### API 响应格式

所有 API 响应遵循统一格式：

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}
```

---

## 前端开发

### Vue 3 + Pinia

#### 组件结构

```vue
<!-- src/client/components/UserProfile.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const isLoading = ref(false);

const displayName = computed(() => userStore.user?.displayName ?? 'Guest');

onMounted(async () => {
  isLoading.value = true;
  await userStore.fetchProfile();
  isLoading.value = false;
});
</script>

<template>
  <div class="user-profile">
    <el-skeleton v-if="isLoading" :rows="3" />
    <div v-else>
      <h2>{{ displayName }}</h2>
      <!-- ... -->
    </div>
  </div>
</template>

<style scoped>
.user-profile {
  padding: 20px;
}
</style>
```

#### Pinia Store

```typescript
// src/client/stores/user.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { userApi } from '@/services/api';
import type { User } from '@/types';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const isAuthenticated = computed(() => !!user.value);

  async function fetchProfile() {
    const response = await userApi.getProfile();
    user.value = response.data;
  }

  async function updateProfile(data: Partial<User>) {
    const response = await userApi.updateProfile(data);
    user.value = response.data;
  }

  function logout() {
    user.value = null;
  }

  return {
    user,
    isAuthenticated,
    fetchProfile,
    updateProfile,
    logout,
  };
});
```

#### API 服务层

```typescript
// src/client/services/api/user.ts
import { apiClient } from './client';
import type { ApiResponse, User } from '@/types';

export const userApi = {
  async getProfile(): Promise<ApiResponse<User>> {
    return apiClient.get('/api/v1/users/me');
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    return apiClient.patch('/api/v1/users/me', data);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return apiClient.patch('/api/v1/users/me/password', {
      currentPassword,
      newPassword,
    });
  },
};
```

---

## 调试技巧

### 后端调试

```bash
# 使用 Node.js 调试器
node --inspect -r tsx src/server/index.ts

# VS Code 调试配置
# .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "src/server/index.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### 前端调试

```bash
# Vue Devtools
# 安装浏览器扩展：Vue.js devtools

# Vite 调试
npm run dev:client -- --debug
```

### 数据库调试

```bash
# 打开 Drizzle Studio
npm run db:studio

# 直接连接 PostgreSQL
psql -h localhost -U postgres -d sillytavern_saas

# 查看 Redis 数据
redis-cli
> KEYS *
> GET key_name
```

### 日志级别

```bash
# 设置日志级别
LOG_LEVEL=debug npm run dev

# 日志级别：debug < info < warn < error
```

---

## 常见问题

### Q: 数据库连接失败

A: 检查以下项目：
1. PostgreSQL 服务是否运行
2. `DATABASE_URL` 环境变量是否正确
3. 数据库用户权限是否足够

```bash
# 检查 PostgreSQL 状态
docker ps | grep postgres

# 测试连接
psql -h localhost -U postgres -d sillytavern_saas -c "SELECT 1"
```

### Q: Redis 连接失败

A: 检查以下项目：
1. Redis 服务是否运行
2. `REDIS_URL` 环境变量是否正确

```bash
# 检查 Redis 状态
docker ps | grep redis

# 测试连接
redis-cli ping
```

### Q: JWT Token 验证失败

A: 检查以下项目：
1. `JWT_SECRET` 环境变量是否设置
2. Token 是否过期
3. Token 格式是否正确

### Q: 测试失败

A: 常见原因：
1. 数据库未启动（集成测试需要）
2. 环境变量未配置
3. 依赖未安装

```bash
# 重新安装依赖
rm -rf node_modules
npm install

# 检查环境变量
cat .env
```

### Q: 前端热更新不工作

A: 尝试以下方法：
1. 清除浏览器缓存
2. 重启 Vite 开发服务器
3. 检查 `vite.config.ts` 配置

```bash
# 清除 Vite 缓存
rm -rf node_modules/.vite
npm run dev:client
```

### Q: 类型检查失败

A: 运行类型检查并修复错误：

```bash
npm run type-check

# 常见问题：
# - 缺少类型定义
# - 类型不匹配
# - 导入路径错误
```

---

## 参考资源

- [Hono 文档](https://hono.dev/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [Vue 3 文档](https://vuejs.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Vitest 文档](https://vitest.dev/)
- [Playwright 文档](https://playwright.dev/)
- [Zod 文档](https://zod.dev/)

---

**版本**: 1.0.0
**最后更新**: 2026-02-04
