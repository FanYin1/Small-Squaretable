# Small Squaretable - 开发路线图

**项目**: SillyTavern SaaS 转换
**版本**: 0.1.0
**最后更新**: 2026-02-16

---

## 📊 项目状态

```
Phase 1: 基础设施层        ████████████████████ 100% ✅
Phase 2: 核心 API          ████████████████████ 100% ✅
Phase 3: 订阅与计费        ████████████████████ 100% ✅
Phase 4: 前端基础          ████████████████████ 100% ✅
Phase 5: 前端页面开发      ████████████████████ 100% ✅
Phase 6: 测试与优化        ████████████████████ 100% ✅
Phase 7: 生产部署          ████████████████████ 100% ✅
迭代 1: 高级功能           ████████████████████ 100% ✅
迭代 2: 社区与生态         ████████████████████ 100% ✅
迭代 3: 数据智能           ████████████████████ 100% ✅
迭代 4: 平台加固           ████████████████████ 100% ✅
迭代 5: 技术债务与推荐       ████████████████████ 100% ✅
迭代 6: 生产就绪           ████████████████████ 100% ✅
迭代 7: 测试修复             ████████████████████ 100% ✅
迭代 8: i18n 全覆盖           ████████████████████ 100% ✅
```

**整体完成度**: 迭代 8 完成

---

## Phase 1: 基础设施层 ✅

- PostgreSQL + Drizzle ORM (8 张表)
- Redis 缓存层
- 中间件系统 (租户、错误处理、日志)
- Repository 模式 (8 个仓库)
- 测试框架 (Vitest)

## Phase 2: 核心 API ✅

- JWT 认证系统 (双 Token)
- 用户管理 API
- 角色管理 API (CRUD + 市场)
- 聊天管理 API
- 五维度评分系统
- PostgreSQL 全文搜索
- WebSocket 实时通信
- LLM 集成

## Phase 3: 订阅与计费 ✅

- Stripe 集成
- 三层订阅计划 (Free/Pro/Team)
- 订阅管理 API
- 使用量跟踪系统
- 功能门控系统
- Webhook 处理

## Phase 4: 前端基础 ✅

- Vue 3 + Vite 项目
- 路由系统 (Vue Router)
- 状态管理 (Pinia)
- API 服务层
- 布局组件
- UI 组件库 (Element Plus)

## Phase 5: 前端页面开发 ✅

- 认证页面 (Login/Register)
- 核心页面 (Home, Market, Chat, Profile, Subscription)
- 角色市场 (三段式控制台布局)
- SillyTavern V2 角色卡导入
- Toast 通知系统
- 空状态设计

## Phase 6: 测试与优化 ✅

- E2E 测试 (Playwright, 92% 通过率)
- 单元测试 (Vitest, 99% 通过率)
- 安全加固 (CSRF, CSP, 速率限制)
- 性能优化 (代码分割, 缓存, 懒加载)
- 监控与日志 (Sentry, 结构化日志)

## Phase 7: 生产部署 ✅

- Docker 镜像优化 (多阶段构建)
- Kubernetes 配置 (Kustomize)
- CI/CD 流程 (GitHub Actions)
- 数据库备份与恢复
- 灾难恢复计划

---

## 🚀 后续迭代计划

### 迭代 1: 高级功能 ✅ (2026-02-07 ~ 2026-02-08)
- ✅ **多模态图片支持** - 本地文件存储、sharp 缩略图、聊天图片上传
- ✅ **智能角色系统 (记忆、情感状态机)**
  - pgvector 向量搜索 + 混合检索
  - 2D Valence-Arousal 情感模型 + 指数衰减
  - MiniLM 本地嵌入 + 情感分析 (ML 微服务)
  - 动态重要性评分、语义去重、LRU 淘汰
  - 会话隔离 (记忆/情感按 chatId 独立)
- ✅ **智能系统调试面板** - 实时 WebSocket 事件推送、系统提示查看器、记忆/情感/性能监控
- ✅ **世界书系统** - 四层作用域、混合触发 (关键词+语义)、7 个注入位置、SillyTavern 格式导入
- ✅ **PWA 优化** - Workbox Service Worker、A2HS 安装提示、离线回退
- ✅ **多设备同步** - 设备追踪、广播、已读回执同步
- ✅ **UX 改进** - 消息编辑/删除/重新生成、游标分页、连接指示器

### 迭代 2: 社区与生态 ✅ (2026-02-09)
- ✅ **Phase A: EventBus + Webhooks**
  - 内部事件总线 (发布/订阅 + 通配符)
  - Webhook 系统 (HMAC-SHA256 签名、指数退避重试)
  - 后台 Webhook 投递 Worker
- ✅ **Phase B: 社交功能**
  - 关注/取关用户、粉丝/关注列表
  - 收藏/取消收藏角色
  - 角色评论 (分页)
  - 应用内通知系统 (未读计数、WebSocket 推送)
- ✅ **Phase C: 开发者 API 门户**
  - API Key 创建/列表/撤销 (权限范围)
  - API Key 认证中间件
  - 按 Key 速率限制
  - 开发者设置页面
- ✅ **Phase D: 插件系统**
  - Worker Thread 沙箱隔离 (64MB 内存、30s 超时)
  - EventBus 桥接 (pipeline 模式 + fire-and-forget)
  - 插件 KV 存储 (per-plugin per-user)
  - 功能门控 (Free: 0, Pro: 5, Team: 20 安装数)
  - 13 个 API 端点 + 插件市场页面
  - 97 个插件相关测试

### 迭代 3: 数据智能与推荐系统 ✅ (2026-02-10)
- ✅ **M1: 事件管道**
  - Kafka 3.7 (KRaft 模式), 5 个 Topic
  - EventBus → Kafka 桥接服务 (通配符路由、事件过滤)
  - 前端 Analytics SDK (批量采集、会话追踪、自动刷新)
  - 事件摄入端点 `POST /analytics/events` → Kafka
- ✅ **M2: 流处理 (Flink 1.19)**
  - Java 17 项目脚手架 (Gradle 8.5, Shadow JAR)
  - MetricsAggregator: 原始事件 → ClickHouse ODS, 1分钟/1小时窗口 → Redis 实时指标
  - SessionAggregator: 30分钟会话窗口 → ClickHouse `ods_sessions`, 活跃用户计数 → Redis
- ✅ **M3: 数据仓库 (ClickHouse 24.3)**
  - 四层架构: ODS → DWD → DWS → ADS
  - ODS: `ods_events`, `ods_sessions`
  - DWD: `dwd_chat_events`, `dwd_recommendation_events`
  - DWS: `dws_user_hourly`, `dws_character_daily`, `dws_recommendation_hourly` (物化视图)
  - ADS: `ads_north_star` (周活跃用户 + 消息数)
- ✅ **M5: 特征存储与用户画像**
  - UserProfiler: 滑动窗口 (1h/5min), 参与度评分、活跃等级、兴趣标签 → Redis
  - ContentAnalyzer: 1小时窗口, 角色统计、热门评分 → Redis + ClickHouse
  - RecommendationTracker: 5分钟窗口, A/B 测试事件 → ClickHouse
  - Feature Store 读取服务 (Redis keys: `fs:user:*`, `fs:char:*`, `fs:global:*`)
- ✅ **M7: 隐私保护**
  - PII 过滤器: Flink MapFunction — SHA-256 邮箱哈希、IP/电话/内容字段移除、不可变事件副本
- ✅ **M8: 分析仪表盘**
  - ClickHouse 查询服务 (北极星指标、留存矩阵、转化漏斗、角色排名、用户分群)
  - 6 个 GET API 端点 + 功能门控 (Pro: 概览+实时, Team: 全部)
  - Pinia 状态管理 + API 服务
  - ECharts 可视化: 趋势图、漏斗图、留存热力图、排名表
  - 10 个 Playwright E2E 测试

### 迭代 5: 技术债务与推荐系统 ✅ (2026-02-15)
- ✅ **M1: 修复占位符与缺失页面**
  - LRU 记忆淘汰 (替换 console.warn 占位符)
  - 收藏计数 (替换 favorites: 0 硬编码)
  - 记忆提取 (替换占位符为真实实现)
  - 缺失页面: WorldBooks、CharacterDetail、法律页面 (Terms/Privacy/About)
  - 管理端审计日志独立页面
  - 主题切换 (暗色模式) + 语言切换器
- ✅ **M2: 推荐引擎**
  - 三策略推荐: 热门 (Feature Store)、协同 (标签匹配)、内容 (Jaccard 相似度)
  - 个性化混合 (可配置权重)、Redis 缓存 (15分钟 TTL)
  - 4 个 API 端点 + 前端推荐轮播组件
- ✅ **M3: A/B 测试框架**
  - experiments 表 + 确定性变体分配 (MD5 哈希)
  - ClickHouse 实验分析 (展示、点击、CTR)
  - 管理端实验页面 (创建/启动/停止/结果)
  - 推荐权重可通过实验变体覆盖
- ✅ **M4: 定时任务与清理**
  - setInterval 调度器 (注册/启动/停止/立即运行)
  - 4 个定时任务: GDPR 删除 (1h)、审计保留 90d (24h)、令牌清理 (6h)、Webhook 清理 (24h)
  - 管理端任务状态 + "立即运行" 按钮
  - 5 个 E2E 冒烟测试

### 迭代 7: 测试修复 ✅ (2026-02-15)
- ✅ **M1: vue-i18n 基础设施** — 安装 vue-i18n@10，配置 i18n 插件
- ✅ **M2: 客户端测试清理** — 移除 8 个断裂导入，创建缺失组件/工具存根，6 个测试添加 i18n
- ✅ **M3: 服务端存根** — worldbook/worldinfo-engine/tokens 存根文件
- ✅ **M4: 日志回归修复** — usage-tracking + jobs 测试适配结构化日志
- ✅ **M5: DB 测试 Mock 化** — 6 个仓库 + 4 个服务 + 4 个路由 + 2 个基础设施测试
- ✅ **M6: 测试隔离** — 排除 ml-service 和集成测试

### 迭代 8: i18n 全覆盖 ✅ (2026-02-16)
- ✅ **M1: 高频页面** — MyCharacters、Chat、UpgradePrompt、MemoryPanel、CharacterPublishForm (5 文件, ~110 字符串)
- ✅ **M2: 调试+布局+市场** — 调试面板 3 文件、布局 4 文件、市场 3 文件 (~94 字符串)
- ✅ **M3: 分析+管理+个人** — 新增 analytics 区域 28 键、7 个分析组件、3 个管理页面、3 个个人页面、UsageDashboard (~100 字符串)

### 迭代 6: 生产就绪 ✅ (2026-02-15)
- ✅ **M1: 代码清理**
  - 移除 6 个 PLACEHOLDER 注释
  - 修复 MyCharacters 卡片点击导航
  - 修复 AuditLogs 日期过滤器
  - 添加 17 个 i18n 国际化键
- ✅ **M2: 结构化日志**
  - 替换 57+ 个 console.log/error/warn 为结构化日志
  - 修复静默 catch 块和误导性错误响应
- ✅ **M3: 性能优化**
  - N+1 查询修复 (批量 updateAccessTimeBatch)
  - Redis KEYS → SCAN 替换
  - 社交端点 60s TTL 缓存
- ✅ **M4: 生产基础设施**
  - Redis 分布式速率限制
  - 优雅关闭 (10s 超时)
  - Stripe 环境变量 Zod 验证
  - 可配置限制 (内存/缓存/推荐 TTL)
  - 4 个专用速率限制器 (评论/举报/导出/分析)

### 迭代 4: 平台加固 ✅ (2026-02-11)
- ✅ **M1: 邮件服务**
  - Nodemailer + SMTP/SES 传输层
  - HTML 邮件模板 (验证、密码重置、欢迎)
  - 密码重置流程 (SHA-256 令牌、1小时过期、防枚举)
  - 邮件验证流程 (注册时发送、重发限流)
  - 前端页面: 忘记密码、重置密码、邮件验证
- ✅ **M2: OAuth/SSO**
  - Arctic 库 (Google + GitHub OAuth2 PKCE)
  - 账户自动关联 (邮箱匹配)
  - oauth_accounts 表 + 仓库
  - 前端 OAuth 按钮 + 回调页面
- ✅ **M3: 双因素认证 (2FA/MFA)**
  - TOTP (otpauth 库) + QR 码设置
  - 10 个备用恢复码 (bcrypt 哈希)
  - AES-256-GCM 加密密钥存储
  - 登录流程 MFA 挑战 (5分钟令牌)
  - 前端安全设置页面 + MFA 挑战对话框
- ✅ **M4: 管理面板 + RBAC**
  - 三级角色: user / moderator / admin
  - requireRole() 中间件 (层级权限)
  - 举报系统 (reports + moderation_actions 表)
  - 管理 API: 用户管理、内容审核、系统统计
  - 前端管理面板: 用户列表、审核队列、系统仪表盘
- ✅ **M5: 审计日志**
  - audit_logs 表 (4 个索引)
  - 异步写入 (fire-and-forget)
  - IP 地址 SHA-256 哈希
  - 全服务集成 (认证、OAuth、MFA、管理、举报)
  - 管理端审计日志查看器 (分页 + 过滤)
- ✅ **M6: GDPR/CCPA 合规**
  - 数据导出 (ZIP 归档, 10 类数据, 敏感字段过滤)
  - 账户删除 (30天宽限期, 可取消)
  - 同意管理 (analytics/marketing/cookies)
  - 管理端 GDPR 请求监控
  - 8 个 E2E 测试

---

## 📈 技术指标

| 指标 | 数值 |
|------|------|
| 单元测试 | 1337 通过, 0 失败 (17 跳过) |
| E2E 测试 | 130/142 通过 (含 5 个技术债务+推荐) |
| i18n 覆盖 | 86 Vue 文件 100% 覆盖, ~490 locale 键 (en-US + zh-CN) |
| 结构化日志 | 57+ console.* 替换为 pino child loggers |
| API 端点 | 120+ |
| 数据库表 | 24 张 (PostgreSQL) + 8 张 (ClickHouse) |
| Flink 作业 | 6 个 (Java 17) |
| Kafka Topics | 5 个 |

---

## 📅 时间线

```
2026-01-31  Phase 1-2 完成
2026-02-01  Phase 3-4 完成
2026-02-03  Phase 5 完成
2026-02-04  Phase 6 完成
2026-02-05  Phase 7 完成 + 智能角色系统
2026-02-06  智能系统调试面板 + 系统集成修复
2026-02-07  世界书系统 + 智能系统改进 (18 项)
2026-02-08  多模态图片 + PWA + 多设备同步 + UX 改进 + 前端大修
2026-02-09  迭代 2 完成 (EventBus/Webhooks + 社交 + 开发者API + 插件系统)
2026-02-10  迭代 3 完成 (Kafka + Flink + ClickHouse + 分析仪表盘)
2026-02-11  迭代 4 完成 (邮件 + OAuth + 2FA + 管理面板 + 审计 + GDPR)
2026-02-15  迭代 5 完成 (技术债务修复 + 推荐引擎 + A/B 测试 + 定时任务)
2026-02-15  迭代 6 完成 (代码清理 + 结构化日志 + 性能优化 + 生产基础设施)
2026-02-15  迭代 7 完成 (测试修复: vue-i18n + 存根 + Mock + 隔离)
2026-02-16  迭代 8 完成 (i18n 全覆盖: 27 文件 ~304 字符串 → $t() 调用) ← 当前
```
