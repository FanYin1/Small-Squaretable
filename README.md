# 小方桌 Small Squaretable

> 从一张角色卡开始，成为故事中的自己。

小方桌是一款角色卡驱动的互动故事应用。选择角色与开场，通过推荐行动或自由输入推动剧情，在自己的故事档案中继续上次的经历。我们希望每次选择都能得到认真回应，让人物关系、已发生的事和对话风格逐步形成连续的体验。

**当前阶段：本机内测候选，尚未完成最终体验验收。** 当前聚焦单人故事；群聊开发已暂停。工程实现、部署检查与用户签收分别记录，进度以[当前开发状态](docs/product/current-work.md)为准。

## 体验与能力边界

| 体验 | 当前实现 | 边界 |
| --- | --- | --- |
| 从角色卡开始 | 发现角色、私人角色库、开场选择与身份设置 | 导入成功不代表原卡全部机制可运行 |
| 探索式对话 | 开局与每轮回复推荐、自由输入、流式回复 | 无规则卡的通用建议会标注来源；异常或中断轮次不能冒充已执行行动 |
| 状态与地图 | 展示有依据的状态、已知地点、历程和规则行动 | 按卡片的受支持规则呈现，不为缺少设定的卡虚构地图、资产或奖励 |
| 连续故事 | 故事独立记忆、设定快照、阅读恢复、纠正与分支 | 不承诺无限记忆或模型永不遗忘；长程叙事质量仍需验证 |
| 创作与导入 | PNG/JSON 角色卡、世界书、编辑预览及有限适配工作流 | 世界书按明确绑定使用；复杂第三方脚本与持续规则不保证等价转换 |
| 故事管理 | 继续原档、同卡另开故事、卡片右上角确认删除 | 删除的是选中的故事存档，不是来源角色卡 |

仍在推进：更多第三方规则适配、逐卡长程体验、真实模型纠正续写、偶发故障排查，以及人工视觉与手机真机验收。见[活动待办](docs/product/backlog.md)。当前内测采用预付点数；在线支付和公网运营不属于已完成交付。

## 页面截图

以下图片均为浏览器实际渲染的产品页面，不是生成图片或设计稿。**截图中的故事与账号使用测试数据，不代表真实用户记录或真实模型叙事质量。**

### 我的故事：桌面与手机

2026-10-29，当前源码生产构建的浏览器截图；接口使用测试替身。每张故事卡片右上角提供独立删除按钮，点击后确认，失败保留卡片供重试。

![我的故事桌面页面，卡片右上角提供删除按钮](docs/images/story-library-desktop.png)

<details>
<summary>查看手机页面</summary>

<img src="docs/images/story-library-mobile.png" alt="我的故事手机页面，删除与继续阅读为独立操作" width="390" />

</details>

### 发现角色

下图为 2026-10-25 正式构建在隔离验证环境中的历史截图，用于展示角色发现布局；不代表当前版本的全部细节。[截图来源与验证边界](docs/design/exploration-07ac-integration/README.md)。

![角色发现页面的历史浏览器截图](docs/design/exploration-07ac-integration/production-discover-1440-dark.webp)

## 本机试运行

建议先采用独立的 Docker 内测环境。需要 Git、Node.js 22、Docker Engine 和 Docker Compose v2；Compose 提供 PostgreSQL 15 / pgvector 和 Redis 7。

以下流程适用于**全新安装与空数据库卷**。已有实例先备份并按[部署与恢复说明](docs/deployment/beta-release.md)操作，不重新初始化账号或删除数据卷。

```bash
git clone https://github.com/FanYin1/Small-Squaretable.git
cd Small-Squaretable
npm ci
node scripts/beta-config.mjs
```

配置生成器会创建私有 `.env.beta` 并拒绝覆盖已有文件。私下编辑配置，填写模型端点、密钥和模型名称，检查每日用量上限。自定义模型容量配置见[模型容量说明](docs/deployment/custom-model-capacity.md)，Gemini 接口见[供应商接入说明](docs/deployment/gemini-provider-integration.md)。

```bash
docker compose --env-file .env.beta -f compose.beta.yml config --quiet
docker compose --env-file .env.beta -f compose.beta.yml build app
docker compose --env-file .env.beta -f compose.beta.yml up -d
curl --fail http://127.0.0.1:3080/health/ready
```

默认访问 `http://localhost:3080`，仅绑定本机；现有项目的 3081 验收实例是单独配置的环境。Compose 在启动应用前执行 beta 迁移。首次使用还需按[内测部署说明](docs/deployment/beta-release.md#第一个运营账号)生成邀请码、注册和初始化运营账号，再导入角色卡并配置点数。模型与邮件服务由部署者自行配置；健康检查通过不代表模型可生成或邮件可发送。

可导入仓库自带的[雨夜唱片店示例卡](docs/product/examples/rainy-record-shop.json)开始体验，不包含第三方私人角色卡或用户存档。

## 开发与验证

前端采用 Vue 3、Vite、TypeScript、Pinia 和 Element Plus；后端采用 Node.js、Hono、Drizzle ORM、PostgreSQL / pgvector 和 Redis。角色适配相关依赖包含 LangChain / LangGraph，当前能力仍受上述适配范围限制。

仓库保留 Stripe、Kafka、Flink、ClickHouse 等历史与可选模块，它们不是本机故事内测的必需服务，也不代表当前全部启用。

```bash
npm ci
npm run type-check
npm run build
```

本地开发须单独配置 `.env`，使数据库、Redis、认证和模型设置指向开发环境。前后端分别启动：

```bash
npm run dev          # 后端，默认 3000
npm run dev:client   # 前端，默认 5173，代理 API 和 WebSocket
```

数据库初始化参照上述 beta 空库流程与部署文档；不要直接对存量业务库套用基线。`db:migrate:beta` 依赖 `dist/server/migrate.js`，在宿主机运行前须先执行 `npm run build:server`。旧迁移目录与 beta 基线有不同适用范围。

常用验证命令：

```bash
npx vitest run src/client/components/chat/StorySaveCard.spec.ts
npx playwright test -c playwright.story.config.ts
npm run lint
```

组件测试、受控接口的浏览器测试、真实模型验证和真机验收分别报告。历史测试数量不作为当前版本通过率或完成度。

## 文档导航

- [当前开发状态](docs/product/current-work.md)：现状、开放工作包与验收边界。
- [产品体验基线](docs/product/exploration-experience-baseline.md)：已确认的产品决策。
- [开发计划](docs/product/story-development-plan.md)与[活动待办](docs/product/backlog.md)。
- [角色卡格式](docs/deployment/character-card-formats.md)与[世界书绑定](docs/deployment/worldbook-bindings.md)。
- [本机部署](docs/deployment/beta-release.md)与[探索候选历史验收](docs/deployment/exploration-candidate.md)。历史镜像不作为当前运行版本的证明。
- [历史工程路线图](ROADMAP.md)：早期平台建设记录，不代表当前故事体验已全部验收。
- [贡献指南](CONTRIBUTING.md)与[协作规则](AGENTS.md)。

## 许可证

历史工程说明标注为 MIT，但仓库目前没有独立的 LICENSE 文件，具体授权文本仍需维护者补充确认。
