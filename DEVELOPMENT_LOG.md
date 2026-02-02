# 开发日志 (Development Log)

本文档记录项目的关键开发活动、决策和问题解决过程。

---

## 2026-02-02

### 会话: 认证系统调试与架构修复

#### 问题 1: 租户中间件导致全局 400 错误

**时间**: 10:00 AM

**报告症状**:
```
GET http://localhost:3000/ 400 (Bad Request)
{"error":"Missing tenant ID","message":"Please provide X-Tenant-ID header"}
```

**问题分析**:
1. 用户通过浏览器访问 `http://localhost:3000/` 返回 400 错误
2. 静态资源 `favicon.ico` 也返回相同错误
3. 错误信息表明租户中间件被应用到了不应该应用的路由

**根本原因**:
- 文件: `src/server/index.ts:31`
- 代码: `app.use('*', tenantMiddleware())`
- 问题: 租户中间件被全局应用到所有路由，包括首页、静态资源、健康检查等

**解决方案**:
改为选择性应用租户中间件，仅应用到需要租户隔离的 API 路由：

```typescript
// 修复前
app.use('*', logger());
app.use('*', cors());
app.use('*', tenantMiddleware()); // ❌ 错误：应用到所有路由

// 修复后
app.use('*', logger());
app.use('*', cors());

// Tenant middleware 只应用到需要租户隔离的 API 路由
app.use('/api/v1/users/*', tenantMiddleware());
app.use('/api/v1/characters/*', tenantMiddleware());
app.use('/api/v1/chats/*', tenantMiddleware());
app.use('/api/v1/subscriptions/*', tenantMiddleware());
app.use('/api/v1/usage/*', tenantMiddleware());
app.use('/api/v1/llm/*', tenantMiddleware());
```

**验证**:
```bash
curl http://localhost:3000/health
# 返回: {"status":"ok",...}
```

**影响范围**:
- 修复文件: `src/server/index.ts`
- 影响路由: 所有非 API 路由现在可以正常访问
- 副作用: 无

---

#### 问题 2: 路由混淆 - 用户期望 `/login` 但实际是 `/auth/login`

**时间**: 10:05 AM

**报告症状**:
用户提到"昨晚测试的时候路由是 `http://localhost:3000/login`，怎么突然换路由了"

**问题分析**:
1. 当前路由配置为 `/auth/login` 和 `/auth/register`
2. 用户期望更简短的路由 `/login` 和 `/register`
3. 没有配置路由别名或重定向

**解决方案**:
在 `src/client/router/routes.ts` 中添加路由重定向：

```typescript
{
  path: '/auth/login',
  name: 'Login',
  component: () => import('../pages/auth/Login.vue'),
  meta: {
    requiresAuth: false,
    guestOnly: true,
  },
},
{
  path: '/login',
  redirect: '/auth/login', // ✅ 添加重定向
},
{
  path: '/auth/register',
  name: 'Register',
  component: () => import('../pages/auth/Register.vue'),
  meta: {
    requiresAuth: false,
    guestOnly: true,
  },
},
{
  path: '/register',
  redirect: '/auth/register', // ✅ 添加重定向
},
```

**用户体验改进**:
- 用户可以使用 `/login` 或 `/auth/login` 访问登录页
- 用户可以使用 `/register` 或 `/auth/register` 访问注册页
- 保持 URL 结构的灵活性

---

#### 问题 3: 登出未清理租户 ID

**时间**: 10:10 AM

**问题分析**:
- `AppHeader.vue` 的 `handleLogout` 函数只清理了 `token` 和 `refreshToken`
- 未清理 `tenantId`，导致登出后残留租户信息

**解决方案**:
修改 `src/client/components/layout/AppHeader.vue:19-24`：

```typescript
const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId'); // ✅ 添加清理租户 ID
  router.push('/');
};
```

**最佳实践**:
- 登出时应清理所有认证相关的本地存储
- 包括: token, refreshToken, tenantId, 以及任何用户特定的缓存数据

---

#### 问题 4: 前后端端口混淆

**时间**: 10:15 AM

**问题分析**:
用户尝试通过 `http://localhost:3000/login` 访问前端应用，但这是后端 API 服务器的端口。

**架构说明**:
```
┌─────────────────────────────────────────────────────────┐
│                    开发环境架构                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  浏览器                                                  │
│    │                                                     │
│    │ http://localhost:5173                              │
│    ↓                                                     │
│  ┌──────────────────────────────────┐                   │
│  │  Vite Dev Server (前端)          │                   │
│  │  Port: 5173                      │                   │
│  │  - 提供 Vue 应用                  │                   │
│  │  - 热模块替换 (HMR)               │                   │
│  │  - 代理 /api 请求到后端           │                   │
│  └──────────────────────────────────┘                   │
│           │                                              │
│           │ /api/* 请求                                  │
│           ↓                                              │
│  ┌──────────────────────────────────┐                   │
│  │  Hono Server (后端)              │                   │
│  │  Port: 3000                      │                   │
│  │  - RESTful API                   │                   │
│  │  - WebSocket                     │                   │
│  │  - 数据库访问                     │                   │
│  └──────────────────────────────────┘                   │
│           │                                              │
│           ↓                                              │
│  ┌──────────────────────────────────┐                   │
│  │  PostgreSQL + Redis              │                   │
│  └──────────────────────────────────┘                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**正确的访问方式**:
- ✅ 前端应用: `http://localhost:5173`
- ✅ 后端 API: `http://localhost:3000/api/v1/*`
- ❌ 错误: 通过 `http://localhost:3000` 访问前端

**Vite 代理配置** (`vite.config.ts`):
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

**启动命令**:
```bash
# 终端 1: 启动后端
npm run dev

# 终端 2: 启动前端
npm run dev:client
```

---

### 技术决策

#### 决策 1: 租户中间件应用策略

**背景**:
多租户架构需要在 API 层面进行租户隔离，但不是所有路由都需要租户信息。

**选项**:
1. **全局应用** - `app.use('*', tenantMiddleware())`
   - 优点: 简单，一行代码
   - 缺点: 影响健康检查、静态资源等不需要租户信息的路由

2. **选择性应用** - 仅应用到需要租户隔离的 API 路由
   - 优点: 精确控制，不影响其他路由
   - 缺点: 需要明确列出所有需要租户隔离的路由

**决策**: 选择方案 2 - 选择性应用

**理由**:
1. 健康检查端点不应该需要租户信息
2. 认证端点（注册、登录）在创建租户前不应该需要租户信息
3. 静态资源不应该被租户中间件拦截
4. 更清晰的架构边界

**实施**:
```typescript
// 仅应用到需要租户隔离的 API 路由
app.use('/api/v1/users/*', tenantMiddleware());
app.use('/api/v1/characters/*', tenantMiddleware());
app.use('/api/v1/chats/*', tenantMiddleware());
app.use('/api/v1/subscriptions/*', tenantMiddleware());
app.use('/api/v1/usage/*', tenantMiddleware());
app.use('/api/v1/llm/*', tenantMiddleware());
```

**未来考虑**:
- 如果需要添加新的需要租户隔离的路由，记得添加中间件
- 考虑创建一个路由组来简化配置

---

#### 决策 2: 路由结构设计

**背景**:
需要在 RESTful 风格和用户友好性之间找到平衡。

**当前结构**:
```
/auth/login      - 登录页
/auth/register   - 注册页
/login           - 重定向到 /auth/login
/register        - 重定向到 /auth/register
```

**理由**:
1. `/auth/*` 路由保持 RESTful 风格，便于 API 组织
2. 短路由 `/login` 和 `/register` 提供更好的用户体验
3. 使用重定向而不是别名，保持 URL 一致性

**替代方案**:
- 使用路由别名 (`alias: ['/login']`)
  - 缺点: URL 栏会显示不同的路径，可能造成混淆

---

### 代码审查要点

#### 中间件应用模式

**反模式** ❌:
```typescript
// 不要全局应用需要特定上下文的中间件
app.use('*', tenantMiddleware());
app.use('*', authMiddleware());
```

**最佳实践** ✅:
```typescript
// 选择性应用中间件到需要的路由
app.use('/api/v1/protected/*', authMiddleware());
app.use('/api/v1/tenant-specific/*', tenantMiddleware());

// 或者在路由定义时应用
app.get('/api/v1/users', authMiddleware(), tenantMiddleware(), handler);
```

#### 清理本地存储

**反模式** ❌:
```typescript
// 不完整的清理
const handleLogout = () => {
  localStorage.removeItem('token');
  router.push('/');
};
```

**最佳实践** ✅:
```typescript
// 清理所有认证相关数据
const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');
  // 清理其他用户特定数据
  sessionStorage.clear();
  router.push('/');
};
```

---

### 测试建议

#### 集成测试场景

1. **租户中间件测试**
   ```typescript
   describe('Tenant Middleware', () => {
     it('should not require tenant ID for health check', async () => {
       const res = await request(app).get('/health');
       expect(res.status).toBe(200);
     });

     it('should require tenant ID for user API', async () => {
       const res = await request(app).get('/api/v1/users');
       expect(res.status).toBe(400);
       expect(res.body.error).toBe('Missing tenant ID');
     });

     it('should accept valid tenant ID', async () => {
       const res = await request(app)
         .get('/api/v1/users')
         .set('X-Tenant-ID', 'valid-tenant-id');
       expect(res.status).not.toBe(400);
     });
   });
   ```

2. **路由重定向测试**
   ```typescript
   describe('Route Redirects', () => {
     it('should redirect /login to /auth/login', async () => {
       const res = await request(app).get('/login');
       expect(res.status).toBe(302);
       expect(res.headers.location).toBe('/auth/login');
     });
   });
   ```

3. **登出清理测试**
   ```typescript
   describe('Logout', () => {
     it('should clear all auth data from localStorage', () => {
       localStorage.setItem('token', 'test-token');
       localStorage.setItem('refreshToken', 'test-refresh');
       localStorage.setItem('tenantId', 'test-tenant');

       handleLogout();

       expect(localStorage.getItem('token')).toBeNull();
       expect(localStorage.getItem('refreshToken')).toBeNull();
       expect(localStorage.getItem('tenantId')).toBeNull();
     });
   });
   ```

---

### 性能考虑

#### 中间件性能

**当前实现**:
- 租户中间件在每个匹配的请求上执行
- 从请求头中提取 `X-Tenant-ID`
- 验证租户 ID 格式

**优化建议**:
1. 考虑缓存租户验证结果
2. 使用 Redis 缓存租户信息
3. 避免在中间件中进行数据库查询

**示例**:
```typescript
// 优化前
export const tenantMiddleware = () => {
  return async (c, next) => {
    const tenantId = c.req.header('X-Tenant-ID');
    // 每次都查询数据库验证租户
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId)
    });
    // ...
  };
};

// 优化后
export const tenantMiddleware = () => {
  return async (c, next) => {
    const tenantId = c.req.header('X-Tenant-ID');
    // 先检查 Redis 缓存
    const cached = await redis.get(`tenant:${tenantId}`);
    if (cached) {
      c.set('tenantId', tenantId);
      return next();
    }
    // 缓存未命中才查询数据库
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId)
    });
    if (tenant) {
      await redis.setex(`tenant:${tenantId}`, 3600, '1');
    }
    // ...
  };
};
```

---

### 下一步行动

#### 立即行动 (今天)
- [x] 修复租户中间件全局应用问题
- [x] 添加路由重定向
- [x] 修复登出清理逻辑
- [x] 启动前端开发服务器
- [ ] 测试注册流程
- [ ] 测试登录流程
- [ ] 测试登出流程

#### 短期行动 (本周)
- [ ] 编写租户中间件集成测试
- [ ] 编写路由重定向测试
- [ ] 编写登出清理测试
- [ ] 优化错误提示信息
- [ ] 添加加载状态指示器

#### 中期行动 (下周)
- [ ] 实现租户验证缓存
- [ ] 添加 E2E 测试
- [ ] 性能优化
- [ ] 安全审计

---

### 经验教训

#### 1. 中间件应用需要谨慎
**教训**: 全局应用中间件可能会影响不应该被影响的路由。

**最佳实践**:
- 明确哪些路由需要中间件
- 使用选择性应用而不是全局应用
- 为公共路由（健康检查、静态资源）提供例外

#### 2. 前后端分离架构需要清晰的边界
**教训**: 用户混淆了前端和后端的端口。

**最佳实践**:
- 在文档中明确说明前后端端口
- 使用代理配置简化开发体验
- 提供清晰的启动命令

#### 3. 清理操作需要完整
**教训**: 登出时未清理所有认证数据导致状态残留。

**最佳实践**:
- 列出所有需要清理的数据
- 创建清理函数统一管理
- 在测试中验证清理完整性

---

### 参考资料

- [Hono 中间件文档](https://hono.dev/guides/middleware)
- [Vue Router 重定向](https://router.vuejs.org/guide/essentials/redirect-and-alias.html)
- [多租户架构最佳实践](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)

---

**日志维护者**: Claude Code
**最后更新**: 2026-02-02 10:30 AM
