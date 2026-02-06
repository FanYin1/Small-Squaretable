# CLAUDE.md

This file provides guidance to Claude Code when working with the Small-Squaretable project.

## Project Overview

**Small-Squaretable** is a SaaS transformation of SillyTavern - converting a single-user LLM frontend into an enterprise-grade multi-tenant platform with subscription billing, character marketplace, and real-time chat.

**Location**: `/var/aichat/Small-Squaretable`
**Status**: Phase 7 Complete - Production Ready
**Last Updated**: 2026-02-06

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
| Testing | Vitest (Unit) + Playwright (E2E) |

---

## Project Structure

```
Small-Squaretable/
├── src/
│   ├── client/                 # Vue 3 Frontend
│   │   ├── components/         # UI Components
│   │   ├── pages/              # Page Components
│   │   ├── router/             # Vue Router
│   │   ├── stores/             # Pinia Stores
│   │   ├── services/           # API Services
│   │   ├── composables/        # Vue Composables
│   │   └── utils/              # Utilities
│   ├── server/                 # Hono.js Backend
│   │   ├── routes/             # API Routes
│   │   ├── services/           # Business Logic
│   │   └── middleware/         # Middleware (auth, csrf, security, rateLimit)
│   ├── db/                     # Database
│   │   ├── schema/             # Drizzle Schema
│   │   ├── repositories/       # Data Access Layer
│   │   └── migrations/         # DB Migrations
│   ├── core/                   # Shared Core (redis, config)
│   └── types/                  # TypeScript Types
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

### Chats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/chats` | List chats |
| POST | `/api/v1/chats` | Create chat |
| GET | `/api/v1/chats/:id` | Get chat |
| POST | `/api/v1/chats/:id/messages` | Send message |
| GET | `/api/v1/chats/:id/messages` | Get messages |

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
- `src/server/services/intelligence-debug.service.ts` - Debug state tracking
- `src/server/services/websocket.service.ts` - WebSocket + Intelligence events

### Frontend Stores
- `src/client/stores/user.ts` - User state
- `src/client/stores/chat.ts` - Chat state (WebSocket + HTTP)
- `src/client/stores/ui.ts` - UI state
- `src/client/stores/characterIntelligence.ts` - Memory/Emotion/Debug state

### Debug Components (调试面板)
- `src/client/components/debug/IntelligenceDebugPanel.vue` - Main debug container
- `src/client/components/debug/SystemPromptViewer.vue` - System prompt viewer
- `src/client/components/debug/MemoryRetrievalLog.vue` - Memory retrieval log
- `src/client/components/debug/EmotionTimeline.vue` - Emotion timeline chart
- `src/client/components/debug/ExtractionLog.vue` - Memory extraction log
- `src/client/components/debug/PerformanceMetrics.vue` - Performance metrics

---

## Recent Updates (2026-02-06)

### Intelligence System Integration (智能系统集成)
- **Critical Fix**: Memory and emotion system now properly integrated into WebSocket message flow
- **Changes**:
  - `src/server/routes/websocket.ts` - Added intelligence system calls in `handleUserMessage`
  - Memory retrieval and emotion injection into system prompt
  - Emotion state updates after user and assistant messages
  - Memory extraction after each message exchange
- **Memory Extraction**: Changed from every 10 messages to every 1 message (immediate extraction)

### Bug Fixes
1. **Auto-scroll Issue**
   - **Problem**: Chat window scrolled to top instead of bottom after receiving messages
   - **Fix**: Changed `scrollIntoView` to `scrollTo` in `ChatWindow.vue`

2. **Session Persistence**
   - **Problem**: Messages lost on page refresh
   - **Fix**: Added localStorage persistence for last selected chat in `Chat.vue`

3. **Token Expiration**
   - **Problem**: Login expired too quickly (15 minutes)
   - **Fix**: Extended access token to 6 hours in `src/core/jwt.ts`

4. **Debug Panel API Response**
   - **Problem**: Debug components couldn't parse API responses correctly
   - **Fix**: Fixed response parsing in 5 debug components (removed extra `.data.data` nesting)

### Intelligence Debug Panel (智能系统调试面板)
- **Feature**: Real-time monitoring panel for memory and emotion system
- **Components**:
  - SystemPromptViewer - View actual system prompt with token counts
  - MemoryRetrievalLog - Track memory retrieval with score breakdown
  - EmotionTimeline - SVG chart showing valence/arousal over time
  - ExtractionLog - Monitor memory extraction with message counter
  - PerformanceMetrics - Track latency metrics and model status
- **WebSocket Events**: `intelligence:emotion_change`, `intelligence:memory_retrieval`, `intelligence:memory_extraction`, `intelligence:prompt_build`
- **Access**: Click the chart icon (📊) in Chat page header

### ML Models
- **Embedding Model**: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` - 多语言支持 (中英文等 50+ 语言)
- **Sentiment Model**: `Xenova/bert-base-multilingual-uncased-sentiment` - 多语言情感分析 (1-5 星评分)
- **Cache Directory**: `./models`
- **输出**: 情感分析返回 1-5 星评分，嵌入维度 384

### ML Microservice (2026-02-06)
- **Location**: `ml-service/`
- **Port**: 3001 (configurable via `ML_SERVICE_PORT`)
- **Purpose**: 独立的 ML 处理服务，对用户透明
- **Endpoints**:
  - `GET /health` - 健康检查
  - `POST /embed` - 文本嵌入
  - `POST /embed/batch` - 批量嵌入
  - `POST /sentiment` - 情感分析
- **启动**: `npm run dev:ml` 或 `cd ml-service && npm start`
- **架构**: 主服务通过 HTTP 调用 ML 服务，用户无感知
- **代理支持**: 自动检测 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量，使用 `undici` ProxyAgent 配置全局代理
- **依赖**: `@xenova/transformers`, `undici`

### Session Isolation (会话隔离)
- **Memory**: 记忆按 `chatId` 隔离，每个会话独立存储和检索
- **Emotion**: 情感状态按 `chatId` 隔离，每个会话独立追踪
- **UI**: 情感/记忆/调试按钮位于 ChatWindow header 右侧，绑定当前会话
- **Database Indexes**:
  - `idx_character_emotions_unique_chat` - 带 chatId 的唯一约束
  - `idx_character_emotions_unique_no_chat` - 无 chatId 的唯一约束

---

## Recent Fixes (2026-02-05)

### 1. SillyTavern V2 Character Card Import
- **Problem**: V2 format has data nested in `data` block
- **Fix**: Added `isV2Format()` and `normalizeSillyTavernData()` in `src/client/utils/sillytavern.ts`

### 2. Character Select Display
- **Problem**: Selected character name not showing in el-select
- **Fix**: Added CSS to force text color in `src/client/pages/Chat.vue`

### 3. WebSocket Message Storage
- **Problem**: Messages lost on refresh (temp IDs not replaced)
- **Fix**: Updated `userMessage` handler in `src/client/stores/chat.ts` to replace temp messages with real DB IDs

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
- Test pass rate: 99% unit, 92% E2E

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
