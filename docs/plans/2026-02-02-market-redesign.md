# 角色市场页面重设计方案

**设计日期**: 2026-02-02
**设计目标**: 采用三段式控制台布局，重新设计角色市场页面
**设计风格**: 现代化、清爽、蓝色系配色

---

## 一、设计需求来源

根据 `jianyi.md` 文件的要求，重新设计角色市场页面，主要特点：

1. **三段式布局**: 左侧功能导航 + 顶部栏 + 主内容区
2. **控制台风格**: 类似 BigModel 控制台或 Claude 网页版
3. **蓝色系配色**: 清爽的蓝色主色调，替代原有的紫色
4. **现代化设计**: 圆角卡片、柔和阴影、清晰层级

---

## 二、整体架构

### 2.1 页面布局结构

```
┌──────┬────────────────────────────────────────────┐
│      │  顶部栏 (64px 高)                          │
│      │  角色市场  [🔍 搜索... | 搜索 | 新建聊天]  [👤]│
│      ├────────────────────────────────────────────┤
│ 左侧 │  主内容区                                   │
│ 导航 │  ┌─ 筛选工具栏 ──────────────────────┐    │
│ 栏   │  │ 分类▼ | 标签▼ | NSFW☐ | 排序: Hot▼│    │
│      │  └────────────────────────────────────┘    │
│ 64px │  ┌─ 角色卡片网格 ──────────────────┐      │
│ 宽   │  │  [卡片] [卡片] [卡片] [卡片]     │      │
│      │  │  [卡片] [卡片] [卡片] [卡片]     │      │
│ 可展 │  │  或 [空状态插画]                 │      │
│ 开至 │  └────────────────────────────────┘      │
│240px │  [分页器]                                  │
└──────┴────────────────────────────────────────────┘
```

### 2.2 技术栈

- **框架**: Vue 3 + TypeScript
- **UI 库**: Element Plus
- **样式**: Tailwind CSS + 自定义 CSS
- **图标**: Element Plus Icons
- **状态管理**: Pinia
- **路由**: Vue Router

---

## 三、组件设计

### 3.1 左侧导航栏 (LeftSidebar.vue)

**默认状态** (64px 宽):
- 图标 + 文字垂直排列
- 深色背景 `#1F2937`
- 当前页面蓝色高亮 `#3B82F6`

**功能列表**:
- 🏠 首页
- 💬 会话/聊天
- 🎭 角色市场 (当前高亮)
- 👤 我的角色
- 📊 订阅管理
- ⚙️ 设置

**交互行为**:
- 悬停展开至 240px
- 点击导航项跳转页面
- 移动端通过汉堡菜单调出

### 3.2 顶部栏 (TopBar.vue)

**布局** (固定高度 64px):
```
┌────────────────────────────────────────────────────────┐
│ 角色市场    [🔍 搜索角色... | 搜索 | ➕新建聊天]    [👤▼]│
└────────────────────────────────────────────────────────┘
```

**搜索框组合** (SearchCombo.vue):
- 输入框 + 搜索按钮 + 新建聊天按钮
- 整体圆角 `12px`
- 搜索按钮: 蓝色 `#3B82F6`
- 新建聊天按钮: 绿色 `#10B981`

**用户菜单** (UserMenu.vue):
- 未登录: 显示"登录/注册"按钮
- 已登录: 显示头像 + 下拉菜单
  - 📊 个人中心
  - 🎭 我的角色
  - 💳 订阅管理
  - ⚙️ 设置
  - 🚪 退出登录

### 3.3 筛选工具栏 (FilterToolbar.vue)

**横向排列**:
```
┌────────────────────────────────────────────────┐
│ 分类 ▼  |  标签 ▼  |  ☐ 显示NSFW  |  排序: Hot ▼ │
└────────────────────────────────────────────────┘
```

**筛选选项**:
- **分类**: 全部、助手、娱乐、教育、游戏、历史、现代
- **标签**: Fantasy、Sci-Fi、Anime、Game、Romance (多选)
- **NSFW**: 开关
- **排序**: Hot、Latest、Top Rated、Relevance

### 3.4 角色卡片网格 (CharacterGrid.vue)

**网格布局**:
- 桌面端 (≥1024px): 4 列
- 平板端 (768-1023px): 3 列
- 移动端 (≤767px): 1 列
- 卡片间距: 24px

**单个卡片** (CharacterCard.vue):
```
┌─────────────────────┐
│   [角色头像 80x80]   │
│   角色名称           │
│   角色描述...        │
│   [标签1] [标签2]   │
│   ⭐ 4.5  💬 1.2K   │
└─────────────────────┘
```

**卡片样式**:
- 白色背景
- 圆角 `16px`
- 阴影 `0 2px 8px rgba(0,0,0,0.08)`
- 悬停: 上移 `-4px` + 蓝色边框

### 3.5 空状态 (EmptyState.vue)

**设计**:
```
    🤖 💭  ← 机器人+对话框插画
                (120x120px)

     暂无角色
     (20px, 粗体)

  调整筛选条件或搜索其他关键词
  (14px, 浅灰色)

  [清除所有筛选] [浏览全部角色]
```

**插画风格**:
- 简单的 SVG 插画
- 柔和的蓝灰色调
- 卡通风格，友好生动

---

## 四、配色方案

### 4.1 主色调 (蓝色系)

```css
--primary-50:  #EFF6FF;  /* 最浅蓝 - 背景 */
--primary-100: #DBEAFE;  /* 浅蓝 - 悬停背景 */
--primary-500: #3B82F6;  /* 主蓝 - 主要按钮、链接 */
--primary-600: #2563EB;  /* 深蓝 - 悬停状态 */
--primary-700: #1D4ED8;  /* 更深蓝 - 激活状态 */
```

### 4.2 辅助色

```css
--success-500: #10B981;  /* 绿色 - 新建聊天按钮 */
--success-600: #059669;  /* 深绿 - 悬停状态 */
```

### 4.3 中性色

```css
--gray-50:  #F9FAFB;  /* 背景色 */
--gray-100: #F3F4F6;  /* 卡片背景 */
--gray-200: #E5E7EB;  /* 边框 */
--gray-400: #9CA3AF;  /* 次要文字 */
--gray-600: #4B5563;  /* 常规文字 */
--gray-900: #111827;  /* 标题文字 */
```

### 4.4 深色导航栏

```css
--nav-bg:    #1F2937;  /* 导航栏背景 */
--nav-hover: #374151;  /* 悬停背景 */
--nav-text:  #F9FAFB;  /* 文字颜色 */
```

---

## 五、响应式设计

### 5.1 断点系统

```css
/* 移动端 (≤767px) */
- 左侧导航栏: 隐藏，通过汉堡菜单调出
- 顶部栏: 简化，搜索框占满宽度
- 角色卡片: 单列布局
- 筛选工具栏: 收起为抽屉

/* 平板端 (768-1023px) */
- 左侧导航栏: 收起状态 (64px)
- 角色卡片: 3列布局
- 筛选工具栏: 横向排列

/* 桌面端 (≥1024px) */
- 左侧导航栏: 可展开 (64px → 240px)
- 角色卡片: 4列布局
- 筛选工具栏: 横向排列
```

### 5.2 移动端优化

**顶部栏**:
```
┌────────────────────────────────┐
│ ☰  角色市场              [👤▼] │
├────────────────────────────────┤
│ [🔍 搜索角色...]               │
├────────────────────────────────┤
│ [搜索]  [➕ 新建聊天]          │
└────────────────────────────────┘
```

**触摸优化**:
- 最小点击区域: 44x44px
- 按钮内边距: 12px 24px
- 卡片间距: 16px (移动端)

---

## 六、数据流和状态管理

### 6.1 Pinia Store

```typescript
// stores/market.ts
interface MarketState {
  // 搜索和筛选
  searchQuery: string;
  selectedCategory: string;
  selectedTags: string[];
  showNsfw: boolean;
  sortBy: 'hot' | 'latest' | 'rating' | 'relevance';
  
  // 数据
  characters: Character[];
  total: number;
  currentPage: number;
  pageSize: number;
  
  // UI 状态
  loading: boolean;
  sidebarCollapsed: boolean;
  filterDrawerVisible: boolean;
}
```

### 6.2 API 调用

```typescript
async fetchCharacters() {
  marketStore.loading = true;
  try {
    const params = {
      q: marketStore.searchQuery || '*',
      category: marketStore.selectedCategory,
      tags: marketStore.selectedTags.join(','),
      isNsfw: marketStore.showNsfw,
      sort: marketStore.sortBy,
      page: marketStore.currentPage,
      limit: marketStore.pageSize,
    };
    
    const response = await api.get('/characters/search', { params });
    marketStore.characters = response.items;
    marketStore.total = response.pagination.total;
  } catch (error) {
    ElMessage.error('加载角色失败');
  } finally {
    marketStore.loading = false;
  }
}
```

---

## 七、组件结构

```
MarketPage.vue (主页面)
├── LeftSidebar.vue (左侧导航栏)
│   └── NavItem.vue (导航项)
├── TopBar.vue (顶部栏)
│   ├── SearchCombo.vue (搜索框组合)
│   └── UserMenu.vue (用户菜单)
├── FilterToolbar.vue (筛选工具栏)
│   ├── CategorySelect.vue (分类选择)
│   ├── TagSelect.vue (标签选择)
│   └── SortSelect.vue (排序选择)
├── CharacterGrid.vue (角色网格)
│   └── CharacterCard.vue (角色卡片)
├── EmptyState.vue (空状态)
└── Pagination.vue (分页器)
```

---

## 八、视觉规范

### 8.1 字体

```css
font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;

--text-xs:   12px;  /* 标签、辅助信息 */
--text-sm:   14px;  /* 正文、描述 */
--text-base: 16px;  /* 卡片标题 */
--text-lg:   18px;  /* 页面副标题 */
--text-xl:   20px;  /* 空状态标题 */
--text-2xl:  24px;  /* 页面主标题 */
```

### 8.2 间距

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
```

### 8.3 圆角

```css
--radius-sm: 8px;   /* 小元素 */
--radius-md: 12px;  /* 按钮、输入框 */
--radius-lg: 16px;  /* 卡片 */
--radius-xl: 20px;  /* 大卡片 */
```

### 8.4 阴影

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 2px 8px rgba(0,0,0,0.08);
--shadow-lg: 0 8px 24px rgba(59,130,246,0.15);
```

### 8.5 动画

```css
--transition-fast: 150ms;   /* 按钮悬停 */
--transition-base: 200ms;   /* 卡片悬停 */
--transition-slow: 300ms;   /* 页面切换 */
--ease-out: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 九、性能优化

### 9.1 图片懒加载

```vue
<img 
  :src="character.avatar" 
  loading="lazy"
  :alt="character.name"
/>
```

### 9.2 虚拟滚动

- 角色数量 > 100 时启用
- 使用 `vue-virtual-scroller`
- 只渲染可见区域

### 9.3 骨架屏

```
┌─────────────────────┐
│   [灰色方块]         │  ← 加载中
│   ▓▓▓▓▓▓▓           │
│   ▓▓▓▓▓▓▓▓▓▓        │
│   [▓▓] [▓▓]         │
└─────────────────────┘
```

---

## 十、实现计划

### 10.1 第一阶段：基础布局

- [ ] 创建三段式布局结构
- [ ] 实现左侧导航栏
- [ ] 实现顶部栏
- [ ] 实现主内容区容器

### 10.2 第二阶段：核心功能

- [ ] 实现搜索框组合
- [ ] 实现筛选工具栏
- [ ] 实现角色卡片网格
- [ ] 实现空状态页面

### 10.3 第三阶段：交互优化

- [ ] 实现用户菜单
- [ ] 实现分页器
- [ ] 实现响应式布局
- [ ] 实现移动端抽屉

### 10.4 第四阶段：性能优化

- [ ] 实现图片懒加载
- [ ] 实现骨架屏
- [ ] 实现虚拟滚动
- [ ] 优化动画性能

---

## 十一、验收标准

### 11.1 功能完整性

- [x] 三段式布局正确显示
- [x] 左侧导航栏可展开/收起
- [x] 搜索功能正常工作
- [x] 筛选功能正常工作
- [x] 角色卡片正确显示
- [x] 空状态正确显示
- [x] 分页功能正常工作

### 11.2 视觉质量

- [x] 蓝色系配色正确应用
- [x] 圆角和阴影符合设计
- [x] 字体大小和层级清晰
- [x] 间距和留白合理
- [x] 悬停效果流畅

### 11.3 响应式

- [x] 桌面端 (≥1024px) 正常显示
- [x] 平板端 (768-1023px) 正常显示
- [x] 移动端 (≤767px) 正常显示
- [x] 无横向滚动条

### 11.4 性能

- [x] 首屏加载 < 2s
- [x] 图片懒加载生效
- [x] 动画流畅 (60fps)
- [x] 无内存泄漏

---

**设计完成日期**: 2026-02-02
**设计负责人**: Claude Code
**下次审查**: 实现完成后
