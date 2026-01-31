# Infrastructure Architecture

## Overview

Small Squaretable uses a monolithic backend architecture with clear service boundaries, making it microservice-ready for future scaling. The infrastructure is built on modern TypeScript tooling with a focus on type safety, testability, and maintainability.

## Components

### Database Layer

- **PostgreSQL**: Primary data store with JSONB support for flexible schemas
- **Drizzle ORM**: Type-safe database access with migration support
- **Repository Pattern**: Abstraction layer for database operations

#### Schema Design

The database schema follows a multi-tenant architecture:

- **tenants**: Organization/workspace isolation
- **users**: User accounts with tenant association
- **characters**: AI character definitions (tenant-scoped)
- **chats**: Conversation history (tenant-scoped)

All tenant-scoped tables include a `tenant_id` foreign key for data isolation.

#### Repository Pattern

Base repository provides common database access patterns:

```typescript
abstract class BaseRepository {
  constructor(protected db: Database) {}
}
```

Concrete repositories extend the base and implement domain-specific queries with tenant isolation.

### Caching Layer

- **Redis**: Session storage, caching, and pub/sub messaging
- **Connection Pooling**: Singleton pattern for efficient resource usage
- **Graceful Shutdown**: Proper cleanup on application termination

Redis is used for:
- Session management
- Rate limiting
- Caching frequently accessed data
- Real-time features (future)

### API Layer

- **Hono Framework**: High-performance HTTP server with TypeScript support
- **Middleware Stack**:
  - Logger: Request/response logging
  - CORS: Cross-origin resource sharing
  - Tenant Context: Multi-tenancy support
  - Error Handler: Centralized error handling

#### Middleware Pipeline

```
Request → Logger → CORS → Tenant Context → Route Handler → Error Handler → Response
```

### Error Handling

Custom error classes for different scenarios:

- `AppError`: Base error class with status code and error code
- `ValidationError`: 400 - Invalid input data
- `UnauthorizedError`: 401 - Authentication required
- `ForbiddenError`: 403 - Insufficient permissions
- `NotFoundError`: 404 - Resource not found

Error handler middleware provides:
- Consistent error response format
- Environment-aware error details (stack traces in development only)
- Automatic status code mapping

## Multi-Tenancy

Tenant isolation is enforced at multiple levels:

1. **Middleware**: Extracts tenant ID from `X-Tenant-ID` header
2. **Context**: Stores tenant ID in request context for downstream use
3. **Repository**: Tenant-scoped queries filter by tenant ID
4. **Database**: Row-level security policies (future enhancement)

### Tenant Context Flow

```
HTTP Request
  ↓
Tenant Middleware (extracts X-Tenant-ID header)
  ↓
Request Context (stores tenantId)
  ↓
Repository Layer (filters by tenantId)
  ↓
Database Query (WHERE tenant_id = ?)
```

## Configuration Management

Environment-based configuration using `dotenv`:

- `NODE_ENV`: Environment (development, test, production)
- `PORT`: HTTP server port
- `HOST`: HTTP server host
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

Configuration is validated at startup to fail fast on misconfiguration.

## Testing Strategy

### Unit Tests

- Individual components (repositories, middleware, utilities)
- Mocked dependencies for isolation
- Fast execution (<100ms per test)

### Integration Tests

- Full request/response cycle
- Real database connections (test database)
- Middleware pipeline validation

### Coverage Target

- **Phase 1**: 85% code coverage
- **Critical paths**: 100% coverage (auth, tenant isolation, data access)

### Test Infrastructure

- **Vitest**: Fast unit test runner with TypeScript support
- **Test Doubles**: Mocks, stubs, and spies for dependency isolation
- **Fixtures**: Reusable test data and setup utilities

## Development Workflow

### Local Development

1. Start dependencies (PostgreSQL, Redis)
2. Run database migrations
3. Start development server with hot reload
4. Run tests in watch mode

### CI/CD Pipeline (Future)

```
Code Push → Lint → Type Check → Tests → Build → Deploy
```

## Performance Considerations

### Database

- Connection pooling (max 20 connections)
- Prepared statements for query optimization
- Indexes on foreign keys and frequently queried columns

### Caching

- Redis for session data (TTL: 24 hours)
- Query result caching for expensive operations
- Cache invalidation on data mutations

### API

- Hono's zero-overhead routing
- Streaming responses for large payloads (future)
- Compression middleware (future)

## Security

### Current Implementation

- Environment variable validation
- SQL injection prevention (parameterized queries via Drizzle)
- CORS configuration
- Error message sanitization (no stack traces in production)

### Future Enhancements

- Authentication (JWT/session-based)
- Authorization (RBAC)
- Rate limiting
- Input validation (Zod schemas)
- HTTPS enforcement
- Security headers (Helmet)

## Monitoring and Observability (Future)

### Logging

- Structured logging (JSON format)
- Log levels (debug, info, warn, error)
- Request/response logging
- Error tracking

### Metrics

- Request rate
- Response time (P50, P95, P99)
- Error rate
- Database query performance
- Redis hit/miss ratio

### Tracing

- Distributed tracing (OpenTelemetry)
- Request correlation IDs
- Performance profiling

## Deployment Architecture (Future)

### Development

- Local Docker Compose setup
- Hot reload for rapid iteration

### Staging

- Kubernetes cluster
- Separate database and Redis instances
- CI/CD automated deployments

### Production

- Multi-region deployment
- Load balancing
- Auto-scaling
- Database replication
- Redis cluster

## Migration Strategy

### From SillyTavern

1. **Data Migration**: Convert file-based storage to PostgreSQL
2. **API Compatibility**: Maintain backward compatibility with existing clients
3. **Feature Parity**: Ensure all core features work in multi-tenant mode
4. **Gradual Rollout**: Phased migration with rollback capability

### Database Migrations

- Version-controlled migration files
- Forward-only migrations (no rollbacks in production)
- Data migration scripts for schema changes
- Migration testing in staging environment

## Scalability Roadmap

### Phase 1: Monolith (Current)

- Single application server
- Shared database and Redis
- Suitable for 0-1000 users

### Phase 2: Horizontal Scaling

- Multiple application instances
- Load balancer
- Shared database and Redis cluster
- Suitable for 1000-10000 users

### Phase 3: Microservices

- Service decomposition (auth, chat, character management)
- Service mesh
- Event-driven architecture
- Suitable for 10000+ users

## Technology Decisions

### Why Hono?

- Fastest Node.js web framework
- Excellent TypeScript support
- Minimal overhead
- Edge runtime compatible (future Cloudflare Workers deployment)

### Why Drizzle ORM?

- Type-safe queries
- Lightweight (no runtime overhead)
- SQL-first approach (no magic)
- Excellent migration support

### Why Redis?

- Fast in-memory storage
- Rich data structures
- Pub/sub for real-time features
- Industry standard for caching

### Why PostgreSQL?

- ACID compliance
- JSONB support for flexible schemas
- Excellent performance
- Rich ecosystem
- Row-level security for multi-tenancy

## Conclusion

The infrastructure is designed for:

1. **Developer Experience**: Type safety, fast feedback loops, clear abstractions
2. **Maintainability**: Clean architecture, testable code, comprehensive documentation
3. **Scalability**: Clear service boundaries, stateless design, horizontal scaling ready
4. **Reliability**: Error handling, graceful degradation, monitoring hooks

This foundation supports the transformation of SillyTavern from a single-user application to a robust multi-tenant SaaS platform.
