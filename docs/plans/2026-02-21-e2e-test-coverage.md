# Iteration 16: E2E Test Coverage Completion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Context:** `npx playwright test --list` reports 142 unique tests across 10 spec files, but coverage is concentrated on core user journeys (auth, chat, characters, subscriptions). Community/ecosystem features from Iterations 2-5 have zero E2E coverage: social, notifications, developer API, plugins, webhooks, recommendations, profile editing, and world book CRUD.

**Goal:** Add E2E tests for 8 uncovered feature areas, bringing total from ~142 to ~210+ unique tests and coverage from ~60% to ~90% of user-facing features.

**Architecture:** 8 tasks, each creating one spec file. Tasks are independent — no ordering dependencies. Each test file follows the existing mock-based pattern (no live backend required).

**Tech Stack:** Playwright, TypeScript, Element Plus selectors, `mockApiResponse` helper

---

## Conventions (read before implementing)

All existing E2E tests follow these patterns. New tests MUST match exactly:

```typescript
// Imports
import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

// Structure
test.describe('Feature Name', () => {
  test.describe('Sub-feature', () => {
    test.beforeEach(async ({ page }) => {
      // 1. Mock /auth/me so the app thinks user is logged in
      await mockApiResponse(page, '**/api/v1/auth/me', {
        success: true,
        data: { user: { id: 'user_1', email: 'test@example.com', displayName: 'Test', role: 'user', tenantId: 'tenant_1', plan: 'free' } },
      });
      // 2. Clear session
      await clearSession(page);
      // 3. Register fresh user
      const authPage = new AuthPage(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should do X', async ({ page }) => {
      // Mock API responses BEFORE navigating
      await mockApiResponse(page, '**/api/v1/some-endpoint', { success: true, data: [...] });
      await page.goto('/some-page');
      await waitForNetworkIdle(page);
      // Assert
      await expect(page.locator('.some-element')).toBeVisible();
    });
  });
});
```

**Key rules:**
- Mock ALL API calls — tests must work without a live backend
- Use `**/api/v1/...` glob patterns for URL matching
- Use `clearSession(page)` + `authPage.register()` for auth setup
- Use `waitForNetworkIdle(page)` after navigation
- Use Element Plus selectors: `.el-button`, `.el-card`, `.el-table`, `.el-dialog`, `.el-tag`, `.el-switch`, `.el-input`, `.el-select`, `.el-message--success`
- Use i18n Chinese text for button/label matching (the app defaults to zh-CN)
- Each test should be independent — no shared state between tests

---

### Task 1: Social features E2E tests (follow, favorite, comment)

**Files:**
- Create: `e2e/social.spec.ts`

**What to do:**

Write ~18 tests covering the social features accessible from character detail and profile pages.

**API endpoints to mock:**

```typescript
// Follow
'**/api/v1/social/follows'           // POST — follow user
'**/api/v1/social/follows/*'         // DELETE — unfollow
'**/api/v1/social/follows/*/status'  // GET — follow status
'**/api/v1/social/users/*/followers' // GET — followers list
'**/api/v1/social/users/*/following' // GET — following list

// Favorites
'**/api/v1/social/favorites'         // POST/GET — favorite / list
'**/api/v1/social/favorites/*'       // DELETE — unfavorite
'**/api/v1/social/favorites/*/status'// GET — favorite status

// Comments
'**/api/v1/social/characters/*/comments' // POST/GET — create/list
'**/api/v1/social/comments/*'            // PATCH/DELETE — edit/delete
```

**Tests to write:**

```
describe('Social Features')
  describe('Follow System')
    - should display follow button on user profile page
    - should follow a user and show success feedback
    - should unfollow a user
    - should display followers list
    - should display following list
    - should show follow count

  describe('Favorites')
    - should display favorite button on character detail page
    - should favorite a character and show success feedback
    - should unfavorite a character
    - should display favorites list on profile
    - should show favorite count on character card

  describe('Comments')
    - should display comment section on character detail page
    - should post a new comment
    - should display existing comments with author and timestamp
    - should delete own comment
    - should show empty state when no comments
    - should paginate comments
    - should handle comment submission error gracefully
```

**Mock data shapes:**

```typescript
// Follow status
{ success: true, data: { isFollowing: true } }

// Followers list
{ success: true, data: { followers: [{ id: 'user_2', displayName: 'User 2', avatarUrl: null }], total: 1 } }

// Favorites list
{ success: true, data: { favorites: [{ id: 'char_1', name: 'Character 1', description: '...' }], total: 1 } }

// Comments list
{ success: true, data: { comments: [{ id: 'comment_1', content: 'Great character!', author: { id: 'user_2', displayName: 'User 2' }, createdAt: '2026-02-20T00:00:00Z' }], total: 1 } }
```

**Run:** `npx playwright test e2e/social.spec.ts --project=chromium`

**Commit:** `test(e2e): add social features tests (follow, favorite, comment)`

---

### Task 2: Notifications E2E tests

**Files:**
- Create: `e2e/notifications.spec.ts`

**What to do:**

Write ~10 tests covering the notifications page and notification bell component.

**API endpoints to mock:**

```typescript
'**/api/v1/notifications'            // GET — list notifications
'**/api/v1/notifications/unread-count' // GET — unread count
'**/api/v1/notifications/*/read'     // PATCH — mark as read
'**/api/v1/notifications/read-all'   // POST — mark all read (note: route is /read-all)
'**/api/v1/notifications/*'          // DELETE — delete notification
```

**Tests to write:**

```
describe('Notifications')
  describe('Notification Bell')
    - should display notification bell in header
    - should show unread count badge
    - should show zero badge when no unread notifications

  describe('Notifications Page')
    - should display notification list
    - should show notification with actor name and message
    - should filter between all and unread notifications
    - should mark single notification as read
    - should mark all notifications as read
    - should delete a notification
    - should show empty state when no notifications
```

**Mock data shapes:**

```typescript
// Unread count
{ success: true, data: { count: 3 } }

// Notification list
{ success: true, data: {
  notifications: [{
    id: 'notif_1', type: 'follow', message: 'User 2 started following you',
    actorId: 'user_2', actorName: 'User 2', read: false,
    createdAt: '2026-02-20T12:00:00Z'
  }],
  total: 1
}}
```

**Page elements (from Notifications.vue):**
- Filter radio buttons: "全部" / "未读"
- "全部已读" button
- Notification items with unread dot, avatar, message, timestamp, delete button
- Empty state with bell icon

**Run:** `npx playwright test e2e/notifications.spec.ts --project=chromium`

**Commit:** `test(e2e): add notification page and bell tests`

---

### Task 3: Developer API portal E2E tests

**Files:**
- Create: `e2e/developer.spec.ts`

**What to do:**

Write ~12 tests covering the developer settings page (API key management).

**API endpoints to mock:**

```typescript
'**/api/v1/developer/api-keys'   // POST/GET — create/list keys
'**/api/v1/developer/api-keys/*' // GET/PATCH/DELETE — single key ops
'**/api/v1/developer/scopes'     // GET — available scopes
```

**Tests to write:**

```
describe('Developer API Portal')
  describe('API Key Management')
    - should display developer settings page
    - should show empty state when no API keys
    - should open create API key dialog
    - should create a new API key and display the key value
    - should display API key list with name and masked key
    - should show scope tags on API key cards
    - should toggle API key active/inactive
    - should delete an API key with confirmation
    - should show key metadata (created date, last used, request count)
    - should open edit dialog and update key name
    - should display rate limit information
    - should handle API errors gracefully
```

**Mock data shapes:**

```typescript
// Scopes list
{ success: true, data: { scopes: ['characters:read', 'characters:write', 'chats:read', 'chats:write'] } }

// API key list
{ success: true, data: {
  apiKeys: [{
    id: 'key_1', name: 'Test Key', keyHint: 'sk_...abc',
    scopes: ['characters:read'], active: true,
    createdAt: '2026-02-20T00:00:00Z', lastUsedAt: '2026-02-21T00:00:00Z',
    requestCount: 42, rateLimit: 100
  }]
}}

// Create key response (includes full key only once)
{ success: true, data: { id: 'key_2', name: 'New Key', key: 'sk_live_abc123...', keyHint: 'sk_...123' } }
```

**Page elements (from DeveloperSettings.vue):**
- "创建 API Key" button
- Empty state with key icon
- Key cards with name, hint, scope tags, switch, edit/delete buttons
- Create dialog with name input, scope checkboxes, rate limit input
- After creation: warning alert + full key display + copy button

**Run:** `npx playwright test e2e/developer.spec.ts --project=chromium`

**Commit:** `test(e2e): add developer API portal tests`

---

### Task 4: Plugin marketplace E2E tests

**Files:**
- Create: `e2e/plugins.spec.ts`

**What to do:**

Write ~14 tests covering the plugin marketplace page (browse, install, configure, enable/disable).

**API endpoints to mock:**

```typescript
'**/api/v1/plugins/marketplace'    // GET — browse plugins
'**/api/v1/plugins/marketplace/*'  // GET — plugin details
'**/api/v1/plugins/installs'       // POST/GET — install/list
'**/api/v1/plugins/installs/*'     // PATCH/DELETE — config/uninstall
'**/api/v1/plugins/installs/*/enable'  // POST
'**/api/v1/plugins/installs/*/disable' // POST
```

**Tests to write:**

```
describe('Plugin Marketplace')
  describe('Marketplace Tab')
    - should display plugin marketplace page
    - should show plugin cards with name, author, description
    - should display install count on plugin cards
    - should search plugins by name
    - should sort plugins (popular, newest, name)
    - should paginate plugin list
    - should install a plugin from marketplace

  describe('My Plugins Tab')
    - should switch to My Plugins tab
    - should display installed plugins list
    - should show empty state when no plugins installed
    - should enable/disable an installed plugin
    - should open configuration dialog
    - should uninstall a plugin
    - should handle feature gate for free users (plugin limit)
```

**Mock data shapes:**

```typescript
// Marketplace list
{ success: true, data: {
  plugins: [{
    id: 'plugin_1', name: 'Auto Translator', author: 'dev_user',
    description: 'Translates messages automatically', version: '1.0.0',
    installCount: 150, published: true
  }],
  total: 1, page: 1, limit: 12
}}

// Installed plugins
{ success: true, data: {
  installs: [{
    id: 'install_1', pluginId: 'plugin_1', pluginName: 'Auto Translator',
    version: '1.0.0', enabled: true, config: {},
    configSchema: { targetLang: { type: 'string', default: 'en' } }
  }]
}}
```

**Page elements (from PluginMarketplace.vue):**
- Tabs: "市场" / "我的插件"
- Search input in header
- Sort radio buttons: Popular / Newest / Name
- Plugin cards with icon, name, author, description, install count, Install button
- My Plugins: cards with switch (enable/disable), Configure button, Uninstall button
- Config dialog with dynamic form fields

**Run:** `npx playwright test e2e/plugins.spec.ts --project=chromium`

**Commit:** `test(e2e): add plugin marketplace tests`

---

### Task 5: Webhook management E2E tests

**Files:**
- Create: `e2e/webhooks.spec.ts`

**What to do:**

Write ~10 tests covering webhook CRUD in the developer settings area. Note: webhooks may be managed from the DeveloperSettings page or a sub-route. Check the router config to find the correct path. If no dedicated page exists, test via the API mock pattern with navigation to `/settings/developer` or wherever webhooks are accessible.

**API endpoints to mock:**

```typescript
'**/api/v1/webhooks'              // POST/GET — create/list
'**/api/v1/webhooks/*'            // GET/PATCH/DELETE — single webhook
'**/api/v1/webhooks/*/test'       // POST — send test event
'**/api/v1/webhooks/*/deliveries' // GET — delivery history
'**/api/v1/webhooks/*/deliveries/*/retry' // POST — retry delivery
```

**Tests to write:**

```
describe('Webhook Management')
  - should display webhook list page
  - should show empty state when no webhooks
  - should create a new webhook with URL and events
  - should display webhook details (URL, events, status)
  - should edit webhook URL
  - should delete a webhook with confirmation
  - should send a test event
  - should display delivery history
  - should show delivery status (success/failed)
  - should retry a failed delivery
```

**Important:** First check if there's a dedicated webhooks page in the router. If webhooks are only accessible via API (no frontend page), write tests that verify the API integration from whatever page links to webhook management. If no page exists at all, create a simpler smoke test that verifies the developer settings page loads and note the gap.

**Mock data shapes:**

```typescript
// Webhook list
{ success: true, data: {
  webhooks: [{
    id: 'wh_1', url: 'https://example.com/webhook',
    events: ['character.created', 'chat.message.created'],
    active: true, secret: 'whsec_...abc',
    createdAt: '2026-02-20T00:00:00Z'
  }]
}}

// Delivery history
{ success: true, data: {
  deliveries: [{
    id: 'del_1', webhookId: 'wh_1', event: 'character.created',
    status: 'success', statusCode: 200, attemptCount: 1,
    createdAt: '2026-02-21T00:00:00Z'
  }]
}}
```

**Run:** `npx playwright test e2e/webhooks.spec.ts --project=chromium`

**Commit:** `test(e2e): add webhook management tests`

---

### Task 6: Recommendations E2E tests

**Files:**
- Create: `e2e/recommendations.spec.ts`

**What to do:**

Write ~8 tests covering the recommendation features visible on the home/market pages. The existing `technical-debt-recommendations.spec.ts` only has 1 trending smoke test — this task adds comprehensive coverage.

**API endpoints to mock:**

```typescript
'**/api/v1/recommendations'          // GET — personalized (auth)
'**/api/v1/recommendations/trending' // GET — trending (public)
'**/api/v1/recommendations/similar/*'// GET — similar characters
'**/api/v1/recommendations/feedback' // POST — feedback
```

**Tests to write:**

```
describe('Recommendations')
  describe('Trending Characters')
    - should display trending characters section on home/market page
    - should show character cards with name and description
    - should navigate to character detail on card click

  describe('Personalized Recommendations')
    - should display personalized recommendations for logged-in user
    - should show recommendation carousel/section
    - should handle empty recommendations gracefully

  describe('Similar Characters')
    - should display similar characters on character detail page
    - should show related character cards

  describe('Recommendation Feedback')  (optional — only if UI exists)
    - should submit positive feedback on recommendation
```

**Mock data shapes:**

```typescript
// Trending
{ success: true, data: {
  characters: [
    { id: 'char_1', name: 'Popular Bot', description: 'Trending character', tags: ['popular'], rating: 4.5 },
    { id: 'char_2', name: 'New Bot', description: 'New character', tags: ['new'], rating: 4.0 },
  ]
}}

// Personalized
{ success: true, data: {
  recommendations: [
    { id: 'char_3', name: 'For You', description: 'Based on your interests', score: 0.95 }
  ]
}}

// Similar
{ success: true, data: {
  characters: [
    { id: 'char_4', name: 'Similar Bot', description: 'Similar to current', similarity: 0.8 }
  ]
}}
```

**Run:** `npx playwright test e2e/recommendations.spec.ts --project=chromium`

**Commit:** `test(e2e): add recommendation feature tests`

---

### Task 7: Profile and World Books E2E tests

**Files:**
- Create: `e2e/profile-worldbooks.spec.ts`

**What to do:**

Write ~14 tests covering profile editing and world book management — two smaller features combined into one spec file.

**API endpoints to mock:**

```typescript
// Profile
'**/api/v1/users/me'              // GET/PATCH — get/update profile
'**/api/v1/auth/me'               // GET — current user (already used in beforeEach)

// World Books
'**/api/v1/worldbooks'            // GET/POST — list/create
'**/api/v1/worldbooks/*'          // GET/PATCH/DELETE — single worldbook
```

**Tests to write:**

```
describe('Profile Management')
  - should display profile page with user info
  - should show avatar, name, email, and membership badge
  - should navigate between profile tabs (Basic Info, Security, Preferences)
  - should change theme preference (dark/light)
  - should change language preference
  - should display password change form in Security tab
  - should show export data button

describe('World Books')
  - should display world books page
  - should show empty state when no world books
  - should open create world book dialog
  - should create a new world book with name and scope
  - should display world book list with name and scope tags
  - should toggle world book enabled/disabled
  - should delete a world book
```

**Mock data shapes:**

```typescript
// User profile
{ success: true, data: {
  user: { id: 'user_1', email: 'test@example.com', displayName: 'Test User',
    avatarUrl: null, role: 'user', plan: 'free', createdAt: '2026-01-01T00:00:00Z' }
}}

// World book list
{ success: true, data: {
  worldbooks: [
    { id: 'wb_1', name: 'Fantasy World', scope: 'global', enabled: true, description: 'Fantasy setting' },
    { id: 'wb_2', name: 'Sci-Fi World', scope: 'character', enabled: false, description: 'Sci-fi setting' },
  ]
}}
```

**Page elements:**
- Profile: avatar, name, email, membership badge, tab navigation, theme/language radio buttons
- WorldBooks: "新建" button, search input, table with Name/Scope/Enabled columns, scope tags (Global/Character/Persona/Chat), enable switch, edit/delete buttons, create dialog

**Run:** `npx playwright test e2e/profile-worldbooks.spec.ts --project=chromium`

**Commit:** `test(e2e): add profile editing and world book management tests`

---

### Task 8: Final verification and ROADMAP update

**What to do:**

1. Run the full E2E test suite to verify all new tests pass:
```bash
npx playwright test --project=chromium 2>&1 | tail -20
```
Expected: All new spec files pass (they use mocks, so no live backend needed).

2. Run `npx playwright test --list 2>&1 | wc -l` to count total tests.
Expected: ~210+ unique tests (up from 142).

3. Run unit tests to verify no regressions:
```bash
npx vitest run 2>&1 | tail -5
```
Expected: 1600 tests passing.

4. Update `ROADMAP.md` — add Iteration 16 entry:
```markdown
### 迭代 16: E2E 测试覆盖补全 ✅ (2026-02-21)
- ✅ **社交功能 E2E** — 关注/收藏/评论 (~18 tests)
- ✅ **通知系统 E2E** — 通知铃铛 + 通知页面 (~10 tests)
- ✅ **开发者 API E2E** — API Key 管理 (~12 tests)
- ✅ **插件市场 E2E** — 浏览/安装/配置/启停 (~14 tests)
- ✅ **Webhook 管理 E2E** — CRUD + 测试投递 (~10 tests)
- ✅ **推荐系统 E2E** — 热门/个性化/相似 (~8 tests)
- ✅ **个人资料 + 世界书 E2E** — 编辑/主题/世界书 CRUD (~14 tests)
- **新增**: ~86 E2E 测试, 7 个新 spec 文件
```

5. Update `CLAUDE.md` — add Iteration 16 section and update test counts.

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 16 (E2E test coverage)`

---

## Verification

After all tasks:
- `npx playwright test --project=chromium` — all new specs pass
- `npx vitest run` — 1600 unit tests still passing
- Total E2E unique tests: ~210+ (was 142)
