# Small Squaretable - 项目现状报告

**生成时间**: 2026-02-02
**项目版本**: 0.1.0
**当前阶段**: Phase 5 - 前端开发（认证系统调试中）

---

## 📊 项目概览

**Small Squaretable** 是 SillyTavern 的 SaaS 化改造项目，将单用户 LLM 前端转换为多租户云服务平台。

### 技术架构
- **前端**: Vue 3 + Vite + Element Plus + Pinia (端口: 5173)
- **后端**: Hono + Node.js + TypeScript (端口: 3000)
- **数据库**: PostgreSQL + Drizzle ORM
- **缓存**: Redis
- **实时通信**: WebSocket
- **支付**: Stripe

---

## ✅ 已完成功能模块

### Phase 1: 基础设施层 (100%)
- ✅ 项目初始化和技术栈配置
- ✅ 数据库 Schema 设计（7张表）
  - `tenants` - 租户表
  - `users` - 用户表
  - `characters` - 角色表
  - `chats` - 聊天会话表
  - `messages` - 消息表
  - `ratings` - 评分表
  - `subscriptions` - 订阅表
  - `usage_records` - 使用量记录表
- ✅ Repository 模式实现（8个仓库）
- ✅ 多租户中间件
- ✅ 错误处理中间件
- ✅ JWT 认证核心逻辑

### Phase 2: 核心 API (100%)
- ✅ 认证路由 (`/api/v1/auth`)
  - POST `/register` - 用户注册
  - POST `/login` - 用户登录
  - POST `/refresh` - 刷新令牌
  - POST `/logout` - 登出
  - GET `/me` - 获取当前用户信息
- ✅ 用户管理路由 (`/api/v1/users`)
- ✅ 角色管理路由 (`/api/v1/characters`)
  - 全文搜索（PostgreSQL tsvector）
  - 评分系统
  - 公开/私有角色管理
- ✅ 聊天路由 (`/api/v1/chats`)
  - 消息游标分页
  - 聊天会话管理
- ✅ WebSocket 实时通信 (`/ws`)
- ✅ LLM 集成路由 (`/api/v1/llm`)

### Phase 3: 订阅与计费 (100%)
- ✅ Stripe 集成
- ✅ 三层订阅计划（Free/Pro/Team）
- ✅ 订阅管理路由 (`/api/v1/subscriptions`)
- ✅ 使用量跟踪路由 (`/api/v1/usage`)
- ✅ 功能门控系统

### Phase 4: 前端基础 (100%)
- ✅ Vue 3 项目初始化
- ✅ 路由系统（Vue Router）
- ✅ 状态管理（Pinia）
  - `useUserStore` - 用户状态
  - `useUIStore` - UI 状态
  - `useChatStore` - 聊天状态
  - `useCharacterStore` - 角色状态
- ✅ API 服务层封装
- ✅ 布局组件
  - `AppHeader` - 顶部导航
  - `AppSidebar` - 侧边栏
  - `MainLayout` - 主布局
- ✅ UI 组件
  - `ErrorBoundary` - 错误边界
  - `LoadingOverlay` - 加载遮罩

### Phase 5: 前端页面开发 (80%)
#### 已完成页面
- ✅ `Home.vue` - 首页
- ✅ `Login.vue` - 登录页（2026-02-02 完成）
- ✅ `Register.vue` - 注册页（2026-02-02 完成）
- ✅ `Market.vue` - 角色市场
- ✅ `MyCharacters.vue` - 我的角色
- ✅ `Chat.vue` - 聊天页面
- ✅ `Profile.vue` - 个人中心
- ✅ `Subscription.vue` - 订阅管理

#### 已完成组件
- ✅ 角色组件
  - `CharacterCard` - 角色卡片
  - `CharacterDetail` - 角色详情
  - `CharacterPublishForm` - 角色发布表单
- ✅ 聊天组件
  - `ChatWindow` - 聊天窗口
  - `ChatSidebar` - 聊天侧边栏
  - `MessageBubble` - 消息气泡
  - `MessageInput` - 消息输入框
- ✅ 订阅组件
  - `UsageDashboard` - 使用量仪表盘
  - `UpgradePrompt` - 升级提示
- ✅ 个人中心组件
  - `ProfileForm` - 个人信息表单
  - `AvatarUpload` - 头像上传
- ✅ 评分组件
  - `RatingComponent` - 评分组件

---

## 🔧 最近修复的问题

### 2026-02-02 修复记录

#### 问题 1: 租户中间件全局应用导致 400 错误
**症状**: 访问首页和静态资源返回 `{"error":"Missing tenant ID"}`

**根因**: `src/server/index.ts:31` 将 `tenantMiddleware()` 应用到所有路由 (`app.use('*', tenantMiddleware())`)

**修复**: 改为选择性应用到需要租户隔离的 API 路由
```typescript
// 修复前
app.use('*', tenantMiddleware());

// 修复后
app.use('/api/v1/users/*', tenantMiddleware());
app.use('/api/v1/characters/*', tenantMiddleware());
app.use('/api/v1/chats/*', tenantMiddleware());
app.use('/api/v1/subscriptions/*', tenantMiddleware());
app.use('/api/v1/usage/*', tenantMiddleware());
app.use('/api/v1/llm/*', tenantMiddleware());
```

**文件**: `src/server/index.ts:32-38`

#### 问题 2: 路由混淆
**症状**: 用户期望 `/login` 路由但实际是 `/auth/login`

**修复**: 添加路由重定向
```typescript
{ path: '/login', redirect: '/auth/login' }
{ path: '/register', redirect: '/auth/register' }
```

**文件**: `src/client/router/routes.ts:23-24, 36-37`

#### 问题 3: 登出未清理租户 ID
**症状**: 登出后 localStorage 中残留 `tenantId`

**修复**: 在 `handleLogout` 中添加清理逻辑
```typescript
const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');  // 新增
  router.push('/');
};
```

**文件**: `src/client/components/layout/AppHeader.vue:19-24`

#### 问题 4: 前后端端口混淆
**症状**: 用户通过后端端口 (3000) 访问前端

**说明**:
- 后端 API 服务器: `http://localhost:3000`
- 前端 Vite 开发服务器: `http://localhost:5173`
- Vite 配置了 `/api` 代理到后端

**正确访问方式**:
- 前端应用: `http://localhost:5173`
- 后端 API: `http://localhost:3000/api/v1/*`

---

## 🚀 当前运行状态

### 开发服务器
```bash
# 后端服务器 (已启动)
npm run dev
# 运行在: http://localhost:3000
# 健康检查: http://localhost:3000/health

# 前端服务器 (已启动)
npm run dev:client
# 运行在: http://localhost:5173
# 代理配置: /api -> http://localhost:3000
```

### 数据库连接
- PostgreSQL: 已连接
- Redis: 已连接

### 健康检查端点
- `/health` - 基础健康检查 ✅
- `/health/live` - 存活检查 ✅
- `/health/ready` - 就绪检查 ✅

---

## 📋 待测试功能

### 认证系统测试清单
- [ ] 用户注册流程
  - [ ] 访问 `http://localhost:5173/register`
  - [ ] 填写用户名、邮箱、密码
  - [ ] 验证注册成功并自动登录
  - [ ] 检查 localStorage 中的 `token`、`refreshToken`、`tenantId`
- [ ] 用户登录流程
  - [ ] 访问 `http://localhost:5173/login`
  - [ ] 使用已注册账号登录
  - [ ] 验证登录成功并跳转到首页
  - [ ] 检查 localStorage 中的认证信息
- [ ] 认证状态持久化
  - [ ] 刷新页面后仍保持登录状态
  - [ ] 检查 API 请求是否携带 `X-Tenant-ID` 头
- [ ] 登出流程
  - [ ] 点击用户菜单中的"退出登录"
  - [ ] 验证 localStorage 被清空
  - [ ] 验证跳转到首页

### 角色市场测试清单
- [ ] 访问角色市场页面
- [ ] 搜索角色功能
- [ ] 查看角色详情
- [ ] 评分功能（需登录）

### 聊天功能测试清单
- [ ] 创建新聊天会话
- [ ] 发送消息
- [ ] WebSocket 实时通信
- [ ] 消息历史加载

---

## 🔄 下一步开发计划

### 短期任务（本周）
1. **完成认证系统测试** - 验证注册、登录、登出流程
2. **修复发现的 Bug** - 根据测试结果修复问题
3. **完善错误处理** - 改进前端错误提示
4. **优化用户体验** - 添加加载状态、成功提示

### 中期任务（下周）
1. **E2E 测试** - 使用 Playwright 编写端到端测试
2. **性能优化** - 前端代码分割、懒加载
3. **安全加固** - CSRF 防护、XSS 防护
4. **文档完善** - API 文档、用户手册

### 长期任务（本月）
1. **部署准备** - Docker 镜像构建、K8s 配置
2. **监控系统** - 日志收集、性能监控
3. **备份策略** - 数据库备份、灾难恢复
4. **负载测试** - 压力测试、性能基准

---

## 📁 项目文件结构

```
Small-Squaretable/
├── src/
│   ├── server/                 # 后端代码
│   │   ├── index.ts            # 服务器入口 ⚠️ 最近修改
│   │   ├── routes/             # API 路由 (16 个文件)
│   │   │   ├── auth.ts         # 认证路由
│   │   │   ├── users.ts        # 用户路由
│   │   │   ├── characters.ts   # 角色路由
│   │   │   ├── chats.ts        # 聊天路由
│   │   │   ├── subscriptions.ts # 订阅路由
│   │   │   ├── usage.ts        # 使用量路由
│   │   │   ├── llm.ts          # LLM 路由
│   │   │   └── websocket.ts    # WebSocket 路由
│   │   ├── middleware/         # 中间件
│   │   │   ├── auth.ts         # 认证中间件
│   │   │   ├── tenant.ts       # 租户中间件
│   │   │   └── error-handler.ts # 错误处理
│   │   └── services/           # 业务服务
│   │       ├── auth.service.ts
│   │       ├── character.service.ts
│   │       ├── chat.service.ts
│   │       ├── subscription.service.ts
│   │       └── llm.service.ts
│   ├── client/                 # 前端代码 (74 个文件)
│   │   ├── pages/              # 页面组件 (8 个)
│   │   │   ├── auth/
│   │   │   │   ├── Login.vue   # 登录页 ⚠️ 最近完成
│   │   │   │   └── Register.vue # 注册页 ⚠️ 最近完成
│   │   │   ├── Home.vue
│   │   │   ├── Market.vue
│   │   │   ├── Chat.vue
│   │   │   ├── Profile.vue
│   │   │   ├── MyCharacters.vue
│   │   │   └── Subscription.vue
│   │   ├── components/         # 组件 (18 个)
│   │   │   ├── layout/
│   │   │   │   ├── AppHeader.vue ⚠️ 最近修改
│   │   │   │   ├── AppSidebar.vue
│   │   │   │   └── MainLayout.vue
│   │   │   ├── character/
│   │   │   ├── chat/
│   │   │   ├── subscription/
│   │   │   ├── profile/
│   │   │   ├── rating/
│   │   │   └── ui/
│   │   ├── router/
│   │   │   ├── index.ts
│   │   │   └── routes.ts       ⚠️ 最近修改
│   │   ├── stores/             # Pinia 状态管理
│   │   ├── services/           # API 服务层
│   │   └── composables/        # 组合式函数
│   ├── db/                     # 数据库
│   │   ├── schema/             # 数据库模式 (8 张表)
│   │   └── repositories/       # 仓库模式 (8 个)
│   ├── core/                   # 核心逻辑
│   │   ├── config.ts           # 配置管理
│   │   ├── jwt.ts              # JWT 工具
│   │   └── redis.ts            # Redis 客户端
│   └── types/                  # TypeScript 类型定义
├── docs/                       # 文档
├── k8s/                        # Kubernetes 配置
├── scripts/                    # 脚本
├── package.json
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
└── .env                        # 环境变量

总计:
- 后端文件: 52 个
- 前端文件: 74 个
- 测试文件: 包含在上述统计中
```

---

## 🔑 关键配置文件

### 环境变量 (`.env`)
```bash
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/sillytavern_saas

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...

# 服务器
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
```

### Vite 配置 (`vite.config.ts`)
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

---

## 🐛 已知问题

### 非阻塞问题
1. **PostgreSQL 全文搜索警告**
   - 症状: 搜索 `*` 时出现 "text-search query contains only stop words" 警告
   - 影响: 不影响功能，仅日志噪音
   - 优先级: P2
   - 计划: 优化搜索查询逻辑

2. **TypeScript 类型警告**
   - 位置: `src/server/index.ts:107`
   - 内容: `@ts-expect-error - Type mismatch between @hono/node-server and ws Server types`
   - 影响: 不影响运行
   - 优先级: P3
   - 计划: 等待上游类型定义更新

---

## 📊 测试覆盖率

### 后端测试
- 单元测试: 600+ 测试用例
- 集成测试: 包含数据库和 Redis 集成测试
- 覆盖率: 估计 80%+

### 前端测试
- 组件测试: 部分组件有测试
- E2E 测试: Playwright 配置完成，待编写测试用例
- 覆盖率: 估计 40%

---

## 🔗 相关文档

### 设计文档
- [SaaS 转换设计文档](../docs/plans/2026-01-29-sillytavern-saas-transformation.md)
- [Claude Agent 开发框架](../docs/plans/2026-01-31-claude-agent-development-framework.md)

### 操作手册
- [README.md](README.md) - 项目概览
- [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md) - 操作手册
- [USER_GUIDE.md](USER_GUIDE.md) - 用户指南

### API 文档
- [前后端集成文档](docs/frontend-backend-integration.md)
- [订阅系统指南](docs/subscription-guide.md)

---

## 🚨 紧急联系信息

### 开发环境问题排查

#### 后端服务无法启动
```bash
# 检查端口占用
lsof -ti:3000 | xargs kill -9

# 重启服务
npm run dev
```

#### 前端服务无法启动
```bash
# 检查端口占用
lsof -ti:5173 | xargs kill -9

# 重启服务
npm run dev:client
```

#### 数据库连接失败
```bash
# 检查 PostgreSQL 状态
docker ps | grep postgres

# 重启 PostgreSQL
docker restart sillytavern-postgres
```

#### Redis 连接失败
```bash
# 检查 Redis 状态
docker ps | grep redis

# 重启 Redis
docker restart sillytavern-redis
```

---

## 📝 会话恢复指南

### 如果新会话需要继续开发，请执行以下步骤：

1. **阅读本文档** - 了解项目当前状态
2. **检查服务状态** - 确认后端和前端服务是否运行
3. **查看最近提交** - `git log --oneline --since="2 days ago"`
4. **运行测试** - 确保现有功能正常
5. **查看待办事项** - 参考"下一步开发计划"章节

### 快速启动命令
```bash
# 1. 启动后端
npm run dev

# 2. 启动前端（新终端）
npm run dev:client

# 3. 访问应用
# 前端: http://localhost:5173
# 后端: http://localhost:3000
# 健康检查: http://localhost:3000/health
```

---

**最后更新**: 2026-02-02 10:00 AM
**更新人**: Claude Code
**下次审查**: 2026-02-03
