# Iteration 51: E2E Test Quality Fix + Component Test Coverage (E2E 测试质量修复 + 组件测试补全)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rewrite 12 useless E2E tests with real Playwright assertions, then add verifiable component tests for 5 high-value uncovered pages.

**Architecture:** 5 tasks. T1 rewrites chat-features E2E. T2 rewrites admin-features E2E. T3 adds component tests for ActivityFeed + Home. T4 adds component tests for CharacterEditor + AccountSettings + SecuritySettings. T5 runs final verification.

**Tech Stack:** TypeScript strict, Vue 3, Playwright, Vitest

**Key rule:** Every assertion must be meaningful — `expect(isVisible).toBe(true)` or `await expect(el).toBeVisible()`, NEVER `expect(typeof x).toBe('boolean')`.

---

### Task 1: Rewrite chat-features.spec.ts with real assertions

**Files:**
- Modify: `e2e/chat-features.spec.ts`

**What to do:**

Read the file first. All 6 tests use `expect(typeof isVisible).toBe('boolean')` which always passes. Rewrite each test with real assertions.

The pattern to follow (from the high-quality `e2e/auth.spec.ts` and `e2e/social.spec.ts`):
- Use `await expect(locator).toBeVisible()` for elements that MUST exist
- Use `mockApiResponse()` to mock backend responses so tests don't depend on a running server
- Use real interaction flows (click, type, verify state change)

Rewrite the 6 tests:

1. **message actions menu shows reaction button** — Mock chat messages API. Navigate to chat. Mock a message in the DOM. Hover message. Assert reaction button `await expect(reactionBtn).toBeVisible()`.

2. **message actions menu shows reply button** — Same setup. Assert reply button visible.

3. **message actions menu shows pin button** — Same setup. Assert pin button visible.

4. **message actions menu shows bookmark button** — Same setup. Assert bookmark button visible.

5. **chat header has export option** — Navigate to chat. Assert export button/menu exists in header with `await expect(exportBtn).toBeVisible()`.

6. **chat header has pinned messages button** — Assert pinned messages button exists with `await expect(pinnedBtn).toBeVisible()`.

Since these tests need a chat with messages, use `mockApiResponse` to mock:
- `**/api/v1/auth/me` — return auth user
- `**/api/v1/chats/*` — return a chat object
- `**/api/v1/chats/*/messages*` — return mock messages array

Follow the mocking pattern from `e2e/notifications.spec.ts` which mocks all API responses.

Also fix `character-features.spec.ts` — 3 of its 6 tests use the bad pattern. Change those 3 to use `expect(isVisible).toBe(true)` or skip them with a clear reason if the element genuinely might not exist.

**Commit:** `fix(e2e): rewrite chat and character feature tests with real assertions`

---

### Task 2: Rewrite admin-features.spec.ts with real assertions

**Files:**
- Modify: `e2e/admin-features.spec.ts`

**What to do:**

Read the file first. All 6 tests use `expect(typeof isVisible).toBe('boolean')`. Rewrite with real assertions.

The admin tests already mock API responses — the mocking is fine, but the assertions are useless. Change each:

1. **admin system dashboard loads with stats** — Assert stat cards ARE visible: `await expect(statCard).toBeVisible()`. Also verify the page URL.

2. **admin can view announcement section** — Assert announcement textarea IS visible: `await expect(textarea).toBeVisible()`.

3. **admin user management shows user table** — Assert table IS visible: `await expect(table).toBeVisible()`.

4. **admin GDPR page loads with requests** — Assert table or content IS visible: `await expect(content).toBeVisible()`.

5. **notifications page loads** — Assert notification content IS visible: `await expect(content).toBeVisible()`.

6. **notification bell is visible in header** — Assert bell IS visible: `await expect(bell).toBeVisible()`.

**Commit:** `fix(e2e): rewrite admin feature tests with real assertions`

---

### Task 3: Add component tests for ActivityFeed and Home pages

**Files:**
- Create: `src/client/pages/ActivityFeed.spec.ts`
- Create: `src/client/pages/Home.spec.ts`

**What to do:**

1. Read `src/client/pages/ActivityFeed.vue`. Write 3 component tests:
   - Renders activity feed page
   - Shows loading state initially
   - Shows empty state when no activities

2. Read `src/client/pages/Home.vue`. Write 3 component tests:
   - Renders home page
   - Shows hero section or welcome content
   - Has navigation links/buttons

Follow existing component test patterns (Pinia + i18n + Element Plus stubs). Mock API services and router. All assertions must be real — `expect(wrapper.find('.xxx').exists()).toBe(true)`.

**Commit:** `test(components): add ActivityFeed and Home page tests`

---

### Task 4: Add component tests for CharacterEditor, AccountSettings, SecuritySettings

**Files:**
- Create: `src/client/pages/CharacterEditor.spec.ts`
- Create: `src/client/pages/AccountSettings.spec.ts`
- Create: `src/client/pages/SecuritySettings.spec.ts`

**What to do:**

1. Read `src/client/pages/CharacterEditor.vue`. Write 3 tests:
   - Renders editor page
   - Shows form fields (name input at minimum)
   - Has save/submit button

2. Read `src/client/pages/AccountSettings.vue`. Write 2 tests:
   - Renders account settings page
   - Shows data export or account deletion section

3. Read `src/client/pages/SecuritySettings.vue`. Write 2 tests:
   - Renders security settings page
   - Shows 2FA setup section

Mock API services, router, composables. Use Pinia + i18n + Element Plus stubs.

**Commit:** `test(components): add CharacterEditor, AccountSettings, SecuritySettings tests`

---

### Task 5: Final verification

1. Run `npx vitest run` — expect 2020+ tests passing, 0 failures
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify no `expect(typeof` patterns remain in E2E files: `grep "typeof.*toBe.*boolean" e2e/*.spec.ts` should return 0 results

**Commit:** None (verification only).
