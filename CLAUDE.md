# CLAUDE.md

This file provides guidance to Claude Code when working with the Small-Squaretable project.

## Project Overview

**Small-Squaretable** is a SaaS transformation of SillyTavern - converting a single-user LLM frontend into an enterprise-grade multi-tenant platform with subscription billing, character marketplace, and real-time chat.

**Location**: `/var/aichat/Small-Squaretable`
**Last Updated**: 2026-03-01

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 + Vite + TypeScript + Element Plus |
| Backend | Hono.js + Node.js |
| Database | PostgreSQL + Drizzle ORM + pgvector |
| Cache | Redis |
| Auth | JWT + OAuth2 (Google, GitHub) + TOTP 2FA |
| Email | Nodemailer (SMTP/SES) |
| Payment | Stripe |
| Storage | Local filesystem + sharp |
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

## Local Development Startup (完整启动流程)

### Step 1: Start Docker Services

PostgreSQL 和 Redis 通过 Docker Compose 运行。使用项目名 `ssdev` 避免 WSL2 ghost container 问题。

```bash
# 启动 Docker 守护进程 (WSL2)
sudo service docker start

# 启动 PostgreSQL + Redis (使用 ssdev 项目名)
docker compose -p ssdev -f docker-compose.dev.yml up -d

# 验证服务健康
docker ps --filter "name=ss-dev" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Step 2: Enable pgvector Extension (仅首次/重建数据库时)

```bash
docker exec ss-dev-postgres psql -U postgres -d sillytavern_saas -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec ss-dev-postgres psql -U postgres -d sillytavern_saas -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### Step 3: Sync Database Schema

```bash
# 推荐方式：直接将 schema 定义同步到数据库 (比 migrate 更可靠)
npx drizzle-kit push --force

# 备选方式：运行迁移文件 (已知存在部分迁移不执行的 bug)
# npm run db:migrate
```

> **重要**: `drizzle-kit migrate` 存在已知问题 — 部分迁移可能标记为已完成但实际未执行，
> 导致缺少表/列，后端报 `INTERNAL_ERROR: Failed query`。
> 使用 `drizzle-kit push --force` 可以一次性将所有 schema 定义同步到数据库，更加可靠。

### Step 4: Start Dev Servers (在独立终端中运行)

```bash
# Terminal 1 — Backend (port 3000)
npm run dev

# Terminal 2 — Frontend (port 5173)
npm run dev:client
```

### Docker Service Management

```bash
# 停止服务 (保留数据)
docker compose -p ssdev -f docker-compose.dev.yml stop

# 启动已停止的服务
docker compose -p ssdev -f docker-compose.dev.yml start

# 完全销毁 (保留数据卷)
docker compose -p ssdev -f docker-compose.dev.yml down

# 完全销毁 (包括数据卷 — 会丢失所有数据!)
docker compose -p ssdev -f docker-compose.dev.yml down --volumes
```

> **⚠️ 数据持久化警告**: 数据存储在 Docker named volumes (`ssdev_postgres-data`, `ssdev_redis-data`) 中。
> 绝对不要执行 `docker volume prune` 或 `down --volumes`，否则会丢失所有数据库数据。

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

**Full API documentation**: See `docs/api/openapi.yaml` (154 endpoints across 22 tags)

### Core Endpoints

**Authentication**: `/api/v1/auth/*` - register, login, refresh, logout, OAuth, MFA, password reset
**Characters**: `/api/v1/characters/*` - CRUD, search, marketplace
**Chats**: `/api/v1/chats/*` - CRUD, messages, WebSocket
**Intelligence**: `/api/v1/characters/:id/intelligence/*` - memories, emotion, debug
**Social**: `/api/v1/social/*` - follow, favorites, comments
**Notifications**: `/api/v1/notifications/*` - list, mark read
**Webhooks**: `/api/v1/webhooks/*` - CRUD, deliveries
**Developer**: `/api/v1/developer/*` - API keys
**Plugins**: `/api/v1/plugins/*` - marketplace, installs, execute
**Analytics**: `/api/v1/analytics/*` - overview, retention, funnel, realtime
**Admin**: `/api/v1/admin/*` - users, content moderation, experiments, audit logs
**Health**: `/health`, `/health/live`, `/health/ready`

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
- `src/server/services/llm.service.ts` - LLM provider integration
- `src/server/services/context-manager.service.ts` - Context window management
- `src/server/services/memory.service.ts` - Character memory (pgvector)
- `src/server/services/emotion.service.ts` - 2D emotion state machine
- `src/server/services/embedding.service.ts` - Text embedding (MiniLM)
- `src/server/services/cache.service.ts` - Redis caching
- `src/server/services/storage.service.ts` - File storage + thumbnails
- `src/server/services/event-bus.service.ts` - Internal event bus
- `src/server/services/webhook.service.ts` - Webhook delivery
- `src/server/services/plugin.service.ts` - Plugin lifecycle
- `src/server/services/recommendation.service.ts` - Recommendation engine
- `src/server/services/analytics-query.service.ts` - ClickHouse queries

### Frontend Stores
- `src/client/stores/user.ts` - User state
- `src/client/stores/chat.ts` - Chat state (WebSocket + HTTP)
- `src/client/stores/characterIntelligence.ts` - Memory/Emotion/Debug
- `src/client/stores/social.ts` - Follow/favorite/comment
- `src/client/stores/notification.ts` - Notifications
- `src/client/stores/plugin.ts` - Plugin marketplace
- `src/client/stores/analytics.ts` - Analytics dashboard

---

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Use named routes (`router.push({ name: 'xxx' })`)
- Use Pinia for state management
- Use `useToast` composable for notifications
- Use CSS variables from `variables.css`
- Use structured logging (not console.log)

### Testing
- Unit tests: `*.spec.ts` files alongside source
- E2E tests: `e2e/` directory
- Run tests: `npm run test` (unit), `npx playwright test` (E2E)
- Current status: 1600+ unit tests passing, 107/119 E2E tests passing

### Security
- CSRF protection enabled (Redis-backed in production)
- CSP headers configured
- Rate limiting per endpoint
- Input validation with Zod
- JWT secret separation (access vs refresh tokens)
- Plugin sandbox isolation (Worker Threads)

### Performance
- Redis caching with TTL
- Batch database operations
- Code splitting with Vite
- Image lazy loading
- WebSocket for real-time updates

---

## Key Features

### Intelligence System
- pgvector semantic search with hybrid retrieval
- 2D Valence-Arousal emotion model with exponential decay
- MiniLM local embeddings + sentiment analysis (ML microservice)
- Dynamic importance scoring, semantic dedup, LRU eviction
- Session isolation (memory + emotion per chatId)

### World Book System
- Four-tier scope: Chat > Persona > Character > Global
- Hybrid trigger: Keyword + Semantic matching
- 7 injection positions with timing control
- SillyTavern format import/export

### Social & Community
- Follow/unfollow users, favorites, threaded comments
- In-app notifications with WebSocket push
- Webhook system with HMAC-SHA256 signing
- Developer API with scoped API keys

### Plugin System
- Worker Thread sandbox isolation (64MB memory, 30s timeout)
- EventBus integration with pipeline support
- Per-plugin per-user KV store
- Marketplace with install management

### Analytics & Recommendations
- Kafka event pipeline → Flink stream processing → ClickHouse warehouse
- Real-time metrics via Redis Feature Store
- Recommendation engine (trending/collaborative/content-based)
- A/B testing framework with experiment analysis

### Security & Compliance
- OAuth2 (Google, GitHub) + TOTP 2FA
- RBAC with user/moderator/admin roles
- GDPR/CCPA compliance (data export, account deletion, consent management)
- Audit logging with IP hashing

---

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
# 重启 Docker PostgreSQL (使用 ssdev 项目名)
docker compose -p ssdev -f docker-compose.dev.yml restart postgres
npm run db:migrate
```

### Redis Issues
```bash
docker compose -p ssdev -f docker-compose.dev.yml restart redis
```

### Database Schema Mismatch (迁移不完整)

症状：后端返回 `INTERNAL_ERROR: Failed query` 错误，提示某列/表不存在。

原因：`drizzle-kit migrate` 可能将迁移标记为已完成但实际未执行（尤其在数据库重建后）。

修复（推荐）：
```bash
# 直接将 schema 定义同步到数据库，自动补全所有缺失的表和列
npx drizzle-kit push --force
```

诊断（如需手动排查）：
```bash
# 对比 schema 定义和实际表结构
docker exec ss-dev-postgres psql -U postgres -d sillytavern_saas -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;"
# 然后对比 src/db/schema/users.ts 中定义的列
```

### WSL2 Docker Ghost Containers

症状：`docker ps -a` 显示容器但 `docker rm` 报 "No such container"。

原因：WSL2 环境下 Docker 容器元数据损坏。

解决：使用不同的 compose 项目名绕过：
```bash
docker compose -p ssdev -f docker-compose.dev.yml up -d
```

### 数据持久化注意事项

- 数据存储在 Docker named volumes 中，不会随容器删除而丢失
- `docker compose down` 只删容器，不删数据卷 — 安全
- `docker compose down --volumes` 会删除数据卷 — **数据全部丢失**
- `docker volume prune` 会删除所有未使用的卷 — **极其危险，避免使用**
- 如需备份：`docker exec ss-dev-postgres pg_dump -U postgres sillytavern_saas > backup.sql`

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
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | OpenAPI spec (154 endpoints) |
| [docs/troubleshooting/](docs/troubleshooting/) | Troubleshooting guides |

---

## Recent Fixes & Known Issues

### GLM Model Configuration (2026-03-01)
**Issue**: GLM-4.5-air model was missing from MODEL_REGISTRY, causing default 4096 token context window instead of 128K.
**Impact**: Long character card greetings were truncated, AI lost context.
**Fix**: Added GLM model configurations to `src/server/config/llm.config.ts` (lines 137-142).
**Documentation**: `docs/troubleshooting/greeting-continuity-RESOLVED.md`

### Database Schema Sync
**Issue**: `drizzle-kit migrate` may mark migrations as complete without executing them.
**Solution**: Use `npx drizzle-kit push --force` to sync schema definitions directly.
**Documentation**: See Troubleshooting section below.

