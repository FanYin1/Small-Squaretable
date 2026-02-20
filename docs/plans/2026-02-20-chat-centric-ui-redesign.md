# Chat-Centric UI Redesign — 设计文档

> **项目**: Small-Squaretable
> **日期**: 2026-02-20
> **状态**: 已确认，待实施
> **目标**: 将应用从 Dashboard 中心重构为聊天中心 (类似 Claude/ChatGPT)，同时保留角色扮演平台的角色存在感

---

## 设计决策摘要

| 决策项 | 选择 |
|--------|------|
| 改造范围 | 全面重构：聊天即首页 |
| 消息风格 | 混合风格：Claude 底 + 角色增强 |
| 新建对话 | 内联欢迎页（角色选择卡片） |
| 功能入口 | 侧边栏底部图标 |

---

## 1. 整体布局

### 1.1 桌面端 (≥768px)

```
┌───────────────────────┬────────────────────────────────────────┐
│ [+ New Chat]          │  Luna  😊 happy    [Memory] [Debug]   │
│ [🔍 Search...]        ├────────────────────────────────────────┤
│                       │         (max-width: 900px)             │
│ Today                 │                                        │
│ > Chat with Luna  ●   │  ┌──┐ Luna          😊 happy          │
│ > Chat with Aria      │  │🎭│ Hello! I remember you like       │
│                       │  └──┘ quantum physics...               │
│ Yesterday             │       ```python                        │
│ > Chat with Rex       │       def quantum_gate(qubit):         │
│                       │           return hadamard(qubit)       │
│                       │       ```                              │
│                       │       [Copy] [Regenerate]    12:34 PM  │
│                       │  ─────────────────────────────────     │
│                       │                            You         │
│                       │       Can you explain more about       │
│                       │       entanglement?                    │
│                       │                      [Edit]  12:35 PM  │
│                       │  ─────────────────────────────────     │
│ ───────────────────── │                                        │
│ [🏪] [🎭] [⚙️] [👤]   │  ┌────────────────────────────────┐   │
│                       │  │ 📎  Message...          [Send] │   │
│                       │  └────────────────────────────────┘   │
│                       │  Shift+Enter for new line              │
└───────────────────────┴────────────────────────────────────────┘
 ~280px                   flex-1
```

### 1.2 移动端 (<768px)

```
┌──────────────────────────────┐
│ [☰]  Luna  😊    [⋮]        │
├──────────────────────────────┤
│                              │
│  ┌──┐ Luna       😊 happy   │
│  │🎭│ Hello! I remember...   │
│  └──┘                        │
│       ```python              │
│       def quantum_gate():    │
│       ```                    │
│  ────────────────────────    │
│                       You    │
│  Can you explain more?       │
│  ────────────────────────    │
│                              │
│ ┌──────────────────────────┐ │
│ │ 📎 Message...     [Send] │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ [💬Chat] [🏪Market] [🎭Chars] [⚙️] │
└──────────────────────────────┘
```

- 侧边栏: 抽屉式覆盖层 (左滑打开)
- 底部: 固定 tab bar 替代侧边栏底部图标
- 消息操作: 长按触发 (替代 hover)

### 1.3 路由变化

| 变更 | Before | After |
|------|--------|-------|
| 登录后默认 | `/dashboard` | `/chat` |
| Dashboard | 独立页面 | 去掉 (推荐移入欢迎页) |
| 主布局 | `DashboardLayout` | 新建 `ChatLayout` |
| 导航 | `LeftSidebar` 多级菜单 | 对话列表 + 底部图标 |

保留的独立路由: `/market`, `/my-characters`, `/settings`, `/admin/*`, `/profile`, `/subscription`, `/plugins`, `/analytics`, `/developer`

---

## 2. 消息渲染

### 2.1 助手消息 (角色消息)

- 头像 (36px 圆形) + 角色名 + 情感标签 (emoji + 文字)
- 全宽内容区，完整 Markdown 渲染:
  - **代码块**: highlight.js 语法高亮 + 复制按钮 + 语言标签
  - **数学公式**: KaTeX (行内 `$...$` + 块级 `$$...$$`)
  - **表格/列表/引用**: 样式化渲染
  - **图片**: 内联显示 + 点击放大
- hover 显示: [Copy] [Regenerate] + 时间戳
- 背景: 无 (或极浅灰 light: `#fafafa` / dark: `#1a1a1a`)

### 2.2 用户消息

- 右侧 "You" 标签 (无头像)
- 全宽文本 `white-space: pre-wrap`
- hover 显示: [Edit] + 时间戳
- 背景: 略深灰 (light: `#f5f5f5` / dark: `#222`)

### 2.3 分隔与动画

- 消息间: 1px 细线 (light: `#e5e5e5` / dark: `#333`)
- 流式输出: 竖线光标闪烁动画
- 新消息: fade-in 动画

### 2.4 技术栈

- `marked` (已有) + `DOMPurify` (已有)
- 新增: `highlight.js` (代码高亮)
- 新增: `katex` (数学公式)
- 后续: `mermaid` (流程图)

---

## 3. 欢迎页 (新建对话)

点击 [+ New Chat] 或无对话选中时，主区域显示:

```
┌────────────────────────────────────────────┐
│                                            │
│        Start a new conversation            │
│        Choose a character to chat with     │
│                                            │
│        [🔍 Search characters...     ]      │
│                                            │
│        Recent Characters                   │
│        ┌──────┐ ┌──────┐ ┌──────┐         │
│        │ 🎭   │ │ 🧙   │ │ 🤖   │         │
│        │ Luna │ │ Aria │ │ Rex  │         │
│        │ 温柔 │ │ 智慧 │ │ 幽默 │         │
│        └──────┘ └──────┘ └──────┘         │
│                                            │
│        [Browse Market →]                   │
│                                            │
└────────────────────────────────────────────┘
```

- 无角色时: 显示推荐角色 + "Create your first character"
- 搜索: 实时搜索用户的角色 + 市场角色

---

## 4. 侧边栏

### 4.1 对话列表

- 按时间分组: Today / Yesterday / Earlier
- 每条: 角色头像 (24px) + 标题 + 最后消息预览 + 时间
- 当前对话: 高亮背景
- hover: 显示 [⋮] 菜单 (Rename / Delete)
- 搜索: 过滤对话标题和消息内容

### 4.2 底部导航

4 个图标按钮 (tooltip 显示名称):
- 🏪 Market (角色市场)
- 🎭 My Characters (我的角色)
- ⚙️ Settings (设置 — 含 Profile/Security/Account/Subscription/Plugins/Developer/Analytics)
- 👤 User Avatar (用户菜单 — 含 Admin 入口)

### 4.3 折叠

- 桌面: 可折叠为 0px (按钮切换)
- 移动: 默认隐藏，抽屉式打开

---

## 5. 暗色模式

| 元素 | Light | Dark |
|------|-------|------|
| 主背景 | `#ffffff` | `#0d0d0d` |
| 侧边栏 | `#f9f9f9` | `#171717` |
| 用户消息背景 | `#f5f5f5` | `#222222` |
| 分隔线 | `#e5e5e5` | `#333333` |
| 代码块 | light theme | dark theme |

保持现有 CSS 变量体系 (`variables.css`)，更新对应值。

---

## 6. 影响范围

### 新建文件
- `src/client/components/layout/ChatLayout.vue` — 新主布局
- `src/client/components/chat/WelcomePage.vue` — 欢迎页/角色选择
- `src/client/components/chat/MarkdownRenderer.vue` — 增强 Markdown 渲染器

### 重大修改
- `src/client/pages/Chat.vue` — 重构为新布局
- `src/client/components/chat/MessageBubble.vue` — 去掉气泡，改全宽块
- `src/client/components/chat/ChatSidebar.vue` — 重构为新侧边栏 (对话列表 + 底部图标)
- `src/client/router/routes.ts` — 默认路由改为 `/chat`
- `src/client/components/chat/MessageInput.vue` — 新样式

### 保留不变
- 所有后端代码
- Market / My Characters / Settings 等页面 (仅入口变化)
- WebSocket / 流式输出逻辑
- 情感/记忆/调试面板 (保留抽屉式访问)

### 可删除
- `src/client/pages/Dashboard.vue`
- `src/client/components/layout/DashboardLayout.vue`
- `src/client/components/layout/LeftSidebar.vue` (被新 ChatSidebar 替代)
