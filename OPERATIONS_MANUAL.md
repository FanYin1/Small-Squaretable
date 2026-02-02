# Small Squaretable 操作手册

> SillyTavern SaaS 平台运维指南
>
> **版本**: 1.0.0
> **更新日期**: 2026-02-01

---

## 📋 目录

1. [快速开始](#快速开始)
2. [环境配置](#环境配置)
3. [本地开发](#本地开发)
4. [测试指南](#测试指南)
5. [部署指南](#部署指南)
6. [监控与维护](#监控与维护)
7. [故障排查](#故障排查)
8. [常见问题](#常见问题)

---

## 快速开始

### 系统要求

- **Node.js**: >= 20.0.0
- **PostgreSQL**: >= 15
- **Redis**: >= 7
- **Docker**: >= 20.10 (可选)
- **Kubernetes**: >= 1.24 (生产环境)

### 5 分钟快速启动

```bash
# 1. 克隆项目
cd /var/aichat/Small-Squaretable

# 2. 安装依赖
pnpm install

# 3. 启动数据库和缓存（Docker）
docker-compose up -d postgres redis

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置必需的环境变量

# 5. 运行数据库迁移
pnpm db:migrate

# 6. 启动开发服务器
pnpm dev
```

访问 http://localhost:3000 查看应用。

---

## 环境配置

### 必需的环境变量

创建 `.env` 文件并配置以下变量：

#### 数据库配置
```env
# PostgreSQL 连接字符串
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sillytavern_saas

# Redis 连接字符串
REDIS_URL=redis://localhost:6379
```

#### 认证配置
```env
# JWT 签名密钥（生产环境必须使用强密钥）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

#### Stripe 配置（订阅系统）
```env
# Stripe API 密钥（从 https://dashboard.stripe.com/apikeys 获取）
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe 价格 ID（从 Stripe Dashboard 创建产品后获取）
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
```

#### LLM 提供商配置（可选）
```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1

# 自定义 LLM 提供商
CUSTOM_LLM_API_KEY=your-api-key
CUSTOM_LLM_BASE_URL=https://your-llm-provider.com/v1
CUSTOM_LLM_MODELS=model1,model2,model3
CUSTOM_LLM_DEFAULT_MODEL=model1
```

#### 应用配置
```env
# 服务器端口
PORT=3000

# 应用 URL（生产环境）
APP_URL=https://your-domain.com

# 日志级别
LOG_LEVEL=info
```

### 环境变量验证

运行验证脚本检查配置：

```bash
./scripts/validate-env.sh
```

---

## 本地开发

### 开发服务器

```bash
# 启动开发服务器（热重载）
pnpm dev

# 仅启动后端
pnpm dev:server

# 仅启动前端
pnpm dev:client
```

### 数据库操作

```bash
# 生成新的数据库迁移
pnpm db:generate

# 运行数据库迁移
pnpm db:migrate

# 直接推送 schema 到数据库（开发环境）
pnpm db:push

# 打开数据库管理界面
pnpm db:studio
```

### 代码质量检查

```bash
# ESLint 检查
pnpm lint

# 自动修复 lint 问题
pnpm lint:fix

# TypeScript 类型检查
pnpm type-check

# 代码格式化
pnpm prettier
```

### 构建

```bash
# 构建生产版本
pnpm build

# 构建前端
pnpm build:client

# 启动生产服务器
pnpm start
```

---

## 测试指南

### 单元测试和集成测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test src/server/services/llm.service.spec.ts

# 运行测试覆盖率
pnpm test:coverage

# 监听模式（开发时使用）
pnpm test --watch
```

### E2E 测试

```bash
# 安装 Playwright 浏览器（首次运行）
npx playwright install chromium

# 运行所有 E2E 测试
pnpm test:e2e

# 运行特定测试文件
npx playwright test e2e/auth.spec.ts

# 交互式 UI 模式
pnpm test:e2e:ui

# 调试模式
pnpm test:e2e:debug

# 查看测试报告
pnpm test:e2e:report
```

### 测试最佳实践

1. **运行测试前确保数据库和 Redis 正在运行**
2. **E2E 测试需要应用服务器运行**
3. **使用 `--run` 标志在 CI 环境中运行测试**
4. **定期运行测试覆盖率检查**

---

## 部署指南

### Docker Compose 部署（开发/测试环境）

#### 1. 准备环境

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，配置所有必需的环境变量
nano .env
```

#### 2. 启动服务

```bash
# 启动所有服务（应用、PostgreSQL、Redis）
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 查看服务状态
docker-compose ps
```

#### 3. 运行数据库迁移

```bash
# 在应用容器中运行迁移
docker-compose exec app pnpm db:migrate
```

#### 4. 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v
```

### Kubernetes 部署（生产环境）

#### 1. 准备配置

```bash
# 复制 secrets 模板
cp k8s/secrets.yaml k8s/secrets-production.yaml

# 编辑 secrets-production.yaml，填入实际的密钥
nano k8s/secrets-production.yaml
```

**重要**: 使用 base64 编码所有密钥值：

```bash
echo -n "your-secret-value" | base64
```

#### 2. 更新配置

编辑以下文件以匹配生产环境：

- `k8s/app-deployment.yaml` - 更新 Docker 镜像地址
- `k8s/ingress.yaml` - 更新域名和 TLS 配置
- `k8s/configmap.yaml` - 更新应用配置

#### 3. 构建 Docker 镜像

```bash
# 构建镜像
docker build -t your-registry/small-squaretable:latest .

# 推送到镜像仓库
docker push your-registry/small-squaretable:latest
```

#### 4. 部署到 Kubernetes

```bash
# 使用一键部署脚本
./scripts/deploy-k8s.sh

# 或手动部署
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets-production.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/app-deployment.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

#### 5. 运行数据库迁移

```bash
# 运行迁移 Job
kubectl apply -f k8s/db-migration-job.yaml

# 查看迁移日志
kubectl logs -f job/db-migration -n small-squaretable
```

#### 6. 验证部署

```bash
# 查看 Pod 状态
kubectl get pods -n small-squaretable

# 查看服务状态
kubectl get svc -n small-squaretable

# 查看 Ingress
kubectl get ingress -n small-squaretable

# 查看应用日志
kubectl logs -f deployment/app -n small-squaretable
```

### 健康检查

应用提供三个健康检查端点：

```bash
# 基础健康检查
curl http://localhost:3000/health

# Kubernetes liveness probe
curl http://localhost:3000/health/live

# Kubernetes readiness probe（检查数据库和 Redis）
curl http://localhost:3000/health/ready
```

---

## 监控与维护

### 日志管理

#### 查看应用日志

```bash
# Docker Compose
docker-compose logs -f app

# Kubernetes
kubectl logs -f deployment/app -n small-squaretable

# 查看最近 100 行日志
kubectl logs --tail=100 deployment/app -n small-squaretable
```

#### 日志级别

在 `.env` 中配置：

```env
LOG_LEVEL=debug  # debug, info, warn, error
```

### 性能监控

#### 关键指标

1. **API 响应时间**
   - 目标: P95 < 500ms
   - 监控端点: `/api/v1/*`

2. **WebSocket 连接数**
   - 监控活跃连接数
   - 检查连接稳定性

3. **数据库性能**
   - 查询响应时间
   - 连接池使用率

4. **Redis 性能**
   - 缓存命中率
   - 内存使用率

5. **资源使用**
   - CPU 使用率 < 70%
   - 内存使用率 < 80%

#### 监控命令

```bash
# Kubernetes 资源使用
kubectl top pods -n small-squaretable
kubectl top nodes

# 查看 HPA 状态
kubectl get hpa -n small-squaretable

# 查看事件
kubectl get events -n small-squaretable --sort-by='.lastTimestamp'
```

### 数据库维护

#### 备份

```bash
# PostgreSQL 备份
docker-compose exec postgres pg_dump -U postgres sillytavern_saas > backup.sql

# Kubernetes 备份
kubectl exec -n small-squaretable postgres-0 -- pg_dump -U postgres sillytavern_saas > backup.sql
```

#### 恢复

```bash
# PostgreSQL 恢复
docker-compose exec -T postgres psql -U postgres sillytavern_saas < backup.sql

# Kubernetes 恢复
kubectl exec -i -n small-squaretable postgres-0 -- psql -U postgres sillytavern_saas < backup.sql
```

#### 数据库优化

```bash
# 连接到数据库
docker-compose exec postgres psql -U postgres sillytavern_saas

# 运行 VACUUM
VACUUM ANALYZE;

# 查看表大小
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Redis 维护

```bash
# 连接到 Redis
docker-compose exec redis redis-cli

# 查看内存使用
INFO memory

# 查看键数量
DBSIZE

# 清空缓存（谨慎使用）
FLUSHDB
```

### 扩容操作

#### 水平扩容（Kubernetes）

```bash
# 手动扩容应用 Pod
kubectl scale deployment/app --replicas=5 -n small-squaretable

# HPA 会自动扩缩容（3-10 副本）
# 基于 CPU 70% 和内存 80% 阈值
```

#### 垂直扩容

编辑 `k8s/app-deployment.yaml`：

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

应用更改：

```bash
kubectl apply -f k8s/app-deployment.yaml
```

---

## 故障排查

### 常见问题诊断

#### 1. 应用无法启动

**症状**: 应用启动失败或立即退出

**检查步骤**:

```bash
# 查看日志
docker-compose logs app
kubectl logs deployment/app -n small-squaretable

# 检查环境变量
docker-compose exec app env | grep DATABASE_URL

# 验证数据库连接
docker-compose exec app pnpm db:studio
```

**常见原因**:
- 数据库连接失败
- 环境变量缺失
- 端口被占用

#### 2. 数据库连接错误

**症状**: `ECONNREFUSED` 或 `Connection timeout`

**解决方案**:

```bash
# 检查数据库是否运行
docker-compose ps postgres
kubectl get pods -n small-squaretable | grep postgres

# 测试数据库连接
docker-compose exec postgres psql -U postgres -c "SELECT 1"

# 检查 DATABASE_URL 格式
echo $DATABASE_URL
```

#### 3. Redis 连接错误

**症状**: 缓存功能失效

**解决方案**:

```bash
# 检查 Redis 是否运行
docker-compose ps redis
kubectl get pods -n small-squaretable | grep redis

# 测试 Redis 连接
docker-compose exec redis redis-cli ping

# 检查 REDIS_URL
echo $REDIS_URL
```

#### 4. WebSocket 连接失败

**症状**: 实时聊天不工作

**检查步骤**:

```bash
# 查看 WebSocket 日志
kubectl logs deployment/app -n small-squaretable | grep WebSocket

# 检查 Ingress 配置（确保支持 WebSocket）
kubectl describe ingress -n small-squaretable
```

**解决方案**:
- 确保 Ingress 支持 WebSocket 升级
- 检查防火墙规则
- 验证 JWT token 有效性

#### 5. Stripe Webhook 失败

**症状**: 订阅状态不更新

**检查步骤**:

```bash
# 查看 webhook 日志
kubectl logs deployment/app -n small-squaretable | grep webhook

# 验证 webhook 签名密钥
echo $STRIPE_WEBHOOK_SECRET
```

**解决方案**:
- 在 Stripe Dashboard 中验证 webhook 配置
- 确保 webhook URL 可公开访问
- 检查 `STRIPE_WEBHOOK_SECRET` 是否正确

#### 6. 测试失败

**症状**: 测试运行失败

**解决方案**:

```bash
# 确保数据库和 Redis 运行
docker-compose up -d postgres redis

# 清理测试缓存
pnpm test --clearCache

# 运行特定测试
pnpm test src/server/services/llm.service.spec.ts --run
```

### 性能问题

#### 慢查询诊断

```sql
-- 启用慢查询日志
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

#### 内存泄漏检查

```bash
# 监控内存使用
kubectl top pods -n small-squaretable --watch

# 查看 Node.js 堆内存
docker-compose exec app node --expose-gc -e "console.log(process.memoryUsage())"
```

### 紧急恢复

#### 回滚部署

```bash
# Kubernetes 回滚到上一个版本
kubectl rollout undo deployment/app -n small-squaretable

# 查看回滚状态
kubectl rollout status deployment/app -n small-squaretable

# 查看部署历史
kubectl rollout history deployment/app -n small-squaretable
```

#### 数据库恢复

```bash
# 从备份恢复
kubectl exec -i -n small-squaretable postgres-0 -- psql -U postgres sillytavern_saas < backup.sql

# 运行迁移到最新版本
kubectl apply -f k8s/db-migration-job.yaml
```

---

## 常见问题

### Q1: 如何重置管理员密码？

```bash
# 连接到数据库
docker-compose exec postgres psql -U postgres sillytavern_saas

# 更新密码（使用 bcrypt 哈希）
UPDATE users SET password_hash = '$2b$10$...' WHERE email = 'admin@example.com';
```

### Q2: 如何清理旧数据？

```sql
-- 删除 30 天前的消息
DELETE FROM messages WHERE sent_at < NOW() - INTERVAL '30 days';

-- 删除未激活的用户（7 天）
DELETE FROM users WHERE created_at < NOW() - INTERVAL '7 days' AND email_verified = false;

-- 清理 Redis 缓存
docker-compose exec redis redis-cli FLUSHDB
```

### Q3: 如何添加新的 LLM 提供商？

编辑 `src/server/config/llm.config.ts`：

```typescript
export const llmProviders = [
  // 添加新提供商
  {
    name: 'new-provider',
    baseURL: process.env.NEW_PROVIDER_BASE_URL,
    apiKey: process.env.NEW_PROVIDER_API_KEY,
    models: ['model-1', 'model-2'],
  },
];
```

### Q4: 如何修改订阅计划限制？

编辑 `src/server/services/feature.service.ts`：

```typescript
const PLAN_LIMITS = {
  free: {
    messages: 100,
    llm_tokens: 50000,
    images: 10,
    api_calls: 0,
  },
  // 修改限制
};
```

### Q5: 如何启用调试模式？

```env
# .env
LOG_LEVEL=debug
NODE_ENV=development
```

### Q6: 如何配置 HTTPS？

#### 使用 Let's Encrypt（Kubernetes）

编辑 `k8s/ingress.yaml`：

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: tls-secret
```

安装 cert-manager：

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

### Q7: 如何监控 Stripe 支付？

访问 Stripe Dashboard:
- 测试环境: https://dashboard.stripe.com/test/payments
- 生产环境: https://dashboard.stripe.com/payments

查看应用日志：

```bash
kubectl logs deployment/app -n small-squaretable | grep stripe
```

### Q8: 如何导出用户数据？

```sql
-- 导出用户数据
COPY (SELECT * FROM users) TO '/tmp/users.csv' WITH CSV HEADER;

-- 导出聊天数据
COPY (SELECT * FROM chats WHERE user_id = 'user-id') TO '/tmp/chats.csv' WITH CSV HEADER;
```

---

## 安全最佳实践

### 1. 环境变量管理

- ✅ 使用强随机密钥（JWT_SECRET）
- ✅ 不要将 `.env` 文件提交到 Git
- ✅ 使用 Kubernetes Secrets 存储敏感信息
- ✅ 定期轮换密钥

### 2. 数据库安全

- ✅ 使用强密码
- ✅ 限制数据库访问（仅应用可访问）
- ✅ 定期备份
- ✅ 启用 SSL 连接（生产环境）

### 3. API 安全

- ✅ 所有端点都需要认证
- ✅ 实施速率限制
- ✅ 验证所有输入
- ✅ 使用 HTTPS（生产环境）

### 4. 容器安全

- ✅ 使用非 root 用户运行
- ✅ 定期更新基础镜像
- ✅ 扫描镜像漏洞
- ✅ 限制容器权限

---

## 联系支持

### 文档资源

- **架构文档**: `docs/architecture/infrastructure.md`
- **部署指南**: `docs/deployment/deployment-guide.md`
- **测试文档**: `TEST_COVERAGE_REPORT.md`
- **E2E 测试**: `e2e/README.md`

### 获取帮助

- **GitHub Issues**: 报告 bug 和功能请求
- **文档**: 查看项目文档目录
- **日志**: 检查应用日志获取详细错误信息

---

**版本**: 1.0.0
**最后更新**: 2026-02-01
**维护者**: Small Squaretable Team
