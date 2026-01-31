# Phase 4: Subscription & Billing System 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 为 Small Squaretable 构建完整的订阅与计费系统，支持 Stripe 集成、多层级订阅套餐、用量追踪和计费。

**Architecture:** 采用 Stripe 作为支付网关，在后端实现订阅管理、Webhook 处理、用量追踪系统。前端添加订阅管理页面和支付流程。使用 Drizzle ORM 管理订阅数据。

**Tech Stack:** Stripe SDK, Hono, Drizzle ORM, PostgreSQL, Vue 3, Element Plus

---

## 项目结构

```
Small-Squaretable/
├── src/
│   ├── server/
│   │   ├── routes/
│   │   │   └── subscription.ts    # 订阅 API 路由
│   │   ├── services/
│   │   │   ├── stripe.service.ts  # Stripe 集成
│   │   │   ├── subscription.service.ts
│   │   │   └── usage.service.ts   # 用量追踪
│   │   └── webhooks/
│   │       └── stripe.webhook.ts  # Stripe Webhook 处理
│   ├── db/
│   │   └── schema/
│   │       ├── subscriptions.ts   # 订阅表
│   │       └── usage.ts           # 用量表
│   └── client/
│       ├── pages/
│       │   └── Subscription.vue   # 订阅管理页面
│       └── components/
│           └── subscription/
│               ├── PricingCard.vue
│               ├── PaymentForm.vue
│               └── UsageChart.vue
└── .env                           # Stripe API keys
```

---

## Task 1: 数据库 Schema - 订阅表

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

需要创建订阅相关的数据库表，包括订阅记录、用量追踪、支付历史。

### Files

- Create: `src/db/schema/subscriptions.ts`
- Create: `src/db/schema/usage.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/db/schema/tenants.ts`

### Prompt for Subagent

```
## 任务：创建订阅与计费数据库 Schema

### 背景
Small Squaretable 需要订阅系统。需要创建数据库表来存储订阅信息、用量数据和支付历史。

### 要求

1. **subscriptions.ts** - 订阅表
   - id (uuid, primary key)
   - tenantId (uuid, foreign key to tenants)
   - stripeCustomerId (varchar)
   - stripeSubscriptionId (varchar)
   - stripePriceId (varchar)
   - plan (enum: 'free', 'pro', 'team')
   - status (enum: 'active', 'canceled', 'past_due', 'trialing')
   - currentPeriodStart (timestamp)
   - currentPeriodEnd (timestamp)
   - cancelAtPeriodEnd (boolean)
   - createdAt, updatedAt (timestamp)

2. **usage.ts** - 用量追踪表
   - id (uuid, primary key)
   - tenantId (uuid, foreign key)
   - resourceType (enum: 'llm_tokens', 'messages', 'images', 'api_calls')
   - amount (integer)
   - period (varchar) - 格式: YYYY-MM
   - metadata (jsonb) - 额外信息
   - createdAt (timestamp)

3. **更新 tenants.ts**
   - 添加 subscriptionId (uuid, nullable, foreign key to subscriptions)
   - 添加 stripeCustomerId (varchar, nullable)

4. **更新 index.ts**
   - 导出新的 schema

### 技术要求
- 使用 Drizzle ORM
- 正确的外键关系
- 适当的索引（tenantId, period）
- TypeScript 类型导出

### 验证
- 运行 `npm run db:generate` 生成迁移
- 检查生成的 SQL 文件
- 类型检查通过
```

---

## Task 2: Stripe 服务集成

**复杂度:** 高
**推荐模型:** Claude Opus

### Context

集成 Stripe SDK，实现客户创建、订阅管理、支付处理等核心功能。

### Files

- Create: `src/server/services/stripe.service.ts`
- Create: `src/server/config/stripe.config.ts`
- Modify: `package.json` (添加 stripe 依赖)
- Modify: `.env.example`

### Prompt for Subagent

```
## 任务：集成 Stripe 支付服务

### 背景
需要集成 Stripe 来处理订阅支付。

### 要求

1. **安装依赖**
   ```bash
   npm install stripe
   npm install -D @types/stripe
   ```

2. **stripe.config.ts** - Stripe 配置
   ```typescript
   export const stripeConfig = {
     apiKey: process.env.STRIPE_SECRET_KEY!,
     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
     prices: {
       pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
       pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
       team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
     }
   };
   ```

3. **stripe.service.ts** - Stripe 服务
   - `createCustomer(email, name)` - 创建 Stripe 客户
   - `createCheckoutSession(customerId, priceId, successUrl, cancelUrl)` - 创建支付会话
   - `createPortalSession(customerId, returnUrl)` - 创建客户门户会话
   - `getSubscription(subscriptionId)` - 获取订阅信息
   - `cancelSubscription(subscriptionId)` - 取消订阅
   - `updateSubscription(subscriptionId, priceId)` - 更新订阅

4. **环境变量** (.env.example)
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_PRO_MONTHLY=price_...
   STRIPE_PRICE_PRO_YEARLY=price_...
   STRIPE_PRICE_TEAM_MONTHLY=price_...
   ```

### 技术要求
- 完整的错误处理
- TypeScript 类型安全
- 日志记录
- 幂等性处理

### 验证
- 类型检查通过
- 可以成功初始化 Stripe 客户端
```

---

## Task 3: 订阅管理服务

**复杂度:** 高
**推荐模型:** Claude Opus

### Context

实现订阅业务逻辑，包括订阅创建、更新、取消、状态同步等。

### Files

- Create: `src/server/services/subscription.service.ts`
- Create: `src/db/repositories/subscription.repository.ts`

### Prompt for Subagent

```
## 任务：实现订阅管理服务

### 背景
需要实现订阅的业务逻辑层，连接 Stripe 服务和数据库。

### 要求

1. **subscription.repository.ts** - 订阅数据访问层
   - `create(data)` - 创建订阅记录
   - `findByTenantId(tenantId)` - 查询租户订阅
   - `findByStripeSubscriptionId(stripeId)` - 通过 Stripe ID 查询
   - `update(id, data)` - 更新订阅
   - `updateStatus(id, status)` - 更新状态

2. **subscription.service.ts** - 订阅业务逻辑
   - `createSubscription(tenantId, priceId)` - 创建订阅
     1. 检查租户是否已有订阅
     2. 创建或获取 Stripe 客户
     3. 创建 Stripe Checkout Session
     4. 返回 checkout URL

   - `getSubscription(tenantId)` - 获取订阅信息
     1. 从数据库查询
     2. 如果有 Stripe ID，同步最新状态
     3. 返回订阅详情

   - `cancelSubscription(tenantId)` - 取消订阅
     1. 验证权限
     2. 调用 Stripe 取消
     3. 更新数据库状态

   - `upgradeSubscription(tenantId, newPriceId)` - 升级订阅
   - `syncSubscriptionStatus(stripeSubscriptionId)` - 同步状态

### 技术要求
- 事务处理
- 错误处理和回滚
- 日志记录
- 权限验证

### 验证
- 类型检查通过
- 业务逻辑完整
```

---

## Task 4: Stripe Webhook 处理

**复杂度:** 高
**推荐模型:** Claude Opus

### Context

实现 Stripe Webhook 端点，处理支付成功、订阅更新、订阅取消等事件。

### Files

- Create: `src/server/webhooks/stripe.webhook.ts`
- Create: `src/server/routes/webhooks.ts`

### Prompt for Subagent

```
## 任务：实现 Stripe Webhook 处理

### 背景
Stripe 通过 Webhook 通知订阅状态变化，需要实现处理逻辑。

### 要求

1. **stripe.webhook.ts** - Webhook 处理器

   处理以下事件：

   - `checkout.session.completed` - 支付完成
     1. 提取 subscription ID 和 customer ID
     2. 创建或更新数据库订阅记录
     3. 更新租户的 plan 字段

   - `customer.subscription.updated` - 订阅更新
     1. 同步订阅状态到数据库
     2. 更新 currentPeriodStart/End

   - `customer.subscription.deleted` - 订阅取消
     1. 更新订阅状态为 'canceled'
     2. 降级租户到 free plan

   - `invoice.payment_succeeded` - 支付成功
     1. 记录支付历史
     2. 更新订阅状态

   - `invoice.payment_failed` - 支付失败
     1. 更新订阅状态为 'past_due'
     2. 发送通知邮件

2. **webhooks.ts** - Webhook 路由
   ```typescript
   app.post('/webhooks/stripe', async (c) => {
     const signature = c.req.header('stripe-signature');
     const body = await c.req.text();

     // 验证签名
     const event = stripe.webhooks.constructEvent(
       body,
       signature,
       webhookSecret
     );

     // 处理事件
     await handleStripeWebhook(event);

     return c.json({ received: true });
   });
   ```

### 技术要求
- 签名验证（安全性）
- 幂等性处理（防止重复处理）
- 错误处理和重试
- 详细日志记录

### 验证
- Webhook 签名验证正确
- 事件处理逻辑完整
- 类型检查通过
```

---

## Task 5: 订阅 API 路由

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

创建订阅相关的 REST API 端点，供前端调用。

### Files

- Create: `src/server/routes/subscription.ts`
- Modify: `src/server/index.ts`

### Prompt for Subagent

```
## 任务：创建订阅 API 路由

### 背景
前端需要 API 来管理订阅。

### 要求

创建以下端点：

1. **GET /api/subscription** - 获取当前订阅
   - 需要认证
   - 返回订阅详情和用量信息

2. **POST /api/subscription/checkout** - 创建支付会话
   - Body: { priceId: string }
   - 返回: { checkoutUrl: string }

3. **POST /api/subscription/portal** - 创建客户门户会话
   - 返回: { portalUrl: string }

4. **POST /api/subscription/cancel** - 取消订阅
   - 返回: { success: boolean }

5. **POST /api/subscription/upgrade** - 升级订阅
   - Body: { priceId: string }
   - 返回: { success: boolean }

6. **GET /api/subscription/usage** - 获取用量统计
   - Query: { period?: string }
   - 返回用量详情

### 技术要求
- 使用 Hono 框架
- JWT 认证中间件
- Zod 参数验证
- 错误处理

### 验证
- 所有路由可访问
- 参数验证正确
- 类型检查通过
```

---

## Task 6: 用量追踪服务

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

实现用量追踪系统，记录和统计各类资源使用情况。

### Files

- Create: `src/server/services/usage.service.ts`
- Create: `src/db/repositories/usage.repository.ts`
- Create: `src/server/middleware/usage-tracking.ts`

### Prompt for Subagent

```
## 任务：实现用量追踪系统

### 背景
需要追踪用户的资源使用量，用于计费和限额控制。

### 要求

1. **usage.repository.ts** - 用量数据访问
   - `record(tenantId, resourceType, amount, metadata)` - 记录用量
   - `getUsage(tenantId, resourceType, period)` - 查询用量
   - `getTotalUsage(tenantId, period)` - 查询总用量
   - `resetUsage(tenantId, period)` - 重置用量（月初）

2. **usage.service.ts** - 用量业务逻辑
   - `trackUsage(tenantId, resourceType, amount)` - 追踪用量
     1. 记录到数据库
     2. 检查是否超过限额
     3. 返回剩余额度

   - `getUsageStats(tenantId, period)` - 获取用量统计
     1. 按资源类型分组
     2. 计算百分比
     3. 返回图表数据

   - `checkQuota(tenantId, resourceType)` - 检查配额
     1. 获取订阅计划
     2. 获取当前用量
     3. 返回是否可用

3. **usage-tracking.ts** - 用量追踪中间件
   ```typescript
   export const trackMessageUsage = async (c, next) => {
     await next();

     // 追踪消息用量
     const tenantId = c.get('tenantId');
     await usageService.trackUsage(tenantId, 'messages', 1);
   };
   ```

### 技术要求
- 高性能（考虑批量写入）
- 准确性
- 实时统计

### 验证
- 用量记录正确
- 统计准确
- 类型检查通过
```

---

## Task 7: 前端订阅管理页面

**复杂度:** 高
**推荐模型:** Claude Opus

### Context

创建前端订阅管理页面，展示套餐、支付流程、用量统计。

### Files

- Create: `src/client/pages/Subscription.vue`
- Create: `src/client/components/subscription/PricingCard.vue`
- Create: `src/client/components/subscription/CurrentPlan.vue`
- Create: `src/client/components/subscription/UsageChart.vue`
- Create: `src/client/services/subscription.api.ts`
- Create: `src/client/stores/subscription.ts`

### Prompt for Subagent

```
## 任务：创建订阅管理前端页面

### 背景
用户需要查看和管理订阅，查看用量统计。

### 要求

1. **Subscription.vue** - 订阅管理主页
   - 当前订阅状态卡片
   - 套餐选择区域
   - 用量统计图表
   - 管理订阅按钮（取消、升级、账单历史）

2. **PricingCard.vue** - 套餐卡片
   - 套餐名称和价格
   - 功能列表
   - "选择套餐" 或 "当前套餐" 按钮
   - 点击后跳转到 Stripe Checkout

3. **CurrentPlan.vue** - 当前订阅信息
   - 套餐名称
   - 订阅状态（active/canceled/past_due）
   - 下次续费日期
   - "管理订阅" 按钮（跳转到 Stripe Portal）
   - "取消订阅" 按钮

4. **UsageChart.vue** - 用量图表
   - 使用 ECharts 或 Chart.js
   - 显示各类资源用量
   - 进度条显示配额使用百分比
   - 超额提示

5. **subscription.api.ts** - API 客户端
   - `getSubscription()` - 获取订阅
   - `createCheckout(priceId)` - 创建支付
   - `createPortal()` - 打开客户门户
   - `cancelSubscription()` - 取消订阅
   - `getUsage(period)` - 获取用量

6. **subscription.ts** - Pinia Store
   - `subscription` - 订阅信息
   - `usage` - 用量数据
   - `fetchSubscription()` - 获取订阅
   - `checkout(priceId)` - 发起支付
   - `cancel()` - 取消订阅

### 设计要求
- 清晰的套餐对比
- 实时用量显示
- 友好的支付流程
- 响应式设计

### 验证
- 订阅流程完整
- 用量统计正确显示
- 支付跳转正常
```

---

## Task 8: 权限控制与功能限制

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

根据订阅套餐限制功能访问，实现权限控制中间件。

### Files

- Create: `src/server/middleware/feature-gate.ts`
- Create: `src/server/services/feature.service.ts`
- Create: `src/client/composables/useFeatureGate.ts`

### Prompt for Subagent

```
## 任务：实现功能权限控制

### 背景
不同订阅套餐有不同的功能权限，需要实现权限控制。

### 要求

1. **feature.service.ts** - 功能权限服务
   ```typescript
   const PLAN_FEATURES = {
     free: ['basic_chat', 'community_browse'],
     pro: ['basic_chat', 'community_browse', 'character_share', 'advanced_models'],
     team: ['all_features']
   };

   export class FeatureService {
     hasFeature(plan: string, feature: string): boolean;
     checkQuota(tenantId: string, resource: string): Promise<boolean>;
   }
   ```

2. **feature-gate.ts** - 权限中间件
   ```typescript
   export const requireFeature = (feature: string) => {
     return async (c, next) => {
       const tenant = c.get('tenant');
       const hasAccess = await featureService.hasFeature(tenant.plan, feature);

       if (!hasAccess) {
         return c.json({ error: 'Upgrade required' }, 403);
       }

       await next();
     };
   };

   export const requireQuota = (resource: string) => {
     return async (c, next) => {
       const tenantId = c.get('tenantId');
       const hasQuota = await featureService.checkQuota(tenantId, resource);

       if (!hasQuota) {
         return c.json({ error: 'Quota exceeded' }, 429);
       }

       await next();
     };
   };
   ```

3. **useFeatureGate.ts** - 前端权限 Composable
   ```typescript
   export function useFeatureGate() {
     const subscriptionStore = useSubscriptionStore();

     const hasFeature = (feature: string) => {
       const plan = subscriptionStore.subscription?.plan;
       return PLAN_FEATURES[plan]?.includes(feature);
     };

     const hasQuota = (resource: string) => {
       const usage = subscriptionStore.usage[resource];
       const limit = PLAN_LIMITS[plan][resource];
       return usage < limit;
     };

     return { hasFeature, hasQuota };
   }
   ```

4. **应用权限控制**
   - 在需要权限的路由上添加中间件
   - 前端根据权限显示/隐藏功能
   - 显示升级提示

### 验证
- 权限控制正确
- 配额限制生效
- 升级提示友好
```

---

## Task 9: 测试与文档

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

编写测试用例和使用文档。

### Files

- Create: `src/server/services/__tests__/subscription.service.spec.ts`
- Create: `src/server/webhooks/__tests__/stripe.webhook.spec.ts`
- Create: `docs/subscription-guide.md`

### Prompt for Subagent

```
## 任务：编写测试和文档

### 要求

1. **subscription.service.spec.ts** - 订阅服务测试
   - 测试创建订阅
   - 测试取消订阅
   - 测试升级订阅
   - 测试状态同步
   - Mock Stripe API

2. **stripe.webhook.spec.ts** - Webhook 测试
   - 测试各种事件处理
   - 测试签名验证
   - 测试幂等性
   - Mock Stripe events

3. **subscription-guide.md** - 使用文档
   - Stripe 配置指南
   - 订阅流程说明
   - Webhook 设置
   - 测试指南
   - 常见问题

### 验证
- 所有测试通过
- 文档清晰完整
```

---

## Task 10: 集成测试与部署准备

**复杂度:** 中等
**推荐模型:** Claude Sonnet

### Context

端到端测试和生产环境准备。

### Files

- Create: `docs/deployment/stripe-setup.md`
- Modify: `.env.example`
- Modify: `README.md`

### Prompt for Subagent

```
## 任务：集成测试与部署准备

### 要求

1. **端到端测试**
   - 完整订阅流程测试
   - Webhook 接收测试
   - 用量追踪测试
   - 权限控制测试

2. **Stripe 生产配置**
   - 创建产品和价格
   - 配置 Webhook 端点
   - 设置客户门户
   - 配置邮件通知

3. **部署文档** (stripe-setup.md)
   - Stripe 账号设置
   - 产品配置步骤
   - Webhook 配置
   - 环境变量说明
   - 测试清单

4. **更新 README**
   - 添加订阅功能说明
   - 环境变量文档
   - 部署注意事项

### 验证
- 端到端流程正常
- 文档完整准确
- 生产环境就绪
```

---

## 验证清单

完成所有任务后，验证以下功能：

- [ ] 数据库迁移成功
- [ ] Stripe 集成正常
- [ ] 可以创建订阅
- [ ] 支付流程完整
- [ ] Webhook 正确处理
- [ ] 订阅状态同步
- [ ] 用量追踪准确
- [ ] 配额限制生效
- [ ] 前端订阅页面正常
- [ ] 用量图表显示
- [ ] 权限控制正确
- [ ] 测试全部通过

---

## 模型分配总结

| Task | 复杂度 | 推荐模型 | 预计时间 |
|------|--------|----------|----------|
| Task 1: 数据库 Schema | 中 | Sonnet | 30-45min |
| Task 2: Stripe 集成 | 高 | Opus | 60-90min |
| Task 3: 订阅服务 | 高 | Opus | 60-90min |
| Task 4: Webhook 处理 | 高 | Opus | 60-90min |
| Task 5: API 路由 | 中 | Sonnet | 45-60min |
| Task 6: 用量追踪 | 中 | Sonnet | 45-60min |
| Task 7: 前端页面 | 高 | Opus | 90-120min |
| Task 8: 权限控制 | 中 | Sonnet | 45-60min |
| Task 9: 测试文档 | 中 | Sonnet | 45-60min |
| Task 10: 集成部署 | 中 | Sonnet | 45-60min |

**总预计时间: 8-12 小时**

---

## 执行顺序

```
Task 1 (Schema) ──> Task 2 (Stripe) ──┬──> Task 3 (订阅服务) ──> Task 4 (Webhook)
                                       │
                                       └──> Task 6 (用量追踪)

Task 3, 4, 6 ──> Task 5 (API 路由) ──> Task 7 (前端) ──> Task 8 (权限)

Task 8 ──> Task 9 (测试) ──> Task 10 (部署)
```

**并行执行建议:**
- Task 2 和 Task 6 可以并行
- Task 3 和 Task 4 完成后，Task 5 和 Task 7 可以并行

---

## 注意事项

1. **Stripe 测试模式**
   - 开发阶段使用测试 API keys
   - 使用测试卡号: 4242 4242 4242 4242

2. **Webhook 本地测试**
   - 使用 Stripe CLI: `stripe listen --forward-to localhost:3000/webhooks/stripe`
   - 获取 webhook signing secret

3. **安全性**
   - 验证 Webhook 签名
   - 不要在前端暴露 Secret Key
   - 使用 HTTPS（生产环境）

4. **幂等性**
   - Webhook 可能重复发送
   - 使用事件 ID 去重

5. **错误处理**
   - 支付失败处理
   - 订阅过期处理
   - 用量超限处理
