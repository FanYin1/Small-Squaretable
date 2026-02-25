# Iteration 52: E2E Assertion Quality Sweep (E2E 断言质量清扫)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace all 134 `expect(typeof x).toBe('boolean')` useless assertions across 16 old E2E files with real Playwright assertions.

**Architecture:** 5 tasks grouped by file count. T1 handles the 4 highest-count files (56 fixes). T2 handles the next 4 files (39 fixes). T3 handles the next 4 files (20 fixes). T4 handles the remaining 4 files (19 fixes). T5 runs final verification.

**Key rule:** Replace `expect(typeof isVisible).toBe('boolean')` with `await expect(locator).toBeVisible()` or `expect(isVisible).toBe(true)`. Every assertion must fail if the element doesn't exist.

---

### Task 1: Fix developer, social, profile-worldbooks, notifications (56 assertions)

**Files:**
- Modify: `e2e/developer.spec.ts` (16 fixes)
- Modify: `e2e/social.spec.ts` (14 fixes)
- Modify: `e2e/profile-worldbooks.spec.ts` (14 fixes)
- Modify: `e2e/notifications.spec.ts` (13 fixes — note: this file already has good API mocking)

**What to do:**

For each file, read it, find every `expect(typeof ... ).toBe('boolean')`, and replace with a real assertion.

Pattern:
```ts
// BEFORE (useless):
const isVisible = await page.locator('.xxx').isVisible().catch(() => false);
expect(typeof isVisible).toBe('boolean');

// AFTER (real):
await expect(page.locator('.xxx').first()).toBeVisible();
```

If the locator uses `.catch(() => false)`, remove the catch and use Playwright's native `await expect().toBeVisible()` which has built-in timeout and retry.

**Commit:** `fix(e2e): replace useless assertions in developer, social, profile, notifications tests`

---

### Task 2: Fix analytics, intelligence, subscription, chat (41 assertions)

**Files:**
- Modify: `e2e/analytics.spec.ts` (13 fixes)
- Modify: `e2e/intelligence.spec.ts` (10 fixes)
- Modify: `e2e/subscription.spec.ts` (9 fixes)
- Modify: `e2e/chat.spec.ts` (9 fixes)

**Same approach as Task 1.**

**Commit:** `fix(e2e): replace useless assertions in analytics, intelligence, subscription, chat tests`

---

### Task 3: Fix recommendations, plugins, platform-hardening, character (25 assertions)

**Files:**
- Modify: `e2e/recommendations.spec.ts` (8 fixes)
- Modify: `e2e/plugins.spec.ts` (8 fixes)
- Modify: `e2e/platform-hardening.spec.ts` (5 fixes)
- Modify: `e2e/character.spec.ts` (4 fixes)

**Same approach as Task 1.**

**Commit:** `fix(e2e): replace useless assertions in recommendations, plugins, platform, character tests`

---

### Task 4: Fix error-handling, technical-debt, responsive, webhooks (11 assertions)

**Files:**
- Modify: `e2e/error-handling.spec.ts` (4 fixes)
- Modify: `e2e/technical-debt-recommendations.spec.ts` (3 fixes)
- Modify: `e2e/responsive.spec.ts` (2 fixes)
- Modify: `e2e/webhooks.spec.ts` (2 fixes)

**Same approach as Task 1.**

**Commit:** `fix(e2e): replace useless assertions in error-handling, responsive, webhooks tests`

---

### Task 5: Final verification + audit

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect 2017+ tests passing, 0 failures
3. Run `grep -c "typeof.*toBe.*boolean" e2e/*.spec.ts` — expect ALL files show 0
4. Count total E2E test cases: `grep -c "test(" e2e/*.spec.ts | awk -F: '{sum+=$2} END {print sum}'`

**Commit:** None (verification only).
