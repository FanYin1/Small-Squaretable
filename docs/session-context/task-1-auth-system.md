# Task #1: 认证系统实现 - 子会话启动上下文

## 会话配置

- **模型**: Claude Sonnet（高复杂度任务）
- **工作目录**: `/var/aichat/Small-Squaretable`
- **实施计划**: `docs/plans/2026-01-31-auth-system-implementation.md`
- **必需技能**: `superpowers:executing-plans`

## 任务概述

实现完整的 JWT 双 Token 认证系统，包括：
- JWT 工具模块（生成、验证、刷新）
- 认证中间件（验证 token，注入用户信息）
- 认证服务（注册、登录、刷新、登出）
- 认证路由（API 端点）
- 完整的测试覆盖（单元测试 + 集成测试）

## 技术栈

- **JWT**: jose ^5.9.6
- **密码加密**: bcrypt ^5.1.1
- **验证**: zod ^3.24.1
- **HTTP框架**: Hono ^4.6.14
- **数据库**: Drizzle ORM + PostgreSQL
- **缓存**: Redis（存储 refresh token）

## 项目结构

```
Small-Squaretable/
├── src/
│   ├── core/
│   │   ├── config.ts          # 已存在，包含 JWT_SECRET
│   │   ├── redis.ts           # 已存在
│   │   ├── errors.ts          # 已存在（UnauthorizedError, ValidationError）
│   │   └── jwt.ts             # 待创建
│   ├── db/
│   │   ├── schema/
│   │   │   └── users.ts       # 已存在
│   │   └── repositories/
│   │       └── user.repository.ts  # 待创建
│   ├── server/
│   │   ├── middleware/
│   │   │   ├── tenant.ts      # 已存在
│   │   │   ├── error-handler.ts # 已存在
│   │   │   └── auth.ts        # 待创建
│   │   ├── routes/
│   │   │   └── auth.ts        # 待创建
│   │   ├── services/
│   │   │   └── auth.service.ts # 待创建
│   │   └── index.ts           # 需要集成认证路由
│   └── types/
│       ├── api.ts             # 已存在（ApiResponse）
│       └── auth.ts            # 待创建
└── tests/
    └── integration/
        └── auth.integration.spec.ts  # 待创建
```

## 环境变量（已配置）

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

## 实施顺序（8个Task）

1. **JWT 工具模块** - 生成和验证 access/refresh token
2. **认证类型定义** - Zod schemas 和 TypeScript 类型
3. **User Repository** - 数据访问层（认证所需部分）
4. **认证服务** - 业务逻辑（注册、登录、刷新、登出）
5. **认证中间件** - 验证 token 并注入用户信息到 context
6. **认证路由** - API 端点实现
7. **集成到主服务器** - 注册路由
8. **端到端测试** - 完整的认证流程测试

## TDD 开发模式

每个 Task 遵循 RED-GREEN-REFACTOR 循环：
1. 编写失败的测试
2. 运行测试验证失败
3. 实现最小代码使测试通过
4. 运行测试验证通过
5. 提交代码

## 验收标准

- [ ] 所有单元测试通过
- [ ] 集成测试通过（注册→登录→刷新→登出）
- [ ] 类型检查通过：`npm run type-check`
- [ ] Lint 检查通过：`npm run lint`
- [ ] 测试覆盖率 > 80%
- [ ] JWT token 正确生成和验证
- [ ] Refresh token 存储在 Redis
- [ ] 认证中间件正确注入用户信息

## 启动命令

在新会话中执行：

```bash
cd /var/aichat/Small-Squaretable
# 使用 superpowers:executing-plans 技能
# 读取计划文件: docs/plans/2026-01-31-auth-system-implementation.md
# 按 Task 顺序执行
```

## 关键注意事项

1. **密码安全**: 使用 bcrypt，SALT_ROUNDS=12
2. **Token 过期时间**: Access Token 15分钟，Refresh Token 7天
3. **Redis 存储**: Refresh token 使用 `refresh_token:{userId}` 作为 key
4. **租户隔离**: 认证中间件需要与现有的 tenant 中间件配合
5. **错误处理**: 使用现有的 UnauthorizedError 和 ValidationError
6. **测试隔离**: 每个测试使用唯一的邮箱（`test-${Date.now()}@example.com`）

## 完成后汇报

在主会话中汇报：
- 完成的 Task 列表
- 测试覆盖率报告
- 遇到的问题和解决方案
- 提交的 commit 列表
