# UI 优化任务分配文档

**创建时间**: 2026-02-03
**主会话**: 负责规划、上下文选择、提示词编写、总结
**子会话**: 使用 haiku 模型执行具体任务
**执行方式**: 顺序执行（不并行）

---

## 任务概览

| 任务 ID | 任务名称 | 优先级 | 预计复杂度 | 状态 |
|---------|----------|--------|------------|------|
| Task #1 | 加载状态系统 | P0 | 中 | 待执行 |
| Task #2 | 表单验证反馈优化 | P1 | 低 | 待执行 |
| Task #3 | 错误提示系统 | P1 | 中 | 待执行 |
| Task #4 | 空状态设计增强 | P2 | 低 | 待执行 |

---

## Task #1: 加载状态系统

### 目标
创建统一的加载状态组件，提升用户在数据加载时的体验。

### 前置条件
- 服务器运行正常（前端 :5173，后端 :3000）
- 已阅读设计文档：`docs/plans/2026-02-03-ui-optimization-design.md`

### 任务详情

#### 1.1 创建 LoadingSpinner 组件
**文件**: `src/client/components/ui/LoadingSpinner.vue`

**功能要求**:
- 支持 3 种尺寸：small (16px), medium (24px), large (32px)
- 支持自定义颜色（默认 #3B82F6）
- 支持可选的加载文本
- 使用 CSS 动画实现旋转效果
- 响应式设计

**Props 接口**:
```typescript
interface Props {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  text?: string;
}
```

**设计规范**:
- 使用 SVG 圆环作为加载图标
- 旋转动画：360度，1秒，线性
- 文本颜色：#6B7280
- 文本大小：14px

#### 1.2 创建 SkeletonCard 组件
**文件**: `src/client/components/ui/SkeletonCard.vue`

**功能要求**:
- 模拟 CharacterCard 的布局
- 支持显示多个骨架卡片（count prop）
- 使用脉冲动画效果
- 响应式网格布局

**Props 接口**:
```typescript
interface Props {
  count?: number; // 默认 6
}
```

**设计规范**:
- 卡片尺寸：与 CharacterCard 一致
- 背景色：#F3F4F6
- 脉冲动画：1.5秒，ease-in-out，无限循环
- 圆角：12px
- 网格布局：与 Market.vue 一致

#### 1.3 更新 Market.vue
**文件**: `src/client/pages/Market.vue`

**修改内容**:
1. 导入 SkeletonCard 组件
2. 在 `loading` 状态时显示 SkeletonCard
3. 数据加载完成后显示实际的 CharacterCard
4. 添加平滑的过渡动画

**实现位置**:
```vue
<!-- 在角色网格区域 -->
<div v-if="loading" class="characters-grid">
  <SkeletonCard :count="6" />
</div>
<div v-else class="characters-grid">
  <CharacterCard v-for="char in characters" :key="char.id" :character="char" />
</div>
```

### 验收标准
- [ ] LoadingSpinner 组件创建完成，支持 3 种尺寸
- [ ] LoadingSpinner 旋转动画流畅
- [ ] SkeletonCard 组件创建完成，脉冲动画正常
- [ ] Market.vue 加载时显示骨架屏
- [ ] 数据加载完成后平滑切换到实际内容
- [ ] 响应式布局在移动端正常显示

### 测试步骤
1. 启动前端服务：`npm run dev:client`
2. 访问 http://localhost:5173/market
3. 刷新页面观察骨架屏显示
4. 验证数据加载后的切换效果
5. 调整浏览器窗口测试响应式布局
6. 在移动端模拟器测试

### 关键文件
```
src/client/components/ui/LoadingSpinner.vue  (新建)
src/client/components/ui/SkeletonCard.vue    (新建)
src/client/pages/Market.vue                  (更新)
```

---

## Task #2: 表单验证反馈优化

### 目标
改进登录和注册页面的表单验证反馈，提供更友好的用户体验。

### 前置条件
- Task #1 已完成
- 服务器运行正常

### 任务详情

#### 2.1 更新 Login.vue 验证样式
**文件**: `src/client/pages/auth/Login.vue`

**修改内容**:
1. 添加验证成功/失败的视觉反馈
2. 改进错误消息样式（图标 + 动画）
3. 优化输入框聚焦效果

**CSS 样式**:
```css
/* 验证成功状态 */
:deep(.el-form-item.is-success .el-input__wrapper) {
  border-color: #10B981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

/* 验证错误状态 */
:deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: #EF4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

/* 错误消息动画 */
:deep(.el-form-item__error) {
  display: flex;
  align-items: center;
  gap: 4px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### 2.2 更新 Register.vue 验证样式
**文件**: `src/client/pages/auth/Register.vue`

**修改内容**:
1. 应用与 Login.vue 相同的验证样式
2. 保持现有的密码强度指示器
3. 改进所有字段的错误消息显示

**注意事项**:
- 不要修改密码强度指示器的逻辑
- 保持现有的验证规则
- 只更新样式和动画

### 验收标准
- [ ] Login.vue 验证成功显示绿色边框
- [ ] Login.vue 验证失败显示红色边框
- [ ] Register.vue 验证成功显示绿色边框
- [ ] Register.vue 验证失败显示红色边框
- [ ] 错误消息有下滑动画
- [ ] 密码强度指示器保持正常工作
- [ ] 移动端表单验证体验良好

### 测试步骤
1. 访问 http://localhost:5173/login
2. 输入无效邮箱，观察错误提示
3. 输入有效邮箱，观察成功状态
4. 访问 http://localhost:5173/register
5. 测试所有字段的验证反馈
6. 测试密码强度指示器
7. 在移动端测试表单体验

### 关键文件
```
src/client/pages/auth/Login.vue     (更新样式)
src/client/pages/auth/Register.vue  (更新样式)
```

---

## Task #3: 错误提示系统

### 目标
创建自定义的 Toast 通知系统，替换 Element Plus 的 ElMessage。

### 前置条件
- Task #1 和 Task #2 已完成
- 服务器运行正常

### 任务详情

#### 3.1 创建 Toast 组件
**文件**: `src/client/components/ui/Toast.vue`

**功能要求**:
- 支持 4 种类型：success, error, warning, info
- 自动关闭（可配置时长）
- 手动关闭按钮
- 支持操作按钮（如"重试"）
- 进入/退出动画

**Props 接口**:
```typescript
interface Props {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: {
    text: string;
    onClick: () => void;
  };
}

interface Emits {
  (e: 'close', id: string): void;
}
```

**设计规范**:
- 宽度：360px（桌面），100%（移动端）
- 圆角：12px
- 阴影：0 4px 12px rgba(0, 0, 0, 0.15)
- 图标大小：20px
- 字体大小：标题 14px，消息 13px
- 颜色方案：
  - success: #10B981
  - error: #EF4444
  - warning: #F59E0B
  - info: #3B82F6

#### 3.2 创建 ToastContainer 组件
**文件**: `src/client/components/ui/ToastContainer.vue`

**功能要求**:
- 管理多个 Toast 的显示
- 堆叠布局（最多 5 个）
- 固定在右上角（桌面）或顶部（移动端）
- 使用 Teleport 渲染到 body

**设计规范**:
- 位置：右上角，距离边缘 24px
- Toast 间距：12px
- z-index: 9999

#### 3.3 创建 useToast Composable
**文件**: `src/client/composables/useToast.ts`

**功能要求**:
- 提供 success, error, warning, info 方法
- 管理 Toast 状态（添加、移除）
- 自动生成唯一 ID
- 限制最大显示数量（5 个）

**API 接口**:
```typescript
interface ToastOptions {
  title: string;
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: {
    text: string;
    onClick: () => void;
  };
}

export function useToast() {
  return {
    success: (title: string, options?: Partial<ToastOptions>) => void;
    error: (title: string, options?: Partial<ToastOptions>) => void;
    warning: (title: string, options?: Partial<ToastOptions>) => void;
    info: (title: string, options?: Partial<ToastOptions>) => void;
  };
}
```

#### 3.4 更新页面使用 Toast
**文件**:
- `src/client/pages/auth/Login.vue`
- `src/client/pages/auth/Register.vue`
- `src/client/pages/Market.vue`

**修改内容**:
1. 移除 `import { ElMessage } from 'element-plus'`
2. 导入 `import { useToast } from '@client/composables/useToast'`
3. 替换所有 `ElMessage.success/error` 为 `toast.success/error`

**示例**:
```typescript
// 之前
ElMessage.success('登录成功');
ElMessage.error('登录失败，请检查邮箱和密码');

// 之后
toast.success('登录成功');
toast.error('登录失败', {
  message: '邮箱或密码错误，请重试'
});
```

#### 3.5 在 App.vue 中添加 ToastContainer
**文件**: `src/client/App.vue`

**修改内容**:
```vue
<template>
  <div id="app">
    <router-view />
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import ToastContainer from '@client/components/ui/ToastContainer.vue';
</script>
```

### 验收标准
- [ ] Toast 组件支持 4 种类型
- [ ] Toast 自动关闭功能正常
- [ ] Toast 手动关闭功能正常
- [ ] Toast 操作按钮功能正常
- [ ] ToastContainer 正确堆叠显示多个 Toast
- [ ] 最多显示 5 个 Toast
- [ ] Login.vue 使用新的 Toast 系统
- [ ] Register.vue 使用新的 Toast 系统
- [ ] Market.vue 使用新的 Toast 系统
- [ ] 移动端 Toast 显示正常

### 测试步骤
1. 访问 http://localhost:5173/login
2. 输入错误凭据，观察错误 Toast
3. 输入正确凭据，观察成功 Toast
4. 访问 http://localhost:5173/register
5. 测试注册流程的 Toast 提示
6. 访问 http://localhost:5173/market
7. 测试加载失败的 Toast 提示
8. 快速触发多个 Toast，验证堆叠效果
9. 在移动端测试 Toast 显示

### 关键文件
```
src/client/components/ui/Toast.vue          (新建)
src/client/components/ui/ToastContainer.vue (新建)
src/client/composables/useToast.ts          (新建)
src/client/pages/auth/Login.vue             (更新)
src/client/pages/auth/Register.vue          (更新)
src/client/pages/Market.vue                 (更新)
src/client/App.vue                           (更新)
```

---

## Task #4: 空状态设计增强

### 目标
增强 EmptyState 组件，支持多种场景的空状态展示。

### 前置条件
- Task #1, #2, #3 已完成
- 服务器运行正常

### 任务详情

#### 4.1 更新 EmptyState 组件
**文件**: `src/client/components/market/EmptyState.vue`

**功能要求**:
- 支持 4 种变体：no-results, no-data, error, permission-denied
- 每种变体有独特的插图和文案
- 支持自定义标题和描述
- 保持现有的浮动动画

**Props 接口**:
```typescript
interface Props {
  type?: 'no-results' | 'no-data' | 'error' | 'permission-denied';
  title?: string;
  description?: string;
}

interface Emits {
  (e: 'action-primary'): void;
  (e: 'action-secondary'): void;
}
```

**变体设计**:

1. **no-results** (默认，保持现有设计)
   - 插图：机器人 + 问号
   - 标题："暂无角色"
   - 描述："调整筛选条件或搜索其他关键词"
   - 按钮：清除筛选、浏览全部

2. **no-data**
   - 插图：空盒子
   - 标题："还没有内容"
   - 描述："创建您的第一个角色"
   - 按钮：立即创建

3. **error**
   - 插图：警告图标
   - 标题："加载失败"
   - 描述："无法加载内容，请稍后重试"
   - 按钮：重试、返回首页

4. **permission-denied**
   - 插图：锁图标
   - 标题："无权访问"
   - 描述："您没有权限查看此内容"
   - 按钮：登录、返回首页

**实现方式**:
- 使用 computed 根据 type 返回对应的配置
- SVG 插图使用内联方式
- 保持现有的样式和动画

#### 4.2 更新 Market.vue 使用新的 EmptyState
**文件**: `src/client/pages/Market.vue`

**修改内容**:
1. 区分不同的空状态场景
2. 传递正确的 type prop

**示例**:
```vue
<!-- 搜索无结果 -->
<EmptyState
  v-if="!loading && characters.length === 0"
  type="no-results"
  @action-primary="handleClearFilters"
  @action-secondary="handleBrowseAll"
/>

<!-- 加载失败 -->
<EmptyState
  v-if="loadError"
  type="error"
  @action-primary="fetchCharacters"
  @action-secondary="goHome"
/>
```

### 验收标准
- [ ] EmptyState 支持 4 种变体
- [ ] 每种变体有独特的插图
- [ ] 每种变体有合适的文案
- [ ] 浮动动画保持正常
- [ ] 操作按钮功能正常
- [ ] Market.vue 正确使用不同的空状态
- [ ] 移动端空状态显示正常

### 测试步骤
1. 访问 http://localhost:5173/market
2. 搜索不存在的角色，观察 no-results 状态
3. 测试清除筛选和浏览全部按钮
4. 模拟加载失败，观察 error 状态
5. 在移动端测试空状态显示
6. 验证所有插图和动画正常

### 关键文件
```
src/client/components/market/EmptyState.vue  (更新)
src/client/pages/Market.vue                  (更新)
```

---

## 执行流程

### 主会话职责
1. 为每个任务创建详细的提示词
2. 启动子会话执行任务
3. 等待子会话完成
4. 验证任务结果
5. 更新 SESSION_HANDOFF.md
6. 继续下一个任务

### 子会话职责
1. 阅读任务详情
2. 创建/更新文件
3. 测试功能
4. 报告完成状态

### 执行顺序
```
Task #1 (加载状态系统)
  ↓ 完成后
Task #2 (表单验证反馈)
  ↓ 完成后
Task #3 (错误提示系统)
  ↓ 完成后
Task #4 (空状态设计)
  ↓ 完成后
更新 SESSION_HANDOFF.md
```

---

## 注意事项

### 代码规范
- 使用 TypeScript 类型注解
- 遵循 Vue 3 Composition API 风格
- 使用 scoped CSS
- 保持代码简洁，避免过度工程

### 样式规范
- 使用项目统一的蓝色系配色（#3B82F6）
- 遵循现有的圆角、阴影、间距规范
- 使用 CSS 变量定义颜色
- 添加暗色模式支持（可选）

### 测试规范
- 每个任务完成后进行手动测试
- 测试桌面和移动端
- 验证响应式布局
- 检查浏览器控制台无错误

### 文档规范
- 更新 SESSION_HANDOFF.md 记录进度
- 添加代码注释说明复杂逻辑
- 保持文档与代码同步

---

## 完成标准

所有任务完成后，应满足：

1. **功能完整性**
   - 所有组件创建完成
   - 所有页面更新完成
   - 所有功能正常工作

2. **视觉一致性**
   - 统一的设计风格
   - 流畅的动画效果
   - 良好的响应式布局

3. **代码质量**
   - TypeScript 类型完整
   - 代码结构清晰
   - 无 ESLint 错误

4. **用户体验**
   - 加载状态清晰
   - 错误提示友好
   - 表单验证直观
   - 空状态有引导

---

**文档维护者**: Claude Code
**最后更新**: 2026-02-03
**下次更新**: 每个任务完成后
