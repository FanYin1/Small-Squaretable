# Security Audit Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 10 security issues found in the audit (1 Critical, 5 High, 4 Medium).

**Architecture:** 4 modules, 10 tasks, ordered by severity.

---

## Context

**Audit findings:**
- Critical: Real API key in `.env`, single JWT secret for access+refresh
- High: Plugin sandbox `import()` escape, CSRF in-memory store, unvalidated plugin execute, unauthenticated file access, `corsOrigins` config bug
- Medium: CSP `unsafe-eval` in production, MFA brute-force risk, unbounded pagination, refresh token single-session

---

### Task 1: Sanitize `.env` and `.env.example`

**Files:**
- Modify: `.env`
- Modify: `.env.example`

**What to do:**
1. Replace the real API key `CUSTOM_LLM_API_KEY=025cd6dd87404a249d1a54538d964a4a.ZzZmF3Y0S48ftjeJ` with a placeholder `CUSTOM_LLM_API_KEY=your-llm-api-key-here`
2. Add `JWT_REFRESH_SECRET` to `.env` with a different placeholder value than `JWT_SECRET`
3. Add `TOTP_ENCRYPTION_KEY` to `.env` with its own placeholder
4. Ensure `.env.example` matches with all three separate secrets documented

**Commit:** `security: sanitize .env credentials and add separate secret placeholders`

---

### Task 2: Separate JWT refresh secret and TOTP encryption key

**Files:**
- Modify: `src/core/config.ts` — Add `jwtRefreshSecret` and `totpEncryptionKey` to Zod schema
- Modify: `src/core/jwt.ts` — Use `config.jwtRefreshSecret` for refresh tokens
- Modify: `src/server/services/totp.service.ts` — Use `config.totpEncryptionKey` instead of deriving from JWT secret

**What to do:**
1. In `config.ts`, add to the Zod schema:
   - `JWT_REFRESH_SECRET: z.string().min(32)` → mapped to `jwtRefreshSecret`
   - `TOTP_ENCRYPTION_KEY: z.string().min(32).optional()` → mapped to `totpEncryptionKey`, falls back to `jwtSecret` for backwards compat
2. In `jwt.ts`, update `getSecretKey()` to accept a `type` parameter. Use `config.jwtRefreshSecret` when type is `refresh`.
3. In `totp.service.ts`, change the encryption key derivation to use `config.totpEncryptionKey ?? config.jwtSecret`

**Commit:** `security: separate JWT refresh secret and TOTP encryption key`

---

### Task 3: Block plugin sandbox `import()` escape

**Files:**
- Modify: `src/server/workers/plugin.worker.ts`

**What to do:**
1. Wrap the plugin code execution to block dynamic `import()`:
   - Before executing via `new Function()`, prepend code that overrides the global `import` meta
   - Or better: scan the plugin code string for `import(` patterns and reject if found
   - Also scan for `require(`, `process.`, `child_process`, `fs`, `net`, `http`, `https`, `dgram`, `cluster`, `worker_threads`
2. Freeze `globalThis` more thoroughly — use `Object.freeze(globalThis)` or iterate and freeze all enumerable properties
3. Block `fetch` by overriding it in the worker scope: `globalThis.fetch = undefined`

**Commit:** `security: block plugin sandbox import() and fetch escape vectors`

---

### Task 4: Add Zod validation to plugin execute endpoint

**Files:**
- Modify: `src/server/routes/plugins.ts`

**What to do:**
1. Add a Zod schema for the `/execute` endpoint:
   ```typescript
   const executePluginSchema = z.object({
     event: z.string().min(1).max(100),
     payload: z.record(z.unknown()).default({}),
   });
   ```
2. Replace `c.req.json()` with `zValidator('json', executePluginSchema)`

**Commit:** `security: add Zod validation to plugin execute endpoint`

---

### Task 5: Add pagination bounds to unvalidated query params

**Files:**
- Modify: `src/server/routes/social.ts` — Add Zod validation for limit/offset on followers, following, favorites, comments endpoints
- Modify: `src/server/routes/chats.ts` — Add bounds to limit/before/after params on GET messages

**What to do:**
1. In `social.ts`, for each endpoint that uses raw `Number()` parsing, add `zValidator('query', ...)` with:
   - `limit: z.coerce.number().int().min(1).max(100).default(20)`
   - `offset: z.coerce.number().int().min(0).default(0)`
2. In `chats.ts`, for GET `/:id/messages`, add bounds:
   - `limit: z.coerce.number().int().min(1).max(100).default(50)`
   - `before/after: z.string().optional()`

**Commit:** `security: add pagination bounds validation to social and chat endpoints`

---

### Task 6: Migrate CSRF store to Redis

**Files:**
- Modify: `src/server/middleware/csrf.ts`

**What to do:**
1. Create a `RedisCsrfStore` class that implements the same interface as `InMemoryCsrfStore`:
   - `set(sessionId, token)` → `redis.set('csrf:{sessionId}', token, { EX: 3600 })`
   - `get(sessionId)` → `redis.get('csrf:{sessionId}')`
   - `delete(sessionId)` → `redis.del('csrf:{sessionId}')`
2. Use `RedisCsrfStore` in production, keep `InMemoryCsrfStore` for test/dev
3. Use constant-time comparison (`crypto.timingSafeEqual`) for token validation
4. Ensure auth routes that need CSRF (logout, resend-verification) are covered

**Commit:** `security: migrate CSRF store to Redis with constant-time comparison`

---

### Task 7: Fix CSP and CORS config

**Files:**
- Modify: `src/server/middleware/security.ts` — Remove `unsafe-eval` from production CSP
- Modify: `src/core/config.ts` — Add `corsOrigins` to Zod schema
- Modify: `src/server/index.ts` — Fix CORS config reference

**What to do:**
1. In `security.ts`, split CSP into dev vs production:
   - Development: keep `unsafe-eval` for Vue HMR
   - Production: remove `unsafe-eval`, use only `'self'` + nonce if needed
2. In `config.ts`, add `CORS_ORIGINS: z.string().default('http://localhost:5173')` → mapped to `corsOrigins`
3. Verify `index.ts` CORS usage works with the new config field

**Commit:** `security: remove CSP unsafe-eval in production, fix CORS config`

---

### Task 8: Add MFA-specific rate limiting

**Files:**
- Modify: `src/server/middleware/rateLimit.ts` — Add `mfaChallengeRateLimit`
- Modify: `src/server/routes/mfa.ts` — Apply the new rate limiter to `/challenge`

**What to do:**
1. Add a new rate limiter in `rateLimit.ts`:
   ```typescript
   export const mfaChallengeRateLimit = rateLimit({
     limit: isDev ? 100 : 5,
     windowMs: 5 * 60 * 1000, // 5 minutes
     keyGenerator: (c) => {
       const body = c.req.raw.clone();
       // Key by mfaToken to prevent per-token brute force
       return `mfa-challenge:${c.req.header('x-forwarded-for') || 'unknown'}`;
     },
     message: 'Too many MFA attempts. Please try again later.',
   });
   ```
2. Apply to the `/challenge` endpoint in `mfa.ts`

**Commit:** `security: add dedicated MFA challenge rate limiter`

---

### Task 9: Secure file upload access

**Files:**
- Modify: `src/server/index.ts` — Add auth check to `/uploads/*` route

**What to do:**
1. Add authentication to the `/uploads/*` static file handler:
   - Extract JWT from `Authorization` header or `token` query param
   - Verify the token is valid
   - Optionally check tenant isolation (file path contains tenant ID)
2. Add `Content-Disposition: inline` for images, `attachment` for other types
3. Add `X-Content-Type-Options: nosniff` header to upload responses
4. Reduce `Cache-Control` max-age to 1 hour for uploaded content (allows invalidation)

**Commit:** `security: add authentication and headers to file upload access`

---

### Task 10: Run tests and update docs

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md`

**What to do:**
1. Run `npx vitest run` to verify all 1337 tests still pass
2. Update ROADMAP.md with 迭代 10 section
3. Update CLAUDE.md status to Iteration 10

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 10 (Security Audit)`
