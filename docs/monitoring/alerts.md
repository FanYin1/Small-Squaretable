# Monitoring Alert Rules

This document defines critical alert rules for monitoring the Small Squaretable application.

## Alert Severity Levels

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **P0 - Critical** | Service is down or severely degraded | Immediate (5-15 min) |
| **P1 - High** | Major functionality affected | < 1 hour |
| **P2 - Medium** | Performance degradation | < 4 hours |
| **P3 - Low** | Minor issues or trends | Business hours |

---

## Application Health Alerts

### 1. Health Check Failure (P0 - Critical)

**Alert**: Application health check fails

**Condition**:
```
health_check_status != "ok" for 2 minutes
```

**Endpoints to monitor**:
- `/health` - Basic health check
- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe

**Notifications**: PagerDuty, Slack #alerts

**Runbook**:
1. Check server logs for errors
2. Verify database and Redis connectivity
3. Check system resources (CPU, memory, disk)
4. Restart service if needed

---

## Error Rate Alerts

### 2. High Error Rate (P1 - High)

**Alert**: Application error rate exceeds threshold

**Condition**:
```
error_rate > 1% for 5 minutes
```

**Metric**: `(http_requests_total{status=~"5.."} / http_requests_total) * 100`

**Notifications**: Slack #alerts, Email

**Thresholds**:
- **Warning**: 0.5% error rate for 5 minutes
- **Critical**: 1% error rate for 5 minutes

**Runbook**:
1. Check Sentry error dashboard
2. Review recent deployments
2. Check error patterns by endpoint
4. Identify root cause and fix

---

## API Performance Alerts

### 3. Slow API Response Time (P2 - Medium)

**Alert**: API response time P95 exceeds threshold

**Condition**:
```
http_request_duration_seconds{quantile="0.95"} > 0.5 for 10 minutes
```

**Metric**: `http_request_duration_seconds`

**Endpoints to monitor**:
- `/api/v1/*` - All API endpoints

**Thresholds**:
- **Warning**: P95 > 300ms for 10 minutes
- **Critical**: P95 > 500ms for 10 minutes

**Notifications**: Slack #alerts

**Runbook**:
1. Identify slow endpoints
2. Check database query performance
3. Review Redis cache hit rate
4. Scale resources if needed

### 4. Very Slow API Response Time (P1 - High)

**Alert**: API response time P95 exceeds critical threshold

**Condition**:
```
http_request_duration_seconds{quantile="0.95"} > 2.0 for 5 minutes
```

**Notifications**: Slack #alerts, Email

**Runbook**:
1. Immediate investigation required
2. Consider scaling or deployment rollback
3. Check for resource exhaustion

---

## Database Alerts

### 5. Database Connection Failure (P0 - Critical)

**Alert**: Database health check fails

**Condition**:
```
health_check_database_status != "ok" for 2 minutes
```

**Endpoint**: `/health/ready`

**Notifications**: PagerDuty, Slack #alerts

**Runbook**:
1. Verify PostgreSQL is running
2. Check database logs
3. Verify connection string and credentials
4. Check database resource limits
5. Restart application if database is healthy

### 6. High Database Connection Pool Usage (P2 - Medium)

**Alert**: Database connection pool is nearly exhausted

**Condition**:
```
db_pool_active_connections / db_pool_max_connections > 0.8 for 10 minutes
```

**Thresholds**:
- **Warning**: > 70% for 10 minutes
- **Critical**: > 80% for 10 minutes

**Notifications**: Slack #alerts

**Runbook**:
1. Check for connection leaks
2. Review slow queries
3. Consider increasing pool size
4. Scale database or application

### 7. Slow Database Query (P2 - Medium)

**Alert**: Database query latency exceeds threshold

**Condition**:
```
db_query_duration_seconds{quantile="0.95"} > 1.0 for 10 minutes
```

**Notifications**: Slack #alerts

**Runbook**:
1. Enable query logging if not enabled
2. Identify slow queries
3. Add appropriate indexes
4. Optimize query logic

---

## Redis Alerts

### 8. Redis Connection Failure (P1 - High)

**Alert**: Redis health check fails

**Condition**:
```
health_check_redis_status != "ok" for 2 minutes
```

**Endpoint**: `/health/ready`

**Notifications**: Slack #alerts, Email

**Runbook**:
1. Verify Redis is running
2. Check Redis logs
3. Verify connection string and password
4. Check Redis memory limits
5. Restart application if Redis is healthy

### 9. High Redis Memory Usage (P2 - Medium)

**Alert**: Redis memory usage exceeds threshold

**Condition**:
```
redis_memory_used / redis_memory_max > 0.8 for 10 minutes
```

**Thresholds**:
- **Warning**: > 70% for 10 minutes
- **Critical**: > 80% for 10 minutes

**Notifications**: Slack #alerts

**Runbook**:
1. Check cache eviction policy
2. Review cache TTL settings
3. Identify large cache keys
4. Scale Redis instance if needed

---

## System Resource Alerts

### 10. High Memory Usage (P1 - High)

**Alert**: Application memory usage exceeds threshold

**Condition**:
```
process_resident_memory_bytes / node_memory_total > 0.8 for 10 minutes
```

**Thresholds**:
- **Warning**: > 70% for 10 minutes
- **Critical**: > 80% for 10 minutes

**Notifications**: Slack #alerts, Email

**Runbook**:
1. Check for memory leaks
2. Review heap usage
3. Check connection pool sizes
4. Scale application resources

### 11. High CPU Usage (P2 - Medium)

**Alert**: Application CPU usage exceeds threshold

**Condition**:
```
process_cpu_seconds_total > 0.7 for 10 minutes
```

**Thresholds**:
- **Warning**: > 60% for 10 minutes
- **Critical**: > 70% for 10 minutes

**Notifications**: Slack #alerts

**Runbook**:
1. Identify CPU-intensive operations
2. Check for inefficient loops or algorithms
3. Review database query patterns
4. Scale application resources if needed

### 12. Disk Space Low (P0 - Critical)

**Alert**: Disk space is critically low

**Condition**:
```
disk_available_bytes / disk_total_bytes < 0.1
```

**Thresholds**:
- **Warning**: < 20% available
- **Critical**: < 10% available

**Notifications**: PagerDuty, Slack #alerts

**Runbook**:
1. Identify large files or logs
2. Clean up old logs and temporary files
3. Set up log rotation if not configured
4. Add disk space immediately

---

## Authentication & Security Alerts

### 13. High Failed Authentication Rate (P2 - Medium)

**Alert**: Failed authentication attempts exceed threshold

**Condition**:
```
auth_failed_requests_total / auth_requests_total > 0.1 for 5 minutes
```

**Thresholds**:
- **Warning**: > 5% failure rate for 5 minutes
- **Critical**: > 10% failure rate for 5 minutes

**Notifications**: Slack #alerts, Security team

**Runbook**:
1. Check for brute force attacks
2. Review rate limiting configuration
3. Check authentication service logs
4. Verify auth provider status

### 14. Suspicious Activity Pattern (P1 - High)

**Alert**: Anomalous user activity detected

**Condition**:
```
single_user_requests > 1000 in 1 minute
```

**Notifications**: Slack #alerts, Security team

**Runbook**:
1. Verify user identity
2. Check if user account is compromised
3. Consider temporary account lock
4. Review activity logs

---

## Business Metrics Alerts

### 15. High API Usage Spike (P2 - Medium)

**Alert**: API usage shows unusual spike

**Condition**:
```
api_requests_total > 2 * avg(api_requests_total over 1h)
```

**Notifications**: Slack #alerts

**Runbook**:
1. Verify if spike is legitimate
2. Check for API abuse or DDoS
3. Review rate limiting effectiveness
4. Consider autoscaling

### 16. Zero Usage (P3 - Low)

**Alert**: No API requests for extended period

**Condition**:
```
api_requests_total == 0 for 30 minutes
```

**Notifications**: Email (business hours only)

**Runbook**:
1. Verify service is running
2. Check network connectivity
3. Review monitoring system health

---

## Custom Dashboard Queries

### Health Check Status
```promql
health_check_status
```

### Error Rate by Status Code
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (status)
sum(rate(http_requests_total{status=~"4.."}[5m])) by (status)
```

### Request Rate by Endpoint
```promql
sum(rate(http_requests_total[5m])) by (endpoint, method)
```

### Response Time P95 by Endpoint
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint))
```

### Database Connection Pool
```promql`
db_pool_active_connections
db_pool_idle_connections
db_pool_max_connections
```

### Redis Metrics
```promql
redis_connected_clients
redis_memory_used_bytes
redis_evicted_keys_total
```

### Application Memory
```promql
process_resident_memory_bytes / 1024 / 1024
process_heap_used_bytes / process_heap_total_bytes * 100
```

---

## Alert Integration

### Sentry
- Error rate alerts configured in Sentry
- Project: Small Squaretable Backend / Frontend
- Email notifications for critical issues

### Slack
- Channel: `#alerts`
- Severity P0+ triggers pager
- Severity P1+ triggers direct message
- Severity P2+ posts to channel

### Email
- Recipients: on-call team
- Response time based on severity

---

## Maintenance Windows

Alerts may be suppressed during scheduled maintenance windows:

1. **Deployment windows**: Tuesday & Thursday 2-4 PM UTC
2. **Database maintenance**: First Sunday of month, 1-3 AM UTC
3. **Infrastructure updates**: As announced 24h in advance

---

## Alert Escalation

**P0 - Critical**:
- Immediate: On-call engineer (PagerDuty)
- 15 min: Engineering lead
- 30 min: Engineering manager

**P1 - High**:
- Immediate: On-call engineer (Slack)
- 1 hour: Engineering lead
- 2 hours: Engineering manager

**P2 - Medium**:
- Immediate: Slack channel
- 4 hours: Engineering team (during business hours)

**P3 - Low**:
- Post to backlog
- Review in next sprint planning

---

## Configuration Examples

### Prometheus Alert Rule
```yaml
groups:
  - name: small_squaretable
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} for 5 minutes"
```

### Grafana Dashboard Variables
```json
{
  "datasource": "Prometheus",
  "interval": "1m",
  "targets": [
    {
      "expr": "rate(http_requests_total[5m])",
      "legendFormat": "{{method}} {{endpoint}}"
    }
  ]
}
```

---

## Contact Information

- **On-call Rotation**: [Link to schedule]
- **Slack Channel**: #alerts, #engineering
- **Email**: alerts@small-squaretable.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX

---

## Related Documentation

- [Health Check Endpoints](../api/health.md)
- [Sentry Integration](./sentry.md)
- [Logging Configuration](./logging.md)
- [Runbooks](../operations/runbooks/)
