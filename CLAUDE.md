# CLAUDE.md

This file provides guidance to Claude Code when working with the Small-Squaretable project.

## Project Overview

**Small-Squaretable** is a SaaS transformation of SillyTavern - converting a single-user LLM frontend into an enterprise-grade multi-tenant platform with subscription billing, character marketplace, and real-time chat.

**Location**: `/var/aichat/Small-Squaretable`
**Status**: Iteration 12 Complete (Dependency Upgrade)
**Last Updated**: 2026-02-20

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 + Vite + TypeScript + Element Plus |
| Backend | Hono.js + Node.js |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Redis |
| Auth | JWT (Access + Refresh Token) + OAuth2 (Google, GitHub) + TOTP 2FA |
| Email | Nodemailer (SMTP/SES) |
| Payment | Stripe |
| Storage | Local filesystem + sharp (thumbnails) |
| PWA | vite-plugin-pwa + Workbox |
| Event Pipeline | Kafka 3.7 (KRaft) |
| Stream Processing | Apache Flink 1.19 (Java 17) |
| Analytics DB | ClickHouse 24.3 |
| Charts | ECharts + vue-echarts |
| Testing | Vitest (Unit) + Playwright (E2E) |

---

## Project Structure

```
Small-Squaretable/
├── src/
│   ├── client/                 # Vue 3 Frontend
│   │   ├── components/         # UI Components
│   │   │   ├── character/      # Character card components
│   │   │   ├── chat/           # Chat window + message + image components
│   │   │   ├── debug/          # Intelligence + WorldInfo debug panels
│   │   │   ├── worldbook/      # World book management UI
│   │   │   ├── analytics/      # Analytics dashboard charts (ECharts)
│   │   │   └── layout/         # Layout (PwaInstallPrompt, DeviceIndicator, NotificationBell)
│   │   ├── pages/              # Page Components
│   │   ├── router/             # Vue Router
│   │   ├── stores/             # Pinia Stores
│   │   ├── services/           # API Services
│   │   ├── composables/        # Vue Composables
│   │   └── utils/              # Utilities
│   ├── server/                 # Hono.js Backend
│   │   ├── routes/             # API Routes
│   │   ├── services/           # Business Logic
│   │   ├── middleware/         # Middleware (auth, csrf, security, rateLimit)
│   │   └── workers/            # Worker Threads (plugin sandbox)
│   ├── db/                     # Database
│   │   ├── schema/             # Drizzle Schema
│   │   ├── repositories/       # Data Access Layer
│   │   └── migrations/         # DB Migrations
│   ├── core/                   # Shared Core (redis, kafka, clickhouse, config)
│   └── types/                  # TypeScript Types
├── flink-jobs/                 # Apache Flink Stream Processing (Java 17)
├── clickhouse/                 # ClickHouse Schema (init.sql)
├── ml-service/                 # ML Microservice (embedding + sentiment)
├── e2e/                        # Playwright E2E Tests
├── k8s/                        # Kubernetes Configs
├── scripts/                    # Utility Scripts
└── docs/                       # Documentation
```

---

## Common Commands

```bash
# Development
npm run dev              # Start backend (http://localhost:3000)
npm run dev:client       # Start frontend (http://localhost:5173)

# Testing
npm run test             # Run unit tests (Vitest)
npx playwright test      # Run E2E tests

# Database
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:studio        # Open Drizzle Studio

# Build & Deploy
npm run build            # Production build
./scripts/docker-build.sh -e prod  # Build Docker image
./scripts/deploy-k8s.sh -k -e production  # Deploy to K8s
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/refresh` | Refresh token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Get current user |

### Characters
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/characters` | List characters |
| POST | `/api/v1/characters` | Create character |
| GET | `/api/v1/characters/:id` | Get character |
| PATCH | `/api/v1/characters/:id` | Update character |
| DELETE | `/api/v1/characters/:id` | Delete character |
| GET | `/api/v1/characters/search` | Search characters |
| GET | `/api/v1/characters/marketplace` | Browse marketplace |

### Chats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/chats` | List chats |
| POST | `/api/v1/chats` | Create chat |
| GET | `/api/v1/chats/:id` | Get chat |
| POST | `/api/v1/chats/:id/messages` | Send message |
| GET | `/api/v1/chats/:id/messages` | Get messages (cursor-based) |
| PATCH | `/api/v1/chats/:id/messages/:messageId` | Edit message |
| DELETE | `/api/v1/chats/:id/messages/:messageId` | Delete message |

### Intelligence (智能角色系统)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/characters/:id/intelligence/memories` | Get character memories |
| DELETE | `/api/v1/characters/:id/intelligence/memories` | Clear all memories |
| DELETE | `/api/v1/characters/:id/intelligence/memories/:memoryId` | Delete memory |
| GET | `/api/v1/characters/:id/intelligence/emotion` | Get current emotion |
| DELETE | `/api/v1/characters/:id/intelligence/emotion` | Reset emotion |
| POST | `/api/v1/characters/:id/intelligence/extract-memories` | Extract memories from chat |
| GET | `/api/v1/characters/:id/intelligence/debug` | Get debug state (调试面板) |
| GET | `/api/v1/characters/:id/intelligence/system-prompt` | Get system prompt details |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |

### Social (社交功能)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/social/follow/:userId` | Follow user |
| DELETE | `/api/v1/social/follow/:userId` | Unfollow user |
| GET | `/api/v1/social/followers` | List followers |
| GET | `/api/v1/social/following` | List following |
| POST | `/api/v1/social/favorites/:characterId` | Favorite character |
| DELETE | `/api/v1/social/favorites/:characterId` | Unfavorite character |
| GET | `/api/v1/social/favorites` | List favorites |
| POST | `/api/v1/social/comments` | Create comment |
| GET | `/api/v1/social/comments/:characterId` | List comments |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/webhooks` | Create webhook |
| GET | `/api/v1/webhooks` | List webhooks |
| PATCH | `/api/v1/webhooks/:id` | Update webhook |
| DELETE | `/api/v1/webhooks/:id` | Delete webhook |
| GET | `/api/v1/webhooks/:id/deliveries` | List deliveries |

### Developer API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/developer/api-keys` | Create API key |
| GET | `/api/v1/developer/api-keys` | List API keys |
| DELETE | `/api/v1/developer/api-keys/:id` | Revoke API key |
| GET | `/api/v1/developer/api-keys/:id/usage` | Get key usage stats |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notifications` | List notifications |
| GET | `/api/v1/notifications/unread-count` | Get unread count |
| PATCH | `/api/v1/notifications/:id/read` | Mark as read |
| POST | `/api/v1/notifications/mark-all-read` | Mark all as read |

### Plugins (插件系统)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/plugins` | Create plugin (author) |
| GET | `/api/v1/plugins/mine` | List my plugins |
| PATCH | `/api/v1/plugins/:id` | Update plugin |
| DELETE | `/api/v1/plugins/:id` | Delete plugin |
| POST | `/api/v1/plugins/:id/publish` | Publish plugin |
| GET | `/api/v1/plugins/marketplace` | Browse marketplace |
| GET | `/api/v1/plugins/marketplace/:id` | Get plugin details |
| POST | `/api/v1/plugins/installs` | Install plugin |
| GET | `/api/v1/plugins/installs` | List installed plugins |
| PATCH | `/api/v1/plugins/installs/:id` | Update install config |
| DELETE | `/api/v1/plugins/installs/:id` | Uninstall plugin |
| POST | `/api/v1/plugins/installs/:id/enable` | Enable plugin |
| POST | `/api/v1/plugins/installs/:id/disable` | Disable plugin |
| POST | `/api/v1/plugins/execute` | Execute plugin event |

### Analytics (数据分析)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analytics/events` | Ingest batch events (→ Kafka) |
| GET | `/api/v1/analytics/overview` | North star metrics (WAU, messages) |
| GET | `/api/v1/analytics/retention` | Cohort retention matrix |
| GET | `/api/v1/analytics/funnel` | Conversion funnel |
| GET | `/api/v1/analytics/realtime` | Real-time metrics (Redis) |
| GET | `/api/v1/analytics/characters/top` | Character rankings |
| GET | `/api/v1/analytics/segments` | User segment distribution |

### Auth (Extended - Iteration 4)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |
| GET | `/api/v1/auth/verify-email` | Verify email with token |
| POST | `/api/v1/auth/resend-verification` | Resend verification email |
| GET | `/api/v1/auth/oauth/:provider` | OAuth redirect |
| GET | `/api/v1/auth/oauth/:provider/callback` | OAuth callback |
| POST | `/api/v1/auth/oauth/exchange` | Exchange OAuth code for JWT |
| POST | `/api/v1/auth/mfa/setup` | Start 2FA setup |
| POST | `/api/v1/auth/mfa/verify-setup` | Confirm 2FA setup |
| POST | `/api/v1/auth/mfa/disable` | Disable 2FA |
| POST | `/api/v1/auth/mfa/challenge` | MFA login challenge |
| GET | `/api/v1/auth/mfa/backup-codes` | Regenerate backup codes |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users` | List users (admin) |
| GET | `/api/v1/admin/users/:id` | Get user details (admin) |
| PATCH | `/api/v1/admin/users/:id/role` | Change user role (admin) |
| POST | `/api/v1/admin/users/:id/suspend` | Suspend user (admin) |
| POST | `/api/v1/admin/users/:id/unsuspend` | Unsuspend user (admin) |
| GET | `/api/v1/admin/content/reports` | List reports (moderator) |
| POST | `/api/v1/admin/content/reports/:id/resolve` | Resolve report (moderator) |
| GET | `/api/v1/admin/system/stats` | System stats (admin) |
| GET | `/api/v1/admin/audit-logs` | Audit logs (admin) |
| GET | `/api/v1/admin/gdpr/requests` | GDPR requests (admin) |

### GDPR / Account
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/account/export` | Export user data (ZIP) |
| POST | `/api/v1/account/delete` | Request account deletion |
| POST | `/api/v1/account/delete/cancel` | Cancel deletion |
| GET | `/api/v1/account/delete/status` | Deletion status |
| GET | `/api/v1/account/consents` | Get consent preferences |
| PUT | `/api/v1/account/consents` | Update consents |
| POST | `/api/v1/reports` | Submit a report |

### Recommendations (Iteration 5)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/recommendations` | Personalized recommendations (auth) |
| GET | `/api/v1/recommendations/trending` | Trending characters (public) |
| GET | `/api/v1/recommendations/similar/:id` | Similar characters (public) |
| POST | `/api/v1/recommendations/feedback` | Submit recommendation feedback (auth) |

### Admin (Extended - Iteration 5)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/experiments` | List experiments |
| POST | `/api/v1/admin/experiments` | Create experiment |
| PATCH | `/api/v1/admin/experiments/:id` | Update experiment |
| POST | `/api/v1/admin/experiments/:id/start` | Start experiment |
| POST | `/api/v1/admin/experiments/:id/stop` | Stop experiment |
| GET | `/api/v1/admin/experiments/:id/results` | Get experiment results |
| GET | `/api/v1/admin/jobs` | List scheduled jobs |
| POST | `/api/v1/admin/jobs/:name/run` | Trigger job manually |

---

## Key Files

### Configuration
- `.env` - Environment variables
- `vite.config.ts` - Vite configuration
- `drizzle.config.ts` - Drizzle ORM config
- `playwright.config.ts` - Playwright config

### Core Services
- `src/server/services/auth.service.ts` - Authentication
- `src/server/services/chat.service.ts` - Chat logic + Memory/Emotion injection
- `src/server/services/cache.service.ts` - Redis caching
- `src/server/services/logger.service.ts` - Structured logging
- `src/server/services/embedding.service.ts` - Text embedding (MiniLM)
- `src/server/services/memory.service.ts` - Character memory management
- `src/server/services/emotion.service.ts` - 2D emotion state machine
- `src/server/services/storage.service.ts` - File storage + thumbnail generation
- `src/server/services/sync.service.ts` - Multi-device sync
- `src/server/services/event-bus.service.ts` - Internal event bus (pub/sub)
- `src/server/services/webhook.service.ts` - Webhook delivery
- `src/server/services/social.service.ts` - Follow/favorite/comment
- `src/server/services/notification.service.ts` - Notification management
- `src/server/services/api-key.service.ts` - Developer API key management
- `src/server/services/plugin.service.ts` - Plugin lifecycle management
- `src/server/services/plugin-sandbox.ts` - Worker Thread sandbox isolation
- `src/server/services/plugin-bridge.ts` - EventBus-to-plugin dispatch
- `src/server/services/kafka-bridge.service.ts` - EventBus → Kafka bridge
- `src/server/services/analytics-query.service.ts` - ClickHouse analytics queries
- `src/server/services/feature-store.service.ts` - Redis Feature Store reads
- `src/server/services/recommendation.service.ts` - Recommendation engine (trending/collaborative/content-based)
- `src/server/services/experiment.service.ts` - A/B experiment variant assignment
- `src/server/services/experiment-analysis.service.ts` - ClickHouse experiment analytics
- `src/server/services/scheduler.service.ts` - Scheduled job runner
- `src/server/jobs/index.ts` - Registered scheduled jobs (GDPR, audit, token, webhook cleanup)

### Frontend Stores
- `src/client/stores/user.ts` - User state
- `src/client/stores/chat.ts` - Chat state (WebSocket + HTTP)
- `src/client/stores/ui.ts` - UI state
- `src/client/stores/characterIntelligence.ts` - Memory/Emotion/Debug state
- `src/client/stores/social.ts` - Follow/favorite/comment state
- `src/client/stores/notification.ts` - Notification state
- `src/client/stores/plugin.ts` - Plugin marketplace/install state
- `src/client/stores/analytics.ts` - Analytics dashboard state

### Debug Components (调试面板)
- `src/client/components/debug/IntelligenceDebugPanel.vue` - Main debug container
- `src/client/components/debug/SystemPromptViewer.vue` - System prompt viewer
- `src/client/components/debug/MemoryRetrievalLog.vue` - Memory retrieval log
- `src/client/components/debug/EmotionTimeline.vue` - Emotion timeline chart
- `src/client/components/debug/ExtractionLog.vue` - Memory extraction log
- `src/client/components/debug/PerformanceMetrics.vue` - Performance metrics

### Analytics Dashboard
- `src/client/pages/analytics/AnalyticsDashboard.vue` - Tab container (Executive/Product)
- `src/client/pages/analytics/ExecutiveOverview.vue` - North star + retention + funnel
- `src/client/pages/analytics/ProductMetrics.vue` - Realtime + rankings + segments
- `src/client/components/analytics/MetricCard.vue` - Metric display with trend
- `src/client/components/analytics/TrendChart.vue` - ECharts line chart
- `src/client/components/analytics/FunnelChart.vue` - ECharts funnel chart
- `src/client/components/analytics/RetentionHeatmap.vue` - ECharts heatmap
- `src/client/components/analytics/RankingTable.vue` - Character rankings table

### Flink Jobs (Java 17)
- `flink-jobs/src/main/java/.../jobs/MetricsAggregatorJob.java` - Raw events + realtime metrics
- `flink-jobs/src/main/java/.../jobs/SessionAggregatorJob.java` - Session windows + active users
- `flink-jobs/src/main/java/.../jobs/UserProfilerJob.java` - User profiling → Redis
- `flink-jobs/src/main/java/.../jobs/ContentAnalyzerJob.java` - Character stats + trending
- `flink-jobs/src/main/java/.../jobs/RecommendationTrackerJob.java` - A/B test tracking
- `flink-jobs/src/main/java/.../functions/PiiFilter.java` - PII stripping MapFunction

---

## Iteration 7: Test Suite Fix (2026-02-15) ✅

### vue-i18n Infrastructure (M1) ✅
- **vue-i18n**: Installed vue-i18n@10, created i18n config with en-US/zh-CN, registered in main.ts

### Client Test Cleanup (M2) ✅
- **Broken Imports**: Removed 8 redundant test-setup imports (vitest setupFiles handles this)
- **Missing Stubs**: Created client/utils/logger.ts, composables/useDeviceSync.ts, useDateTime.ts
- **Missing Components**: Created ScrollToBottom.vue, DateDivider.vue, MessageImage.vue stubs
- **i18n in Tests**: Added i18n plugin to mount options in 6 component test files

### Missing Server Stubs (M3) ✅
- **worldbook.repository.ts**: Created stub with create() method for characters route
- **worldbook-entry.repository.ts**: Created stub for world book entries
- **worldinfo-engine.service.ts**: Created stub with scan() method for chat service
- **server/utils/tokens.ts**: Created estimateTokens() stub for token counting

### Logger Regression Fixes (M4) ✅
- **usage-tracking.spec.ts**: Replaced console.error spy with structured logger mock (4 tests)
- **jobs.spec.ts**: Replaced console.log spy with structured logger mock (1 test)

### DB Test Mocking (M5) ✅
- **6 Repository Tests**: Added drizzle DB mocks to comment, favorite, notification, rating, tenant, webhook repos
- **Service Tests**: Fixed auth.service, search.service, rating.service with proper mocks
- **Route Tests**: Fixed subscriptions, usage, characters, chats route tests
- **Infrastructure Tests**: Mocked Redis/PostgreSQL connections in redis.spec.ts and db/index.spec.ts
- **JWT Test**: Fixed expired token test timing (16min → 7hr advance)

### Test Isolation (M6) ✅
- **vitest.config.ts**: Excluded ml-service/** and tests/integration/** from unit test runs
- **embedding.service.spec.ts**: Skipped ML-dependent tests (requires microservice)

---

## Iteration 12: Dependency Upgrade + Vulnerability Fix (2026-02-20) ✅

### M1: Vulnerability Fixes (Low Risk)
- Removed `vite-plugin-imagemin` (unmaintained, root cause of 55+ high vulnerabilities)
- Upgraded `bcrypt` 5→6 (fixes `tar` vulnerability)
- `npm audit fix` for remaining safe patches
- Vulnerabilities: 66 → 23 (remaining are in eslint/drizzle-kit transitive deps, not safely fixable)

### M2: Semver-Compatible Upgrades
- hono, stripe, dotenv, marked, @playwright/test, @typescript-eslint/*, @vitejs/plugin-vue, @types/nodemailer

### M3: Major Version Upgrades
- `jose` 5→6 (ESM-only, API compatible — zero code changes)
- `redis` 4→5 (createClient API compatible — zero code changes)
- `drizzle-orm` 0.38→0.45 + `drizzle-kit` 0.30→0.31 (57 files import drizzle-orm — zero code changes)
- `bcrypt` 5→6 (API compatible — zero code changes)
- `vite` 6→7 + `vitest` 2→4 + `@vitest/coverage-v8` 2→4
  - Breaking: `environmentMatchGlobs` removed → `projects` array config in vitest.config.ts
  - Breaking: `vi.fn()` constructor mock syntax changed (kafka.spec.ts, oauth.service.spec.ts)
- Skipped: eslint 9→10 (too risky), @types/node 22→25 (unnecessary)

---

## Iteration 11: Test Coverage Completion (2026-02-20) ✅

### M1: High-Risk Service Tests (4 services, 42 tests)
- **totp.service.spec.ts**: 8 tests — encrypt/decrypt round-trip, generateSetup, verify, backup codes
- **oauth.service.spec.ts**: 21 tests — isSupported, getAuthorizationUrl, handleCallback (Google/GitHub), authenticateWithOAuth (3 scenarios + deactivated user)
- **experiment-analysis.service.spec.ts**: 5 tests — ClickHouse query, error handling, empty results
- **intelligence-debug.service.spec.ts**: 8 tests — state recording, counters, cleanup, chatId fallback

### M2: PLACEHOLDER Cleanup + Silent Catch Fixes
- Removed 12 PLACEHOLDER comments from admin.spec.ts, experiments.spec.ts, auth-password-reset.spec.ts
- Fixed 3 silent catch blocks → structured logging (plugin.service.ts, intelligence.ts, llm.ts)

### M3: Route Tests (4 routes, 33 tests)
- **notifications.spec.ts**: 6 tests — GET /, GET /unread-count, PATCH /:id/read, POST /read-all, DELETE /:id
- **reports.spec.ts**: 4 tests — POST / valid/invalid input
- **developer.spec.ts**: 12 tests — API key CRUD + scopes
- **webhooks.spec.ts**: 11 tests — Webhook CRUD + test + deliveries + retry

### M4: E2E Test Fixes
- Created `e2e/seed.ts` globalSetup (register user + create character + create chat via API)
- Added `createCharacterViaApi` helper to ensure characters exist before chat tests
- Fixed 28 conditional skips in chat.spec.ts (11) and intelligence.spec.ts (17)

---

## Iteration 10: Security Audit (2026-02-20) ✅

### Findings: 1 Critical, 5 High, 4 Medium — All Fixed

**Critical + High Fixes:**
- **Credential Sanitization**: Removed real API key from `.env`, added separate JWT_REFRESH_SECRET and TOTP_ENCRYPTION_KEY
- **JWT Secret Separation**: Access tokens use `jwtSecret`, refresh tokens use `jwtRefreshSecret`
- **TOTP Key Isolation**: Dedicated `totpEncryptionKey` with backwards-compatible fallback
- **Plugin Sandbox Hardening**: Block `import()`, `require()`, `fetch`, `WebSocket`, dangerous module patterns
- **Plugin Execute Validation**: Zod schema on `/execute` endpoint (was raw `c.req.json()`)
- **CSRF Redis Migration**: Production uses Redis-backed store with `crypto.timingSafeEqual`
- **File Upload Auth**: `/uploads/*` requires valid JWT, adds `nosniff` + `Content-Disposition` headers
- **CORS Config Fix**: Added `corsOrigins` to Zod config schema

**Medium Fixes:**
- **CSP Hardening**: Removed `unsafe-eval` from production CSP `script-src`
- **MFA Rate Limiting**: Dedicated per-IP limiter (5 attempts / 5 minutes) on `/challenge`
- **Pagination Bounds**: Zod validation (limit 1-100, offset ≥ 0) on social + chat endpoints

---

## Iteration 9: OpenAPI Documentation Sync (2026-02-16) ✅

### Full API Coverage
- **Before**: 44 endpoints documented (Health, Auth, Users, Characters, Chats, LLM, Subscriptions, Usage, WebSocket)
- **After**: 154 endpoints documented across 22 tags
- **File**: `docs/api/openapi.yaml` — 7360 lines, OpenAPI 3.1.0

### New Tags Added (13)
MFA, OAuth, Intelligence, Social, Notifications, Webhooks, Developer, Plugins, Analytics, Recommendations, GDPR, Reports, Admin

### Endpoints Added by Domain
- Auth Extended: 4 (forgot-password, reset-password, verify-email, resend-verification)
- OAuth: 3 (redirect, callback, exchange)
- MFA: 5 (setup, verify-setup, disable, challenge, backup-codes)
- Intelligence: 9 (memories CRUD, emotion CRUD, extract, debug, system-prompt)
- Social: 14 (follows, favorites, comments)
- Notifications: 5 + Reports: 1
- Webhooks: 8 (CRUD, test, deliveries, retry)
- Developer: 6 (API keys CRUD, scopes)
- Plugins: 14 (author CRUD, marketplace, installs, execute)
- Analytics: 7 (events, overview, retention, funnel, realtime, top-chars, segments)
- Recommendations: 4 + GDPR: 6
- Admin: 21 (users, content, audit, system, experiments, GDPR, jobs)
- Characters extra: 1 + Chats extra: 2

### Component Schemas Added (50+)
Full request/response schemas with property definitions for all new endpoints.

---

## Iteration 8: i18n Full Coverage (2026-02-16) ✅

### High-Impact Pages (M1) ✅
- **MyCharacters.vue**: 26 hardcoded strings → `$t()` calls (myCharacters.*, common.*)
- **Chat.vue**: 15 hardcoded strings → `$t()` calls (chat.*, common.*)
- **UpgradePrompt.vue**: 15 hardcoded strings → `$t()` calls (subscription.*, common.*)
- **MemoryPanel.vue**: 19 hardcoded strings → `$t()` calls (memory.*, common.*)
- **CharacterPublishForm.vue**: 19 hardcoded strings → `$t()` calls (characterPublish.*, market.filters.*)

### Debug + Layout + Market (M2) ✅
- **Debug Panels**: PerformanceMetrics, SystemPromptViewer, IntelligenceDebugPanel — 43 strings wired to debug.*
- **Layout**: AppHeader, UserMenu, AppSidebar, LeftSidebar — 29 strings wired to nav.*, settings.*, theme.*
- **Market**: FilterToolbar, SearchCombo, Market.vue — 22 strings wired to market.*, market.filters.*

### Analytics + Admin + Profile (M3) ✅
- **New Locale Keys**: Added `analytics` section (28 keys) to both en-US.json and zh-CN.json
- **Analytics Components**: 7 files wired to analytics.* keys (dashboard, charts, tables)
- **Admin Pages**: Experiments, SystemDashboard, UserManagement — role labels, experiment metrics
- **Profile**: ProfileForm, AvatarUpload — form labels and validation messages
- **UsageDashboard**: 15 strings wired to subscription.* keys
- **Missing Keys**: Added chat.copyMessage, chat.editMessage, admin role/experiment keys

---

## Iteration 6: Production Readiness (2026-02-15) ✅

### Code Cleanup (M1) ✅
- **PLACEHOLDER Removal**: Removed 6 PLACEHOLDER comments from Experiments.vue and AuditLogs.vue
- **Dead Click Handler**: Wired MyCharacters card click to navigate to CharacterDetail page
- **Date Filter Fix**: AuditLogs loadLogs() now passes dateRange to API call
- **i18n Keys**: Added 17 admin.experiments.* keys to en-US and zh-CN locales

### Structured Logging (M2) ✅
- **Core Services**: Replaced console.log/error in index.ts, cache.service.ts, embedding.service.ts, memory.service.ts
- **All Server Files**: Replaced 53 console.log/error/warn across 18 server files with child loggers
- **Silent Catches**: Added error logging to experiment-analysis.service.ts empty catch, fixed analytics 202→500 on Kafka failure
- **Circular Dep**: core/redis.ts uses structured JSON console.error (cannot import logger)

### Performance Fixes (M3) ✅
- **N+1 Query**: Batch updateAccessTimeBatch() replaces per-memory loop in memory.service.ts
- **Redis SCAN**: cache.service.ts deletePattern uses scanIterator instead of KEYS
- **Social Caching**: 60s TTL cache-aside on GET /followers, /following, /favorites with mutation invalidation

### Production Infrastructure (M4) ✅
- **Redis Rate Limiting**: RedisRateLimitStore with INCR+EXPIRE, auto-select Redis in production
- **Graceful Shutdown**: Ordered teardown (scheduler→workers→connections→stores) with 10s timeout
- **Stripe Config**: 5 Stripe fields in Zod config schema, removed process.env! assertions
- **Configurable Limits**: memoryLimitFree/Pro/Team, cacheTtlDefault, recommendationCacheTtl via env vars
- **Specific Rate Limiters**: socialComment (10/min), report (5/hr), export (3/hr), analyticsIngestion (50/min)

---

## Iteration 5: Technical Debt + Recommendations (2026-02-15) ✅

### Fix Placeholders & Missing Pages (M1) ✅
- **LRU Memory Eviction**: Replaced `console.warn` placeholder with real `deleteOldest` eviction (tier limits: free:100, pro:500, team:2000)
- **Favorites Count**: Replaced `favorites: 0` stub with real `countByUser` query
- **Extract Memories**: Replaced placeholder with real implementation (fetch messages → extract → store)
- **Missing Pages**: WorldBooks.vue, CharacterDetail.vue, Terms/Privacy/About legal pages
- **Admin Audit Logs**: Dedicated AuditLogs.vue page (was using SystemDashboard)
- **Theme + Language**: `useTheme` composable with dark mode toggle, language switcher in header

### Recommendation Engine (M2) ✅
- **RecommendationService**: 3 strategies — trending (feature store), collaborative (tag-based), content-based (Jaccard overlap)
- **Personalization**: Blends trending + collaborative with configurable weights, Redis cache (15-min TTL)
- **API Routes**: GET / (personalized), GET /trending, GET /similar/:id, POST /feedback
- **Frontend**: RecommendationCarousel component, integrated in Dashboard + Market pages

### A/B Testing Framework (M3) ✅
- **Schema**: `experiments` table with `experimentStatusEnum` (draft/running/completed), typed `variants` jsonb
- **Experiment Service**: Deterministic variant assignment (MD5 hash), Redis-cached config (1h TTL)
- **Analysis**: ClickHouse queries for per-variant metrics (impressions, clicks, CTR)
- **Admin UI**: Experiments.vue with create/start/stop/results
- **Integration**: Recommendation weights overridable via experiment variants

### Scheduled Jobs & Cleanup (M4) ✅
- **Scheduler Service**: `setInterval`-based job scheduler with register/start/stop/runNow
- **4 Jobs**: GDPR deletion (1h), audit retention 90d (24h), token cleanup (6h), webhook cleanup (24h)
- **Admin UI**: Jobs section in SystemDashboard with status + "Run Now" buttons
- **E2E Tests**: 5 smoke tests for recommendations + experiments + jobs

---

## Iteration 4: Platform Hardening (2026-02-11) ✅

### Email Service (M1) ✅
- **Nodemailer**: SMTP/SES transport with pluggable config
- **Templates**: email-verification, password-reset, welcome (inline HTML)
- **Password Reset**: SHA-256 hashed tokens, 1-hour expiry, anti-enumeration (always 200)
- **Email Verification**: On register, verify-email endpoint, resend with rate limiting
- **Frontend**: ForgotPassword, ResetPassword, VerifyEmail pages

### OAuth/SSO (M2) ✅
- **Arctic Library**: Google (PKCE) + GitHub OAuth2 providers
- **Account Linking**: Auto-link by email match, or create new user
- **Security**: State parameter (CSRF), PKCE code verifier, Redis-backed auth codes (30s TTL)
- **Frontend**: OAuth buttons on Login/Register, OAuthCallback page

### Two-Factor Authentication (M3) ✅
- **TOTP**: otpauth library, QR code setup, ±1 window drift tolerance
- **Backup Codes**: 10 codes, bcrypt hashed, single-use
- **Encryption**: AES-256-GCM for TOTP secrets (key derived from JWT secret)
- **Login Flow**: MFA challenge with 5-minute mfaToken in Redis
- **Frontend**: SecuritySettings page (setup wizard), MfaChallenge dialog

### Admin Panel + RBAC (M4) ✅
- **Roles**: user / moderator / admin with hierarchy
- **Middleware**: `requireRole()` with hierarchical access control
- **Reports**: User-submitted reports (character/comment/user targets)
- **Moderation**: Moderation actions log, resolve/dismiss reports
- **Admin API**: User management (list/search/role/suspend), content moderation, system stats
- **Frontend**: AdminLayout with sidebar, UserManagement, ContentModeration, SystemDashboard

### Audit Logging (M5) ✅
- **Schema**: `audit_logs` table with 4 indexes (tenant, actor, action, createdAt)
- **Service**: Fire-and-forget async writes, IP SHA-256 hashing
- **Integration**: Auth (login/logout/password), OAuth, MFA, admin actions, reports
- **Admin Viewer**: Paginated + filterable audit log endpoint

### GDPR/CCPA Compliance (M6) ✅
- **Data Export**: ZIP archive with 10 data categories, sensitive field exclusion
- **Account Deletion**: 30-day grace period, cancellable, hard-delete with audit anonymization
- **Consent Management**: analytics/marketing/cookies toggles, upsert with unique constraint
- **Admin Oversight**: GDPR request list, force-process deletion
- **Frontend**: AccountSettings page (export, deletion, privacy preferences)
- **E2E Tests**: 8 Playwright smoke tests

---

## Iteration 3: Data Intelligence & Recommendation (2026-02-10) ✅

### Event Pipeline (M1) ✅
- **Kafka**: KRaft mode, 5 topics (`events.user`, `events.chat`, `events.character`, `events.recommendation`, `events.system`)
- **EventBus → Kafka Bridge**: Wildcard listener routes events to Kafka topics, filters webhook/plugin events
- **Frontend SDK**: `analytics.sdk.ts` with batch event ingestion, session tracking, auto-flush
- **Ingestion Endpoint**: `POST /analytics/events` → Kafka via `sendBatch()`

### Stream Processing (M2) ✅
- **Flink Project**: Java 17, Gradle 8.5, Shadow JAR, BaseEvent schema + deserializer
- **MetricsAggregator**: Raw events → ClickHouse ODS, 1-min/1-hour windows → Redis realtime metrics
- **SessionAggregator**: 30-min session windows → ClickHouse `ods_sessions`, active user count → Redis

### Data Warehouse (M3) ✅
- **ClickHouse Schema**: 4-layer architecture (ODS → DWD → DWS → ADS)
  - ODS: `ods_events`, `ods_sessions`
  - DWD: `dwd_chat_events`, `dwd_recommendation_events`
  - DWS: `dws_user_hourly`, `dws_character_daily`, `dws_recommendation_hourly` (materialized views)
  - ADS: `ads_north_star` (weekly active users + messages)

### Feature Store & Profiling (M5) ✅
- **UserProfiler**: Sliding window (1h/5min), engagement scores, activity levels, interest tags → Redis
- **ContentAnalyzer**: 1-hour windows, character stats, trending scores → Redis + ClickHouse
- **RecommendationTracker**: 5-min windows, A/B test events → ClickHouse `dwd_recommendation_events`
- **Feature Store Service**: Read-only service for Redis Feature Store keys (`fs:user:*`, `fs:char:*`, `fs:global:*`)

### Privacy (M7) ✅
- **PII Filter**: Flink MapFunction — SHA-256 email hashing, IP/phone/content removal, immutable event copies

### Analytics Dashboard (M8) ✅
- **Query Service**: 6 ClickHouse queries (north star, retention, funnel, top characters, segments) + Redis realtime
- **API Routes**: 6 GET endpoints with `authMiddleware()` + `requireFeature('analytics_dashboard')` + plan-based access (Pro: overview+realtime, Team: all)
- **Frontend Store**: Pinia composition store with per-section loading, `fetchAll()` parallel fetch
- **Dashboard Pages**: `AnalyticsDashboard.vue` (tab container), `ExecutiveOverview.vue`, `ProductMetrics.vue`
- **Chart Components**: `MetricCard`, `TrendChart` (line), `FunnelChart`, `RetentionHeatmap`, `RankingTable`
- **E2E Tests**: 10 Playwright tests (team access, free user gate, unauthenticated redirect, error handling)

---

## Iteration 2: Community & Ecosystem (2026-02-09) ✅

### Phase A: EventBus + Webhooks ✅
- **EventBus**: Internal pub/sub with wildcard support (`src/server/services/event-bus.service.ts`)
- **Webhook System**: DB-backed webhook subscriptions, HMAC-SHA256 signed delivery, retry with exponential backoff
- **Worker**: Background webhook delivery worker (`src/server/workers/webhook.worker.ts`)
- **Events**: `character.created`, `character.updated`, `chat.message.created`, `user.subscription.changed`, etc.

### Phase B: Social Features ✅
- **Follow System**: Follow/unfollow users, follower/following lists with pagination
- **Favorites**: Favorite/unfavorite characters, favorites list
- **Comments**: Threaded comments on characters with pagination
- **Notifications**: In-app notification system with unread count, mark-read, WebSocket push
- **Frontend**: NotificationBell component, social pages, i18n (en-US + zh-CN)

### Phase C: Developer API Portal ✅
- **API Keys**: Create/list/revoke API keys with scoped permissions
- **Auth Integration**: API key auth middleware alongside JWT
- **Rate Limiting**: Per-key rate limiting (separate from user rate limits)
- **Frontend**: DeveloperSettings page with key management UI

### Phase D: Plugin System ✅
- **Architecture**: Plugins run in isolated Node.js Worker Threads (64MB memory, 30s timeout)
- **Sandbox**: `PluginSandbox` with WorkerFactory DI, frozen globals, `new Function()` execution
- **Bridge**: `PluginBridge` listens to EventBus, dispatches to sandboxes (pipeline for `chat.message.before`)
- **KV Store**: Per-plugin per-user key-value storage via postMessage bridge, backed by PostgreSQL
- **Feature Gate**: `plugin_marketplace` feature (Free: 0, Pro: 5, Team: 20 installs)
- **DB**: 3 tables (`plugins`, `pluginInstalls`, `pluginKvStore`) + migration `0011_serious_khan.sql`
- **API**: 13 endpoints (author CRUD, marketplace, install management, execution)
- **Frontend**: Plugin marketplace page with browse/install/config UI, Pinia store
- **Tests**: 97 plugin-related tests (33 repo + 21 sandbox + 24 service + 12 bridge + 7 integration)

---

## Iteration 1: Advanced Features (2026-02-07 ~ 2026-02-08) ✅

### Intelligence System (智能角色系统) ✅
- pgvector 向量搜索 + 混合检索
- 2D Valence-Arousal 情感模型 with exponential decay
- MiniLM 本地嵌入 + 情感分析 (ML microservice on port 3001)
- Dynamic importance scoring, semantic dedup, LRU eviction
- Session isolation (memory + emotion per chatId)
- Debug panel (SystemPrompt, Memory, Emotion, Extraction, Performance)

### World Book System (世界书系统) ✅
- Four-tier scope: Chat > Persona > Character > Global
- Hybrid trigger: Keyword + Semantic matching
- 7 injection positions, timing control (sticky/cooldown/delay/probability)
- SillyTavern format import/export, token budget management

### Multimodal Image Support ✅
- Local file storage with tenant isolation, 10MB limit, MIME whitelist
- sharp thumbnail generation (300x300 webp)
- Image paste, drag-drop, upload progress in chat

### PWA Optimization ✅
- Workbox service worker: precaching + runtime caching
- A2HS install prompt with 7-day dismissal
- Offline fallback page, touch optimizations

### Multi-Device Sync ✅
- Device tracking, broadcast to user's devices
- Read receipt sync, device indicator in header

### UX Improvements ✅
- Message edit/delete/regenerate
- Pull-to-refresh, mobile message actions
- WebSocket connection indicator
- Cursor-based message pagination with infinite scroll

---

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Use named routes (`router.push({ name: 'xxx' })`)
- Use Pinia for state management
- Use `useToast` composable for notifications
- Use CSS variables from `variables.css`

### Testing
- Unit tests: `*.spec.ts` files alongside source
- E2E tests: `e2e/` directory
- Unit tests: 1412 passing, 0 failures (17 skipped)
- E2E tests: 107/119 passed (90%), 8 flaky, 4 skipped

### Security
- CSRF protection enabled
- CSP headers configured
- Rate limiting per endpoint
- Input validation with Zod

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sillytavern_saas

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ML Service
ML_SERVICE_URL=http://localhost:3001

# Kafka
KAFKA_BROKERS=localhost:9092

# ClickHouse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=analytics

# Sentry (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx

# Email (SMTP)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Small Squaretable <noreply@localhost>
APP_URL=http://localhost:5173

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OAUTH_CALLBACK_BASE=http://localhost:3000/api/v1/auth/oauth
```

---

## Troubleshooting

### Port Conflicts
```bash
lsof -ti:3000 | xargs kill -9  # Backend
lsof -ti:3001 | xargs kill -9  # ML Service
lsof -ti:5173 | xargs kill -9  # Frontend
```

### Database Issues
```bash
docker restart sillytavern-postgres
npm run db:migrate
```

### Redis Issues
```bash
docker restart sillytavern-redis
```

### ML Service Issues
```bash
# Check if ML service is running
curl http://localhost:3001/health

# Restart ML service
cd ml-service && npm start

# If models fail to download (fetch failed), check proxy settings
# ML service auto-detects HTTP_PROXY/HTTPS_PROXY environment variables
echo $HTTP_PROXY  # Should show proxy URL if behind proxy
```

### Proxy Issues (代理问题)
```bash
# Node.js native fetch doesn't use proxy env vars by default
# ML service uses undici ProxyAgent to handle this
# Ensure proxy is accessible:
curl -x $HTTP_PROXY https://huggingface.co/models
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview |
| [ROADMAP.md](ROADMAP.md) | Development roadmap |
| [USER_GUIDE.md](USER_GUIDE.md) | User guide |
| [API_USAGE_GUIDE.md](API_USAGE_GUIDE.md) | API documentation |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guide |
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | OpenAPI spec |
