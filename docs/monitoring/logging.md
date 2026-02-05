# Logging Configuration

This document describes the structured logging system for Small Squaretable.

## Overview

The application uses a structured JSON logging format with support for multiple log levels, request tracking, and contextual information.

## Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **debug** | Detailed diagnostic information | Development, troubleshooting |
| **info** | General informational messages | Normal operation tracking |
| **warn** | Warning messages for potential issues | Recoverable issues, deprecations |
| **error** | Error messages | Failures, exceptions |

## Configuration

### Environment Variables

```bash
# Log Level (debug, info, warn, error)
LOG_LEVEL=info

# Environment (development, production)
NODE_ENV=production

# Optional: Log file path (for file-based logging)
LOG_FILE_PATH=/var/log/small-squaretable/app.log
```

### Log Level Priority

Lower log levels include higher levels:

- `debug` includes: debug, info, warn, error
- `info` includes: info, warn, error
- `warn` includes: warn, error
- `error` includes: error

## Logger Usage

### Basic Usage

```typescript
import { logger } from '@/server/services/logger.service';

// Log at different levels
logger.debug('Debug message', { detail: 'value' });
logger.info('User logged in', { userId: '123' });
logger.warn('Slow query detected', { duration: 1500 });
logger.error('Database connection failed', error, { db: 'postgres' });
```

### Contextual Logging

```typescript
import { createLogger } from '@/server/services/logger.service';

// Create logger with context
const requestLogger = createLogger({
  requestId: 'req-123',
  userId: 'user-456',
  tenantId: 'tenant-789',
  action: 'create_character',
});

// All logs will include the context
requestLogger.info('Processing request');

// Create child logger with additional context
const childLogger = requestLogger.child({
  characterId: 'char-101',
});

childLogger.info('Character created');
```

### Specialized Loggers

#### HTTP Request Logging

```typescript
import { logRequest } from '@/server/services/logger.service';

logRequest({
  requestId: 'req-123',
  userId: 'user-456',
  tenantId: 'tenant-789',
  method: 'POST',
  path: '/api/v1/characters',
  status: 201,
  duration: 234,
});
```

#### Database Query Logging

```typescript
import { logDatabaseQuery } from '@/server/services/logger.service';

logDatabaseQuery({
  requestId: 'req-123',
  query: 'SELECT * FROM characters WHERE id = $1',
  duration: 12,
});
```

#### Cache Operation Logging

```typescript
import { logCacheOperation } from '@/server/services/logger.service';

logCacheOperation({
  requestId: 'req-123',
  operation: 'get',
  key: 'characters:123',
  duration: 2,
});
```

#### Security Event Logging

```typescript
import { logSecurityEvent } from '@/server/services/logger.service';

logSecurityEvent({
  requestId: 'req-123',
  userId: 'user-456',
  tenantId: 'tenant-789',
  event: 'failed_login',
  details: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  },
});
```

## Log Format

### Development Format

Development mode uses pretty-printed console logs with colors:

```
[INFO] 2026-02-04T10:30:45.123Z - User logged in {"userId":"123","tenantId":"789"}
[WARN] 2026-02-04T10:30:46.456Z - Slow query detected {"duration":1500}
[ERROR] 2026-02-04T10:30:47.789Z - Database connection failed {"error":{"name":"Error","message":"Connection refused"}}
```

### Production Format

Production mode uses structured JSON:

```json
{
  "level": "info",
  "message": "User logged in",
  "timestamp": "2026-02-04T10:30:45.123Z",
  "environment": "production",
  "requestId": "req-123",
  "userId": "123",
  "tenantId": "789",
  "action": "login",
  "pid": 12345,
  "hostname": "app-server-1"
}
```

### Error Log Format

```json
{
  "level": "error",
  "message": "Database connection failed",
  "timestamp": "2026-02-04T10:30:47.789Z",
  "environment": "production",
  "error": {
    "name": "Error",
    "message": "Connection refused",
    "stack": "Error: Connection refused\n    at ..."
  },
  "database": "postgres",
  "requestId": "req-123"
}
```

## Request ID Propagation

Request IDs are automatically generated and propagated through the request lifecycle:

1. Generate unique ID (nanoid v4, 21 characters)
2. Store in request context
3. Include in all log entries
4. Return in response header `X-Request-ID`

### Example Request Flow

```typescript
// Middleware generates ID
X-Request-ID: AbCdEfGhIjKlMnOpQrStU

// All logs include the ID
{"requestId": "AbCdEfGhIjKlMnOpQrStU", "level": "info", "message": "Processing request"}

// Response header includes the ID
HTTP/1.1 200 OK
X-Request-ID: AbCdEfGhIjKlMnOpQrStU
```

## Log Aggregation

### Recommended Tools

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog Logs**
- **Splunk**
- **Loki** (Grafana)
- **CloudWatch Logs** (AWS)

### Example Logstash Pipeline

```ruby
input {
  tcp {
    port => 5000
    codec => json_lines
  }
}

filter {
  if [environment] == "production" {
    # Add additional metadata
    mutate {
      add_field => {
        "cluster" => "production"
        "service" => "small-squaretable"
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "small-squaretable-%{+YYYY.MM.dd}"
  }
}
```

## Log Retention Policy

### Retention by Environment

| Environment | Retention Period | Hot Storage | Cold Storage |
|-------------|------------------|-------------|--------------|
| Development | 7 days | 7 days | - |
| Staging | 30 days | 7 days | 30 days |
| Production | 1 year | 30 days | 1 year |

### Log Rotation

Configure log rotation to prevent disk space issues:

```bash
# Using logrotate
/var/log/small-squaretable/*.log {
  daily
  rotate 30
  compress
  delaycompress
  notifempty
  create 0640 www-data www-data
  sharedscripts
  postrotate
    # Reload application to start writing to new file
    systemctl reload small-squaretable
  endscript
}
```

## Performance Considerations

### Async Logging

For high-throughput scenarios, consider async logging:

```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino/file',
    options: {
      destination: '/var/log/app.log',
      mkdir: true,
    },
  },
});
```

### Log Sampling

For debug-level logs in production:

```typescript
const shouldLogDebug = Math.random() < 0.01; // Sample 1% of debug logs

if (shouldLogDebug) {
  logger.debug('Detailed debug information', data);
}
```

## Sensitive Data Handling

### Never Log

- Passwords (even hashed)
- API keys
- Auth tokens
- Credit card numbers
- PII (Personally Identifiable Information)

### Sanitize Before Logging

```typescript
function sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };

  // Remove sensitive fields
  const sensitiveFields = ['password', 'apiKey', 'token', 'secret'];
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

logger.info('User login attempt', sanitizeLogData({
  email: user.email,
  password: user.password, // Will be redacted
}));
```

## Troubleshooting

### High Volume of Logs

1. Increase `LOG_LEVEL` to `warn` or `error`
2. Enable log sampling for debug logs
3. Check for infinite loops in logging code
4. Verify log aggregation pipeline capacity

### Missing Context in Logs

1. Ensure request ID middleware is applied
2. Verify logger is using `createLogger()` with context
3. Check that child loggers are used correctly

### Logs Not Appearing in Production

1. Verify `LOG_LEVEL` environment variable
2. Check application log file permissions
3. Verify log aggregation pipeline connectivity
4. Check disk space availability

## Best Practices

1. **Use appropriate log levels** - Don't use `error` for recoverable issues
2. **Include context** - Always include requestId, userId, tenantId when available
3. **Keep messages concise** - Use structured data for details
4. **Avoid sensitive data** - Never log passwords, tokens, or PII
5. **Use structured data** - JSON format is easier to parse and query
6. **Log async operations** - Include correlation IDs for async workflows
7. **Review logs regularly** - Set up alerts for unusual patterns
8. **Test log output** - Verify log format in development before deploying

## Monitoring

### Key Metrics

- **Log Volume**: Total logs per minute/hour/day
- **Error Rate**: Percentage of error-level logs
- **Log Latency**: Time from log generation to aggregation
- **Missing Context**: Percentage of logs without requestId

### Alert Rules

See [Alert Rules](./alerts.md) for detailed alert configurations.

## Related Documentation

- [Alert Rules](./alerts.md)
- [Sentry Integration](./sentry.md)
- [Health Checks](../api/health.md)
- [Request Tracing](./tracing.md)
