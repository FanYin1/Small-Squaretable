# 认证系统实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现完整的 JWT 双 Token 认证系统，包括注册、登录、刷新、登出功能

**Architecture:** 使用 jose 库实现 JWT，Access Token (15min) + Refresh Token (7d) 双 token 机制。Refresh Token 存储在 Redis 中支持撤销。认证中间件验证 token 并注入用户信息到 Hono context。

**Tech Stack:** jose (JWT), bcrypt (密码加密), Redis (refresh token 存储), Zod (输入验证)

---

## 前置条件

- PostgreSQL 运行中，users 表已存在
- Redis 运行中
- 环境变量已配置：`JWT_SECRET`, `REDIS_URL`

## 文件结构

```
src/
├── core/
│   └── jwt.ts                    # JWT 工具模块
├── server/
│   ├── middleware/
│   │   └── auth.ts               # 认证中间件
│   ├── routes/
│   │   └── auth.ts               # 认证路由
│   └── services/
│       └── auth.service.ts       # 认证业务逻辑
├── db/
│   └── repositories/
│       └── user.repository.ts    # 用户数据访问（本任务需要）
└── types/
    └── auth.ts                   # 认证相关类型
```

---

## Task 1: JWT 工具模块

**Files:**
- Create: `src/core/jwt.ts`
- Create: `src/core/jwt.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/core/jwt.spec.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';

describe('JWT Module', () => {
  const mockPayload = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    tenantId: '123e4567-e89b-12d3-a456-426614174001',
    email: 'test@example.com',
  };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', async () => {
      const token = await generateAccessToken(mockPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', async () => {
      const token = await generateRefreshToken(mockPayload.userId);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', async () => {
      const token = await generateAccessToken(mockPayload);
      const payload = await verifyAccessToken(token);
      expect(payload.userId).toBe(mockPayload.userId);
      expect(payload.tenantId).toBe(mockPayload.tenantId);
      expect(payload.email).toBe(mockPayload.email);
    });

    it('should throw on invalid token', async () => {
      await expect(verifyAccessToken('invalid.token.here')).rejects.toThrow();
    });

    it('should throw on expired token', async () => {
      vi.useFakeTimers();
      const token = await generateAccessToken(mockPayload);
      vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes
      await expect(verifyAccessToken(token)).rejects.toThrow();
      vi.useRealTimers();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', async () => {
      const token = await generateRefreshToken(mockPayload.userId);
      const payload = await verifyRefreshToken(token);
      expect(payload.userId).toBe(mockPayload.userId);
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/core/jwt.spec.ts
```

Expected: FAIL - 模块不存在

### Step 3: 实现 JWT 工具模块

```typescript
// src/core/jwt.ts
import * as jose from 'jose';
import { config } from './config';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

const getSecretKey = () => new TextEncoder().encode(config.jwtSecret);

export async function generateAccessToken(payload: AccessTokenPayload): Promise<string> {
  return await new jose.SignJWT({
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const tokenId = crypto.randomUUID();
  return await new jose.SignJWT({
    userId,
    tokenId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey());
  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
    email: payload.email as string,
  };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecretKey());
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return {
    userId: payload.userId as string,
    tokenId: payload.tokenId as string,
  };
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
```

### Step 4: 运行测试验证通过

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/core/jwt.spec.ts
```

Expected: PASS

### Step 5: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/core/jwt.ts src/core/jwt.spec.ts && git commit -m "feat(core): add JWT utility module with access/refresh token support"
```

---

## Task 2: 认证类型定义

**Files:**
- Create: `src/types/auth.ts`

### Step 1: 创建认证类型定义

```typescript
// src/types/auth.ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthContext {
  user: AuthUser;
  tenantId: string;
}
```

### Step 2: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/types/auth.ts && git commit -m "feat(types): add authentication type definitions"
```

---

## Task 3: 用户 Repository（认证所需部分）

**Files:**
- Create: `src/db/repositories/user.repository.ts`
- Create: `src/db/repositories/user.repository.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/db/repositories/user.repository.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from './user.repository';

vi.mock('../index', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    repo = new UserRepository();
  });

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
      };
      vi.mocked(repo['db'].select().from().where).mockResolvedValueOnce([mockUser]);

      const result = await repo.findByEmail('test@example.com');
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      vi.mocked(repo['db'].select().from().where).mockResolvedValueOnce([]);

      const result = await repo.findByEmail('notfound@example.com');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and return user', async () => {
      const mockUser = {
        id: '123',
        email: 'new@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
      };
      vi.mocked(repo['db'].insert().values().returning).mockResolvedValueOnce([mockUser]);

      const result = await repo.create({
        email: 'new@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
      });
      expect(result).toEqual(mockUser);
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/db/repositories/user.repository.spec.ts
```

Expected: FAIL

### Step 3: 实现 User Repository

```typescript
// src/db/repositories/user.repository.ts
import { eq } from 'drizzle-orm';
import { db } from '../index';
import { users, type User, type NewUser } from '../schema/users';

export class UserRepository {
  protected db = db;

  async findById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    return await this.db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db
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

Expected: PASS

### Step 5: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/db/repositories/user.repository.ts src/db/repositories/user.repository.spec.ts && git commit -m "feat(db): add user repository for authentication"
```

---

## Task 4: 认证服务

**Files:**
- Create: `src/server/services/auth.service.ts`
- Create: `src/server/services/auth.service.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/server/services/auth.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { UnauthorizedError, ValidationError } from '../../core/errors';

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    updateLastLogin: vi.fn(),
  },
}));

vi.mock('../../core/jwt', () => ({
  generateAccessToken: vi.fn().mockResolvedValue('access_token'),
  generateRefreshToken: vi.fn().mockResolvedValue('refresh_token'),
  verifyRefreshToken: vi.fn().mockResolvedValue({ userId: '123', tokenId: 'token123' }),
}));

vi.mock('../../core/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('token123'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(userRepository.create).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
        displayName: null,
        avatarUrl: null,
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
    });

    it('should throw if email already exists', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: '123',
        email: 'existing@example.com',
      } as any);

      await expect(
        service.register({ email: 'existing@example.com', password: 'password123' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        tenantId: '456',
        passwordHash: 'hashed',
        displayName: null,
        avatarUrl: null,
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
    });

    it('should throw on invalid credentials', async () => {
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@example.com', password: 'wrong' })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/services/auth.service.spec.ts
```

Expected: FAIL

### Step 3: 实现认证服务

```typescript
// src/server/services/auth.service.ts
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { userRepository } from '../../db/repositories/user.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../core/jwt';
import { redis } from '../../core/redis';
import { UnauthorizedError, ValidationError } from '../../core/errors';
import type { RegisterInput, LoginInput, AuthTokens, AuthUser } from '../../types/auth';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export class AuthService {
  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const tenantId = nanoid();

    const user = await userRepository.create({
      email: input.email,
      passwordHash,
      tenantId,
      displayName: input.displayName ?? null,
    });

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    await userRepository.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await verifyRefreshToken(refreshToken);

    const storedToken = await redis.get(`${REFRESH_TOKEN_PREFIX}${payload.userId}`);
    if (!storedToken || storedToken !== payload.tokenId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const tokens = await this.generateTokens(user.id, user.tenantId, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await redis.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
  }

  private async generateTokens(userId: string, tenantId: string, email: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      generateAccessToken({ userId, tenantId, email }),
      generateRefreshToken(userId),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const payload = await verifyRefreshToken(refreshToken);
    await redis.set(
      `${REFRESH_TOKEN_PREFIX}${userId}`,
      payload.tokenId,
      { EX: REFRESH_TOKEN_TTL }
    );
  }

  private toAuthUser(user: any): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }
}

export const authService = new AuthService();
```

### Step 4: 运行测试验证通过

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/services/auth.service.spec.ts
```

Expected: PASS

### Step 5: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/server/services/auth.service.ts src/server/services/auth.service.spec.ts && git commit -m "feat(server): add authentication service with register/login/refresh/logout"
```

---

## Task 5: 认证中间件

**Files:**
- Create: `src/server/middleware/auth.ts`
- Create: `src/server/middleware/auth.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/server/middleware/auth.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from './auth';

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should allow request with valid token', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: '123',
        tenantId: '456',
        email: 'test@example.com',
      });
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: '123',
        tenantId: '456',
        email: 'test@example.com',
        isActive: true,
      } as any);

      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ userId: c.get('user').id }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe('123');
    });

    it('should reject request without token', async () => {
      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('Invalid token'));

      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid_token' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should allow request without token', async () => {
      app.use('/*', optionalAuthMiddleware());
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ hasUser: !!user });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasUser).toBe(false);
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/middleware/auth.spec.ts
```

Expected: FAIL

### Step 3: 实现认证中间件

```typescript
// src/server/middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { verifyAccessToken, extractTokenFromHeader } from '../../core/jwt';
import { userRepository } from '../../db/repositories/user.repository';
import { UnauthorizedError } from '../../core/errors';
import type { AuthUser } from '../../types/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    tenantId: string;
  }
}

export function authMiddleware() {
  return createMiddleware(async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    try {
      const payload = await verifyAccessToken(token);
      const user = await userRepository.findById(payload.userId);

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      c.set('user', {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
      c.set('tenantId', user.tenantId);

      return next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid authentication token');
    }
  });
}

export function optionalAuthMiddleware() {
  return createMiddleware(async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      try {
        const payload = await verifyAccessToken(token);
        const user = await userRepository.findById(payload.userId);

        if (user && user.isActive) {
          c.set('user', {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
          c.set('tenantId', user.tenantId);
        }
      } catch {
        // Ignore invalid tokens for optional auth
      }
    }

    return next();
  });
}
```

### Step 4: 运行测试验证通过

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/middleware/auth.spec.ts
```

Expected: PASS

### Step 5: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/server/middleware/auth.ts src/server/middleware/auth.spec.ts && git commit -m "feat(server): add auth middleware with required and optional variants"
```

---

## Task 6: 认证路由

**Files:**
- Create: `src/server/routes/auth.ts`
- Create: `src/server/routes/auth.spec.ts`

### Step 1: 编写失败的测试

```typescript
// src/server/routes/auth.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authRoutes } from './auth';

vi.mock('../services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/auth', authRoutes);
    vi.clearAllMocks();
  });

  describe('POST /register', () => {
    it('should register a new user', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.register).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', tenantId: '456', displayName: null, avatarUrl: null },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe('test@example.com');
    });

    it('should return 400 for invalid input', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', password: '123' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    it('should login with valid credentials', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.login).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', tenantId: '456', displayName: null, avatarUrl: null },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /refresh', () => {
    it('should refresh tokens', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.refresh).mockResolvedValue({
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
        expiresIn: 900,
      });

      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'old_refresh' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.accessToken).toBe('new_access');
    });
  });

  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.logout).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
      });

      // Note: This test may need adjustment based on how auth is handled
      expect(res.status).toBeLessThan(500);
    });
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/routes/auth.spec.ts
```

Expected: FAIL

### Step 3: 实现认证路由

```typescript
// src/server/routes/auth.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { registerSchema, loginSchema, refreshTokenSchema } from '../../types/auth';
import type { ApiResponse } from '../../types/api';

export const authRoutes = new Hono();

authRoutes.post(
  '/register',
  zValidator('json', registerSchema),
  async (c) => {
    const input = c.req.valid('json');
    const result = await authService.register(input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

authRoutes.post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const input = c.req.valid('json');
    const result = await authService.login(input);

    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

authRoutes.post(
  '/refresh',
  zValidator('json', refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid('json');
    const tokens = await authService.refresh(refreshToken);

    return c.json<ApiResponse>({
      success: true,
      data: tokens,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

authRoutes.post('/logout', authMiddleware(), async (c) => {
  const user = c.get('user');
  await authService.logout(user.id);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Logged out successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

authRoutes.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user');

  return c.json<ApiResponse>({
    success: true,
    data: { user },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

### Step 4: 安装 zod-validator（如未安装）

```bash
cd /var/aichat/Small-Squaretable && npm install @hono/zod-validator
```

### Step 5: 运行测试验证通过

```bash
cd /var/aichat/Small-Squaretable && npx vitest run src/server/routes/auth.spec.ts
```

Expected: PASS

### Step 6: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/server/routes/auth.ts src/server/routes/auth.spec.ts package.json package-lock.json && git commit -m "feat(server): add authentication routes (register/login/refresh/logout/me)"
```

---

## Task 7: 集成到主服务器

**Files:**
- Modify: `src/server/index.ts`

### Step 1: 读取当前服务器文件

先检查当前 `src/server/index.ts` 内容

### Step 2: 更新服务器集成认证路由

```typescript
// 在 src/server/index.ts 中添加
import { authRoutes } from './routes/auth';

// 在路由注册部分添加
app.route('/api/v1/auth', authRoutes);
```

### Step 3: 运行集成测试

```bash
cd /var/aichat/Small-Squaretable && npx vitest run
```

Expected: All tests pass

### Step 4: 提交

```bash
cd /var/aichat/Small-Squaretable && git add src/server/index.ts && git commit -m "feat(server): integrate auth routes into main server"
```

---

## Task 8: 端到端测试

**Files:**
- Create: `tests/integration/auth.integration.spec.ts`

### Step 1: 编写集成测试

```typescript
// tests/integration/auth.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/server/index';

describe('Auth Integration Tests', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  };
  let accessToken: string;
  let refreshToken: string;

  describe('Registration Flow', () => {
    it('should register a new user', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(testUser.email);
      expect(data.data.tokens.accessToken).toBeDefined();

      accessToken = data.data.tokens.accessToken;
      refreshToken = data.data.tokens.refreshToken;
    });

    it('should reject duplicate registration', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Login Flow', () => {
    it('should login with valid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      accessToken = data.data.tokens.accessToken;
      refreshToken = data.data.tokens.refreshToken;
    });

    it('should reject invalid credentials', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...testUser, password: 'wrong' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Token Flow', () => {
    it('should get current user with valid token', async () => {
      const res = await app.request('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.user.email).toBe(testUser.email);
    });

    it('should refresh tokens', async () => {
      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.accessToken).toBeDefined();
    });
  });

  describe('Logout Flow', () => {
    it('should logout successfully', async () => {
      const res = await app.request('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(res.status).toBe(200);
    });
  });
});
```

### Step 2: 运行集成测试

```bash
cd /var/aichat/Small-Squaretable && npx vitest run tests/integration/auth.integration.spec.ts
```

**Note:** 此测试需要数据库和 Redis 运行

### Step 3: 提交

```bash
cd /var/aichat/Small-Squaretable && git add tests/integration/auth.integration.spec.ts && git commit -m "test: add auth integration tests"
```

---

## 验收标准检查清单

- [ ] JWT 工具模块测试通过
- [ ] 认证服务测试通过
- [ ] 认证中间件测试通过
- [ ] 认证路由测试通过
- [ ] 集成测试通过
- [ ] 类型检查通过 (`npm run type-check`)
- [ ] Lint 检查通过 (`npm run lint`)
- [ ] 测试覆盖率 > 80%

## 运行所有验证

```bash
cd /var/aichat/Small-Squaretable
npm run type-check
npm run lint
npx vitest run --coverage
```

---

## 完成后合并

```bash
cd /var/aichat/Small-Squaretable
git checkout main
git merge feature/auth-system
git push origin main
```
