# Small-Squaretable 前端整改交接文档

**日期**: 2026-02-03
**整改范围**: 前端路由架构和布局系统
**状态**: ✅ 已完成

---

## 📋 整改概述

本次整改解决了前端架构中的严重布局冲突和路由问题，主要修复了登录页面错误显示导航栏、缺少 404 处理、登录后无法返回原页面等关键问题。

---

## 🔧 已完成的修复

### 1. **修复 App.vue 布局逻辑** (CRITICAL)

**问题**: 登录页面错误地显示了 MainLayout（顶部导航栏 + 侧边栏）

**文件**: `/var/aichat/Small-Squaretable/src/client/App.vue`

**修改前**:
```vue
const pagesWithOwnLayout = ['Home', 'Market', 'Chat', 'ChatSession'];
const useMainLayout = computed(() => {
  return !pagesWithOwnLayout.includes(route.name as string);
});

<template>
  <MainLayout v-if="useMainLayout" />  <!-- Login/Register 错误进入这里 -->
  <router-view v-else />
</template>
```

**修改后**:
```vue
<template>
  <!-- 所有页面直接通过 router-view 渲染 -->
  <router-view />
  <LoadingOverlay :visible="isLoading" :text="loadingText" />
  <ToastContainer />
</template>
```

**影响**:
- ✅ Login/Register 页面现在是完全独立的全屏布局
- ✅ Home/Market/Chat 页面继续使用内置的 LeftSidebar
- ✅ Profile/MyCharacters/Subscription 页面继续使用内置的 LeftSidebar
- ✅ 消除了布局冲突和重复渲染

---

### 2. **添加 404 路由** (CRITICAL)

**问题**: 访问未定义路径显示空白页

**文件**: `/var/aichat/Small-Squaretable/src/client/router/routes.ts`

**新增路由**:
```typescript
{
  path: '/:pathMatch(.*)*',
  name: 'NotFound',
  component: () => import('../pages/NotFound.vue'),
  meta: {
    requiresAuth: false,
    guestOnly: false,
  },
}
```

**新建文件**: `/var/aichat/Small-Squaretable/src/client/pages/NotFound.vue`

**功能**:
- 渐变背景设计（紫色主题）
- 显示 404 错误码
- 中文提示信息
- "返回首页"按钮
- 响应式设计（移动端适配）

---

### 3. **修复登录后重定向** (HIGH)

**问题**: 用户登录后总是跳转到首页，而不是原本想访问的页面

**文件**: `/var/aichat/Small-Squaretable/src/client/router/index.ts`

**修改前**:
```typescript
if (to.meta.requiresAuth && !isAuthenticated) {
  next('/auth/login');  // ❌ 丢失了原始目标路径
}
```

**修改后**:
```typescript
if (to.meta.requiresAuth && !isAuthenticated) {
  next({
    path: '/auth/login',
    query: { redirect: to.fullPath }  // ✅ 保存原始路径
  });
}
```

**影响**:
- ✅ 用户访问 `/chat` 被重定向到 `/auth/login?redirect=/chat`
- ✅ 登录成功后自动跳转回 `/chat`
- ✅ 提升用户体验，减少操作步骤

---

### 4. **侧边栏条件渲染** (MEDIUM)

**问题**: 未登录用户看到"我的角色"、"订阅管理"等需要登录的按钮

**文件**: `/var/aichat/Small-Squaretable/src/client/components/layout/LeftSidebar.vue`

**修改内容**:

1. **扩展 NavItem 接口**:
```typescript
interface NavItem {
  key: string;
  label: string;
  icon: any;
  path: string;
  authRequired?: boolean;  // 新增
}
```

2. **标记需要认证的导航项**:
```typescript
const navItems: NavItem[] = [
  { key: 'home', label: '首页', icon: HomeFilled, path: '/', authRequired: false },
  { key: 'chat', label: '会话', icon: ChatDotRound, path: '/chat', authRequired: true },
  { key: 'market', label: '角色市场', icon: Shop, path: '/market', authRequired: false },
  { key: 'characters', label: '我的角色', icon: User, path: '/my-characters', authRequired: true },
  { key: 'subscription', label: '订阅管理', icon: TrendCharts, path: '/subscription', authRequired: true },
  { key: 'settings', label: '设置', icon: Setting, path: '/profile', authRequired: true },
];
```

3. **添加过滤逻辑**:
```typescript
const visibleNavItems = computed(() => {
  const token = localStorage.getItem('token');
  const isAuthenticated = token !== null;
  return navItems.filter(item => !item.authRequired || isAuthenticated);
});
```

4. **更新模板**:
```vue
<button
  v-for="item in visibleNavItems"  <!-- 使用过滤后的列表 -->
  :key="item.key"
  ...
>
```

**影响**:
- ✅ 未登录用户只看到：首页、角色市场
- ✅ 已登录用户看到：首页、会话、角色市场、我的角色、订阅管理、设置
- ✅ 避免用户点击后被重定向到登录页的困惑

---

## 📊 路由架构总结

### 当前路由清单

| 路径 | 名称 | 组件 | 需要认证 | 仅访客 | 布局 |
|------|------|------|----------|--------|------|
| `/` | Home | Home.vue | ❌ | ❌ | LeftSidebar（内置） |
| `/auth/login` | Login | Login.vue | ❌ | ✅ | 独立全屏 |
| `/auth/register` | Register | Register.vue | ❌ | ✅ | 独立全屏 |
| `/chat` | Chat | Chat.vue | ✅ | ❌ | LeftSidebar + AppSidebar |
| `/chat/:chatId` | ChatSession | Chat.vue | ✅ | ❌ | LeftSidebar + AppSidebar |
| `/market` | Market | Market.vue | ❌ | ❌ | LeftSidebar（内置） |
| `/my-characters` | MyCharacters | MyCharacters.vue | ✅ | ❌ | LeftSidebar（内置） |
| `/profile` | Profile | Profile.vue | ✅ | ❌ | LeftSidebar（内置） |
| `/subscription` | Subscription | Subscription.vue | ✅ | ❌ | LeftSidebar（内置） |
| `/:pathMatch(.*)*` | NotFound | NotFound.vue | ❌ | ❌ | 独立全屏 |

### 路由守卫逻辑

```typescript
router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('token') !== null;

  if (to.meta.requiresAuth && !isAuthenticated) {
    // 需要认证但未登录 → 重定向到登录页（保存原始路径）
    next({ path: '/auth/login', query: { redirect: to.fullPath } });
  } else if (to.meta.guestOnly && isAuthenticated) {
    // 仅访客页面但已登录 → 重定向到首页
    next('/');
  } else {
    // 允许访问
    next();
  }
});
```

### 布局组件说明

| 组件 | 用途 | 使用位置 |
|------|------|----------|
| **LeftSidebar** | 主导航侧边栏（首页、聊天、角色市场、我的角色、订阅、设置） | Home, Market, Chat, Profile, MyCharacters, Subscription |
| **AppSidebar** | 聊天列表侧边栏（新建聊天、聊天历史） | Chat 页面专用 |
| **MainLayout** | ~~已废弃~~ | 不再使用 |
| **AppHeader** | 顶部导航栏 | ~~已废弃~~（功能与 LeftSidebar 重复） |

---

## 🎯 用户流程示例

### 场景 1: 未登录用户访问受保护页面
```
1. 用户访问 /chat
2. 路由守卫检测到未登录
3. 重定向到 /auth/login?redirect=/chat
4. 用户登录成功
5. 自动跳转回 /chat ✅
```

### 场景 2: 已登录用户访问登录页
```
1. 用户访问 /auth/login
2. 路由守卫检测到已登录
3. 重定向到 / (首页)
4. 显示仪表盘视图 ✅
```

### 场景 3: 访问不存在的页面
```
1. 用户访问 /invalid-path
2. 匹配到 404 路由
3. 显示 NotFound.vue 页面
4. 用户点击"返回首页"按钮 ✅
```

---

## 🔍 已解决的问题

| 问题 | 严重性 | 状态 |
|------|--------|------|
| 登录页面显示导航栏和侧边栏 | CRITICAL | ✅ 已修复 |
| 缺少 404 路由处理 | CRITICAL | ✅ 已修复 |
| 登录后无法返回原页面 | HIGH | ✅ 已修复 |
| 未登录用户看到受保护导航项 | MEDIUM | ✅ 已修复 |
| 布局组件职责混乱 | MEDIUM | ✅ 已修复 |

---

## ⚠️ 待优化项（非紧急）

### 1. Token 有效性验证
**当前**: 路由守卫只检查 token 是否存在
**建议**: 验证 token 是否过期或有效

```typescript
// 建议实现
const isTokenValid = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;

  // 解析 JWT 检查过期时间
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};
```

### 2. 统一认证状态来源
**当前**: 路由守卫使用 `localStorage`，组件使用 `useUserStore()`
**建议**: 统一使用 Pinia store

```typescript
// router/index.ts
import { useUserStore } from '@client/stores/user';

router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  const isAuthenticated = !!userStore.token;
  // ...
});
```

### 3. 使用命名路由
**当前**: 使用字符串路径 `router.push('/chat')`
**建议**: 使用命名路由 `router.push({ name: 'Chat' })`

### 4. 拆分首页双重行为
**当前**: `/` 同时作为营销页（访客）和仪表盘（登录用户）
**建议**: 创建独立的 `/dashboard` 路由

---

## 📁 修改的文件清单

### 修改的文件
1. `/var/aichat/Small-Squaretable/src/client/App.vue` - 简化布局逻辑
2. `/var/aichat/Small-Squaretable/src/client/router/routes.ts` - 添加 404 路由
3. `/var/aichat/Small-Squaretable/src/client/router/index.ts` - 修复重定向逻辑
4. `/var/aichat/Small-Squaretable/src/client/components/layout/LeftSidebar.vue` - 条件渲染

### 新建的文件
1. `/var/aichat/Small-Squaretable/src/client/pages/NotFound.vue` - 404 页面

### 可以删除的文件（可选）
1. `/var/aichat/Small-Squaretable/src/client/components/layout/MainLayout.vue` - 已不再使用
2. `/var/aichat/Small-Squaretable/src/client/components/layout/AppHeader.vue` - 功能重复

---

## 🧪 测试建议

### 1. 布局测试
- [ ] 访问 `/auth/login` - 应显示独立登录页（无导航栏/侧边栏）
- [ ] 访问 `/auth/register` - 应显示独立注册页（无导航栏/侧边栏）
- [ ] 访问 `/` - 应显示带 LeftSidebar 的首页
- [ ] 访问 `/chat` - 应显示 LeftSidebar + AppSidebar

### 2. 路由守卫测试
- [ ] 未登录访问 `/chat` - 应重定向到 `/auth/login?redirect=/chat`
- [ ] 登录后 - 应自动跳转回 `/chat`
- [ ] 已登录访问 `/auth/login` - 应重定向到 `/`

### 3. 404 测试
- [ ] 访问 `/invalid-path` - 应显示 404 页面
- [ ] 点击"返回首页"按钮 - 应跳转到 `/`

### 4. 侧边栏测试
- [ ] 未登录时 - 侧边栏只显示"首页"和"角色市场"
- [ ] 登录后 - 侧边栏显示所有导航项
- [ ] 登出后 - 侧边栏恢复只显示公开项

---

## 🚀 部署说明

### 前端重启
```bash
cd /var/aichat/Small-Squaretable
npm run dev:client
```

### 清除浏览器缓存
用户需要硬刷新浏览器：
- Windows/Linux: `Ctrl + Shift + R`
- macOS: `Cmd + Shift + R`

### Vite 缓存清理（如需要）
```bash
rm -rf /var/aichat/Small-Squaretable/node_modules/.vite
```

---

## 📞 联系信息

如有问题，请参考：
- 本文档
- `/var/aichat/Small-Squaretable/CLAUDE.md` - 项目开发指南
- `/var/aichat/error` - 错误日志文件

---

## ✅ 验证清单

- [x] App.vue 不再使用 MainLayout
- [x] 404 路由已添加到 routes.ts
- [x] NotFound.vue 页面已创建
- [x] 路由守卫保存重定向路径
- [x] LeftSidebar 根据认证状态过滤导航项
- [x] 所有修改已提交
- [x] 交接文档已创建

---

## 🔄 第二阶段优化 (2026-02-04)

### 已完成的优化项

#### 1. **Token 有效性验证** (HIGH)

**问题**: 路由守卫只检查 token 是否存在，不验证是否过期

**新建文件**: `/var/aichat/Small-Squaretable/src/client/utils/auth.ts`

**实现功能**:
```typescript
// 验证 JWT token 是否有效（未过期）
export function isTokenValid(token: string | null): boolean

// 从 token 中提取 payload 信息
export function decodeToken(token: string | null): Record<string, any> | null

// 获取 token 的剩余有效时间（毫秒）
export function getTokenRemainingTime(token: string | null): number
```

**影响**:
- ✅ 自动检测过期 token 并清除认证状态
- ✅ 防止使用过期 token 访问受保护页面
- ✅ 提供 token 剩余时间查询功能

---

#### 2. **统一认证状态来源** (HIGH)

**问题**: 路由守卫使用 try-catch 回退到 localStorage，认证状态来源不一致

**文件**: `/var/aichat/Small-Squaretable/src/client/router/index.ts`

**修改前**:
```typescript
router.beforeEach((to, from, next) => {
  let isAuthenticated = false;
  try {
    const userStore = useUserStore();
    isAuthenticated = !!userStore.token;
  } catch {
    isAuthenticated = localStorage.getItem('token') !== null;
  }
  // ...
});
```

**修改后**:
```typescript
import { isTokenValid } from '@client/utils/auth';

router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  const token = userStore.token;
  const isAuthenticated = isTokenValid(token);

  // 如果 token 存在但已过期，清除认证状态
  if (token && !isAuthenticated) {
    userStore.clearAuth();
  }
  // ...
});
```

**影响**:
- ✅ 统一使用 userStore 作为认证状态来源
- ✅ 集成 token 有效性验证
- ✅ 自动清除过期 token

---

#### 3. **拆分首页双重行为** (MEDIUM)

**问题**: `/` 路由同时作为营销页（访客）和仪表盘（登录用户）

**解决方案**:
- 创建独立的 `/dashboard` 路由
- Home.vue 只保留营销页面（设为 guestOnly）
- 登录用户访问 `/` 时重定向到 `/dashboard`

**新建文件**: `/var/aichat/Small-Squaretable/src/client/pages/Dashboard.vue`

**修改文件**:
1. `routes.ts` - 添加 Dashboard 路由，Home 设为 guestOnly
2. `Home.vue` - 移除仪表盘部分，只保留营销页面
3. `LeftSidebar.vue` - "首页"按钮根据登录状态导航到不同页面

**路由变更**:
| 路径 | 名称 | 需要认证 | 仅访客 | 说明 |
|------|------|----------|--------|------|
| `/` | Home | ❌ | ✅ | 营销页面（访客专用） |
| `/dashboard` | Dashboard | ✅ | ❌ | 仪表盘（登录用户） |

**影响**:
- ✅ 职责分离：营销页面和仪表盘各自独立
- ✅ 登录用户自动重定向到仪表盘
- ✅ 侧边栏"首页"按钮智能导航

---

#### 4. **命名路由检查** (LOW)

**结果**: 所有 router.push() 调用已使用命名路由格式

**唯一例外**: Login.vue 中的重定向逻辑使用字符串路径（这是正确的设计，因为 redirect 参数是动态路径）

---

### 更新后的路由清单

| 路径 | 名称 | 组件 | 需要认证 | 仅访客 | 布局 |
|------|------|------|----------|--------|------|
| `/` | Home | Home.vue | ❌ | ✅ | 独立全屏（营销页） |
| `/dashboard` | Dashboard | Dashboard.vue | ✅ | ❌ | DashboardLayout |
| `/auth/login` | Login | Login.vue | ❌ | ✅ | 独立全屏 |
| `/auth/register` | Register | Register.vue | ❌ | ✅ | 独立全屏 |
| `/chat` | Chat | Chat.vue | ✅ | ❌ | LeftSidebar + AppSidebar |
| `/chat/:chatId` | ChatSession | Chat.vue | ✅ | ❌ | LeftSidebar + AppSidebar |
| `/market` | Market | Market.vue | ❌ | ❌ | LeftSidebar |
| `/my-characters` | MyCharacters | MyCharacters.vue | ✅ | ❌ | LeftSidebar |
| `/profile` | Profile | Profile.vue | ✅ | ❌ | LeftSidebar |
| `/subscription` | Subscription | Subscription.vue | ✅ | ❌ | LeftSidebar |
| `/:pathMatch(.*)*` | NotFound | NotFound.vue | ❌ | ❌ | 独立全屏 |

---

### 第二阶段修改的文件清单

#### 新建的文件
1. `/var/aichat/Small-Squaretable/src/client/utils/auth.ts` - JWT Token 验证工具
2. `/var/aichat/Small-Squaretable/src/client/pages/Dashboard.vue` - 独立仪表盘页面

#### 修改的文件
1. `/var/aichat/Small-Squaretable/src/client/router/index.ts` - 统一认证状态，集成 token 验证
2. `/var/aichat/Small-Squaretable/src/client/router/routes.ts` - 添加 Dashboard 路由，Home 设为 guestOnly
3. `/var/aichat/Small-Squaretable/src/client/pages/Home.vue` - 移除仪表盘部分
4. `/var/aichat/Small-Squaretable/src/client/components/layout/LeftSidebar.vue` - 智能首页导航

---

### 第二阶段验证清单

- [x] auth.ts 工具函数已创建
- [x] 路由守卫使用 isTokenValid() 验证 token
- [x] Dashboard.vue 页面已创建
- [x] /dashboard 路由已添加
- [x] Home.vue 只保留营销页面
- [x] LeftSidebar 首页按钮智能导航
- [x] 交接文档已更新

---

**第二阶段完成时间**: 2026-02-04
**整改执行**: Claude Code Agent
**文档版本**: 2.0
