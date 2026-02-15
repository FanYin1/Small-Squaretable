# OpenAPI Documentation Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add all ~109 missing API endpoints to `docs/api/openapi.yaml` with full request/response schemas, bringing coverage from ~44 to ~153 endpoints.

**Architecture:** Single-file OpenAPI 3.1.0 spec. Add 13 new tags. Each task appends a group of path definitions + component schemas to the existing YAML. No code generation — pure documentation.

**Tech Stack:** OpenAPI 3.1.0 YAML

---

## Context

**Existing spec:** `docs/api/openapi.yaml` (~2442 lines)
- Already documented: Health (3), Auth (5), Users (4), Characters (14), Chats (7), LLM (3), Subscriptions (5), Usage (2), WebSocket (1) = 44 endpoints
- Existing tags: Authentication, Users, Characters, Chats, LLM, Subscriptions, Usage, Health, WebSocket

**Missing endpoints by route file:**
- `auth.ts` extended: 4 (forgot-password, reset-password, verify-email, resend-verification)
- `oauth.ts`: 3 (redirect, callback, exchange)
- `mfa.ts`: 5 (setup, verify-setup, disable, challenge, backup-codes)
- `intelligence.ts`: 9 (memories CRUD, emotion CRUD, extract, debug, system-prompt)
- `social.ts`: 14 (follows, favorites, comments)
- `notifications.ts`: 5 (list, unread-count, mark-read, mark-all-read, delete)
- `webhooks.ts`: 8 (CRUD, test, deliveries, retry)
- `developer.ts`: 6 (api-keys CRUD, scopes)
- `plugins.ts`: 14 (author CRUD, marketplace, installs, enable/disable, execute)
- `analytics.ts`: 7 (events, overview, retention, funnel, realtime, top-chars, segments)
- `recommendations.ts`: 4 (personalized, trending, similar, feedback)
- `gdpr.ts`: 6 (export, delete, cancel, status, consents GET/PUT)
- `reports.ts`: 1 (submit report)
- `admin/users.ts`: 6 (list, detail, role, suspend, unsuspend, force-password-reset)
- `admin/content.ts`: 5 (reports list, detail, resolve, hide, unhide)
- `admin/audit.ts`: 1 (list audit logs)
- `admin/system.ts`: 1 (system stats)
- `admin/experiments.ts`: 4 (list, create, update, results)
- `admin/gdpr.ts`: 2 (list requests, force-process)
- `admin/jobs.ts`: 2 (list jobs, run job)
- `characters.ts` extra: 1 (GET /stats)
- `chats.ts` extra: 2 (DELETE message, PATCH message)

**Total missing: ~109 endpoints**

---

### Task 1: Add new tags + Auth Extended (4 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

1. Add 13 new tags to the `tags` section (after existing tags):
   - `MFA` — Two-factor authentication
   - `OAuth` — OAuth2 social login
   - `Intelligence` — Character memory and emotion system
   - `Social` — Follow, favorites, and comments
   - `Notifications` — In-app notifications
   - `Webhooks` — Webhook endpoint management
   - `Developer` — API key management
   - `Plugins` — Plugin lifecycle and marketplace
   - `Analytics` — Data analytics dashboard
   - `Recommendations` — Character recommendations
   - `GDPR` — Data privacy and consent
   - `Reports` — Content reporting
   - `Admin` — Administration panel

2. Add 4 Auth Extended paths (under existing Auth section):

```yaml
  /api/v1/auth/forgot-password:
    post:
      tags: [Authentication]
      summary: Request password reset
      description: Sends a password reset email. Always returns 200 to prevent email enumeration.
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
                  format: email
      responses:
        '200':
          description: Reset email sent (if account exists)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponse'

  /api/v1/auth/reset-password:
    post:
      tags: [Authentication]
      summary: Reset password with token
      description: Resets password using a token from the reset email
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ResetPasswordRequest'
      responses:
        '200':
          $ref: '#/components/responses/Success'
        '400':
          $ref: '#/components/responses/BadRequest'

  /api/v1/auth/verify-email:
    get:
      tags: [Authentication]
      summary: Verify email address
      description: Verifies email using token from verification email
      security: []
      parameters:
        - name: token
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          $ref: '#/components/responses/Success'
        '400':
          $ref: '#/components/responses/BadRequest'

  /api/v1/auth/resend-verification:
    post:
      tags: [Authentication]
      summary: Resend verification email
      description: Resends the email verification link (rate limited)
      security:
        - BearerAuth: []
      responses:
        '200':
          $ref: '#/components/responses/Success'
        '429':
          description: Rate limited
```

3. Add `ResetPasswordRequest` schema to components:

```yaml
    ResetPasswordRequest:
      type: object
      required: [token, password]
      properties:
        token:
          type: string
          description: Password reset token from email
        password:
          type: string
          minLength: 8
          description: New password
```

**Step 1:** Read current openapi.yaml, add the 13 new tags after existing tags
**Step 2:** Add the 4 auth extended paths after `/api/v1/auth/me`
**Step 3:** Add `ResetPasswordRequest` schema to components/schemas
**Step 4:** Commit: `docs: add auth extended endpoints to OpenAPI spec (forgot-password, reset-password, verify-email, resend-verification)`

---

### Task 2: OAuth + MFA endpoints (8 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add OAuth section (3 endpoints):
- `GET /api/v1/auth/oauth/{provider}` — Redirect to OAuth provider (Google/GitHub). No auth. Response: 302 redirect.
- `GET /api/v1/auth/oauth/{provider}/callback` — OAuth callback handler. No auth. Response: 302 redirect to frontend.
- `POST /api/v1/auth/oauth/exchange` — Exchange auth code for JWT. No auth. Request: `{ code: string }`. Response: AuthResponse (user + tokens).

Add MFA section (5 endpoints):
- `POST /api/v1/auth/mfa/setup` — Start TOTP setup. Auth required. Response: `{ qrDataUrl, secret }`.
- `POST /api/v1/auth/mfa/verify-setup` — Confirm TOTP with 6-digit code. Auth required. Request: `{ code: string(6) }`. Response: `{ backupCodes: string[] }`.
- `POST /api/v1/auth/mfa/disable` — Disable TOTP. Auth required. Request: `{ code: string(6) }`. Response: success message.
- `POST /api/v1/auth/mfa/challenge` — MFA login challenge. No auth. Request: `{ mfaToken, code }`. Response: AuthResponse (user + tokens).
- `GET /api/v1/auth/mfa/backup-codes` — Regenerate backup codes. Auth required. Response: `{ backupCodes: string[] }`.

Add schemas: `OAuthExchangeRequest`, `MfaCodeRequest`, `MfaChallengeRequest`, `MfaSetupResponse`, `BackupCodesResponse`.

**Commit:** `docs: add OAuth and MFA endpoints to OpenAPI spec`

---

### Task 3: Intelligence endpoints (9 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Intelligence section (all require auth, all under `/api/v1/characters/{characterId}/intelligence/`):

- `GET .../memories` — List memories. Query: `query?`, `limit?`, `chatId?`. Response: `{ memories, total, limit }`.
- `DELETE .../memories/{memoryId}` — Delete specific memory. Response: success message.
- `DELETE .../memories` — Clear all memories. Query: `chatId?`. Response: success message.
- `POST .../extract-memories` — Extract memories from chat. Request: `{ chatId }`. Response: `{ extracted: number, memories: string[] }`.
- `GET .../emotion` — Get current emotion + history. Query: `chatId?`. Response: `{ current, history }`.
- `POST .../emotion` — Update emotion manually. Query: `chatId?`. Request: `{ valence, arousal }`. Response: emotion result.
- `DELETE .../emotion` — Reset emotion. Response: success message.
- `GET .../debug` — Get debug state. Query: `chatId?`. Response: debug state object.
- `GET .../system-prompt` — Get system prompt details. Query: `chatId?`. Response: prompt details.

Add schemas: `MemoryQueryParams`, `EmotionState`, `EmotionUpdateRequest`, `ExtractMemoriesRequest`, `IntelligenceDebugState`.

**Commit:** `docs: add Intelligence (memory/emotion) endpoints to OpenAPI spec`

---

### Task 4: Social endpoints (14 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Social section (all require auth):

Follow routes (mounted at `/api/v1/social/`):
- `POST /follows` — Follow user. Request: `{ followingId }`. Response: follow object (201).
- `DELETE /follows/{userId}` — Unfollow user. Response: `{ unfollowed: true }`.
- `GET /follows/{userId}/status` — Check follow status. Response: status object.
- `GET /users/{userId}/followers` — List followers. Query: `limit?`, `offset?`. Response: paginated followers.
- `GET /users/{userId}/following` — List following. Query: `limit?`, `offset?`. Response: paginated following.

Favorite routes:
- `POST /favorites` — Favorite character. Request: `{ characterId }`. Response: favorite object (201).
- `DELETE /favorites/{characterId}` — Unfavorite. Response: `{ unfavorited: true }`.
- `GET /favorites/{characterId}/status` — Check favorite status. Response: status object.
- `GET /favorites` — List user's favorites. Query: `limit?`, `offset?`. Response: paginated favorites.

Comment routes:
- `POST /characters/{characterId}/comments` — Create comment. Request: `{ content, parentId? }`. Response: comment (201).
- `PATCH /comments/{commentId}` — Update comment. Request: `{ content }`. Response: comment.
- `DELETE /comments/{commentId}` — Delete comment. Response: `{ deleted: true }`.
- `GET /characters/{characterId}/comments` — List comments. Query: `limit?`, `offset?`, `sort?`. Response: paginated comments.
- `GET /comments/{commentId}/replies` — Get replies. Query: `limit?`, `offset?`. Response: paginated replies.

Add schemas: `FollowRequest`, `FavoriteRequest`, `CreateCommentRequest`, `UpdateCommentRequest`, `Comment`, `Follow`, `Favorite`.

**Commit:** `docs: add Social (follow/favorite/comment) endpoints to OpenAPI spec`

---

### Task 5: Notifications + Reports (6 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Notifications section (all require auth, mounted at `/api/v1/notifications/`):
- `GET /` — List notifications. Query: `limit?`, `offset?`, `unreadOnly?`. Response: paginated notifications.
- `GET /unread-count` — Get unread count. Response: `{ count }`.
- `PATCH /{id}/read` — Mark as read. Response: success message.
- `POST /read-all` — Mark all as read. Response: `{ markedCount }`.
- `DELETE /{id}` — Delete notification. Response: success message.

Add Reports section (auth required, mounted at `/api/v1/reports/`):
- `POST /` — Submit report. Request: `{ targetType: 'character'|'comment'|'user', targetId, reason }`. Response: report (201).

Add schemas: `Notification`, `ListNotificationsQuery`, `SubmitReportRequest`, `Report`.

**Commit:** `docs: add Notifications and Reports endpoints to OpenAPI spec`

---

### Task 6: Webhooks endpoints (8 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Webhooks section (all require auth, mounted at `/api/v1/webhooks/`):
- `POST /` — Create webhook. Request: `{ url, events, secret? }`. Response: webhook (201).
- `GET /` — List webhooks. Response: webhook array.
- `GET /{id}` — Get webhook details. Response: webhook.
- `PATCH /{id}` — Update webhook. Request: partial webhook. Response: webhook.
- `DELETE /{id}` — Delete webhook. Response: `{ deleted: true }`.
- `POST /{id}/test` — Send test event. Response: delivery (201).
- `GET /{id}/deliveries` — List deliveries. Query: `limit?`, `offset?`. Response: paginated deliveries.
- `POST /{id}/deliveries/{did}/retry` — Retry delivery. Response: delivery.

Add schemas: `WebhookEndpoint`, `CreateWebhookRequest`, `UpdateWebhookRequest`, `WebhookDelivery`.

**Commit:** `docs: add Webhooks endpoints to OpenAPI spec`

---

### Task 7: Developer API endpoints (6 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Developer section (all require auth, mounted at `/api/v1/developer/`):
- `POST /api-keys` — Create API key. Request: `{ name, scopes, expiresAt? }`. Response: key with plaintext secret (201).
- `GET /api-keys` — List API keys. Query: `limit?`, `offset?`. Response: paginated keys (secret masked).
- `GET /api-keys/{id}` — Get API key details. Response: key (secret masked).
- `PATCH /api-keys/{id}` — Update API key. Request: `{ name?, scopes? }`. Response: updated key.
- `DELETE /api-keys/{id}` — Revoke API key. Response: `{ deleted: true }`.
- `GET /scopes` — List available scopes. Response: scope definitions array.

Add schemas: `ApiKey`, `CreateApiKeyRequest`, `UpdateApiKeyRequest`, `ApiKeyScope`.

**Commit:** `docs: add Developer API key endpoints to OpenAPI spec`

---

### Task 8: Plugins endpoints (14 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Plugins section (mounted at `/api/v1/plugins/`):

Author management (auth required):
- `POST /` — Create plugin. Request: `{ name, description, version, code, events, configSchema? }`. Response: plugin (201).
- `GET /mine` — List my plugins. Response: plugin array.
- `PATCH /{id}` — Update plugin. Request: partial plugin. Response: plugin.
- `DELETE /{id}` — Delete plugin. Response: null.
- `POST /{id}/publish` — Publish to marketplace. Response: plugin.

Marketplace (public):
- `GET /marketplace` — Browse plugins. Query: `page?`, `limit?`, `search?`, `category?`. Response: paginated plugins.
- `GET /marketplace/{id}` — Get plugin details. Response: plugin.

Install management (auth required):
- `POST /installs` — Install plugin. Request: `{ pluginId, config? }`. Response: install (201).
- `GET /installs` — List installed plugins. Response: install array.
- `PATCH /installs/{id}` — Update install config. Request: `{ config }`. Response: install.
- `DELETE /installs/{id}` — Uninstall. Response: null.
- `POST /installs/{id}/enable` — Enable plugin. Response: install.
- `POST /installs/{id}/disable` — Disable plugin. Response: install.

Execution (auth required):
- `POST /execute` — Execute plugin event. Request: `{ event, payload }`. Response: execution results.

Add schemas: `Plugin`, `CreatePluginRequest`, `UpdatePluginRequest`, `PluginInstall`, `InstallPluginRequest`, `PluginExecuteRequest`.

**Commit:** `docs: add Plugins endpoints to OpenAPI spec`

---

### Task 9: Analytics endpoints (7 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Analytics section (mounted at `/api/v1/analytics/`):

- `POST /events` — Ingest batch events (→ Kafka). Auth required. Request: `{ events: [{eventType, properties, timestamp?}], context: {sessionId, platform, ...} }`. Response: `{ accepted: number }` (202).
- `GET /overview` — North star metrics. Auth + analytics_dashboard feature + Pro/Team. Query: `weeks?` (default 12). Response: `{ metrics }`.
- `GET /retention` — Cohort retention matrix. Auth + Team only. Query: `cohortWeeks?` (default 8). Response: `{ matrix }`.
- `GET /funnel` — Conversion funnel. Auth + Team only. Query: `days?` (default 30). Response: `{ steps }`.
- `GET /realtime` — Real-time metrics (Redis). Auth + Pro/Team. Response: realtime metrics object.
- `GET /characters/top` — Character rankings. Auth + Team only. Query: `limit?` (default 20). Response: `{ characters }`.
- `GET /segments` — User segment distribution. Auth + Team only. Response: `{ segments }`.

Add schemas: `BatchEventsRequest`, `AnalyticsEvent`, `EventContext`, `NorthStarMetrics`, `RetentionMatrix`, `FunnelStep`, `RealtimeMetrics`.

**Commit:** `docs: add Analytics endpoints to OpenAPI spec`

---

### Task 10: Recommendations + GDPR endpoints (10 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Recommendations section (mounted at `/api/v1/recommendations/`):
- `GET /` — Personalized recommendations. Auth required. Query: `limit?`. Response: `{ items }`.
- `GET /trending` — Trending characters. Public (optional auth). Query: `limit?`. Response: `{ items }`.
- `GET /similar/{characterId}` — Similar characters. Public (optional auth). Query: `limit?`. Response: `{ items }`.
- `POST /feedback` — Submit recommendation feedback. Auth required. Request: `{ characterId, action: 'click'|'dismiss'|'bookmark'|'chat_start', position?, experimentId? }`. Response: `{ received: true }`.

Add GDPR section (mounted at `/api/v1/account/`):
- `POST /export` — Export user data as ZIP. Auth required. Rate limited (1/24h). Response: `application/zip` binary.
- `POST /delete` — Request account deletion. Auth required. Request: `{ password }`. Response: `{ message, scheduledAt }`.
- `POST /delete/cancel` — Cancel pending deletion. Auth required. Response: success message.
- `GET /delete/status` — Check deletion status. Auth required. Response: deletion status object.
- `GET /consents` — Get consent preferences. Auth required. Response: `{ consents: { analytics, marketing, cookies } }`.
- `PUT /consents` — Update consent preferences. Auth required. Request: `{ analytics?, marketing?, cookies? }`. Response: updated consents.

Add schemas: `RecommendationFeedbackRequest`, `RecommendationItem`, `DeleteAccountRequest`, `DeletionStatus`, `ConsentPreferences`, `UpdateConsentsRequest`.

**Commit:** `docs: add Recommendations and GDPR/Account endpoints to OpenAPI spec`

---

### Task 11: Admin User Management + System (8 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add Admin section (all require auth + admin role, mounted at `/api/v1/admin/`):

User management:
- `GET /users` — List users (paginated, searchable). Query: `page?`, `limit?`, `search?`, `sortBy?`, `sortOrder?`. Response: paginated users.
- `GET /users/{id}` — Get user details (profile + subscription + OAuth accounts). Response: `{ user, subscription, oauthAccounts }`.
- `PATCH /users/{id}/role` — Change user role. Request: `{ role: 'user'|'moderator'|'admin' }`. Response: `{ id, role }`.
- `POST /users/{id}/suspend` — Suspend user. Response: `{ id, isActive: false }`.
- `POST /users/{id}/unsuspend` — Unsuspend user. Response: `{ id, isActive: true }`.
- `POST /users/{id}/force-password-reset` — Force password reset. Response: success message.

System:
- `GET /system/stats` — System overview stats. Response: `{ totalUsers, activeUsers, totalCharacters, totalChats, subscriptionBreakdown, recentSignups, pendingReports }`.

Audit:
- `GET /audit-logs` — List audit logs (paginated, filterable). Query: `page?`, `limit?`, `actorId?`, `action?`, `targetType?`, `dateFrom?`, `dateTo?`. Response: paginated audit logs.

Add schemas: `AdminUserListItem`, `AdminUserDetail`, `ChangeRoleRequest`, `SystemStats`, `AuditLog`, `AuditLogQuery`.

**Commit:** `docs: add Admin user management, system stats, and audit log endpoints to OpenAPI spec`

---

### Task 12: Admin Content + Experiments + GDPR + Jobs (13 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Content moderation (require moderator role):
- `GET /admin/content/reports` — List pending reports. Query: `page?`, `limit?`. Response: paginated reports.
- `GET /admin/content/reports/{id}` — Get report details. Response: report.
- `POST /admin/content/reports/{id}/resolve` — Resolve report. Request: `{ status: 'resolved'|'dismissed', action?, reason? }`. Response: success message.
- `POST /admin/content/hide/{targetType}/{targetId}` — Hide content. Response: success message.
- `POST /admin/content/unhide/{targetType}/{targetId}` — Unhide content. Response: success message.

Experiments (require admin role):
- `GET /admin/experiments` — List experiments. Response: experiment array.
- `POST /admin/experiments` — Create experiment. Request: `{ name, description?, variants: [{name, weight, config}] }`. Response: experiment (201).
- `PATCH /admin/experiments/{id}` — Update experiment. Request: partial experiment. Response: experiment.
- `GET /admin/experiments/{id}/results` — Get experiment results. Response: results with per-variant metrics.

GDPR admin (require admin role):
- `GET /admin/gdpr/requests` — List pending deletion requests. Query: `page?`, `limit?`. Response: paginated requests with scheduledAt.
- `POST /admin/gdpr/requests/{id}/process` — Force-process deletion. Response: success message.

Jobs (require admin role):
- `GET /admin/jobs` — List scheduled jobs. Response: job status array.
- `POST /admin/jobs/{name}/run` — Trigger job manually. Response: job status.

Add schemas: `ResolveReportRequest`, `Experiment`, `CreateExperimentRequest`, `UpdateExperimentRequest`, `ExperimentVariant`, `ExperimentResults`, `GdprDeletionRequest`, `ScheduledJob`.

**Commit:** `docs: add Admin content moderation, experiments, GDPR oversight, and jobs endpoints to OpenAPI spec`

---

### Task 13: Characters + Chats extra endpoints (3 endpoints)

**Files:**
- Modify: `docs/api/openapi.yaml`

**What to do:**

Add missing Characters endpoint:
- `GET /api/v1/characters/stats` — Get character statistics for current user. Auth required. Response: `{ totalCharacters, publicCharacters, totalDownloads, avgRating }`.

Add missing Chats endpoints:
- `DELETE /api/v1/chats/{chatId}/messages/{messageId}` — Delete a message. Auth required. Response: success message.
- `PATCH /api/v1/chats/{chatId}/messages/{messageId}` — Edit a message. Auth required. Request: `{ content }`. Response: updated message.

Add parameter: `MessageId` to components/parameters.

**Commit:** `docs: add Characters stats and Chat message edit/delete endpoints to OpenAPI spec`

---

### Task 14: Validate and update docs

**Files:**
- Modify: `docs/api/openapi.yaml` (if validation issues found)
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md`

**What to do:**

1. Count total paths in the final openapi.yaml to verify ~153 endpoints
2. Verify all `$ref` references resolve correctly (no dangling refs)
3. Update ROADMAP.md:
   - Add `迭代 9: OpenAPI 文档同步` section with progress bar
   - Update timeline
   - Update API endpoint count in tech metrics
4. Update CLAUDE.md:
   - Update status to "Iteration 9 Complete (OpenAPI Sync)"
   - Add Iteration 9 section

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 9 (OpenAPI sync)`
