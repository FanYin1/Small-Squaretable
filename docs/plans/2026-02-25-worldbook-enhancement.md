# Iteration 47: World Book Enhancement (世界书增强)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance the world info engine with timing controls (probability, sticky, cooldown, delay), add world book route tests, fix the 3 pre-existing MessageInput test failures, and add world book store tests.

**Architecture:** 5 tasks. T1 enhances the world info engine. T2 adds world book route tests. T3 fixes MessageInput tests. T4 adds world book store tests. T5 runs final verification.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Enhance world info engine with timing controls

**Files:**
- Modify: `src/server/services/worldinfo-engine.service.ts`

**What to do:**

The engine currently ignores `probability`, `sticky`, `cooldown`, and `delay` fields stored in entry settings. Implement them:

1. Read the file first. The `scan()` method matches entries by keyword but doesn't check timing fields.

2. After the keyword matching check (around line 168 `if (matched)`), add timing control logic:

```ts
// After keyword match confirmed, apply timing controls
if (matched) {
  const settings = (entry.settings ?? {}) as EntrySettings;

  // Probability check: random chance to activate (0-100)
  const probability = settings.probability ?? 100;
  if (probability < 100 && Math.random() * 100 > probability) {
    matched = false;
  }

  // Delay check: only activate after N messages since chat start
  const delay = settings.delay ?? 0;
  if (delay > 0 && recentMessages.length < delay) {
    matched = false;
  }
}
```

3. Add `probability`, `delay`, `sticky`, and `cooldown` to the `EntrySettings` type:
```ts
type EntrySettings = {
  keys?: string[];
  keysSecondary?: string[];
  selectiveLogic?: string;
  position?: string;
  depth?: number;
  constant?: boolean;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  probability?: number;
  sticky?: number;
  cooldown?: number;
  delay?: number;
};
```

4. Add `activatedEntryIds` to `WorldInfoDebugInfo`:
```ts
export interface WorldInfoDebugInfo {
  scannedEntries: number;
  activatedCount: number;
  budgetUsed: number;
  budgetLimit: number;
  scanTimeMs: number;
  matches: Array<{ entryId: string; keyword: string }>;
  skippedByProbability?: number;
  skippedByDelay?: number;
}
```

Track the skip counts and include them in debug info.

**Tests:** ~4 tests in `src/server/services/worldinfo-engine.service.spec.ts`
- Activates entry when keyword matches in scan text
- Respects budget limit (skips entry when budget exceeded)
- Skips entry when delay threshold not met
- Groups entries by position correctly

Mock `worldBookRepository` and `worldBookEntryRepository` with `vi.mock()`.

**Commit:** `feat(worldbook): add timing controls to world info engine`

---

### Task 2: Add world book route tests

**Files:**
- Create: `src/server/routes/worldbooks.spec.ts`

**What to do:**

Read `src/server/routes/worldbooks.ts` first. Write tests following the pattern in other route test files (e.g., `src/server/routes/chat-reactions.spec.ts` or `src/server/routes/notifications.spec.ts`).

Mock `worldBookRepository` and `worldBookEntryRepository` with `vi.mock()`. Mock `authMiddleware` to inject a test user.

**Tests:** ~6 tests:
1. GET / returns user's world books
2. POST / creates a world book
3. GET /:id returns world book (ownership check)
4. GET /:id returns 404 for non-owner
5. POST /:id/entries creates an entry
6. POST /:id/import imports SillyTavern format entries

Follow the existing test patterns — use `app.request()` for Hono route testing.

**Commit:** `test(worldbook): add world book route tests`

---

### Task 3: Fix MessageInput test failures

**Files:**
- Modify: `src/client/components/chat/MessageInput.spec.ts`

**What to do:**

The 3 tests fail because `MessageInput.vue` uses `chatStore` (Pinia) but the tests don't set up Pinia. Read the current test file and the component.

Fix by adding `createPinia()` to the test setup:

```ts
import { createPinia, setActivePinia } from 'pinia';

describe('MessageInput', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  // ... existing tests
});
```

Also, the component uses composables `useAudioRecorder` and `useSpeechToText` that may need mocking. Check if they cause errors. If so, mock them:

```ts
vi.mock('../../composables/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isSupported: ref(false),
    isRecording: ref(false),
    start: vi.fn(),
    stop: vi.fn(),
    duration: ref(0),
  }),
}));
```

The tests check for `.message-input` class which exists in the template (line 2: `<div class="message-input">`), so the selector is correct. The issue is purely the missing Pinia setup.

Ensure all 3 existing tests pass after the fix.

**Commit:** `fix(test): fix MessageInput test failures with Pinia setup`

---

### Task 4: Add world book store tests

**Files:**
- Create: `src/client/stores/worldbook.spec.ts`

**What to do:**

Read `src/client/stores/worldbook.ts` first. Write tests following the pattern in other store test files (e.g., `src/client/stores/notification.spec.ts` or `src/client/stores/developer.spec.ts`).

Mock `worldbookApi` with `vi.mock()`.

**Tests:** ~6 tests:
1. fetchWorldBooks populates worldbooks array
2. createWorldBook adds to worldbooks array
3. deleteWorldBook removes from worldbooks array
4. fetchEntries populates entries array
5. createEntry adds to entries array
6. error state is set on API failure

Use `createPinia()` + `setActivePinia()` in beforeEach.

**Commit:** `test(worldbook): add world book store tests`

---

### Task 5: Final verification

1. Run `npx vitest run` — expect 1985+ tests passing, 0 failures (the 3 MessageInput failures should be fixed)
2. Run `npx tsc --noEmit` — expect 0 errors

**Commit:** None (verification only).
