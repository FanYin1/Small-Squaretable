# Test Coverage Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill all unit test gaps for untested services, clean up PLACEHOLDER noise, fix silent error swallowing, and bring E2E tests from "silently skipping" to actually running.

**Architecture:** 4 modules, 12 tasks. M1 adds unit tests for 4 untested services. M2 cleans up 12 PLACEHOLDER comments and 3 silent catches. M3 adds route-level tests for 4 high-traffic untested routes. M4 fixes E2E test reliability with a database seed script.

---

## Context

**Current state:**
- 1337 unit tests passing, 0 failures, 17 skipped
- E2E: 28 tests silently skip in intelligence.spec.ts (17) and chat.spec.ts (11) due to missing DB state
- 4 services have zero test coverage: `oauth.service.ts`, `totp.service.ts`, `experiment-analysis.service.ts`, `intelligence-debug.service.ts`
- 12 PLACEHOLDER comments in admin/experiments/auth test files
- 3 silent catch blocks swallow errors without logging

**Test patterns:** This project uses `vitest` with `vi.mock()` for dependency injection. Mocks are declared with `vi.hoisted()` before `vi.mock()` calls. Logger is always mocked. Repositories are mocked at module level.

---

### Task 1: Unit tests for `totp.service.ts`

**Files:**
- Create: `src/server/services/totp.service.spec.ts`

**What to do:**
1. Mock `../../core/config` with a fake `jwtSecret` and `totpEncryptionKey`
2. Test `encrypt()` + `decrypt()` round-trip: encrypt a string, decrypt it, assert equality
3. Test `decrypt()` with tampered ciphertext throws
4. Test `generateSetup()` returns `encryptedSecret`, `uri`, `qrDataUrl`, `base32Secret` — mock `QRCode.toDataURL`
5. Test `verify()` with a valid TOTP code (generate a secret, create a TOTP, get current code, verify)
6. Test `verify()` with an invalid code returns false
7. Test `generateBackupCodes()` returns 10 plain codes and 10 hashed codes
8. Test `verifyBackupCode()` matches a known code against its hash, returns the record
9. Test `verifyBackupCode()` returns null for wrong code

**Commit:** `test: add unit tests for totp.service`

---

### Task 2: Unit tests for `oauth.service.ts`

**Files:**
- Create: `src/server/services/oauth.service.spec.ts`

**What to do:**
1. Mock `arctic` (Google, GitHub, generateState, generateCodeVerifier), `../../core/config`, `../../db/repositories/oauth.repository`, `../../db/repositories/user.repository`, `../../db/repositories/tenant.repository`, `../../core/jwt`, `../../core/redis`, global `fetch`
2. Test `isSupported('google')` → true, `isSupported('twitter')` → false
3. Test `getAuthorizationUrl('google')` returns url, state, codeVerifier
4. Test `getAuthorizationUrl('invalid')` throws BadRequestError
5. Test `handleCallback('google', code, verifier)` — mock Google token exchange + fetch profile
6. Test `handleCallback('github', code, verifier)` — mock GitHub token exchange + fetch profile (including email fallback from /user/emails)
7. Test `authenticateWithOAuth()` — 3 scenarios:
   - Existing OAuth link → returns existing user + tokens
   - Email match → links account + returns existing user
   - New user → creates tenant + user + link, returns isNewUser=true
8. Test deactivated user throws BadRequestError

**Commit:** `test: add unit tests for oauth.service`

---

### Task 3: Unit tests for `experiment-analysis.service.ts`

**Files:**
- Create: `src/server/services/experiment-analysis.service.spec.ts`

**What to do:**
1. Mock `../../core/clickhouse` with a fake `getClickHouseClient` returning `{ query: vi.fn() }`
2. Mock `./logger.service`
3. Test `getExperimentResults(id)` — mock query to return variant metrics, assert correct structure
4. Test `getExperimentResults(id)` when ClickHouse throws — returns empty array, logs error

**Commit:** `test: add unit tests for experiment-analysis.service`

---

### Task 4: Unit tests for `intelligence-debug.service.ts`

**Files:**
- Create: `src/server/services/intelligence-debug.service.spec.ts`

**What to do:**
1. Mock `../../db/repositories/memory.repository`, `../../db/repositories/emotion.repository`, `./memory.service`, `./emotion.service`, `./chat.service`
2. Test `recordRetrieval()` stores data, then `getDebugState()` returns it
3. Test `recordLatency()` updates the correct metric
4. Test `incrementMessageCounter()` increments and returns count
5. Test `resetMessageCounter()` resets to 0 and sets lastExtractedAt
6. Test `getDebugState()` for a new chatId returns zeroed defaults
7. Test `clearDebugData()` removes the entry
8. Test chatId fallback key: when chatId is undefined, uses `${characterId}-${userId}`

**Commit:** `test: add unit tests for intelligence-debug.service`

---

### Task 5: Clean up PLACEHOLDER comments

**Files:**
- Modify: `src/server/routes/admin/admin.spec.ts` — Remove 8 PLACEHOLDER comments
- Modify: `src/server/routes/admin/experiments.spec.ts` — Remove 3 PLACEHOLDER comments
- Modify: `src/server/routes/auth-password-reset.spec.ts` — Remove 1 PLACEHOLDER comment

**What to do:**
1. Delete all lines containing `PLACEHOLDER` in these 3 files
2. Verify tests still pass: `npx vitest run src/server/routes/admin/admin.spec.ts src/server/routes/admin/experiments.spec.ts src/server/routes/auth-password-reset.spec.ts`

**Commit:** `chore: remove leftover PLACEHOLDER comments from test files`

---

### Task 6: Fix silent catch blocks

**Files:**
- Modify: `src/server/services/plugin.service.ts` ~line 95
- Modify: `src/server/routes/intelligence.ts` ~line 229
- Modify: `src/server/routes/llm.ts` ~line 72

**What to do:**
1. In `plugin.service.ts`, replace the empty catch with:
   ```typescript
   } catch (err) {
     logger.warn('Plugin sandbox load failed (non-fatal)', { pluginId, error: String(err) });
   }
   ```
   (Import logger if not already imported)

2. In `intelligence.ts`, replace `catch { // ML service not available }` with:
   ```typescript
   } catch (err) {
     logger.warn('ML service unavailable for intelligence debug', { error: String(err) });
   }
   ```

3. In `llm.ts`, replace `catch { // 忽略解析错误 }` with:
   ```typescript
   } catch (err) {
     logger.debug('SSE chunk parse error (non-fatal)', { error: String(err) });
   }
   ```

**Commit:** `fix: add logging to silent catch blocks in plugin, intelligence, and llm`

---

### Task 7: Route tests for `notifications.ts`

**Files:**
- Create: `src/server/routes/notifications.spec.ts`

**What to do:**
1. Read `src/server/routes/notifications.ts` to understand endpoints
2. Mock auth middleware, notification service
3. Test GET `/` returns notification list
4. Test GET `/unread-count` returns count
5. Test PATCH `/:id/read` marks notification as read
6. Test POST `/mark-all-read` marks all as read

**Commit:** `test: add route tests for notifications`

---

### Task 8: Route tests for `reports.ts`

**Files:**
- Create: `src/server/routes/reports.spec.ts`

**What to do:**
1. Read `src/server/routes/reports.ts` to understand endpoints
2. Mock auth middleware, report/moderation service
3. Test POST `/` creates a report with valid input
4. Test POST `/` rejects invalid input (missing fields)

**Commit:** `test: add route tests for reports`

---

### Task 9: Route tests for `developer.ts`

**Files:**
- Create: `src/server/routes/developer.spec.ts`

**What to do:**
1. Read `src/server/routes/developer.ts` to understand endpoints
2. Mock auth middleware, apiKey service
3. Test POST `/api-keys` creates a key
4. Test GET `/api-keys` lists keys
5. Test DELETE `/api-keys/:id` revokes a key

**Commit:** `test: add route tests for developer`

---

### Task 10: Route tests for `webhooks.ts`

**Files:**
- Create: `src/server/routes/webhooks.spec.ts`

**What to do:**
1. Read `src/server/routes/webhooks.ts` to understand endpoints
2. Mock auth middleware, webhook service/repository
3. Test POST `/` creates a webhook
4. Test GET `/` lists webhooks
5. Test PATCH `/:id` updates a webhook
6. Test DELETE `/:id` deletes a webhook

**Commit:** `test: add route tests for webhooks`

---

### Task 11: E2E database seed script + fix skips

**Files:**
- Create: `e2e/seed.ts` — Database seed script
- Modify: `e2e/intelligence.spec.ts` — Remove conditional skips, use seeded data
- Modify: `e2e/chat.spec.ts` — Remove conditional skips, use seeded data
- Modify: `playwright.config.ts` — Add globalSetup pointing to seed script

**What to do:**
1. Create `e2e/seed.ts` that:
   - Connects to the test database
   - Creates a test user, tenant, character, and chat
   - Stores credentials in a JSON file (`e2e/.auth-state.json`) for tests to read
2. Update `playwright.config.ts` to run `e2e/seed.ts` as `globalSetup`
3. In `intelligence.spec.ts`, replace the 17 `test.skip` patterns with direct assertions using seeded character ID
4. In `chat.spec.ts`, replace the 11 `test.skip` patterns with direct assertions using seeded chat ID
5. Run `npx playwright test e2e/intelligence.spec.ts e2e/chat.spec.ts` to verify

**Commit:** `test: add E2E database seed script and fix conditional skips`

---

### Task 12: Run full test suite and update docs

**Files:**
- Modify: `ROADMAP.md` — Add 迭代 11 section
- Modify: `CLAUDE.md` — Update status to Iteration 11

**What to do:**
1. Run `npx vitest run` — verify all tests pass (should be ~1400+ now)
2. Update ROADMAP.md with 迭代 11 section
3. Update CLAUDE.md status to Iteration 11

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 11 (Test Coverage)`
