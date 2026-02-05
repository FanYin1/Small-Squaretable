# CLAUDE.md

This file provides guidance to Claude Code when working with the Small-Squaretable project.

## Project Overview

**Small-Squaretable** is a SaaS transformation of SillyTavern - converting a single-user LLM frontend into an enterprise-grade multi-tenant platform with subscription billing, character marketplace, and real-time chat.

**Location**: `/var/aichat/Small-Squaretable`
**Status**: Phase 7 Complete - Production Ready
**Last Updated**: 2026-02-05

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

### Frontend Stores
- `src/client/stores/user.ts` - User state
- `src/client/stores/chat.ts` - Chat state (WebSocket + HTTP)
- `src/client/stores/ui.ts` - UI state
- `src/client/stores/characterIntelligence.ts` - Memory/Emotion state

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

# Sentry (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Troubleshooting

### Port Conflicts
```bash
lsof -ti:3000 | xargs kill -9  # Backend
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
