# Small Squaretable - 快速开始指南

> 5 分钟快速启动指南
>
> **更新日期**: 2026-02-01

---

## 🚀 快速启动（本地开发）

### 前置要求

确保已安装：
- Node.js >= 20.0.0
- Docker Desktop（用于数据库和 Redis）
- pnpm（推荐）或 npm

### 步骤 1: 克隆项目

```bash
cd /var/aichat/Small-Squaretable
```

### 步骤 2: 安装依赖

```bash
pnpm install
```

### 步骤 3: 启动数据库和 Redis

```bash
docker-compose up -d postgres redis
```

验证服务运行：
```bash
docker-compose ps
```

### 步骤 4: 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，最小配置：

```env
# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sillytavern_saas

# Redis
REDIS_URL=redis://localhost:6379

# JWT 密钥（开发环境）
JWT_SECRET=dev-secret-key-change-in-production

# 可选：LLM 提供商（如果需要测试聊天功能）
OPENAI_API_KEY=sk-...
```

### 步骤 5: 运行数据库迁移

```bash
pnpm db:migrate
```

### 步骤 6: 启动开发服务器

```bash
pnpm dev
```

### 步骤 7: 访问应用

打开浏览器访问：
- **前端**: http://localhost:3000
- **API**: http://localhost:3000/api/v1
- **健康检查**: http://localhost:3000/health

---

## 🧪 运行测试

### 单元测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test src/server/services/llm.service.spec.ts
```

### E2E 测试

```bash
# 安装 Playwright（首次）
npx playwright install chromium

# 运行 E2E 测试
pnpm test:e2e
```

---

## 🐳 Docker 快速启动

### 使用 Docker Compose

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 2. 启动所有服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f app

# 4. 访问应用
# http://localhost:3000
```

---

## 📚 下一步

### 开发者
- 阅读 [操作手册](OPERATIONS_MANUAL.md)
- 查看 [架构文档](docs/architecture/infrastructure.md)
- 了解 [测试指南](TEST_SUITE_SUMMARY.md)

### 用户
- 阅读 [用户指南](USER_GUIDE.md)
- 了解 [订阅计划](USER_GUIDE.md#订阅计划)
- 查看 [常见问题](USER_GUIDE.md#常见问题)

### 运维
- 阅读 [部署指南](docs/deployment/deployment-guide.md)
- 查看 [Kubernetes 配置](k8s/README.md)
- 了解 [监控维护](OPERATIONS_MANUAL.md#监控与维护)

---

## 🆘 遇到问题？

### 常见问题

**数据库连接失败**:
```bash
# 检查 PostgreSQL 是否运行
docker-compose ps postgres

# 重启数据库
docker-compose restart postgres
```

**Redis 连接失败**:
```bash
# 检查 Redis 是否运行
docker-compose ps redis

# 测试连接
docker-compose exec redis redis-cli ping
```

**端口被占用**:
```bash
# 查看端口占用
lsof -i :3000

# 修改端口（在 .env 中）
PORT=3001
```

### 获取帮助

- 查看 [操作手册](OPERATIONS_MANUAL.md#故障排查)
- 查看 [文档索引](DOCUMENTATION_INDEX.md)
- 提交 GitHub Issue

---

## ✅ 验证安装

运行以下命令验证安装：

```bash
# 1. 检查健康状态
curl http://localhost:3000/health

# 2. 检查 API
curl http://localhost:3000/api/v1/health

# 3. 运行测试
pnpm test --run

# 4. 检查类型
pnpm type-check

# 5. 检查 Lint
pnpm lint
```

全部通过表示安装成功！🎉

---

**版本**: 1.0.0
**最后更新**: 2026-02-01
