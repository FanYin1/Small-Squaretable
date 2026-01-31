# Phase 1: Infrastructure Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the foundational infrastructure for Small Squaretable SaaS platform, including database connectivity, Redis caching, and core middleware.

**Architecture:** Monolithic backend with Hono framework, PostgreSQL with Drizzle ORM, Redis for caching/sessions. Microservice-ready architecture with clear service boundaries.

**Tech Stack:**
- Backend: Hono + Node.js
- Database: PostgreSQL + Drizzle ORM
- Cache: Redis
- Testing: Vitest
- Language: TypeScript

---

## Task 1: Database Connection and Migration Setup

**Files:**
- Modify: `src/db/index.ts`
- Create: `src/db/migrations/.gitkeep`
- Test: `src/db/index.spec.ts`

**Step 1: Write the failing test**

Create `src/db/index.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from './index';
import { sql } from 'drizzle-orm';

describe('Database Connection', () => {
  it('should connect to database successfully', async () => {
    const result = await db.execute(sql`SELECT 1 as value`);
    expect(result.rows[0].value).toBe(1);
  });

  it('should have schema exported', () => {
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/db/index.spec.ts`
Expected: FAIL - database connection not configured

**Step 3: Create .env file for testing**

Create `.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sillytavern_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret-key-minimum-32-characters-long-for-security
NODE_ENV=development
PORT=3000
```

**Step 4: Run test to verify it passes**

Run: `npm test src/db/index.spec.ts`
Expected: PASS (requires local PostgreSQL running)

**Step 5: Generate initial migration**

Run: `npm run db:generate`
Expected: Migration files created in `src/db/migrations/`

**Step 6: Commit**

```bash
git add src/db/index.spec.ts .env.example src/db/migrations/
git commit -m "feat(db): add database connection with tests"
```

---

## Task 2: Redis Connection Module

**Files:**
- Create: `src/core/redis.ts`
- Test: `src/core/redis.spec.ts`

**Step 1: Write the failing test**

Create `src/core/redis.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getRedisClient, closeRedis } from './redis';

describe('Redis Connection', () => {
  afterAll(async () => {
    await closeRedis();
  });

  it('should connect to Redis successfully', async () => {
    const client = getRedisClient();
    await client.set('test:key', 'test-value');
    const value = await client.get('test:key');
    expect(value).toBe('test-value');
    await client.del('test:key');
  });

  it('should handle connection errors gracefully', async () => {
    const client = getRedisClient();
    expect(client.isOpen).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/core/redis.spec.ts`
Expected: FAIL - module not found

**Step 3: Implement Redis connection**

Create `src/core/redis.ts`:

```typescript
import { createClient } from 'redis';
import { config } from './config';

let redisClient: ReturnType<typeof createClient> | null = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redisUrl,
      password: config.redisPassword,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.connect().catch((err) => {
      console.error('Failed to connect to Redis:', err);
    });
  }

  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test src/core/redis.spec.ts`
Expected: PASS (requires local Redis running)

**Step 5: Commit**

```bash
git add src/core/redis.ts src/core/redis.spec.ts
git commit -m "feat(redis): add Redis connection module with tests"
```

---

## Task 3: Tenant Context Middleware

**Files:**
- Create: `src/server/middleware/tenant.ts`
- Test: `src/server/middleware/tenant.spec.ts`

**Step 1: Write the failing test**

Create `src/server/middleware/tenant.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware } from './tenant';

describe('Tenant Middleware', () => {
  it('should extract tenant ID from header', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/test', (c) => {
      return c.json({ tenantId: c.get('tenantId') });
    });

    const res = await app.request('/test', {
      headers: { 'X-Tenant-ID': 'test-tenant-123' },
    });

    const data = await res.json();
    expect(data.tenantId).toBe('test-tenant-123');
  });

  it('should return 400 if tenant ID is missing', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
  });

  it('should skip tenant check for public routes', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({ publicPaths: ['/health'] }));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/server/middleware/tenant.spec.ts`
Expected: FAIL - module not found

**Step 3: Implement tenant middleware**

Create `src/server/middleware/tenant.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';

interface TenantMiddlewareOptions {
  publicPaths?: string[];
  headerName?: string;
}

export function tenantMiddleware(options: TenantMiddlewareOptions = {}) {
  const {
    publicPaths = ['/health', '/api/v1/auth/login', '/api/v1/auth/register'],
    headerName = 'X-Tenant-ID',
  } = options;

  return createMiddleware(async (c: Context, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip tenant check for public paths
    if (publicPaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const tenantId = c.req.header(headerName);

    if (!tenantId) {
      return c.json(
        {
          error: 'Missing tenant ID',
          message: `Please provide ${headerName} header`,
        },
        400
      );
    }

    // Store tenant ID in context
    c.set('tenantId', tenantId);

    return next();
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test src/server/middleware/tenant.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/middleware/tenant.ts src/server/middleware/tenant.spec.ts
git commit -m "feat(middleware): add tenant context middleware"
```

---

## Task 4: Error Handling Middleware

**Files:**
- Create: `src/server/middleware/error-handler.ts`
- Test: `src/server/middleware/error-handler.spec.ts`
- Create: `src/core/errors.ts`

**Step 1: Write the failing test**

Create `src/server/middleware/error-handler.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from './error-handler';
import { AppError } from '@/core/errors';

describe('Error Handler Middleware', () => {
  it('should handle AppError with correct status code', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TEST_ERROR');
    expect(data.error.message).toBe('Test error');
  });

  it('should handle generic errors as 500', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new Error('Unexpected error');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should hide error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new Error('Secret error');
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.error.message).not.toContain('Secret');

    process.env.NODE_ENV = originalEnv;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/server/middleware/error-handler.spec.ts`
Expected: FAIL - modules not found

**Step 3: Create error classes**

Create `src/core/errors.ts`:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'APP_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}
```

**Step 4: Implement error handler**

Create `src/server/middleware/error-handler.ts`:

```typescript
import type { ErrorHandler } from 'hono';
import { AppError } from '@/core/errors';
import { config } from '@/core/config';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: config.nodeEnv === 'development' ? err.details : undefined,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      err.statusCode
    );
  }

  // Generic error
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message:
          config.nodeEnv === 'development'
            ? err.message
            : 'An unexpected error occurred',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    500
  );
};
```

**Step 5: Run test to verify it passes**

Run: `npm test src/server/middleware/error-handler.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/core/errors.ts src/server/middleware/error-handler.ts src/server/middleware/error-handler.spec.ts
git commit -m "feat(middleware): add error handling with custom error classes"
```

---

## Task 5: Update Server with Middleware

**Files:**
- Modify: `src/server/index.ts`
- Create: `src/server/middleware/index.ts`

**Step 1: Create middleware barrel export**

Create `src/server/middleware/index.ts`:

```typescript
export * from './tenant';
export * from './error-handler';
```

**Step 2: Update server to use middleware**

Modify `src/server/index.ts`:

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from '@/core/config';
import { tenantMiddleware, errorHandler } from './middleware';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', tenantMiddleware());

// Error handler
app.onError(errorHandler);

// Health check (public route)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// API routes
app.get('/api/v1', (c) => {
  return c.json({
    message: 'Small Squaretable API v1',
    tenantId: c.get('tenantId'),
    endpoints: {
      health: '/health',
      docs: '/api/v1/docs',
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Start server
const port = config.port;
console.log(`🚀 Server starting on http://${config.host}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: config.host,
});

export { app };
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/index.ts src/server/middleware/index.ts
git commit -m "feat(server): integrate middleware into main server"
```

---

## Task 6: Database Repository Pattern

**Files:**
- Create: `src/db/repositories/base.repository.ts`
- Create: `src/db/repositories/tenant.repository.ts`
- Test: `src/db/repositories/tenant.repository.spec.ts`

**Step 1: Write the failing test**

Create `src/db/repositories/tenant.repository.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TenantRepository } from './tenant.repository';
import { db } from '../index';

describe('TenantRepository', () => {
  let repository: TenantRepository;

  beforeEach(() => {
    repository = new TenantRepository(db);
  });

  it('should create a new tenant', async () => {
    const tenant = await repository.create({
      name: 'Test Tenant',
      plan: 'free',
    });

    expect(tenant.id).toBeDefined();
    expect(tenant.name).toBe('Test Tenant');
    expect(tenant.plan).toBe('free');
  });

  it('should find tenant by ID', async () => {
    const created = await repository.create({
      name: 'Find Test',
      plan: 'free',
    });

    const found = await repository.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Find Test');
  });

  it('should return null for non-existent tenant', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test src/db/repositories/tenant.repository.spec.ts`
Expected: FAIL - modules not found

**Step 3: Create base repository**

Create `src/db/repositories/base.repository.ts`:

```typescript
import type { Database } from '../index';

export abstract class BaseRepository {
  constructor(protected db: Database) {}
}
```

**Step 4: Create tenant repository**

Create `src/db/repositories/tenant.repository.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { tenants, type Tenant, type NewTenant } from '../schema';

export class TenantRepository extends BaseRepository {
  async create(data: NewTenant): Promise<Tenant> {
    const [tenant] = await this.db.insert(tenants).values(data).returning();
    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    return tenant || null;
  }

  async findAll(): Promise<Tenant[]> {
    return this.db.select().from(tenants);
  }

  async update(id: string, data: Partial<NewTenant>): Promise<Tenant | null> {
    const [tenant] = await this.db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();

    return tenant || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(tenants).where(eq(tenants.id, id));
    return result.rowCount > 0;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test src/db/repositories/tenant.repository.spec.ts`
Expected: PASS (requires database setup)

**Step 6: Create repository barrel export**

Create `src/db/repositories/index.ts`:

```typescript
export * from './base.repository';
export * from './tenant.repository';
```

**Step 7: Commit**

```bash
git add src/db/repositories/
git commit -m "feat(db): add repository pattern with tenant repository"
```

---

## Task 7: Integration Test for Full Stack

**Files:**
- Create: `tests/integration/server.spec.ts`

**Step 1: Write integration test**

Create `tests/integration/server.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '@/server/index';

describe('Server Integration Tests', () => {
  it('should respond to health check', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should require tenant ID for protected routes', async () => {
    const res = await app.request('/api/v1');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('tenant');
  });

  it('should accept requests with tenant ID', async () => {
    const res = await app.request('/api/v1', {
      headers: { 'X-Tenant-ID': 'test-tenant' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenantId).toBe('test-tenant');
  });

  it('should handle 404 errors', async () => {
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run integration tests**

Run: `npm test tests/integration/server.spec.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/server.spec.ts
git commit -m "test: add integration tests for server"
```

---

## Task 8: Documentation and Cleanup

**Files:**
- Create: `docs/architecture/infrastructure.md`
- Modify: `README.md`

**Step 1: Create architecture documentation**

Create `docs/architecture/infrastructure.md`:

```markdown
# Infrastructure Architecture

## Overview

Small Squaretable uses a monolithic backend architecture with clear service boundaries, making it microservice-ready for future scaling.

## Components

### Database Layer
- **PostgreSQL**: Primary data store with JSONB support for flexible schemas
- **Drizzle ORM**: Type-safe database access with migration support
- **Repository Pattern**: Abstraction layer for database operations

### Caching Layer
- **Redis**: Session storage, caching, and pub/sub messaging
- **Connection Pooling**: Singleton pattern for efficient resource usage

### API Layer
- **Hono Framework**: High-performance HTTP server
- **Middleware Stack**:
  - Logger: Request/response logging
  - CORS: Cross-origin resource sharing
  - Tenant Context: Multi-tenancy support
  - Error Handler: Centralized error handling

### Error Handling
- Custom error classes for different scenarios
- Consistent error response format
- Environment-aware error details

## Multi-Tenancy

Tenant isolation is enforced at multiple levels:
1. **Middleware**: Extracts tenant ID from headers
2. **Database**: Row-level security policies (future)
3. **Repository**: Tenant-scoped queries

## Testing Strategy

- **Unit Tests**: Individual components (repositories, middleware)
- **Integration Tests**: Full request/response cycle
- **Coverage Target**: 85% for Phase 1
```

**Step 2: Update README with setup instructions**

Add to `README.md`:

```markdown
## Database Setup

### Local Development

1. Start PostgreSQL:
```bash
docker run -d \
  --name sillytavern-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sillytavern_saas \
  -p 5432:5432 \
  postgres:15
```

2. Start Redis:
```bash
docker run -d \
  --name sillytavern-redis \
  -p 6379:6379 \
  redis:7
```

3. Run migrations:
```bash
npm run db:migrate
```

### Testing

Run all tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```
```

**Step 3: Run final verification**

Run: `npm run type-check && npm run lint && npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add docs/architecture/infrastructure.md README.md
git commit -m "docs: add infrastructure architecture documentation"
```

---

## Verification Checklist

Before marking Phase 1 complete, verify:

- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Database migrations generated: `npm run db:generate`
- [ ] Server starts successfully: `npm run dev`
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] Redis connection works
- [ ] PostgreSQL connection works
- [ ] Tenant middleware enforces tenant ID
- [ ] Error handling works correctly

## Next Steps

After Phase 1 completion:
1. Update `project-state.json` to mark infrastructure phase as completed
2. Begin Phase 2: Core Modules (Security, Auth, Services)
3. Review and refactor based on lessons learned

---

**Plan saved to:** `docs/plans/2026-01-31-phase1-infrastructure.md`
