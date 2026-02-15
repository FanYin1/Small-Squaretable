# Test Suite Full Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 37 failing test files (92 failing tests) to achieve ≥97% pass rate without requiring external infrastructure (PostgreSQL, Redis, ML service).

**Architecture:** Six modules — M1 installs vue-i18n and configures it for both runtime and tests, M2 removes broken test-setup imports, M3 creates missing stub files (worldbook repository + worldinfo engine), M4 fixes logger regression tests (console.error → structured logger), M5 mocks DB-dependent tests, M6 isolates integration tests and excludes ml-service.

**Tech Stack:** Vitest, vue-i18n, Drizzle ORM mocks, Hono.js test helpers

---

## M1: vue-i18n Infrastructure

### Task 1: Install vue-i18n and configure i18n plugin

**Files:**
- Create: `src/client/i18n/index.ts`
- Modify: `src/client/main.ts`
- Modify: `package.json` (via npm install)

**Step 1: Install vue-i18n**

Run: `npm install vue-i18n@10`

**Step 2: Create i18n configuration**

Create `src/client/i18n/index.ts`:

```typescript
import { createI18n } from 'vue-i18n';
import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'en-US',
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
  },
});

export default i18n;
```

**Step 3: Register in main.ts**

Add after the ElementPlus registration:

```typescript
import i18n from './i18n';
app.use(i18n);
```

**Step 4: Commit**

```bash
git add package.json package-lock.json src/client/i18n/index.ts src/client/main.ts
git commit -m "feat: install vue-i18n and configure i18n plugin with en-US/zh-CN"
```

<!-- PLAN_CONTINUE -->

---

## M2: Clean Up Broken test-setup Imports

### Task 2: Remove redundant test-setup imports from 8 client test files

**Files:**
- Modify: `src/client/stores/ui.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/stores/character.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/stores/chat.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/stores/subscription.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/stores/user.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/services/api.spec.ts` — delete `import '../test-setup';`
- Modify: `src/client/services/websocket.spec.ts` — delete `import '../test-setup';` (if present)
- Modify: `src/client/pages/auth/Login.spec.ts` — delete `import '../../test-setup';`
- Modify: `src/client/pages/auth/Register.spec.ts` — delete `import '../../test-setup';`

**Step 1: Remove all broken imports**

The vitest config already has `setupFiles: ['./src/test-setup.ts']` which runs automatically. These manual imports use wrong relative paths and cause `Failed to resolve import` errors.

For each file, delete the line containing `import '../test-setup'` or `import '../../test-setup'`.

**Step 2: Run affected tests**

Run: `npx vitest run src/client/stores/ src/client/services/api.spec.ts src/client/pages/auth/`

**Step 3: Commit**

```bash
git add src/client/stores/*.spec.ts src/client/services/api.spec.ts src/client/services/websocket.spec.ts src/client/pages/auth/*.spec.ts
git commit -m "fix: remove broken test-setup imports (vitest setupFiles handles this)"
```

---

## M3: Create Missing Stub Files

### Task 3: Create worldbook.repository.ts stub

**Files:**
- Create: `src/db/repositories/worldbook.repository.ts`

**Step 1: Create minimal stub**

The `src/server/routes/characters.ts:28` imports `worldBookRepository` from `../../db/repositories/worldbook.repository`. The schema exists at `src/db/schema/worldbooks.ts`. Create a minimal repository that exports the expected symbol.

Read `src/db/schema/worldbooks.ts` first to understand the schema, then create:

```typescript
import { db } from '../index';

export const worldBookRepository = {
  // Stub — full implementation deferred
};
```

Match the actual usage in `characters.ts` to determine which methods are called, and add stubs for those.

**Step 2: Commit**

```bash
git add src/db/repositories/worldbook.repository.ts
git commit -m "fix: create worldbook.repository stub to unblock characters route import"
```

### Task 4: Create worldinfo-engine.service.ts stub

**Files:**
- Create: `src/server/services/worldinfo-engine.service.ts`

**Step 1: Create minimal stub**

The `src/server/services/chat.service.ts` imports from `./worldinfo-engine.service`. Read `chat.service.ts` to find what's imported, then create a stub that exports those symbols.

**Step 2: Commit**

```bash
git add src/server/services/worldinfo-engine.service.ts
git commit -m "fix: create worldinfo-engine.service stub to unblock chat service import"
```

---

## M4: Fix Logger Regression Tests

### Task 5: Fix usage-tracking.spec.ts console.error → logger

**Files:**
- Modify: `src/server/middleware/usage-tracking.spec.ts`

**Step 1: Read the file and identify all `consoleErrorSpy` / `console.error` spy assertions**

The usage-tracking middleware was updated in Iter6 to use structured logging. Tests still spy on `console.error`. Fix pattern:

Add hoisted logger mock at top:
```typescript
const { mockUsageLoggerError } = vi.hoisted(() => ({
  mockUsageLoggerError: vi.fn(),
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: mockUsageLoggerError,
    }),
  },
}));
```

Replace all `consoleErrorSpy` assertions with `mockUsageLoggerError` assertions. Update the expected message format (remove trailing colon if the logger call changed format).

**Step 2: Run test**

Run: `npx vitest run src/server/middleware/usage-tracking.spec.ts`

**Step 3: Commit**

```bash
git add src/server/middleware/usage-tracking.spec.ts
git commit -m "fix: update usage-tracking tests for structured logging"
```

### Task 6: Fix jobs.spec.ts console.log → logger

**Files:**
- Modify: `src/server/jobs/jobs.spec.ts`

**Step 1: Read the file, find the failing test**

The `gdpr-deletion logs when count > 0` test likely spies on `console.log`. Add logger mock and update assertion.

**Step 2: Run test**

Run: `npx vitest run src/server/jobs/jobs.spec.ts`

**Step 3: Commit**

```bash
git add src/server/jobs/jobs.spec.ts
git commit -m "fix: update jobs tests for structured logging"
```

---

## M5: Fix DB-Dependent and Mock-Mismatch Tests

### Task 7: Fix DB repository tests (7 files) — add proper mocks

**Files:**
- Modify: `src/db/repositories/comment.repository.spec.ts`
- Modify: `src/db/repositories/favorite.repository.spec.ts`
- Modify: `src/db/repositories/notification.repository.spec.ts`
- Modify: `src/db/repositories/rating.repository.spec.ts`
- Modify: `src/db/repositories/tenant.repository.spec.ts`
- Modify: `src/db/repositories/webhook.repository.spec.ts`
- Modify: `src/db/repositories/memory.repository.spec.ts` (if still failing)

**Step 1: Read each file to understand the test pattern**

These tests directly import from `../index` which connects to PostgreSQL. They need `vi.mock('../index', ...)` to mock the DB connection.

For each file:
1. Read the test file
2. Add `vi.mock('../index', ...)` with a mock `db` object that chains `.select()`, `.from()`, `.where()`, `.insert()`, `.update()`, `.delete()` etc.
3. Mock the schema imports if needed
4. Run the individual test file to verify

**Step 2: Run all repository tests**

Run: `npx vitest run src/db/repositories/`

**Step 3: Commit**

```bash
git add src/db/repositories/*.spec.ts
git commit -m "fix: mock DB connection in repository unit tests"
```

### Task 8: Fix auth.service.spec.ts and search.service.spec.ts (DB connection)

**Files:**
- Modify: `src/server/services/auth.service.spec.ts`
- Modify: `src/server/services/search.service.spec.ts`

**Step 1: Read each file**

`auth.service.spec.ts` already mocks `user.repository` but one test still hits DB (likely through a transitive import). Add missing mocks for any DB-touching imports.

`search.service.spec.ts` needs DB mock for the search queries.

**Step 2: Run tests**

Run: `npx vitest run src/server/services/auth.service.spec.ts src/server/services/search.service.spec.ts`

**Step 3: Commit**

```bash
git add src/server/services/auth.service.spec.ts src/server/services/search.service.spec.ts
git commit -m "fix: add missing DB mocks to auth and search service tests"
```

### Task 9: Fix rating.service.spec.ts (timeout + DB)

**Files:**
- Modify: `src/server/services/rating.service.spec.ts`

**Step 1: Read the file**

12 tests fail — likely missing mocks for the rating repository and/or character repository. One test has a 10s timeout. Add proper mocks and ensure async operations resolve.

**Step 2: Run test**

Run: `npx vitest run src/server/services/rating.service.spec.ts`

**Step 3: Commit**

```bash
git add src/server/services/rating.service.spec.ts
git commit -m "fix: add proper mocks to rating service tests"
```

### Task 10: Fix subscriptions.spec.ts mock mismatch

**Files:**
- Modify: `src/server/routes/subscriptions.spec.ts`

**Step 1: Read the file**

1 test fails — `data.data.subscription` doesn't match `mockSubscription`. The subscription service was updated in Iter6 to use `config.stripeSecretKey` instead of `process.env`. The mock may need updating.

**Step 2: Run test**

Run: `npx vitest run src/server/routes/subscriptions.spec.ts`

**Step 3: Commit**

```bash
git add src/server/routes/subscriptions.spec.ts
git commit -m "fix: update subscription route test mock for config-based Stripe"
```

### Task 11: Fix usage.spec.ts tenant isolation tests

**Files:**
- Modify: `src/server/routes/usage.spec.ts`

**Step 1: Read the file**

2 tests fail — tenant isolation assertions expect `quotaCalls` to contain tenant IDs but get empty array. The usage tracking middleware was updated. Check if the mock setup needs updating.

**Step 2: Run test**

Run: `npx vitest run src/server/routes/usage.spec.ts`

**Step 3: Commit**

```bash
git add src/server/routes/usage.spec.ts
git commit -m "fix: update usage route tenant isolation test mocks"
```

### Task 12: Fix jwt.spec.ts expired token test

**Files:**
- Modify: `src/core/jwt.spec.ts`

**Step 1: Read the file**

1 test fails — `should throw on expired token`. Likely a timing issue with fake timers or the token expiry check. Read and fix.

**Step 2: Run test**

Run: `npx vitest run src/core/jwt.spec.ts`

**Step 3: Commit**

```bash
git add src/core/jwt.spec.ts
git commit -m "fix: update JWT expired token test"
```

### Task 13: Fix redis.spec.ts and db/index.spec.ts (infrastructure tests)

**Files:**
- Modify: `src/core/redis.spec.ts`
- Modify: `src/db/index.spec.ts`

**Step 1: Read each file**

These tests try to connect to real Redis/PostgreSQL. They should either:
- Mock the connection, OR
- Skip when infrastructure is unavailable (`describe.skipIf(!process.env.REDIS_URL)`)

Prefer mocking for unit tests. Add `vi.mock` for the connection modules.

**Step 2: Run tests**

Run: `npx vitest run src/core/redis.spec.ts src/db/index.spec.ts`

**Step 3: Commit**

```bash
git add src/core/redis.spec.ts src/db/index.spec.ts
git commit -m "fix: mock Redis/DB connections in infrastructure unit tests"
```

---

## M6: Test Isolation & Exclusions

### Task 14: Exclude ml-service and integration tests from unit test runs

**Files:**
- Modify: `vitest.config.ts`

**Step 1: Update vitest exclude list**

Add to the `exclude` array:
```typescript
exclude: [
  'node_modules/**',
  'dist/**',
  'e2e/**',
  'ml-service/**',           // ML service has its own test runner
  'tests/integration/**',    // Integration tests need real infrastructure
],
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ml-service and integration tests no longer appear in results.

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "fix: exclude ml-service and integration tests from unit test runs"
```

---

## M7: Validation & Documentation

### Task 15: Run full test suite and fix remaining regressions

**Step 1: Run all tests**

Run: `npx vitest run`

**Step 2: Fix any remaining failures**

Address any test failures not covered by Tasks 1-14.

**Step 3: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: resolve remaining test regressions"
```

### Task 16: Update CLAUDE.md and ROADMAP.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `ROADMAP.md`

**Step 1: Update CLAUDE.md**

- Update status line to "Iteration 7 Complete (Test Suite Fix)"
- Add Iteration 7 section with summary of fixes
- Update unit test count

**Step 2: Update ROADMAP.md**

- Add 迭代 7 progress bar and section
- Update overall completion and timeline

**Step 3: Commit**

```bash
git add CLAUDE.md ROADMAP.md
git commit -m "docs: update CLAUDE.md and ROADMAP.md for Iteration 7 completion"
```
