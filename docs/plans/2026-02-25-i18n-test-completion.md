# Iteration 49: i18n Completion + Test Coverage (国际化完善 + 测试补全)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix remaining hardcoded strings in Vue components, add missing test files for untested source files, and reach 2000+ tests with 0 failures.

**Architecture:** 4 tasks. T1 fixes remaining hardcoded strings. T2 adds tests for untested Vue pages. T3 adds tests for untested services. T4 runs final verification.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Fix remaining hardcoded strings in Vue components

**Files:**
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/components/character/CollaboratorPanel.vue`
- Modify: `src/client/pages/admin/Experiments.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Read each file and find hardcoded strings. Replace them with `t()` calls.

2. In `ChatWindow.vue`, find snapshot expiry labels like `"1 day"`, `"7 days"`, `"30 days"`, `"Never"` and replace with i18n keys under `chat`:
   - en-US: `"oneDay": "1 day"`, `"sevenDays": "7 days"`, `"thirtyDays": "30 days"`, `"never": "Never"`
   - zh-CN: `"oneDay": "1 天"`, `"sevenDays": "7 天"`, `"thirtyDays": "30 天"`, `"never": "永不"`

3. In `CollaboratorPanel.vue`, replace `"User ID or email"` and `"Role"` with i18n keys under `character`:
   - en-US: `"userIdOrEmail": "User ID or email"`, `"collaboratorRole": "Role"`
   - zh-CN: `"userIdOrEmail": "用户 ID 或邮箱"`, `"collaboratorRole": "角色"`

4. In `Experiments.vue`, replace `"CTR"` with i18n key under `admin.experiments`:
   - en-US: `"ctr": "CTR"`
   - zh-CN: `"ctr": "点击率"`

**Tests:** None needed (i18n changes only).

**Commit:** `fix(i18n): replace remaining hardcoded strings with i18n keys`

---

### Task 2: Add tests for untested Vue pages

**Files:**
- Create: `src/client/pages/WorldBooks.spec.ts`
- Create: `src/client/pages/CharacterDetail.spec.ts`

**What to do:**

1. Read `src/client/pages/WorldBooks.vue` and write 2 tests:
   - Renders world books page
   - Shows loading state

2. Read `src/client/pages/CharacterDetail.vue` and write 2 tests:
   - Renders character detail page
   - Shows loading state

Follow existing page test patterns. Use `createPinia()` + `setActivePinia()`, i18n, Element Plus stubs. Mock API services and router.

**Commit:** `test(pages): add WorldBooks and CharacterDetail page tests`

---

### Task 3: Add tests for untested services/composables

**Files:**
- Create: `src/client/services/worldbook.api.spec.ts`
- Create: `src/client/services/push.service.spec.ts`

**What to do:**

1. Read `src/client/services/worldbook.api.ts` and write 3 tests:
   - list() calls correct endpoint
   - create() sends correct data
   - getEntries() calls correct endpoint

2. Read `src/client/services/push.service.ts` and write 2 tests:
   - isSubscribed returns false when PushManager not available
   - subscribe returns false when serviceWorker not available

Mock the `api` module and browser APIs.

**Commit:** `test(services): add worldbook API and push service tests`

---

### Task 4: Final verification

1. Run `npx vitest run` — expect 2005+ tests passing, 0 failures
2. Run `npx tsc --noEmit` — expect 0 errors

**Commit:** None (verification only).
