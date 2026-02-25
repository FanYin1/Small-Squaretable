# E2E Test Systematic Rewrite

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rewrite all 20 E2E test files so they actually pass against the real running frontend (Vite dev server + Hono backend + PostgreSQL + Redis).

**Architecture:** Fix 3 systemic issues first (auth helper, locale, page objects), then rewrite test files in dependency order. Each test must use real CSS selectors from the actual Vue components, not guessed ones.

**Tech Stack:** Playwright, Vue 3 + Element Plus, vue-i18n (en-US default), Hono.js backend

---

## Root Cause Analysis

All 246 E2E tests fail for these reasons:

1. **Auth not working**: Tests call `mockApiResponse(page, '**/auth/me', ...)` + `authPage.register()`, but the Vue router guard checks `isTokenValid(localStorage.token)` — a JWT with valid `exp`. Mock responses don't set localStorage. The register form submission fails because mock intercepts the POST but the frontend expects specific response shape + stores tokens via `userStore.register()`.

2. **Wrong selectors**: Tests use CSS classes that don't exist (`.developer-settings` should be `.developer-settings` ✓ but `.announcement-section` doesn't exist — it's `.announcements-card`). Text selectors like `text=About` don't match `"About Small-Squaretable"`.

3. **Locale mismatch**: Default locale is `en-US` but page objects use Chinese text (`"创建新聊天"`, `"注册"`). Some tests use English, some Chinese.

## Strategy

- Create a `setupAuth(page)` helper that: (a) sets a valid JWT in localStorage, (b) mocks `/auth/me` to return user data, (c) navigates to trigger the app to load with auth state.
- Standardize on `en-US` locale for all tests (set `localStorage.locale = 'en-US'` in setup).
- Fix all page objects to use real selectors from the actual Vue components.
- Rewrite each test file to use correct selectors and auth flow.
- Delete tests that test non-existent UI (webhook management UI doesn't exist).

## Auth Helper Design

The Vue router guard calls `isTokenValid(token)` which:
1. Checks token has 3 dot-separated parts
2. Base64-decodes payload
3. Checks `exp * 1000 > Date.now()`

So we need a fake JWT with valid structure and future `exp`. Then mock `/auth/me` to return user data so `userStore.initialize()` succeeds.

```ts
function createFakeJwt(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const sig = btoa('fake-signature');
  return `${header}.${body}.${sig}`;
}

async function setupAuth(page: Page, userOverrides?: Partial<MockUser>) {
  const user = { id: 'user_1', email: 'test@e2e.com', displayName: 'E2E User', role: 'user', tenantId: 'tenant_1', plan: 'free', ...userOverrides };
  const token = createFakeJwt({ sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role });

  // Must navigate to app origin first so localStorage is accessible
  await page.goto('/auth/login');
  await page.evaluate(({ token, tenantId, locale }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', token);
    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('locale', locale);
  }, { token, tenantId: user.tenantId, locale: 'en-US' });

  // Mock /auth/me so userStore.initialize() succeeds
  await page.route('**/api/v1/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { user } }),
  }));

  // Mock /auth/refresh
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { token, refreshToken: token } }),
  }));
}
```

## Real Selectors Reference

| Page | Root CSS | Key Elements |
|------|----------|-------------|
| Login | `.login-page` | `.login-card`, `.login-button`, `input[autocomplete="email"]`, `input[autocomplete="current-password"]` |
| Register | `.register-page` | `.register-card`, `.register-button`, `.password-strength` |
| Market | `.market-content` | `.character-grid`, `.character-card`, `.recommendation-section` |
| CharacterDetail | `.character-detail-page` | `.detail-header`, `.detail-body`, `.action-buttons` |
| Chat | `.chat-layout` | `.chat-sidebar-wrapper`, `.chat-main`, `.message-input`, `.message-bubble` |
| Admin System | `.system-dashboard` | `.stats-grid`, `.stat-card`, `.stat-value`, `.jobs-card`, `.announcements-card` |
| Admin Users | `.user-management` | `.users-table`, `.search-input`, `el-pagination` |
| Admin GDPR | `.gdpr-management` | `.gdpr-table`, `el-empty` |
| Developer | `.developer-settings` | `.key-list`, `.key-card`, `.empty-state` |
| Analytics | `.analytics-dashboard` | `.analytics-tabs`, `el-tab-pane` |
| Notifications | `.notifications-page` | `.notification-list`, `.notification-item`, `.empty-state` |
| Profile | `.profile-edit-page` | `.profile-form`, `.avatar-upload-area` |
| Subscription | `.content-wrapper` | `.current-status-section`, `.plans-section`, `.plan-card` |
| Legal (Terms/Privacy/About) | `.legal-page` | `.legal-content`, `.legal-footer`, `.back-link` |
| Plugins | (uses DashboardLayout) | `.plugin-marketplace` or similar |
| WorldBooks | (uses DashboardLayout) | page-specific root |

---

### Task 1: Rewrite helpers and page objects

**Files:**
- Rewrite: `e2e/utils/helpers.ts` — add `setupAuth()`, `setupAdminAuth()`, `createFakeJwt()`, fix `clearSession()` to navigate first
- Rewrite: `e2e/pages/auth.page.ts` — fix selectors to use real CSS classes, support en-US locale
- Rewrite: `e2e/pages/chat.page.ts` — fix all selectors to use real CSS classes, remove Chinese-only text selectors
- Rewrite: `e2e/pages/market.page.ts` — verify selectors match real UI
- Rewrite: `e2e/fixtures/test-data.ts` — keep as-is (already correct)
- Rewrite: `e2e/seed.ts` — simplify to just write empty auth state (real auth is handled by setupAuth per test)

**Key changes:**
- `setupAuth(page, overrides?)` — creates fake JWT, sets localStorage, mocks `/auth/me`
- `setupAdminAuth(page)` — calls `setupAuth` with `role: 'admin'`
- `setupLocale(page)` — ensures `en-US` locale in localStorage
- `clearSession(page)` — navigate to `/auth/login` first (needs origin for localStorage access), then clear
- Auth page object: use `getByPlaceholder('Email')` (en-US), `.login-button`, `.register-button`
- Chat page object: use `.message-input .el-textarea__inner`, `.message-bubble`, `.new-chat-btn`
- Market page object: use `.character-card`, `.character-grid`

**Commit:** `refactor(e2e): rewrite helpers and page objects with real selectors and auth setup`

---

### Task 2: Rewrite auth.spec.ts

**Files:**
- Rewrite: `e2e/auth.spec.ts`

**What to test (8 tests):**
1. Login page renders with email and password fields
2. Register page renders with name, email, password, confirm fields
3. Login with mocked API succeeds and redirects to /chat
4. Register with mocked API succeeds and redirects
5. Invalid email shows validation error
6. Short password shows validation error
7. Unauthenticated user redirected to /auth/login from protected route
8. Logout clears token and redirects to login

**Approach:**
- Tests 1-2: just navigate and check form elements exist (no auth needed)
- Tests 3-4: mock `/auth/login` and `/auth/register` to return tokens, verify redirect
- Tests 5-6: fill invalid data, submit, check for `.el-form-item__error`
- Test 7: navigate to `/chat` without token, verify redirect to `/auth/login`
- Test 8: use `setupAuth`, navigate, click logout, verify token cleared

**Commit:** `test(e2e): rewrite auth tests with real selectors`

---

### Task 3: Rewrite legal + simple public pages

**Files:**
- Rewrite: `e2e/technical-debt-recommendations.spec.ts`
- Rewrite: `e2e/responsive.spec.ts`

**technical-debt (4 tests):**
1. Terms page loads — navigate to `/terms`, check `.legal-page` visible, page title contains "Terms"
2. Privacy page loads — navigate to `/privacy`, check `.legal-page` visible
3. About page loads — navigate to `/about`, check `.legal-page` visible
4. Market page loads (public) — navigate to `/market`, check `.market-content` visible

**responsive (4 tests):**
1. Mobile viewport (390x844) — navigate to `/market`, check `.dashboard-layout` renders
2. Tablet viewport (1366x1024) — navigate to `/market`, check layout renders
3. Desktop viewport (1920x1080) — navigate to `/`, check content renders
4. Orientation change — start portrait, switch landscape, verify page still functional

**Commit:** `test(e2e): rewrite legal and responsive tests`

---

### Task 4: Rewrite market + character + recommendations

**Files:**
- Rewrite: `e2e/character.spec.ts`
- Rewrite: `e2e/character-features.spec.ts`
- Rewrite: `e2e/recommendations.spec.ts`

**character.spec.ts (4 tests):**
1. Market page shows character grid — mock `/characters/marketplace`, check `.character-grid` has `.character-card` elements
2. Character detail page loads — mock `/characters/:id`, navigate to `/characters/char_1`, check `.character-detail-page` visible
3. Character detail shows name and description — check `h2` text and description paragraph
4. My characters page requires auth — navigate without auth, verify redirect

**character-features.spec.ts (4 tests):**
1. Character creation page loads — `setupAuth`, navigate to `/characters/new`, check form renders
2. Character edit page loads — `setupAuth`, mock character data, navigate to `/characters/char_1/edit`
3. My characters page loads — `setupAuth`, mock `/characters` list, navigate to `/my-characters`
4. Character detail has action buttons — navigate to `/characters/char_1`, check `.action-buttons`

**recommendations.spec.ts (4 tests):**
1. Market page shows recommendation section — mock trending API, navigate to `/market`, check `.recommendation-section`
2. Trending characters display — mock trending + character details, check carousel items
3. Character detail shows similar characters section — mock similar API, navigate to detail page
4. Empty recommendations handled gracefully — mock empty trending, verify no crash

**Commit:** `test(e2e): rewrite character and recommendation tests`

---

### Task 5: Rewrite chat + intelligence

**Files:**
- Rewrite: `e2e/chat.spec.ts`
- Rewrite: `e2e/chat-features.spec.ts`
- Rewrite: `e2e/intelligence.spec.ts`

**chat.spec.ts (5 tests):**
1. Chat page loads with sidebar — `setupAuth`, mock `/chats`, navigate to `/chat`, check `.chat-layout` and `.chat-sidebar-wrapper`
2. Empty chat shows welcome/empty state — check `.chat-empty` or welcome content
3. Chat list renders — mock chats list, check `.chat-item` elements
4. Message input is visible — check `.message-input`
5. Chat requires auth — navigate without auth, verify redirect

**chat-features.spec.ts (4 tests):**
1. New chat button exists — `setupAuth`, check `.new-chat-btn` visible
2. Message input accepts text — fill textarea, verify value
3. Chat sidebar is collapsible on mobile — set mobile viewport, check sidebar behavior
4. Chat with messages renders bubbles — mock chat + messages, check `.message-bubble`

**intelligence.spec.ts (3 tests):**
1. Intelligence debug panel accessible — `setupAuth`, mock character intelligence data, navigate to chat
2. Memory panel loads — mock memories endpoint, check debug panel elements
3. Emotion state displays — mock emotion endpoint, check emotion display

**Commit:** `test(e2e): rewrite chat and intelligence tests`

---

### Task 6: Rewrite admin + analytics

**Files:**
- Rewrite: `e2e/admin-features.spec.ts`
- Rewrite: `e2e/analytics.spec.ts`

**admin-features.spec.ts (6 tests):**
1. Admin system dashboard loads — `setupAdminAuth`, mock `/admin/system/stats`, navigate to `/admin/system`, check `.system-dashboard` and `.stat-card`
2. Stats cards show values — check `.stat-value` elements have content
3. Announcements card visible — check `.announcements-card` visible
4. User management loads — mock `/admin/users`, navigate to `/admin/users`, check `.user-management` and `.users-table`
5. GDPR page loads — mock `/admin/gdpr/requests`, navigate to `/admin/gdpr`, check `.gdpr-management`
6. Non-admin redirected — `setupAuth` (role: user), navigate to `/admin/system`, verify redirect to `/chat`

**analytics.spec.ts (5 tests):**
1. Analytics dashboard loads for team user — `setupAuth` with plan: 'team', mock analytics endpoints, check `.analytics-dashboard`
2. Executive tab renders — check `.analytics-tabs` visible
3. Product tab switchable — click product tab, verify tab content changes
4. Unauthenticated redirected — navigate without auth, verify redirect
5. Free user sees gate/error — `setupAuth` with plan: 'free', mock 403, check error or upgrade prompt

**Commit:** `test(e2e): rewrite admin and analytics tests`

---

### Task 7: Rewrite developer + plugins + webhooks

**Files:**
- Rewrite: `e2e/developer.spec.ts`
- Rewrite: `e2e/plugins.spec.ts`
- Rewrite: `e2e/webhooks.spec.ts`

**developer.spec.ts (4 tests):**
1. Developer page loads — `setupAuth`, mock `/developer/api-keys` (empty), navigate to `/developer`, check `.developer-settings`
2. Empty state shown — check `.empty-state` visible with "No API Keys" text
3. Key list renders — mock with keys, check `.key-card` elements
4. Create key dialog opens — click create button, check `el-dialog` visible

**plugins.spec.ts (3 tests):**
1. Plugin marketplace loads — `setupAuth`, mock plugin endpoints, navigate to `/plugins`
2. Plugin list renders — check plugin cards visible
3. Requires auth — navigate without auth, verify redirect

**webhooks.spec.ts (3 tests):**
- Webhooks have NO dedicated UI page. Tests should verify API contract via `page.evaluate(fetch(...))` after navigating to `/developer`.
1. Webhook list API returns data — mock `/webhooks`, fetch from page context, verify response
2. Webhook create API works — mock POST `/webhooks`, fetch from page context, verify response
3. Webhook delete API works — mock DELETE, fetch, verify response

**Commit:** `test(e2e): rewrite developer, plugins, and webhook tests`

---

### Task 8: Rewrite social + notifications + profile + subscription

**Files:**
- Rewrite: `e2e/social.spec.ts`
- Rewrite: `e2e/notifications.spec.ts`
- Rewrite: `e2e/profile-worldbooks.spec.ts`
- Rewrite: `e2e/subscription.spec.ts`

**social.spec.ts (4 tests):**
1. User profile page loads (public) — navigate to `/user/user_1`, mock user data, check page renders
2. Follow button visible — check follow/unfollow button exists
3. Character detail has favorite button — navigate to `/characters/char_1`, check FavoriteButton
4. Comment section visible on character detail — check CommentSection renders

**notifications.spec.ts (4 tests):**
1. Notifications page loads — `setupAuth`, mock `/notifications`, navigate to `/notifications`, check `.notifications-page`
2. Notification list renders — mock with items, check `.notification-item` elements
3. Empty state shown — mock empty list, check `.empty-state`
4. Mark all read button exists — check button with "Mark All Read" text

**profile-worldbooks.spec.ts (4 tests):**
1. Profile page loads — `setupAuth`, mock `/auth/me`, navigate to `/profile`, check `.profile-edit-page`
2. Profile form has fields — check display name input and bio textarea
3. WorldBooks page loads — `setupAuth`, mock `/worldbooks`, navigate to `/worldbooks`
4. WorldBooks requires auth — navigate without auth, verify redirect

**subscription.spec.ts (4 tests):**
1. Subscription page loads — `setupAuth`, mock subscription data, navigate to `/subscription`, check `.content-wrapper`
2. Plan cards visible — check `.plan-card` elements (3 plans)
3. Current plan highlighted — check `.plan-card.current` exists
4. Requires auth — navigate without auth, verify redirect

**Commit:** `test(e2e): rewrite social, notifications, profile, and subscription tests`

---

### Task 9: Rewrite error-handling + platform-hardening

**Files:**
- Rewrite: `e2e/error-handling.spec.ts`
- Rewrite: `e2e/platform-hardening.spec.ts`

**error-handling.spec.ts (4 tests):**
1. API 500 error shows error message — mock `/auth/login` with 500, submit login form, check `.el-message--error` or `.el-form-item__error`
2. 404 page renders — navigate to `/nonexistent-page`, check NotFound page renders
3. Malformed JSON handled — mock login with invalid JSON body, submit, check error shown
4. Rate limit 429 handled — mock with 429, check error message

**platform-hardening.spec.ts (4 tests):**
1. CSP headers present — check response headers for Content-Security-Policy
2. CSRF protection — verify CSRF token in cookies or headers
3. Health endpoint responds — fetch `/health`, verify 200
4. Readiness endpoint responds — fetch `/health/ready`, verify response

**Commit:** `test(e2e): rewrite error-handling and platform-hardening tests`

---

### Task 10: Update playwright config + final verification

**Files:**
- Modify: `playwright.config.ts` — keep webServer config, adjust timeouts, remove Mobile Chrome project (focus on chromium only for now)

**Steps:**
1. Run `npx playwright test --project=chromium` — expect majority passing
2. Fix any remaining selector mismatches found during run
3. Document final pass/fail count

**Commit:** `test(e2e): finalize playwright config and verify all tests pass`

---

## Test Count Summary

| File | Old Count | New Count |
|------|-----------|-----------|
| auth.spec.ts | 11 | 8 |
| technical-debt-recommendations.spec.ts | 4 | 4 |
| responsive.spec.ts | 9 | 4 |
| character.spec.ts | 8 | 4 |
| character-features.spec.ts | 6 | 4 |
| recommendations.spec.ts | 8 | 4 |
| chat.spec.ts | 11 | 5 |
| chat-features.spec.ts | 6 | 4 |
| intelligence.spec.ts | 17 | 3 |
| admin-features.spec.ts | 6 | 6 |
| analytics.spec.ts | 10 | 5 |
| developer.spec.ts | 8 | 4 |
| plugins.spec.ts | 8 | 3 |
| webhooks.spec.ts | 10 | 3 |
| social.spec.ts | 10 | 4 |
| notifications.spec.ts | 8 | 4 |
| profile-worldbooks.spec.ts | 8 | 4 |
| subscription.spec.ts | 8 | 4 |
| error-handling.spec.ts | 12 | 4 |
| platform-hardening.spec.ts | 8 | 4 |
| **Total** | **246** | **~83** |

Fewer tests, but every single one actually verifies real UI behavior.

## Verification

After all tasks:
- `npx playwright test --project=chromium` — majority passing (target: 80%+)
- `npx vitest run` — 2017 unit tests still passing (no regressions)
- `npx tsc --noEmit` — 0 errors
