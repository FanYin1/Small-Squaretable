# 迭代 27: 搜索与发现增强

**日期**: 2026-02-23
**方向**: 全局搜索、消息全文搜索、搜索建议、高级过滤器、搜索结果高亮

---

## 任务列表

### T1: 消息全文搜索升级 (ILIKE → tsvector)
**文件**: `src/db/schema/chats.ts`, `src/db/repositories/message.repository.ts`, 新迁移文件
- 在 messages 表添加 `search_vector tsvector` 列 + GIN 索引
- 创建触发器: INSERT/UPDATE 时自动更新 search_vector (content 字段)
- 升级 `searchByChatId` 使用 `plainto_tsquery` + `ts_rank` 排序
- 添加 `searchGlobal(userId, query)` 方法: 跨所有用户聊天搜索消息
- 支持中文搜索 (使用 'simple' 配置或保留 ILIKE 回退)

### T2: 全局搜索 API
**文件**: `src/server/routes/search.ts` (新建), `src/server/services/search.service.ts`
- 新建统一搜索路由 `GET /api/v1/search`
- 参数: `q` (查询), `type` (all/characters/messages/worldbooks), `limit`, `page`
- 聚合搜索: 并行查询角色 (tsvector) + 消息 (tsvector) + 世界书条目 (ILIKE)
- 返回分类结果 `{ characters: [], messages: [], worldbooks: [], total }`
- 添加 Redis 缓存 (60s TTL)

### T3: 搜索建议 API (Typeahead)
**文件**: `src/server/routes/search.ts`, `src/db/repositories/character.repository.ts`
- 新增 `GET /api/v1/search/suggestions?q=xxx`
- 使用 pg_trgm `similarity()` + `%` 操作符做模糊匹配
- 返回: 角色名称建议 (top 5) + 最近搜索 (top 3, Redis 存储)
- 在 characters 表 name 列添加 pg_trgm GIN 索引

### T4: 高级过滤器组件
**文件**: `src/client/components/search/SearchFilterPanel.vue` (新建)
- 过滤维度: 类型 (角色/消息/世界书)、时间范围、分类、标签
- 响应式布局: 桌面端侧边栏, 移动端底部抽屉
- 与全局搜索 API 联动

### T5: 全局搜索页面 + 搜索栏
**文件**: `src/client/pages/Search.vue` (新建), `src/client/components/layout/GlobalSearchBar.vue` (新建)
- 顶部导航栏添加全局搜索入口 (Ctrl+K / Cmd+K 快捷键)
- 搜索页面: 搜索结果分 tab 展示 (全部/角色/消息/世界书)
- 搜索结果高亮: 匹配关键词用 `<mark>` 标签包裹
- Typeahead 下拉建议 (防抖 300ms)

### T6: 搜索结果高亮工具
**文件**: `src/client/utils/highlight.ts` (新建)
- `highlightText(text, query)` 函数: 安全转义 + 关键词高亮
- 支持多关键词高亮 (空格分词)
- 应用到: 全局搜索结果、消息搜索结果、角色搜索结果

### T7: i18n + 路由 + 最终验证
- 添加 search.* i18n 键 (en-US + zh-CN)
- 注册搜索路由 `/search`
- 运行 tsc, vitest, build
- 更新 ROADMAP.md
