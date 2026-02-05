# Phase 6.4 监控与日志实施总结

## 完成时间
2026-02-04

## 实施概览

成功实现了 Small-Squaretable 项目的监控与日志系统，包括 Sentry 错误追踪、结构化日志、请求追踪、健康检查增强和告警规则配置。

---

## 已完成功能

### 1. Sentry 错误追踪集成

#### 后端实现
**文件**: `/var/aichat/Small-Squaretable/src/server/services/sentry.service.ts`

**功能**:
- Sentry 初始化配置
- 环境感知（development/production）
- 异常捕获与上下文
- 用户上下文设置
- Breadcrumbs 调试信息
- 性能事务追踪
- 优雅关闭处理

**主要函数**:
- `initializeSentry()` - 初始化 Sentry
- `captureException(error, context)` - 捕获异常
- `captureMessage(message, level)` - 捕获消息
- `setUserContext(user)` - 设置用户上下文
- `clearUserContext()` - 清除用户上下文
- `addBreadcrumb(message, category, level, data)` - 添加调试信息
- `startTransaction(name, op)` - 开始性能事务
- `closeSentry()` - 关闭 Sentry

**错误处理集成**:
- 在 `/var/aichat/Small-Squaretable/src/server/middleware/error-handler.ts` 中集成
- 自动捕获所有错误并上报
- 添加请求上下文（requestId, userId, tenantId）
- 使用 breadcrumbs 记录请求路径和方法

**配置**:
```bash
SENTRY_DSN=https://xxx@sentry.io/xxx
```

#### 前端实现
**文件**: `/var/aichat/Small-Squaretable/src/client/utils/sentry.ts`

**功能**:
- Vue 3 集成
- Vue Router 路由追踪
- Session Replay (生产环境 5% 采样)
- 用户上下文自动追踪
- 浏览器扩展错误过滤
- 性能监控（P95 响应时间）

**主要函数**:
- `initSentry(app, router)` - 初始化 Sentry
- `captureException(error, context)` - 捕获异常
- `captureMessage(message, level)` - 捕获消息
- `addBreadcrumb(message, category, level, data)` - 添加调试信息
- `setUser(user)` - 设置用户
- `clearUser()` - 清除用户
- `startTransaction(name, op)` - 开始性能事务
- `captureFeedback(message, email, name)` - 捕获用户反馈
- `setContext(key, context)` - 设置全局上下文

**集成**:
- 在 `/var/aichat/Small-Squaretable/src/client/main.ts` 中初始化
- 环境变量通过 Vite 暴露
- 自动追踪用户认证状态变化

**配置**:
```bash
# .env
SENTRY_DSN=https://xxx@sentry.io/xxx

# vite.config.ts
define: {
  'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || ''),
}
```

---

### 2. 结构化日志系统

**文件**: `/var/aichat/Small-Squaretable/src/server/services/logger.service.ts`

**功能**:
- JSON 格式日志输出（生产环境）
- 彩色 pretty-print（开发环境）
- 四个日志级别（debug, info, warn, error）
- 可配置的最小日志级别
- 上下文感知（requestId, userId, tenantId）
- 子日志器支持（child logger）
- 进程 ID 和主机名
- 环境标签

**日志级别优先级**:
```
debug (10) < info (20) < warn (30) < error (40)
```

**日志格式示例**:

开发环境:
```
[INFO] 2026-02-04T10:30:45.123Z - User logged in {"userId":"123","tenantId":"789"}
```

生产环境:
```json
{
  "level": "info",
  "message": "User logged in",
  "timestamp": "2026-02-04T10:30:45.123Z",
  "environment": "production",
  "requestId": "req-123",
  "userId": "123",
  "tenantId": "789",
  "pid": 12345,
  "hostname": "app-server-1"
}
```

**专用日志函数**:
- `logRequest(context)` - HTTP 请求日志
- `logDatabaseQuery(context)` - 数据库查询日志
- `logCacheOperation(context)` - 缓存操作日志
- `logSecurityEvent(context)` - 安全事件日志

**配置**:
```bash
LOG_LEVEL=info  # debug, info, warn, error
```

---

### 3. 请求追踪

**文件**: `/var/aichat/Small-Squaretable/src/server/middleware/request-id.ts`

**功能**:
- 生成唯一请求 ID（nanoid v4，21 字符）
- 从请求头提取或生成新的 ID
- 在所有日志中包含请求 ID
- 响应头返回请求 ID
- 为每个请求创建专用日志器
- 支持分布式追踪

**请求 ID 流程**:
```
客户端请求
  ↓
中间件生成/提取 X-Request-ID
  ↓
存储在上下文中 (c.set('requestId'))
  ↓
创建专用日志器 (c.set('logger'))
  ↓
所有日志自动包含 requestId
  ↓
响应头返回 X-Request-ID
  ↓
客户端可以关联请求和响应
```

**使用示例**:
```typescript
// 自动应用
app.use('*', requestIdMiddleware());

// 在路由中使用
app.get('/api/v1/characters', async (c) => {
  const logger = c.get('logger');
  logger.info('Fetching characters', { userId: c.get('userId') });
});
```

---

### 4. 健康检查增强

**文件**: `/var/aichat/Small-Squaretable/src/server/services/health.ts`

**增强内容**:
- 添加服务器启动时间（uptime）
- 添加环境信息（environment）
- 添加主机名（hostname）
- 添加 Node.js 版本和平台信息
- 添加内存使用指标
- 数据库连接池详情
- Redis 内存使用信息

**健康检查端点**:

1. `/health` - 基本健康检查
   - 始终返回状态（如果服务正在运行）
   - 包含系统指标

2. `/health/live` - 存活检查（Kubernetes liveness）
   - 检查内存使用（< 90%）
   - 用于确定 Pod 是否需要重启

3. `/health/ready` - 就绪检查（Kubernetes readiness）
   - 验证数据库连接
   - 验证 Redis 连接
   - 返回依赖状态和延迟
   - 用于确定 Pod 是否可以接收流量

**健康状态响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T10:30:45.123Z",
  "uptime": 3600000,
  "version": "0.1.0",
  "environment": "production",
  "hostname": "app-server-1",
  "checks": {
    "database": {
      "status": "ok",
      "latency": 12,
      "details": {
        "pool": {
          "min": 2,
          "max": 10
        }
      }
    },
    "redis": {
      "status": "ok",
      "latency": 2,
      "details": {
        "connected": true,
        "memory_usage": "256M"
      }
    }
  },
  "system": {
    "node_version": "v20.0.0",
    "platform": "linux",
    "arch": "x64",
    "memory": {
      "rss": "256.45 MB",
      "heap_total": "512.00 MB",
      "heap_used": "128.23 MB",
      "heap_usage_percent": 25.05
    }
  }
}
```

---

### 5. 告警规则配置

**文件**: `/var/aichat/Small-Squaretable/docs/monitoring/alerts.md`

**定义的告警规则**:

| 告警名称 | 严重级别 | 条件 | 响应时间 |
|---------|---------|------|---------|
| 健康检查失败 | P0 | status != "ok" for 2 min | 5-15 min |
| 高错误率 | P1 | error_rate > 1% for 5 min | < 1 hour |
| 慢 API 响应 | P2 | P95 > 500ms for 10 min | < 4 hours |
| 数据库连接失败 | P0 | database status != "ok" | 5-15 min |
| Redis 连接失败 | P1 | redis status != "ok" | < 1 hour |
| 高内存使用 | P1 | memory > 80% for 10 min | < 1 hour |
| 高 CPU 使用 | P2 | CPU > 70% for 10 min | < 4 hours |
| 磁盘空间不足 | P0 | available < 10% | 5-15 min |
| 高失败认证率 | P2 | auth_failures > 10% | < 4 hours |

**告警通道**:
- P0 Critical: PagerDuty + Slack
- P1 High: Slack + Email
- P2 Medium: Slack
- P3 Low: Email (business hours)

**文档内容**:
- 16 个详细的告警规则
- Prometheus 查询示例
- Grafana 仪表板变量
- 运维手册（runbooks）
- 告警升级流程
- 维护窗口配置

---

## 创建的文件列表

### 服务文件
1. `/var/aichat/Small-Squaretable/src/server/services/sentry.service.ts` - Sentry 后端服务
2. `/var/aichat/Small-Squaretable/src/server/services/logger.service.ts` - 结构化日志服务

### 中间件文件
3. `/var/aichat/Small-Squaretable/src/server/middleware/request-id.ts` - 请求 ID 中间件

### 客户端工具
4. `/var/aichat/Small-Squaretable/src/client/utils/sentry.ts` - Sentry 前端配置

### 文档文件
5. `/var/aichat/Small-Squaretable/docs/monitoring/alerts.md` - 告警规则文档
6. `/var/aichat/Small-Squaretable/docs/monitoring/logging.md` - 日志配置文档

### 修改的文件
7. `/var/aichat/Small-Squaretable/src/server/index.ts` - 集成 Sentry 和请求 ID 中间件
8. `/var/aichat/Small-Squaretable/src/server/middleware/error-handler.ts` - 集成 Sentry 错误上报
9. `/var/aichat/Small-Squaretable/src/server/services/health.ts` - 增强健康检查
10. `/var/aichat/Small-Squaretable/src/client/main.ts` - 初始化前端 Sentry
11. `/var/aichat/Small-Squaretable/vite.config.ts` - 配置 Sentry 环境变量
12. `/var/aichat/Small-Squaretable/.env.example` - 添加监控配置变量

---

## 配置示例

### 后端环境变量 (.env)
```bash
# Sentry 错误追踪
SENTRY_DSN=https://xxx@sentry.io/xxx

# 日志配置
LOG_LEVEL=info  # debug, info, warn, error

# 运行环境
NODE_ENV=production
```

### 前端环境变量 (.env)
```bash
# Sentry 错误追踪（通过 Vite 暴露）
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Vite 配置 (vite.config.ts)
```typescript
define: {
  'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || ''),
},
```

---

## 集成点

### 服务器启动流程
```
1. 初始化 Sentry (initializeSentry)
2. 记录日志配置 (getLogConfig)
3. 应用安全头
4. 应用请求 ID 中间件 (requestIdMiddleware)
5. 应用日志中间件
6. 应用其他中间件（CORS, 限流等）
7. 注册路由
8. 设置错误处理器（集成 Sentry）
9. 启动服务器
```

### 请求处理流程
```
1. 接收请求
2. 生成/提取请求 ID
3. 创建专用日志器（包含 requestId）
4. 通过其他中间件（认证、限流等）
5. 处理请求
6. 记录请求日志（包含 requestId, userId, tenantId）
7. 返回响应（包含 X-Request-ID 头）
```

### 错误处理流程
```
1. 捕获错误
2. 添加 breadcrumb（记录请求上下文）
3. 捕获到 Sentry（包含完整上下文）
4. 记录到日志系统
5. 返回标准化的错误响应（包含 requestId）
```

---

## 验证清单

- [x] Sentry 后端服务创建完成
- [x] Sentry 前端配置创建完成
- [x] 结构化日志服务创建完成
- [x] 请求 ID 中间件创建完成
- [x] 错误处理器集成 Sentry
- [x] 健康检查端点增强
- [x] 告警规则文档创建完成
- [x] 日志配置文档创建完成
- [x] 环境变量配置示例添加
- [x] Vite 配置更新
- [x] 服务器入口集成监控组件
- [x] 优雅关闭处理（Sentry flush）

---

## 使用示例

### 后端使用示例

```typescript
import { logger } from '@/server/services/logger.service';
import { captureException, addBreadcrumb } from '@/server/services/sentry.service';

// 记录信息日志
logger.info('Processing request', { action: 'create_character' });

// 记录错误
logger.error('Database connection failed', error, { db: 'postgres' });

// 添加调试信息
addBreadcrumb('User action', 'user', 'info', { action: 'create_character' });

// 捕获异常
try {
  await someOperation();
} catch (error) {
  captureException(error, { userId: '123', tenantId: '456' });
}
```

### 前端使用示例

```typescript
import { captureException, addBreadcrumb } from '@/client/utils/sentry';

// 添加调试信息
addBreadcrumb('User clicked button', 'ui', 'info', { button: 'submit' });

// 捕获异常
try {
  await fetchUserData();
} catch (error) {
  captureException(error, { userId: userStore.user?.id });
}
```

---

## 性能考虑

### 采样率配置
- **Development**: 100% 采样率
- **Production**:
  - Error tracking: 100%
  - Performance traces: 10%
  - Session Replay: 5%
  - Profiling: 10%

### 日志级别建议
- **Development**: `debug`
- **Staging**: `info`
- **Production**: `warn` 或 `error`

### 保留策略
- **Development**: 7 天
- **Staging**: 30 天
- **Production**: 1 年

---

## 安全考虑

### 敏感数据处理
- 永不记录密码、API 密钥、认证令牌
- 记录前进行数据脱敏
- 使用专用函数 `sanitizeLogData()`

### 浏览器扩展错误过滤
- 前端 Sentry 自动过滤来自浏览器扩展的错误
- 防止误报

### Session Replay 隐私
- 默认掩盖所有文本内容
- 阻止所有媒体内容

---

## 后续建议

### 1. 集成 OpenTelemetry
- 实现分布式追踪
- 跨服务请求追踪
- 性能分析增强

### 2. Prometheus 指标暴露
- 添加 `/metrics` 端点
- 暴露自定义业务指标
- 集成 Grafana 仪表板

### 3. 日志聚合
- 设置 ELK Stack 或 Datadog
- 实现日志搜索和分析
- 设置日志告警

### 4. 监控仪表板
- 创建 Grafana 仪表板
- 实时可视化系统状态
- 业务指标追踪

### 5. 测试覆盖
- 为日志服务添加单元测试
- 为 Sentry 集成添加测试
- 测试告警规则

---

## 相关文档

- [告警规则](./alerts.md)
- [日志配置](./logging.md)
- [健康检查端点](../api/health.md)
- [部署清单](../DEPLOYMENT_CHECKLIST.md)

---

## 联系信息

- 监控团队: monitoring@small-squaretable.com
- 告警通道: Slack #alerts
- 紧急热线: +1-XXX-XXX-XXXX

---

**文档版本**: 1.0
**最后更新**: 2026-02-04
**维护者**: Monitoring Team
