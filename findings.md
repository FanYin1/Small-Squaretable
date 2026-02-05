# Phase 5 研究发现 (Findings)

**项目**: Small Squaretable - Phase 5 前端开发
**开始时间**: 2026-02-02
**最后更新**: 2026-02-02

---

## 📋 索引

- [项目结构](#项目结构)
- [已实现功能](#已实现功能)
- [已知问题](#已知问题)
- [技术债务](#技术债务)
- [优化机会](#优化机会)

---

## 项目结构

### 前端目录结构
```
src/client/
├── components/
│   ├── layout/
│   │   ├── AppHeader.vue          # 顶部导航
│   │   ├── AppSidebar.vue         # 侧边栏
│   │   ├── MainLayout.vue         # 主布局
│   │   └── LeftSidebar.vue        # 左侧导航栏 (新增)
│   ├── character/
│   │   ├── CharacterCard.vue      # 角色卡片
│   │   ├── CharacterDetail.vue    # 角色详情
│   │   └── CharacterPublishForm.vue
│   ├── chat/
│   │   ├── ChatWindow.vue
│   │   ├── ChatSidebar.vue
│   │   ├── MessageBubble.vue
│   │   └── MessageInput.vue
│   ├── market/
│   │   ├── SearchCombo.vue        # 搜索框组合 (新增)
│   │   ├── FilterToolbar.vue      # 筛选工具栏 (新增)
│   │   └── EmptyState.vue         # 空状态页面 (新增)
│   ├── subscription/
│   │   ├── PricingCard.vue
│   │   ├── UsageDashboard.vue
│   │   └── UpgradePrompt.vue
│   ├── profile/
│   │   ├── ProfileForm.vue
│   │   └── AvatarUpload.vue
│   ├── rating/
│   │   └── RatingComponent.vue
│   └── ui/
│       ├── ErrorBoundary.vue
│       └── LoadingOverlay.vue
├── pages/
│   ├── auth/
│   │   ├── Login.vue              # 登录页
│   │   └── Register.vue           # 注册页
│   ├── Home.vue                   # 首页
│   ├── Market.vue                 # 角色市场 (重写)
│   ├── Chat.vue                   # 聊天页
│   ├── Profile.vue                # 个人中心
│   ├── MyCharacters.vue           # 我的角色
│   └── Subscription.vue           # 订阅管理
├── router/
│   ├── index.ts
│   └── routes.ts
├── stores/
│   ├── user.ts
│   ├── ui.ts
│   ├── chat.ts
│   └── character.ts
└── services/
    ├── auth.ts
    ├── user.ts
    ├── character.ts
    ├── chat.ts
    └── subscription.ts
```

---

## 已实现功能

### 认证系统
- ✅ 用户注册（自动创建租户）
- ✅ 用户登录（JWT 双 token）
- ✅ 自动 token 刷新
- ✅ 登出清理
- ✅ 路由重定向
- ✅ 认证状态持久化

### 角色市场
- ✅ 三段式控制台布局
- ✅ 左侧导航栏（64px → 240px 展开）
- ✅ 搜索框组合（搜索 + 新建聊天）
- ✅ 筛选工具栏（分类、标签、NSFW、排序）
- ✅ 空状态页面（SVG 插画）
- ✅ 蓝色系配色方案
- ✅ 响应式设计（桌面/平板/移动端）

### 路由配置
```typescript
{
  path: '/',
  component: MainLayout,
  children: [
    { path: '', component: Home },
    { path: 'login', redirect: '/auth/login' },
    { path: 'register', redirect: '/auth/register' },
    { path: 'market', component: Market },
    { path: 'chat', component: Chat },
    { path: 'profile', component: Profile },
    { path: 'subscription', component: Subscription },
  ]
}
```

---

## 已知问题

### 非阻塞问题

1. **PostgreSQL 全文搜索警告**
   - 症状: 搜索 `*` 时出现警告
   - 影响: 不影响功能，仅日志噪音
   - 优先级: P2

2. **TypeScript 类型警告**
   - 位置: `src/server/index.ts:107`
   - 内容: `@ts-expect-error` 类型不匹配
   - 影响: 不影响运行
   - 优先级: P3

### 待验证问题

1. **认证系统未测试**
   - 状态: 功能已实现，待测试验证
   - 优先级: P0

2. **WebSocket 连接未测试**
   - 状态: WebSocket 服务器已配置，前端未测试
   - 优先级: P1

3. **角色搜索后端集成未验证**
   - 状态: UI 已实现，后端 API 未测试
   - 优先级: P1

---

## 技术债务

### 中优先级

1. **错误处理统一化**
   - 当前: 各组件独立处理错误
   - 建议: 统一错误处理服务

2. **加载状态管理**
   - 当前: 各组件独立管理加载状态
   - 建议: 全局加载状态管理

3. **表单验证**
   - 当前: 基础验证
   - 建议: 统一验证规则库

### 低优先级

1. **国际化 (i18n)**
   - 当前: 仅中文
   - 建议: 添加多语言支持

2. **主题切换**
   - 当前: 固定主题
   - 建议: 深色模式支持

---

## 优化机会

### 性能优化

1. **代码分割**
   - 按路由懒加载组件
   - 预计收益: 首屏加载时间减少 30%

2. **图片优化**
   - 角色头像懒加载
   - WebP 格式支持
   - 预计收益: 图片加载时间减少 40%

3. **API 请求缓存**
   - 角色列表缓存
   - 静态数据缓存
   - 预计收益: API 请求减少 50%

### 用户体验优化

1. **骨架屏加载**
   - 角色列表加载骨架屏
   - 聊天列表加载骨架屏

2. **无限滚动**
   - 角色列表无限滚动
   - 替代分页器

3. **快捷键支持**
   - Ctrl+K 快速搜索
   - Esc 关闭弹窗

---

## 配色方案

### 蓝色系主色调
```css
--primary: #3B82F6;      /* 主蓝色 */
--primary-hover: #2563EB;
--primary-light: #93C5FD;
--primary-dark: #1D4ED8;

--success: #10B981;      /* 成功绿 */
--warning: #F59E0B;      /* 警告黄 */
--danger: #EF4444;       /* 危险红 */

--bg: #F9FAFB;           /* 浅灰背景 */
--surface: #FFFFFF;       /* 白色表面 */
--border: #E5E7EB;        /* 边框色 */

--text-primary: #111827;  /* 主文本 */
--text-secondary: #6B7280; /* 次文本 */

--nav-bg: #1F2937;       /* 导航背景 */
--nav-hover: #374151;     /* 导航悬停 */
```

---

## API 端点映射

### 认证 API
```
POST /api/v1/auth/register   # 注册
POST /api/v1/auth/login      # 登录
POST /api/v1/auth/logout     # 登出
GET  /api/v1/auth/me         # 当前用户
POST /api/v1/auth/refresh    # 刷新 token
```

### 角色 API
```
GET    /api/v1/characters           # 角色列表
GET    /api/v1/characters/:id       # 角色详情
POST   /api/v1/characters           # 创建角色
PATCH  /api/v1/characters/:id       # 更新角色
DELETE /api/v1/characters/:id       # 删除角色
GET    /api/v1/characters/search    # 搜索角色
GET    /api/v1/characters/marketplace # 市场角色
POST   /api/v1/characters/:id/publish  # 发布
POST   /api/v1/characters/:id/unpublish # 下架
POST   /api/v1/characters/:id/fork      # 复制
```

### 聊天 API
```
POST   /api/v1/chats              # 创建聊天
GET    /api/v1/chats              # 聊天列表
GET    /api/v1/chats/:id          # 聊天详情
PATCH  /api/v1/chats/:id          # 更新聊天
DELETE /api/v1/chats/:id          # 删除聊天
POST   /api/v1/chats/:id/messages # 发送消息
GET    /api/v1/chats/:id/messages # 获取消息
```

### 订阅 API
```
GET  /api/v1/subscriptions/plans    # 订阅计划
GET  /api/v1/subscriptions/current  # 当前订阅
POST /api/v1/subscriptions/checkout  # 创建结账会话
POST /api/v1/subscriptions/portal   # 客户门户
POST /api/v1/subscriptions/cancel   # 取消订阅
```

---

## 服务端口映射

```
后端服务:  http://localhost:3000
前端服务:  http://localhost:5175
PostgreSQL: localhost:5432
Redis:      localhost:6379
WebSocket:  ws://localhost:3000/ws
```

---

**最后更新**: 2026-02-02
**下次更新**: 每次发现新信息后
