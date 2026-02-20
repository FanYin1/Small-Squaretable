# Dependency Upgrade + Vulnerability Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 66 npm vulnerabilities and upgrade major dependencies (drizzle, redis, jose, bcrypt, vite, vitest) to latest versions.

**Architecture:** 3 modules in risk order. M1 removes the root cause of 60+ vulnerabilities (unmaintained `vite-plugin-imagemin`), upgrades `bcrypt` to fix `tar` vuln, and runs `npm audit fix`. M2 upgrades semver-compatible deps. M3 upgrades major versions one-by-one with test verification after each.

**Tech Stack:** npm, vitest, drizzle-orm, redis, jose, bcrypt, vite, vitest

---

## Context

**Current state:**
- 66 npm vulnerabilities (1 low, 10 moderate, 55 high)
- Root cause: `vite-plugin-imagemin@0.6.1` (unmaintained) pulls in 55+ vulnerable transitive deps
- `bcrypt@5.1.1` → `tar@6.2.1` (1 high vuln)
- `eslint@9` → `ajv` (moderate) — will NOT fix (requires eslint 10, too risky)
- 1412 unit tests passing, 0 failures

**Major upgrades available:**
- `drizzle-orm` 0.38 → 0.45 + `drizzle-kit` 0.30 → 0.31 (57 files import drizzle-orm)
- `redis` 4 → 5 (2 files: `src/core/redis.ts`, `src/server/services/health.ts`)
- `jose` 5 → 6 (1 file: `src/core/jwt.ts`)
- `bcrypt` 5 → 6 (auth.service.ts, totp.service.ts)
- `vite` 6 → 7 + `vitest` 2 → 4 (build toolchain)

---

### Task 1: Remove `vite-plugin-imagemin` (fixes 55+ vulnerabilities)

**Files:**
- Modify: `package.json` — remove `vite-plugin-imagemin` from devDependencies
- Modify: `vite.config.ts` — remove imagemin plugin block

**What to do:**
1. Remove `vite-plugin-imagemin` from `package.json` devDependencies
2. In `vite.config.ts`, delete the entire try/catch block that loads `vite-plugin-imagemin` (lines ~24-44)
3. Run `npm install` to update lockfile
4. Run `npx vitest run` — all 1412 tests should pass
5. Run `npm audit` — should drop from 66 to ~11 vulnerabilities

**Commit:** `chore: remove unmaintained vite-plugin-imagemin (fixes 55+ vulnerabilities)`

---

### Task 2: Upgrade `bcrypt` 5 → 6 (fixes tar vulnerability)

**Files:**
- Modify: `package.json` — bump bcrypt and @types/bcrypt to ^6.0.0

**What to do:**
1. Run `npm install bcrypt@^6.0.0 @types/bcrypt@^6.0.0`
2. Run `npx vitest run` — all tests should pass (bcrypt 6 is API-compatible)
3. Run `npm audit` — tar vulnerability should be gone

**Commit:** `chore: upgrade bcrypt 5→6 (fixes tar vulnerability)`

---

### Task 3: Run `npm audit fix` for remaining safe fixes

**What to do:**
1. Run `npm audit fix` (without --force)
2. Run `npx vitest run` — all tests should pass
3. Run `npm audit` — check remaining count

**Commit:** `chore: npm audit fix for remaining safe vulnerability patches`

---

### Task 4: Upgrade semver-compatible dependencies (M2)

**Files:**
- Modify: `package.json`

**What to do:**
1. Run:
   ```bash
   npm install hono@latest stripe@latest dotenv@latest marked@latest @playwright/test@latest @typescript-eslint/eslint-plugin@latest @typescript-eslint/parser@latest typescript-eslint@latest @vitejs/plugin-vue@latest @types/nodemailer@latest
   ```
   (These are all within `^` semver range or minor bumps)
2. Run `npx vitest run` — all tests should pass
3. Verify no breaking changes in test output

**Commit:** `chore: upgrade semver-compatible dependencies`

---

### Task 5: Upgrade `jose` 5 → 6

**Files:**
- Modify: `package.json` — bump jose to ^6.1.3
- Possibly modify: `src/core/jwt.ts` — check for API changes

**What to do:**
1. Check jose 6 changelog for breaking changes (main change: ESM-only, which we already use)
2. Run `npm install jose@^6.1.3`
3. Run `npx vitest run` — focus on auth-related tests
4. If any imports or API calls changed, update `src/core/jwt.ts`

**Commit:** `chore: upgrade jose 5→6`

---

### Task 6: Upgrade `redis` 4 → 5

**Files:**
- Modify: `package.json` — bump redis to ^5.11.0
- Possibly modify: `src/core/redis.ts` — check for API changes
- Possibly modify: `src/server/services/health.ts` — check redis health check

**What to do:**
1. Check redis 5 changelog (main change: `createClient` options may differ)
2. Run `npm install redis@^5.11.0`
3. Run `npx vitest run` — focus on cache/redis-related tests
4. If `createClient` API changed, update `src/core/redis.ts`
5. Check `src/server/services/health.ts` redis ping still works

**Commit:** `chore: upgrade redis 4→5`

---

### Task 7: Upgrade `drizzle-orm` 0.38 → 0.45 + `drizzle-kit` 0.30 → 0.31

**Files:**
- Modify: `package.json` — bump drizzle-orm and drizzle-kit
- Possibly modify: 57 files that import from drizzle-orm (schema + repositories)

**What to do:**
1. Check drizzle-orm changelog for breaking changes between 0.38 and 0.45
2. Run `npm install drizzle-orm@^0.45.1 drizzle-kit@^0.31.9`
3. Run `npx vitest run` — this is the highest-risk upgrade, watch for:
   - Schema definition changes
   - Query builder API changes
   - Type inference changes
4. Fix any compilation or test failures
5. Run `npm run db:generate` to verify migration generation still works

**Commit:** `chore: upgrade drizzle-orm 0.38→0.45 + drizzle-kit 0.30→0.31`

---

### Task 8: Upgrade `vite` 6 → 7 + `vitest` 2 → 4

**Files:**
- Modify: `package.json` — bump vite, vitest, @vitest/coverage-v8
- Possibly modify: `vite.config.ts` — check for config API changes
- Possibly modify: `vitest.config.ts` or `vite.config.ts` test section

**What to do:**
1. Check vite 7 and vitest 4 changelogs for breaking changes
2. Run `npm install vite@^7.3.1 vitest@^4.0.18 @vitest/coverage-v8@^4.0.18`
3. Run `npx vitest run` — watch for:
   - Config format changes
   - Test runner behavior changes
   - Coverage reporter changes
4. Fix any failures
5. Run `npm run build` to verify production build still works

**Commit:** `chore: upgrade vite 6→7 + vitest 2→4`

---

### Task 9: Final audit + docs update

**Files:**
- Modify: `ROADMAP.md` — add 迭代 12 section
- Modify: `CLAUDE.md` — update status

**What to do:**
1. Run `npm audit` — document remaining vulnerabilities (if any)
2. Run `npx vitest run` — confirm all tests pass
3. Run `npm outdated` — confirm major upgrades are done
4. Update ROADMAP.md with 迭代 12 section
5. Update CLAUDE.md status to Iteration 12

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 12 (Dependency Upgrade)`
