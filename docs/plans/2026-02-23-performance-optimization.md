# 迭代 26: 性能优化

**日期**: 2026-02-23
**方向**: 虚拟滚动、图片懒加载、API 缓存、Bundle 优化

---

## 任务列表

### T1: 虚拟滚动 — 消息列表
**文件**: `src/client/components/chat/ChatWindow.vue`
- 安装 `@vueuse/core` (如未安装) 使用 `useVirtualList` 或手写虚拟滚动
- 替换 `v-for` 消息渲染为虚拟滚动，只渲染可视区域内的消息
- 保持现有功能: 无限滚动加载、滚动到底部、pull-to-refresh

### T2: ECharts 动态导入
**文件**: `vite.config.ts`, 相关 ECharts 组件
- 将 ECharts 相关组件 (EmotionTimeline, EmotionScatterPlot, RelationshipGraph) 改为动态导入
- 在 vite.config.ts 中将 echarts 分离为独立 chunk
- 目标: chat-components chunk 从 1.1MB 降至 <500KB

### T3: API 响应缓存 (客户端 SWR)
**文件**: `src/client/composables/useApiCache.ts` (新建)
- 创建轻量 SWR 缓存 composable (stale-while-revalidate)
- 缓存角色列表、市场数据、模型列表等不频繁变化的数据
- 支持 TTL、手动失效、后台刷新

### T4: 消息图片懒加载
**文件**: `src/client/components/chat/MessageBubble.vue`, `src/client/components/chat/MessageImage.vue`
- 在消息中的图片使用 IntersectionObserver 懒加载
- 添加占位符和加载动画

### T5: 数据库查询优化
**文件**: `src/db/schema/*.ts`
- 为高频查询列添加索引 (messages.chatId+sentAt, messages.parentMessageId)
- 检查并优化 N+1 查询

### T6: Bundle 分析与优化
**文件**: `vite.config.ts`
- 优化 manualChunks: 分离 highlight.js, katex, echarts
- 添加 gzip/brotli 压缩配置
- 目标: 首屏加载 JS < 500KB (gzip)

### T7: i18n + 最终验证
- 运行 tsc, vitest, build
- 更新 ROADMAP.md
