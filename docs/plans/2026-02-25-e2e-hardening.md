# Iteration 50: E2E Test Hardening (E2E 测试加固)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add E2E smoke tests for the most impactful uncovered features, fix the conditional skip fragility in chat/intelligence tests, and improve seed reliability.

**Architecture:** 5 tasks. T1 fixes seed fragility. T2 adds chat feature E2E tests. T3 adds character/search E2E tests. T4 adds admin/notification E2E tests. T5 runs final verification.

**Tech Stack:** TypeScript, Playwright, Vitest (unit tests unchanged)

**Note:** E2E tests cannot actually run in this environment (no browser, no running server). We write the test files following existing patterns and verify they compile with `npx tsc --noEmit`. The tests will be validated when the full environment is available.

---

### Task 1: Fix seed fragility and conditional skips

**Files:**
- Modify: `e2e/seed.ts`
- Modify: `e2e/chat.spec.ts`
- Modify: `e2e/intelligence.spec.ts`

**What to do:**

1. Read `e2e/seed.ts`. The seed creates a user, character, and chat. If any step fails, downstream tests silently skip. Add retry logic (up to 3 attempts) for character and chat creation:

```ts
async function createWithRetry(fn: () => Promise<any>, label: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.warn(`${label} attempt ${i + 1} failed:`, e);
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

2. In `chat.spec.ts`, read the file and find the conditional `test.skip()` pattern. Replace the silent skips with a `test.beforeAll` that uses `test.fail()` or a clear error message when setup fails, so failures are visible rather than hidden:

```ts
test.beforeAll(async ({ page }) => {
  chatReady = await setupChat(page);
  if (!chatReady) {
    console.error('Chat setup failed - tests will be skipped');
  }
});
```

Keep the conditional skips but add a `console.warn` so they're visible in CI output.

3. Same pattern for `intelligence.spec.ts`.

**Commit:** `fix(e2e): add seed retry logic and improve skip visibility`

---

### Task 2: Add chat feature E2E tests

**Files:**
- Create: `e2e/chat-features.spec.ts`

**What to do:**

Read existing `e2e/chat.spec.ts` for patterns. Create a new file for chat features added in iterations 23-25, 45:

```ts
import { test, expect } from '@playwright/test';

test.describe('Chat Features', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to a chat
    await page.goto('/login');
    // ... login flow
  });

  // Message reactions (Iteration 45)
  test('can add emoji reaction to message', async ({ page }) => {
    // Find a message, hover to show actions, click reaction button
    // Verify reaction badge appears
  });

  // Message pinning (Iteration 45)
  test('can pin and unpin a message', async ({ page }) => {
    // Find a message, click pin action
    // Verify pin indicator appears
    // Open pinned messages drawer
  });

  // Message bookmarks (Iteration 23)
  test('can bookmark a message', async ({ page }) => {
    // Find a message, click bookmark action
    // Verify bookmark indicator
  });

  // Chat export (Iteration 23)
  test('can export chat', async ({ page }) => {
    // Click export button in chat header
    // Verify export dialog/download
  });

  // Reply-to quoting (Iteration 45)
  test('can reply to a message', async ({ page }) => {
    // Find a message, click reply action
    // Verify reply preview bar appears above input
  });

  // Conversation branching (Iteration 25)
  test('shows branch navigation for regenerated messages', async ({ page }) => {
    // Check for sibling navigation arrows on messages
  });
});
```

Follow the existing test patterns — use page objects if available, use `test.skip` with condition if chat setup is needed.

**Commit:** `test(e2e): add chat features E2E tests`

---

### Task 3: Add character/search E2E tests

**Files:**
- Create: `e2e/character-features.spec.ts`

**What to do:**

Read existing `e2e/character.spec.ts` for patterns. Create tests for:

```ts
test.describe('Character Features', () => {
  // Character editor (Iteration 20)
  test('can open character editor', async ({ page }) => {
    // Navigate to character creation
    // Verify editor form fields exist
  });

  // Character templates (Iteration 20)
  test('can select character template', async ({ page }) => {
    // Open character creation
    // Verify template selection is available
  });

  // Version history (Iteration 20)
  test('can view character version history', async ({ page }) => {
    // Navigate to owned character
    // Open version history panel
  });
});

test.describe('Search Features', () => {
  // Search command palette (Iteration 27/43)
  test('opens search command palette with Ctrl+K', async ({ page }) => {
    await page.goto('/chat');
    await page.keyboard.press('Control+k');
    // Verify command palette overlay appears
    await expect(page.locator('.command-palette, .search-command-palette')).toBeVisible();
  });

  // Global search (Iteration 27)
  test('can search from search page', async ({ page }) => {
    await page.goto('/search');
    // Verify search input exists
    // Type a query
    // Verify results tabs appear
  });
});
```

**Commit:** `test(e2e): add character and search feature E2E tests`

---

### Task 4: Add admin/notification E2E tests

**Files:**
- Create: `e2e/admin-features.spec.ts`

**What to do:**

Read existing `e2e/platform-hardening.spec.ts` for admin test patterns. Create tests for:

```ts
test.describe('Admin Features', () => {
  // Admin announcements (Iteration 48)
  test('admin can send announcement', async ({ page }) => {
    // Login as admin
    // Navigate to /admin/system
    // Find announcement textarea
    // Type message and click send
  });

  // User detail drawer (Iteration 48)
  test('admin can view user details', async ({ page }) => {
    // Navigate to /admin/users
    // Click a user row
    // Verify drawer opens with user details
  });

  // GDPR management (Iteration 48)
  test('admin can view GDPR requests', async ({ page }) => {
    // Navigate to /admin/gdpr
    // Verify table renders
  });
});

test.describe('Notification Features', () => {
  // Notification preferences (Iteration 31/46)
  test('can open notification preferences', async ({ page }) => {
    // Navigate to notifications page
    // Click preferences/settings button
    // Verify preferences dialog opens
  });

  // Push notification toggle (Iteration 46)
  test('shows push notification toggle in preferences', async ({ page }) => {
    // Open notification preferences
    // Verify push toggle exists
  });
});
```

**Commit:** `test(e2e): add admin and notification feature E2E tests`

---

### Task 5: Final verification

1. Run `npx tsc --noEmit` — expect 0 errors (E2E files should compile)
2. Run `npx vitest run` — expect 2004+ tests passing (unit tests unchanged)
3. Count E2E test files: should be 21 (17 existing + 4 new)

**Commit:** None (verification only).
