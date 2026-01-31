# Small Squaretable

> SillyTavern SaaS Transformation Project

## 项目概述

将 SillyTavern (单用户 LLM 前端) 转换为多租户 SaaS 应用。

**项目代号**: Small Squaretable
**设计文档**: [2026-01-29-sillytavern-saas-transformation.md](../docs/plans/2026-01-29-sillytavern-saas-transformation.md)

## 技术栈

- **后端**: Hono (Node.js)
- **数据库**: PostgreSQL + Drizzle ORM
- **缓存**: Redis
- **语言**: TypeScript
- **测试**: Vitest

## 项目结构

```
src/
├── core/           # 核心业务逻辑
├── server/         # HTTP 服务器
│   ├── routes/     # API 路由
│   └── middleware/ # 中间件
├── db/             # 数据库
│   ├── schema/     # 数据库模式
│   └── migrations/ # 迁移文件
├── types/          # TypeScript 类型定义
├── adapters/       # 适配器（文件系统、数据库）
├── services/       # 业务服务
└── utils/          # 工具函数
```

## 开发指南

### 环境要求

- Node.js >= 20.0.0
- PostgreSQL >= 15
- Redis >= 7

### 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env

# 生成数据库迁移
pnpm db:generate

# 运行迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

### 开发命令

```bash
pnpm dev              # 开发模式
pnpm build            # 构建生产版本
pnpm start            # 启动生产服务器
pnpm test             # 运行测试
pnpm test:coverage    # 测试覆盖率
pnpm lint             # 代码检查
pnpm type-check       # 类型检查
pnpm db:studio        # 打开数据库管理界面
```

## 数据库设置

### 本地开发

1. 启动 PostgreSQL:
```bash
docker run -d \
  --name sillytavern-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sillytavern_saas \
  -p 5432:5432 \
  postgres:15
```

2. 启动 Redis:
```bash
docker run -d \
  --name sillytavern-redis \
  -p 6379:6379 \
  redis:7
```

3. 运行数据库迁移:
```bash
pnpm db:migrate
```

### 测试

运行所有测试:
```bash
pnpm test
```

运行测试覆盖率:
```bash
pnpm test:coverage
```

**注意**: 数据库集成测试需要 PostgreSQL 运行。如果数据库未启动，这些测试会失败，但不影响其他测试。

## 开发阶段

当前处于 **Phase 1: 基础设施层**

- [x] 项目初始化
- [x] 技术栈配置 (Hono, Drizzle, Redis)
- [x] 数据库 Schema 设计 (tenants, users, characters, chats)
- [x] 多租户中间件
- [x] 错误处理中间件
- [x] Repository 模式实现
- [ ] 认证系统 (Phase 2)
- [ ] API 路由实现 (Phase 2)

## 架构文档

- [基础设施架构](docs/architecture/infrastructure.md) - 完整的技术架构说明

## 参考资源

- [设计文档](../docs/plans/2026-01-29-sillytavern-saas-transformation.md)
- [开发框架](../.claude/README.md)
- [项目状态](../.claude/project-state.json)
