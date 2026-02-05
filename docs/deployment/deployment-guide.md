# Deployment Guide

This guide covers deploying Small Squaretable to production using Docker and Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Migration](#database-migration)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- Docker 20.10+
- Docker Compose 2.0+ (for local deployment)
- Kubernetes 1.24+ (for production deployment)
- kubectl CLI
- Node.js 20+ (for local development)

### Required Services

- PostgreSQL 15+
- Redis 7+
- Stripe account (for subscription features)

## Docker Deployment

### Local Development with Docker Compose

1. **Clone the repository**:
```bash
git clone <repository-url>
cd Small-Squaretable
```

2. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start all services**:
```bash
docker-compose up -d
```

4. **Check service status**:
```bash
docker-compose ps
```

5. **View logs**:
```bash
docker-compose logs -f app
```

6. **Stop services**:
```bash
docker-compose down
```

### Building the Docker Image

```bash
# Build the image
docker build -t small-squaretable:latest .

# Tag for your registry
docker tag small-squaretable:latest your-registry/small-squaretable:latest

# Push to registry
docker push your-registry/small-squaretable:latest
```

## Kubernetes Deployment

### Step 1: Prepare Secrets

Create a copy of the secrets template and update with your values:

```bash
cp k8s/secrets.yaml k8s/secrets-production.yaml
# Edit k8s/secrets-production.yaml with production values
```

**IMPORTANT**: Never commit `secrets-production.yaml` to version control!

### Step 2: Update Image Reference

Edit `k8s/app-deployment.yaml` and update the image reference:

```yaml
image: your-registry/small-squaretable:latest
```

### Step 3: Update Ingress Domain

Edit `k8s/ingress.yaml` and update the domain:

```yaml
- host: your-domain.com
```

### Step 4: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create ConfigMap and Secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets-production.yaml

# Create Persistent Volume Claims
kubectl apply -f k8s/pvc.yaml

# Deploy PostgreSQL
kubectl apply -f k8s/postgres-deployment.yaml

# Deploy Redis
kubectl apply -f k8s/redis-deployment.yaml

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n small-squaretable --timeout=300s

# Run database migration
kubectl apply -f k8s/db-migration-job.yaml

# Wait for migration to complete
kubectl wait --for=condition=complete job/db-migration -n small-squaretable --timeout=300s

# Deploy application
kubectl apply -f k8s/app-deployment.yaml

# Create services
kubectl apply -f k8s/ingress.yaml

# Enable autoscaling (optional)
kubectl apply -f k8s/hpa.yaml
```

### Step 5: Verify Deployment

```bash
# Check pod status
kubectl get pods -n small-squaretable

# Check service status
kubectl get svc -n small-squaretable

# Check ingress
kubectl get ingress -n small-squaretable

# View application logs
kubectl logs -f deployment/app -n small-squaretable

# Check health
kubectl exec -it deployment/app -n small-squaretable -- curl http://localhost:3000/health
```

## Environment Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://host:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-secure-random-string` |
| `NODE_ENV` | Environment mode | `production` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `HOST` | HTTP server host | `0.0.0.0` |
| `DATABASE_POOL_MIN` | Min database connections | `2` |
| `DATABASE_POOL_MAX` | Max database connections | `10` |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |
| `STORAGE_TYPE` | Storage backend | `local` |
| `STORAGE_PATH` | Local storage path | `./uploads` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `SENTRY_DSN` | Sentry error tracking DSN | - |

### LLM Provider Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_BASE_URL` | OpenAI API base URL | `https://api.openai.com/v1` |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `ANTHROPIC_BASE_URL` | Anthropic API base URL | `https://api.anthropic.com/v1` |
| `CUSTOM_LLM_API_KEY` | Custom LLM provider API key | - |
| `CUSTOM_LLM_BASE_URL` | Custom LLM provider base URL | - |
| `CUSTOM_LLM_MODELS` | Available models (comma-separated) | - |
| `CUSTOM_LLM_DEFAULT_MODEL` | Default model to use | - |

### Stripe Configuration

For subscription features, configure Stripe:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `STRIPE_PRICE_PRO_MONTHLY` | Pro monthly price ID |
| `STRIPE_PRICE_PRO_YEARLY` | Pro yearly price ID |
| `STRIPE_PRICE_TEAM_MONTHLY` | Team monthly price ID |

See [Stripe Setup Guide](stripe-setup.md) for detailed instructions.

### Validating Environment Variables

Run the validation script before deployment:

```bash
# Load environment variables
source .env

# Run validation
./scripts/validate-env.sh
```

## Database Migration

### Automatic Migration (Recommended)

Database migrations run automatically via Kubernetes Job before application starts.

### Manual Migration

If you need to run migrations manually:

```bash
# Using kubectl
kubectl exec -it deployment/app -n small-squaretable -- npm run db:migrate

# Using docker-compose
docker-compose run --rm app npm run db:migrate

# Local development
npm run db:migrate
```

### Creating New Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Review generated migration in src/db/migrations/

# Apply migration
npm run db:migrate
```

## Health Checks

The application provides three health check endpoints:

### `/health` - Basic Health Check

Returns basic application status. Always returns 200 if server is running.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "version": "0.1.0"
}
```

### `/health/live` - Liveness Probe

Used by Kubernetes to determine if pod should be restarted.

```bash
curl http://localhost:3000/health/live
```

**Kubernetes Configuration:**
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### `/health/ready` - Readiness Probe

Checks database and Redis connectivity. Used by Kubernetes to determine if pod can receive traffic.

```bash
curl http://localhost:3000/health/ready
```

Response (healthy):
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "ok",
      "latency": 5
    },
    "redis": {
      "status": "ok",
      "latency": 2
    }
  }
}
```

Response (unhealthy):
```json
{
  "status": "error",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "error",
      "error": "Connection refused"
    }
  }
}
```

**Kubernetes Configuration:**
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 10
  failureThreshold: 3
```

### Health Check Best Practices

1. **Liveness vs Readiness**
   - Liveness: Is the application running? (restart if not)
   - Readiness: Can the application handle traffic? (remove from load balancer if not)

2. **Timeout Configuration**
   - Set appropriate timeouts based on expected response times
   - Database checks may take longer under load

3. **Failure Thresholds**
   - Use `failureThreshold` to avoid false positives
   - Typically 3 failures before taking action

4. **Initial Delay**
   - Allow time for application startup
   - Database migrations may take time

## Monitoring

### Kubernetes Monitoring

```bash
# Watch pod status
kubectl get pods -n small-squaretable -w

# View pod events
kubectl describe pod <pod-name> -n small-squaretable

# View application logs
kubectl logs -f deployment/app -n small-squaretable

# View previous container logs (if crashed)
kubectl logs deployment/app -n small-squaretable --previous

# Check resource usage
kubectl top pods -n small-squaretable
```

### Application Metrics

The application exposes health check endpoints that can be monitored:

- **Uptime**: Check `/health` endpoint
- **Database connectivity**: Check `/health/ready` endpoint
- **Response time**: Monitor latency in health check responses

### Prometheus Integration

For production deployments, configure Prometheus to scrape metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'small-squaretable'
    static_configs:
      - targets: ['app-service:3000']
    metrics_path: '/health'
    scrape_interval: 30s
```

### Grafana Dashboards

Recommended dashboards for monitoring:

1. **Application Health**
   - HTTP request rate
   - Response time percentiles (P50, P95, P99)
   - Error rate
   - Active connections

2. **Database Metrics**
   - Connection pool usage
   - Query latency
   - Active queries
   - Cache hit ratio

3. **Redis Metrics**
   - Memory usage
   - Cache hit/miss ratio
   - Connected clients
   - Operations per second

### Alert Rules

Configure alerts for critical conditions:

```yaml
# alertmanager rules
groups:
  - name: small-squaretable
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected

      - alert: DatabaseConnectionFailure
        expr: health_check_database_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Database connection failed

      - alert: RedisConnectionFailure
        expr: health_check_redis_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Redis connection failed

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High memory usage detected

      - alert: HighCPUUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.7
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High CPU usage detected
```

### Sentry Error Tracking

Configure Sentry for error tracking:

```bash
# Set environment variable
SENTRY_DSN=https://xxx@sentry.io/xxx
```

Sentry will automatically capture:
- Unhandled exceptions
- API errors
- Performance traces
- User context

### Log Aggregation

For centralized logging, configure Loki or ELK stack:

```yaml
# Loki configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
    positions:
      filename: /tmp/positions.yaml
    clients:
      - url: http://loki:3100/loki/api/v1/push
    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
```

### Recommended Monitoring Tools

- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Loki**: Log aggregation
- **Sentry**: Error tracking (configure `SENTRY_DSN`)
- **Jaeger**: Distributed tracing (optional)

## Troubleshooting

### Application Won't Start

1. **Check pod status**:
```bash
kubectl get pods -n small-squaretable
```

2. **View pod logs**:
```bash
kubectl logs deployment/app -n small-squaretable
```

3. **Check events**:
```bash
kubectl describe pod <pod-name> -n small-squaretable
```

4. **Common issues**:
   - Missing environment variables
   - Database connection failure
   - Redis connection failure
   - Invalid JWT secret

### Database Connection Issues

1. **Check PostgreSQL pod**:
```bash
kubectl get pods -l app=postgres -n small-squaretable
```

2. **Test database connection**:
```bash
kubectl exec -it deployment/postgres -n small-squaretable -- psql -U postgres -d sillytavern_saas -c "SELECT 1"
```

3. **Check database logs**:
```bash
kubectl logs deployment/postgres -n small-squaretable
```

### Redis Connection Issues

1. **Check Redis pod**:
```bash
kubectl get pods -l app=redis -n small-squaretable
```

2. **Test Redis connection**:
```bash
kubectl exec -it deployment/redis -n small-squaretable -- redis-cli ping
```

3. **Check Redis logs**:
```bash
kubectl logs deployment/redis -n small-squaretable
```

### Migration Failures

1. **Check migration job status**:
```bash
kubectl get jobs -n small-squaretable
```

2. **View migration logs**:
```bash
kubectl logs job/db-migration -n small-squaretable
```

3. **Retry migration**:
```bash
kubectl delete job db-migration -n small-squaretable
kubectl apply -f k8s/db-migration-job.yaml
```

### Performance Issues

1. **Check resource usage**:
```bash
kubectl top pods -n small-squaretable
```

2. **Check HPA status**:
```bash
kubectl get hpa -n small-squaretable
```

3. **Scale manually if needed**:
```bash
kubectl scale deployment/app --replicas=5 -n small-squaretable
```

### Rollback Deployment

```bash
# View deployment history
kubectl rollout history deployment/app -n small-squaretable

# Rollback to previous version
kubectl rollout undo deployment/app -n small-squaretable

# Rollback to specific revision
kubectl rollout undo deployment/app --to-revision=2 -n small-squaretable
```

## Security Best Practices

1. **Secrets Management**:
   - Never commit secrets to version control
   - Use Kubernetes Secrets or external secret managers (e.g., HashiCorp Vault)
   - Rotate secrets regularly

2. **Network Security**:
   - Use NetworkPolicies to restrict pod communication
   - Enable TLS/SSL for all external traffic
   - Use private container registries

3. **Access Control**:
   - Use RBAC for Kubernetes access
   - Limit pod privileges (non-root user)
   - Enable Pod Security Standards

4. **Database Security**:
   - Use strong passwords
   - Enable SSL for database connections
   - Regular backups
   - Implement row-level security

5. **Application Security**:
   - Keep dependencies updated
   - Regular security audits
   - Enable rate limiting
   - Implement proper input validation

## Backup and Recovery

### Database Backup

```bash
# Create backup
kubectl exec deployment/postgres -n small-squaretable -- pg_dump -U postgres sillytavern_saas > backup.sql

# Restore backup
kubectl exec -i deployment/postgres -n small-squaretable -- psql -U postgres sillytavern_saas < backup.sql
```

### Redis Backup

Redis persistence is configured with both RDB and AOF:
- RDB snapshots every 15 minutes if 1+ keys changed
- AOF append-only file with fsync every second

### Persistent Volume Backup

Use your cloud provider's volume snapshot feature or tools like Velero for Kubernetes backup.

## Scaling

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# Manual scaling
kubectl scale deployment/app --replicas=10 -n small-squaretable

# Auto-scaling is configured via HPA (3-10 replicas)
# Based on CPU (70%) and memory (80%) utilization
```

### Vertical Scaling

Update resource limits in `k8s/app-deployment.yaml`:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

### Database Scaling

For production workloads, consider:
- Read replicas for read-heavy workloads
- Connection pooling (PgBouncer)
- Managed database services (AWS RDS, Google Cloud SQL)

## Production Checklist

Before going to production:

- [ ] All secrets are properly configured
- [ ] Database backups are automated
- [ ] Monitoring and alerting are set up
- [ ] SSL/TLS certificates are configured
- [ ] Domain DNS is configured
- [ ] Resource limits are appropriate
- [ ] Health checks are working
- [ ] Logging is configured
- [ ] Error tracking is enabled (Sentry)
- [ ] Rate limiting is configured
- [ ] Security headers are enabled
- [ ] CORS is properly configured
- [ ] Database migrations are tested
- [ ] Rollback procedure is documented
- [ ] On-call rotation is established

## Support

For issues and questions:
- Check the [troubleshooting section](#troubleshooting)
- Review application logs
- Check health endpoints
- Consult the [architecture documentation](../architecture/infrastructure.md)
