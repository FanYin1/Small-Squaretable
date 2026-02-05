# Small Squaretable

> SillyTavern SaaS 转换项目 - 企业级多租户平台 🚀

## 项目概述

将 SillyTavern (单用户 LLM 前端) 转换为企业级多租户 SaaS 平台，支持订阅计费、角色市场、实时聊天等功能。

**当前阶段**: Phase 7 已完成 - 生产就绪
**整体完成度**: 100%
**版本**: 0.1.0
**最后更新**: 2026-02-05

## 🎯 项目状态

```
Phase 1: 基础设施层        ████████████████████ 100% ✅
Phase 2: 核心 API          ████████████████████ 100% ✅
Phase 3: 订阅与计费        ████████████████████ 100% ✅
Phase 4: 前端基础          ████████████████████ 100% ✅
Phase 5: 前端页面开发      ████████████████████ 100% ✅
Phase 6: 测试与优化        ████████████████████ 100% ✅
Phase 7: 生产部署          ████████████████████ 100% ✅
```

## ✨ 功能特性

### 核心功能
- 🏢 **多租户架构** - 完整的租户隔离和数据安全
- 💳 **订阅系统** - 基于 Stripe 的三层订阅计划 (Free/Pro/Team)
- 🔐 **认证系统** - JWT 双 Token 机制 + CSRF 防护
- 💬 **实时聊天** - WebSocket + LLM 流式响应
- 👥 **角色市场** - 社区分享、五维度评分系统
- 🔍 **全文搜索** - PostgreSQL tsvector 全文搜索
- 📦 **SillyTavern V2** - 支持 V2 格式角色卡导入

### 技术特性
- 🗄️ **数据库**: PostgreSQL + Drizzle ORM
- ⚡ **缓存**: Redis 高性能缓存
- 🔒 **安全**: CSRF、CSP、速率限制、输入验证
- 📊 **监控**: Sentry 错误追踪、结构化日志
- 🧪 **测试**: 99% 单元测试通过率
- 🐳 **部署**: Docker + Kubernetes + CI/CD

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + TypeScript + Element Plus |
| 后端 | Hono.js + Node.js |
| 数据库 | PostgreSQL + Drizzle ORM |
| 缓存 | Redis |
| 认证 | JWT (Access + Refresh Token) |
| 支付 | Stripe |
| 测试 | Vitest + Playwright |

## 快速开始

### 环境要求
- Node.js >= 20.0.0
- PostgreSQL >= 15
- Redis >= 7

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/FanYin1/Small-Squaretable.git
cd Small-Squaretable

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动数据库和 Redis (Docker)
docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sillytavern_saas -p 5432:5432 postgres:15
docker run -d --name redis -p 6379:6379 redis:7

# 运行数据库迁移
npm run db:migrate

# 启动后端服务器
npm run dev

# 启动前端服务器（新终端）
npm run dev:client
```

### 访问应用
- 前端: http://localhost:5173
- 后端 API: http://localhost:3000/api/v1
- 健康检查: http://localhost:3000/health

## 常用命令

```bash
npm run dev              # 启动后端 (端口 3000)
npm run dev:client       # 启动前端 (端口 5173)
npm run build            # 生产构建
npm run test             # 运行单元测试
npx playwright test      # 运行 E2E 测试
npm run db:studio        # 打开数据库管理界面
npm run lint             # 代码检查
```

## 项目结构

```
Small-Squaretable/
├── src/
│   ├── client/          # Vue 3 前端
│   │   ├── components/  # UI 组件
│   │   ├── pages/       # 页面组件
│   │   ├── stores/      # Pinia 状态
│   │   └── services/    # API 服务
│   ├── server/          # Hono.js 后端
│   │   ├── routes/      # API 路由
│   │   ├── services/    # 业务逻辑
│   │   └── middleware/  # 中间件
│   ├── db/              # 数据库
│   │   ├── schema/      # Drizzle Schema
│   │   └── migrations/  # 迁移文件
│   └── types/           # TypeScript 类型
├── e2e/                 # Playwright E2E 测试
├── k8s/                 # Kubernetes 配置
├── docs/                # 文档
└── scripts/             # 工具脚本
```

## 📚 文档

| 文档 | 说明 |
|------|------|
| [ROADMAP.md](ROADMAP.md) | 开发路线图 |
| [USER_GUIDE.md](USER_GUIDE.md) | 用户使用指南 |
| [API_USAGE_GUIDE.md](API_USAGE_GUIDE.md) | API 接口文档 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) | 运维手册 |
| [docs/deployment/](docs/deployment/) | 部署文档 |
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | OpenAPI 规范 |

## 生产部署

### Docker 部署

```bash
# 构建镜像
./scripts/docker-build.sh -e prod --scan

# 运行容器
docker-compose up -d
```

### Kubernetes 部署

```bash
# 部署到 K8s
./scripts/deploy-k8s.sh -k -e production

# 查看状态
kubectl get pods -n small-squaretable
```

详细部署说明请参考 [部署指南](docs/deployment/deployment-guide.md)。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！请先阅读 [贡献指南](CONTRIBUTING.md)。
