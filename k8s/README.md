# Kubernetes Deployment Manifests

This directory contains Kubernetes manifests for deploying Small Squaretable to production.

## Files Overview

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates the `small-squaretable` namespace |
| `configmap.yaml` | Non-sensitive configuration values |
| `secrets.yaml` | Sensitive configuration (template - DO NOT commit production values) |
| `pvc.yaml` | Persistent Volume Claims for data storage |
| `postgres-deployment.yaml` | PostgreSQL database deployment and service |
| `redis-deployment.yaml` | Redis cache deployment and service |
| `app-deployment.yaml` | Application deployment and services |
| `db-migration-job.yaml` | Database migration job |
| `ingress.yaml` | Ingress configuration for external access |
| `hpa.yaml` | Horizontal Pod Autoscaler configuration |

## Quick Start

### 1. Prepare Secrets

```bash
# Copy secrets template
cp secrets.yaml secrets-production.yaml

# Edit with your production values
# IMPORTANT: Never commit secrets-production.yaml!
vim secrets-production.yaml
```

### 2. Update Configuration

Edit the following files with your values:

- `app-deployment.yaml`: Update container image reference
- `ingress.yaml`: Update domain name

### 3. Deploy

```bash
# Apply all manifests in order
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets-production.yaml
kubectl apply -f pvc.yaml
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n small-squaretable --timeout=300s

# Run migrations
kubectl apply -f db-migration-job.yaml
kubectl wait --for=condition=complete job/db-migration -n small-squaretable --timeout=300s

# Deploy application
kubectl apply -f app-deployment.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Ingress                              │
│                  (small-squaretable.example.com)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    App Service (ClusterIP)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │ App    │      │ App    │      │ App    │
    │ Pod 1  │      │ Pod 2  │      │ Pod 3  │
    └───┬────┘      └───┬────┘      └───┬────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌──────────────┐              ┌──────────────┐
│  PostgreSQL  │              │    Redis     │
│   Service    │              │   Service    │
└──────┬───────┘              └──────┬───────┘
       │                             │
       ▼                             ▼
┌──────────────┐              ┌──────────────┐
│  PostgreSQL  │              │    Redis     │
│     Pod      │              │     Pod      │
└──────┬───────┘              └──────┬───────┘
       │                             │
       ▼                             ▼
┌──────────────┐              ┌──────────────┐
│ postgres-pvc │              │  redis-pvc   │
│    (10Gi)    │              │    (5Gi)     │
└──────────────┘              └──────────────┘
```

## Resource Requirements

### Minimum Requirements

| Component | CPU Request | Memory Request | CPU Limit | Memory Limit |
|-----------|-------------|----------------|-----------|--------------|
| App Pod | 250m | 256Mi | 1000m | 1Gi |
| PostgreSQL | 250m | 256Mi | 1000m | 1Gi |
| Redis | 100m | 128Mi | 500m | 512Mi |

### Storage Requirements

| Volume | Size | Access Mode | Purpose |
|--------|------|-------------|---------|
| postgres-pvc | 10Gi | ReadWriteOnce | Database data |
| redis-pvc | 5Gi | ReadWriteOnce | Redis persistence |
| uploads-pvc | 20Gi | ReadWriteMany | User uploads |

## Scaling

### Horizontal Pod Autoscaler (HPA)

The application automatically scales between 3-10 replicas based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)

### Manual Scaling

```bash
# Scale to specific number of replicas
kubectl scale deployment/app --replicas=5 -n small-squaretable

# Disable autoscaling
kubectl delete hpa app-hpa -n small-squaretable
```

## Monitoring

### Check Deployment Status

```bash
# View all resources
kubectl get all -n small-squaretable

# Check pod status
kubectl get pods -n small-squaretable

# View pod logs
kubectl logs -f deployment/app -n small-squaretable

# Check events
kubectl get events -n small-squaretable --sort-by='.lastTimestamp'
```

### Health Checks

```bash
# Check application health
kubectl exec -it deployment/app -n small-squaretable -- curl http://localhost:3000/health

# Check readiness
kubectl exec -it deployment/app -n small-squaretable -- curl http://localhost:3000/health/ready
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod to see events
kubectl describe pod <pod-name> -n small-squaretable

# Check logs
kubectl logs <pod-name> -n small-squaretable

# Check previous container logs (if crashed)
kubectl logs <pod-name> -n small-squaretable --previous
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl exec -it deployment/postgres -n small-squaretable -- psql -U postgres -d sillytavern_saas -c "SELECT 1"

# Check database logs
kubectl logs deployment/postgres -n small-squaretable
```

### Migration Issues

```bash
# Check migration job status
kubectl get jobs -n small-squaretable

# View migration logs
kubectl logs job/db-migration -n small-squaretable

# Retry migration
kubectl delete job db-migration -n small-squaretable
kubectl apply -f db-migration-job.yaml
```

## Updating the Application

### Rolling Update

```bash
# Update image
kubectl set image deployment/app app=your-registry/small-squaretable:v1.1.0 -n small-squaretable

# Watch rollout status
kubectl rollout status deployment/app -n small-squaretable

# Check rollout history
kubectl rollout history deployment/app -n small-squaretable
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/app -n small-squaretable

# Rollback to specific revision
kubectl rollout undo deployment/app --to-revision=2 -n small-squaretable
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
kubectl exec deployment/postgres -n small-squaretable -- pg_dump -U postgres sillytavern_saas > backup-$(date +%Y%m%d).sql

# Restore backup
kubectl exec -i deployment/postgres -n small-squaretable -- psql -U postgres sillytavern_saas < backup-20260201.sql
```

### Volume Snapshots

Use your cloud provider's volume snapshot feature or Velero for comprehensive backup.

## Security Best Practices

1. **Never commit secrets**: Keep `secrets-production.yaml` out of version control
2. **Use RBAC**: Limit access to the namespace
3. **Network Policies**: Restrict pod-to-pod communication
4. **Pod Security**: Run containers as non-root user
5. **TLS/SSL**: Enable HTTPS via Ingress with cert-manager
6. **Secret Management**: Consider using external secret managers (Vault, AWS Secrets Manager)

## Production Checklist

Before deploying to production:

- [ ] Update all secrets in `secrets-production.yaml`
- [ ] Update container image reference in `app-deployment.yaml`
- [ ] Update domain in `ingress.yaml`
- [ ] Configure TLS certificates
- [ ] Set appropriate resource limits
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerting
- [ ] Test health check endpoints
- [ ] Verify database migrations
- [ ] Document rollback procedure

## Additional Resources

- [Deployment Guide](../deployment/deployment-guide.md)
- [Architecture Documentation](../architecture/infrastructure.md)
- [Stripe Setup Guide](../deployment/stripe-setup.md)
