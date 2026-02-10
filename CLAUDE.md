# CLAUDE.md

This file provides guidance to Claude Code when working with the Small-Squaretable project.

## Project Overview

**Small-Squaretable** is a SaaS transformation of SillyTavern - converting a single-user LLM frontend into an enterprise-grade multi-tenant platform with subscription billing, character marketplace, and real-time chat.

**Location**: `/var/aichat/Small-Squaretable`
**Status**: Iteration 2 Complete (Community & Ecosystem)
**Last Updated**: 2026-02-09

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 + Vite + TypeScript + Element Plus |
| Backend | Hono.js + Node.js |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Redis |
| Auth | JWT (Access + Refresh Token) |
| Payment | Stripe |
| Storage | Local filesystem + sharp (thumbnails) |
| PWA | vite-plugin-pwa + Workbox |
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
│   ├── core/                   # Shared Core (redis, config)
│   └── types/                  # TypeScript Types
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

### Frontend Stores
- `src/client/stores/user.ts` - User state
- `src/client/stores/chat.ts` - Chat state (WebSocket + HTTP)
- `src/client/stores/ui.ts` - UI state
- `src/client/stores/characterIntelligence.ts` - Memory/Emotion/Debug state
- `src/client/stores/social.ts` - Follow/favorite/comment state
- `src/client/stores/notification.ts` - Notification state
- `src/client/stores/plugin.ts` - Plugin marketplace/install state

### Debug Components (调试面板)
- `src/client/components/debug/IntelligenceDebugPanel.vue` - Main debug container
- `src/client/components/debug/SystemPromptViewer.vue` - System prompt viewer
- `src/client/components/debug/MemoryRetrievalLog.vue` - Memory retrieval log
- `src/client/components/debug/EmotionTimeline.vue` - Emotion timeline chart
- `src/client/components/debug/ExtractionLog.vue` - Memory extraction log
- `src/client/components/debug/PerformanceMetrics.vue` - Performance metrics

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
- Unit tests: 1274 passing (97.6%), 14 skipped
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

# Sentry (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
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
