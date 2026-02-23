# 迭代 28: 移动端适配优化

**日期**: 2026-02-23
**方向**: 响应式布局完善、触摸手势优化、移动端专属 UI 组件、PWA 基础

---

## 任务列表

### T1: 核心聊天组件移动端 CSS
**文件**: `ChatWindow.vue`, `MessageBubble.vue`, `MessageInput.vue`
- ChatWindow: 添加 @media (max-width: 768px) — 减少 padding, header 紧凑布局, 模型选择器隐藏到菜单, 抽屉宽度 100%
- MessageBubble: 移动端减少 padding, 操作按钮增大触摸目标 (44px), 操作栏水平滚动
- MessageInput: 移动端减少 padding, 按钮紧凑排列, 虚拟键盘适配 (env(safe-area-inset-bottom))

### T2: BottomTabBar 实现 + safe-area
**文件**: `BottomTabBar.vue`, `ChatLayout.vue`, `index.html`
- 实现 BottomTabBar: 聊天/角色/市场/搜索/设置 5 个 tab
- 添加 safe-area-inset 支持 (viewport-fit=cover + env(safe-area-inset-*))
- 添加 PWA meta 标签 (theme-color, apple-mobile-web-app-capable)

### T3: 侧边栏滑动手势
**文件**: `ChatLayout.vue`
- 添加从左边缘滑动打开侧边栏手势 (touchstart/touchmove/touchend)
- 滑动关闭侧边栏 (向左滑动)
- 触摸区域: 左边缘 20px 内开始的滑动

### T4: AppHeader 移动端修复
**文件**: `AppHeader.vue`
- 修复移动端菜单图标 (string → 组件引用)
- 搜索按钮移动端适配
- 品牌名称移动端缩短

### T5: i18n + 最终验证
- 添加移动端相关 i18n 键
- 运行 tsc, vitest, build
- 更新 ROADMAP.md
