# Iteration 4: Platform Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-critical auth hardening (email, OAuth, 2FA), admin panel with RBAC, audit logging, and GDPR compliance to the SaaS platform.

**Architecture:** Six modules built bottom-up: email service (foundation) → OAuth + 2FA (auth hardening) → RBAC + admin panel (governance) → audit logging (observability) → GDPR compliance (regulatory). Each module builds on the previous. Database migrations use Drizzle ORM. All new routes follow the existing Hono.js pattern with Zod validation.

**Tech Stack:** Nodemailer (email), Arctic (OAuth2 PKCE), otpauth (TOTP), Drizzle ORM (migrations), bcrypt (backup codes), QRCode (2FA setup), Hono.js middleware (RBAC), archiver (ZIP export)

---

## Context for Implementers

**Project location:** `/var/aichat/Small-Squaretable`

**Key patterns to follow:**
- **Routes:** Hono.js with `zValidator('json', schema)` or `zValidator('query', schema)`. Return `{ success: true, data: {...}, meta: { timestamp } }`.
- **Auth:** `authMiddleware()` sets `c.get('user')` (AuthUser) and `c.get('tenantId')`.
- **DB Schema:** Drizzle ORM in `src/db/schema/`. Tables use `pgTable()`, export from `src/db/schema/index.ts`.
- **Repositories:** Extend `BaseRepository` in `src/db/repositories/`, export singleton instance.
- **Services:** Business logic in `src/server/services/`, plain classes or objects.
- **Frontend API:** `src/client/services/api.ts` exports `api.get/post/patch/put/delete`. Create `<name>.api.ts` files.
- **Frontend stores:** Pinia composition stores in `src/client/stores/`.
- **Frontend routes:** `src/client/router/routes.ts`, lazy-loaded with `() => import(...)`.
- **Tests:** Vitest, co-located as `*.spec.ts`. Use `describe/it/expect`. Mock DB/Redis in tests.
- **Config:** `src/core/config.ts` exports typed config object. Add new env vars there.
- **Errors:** Use `AppError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError` from `src/core/errors.ts`.
- **Run tests:** `npx vitest run <path>` (single run, no watch mode).

**Existing auth flow:**
1. `POST /api/v1/auth/register` → creates tenant + user, returns JWT pair
2. `POST /api/v1/auth/login` → validates email+password, returns JWT pair
3. `POST /api/v1/auth/refresh` → exchanges refresh token
4. JWT payload: `{ userId, tenantId, email }`
5. Refresh tokens stored in Redis with 7-day TTL

**Users table columns (current):** id, tenantId, email, passwordHash, displayName, avatarUrl, isActive, emailVerified, createdAt, updatedAt, lastLoginAt, followerCount, followingCount

---

## Module 1: Email Service

### Task 1: Email Infrastructure (Config + Transport + Templates)

**Files:**
- Modify: `src/core/config.ts` — Add email config fields
- Create: `src/core/email/transport.ts` — Nodemailer transport factory
- Create: `src/core/email/templates.ts` — HTML email template renderer
- Create: `src/core/email/index.ts` — Public API
- Test: `src/core/email/email.spec.ts`

**Step 1: Install dependencies**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

**Step 2: Add email config to `src/core/config.ts`**

Add these fields to the Config type and parser:

```typescript
// Add to Config type
smtpHost: string;
smtpPort: number;
smtpUser: string;
smtpPass: string;
smtpFrom: string;       // e.g. "Small Squaretable <noreply@example.com>"
appUrl: string;          // e.g. "https://app.example.com" — used in email links
```

Parse from env with defaults:
```typescript
smtpHost: process.env.SMTP_HOST || 'localhost',
smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
smtpUser: process.env.SMTP_USER || '',
smtpPass: process.env.SMTP_PASS || '',
smtpFrom: process.env.SMTP_FROM || 'Small Squaretable <noreply@localhost>',
appUrl: process.env.APP_URL || 'http://localhost:5173',
```

**Step 3: Create `src/core/email/transport.ts`**

```typescript
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

export function getEmailTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? {
        user: config.smtpUser,
        pass: config.smtpPass,
      } : undefined,
    });
  }
  return transporter;
}
```

**Step 4: Create `src/core/email/templates.ts`**

Implement a simple template system with these templates:
- `email-verification` — Subject: "Verify your email", body with verification link
- `password-reset` — Subject: "Reset your password", body with reset link
- `welcome` — Subject: "Welcome to Small Squaretable"

Each template is a function `(vars: Record<string, string>) => { subject: string; html: string }`. Use inline HTML (no external template engine needed). Include a base layout wrapper with consistent styling.

**Step 5: Create `src/core/email/index.ts`**

```typescript
import { getEmailTransport } from './transport';
import { renderTemplate } from './templates';
import { config } from '../config';

export async function sendEmail(to: string, templateName: string, vars: Record<string, string>): Promise<void> {
  const { subject, html } = renderTemplate(templateName, vars);
  const transport = getEmailTransport();
  await transport.sendMail({
    from: config.smtpFrom,
    to,
    subject,
    html,
  });
}

export { renderTemplate } from './templates';
```

**Step 6: Write tests in `src/core/email/email.spec.ts`**

Test:
- `renderTemplate('email-verification', { link, name })` returns correct subject and HTML containing the link
- `renderTemplate('password-reset', { link, name })` returns correct subject and HTML
- `renderTemplate('welcome', { name })` returns correct subject
- `sendEmail` calls transport.sendMail with correct args (mock nodemailer)

**Step 7: Run tests**

```bash
npx vitest run src/core/email/email.spec.ts
```

**Step 8: Commit**

```bash
git add src/core/email/ src/core/config.ts package.json package-lock.json
git commit -m "feat(iter4): add email service with templates (M1)"
```

---

### Task 2: Password Reset Flow

**Files:**
- Create: `src/db/schema/password-reset-tokens.ts` — Token table schema
- Modify: `src/db/schema/index.ts` — Export new schema
- Create: `src/db/repositories/password-reset.repository.ts` — Token CRUD
- Modify: `src/server/services/auth.service.ts` — Add forgot/reset password methods
- Modify: `src/server/routes/auth.ts` — Add forgot/reset endpoints
- Test: `src/server/routes/auth-password-reset.spec.ts`

**Step 1: Create `src/db/schema/password-reset-tokens.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256 hash
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Export from `src/db/schema/index.ts`.

**Step 2: Create `src/db/repositories/password-reset.repository.ts`**

Methods:
- `create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>`
- `findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>` — only returns unused, non-expired tokens
- `markUsed(id: string): Promise<void>`
- `deleteByUserId(userId: string): Promise<void>` — cleanup old tokens

**Step 3: Add to auth service (`src/server/services/auth.service.ts`)**

```typescript
async forgotPassword(email: string): Promise<void> {
  const user = await userRepository.findByEmail(email);
  if (!user) return; // Silent — don't reveal if email exists

  // Delete any existing tokens for this user
  await passwordResetRepository.deleteByUserId(user.id);

  // Generate random token, hash it, store hash
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await passwordResetRepository.create(user.id, tokenHash, expiresAt);

  // Send email with unhashed token in link
  await sendEmail(user.email, 'password-reset', {
    name: user.displayName || 'there',
    link: `${config.appUrl}/auth/reset-password?token=${token}`,
  });
}

async resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await passwordResetRepository.findByTokenHash(tokenHash);

  if (!record) throw new BadRequestError('Invalid or expired reset token');

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userRepository.updatePassword(record.userId, hash);
  await passwordResetRepository.markUsed(record.id);

  // Invalidate all refresh tokens for this user
  await redis.del(`refresh_token:${record.userId}:*`);
}
```

**Step 4: Add routes to `src/server/routes/auth.ts`**

```typescript
// POST /api/v1/auth/forgot-password
// Body: { email: string }
// Response: 200 { success: true } (always, to prevent enumeration)

// POST /api/v1/auth/reset-password
// Body: { token: string, password: string }
// Response: 200 { success: true } or 400 error
```

Rate limit: 3 requests per 15 minutes for forgot-password.

**Step 5: Write tests**

Test:
- Forgot password with valid email sends email (mock sendEmail)
- Forgot password with unknown email returns 200 (no leak)
- Reset password with valid token changes password
- Reset password with expired token returns 400
- Reset password with used token returns 400
- Rate limiting on forgot-password endpoint

**Step 6: Run tests and commit**

```bash
npx vitest run src/server/routes/auth-password-reset.spec.ts
git add src/db/schema/ src/db/repositories/ src/server/services/ src/server/routes/
git commit -m "feat(iter4): add password reset flow (M1)"
```

---

### Task 3: Email Verification Flow

**Files:**
- Modify: `src/db/schema/users.ts` — Add `emailVerificationToken` column
- Modify: `src/server/services/auth.service.ts` — Send verification on register, add verify method
- Modify: `src/server/routes/auth.ts` — Add verify-email and resend-verification endpoints
- Test: `src/server/routes/auth-email-verify.spec.ts`

**Step 1: Add verification token to users table**

Add to `src/db/schema/users.ts`:
```typescript
emailVerificationToken: varchar('email_verification_token', { length: 64 }),
```

**Step 2: Modify register flow in auth service**

After creating user, generate verification token (same SHA-256 pattern as password reset), store hash in `emailVerificationToken` column, send verification email.

```typescript
// In register():
const verifyToken = crypto.randomBytes(32).toString('hex');
const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
// Store verifyHash in user.emailVerificationToken
// Send email with unhashed token
await sendEmail(email, 'email-verification', {
  name: displayName || 'there',
  link: `${config.appUrl}/auth/verify-email?token=${verifyToken}`,
});
```

**Step 3: Add verify and resend methods to auth service**

```typescript
async verifyEmail(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // Find user by emailVerificationToken = tokenHash
  // Set emailVerified = true, emailVerificationToken = null
}

async resendVerification(userId: string): Promise<void> {
  // Generate new token, update user, send email
  // Rate limit: max 3 per hour (check in route)
}
```

**Step 4: Add routes**

```typescript
// GET /api/v1/auth/verify-email?token=xxx — Public, verifies email
// POST /api/v1/auth/resend-verification — Requires auth, resends verification email
```

**Step 5: Write tests**

Test:
- Register sends verification email
- Verify email with valid token sets emailVerified = true
- Verify email with invalid token returns 400
- Resend verification generates new token and sends email
- Resend verification rate limited

**Step 6: Run tests and commit**

```bash
npx vitest run src/server/routes/auth-email-verify.spec.ts
git add src/db/schema/ src/server/services/ src/server/routes/
git commit -m "feat(iter4): add email verification flow (M1)"
```

---

### Task 4: Frontend Password Reset & Email Verification Pages

**Files:**
- Create: `src/client/pages/auth/ForgotPassword.vue` — Forgot password form
- Create: `src/client/pages/auth/ResetPassword.vue` — Reset password form (with token from URL)
- Create: `src/client/pages/auth/VerifyEmail.vue` — Email verification landing page
- Modify: `src/client/services/auth.api.ts` — Add API methods
- Modify: `src/client/router/routes.ts` — Add routes
- Modify: `src/client/pages/auth/Login.vue` — Add "Forgot password?" link

**Step 1: Add API methods to `src/client/services/auth.api.ts`**

```typescript
forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
verifyEmail: (token: string) => api.get(`/auth/verify-email?token=${token}`),
resendVerification: () => api.post('/auth/resend-verification'),
```

**Step 2: Create ForgotPassword.vue**

Simple form: email input + submit button. On success, show "Check your email" message. Use Element Plus `el-form` + `el-input` + `el-button`. Match existing auth page styling.

**Step 3: Create ResetPassword.vue**

Read `token` from `route.query.token`. Form: new password + confirm password. On success, redirect to login with success message.

**Step 4: Create VerifyEmail.vue**

Read `token` from `route.query.token`. Auto-call verify API on mount. Show success/error state. Link to login on success.

**Step 5: Add routes and update Login.vue**

Add routes: `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` (all guest-only).
Add "Forgot password?" link to Login.vue below the password field.

**Step 6: Commit**

```bash
git add src/client/
git commit -m "feat(iter4): add password reset and email verification pages (M1)"
```

---

## Module 2: OAuth/SSO

### Task 5: OAuth Infrastructure (Arctic + Provider Registry)

**Files:**
- Create: `src/db/schema/oauth-accounts.ts` — OAuth accounts table
- Modify: `src/db/schema/index.ts` — Export new schema
- Create: `src/db/repositories/oauth.repository.ts` — OAuth account CRUD
- Create: `src/server/services/oauth.service.ts` — Provider registry, token exchange, profile normalization
- Create: `src/server/routes/oauth.ts` — OAuth redirect + callback routes
- Modify: `src/server/index.ts` — Mount OAuth routes
- Modify: `src/core/config.ts` — Add OAuth config
- Test: `src/server/routes/oauth.spec.ts`

**Step 1: Install dependencies**

```bash
npm install arctic
```

**Step 2: Add OAuth config to `src/core/config.ts`**

```typescript
googleClientId: string;
googleClientSecret: string;
githubClientId: string;
githubClientSecret: string;
oauthCallbackBase: string; // e.g. "https://app.example.com/api/v1/auth/oauth"
```

Parse from env:
```typescript
googleClientId: process.env.GOOGLE_CLIENT_ID || '',
googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
githubClientId: process.env.GITHUB_CLIENT_ID || '',
githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
oauthCallbackBase: process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000/api/v1/auth/oauth',
```

**Step 3: Create `src/db/schema/oauth-accounts.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(), // 'google' | 'github'
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  providerAccountUnique: uniqueIndex('oauth_provider_account_idx').on(table.provider, table.providerAccountId),
}));
```

Export from `src/db/schema/index.ts`.

**Step 4: Create `src/db/repositories/oauth.repository.ts`**

Methods:
- `findByProviderAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | null>`
- `findByUserId(userId: string): Promise<OAuthAccount[]>`
- `create(data: NewOAuthAccount): Promise<OAuthAccount>`
- `deleteByUserIdAndProvider(userId: string, provider: string): Promise<boolean>`

**Step 5: Create `src/server/services/oauth.service.ts`**

```typescript
import { Google, GitHub } from 'arctic';
import { config } from '../../core/config';

// Initialize providers
const google = new Google(config.googleClientId, config.googleClientSecret, `${config.oauthCallbackBase}/google/callback`);
const github = new GitHub(config.githubClientId, config.githubClientSecret, `${config.oauthCallbackBase}/github/callback`);

interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export const oauthService = {
  // Generate authorization URL with state + PKCE
  getAuthorizationUrl(provider: string): { url: string; state: string; codeVerifier: string },

  // Exchange code for tokens, fetch profile
  handleCallback(provider: string, code: string, codeVerifier: string): Promise<OAuthProfile>,

  // Link or create user from OAuth profile
  // 1. Check if oauth_account exists → login existing user
  // 2. Check if email matches existing user → link account + login
  // 3. Create new user (emailVerified=true) + link account + login
  authenticateWithOAuth(profile: OAuthProfile): Promise<{ user: AuthUser; tokens: AuthTokens; isNewUser: boolean }>,
};
```

**Step 6: Create `src/server/routes/oauth.ts`**

```typescript
// GET /api/v1/auth/oauth/:provider
// → Generate state + codeVerifier, store in Redis (5 min TTL)
// → Redirect to provider authorization URL

// GET /api/v1/auth/oauth/:provider/callback
// → Verify state from Redis, exchange code with codeVerifier
// → Call oauthService.authenticateWithOAuth()
// → Redirect to frontend with short-lived auth code:
//   ${config.appUrl}/auth/oauth-callback?code=<authCode>
// The authCode is stored in Redis (30s TTL) and exchanged for JWT pair
// via existing /auth/login or a new /auth/oauth/exchange endpoint

// POST /api/v1/auth/oauth/exchange
// Body: { code: string }
// → Look up authCode in Redis, return JWT pair
```

Mount in `src/server/index.ts` under the auth route group.

**Step 7: Write tests**

Test:
- getAuthorizationUrl returns valid URL with state
- handleCallback with valid code returns profile (mock Arctic)
- authenticateWithOAuth with new email creates user + oauth_account
- authenticateWithOAuth with existing email links account
- authenticateWithOAuth with existing oauth_account logs in
- Callback with invalid state returns 400
- Exchange with valid code returns tokens
- Exchange with expired code returns 400

**Step 8: Run tests and commit**

```bash
npx vitest run src/server/routes/oauth.spec.ts
git add src/core/ src/db/ src/server/ package.json package-lock.json
git commit -m "feat(iter4): add OAuth2 with Google and GitHub (M2)"
```

---

### Task 6: Frontend OAuth Login Buttons

**Files:**
- Modify: `src/client/pages/auth/Login.vue` — Add OAuth buttons
- Modify: `src/client/pages/auth/Register.vue` — Add OAuth buttons
- Create: `src/client/pages/auth/OAuthCallback.vue` — Handle OAuth redirect
- Modify: `src/client/services/auth.api.ts` — Add OAuth exchange method
- Modify: `src/client/router/routes.ts` — Add OAuth callback route

**Step 1: Add OAuth exchange API method**

```typescript
oauthExchange: (code: string) => api.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/oauth/exchange', { code }),
```

**Step 2: Create OAuthCallback.vue**

Reads `code` from query params, calls `oauthExchange`, stores tokens, redirects to dashboard. Shows loading spinner during exchange, error state on failure.

**Step 3: Add OAuth buttons to Login.vue and Register.vue**

Add a divider "Or continue with" and two buttons:
- "Continue with Google" (Google icon)
- "Continue with GitHub" (GitHub icon)

Each button navigates to `/api/v1/auth/oauth/:provider` (full page redirect, not SPA navigation).

**Step 4: Add route**

```typescript
{ path: '/auth/oauth-callback', component: () => import('../pages/auth/OAuthCallback.vue'), meta: { guest: true } }
```

**Step 5: Commit**

```bash
git add src/client/
git commit -m "feat(iter4): add OAuth login buttons and callback page (M2)"
```

---

## Module 3: Two-Factor Authentication (2FA/MFA)

### Task 7: TOTP Backend (Setup, Verify, Backup Codes)

**Files:**
- Modify: `src/db/schema/users.ts` — Add `totpSecret`, `totpEnabled` columns
- Create: `src/db/schema/backup-codes.ts` — Backup codes table
- Modify: `src/db/schema/index.ts` — Export new schema
- Create: `src/db/repositories/backup-code.repository.ts`
- Create: `src/server/services/totp.service.ts` — TOTP operations
- Create: `src/server/routes/mfa.ts` — MFA setup/disable/challenge endpoints
- Modify: `src/server/services/auth.service.ts` — Modify login flow for MFA
- Modify: `src/server/index.ts` — Mount MFA routes
- Test: `src/server/routes/mfa.spec.ts`

**Step 1: Install dependencies**

```bash
npm install otpauth qrcode
npm install -D @types/qrcode
```

**Step 2: Add columns to users table**

```typescript
// Add to src/db/schema/users.ts
totpSecret: varchar('totp_secret', { length: 255 }), // AES-256-GCM encrypted
totpEnabled: boolean('totp_enabled').default(false).notNull(),
```

**Step 3: Create `src/db/schema/backup-codes.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const backupCodes = pgTable('backup_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 60 }).notNull(), // bcrypt
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Export from `src/db/schema/index.ts`.

**Step 4: Create `src/db/repositories/backup-code.repository.ts`**

Methods:
- `createBatch(userId: string, codeHashes: string[]): Promise<void>`
- `findUnusedByUserId(userId: string): Promise<BackupCode[]>`
- `markUsed(id: string): Promise<void>`
- `deleteByUserId(userId: string): Promise<void>`

**Step 5: Create `src/server/services/totp.service.ts`**

```typescript
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const ENCRYPTION_KEY = crypto.createHash('sha256').update(config.jwtSecret).digest(); // derive from JWT secret
const APP_NAME = 'SmallSquaretable';

export const totpService = {
  // Generate new TOTP secret, return { secret (encrypted), uri, qrDataUrl }
  async generateSetup(email: string): Promise<{ encryptedSecret: string; uri: string; qrDataUrl: string }>,

  // Verify a TOTP code against encrypted secret (window: ±1)
  verify(encryptedSecret: string, code: string): boolean,

  // Generate 10 backup codes, return { plainCodes, hashedCodes }
  async generateBackupCodes(): Promise<{ plainCodes: string[]; hashedCodes: string[] }>,

  // Verify a backup code against stored hashes
  async verifyBackupCode(code: string, hashedCodes: BackupCode[]): Promise<BackupCode | null>,

  // AES-256-GCM encrypt/decrypt helpers
  encrypt(text: string): string,
  decrypt(encrypted: string): string,
};
```

**Step 6: Create `src/server/routes/mfa.ts`**

```typescript
// All routes require authMiddleware()

// POST /api/v1/auth/mfa/setup
// → Generate TOTP secret + QR code
// → Store encrypted secret on user (but totpEnabled stays false)
// → Return { qrDataUrl, secret (base32, for manual entry) }

// POST /api/v1/auth/mfa/verify-setup
// Body: { code: string }
// → Verify code against stored secret
// → Set totpEnabled = true
// → Generate and return backup codes (show once)
// → Return { backupCodes: string[] }

// POST /api/v1/auth/mfa/disable
// Body: { code: string } (require current TOTP code to disable)
// → Verify code, set totpEnabled = false, clear secret, delete backup codes

// POST /api/v1/auth/mfa/challenge
// Body: { mfaToken: string, code: string }
// → No auth middleware (user isn't fully authenticated yet)
// → Verify mfaToken from Redis, verify TOTP code (or backup code)
// → Return JWT pair

// GET /api/v1/auth/mfa/backup-codes
// → Regenerate backup codes (invalidates old ones)
// → Return { backupCodes: string[] }
```

**Step 7: Modify login flow in auth service**

```typescript
// In login():
// After validating email + password:
if (user.totpEnabled) {
  // Generate short-lived mfaToken, store in Redis (5 min TTL)
  const mfaToken = crypto.randomBytes(32).toString('hex');
  await redis.set(`mfa:${mfaToken}`, user.id, { EX: 300 });
  return { requiresMfa: true, mfaToken };
}
// Otherwise return JWT pair as before
```

**Step 8: Write tests**

Test:
- Setup returns QR code and secret
- Verify-setup with correct code enables TOTP and returns backup codes
- Verify-setup with wrong code returns 400
- Login with TOTP enabled returns requiresMfa + mfaToken
- Challenge with valid mfaToken + code returns JWT pair
- Challenge with valid mfaToken + backup code returns JWT pair (and marks code used)
- Challenge with expired mfaToken returns 401
- Challenge rate limited to 5 attempts per mfaToken
- Disable with correct code disables TOTP
- Disable with wrong code returns 400

**Step 9: Run tests and commit**

```bash
npx vitest run src/server/routes/mfa.spec.ts
git add src/db/ src/server/ src/core/ package.json package-lock.json
git commit -m "feat(iter4): add TOTP 2FA with backup codes (M3)"
```

---

### Task 8: Frontend 2FA Setup & Login Challenge

**Files:**
- Create: `src/client/pages/SecuritySettings.vue` — 2FA setup wizard
- Create: `src/client/components/MfaChallenge.vue` — TOTP input dialog
- Modify: `src/client/pages/auth/Login.vue` — Handle MFA challenge response
- Modify: `src/client/services/auth.api.ts` — Add MFA API methods
- Modify: `src/client/stores/auth.ts` — Handle MFA state in login flow
- Modify: `src/client/router/routes.ts` — Add security settings route

**Step 1: Add MFA API methods**

```typescript
mfaSetup: () => api.post<{ qrDataUrl: string; secret: string }>('/auth/mfa/setup'),
mfaVerifySetup: (code: string) => api.post<{ backupCodes: string[] }>('/auth/mfa/verify-setup', { code }),
mfaDisable: (code: string) => api.post('/auth/mfa/disable', { code }),
mfaChallenge: (mfaToken: string, code: string) => api.post<{ user: AuthUser; tokens: AuthTokens }>('/auth/mfa/challenge', { mfaToken, code }),
mfaRegenerateBackupCodes: () => api.get<{ backupCodes: string[] }>('/auth/mfa/backup-codes'),
```

**Step 2: Create SecuritySettings.vue**

Three states:
1. **Not enabled:** "Enable 2FA" button → shows QR code + manual secret + code input
2. **Verify step:** After scanning QR, enter code to confirm → shows backup codes (download/copy)
3. **Enabled:** Status badge, "Disable 2FA" button (requires code), "Regenerate backup codes" button

Add route: `/security` (auth required).

**Step 3: Modify Login.vue for MFA challenge**

When login returns `{ requiresMfa: true, mfaToken }`:
- Show MfaChallenge component (6-digit code input + "Use backup code" toggle)
- On submit, call `mfaChallenge(mfaToken, code)`
- On success, store tokens and redirect

**Step 4: Create MfaChallenge.vue**

Reusable component: 6-digit input with auto-focus, "Use backup code" link that switches to text input, submit button, error display.

**Step 5: Commit**

```bash
git add src/client/
git commit -m "feat(iter4): add 2FA setup wizard and login challenge UI (M3)"
```

---

## Module 4: Admin Panel + RBAC

### Task 9: RBAC Middleware & User Role Schema

**Files:**
- Modify: `src/db/schema/users.ts` — Add `role` column with enum
- Create: `src/server/middleware/rbac.ts` — Role-based access control middleware
- Modify: `src/server/middleware/auth.ts` — Include role in AuthUser
- Modify: `src/types/auth.ts` — Add role to AuthUser type
- Modify: `src/core/jwt.ts` — Include role in access token payload
- Test: `src/server/middleware/rbac.spec.ts`

**Step 1: Add role enum and column to users table**

```typescript
// In src/db/schema/users.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'moderator', 'admin']);

// Add to users table:
role: userRoleEnum('role').default('user').notNull(),
```

**Step 2: Update AuthUser type in `src/types/auth.ts`**

```typescript
export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'moderator' | 'admin'; // NEW
}
```

**Step 3: Update JWT payload in `src/core/jwt.ts`**

Add `role` to `AccessTokenPayload`. Update `generateAccessToken` and `verifyAccessToken`.

**Step 4: Update auth middleware**

In `src/server/middleware/auth.ts`, include `role` when setting `c.set('user', ...)`.

**Step 5: Create `src/server/middleware/rbac.ts`**

```typescript
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { ForbiddenError } from '../../core/errors';

type Role = 'user' | 'moderator' | 'admin';

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
};

export function requireRole(minRole: Role) {
  return createMiddleware(async (c: Context, next) => {
    const user = c.get('user');
    if (!user) throw new ForbiddenError('Authentication required');

    if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
      throw new ForbiddenError(`Requires ${minRole} role or higher`);
    }

    return next();
  });
}
```

**Step 6: Write tests**

Test:
- `requireRole('admin')` allows admin, blocks moderator and user
- `requireRole('moderator')` allows admin and moderator, blocks user
- `requireRole('user')` allows all roles
- Returns 403 with correct error message

**Step 7: Run tests and commit**

```bash
npx vitest run src/server/middleware/rbac.spec.ts
git add src/db/ src/server/ src/types/ src/core/
git commit -m "feat(iter4): add RBAC middleware with role hierarchy (M4)"
```

---

### Task 10: Reports & Moderation Backend

**Files:**
- Create: `src/db/schema/reports.ts` — Reports table
- Create: `src/db/schema/moderation-actions.ts` — Moderation actions table
- Modify: `src/db/schema/index.ts` — Export new schemas
- Create: `src/db/repositories/report.repository.ts`
- Create: `src/db/repositories/moderation.repository.ts`
- Create: `src/server/services/moderation.service.ts` — Report handling, moderation actions
- Create: `src/server/routes/reports.ts` — User-facing report endpoint
- Modify: `src/server/index.ts` — Mount reports route
- Test: `src/server/services/moderation.spec.ts`

**Step 1: Create `src/db/schema/reports.ts`**

```typescript
import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';

export const reportStatusEnum = pgEnum('report_status', ['pending', 'resolved', 'dismissed']);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 20 }).notNull(), // 'character' | 'comment' | 'user'
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  status: reportStatusEnum('status').default('pending').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Step 2: Create `src/db/schema/moderation-actions.ts`**

```typescript
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const moderationActions = pgTable('moderation_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  moderatorId: uuid('moderator_id').notNull().references(() => users.id),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: uuid('target_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'approve' | 'reject' | 'hide' | 'suspend' | 'unsuspend'
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Export both from `src/db/schema/index.ts`.

**Step 3: Create repositories**

`report.repository.ts` methods:
- `create(data): Promise<Report>`
- `findById(id): Promise<Report | null>`
- `findPending(pagination): Promise<PaginatedResponse<Report>>`
- `resolve(id, resolvedBy, status): Promise<void>`

`moderation.repository.ts` methods:
- `create(data): Promise<ModerationAction>`
- `findByTarget(targetType, targetId): Promise<ModerationAction[]>`

**Step 4: Create `src/server/services/moderation.service.ts`**

```typescript
export const moderationService = {
  // Submit a report (user-facing)
  async submitReport(reporterId: string, targetType: string, targetId: string, reason: string): Promise<Report>,

  // Resolve a report (moderator/admin)
  async resolveReport(reportId: string, moderatorId: string, status: 'resolved' | 'dismissed', action?: string): Promise<void>,

  // Take moderation action (hide content, suspend user, etc.)
  async takeAction(moderatorId: string, targetType: string, targetId: string, action: string, reason?: string): Promise<void>,
};
```

**Step 5: Create `src/server/routes/reports.ts`**

```typescript
// POST /api/v1/reports — Submit a report (requires auth)
// Body: { targetType, targetId, reason }
```

**Step 6: Write tests and commit**

```bash
npx vitest run src/server/services/moderation.spec.ts
git add src/db/ src/server/
git commit -m "feat(iter4): add reports and moderation backend (M4)"
```

---

### Task 11: Admin API Routes

**Files:**
- Create: `src/server/routes/admin/users.ts` — User management
- Create: `src/server/routes/admin/content.ts` — Content moderation queue
- Create: `src/server/routes/admin/system.ts` — System stats
- Create: `src/server/routes/admin/index.ts` — Admin route group
- Modify: `src/server/index.ts` — Mount admin routes
- Test: `src/server/routes/admin/admin.spec.ts`

**Step 1: Create `src/server/routes/admin/index.ts`**

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { adminUserRoutes } from './users';
import { adminContentRoutes } from './content';
import { adminSystemRoutes } from './system';

export const adminRoutes = new Hono();

// All admin routes require auth + admin role (content routes allow moderator too)
adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/content', adminContentRoutes);
adminRoutes.route('/system', adminSystemRoutes);
```

**Step 2: Create `src/server/routes/admin/users.ts`**

```typescript
// All routes: authMiddleware() + requireRole('admin')

// GET /admin/users — List users (paginated, searchable by email/displayName)
// GET /admin/users/:id — Get user details (profile + subscription + oauth accounts)
// PATCH /admin/users/:id/role — Change user role { role: 'user' | 'moderator' | 'admin' }
// POST /admin/users/:id/suspend — Suspend user (set isActive = false)
// POST /admin/users/:id/unsuspend — Unsuspend user
// POST /admin/users/:id/force-password-reset — Invalidate tokens, send password reset email
```

**Step 3: Create `src/server/routes/admin/content.ts`**

```typescript
// GET routes: authMiddleware() + requireRole('moderator')
// Action routes: authMiddleware() + requireRole('moderator')

// GET /admin/content/reports — List pending reports (paginated)
// GET /admin/content/reports/:id — Get report details
// POST /admin/content/reports/:id/resolve — Resolve report { status, action?, reason? }
// POST /admin/content/hide/:targetType/:targetId — Hide content
// POST /admin/content/unhide/:targetType/:targetId — Unhide content
```

**Step 4: Create `src/server/routes/admin/system.ts`**

```typescript
// All routes: authMiddleware() + requireRole('admin')

// GET /admin/system/stats — System overview
// Returns: { totalUsers, activeUsers (30d), totalCharacters, totalChats,
//            subscriptionBreakdown: { free, pro, team },
//            recentSignups (7d), pendingReports }
```

**Step 5: Mount in `src/server/index.ts`**

```typescript
app.route('/api/v1/admin', adminRoutes);
```

Add `/api/v1/admin` to tenant-required paths (not public).

**Step 6: Write tests**

Test:
- Admin can list users with pagination
- Admin can change user role
- Admin can suspend/unsuspend user
- Moderator can view and resolve reports
- User role gets 403 on all admin routes
- System stats returns correct shape

**Step 7: Run tests and commit**

```bash
npx vitest run src/server/routes/admin/admin.spec.ts
git add src/server/
git commit -m "feat(iter4): add admin API routes for users, content, system (M4)"
```

---

### Task 12: Admin Frontend Pages

**Files:**
- Create: `src/client/pages/admin/AdminLayout.vue` — Admin layout with sidebar nav
- Create: `src/client/pages/admin/UserManagement.vue` — User list + actions
- Create: `src/client/pages/admin/ContentModeration.vue` — Report queue
- Create: `src/client/pages/admin/SystemDashboard.vue` — System stats
- Create: `src/client/services/admin.api.ts` — Admin API service
- Create: `src/client/stores/admin.ts` — Admin store
- Modify: `src/client/router/routes.ts` — Add admin routes with role guard

**Step 1: Create `src/client/services/admin.api.ts`**

API methods for all admin endpoints (users, content, system).

**Step 2: Create `src/client/stores/admin.ts`**

Pinia store with state for users list, reports list, system stats. Actions to fetch each.

**Step 3: Create AdminLayout.vue**

Sidebar navigation with links: Users, Content Moderation, System. Uses Element Plus `el-menu` in sidebar mode. `<router-view>` for content area.

**Step 4: Create UserManagement.vue**

- `el-table` with columns: email, displayName, role, isActive, createdAt, actions
- Search input (filters by email/name)
- Action buttons: Change Role (dropdown), Suspend/Unsuspend, Force Password Reset
- Confirmation dialogs for destructive actions

**Step 5: Create ContentModeration.vue**

- `el-table` showing pending reports: reporter, target type, target ID, reason, createdAt
- Action buttons: Resolve (approve/reject), Dismiss
- Expandable row to show target content preview

**Step 6: Create SystemDashboard.vue**

- Metric cards: Total Users, Active Users (30d), Total Characters, Pending Reports
- Subscription breakdown (pie chart or simple bars)
- Recent signups count

**Step 7: Add routes**

```typescript
{
  path: '/admin',
  component: () => import('../pages/admin/AdminLayout.vue'),
  meta: { requiresAuth: true, requiresRole: 'moderator' },
  children: [
    { path: '', redirect: '/admin/users' },
    { path: 'users', component: () => import('../pages/admin/UserManagement.vue'), meta: { requiresRole: 'admin' } },
    { path: 'content', component: () => import('../pages/admin/ContentModeration.vue') },
    { path: 'system', component: () => import('../pages/admin/SystemDashboard.vue'), meta: { requiresRole: 'admin' } },
  ],
}
```

Add role guard in router navigation guard (check `user.role` against `meta.requiresRole`).

**Step 8: Commit**

```bash
git add src/client/
git commit -m "feat(iter4): add admin panel frontend pages (M4)"
```

---

## Module 5: Audit Logging

### Task 13: Audit Log Schema & Service

**Files:**
- Create: `src/db/schema/audit-logs.ts` — Audit logs table
- Modify: `src/db/schema/index.ts` — Export new schema
- Create: `src/db/repositories/audit.repository.ts` — Audit log CRUD
- Create: `src/server/services/audit.service.ts` — Async audit logging
- Test: `src/server/services/audit.spec.ts`

**Step 1: Create `src/db/schema/audit-logs.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: varchar('actor_id', { length: 36 }).notNull(), // userId or 'system'
  actorIp: varchar('actor_ip', { length: 64 }), // SHA-256 hashed
  action: varchar('action', { length: 50 }).notNull(),
  // Actions: login, login_failed, logout, password_change, password_reset,
  //   mfa_enable, mfa_disable, role_change, user_suspend, user_unsuspend,
  //   content_moderate, data_export, account_delete, oauth_link, oauth_unlink,
  //   api_key_create, api_key_revoke, report_submit, report_resolve
  targetType: varchar('target_type', { length: 20 }), // 'user' | 'character' | 'comment' | 'system'
  targetId: varchar('target_id', { length: 36 }),
  metadata: jsonb('metadata').default({}).notNull(), // Additional context
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('audit_tenant_idx').on(table.tenantId),
  actorIdx: index('audit_actor_idx').on(table.actorId),
  actionIdx: index('audit_action_idx').on(table.action),
  createdAtIdx: index('audit_created_at_idx').on(table.createdAt),
}));
```

**Step 2: Create `src/db/repositories/audit.repository.ts`**

Methods:
- `create(data): Promise<AuditLog>`
- `findByTenant(tenantId, filters?, pagination?): Promise<PaginatedResponse<AuditLog>>`
  - Filters: actorId, action, targetType, dateFrom, dateTo
- `deleteOlderThan(tenantId, date): Promise<number>` — For retention cleanup

**Step 3: Create `src/server/services/audit.service.ts`**

```typescript
import crypto from 'crypto';
import { auditRepository } from '../../db/repositories/audit.repository';

export const auditService = {
  /**
   * Log an audit event. Fire-and-forget — never throws, never blocks the request.
   */
  log(event: {
    tenantId: string;
    actorId: string;
    actorIp?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const hashedIp = event.actorIp
      ? crypto.createHash('sha256').update(event.actorIp).digest('hex').slice(0, 16)
      : null;

    // Fire-and-forget: don't await, catch errors silently
    auditRepository.create({
      ...event,
      actorIp: hashedIp,
    }).catch((err) => {
      console.error('[AuditService] Failed to write audit log:', err);
    });
  },
};
```

**Step 4: Write tests**

Test:
- `auditService.log()` creates audit record with correct fields
- IP address is hashed (not stored in plain text)
- `findByTenant` returns paginated results with filters
- `deleteOlderThan` removes old records
- `log()` does not throw on DB error (fire-and-forget)

**Step 5: Run tests and commit**

```bash
npx vitest run src/server/services/audit.spec.ts
git add src/db/ src/server/
git commit -m "feat(iter4): add audit logging service and schema (M5)"
```

---

### Task 14: Integrate Audit Logging Across Services

**Files:**
- Modify: `src/server/services/auth.service.ts` — Audit login, logout, password changes
- Modify: `src/server/routes/oauth.ts` — Audit OAuth link/unlink
- Modify: `src/server/routes/mfa.ts` — Audit MFA enable/disable
- Modify: `src/server/routes/admin/users.ts` — Audit role changes, suspensions
- Modify: `src/server/routes/admin/content.ts` — Audit moderation actions
- Modify: `src/server/routes/reports.ts` — Audit report submissions
- Create: `src/server/routes/admin/audit.ts` — Admin audit log viewer endpoint
- Modify: `src/server/routes/admin/index.ts` — Mount audit routes
- Test: `src/server/routes/admin/audit.spec.ts`

**Step 1: Add audit calls to auth service**

```typescript
// In login() — after successful auth:
auditService.log({ tenantId, actorId: user.id, actorIp: ip, action: 'login' });

// In login() — on failed password:
auditService.log({ tenantId: 'unknown', actorId: email, actorIp: ip, action: 'login_failed' });

// In logout():
auditService.log({ tenantId, actorId: userId, action: 'logout' });

// In resetPassword():
auditService.log({ tenantId, actorId: userId, action: 'password_change' });
```

Get IP from `c.req.header('x-forwarded-for')` or `c.req.header('x-real-ip')` in routes, pass to service.

**Step 2: Add audit calls to OAuth, MFA, admin routes**

Follow the same pattern. Each action gets a corresponding audit log entry. Pass `actorIp` from request headers.

**Step 3: Create `src/server/routes/admin/audit.ts`**

```typescript
// GET /admin/audit-logs
// Query params: actorId?, action?, targetType?, dateFrom?, dateTo?, page, limit
// Requires: authMiddleware() + requireRole('admin')
// Returns: PaginatedResponse<AuditLog>
```

**Step 4: Write tests for audit endpoint**

Test:
- Admin can query audit logs with pagination
- Admin can filter by action, actor, date range
- Non-admin gets 403

**Step 5: Run tests and commit**

```bash
npx vitest run src/server/routes/admin/audit.spec.ts
git add src/server/
git commit -m "feat(iter4): integrate audit logging across all services (M5)"
```

---

## Module 6: GDPR/CCPA Compliance

### Task 15: Data Export (Right of Access)

**Files:**
- Create: `src/server/services/gdpr.service.ts` — Data export orchestration
- Create: `src/server/routes/gdpr.ts` — User-facing GDPR endpoints
- Modify: `src/server/index.ts` — Mount GDPR routes
- Test: `src/server/services/gdpr.spec.ts`

**Step 1: Install dependencies**

```bash
npm install archiver
npm install -D @types/archiver
```

**Step 2: Create `src/server/services/gdpr.service.ts`**

```typescript
import archiver from 'archiver';
import { Writable } from 'stream';

export const gdprService = {
  /**
   * Generate a ZIP file containing all user data.
   * Returns a Buffer with the ZIP contents.
   */
  async exportUserData(userId: string, tenantId: string): Promise<Buffer> {
    // Collect data from all repositories:
    // 1. User profile (sanitized — no passwordHash, no totpSecret)
    // 2. Characters (owned by user)
    // 3. Chats + messages
    // 4. Ratings given
    // 5. Comments made
    // 6. Favorites
    // 7. Following/followers lists
    // 8. Subscription history
    // 9. API keys (metadata only — no secrets)
    // 10. Plugin installations + KV data

    // Create ZIP with one JSON file per category
    const archive = archiver('zip', { zlib: { level: 9 } });
    // ... append each JSON file
    // Return buffer
  },
};
```

**Step 3: Create `src/server/routes/gdpr.ts`**

```typescript
// POST /api/v1/account/export
// Requires: authMiddleware()
// Rate limit: 1 per 24 hours
// → Generates ZIP synchronously (for MVP; async with email delivery for large datasets later)
// → Returns ZIP as download (Content-Type: application/zip)
// → Audit log: 'data_export'

// GET /api/v1/account/export/status — Reserved for future async implementation
```

**Step 4: Write tests**

Test:
- Export generates valid ZIP with expected files (profile.json, characters.json, etc.)
- Export excludes sensitive fields (passwordHash, totpSecret)
- Export rate limited to 1 per 24 hours
- Audit log created on export

**Step 5: Run tests and commit**

```bash
npx vitest run src/server/services/gdpr.spec.ts
git add src/server/ package.json package-lock.json
git commit -m "feat(iter4): add GDPR data export (M6)"
```

---

### Task 16: Account Deletion (Right to Erasure)

**Files:**
- Modify: `src/server/services/gdpr.service.ts` — Add deletion logic
- Modify: `src/server/routes/gdpr.ts` — Add deletion endpoints
- Modify: `src/db/schema/users.ts` — Add `deletionRequestedAt` column
- Test: `src/server/services/gdpr-deletion.spec.ts`

**Step 1: Add `deletionRequestedAt` to users table**

```typescript
deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
```

**Step 2: Add deletion methods to gdpr.service.ts**

```typescript
/**
 * Request account deletion. Sets 30-day grace period.
 * User can cancel during grace period.
 */
async requestDeletion(userId: string, password: string): Promise<{ scheduledAt: Date }> {
  // Verify password
  // Set deletionRequestedAt = now
  // Send confirmation email
  // Audit log: 'account_delete_request'
  // Return scheduled deletion date (now + 30 days)
}

/**
 * Cancel pending deletion request.
 */
async cancelDeletion(userId: string): Promise<void> {
  // Clear deletionRequestedAt
  // Audit log: 'account_delete_cancel'
}

/**
 * Execute hard deletion (called by scheduled job or admin).
 * - Delete all user data (characters, chats, messages, etc.)
 * - Anonymize audit logs (replace actorId with 'deleted-user')
 * - Cancel Stripe subscription
 * - Revoke all tokens
 */
async executeDeletion(userId: string): Promise<void> {
  // Cascade delete handles most via FK constraints
  // Anonymize audit logs manually
  // Cancel Stripe subscription if active
  // Delete from Redis (tokens, sessions)
}

/**
 * Process all users past their 30-day grace period.
 * Called periodically (e.g., daily cron or on server start).
 */
async processExpiredDeletions(): Promise<number> {
  // Find users where deletionRequestedAt < now - 30 days
  // Execute deletion for each
  // Return count
}
```

**Step 3: Add routes**

```typescript
// POST /api/v1/account/delete — Request deletion { password: string }
// POST /api/v1/account/delete/cancel — Cancel pending deletion
// GET /api/v1/account/delete/status — Check deletion status
```

**Step 4: Write tests**

Test:
- Request deletion with correct password sets deletionRequestedAt
- Request deletion with wrong password returns 401
- Cancel deletion clears deletionRequestedAt
- executeDeletion removes all user data
- executeDeletion anonymizes audit logs
- processExpiredDeletions only processes users past grace period

**Step 5: Run tests and commit**

```bash
npx vitest run src/server/services/gdpr-deletion.spec.ts
git add src/db/ src/server/
git commit -m "feat(iter4): add account deletion with 30-day grace period (M6)"
```

---

### Task 17: Consent Management

**Files:**
- Create: `src/db/schema/user-consents.ts` — Consent preferences table
- Modify: `src/db/schema/index.ts` — Export new schema
- Create: `src/db/repositories/consent.repository.ts`
- Modify: `src/server/routes/gdpr.ts` — Add consent endpoints
- Test: `src/server/routes/gdpr-consent.spec.ts`

**Step 1: Create `src/db/schema/user-consents.ts`**

```typescript
import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userConsents = pgTable('user_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  consentType: varchar('consent_type', { length: 30 }).notNull(), // 'analytics' | 'marketing' | 'cookies'
  granted: boolean('granted').default(false).notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userConsentUnique: uniqueIndex('user_consent_unique_idx').on(table.userId, table.consentType),
}));
```

**Step 2: Create repository**

Methods:
- `findByUserId(userId): Promise<UserConsent[]>`
- `upsert(userId, consentType, granted): Promise<UserConsent>`

**Step 3: Add routes**

```typescript
// GET /api/v1/account/consents — Get all consent preferences
// PUT /api/v1/account/consents — Update consent preferences
// Body: { analytics?: boolean, marketing?: boolean, cookies?: boolean }
```

**Step 4: Write tests and commit**

```bash
npx vitest run src/server/routes/gdpr-consent.spec.ts
git add src/db/ src/server/
git commit -m "feat(iter4): add consent management (M6)"
```

---

### Task 18: GDPR Frontend (Export, Deletion, Consents)

**Files:**
- Create: `src/client/pages/AccountSettings.vue` — Account management page (export, deletion, consents)
- Create: `src/client/services/gdpr.api.ts` — GDPR API service
- Modify: `src/client/router/routes.ts` — Add account settings route
- Modify: `src/client/pages/Profile.vue` — Add link to account settings

**Step 1: Create `src/client/services/gdpr.api.ts`**

```typescript
export const gdprApi = {
  exportData: () => api.post('/account/export', null, { responseType: 'blob' }),
  requestDeletion: (password: string) => api.post('/account/delete', { password }),
  cancelDeletion: () => api.post('/account/delete/cancel'),
  getDeletionStatus: () => api.get('/account/delete/status'),
  getConsents: () => api.get('/account/consents'),
  updateConsents: (consents: Record<string, boolean>) => api.put('/account/consents', consents),
};
```

**Step 2: Create AccountSettings.vue**

Three sections:
1. **Data Export:** "Download my data" button → triggers ZIP download
2. **Account Deletion:** "Delete my account" button → confirmation dialog with password input → shows grace period info. If deletion pending, show cancel button + scheduled date.
3. **Privacy Preferences:** Toggle switches for analytics, marketing, cookies consent

**Step 3: Add route and link**

Route: `/account` (auth required). Add "Account & Privacy" link in Profile page or sidebar navigation.

**Step 4: Commit**

```bash
git add src/client/
git commit -m "feat(iter4): add GDPR frontend pages (M6)"
```

---

### Task 19: Admin GDPR Oversight & E2E Tests

**Files:**
- Create: `src/server/routes/admin/gdpr.ts` — Admin GDPR endpoints
- Modify: `src/server/routes/admin/index.ts` — Mount GDPR admin routes
- Modify: `src/client/pages/admin/AdminLayout.vue` — Add GDPR nav item
- Create: `e2e/platform-hardening.spec.ts` — E2E tests for Iteration 4
- Test: `src/server/routes/admin/gdpr.spec.ts`

**Step 1: Create `src/server/routes/admin/gdpr.ts`**

```typescript
// GET /admin/gdpr/requests — List pending export/deletion requests (paginated)
// POST /admin/gdpr/requests/:id/process — Force-process a deletion request (skip grace period)
// Requires: authMiddleware() + requireRole('admin')
```

**Step 2: Write E2E tests**

```typescript
// e2e/platform-hardening.spec.ts
// Test scenarios:
// 1. Password reset flow (forgot → email → reset → login)
// 2. OAuth login buttons visible on login page
// 3. 2FA setup flow (enable → verify → backup codes shown)
// 4. Admin panel accessible by admin, blocked for regular user
// 5. Report submission
// 6. Data export download
// 7. Account deletion request and cancellation
// 8. Consent preferences update
```

**Step 3: Write admin GDPR tests and commit**

```bash
npx vitest run src/server/routes/admin/gdpr.spec.ts
git add src/server/ src/client/ e2e/
git commit -m "feat(iter4): add admin GDPR oversight and E2E tests (M6)"
```

---

## Task Dependency Graph

```
Task 1 (Email infra) ──→ Task 2 (Password reset) ──→ Task 3 (Email verify) ──→ Task 4 (Frontend auth pages)
                     └──→ Task 5 (OAuth infra) ──→ Task 6 (OAuth frontend)
                     └──→ Task 7 (TOTP backend) ──→ Task 8 (2FA frontend)

Task 9 (RBAC) ──→ Task 10 (Reports/Moderation) ──→ Task 11 (Admin API) ──→ Task 12 (Admin frontend)

Task 13 (Audit schema) ──→ Task 14 (Audit integration) — depends on Tasks 5, 7, 10, 11

Task 15 (Data export) ──→ Task 16 (Account deletion) ──→ Task 17 (Consents) ──→ Task 18 (GDPR frontend) ──→ Task 19 (Admin GDPR + E2E)
```

**Parallelizable groups (after Task 1):**
- Group A: Tasks 2, 3 (email flows)
- Group B: Task 5 (OAuth) — after Task 1
- Group C: Task 7 (2FA) — after Task 1
- Group D: Tasks 9, 10, 11 (RBAC + Admin) — independent of email/OAuth/2FA
- Group E: Task 13 (Audit) — independent

**Sequential chains:**
- Tasks 2 → 3 → 4 (email flows → frontend)
- Tasks 5 → 6 (OAuth → frontend)
- Tasks 7 → 8 (2FA → frontend)
- Tasks 9 → 10 → 11 → 12 (RBAC → admin)
- Tasks 13 → 14 (audit → integration, after other backends done)
- Tasks 15 → 16 → 17 → 18 → 19 (GDPR chain)

## New Database Tables Summary

| Table | Purpose |
|-------|---------|
| `password_reset_tokens` | Password reset token storage |
| `oauth_accounts` | OAuth provider account links |
| `backup_codes` | 2FA backup codes |
| `reports` | User-submitted content reports |
| `moderation_actions` | Moderator action log |
| `audit_logs` | Security audit trail |
| `user_consents` | GDPR consent preferences |

## New Dependencies

| Package | Purpose |
|---------|---------|
| `nodemailer` | Email sending |
| `arctic` | OAuth2 PKCE (Google, GitHub) |
| `otpauth` | TOTP generation/verification |
| `qrcode` | QR code generation for 2FA |
| `archiver` | ZIP file creation for data export |

## Modified Users Table (New Columns)

| Column | Type | Purpose |
|--------|------|---------|
| `emailVerificationToken` | varchar(64) | Email verification hash |
| `totpSecret` | varchar(255) | Encrypted TOTP secret |
| `totpEnabled` | boolean | 2FA enabled flag |
| `role` | enum(user/moderator/admin) | RBAC role |
| `deletionRequestedAt` | timestamp | GDPR deletion grace period |

