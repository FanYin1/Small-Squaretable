# A · 书页工作台正式接入

日期：2026-10-31。用户确认将 A 方案应用到正式前端，本轮完成统一工作台外壳、阅读布局和资料抽屉的正式接入。

## 实际变化

- 首页、我的库、角色详情、创作页和故事对话共用左侧导航、顶部工作台栏和统一页面过渡。
- 桌面侧栏可手动收起/展开，并跨路由保留；移动端使用覆盖式抽屉，带暗幕、正文 `inert`、Escape 关闭和焦点恢复。
- 对话页保留角色封面与标题，正文使用更宽的阅读区域；输入区独立固定，推荐行动位于正文滚动区域末端。
- 资料、阅读设置和额度信息按需展开；每轮推荐按钮、直接发送和已有故事状态读取逻辑保持不变。
- B · 简约工作室和 C · 夜航仍保留在工作台原型页供比较，没有接入正式应用。

主要源码：[WorkbenchShell.vue](../../src/client/components/layout/WorkbenchShell.vue)、[workbench.ts](../../src/client/components/layout/workbench.ts)、[workbench-paper.css](../../src/client/styles/workbench-paper.css)、[Chat.vue](../../src/client/pages/Chat.vue)。

## 验证

- `npm run type-check`：通过。
- 定向客户端测试：5 个文件、121/121 通过；语言断言改为跟随当前 locale，中文默认页不再误报英文断言失败。
- `npm run build:client`：通过。
- `git diff --check`：通过。
- 公网 Chromium 直连检查：1440px 和 390px 各覆盖首页、故事库、开局选择、角色详情、既有对话；开局选择显示 10 个入口，既有对话显示 3 个推荐按钮。
- 桌面侧栏状态跨路由保持；移动端抽屉暗幕、正文禁止操作、Escape 和焦点恢复通过；资料抽屉可打开/关闭且不影响正文；两种尺寸无横向溢出；页面错误为空。
- 公网 `/health/ready` 返回 200，应用、PostgreSQL、Redis、ML 容器均健康。

浏览器检查脚本：[workbench-paper-check-20261031.mjs](../../scripts/workbench-paper-check-20261031.mjs)。检查使用既有验收账户，只读取页面和既有故事，没有发送模型生成请求。

## 部署与回退

- 正式镜像：`small-squaretable:remote-20261031-workbench-paper`，镜像 ID 前缀 `8b3581bc46c1`。
- 部署目录：`/srv/small-squaretable/releases/workbench-paper-20261031/`。
- 该目录保存 `compose.before.yml`、`env.before`、`image.before` 和前端覆盖构建资料；环境文件含密钥，仅留远端受限目录。
- 远程 Docker Hub 无法拉取 `node:22-bookworm-slim`，因此使用当前线上 `small-squaretable:remote-20261030-page-perf` 作为基底，只覆盖本地已通过构建的 `dist/client`。没有执行数据库迁移，没有重建数据库、Redis 或 ML 容器。
- 回退时只把 `.env` 的 `BETA_IMAGE` 恢复为 `image.before` 中的镜像，然后使用 `docker-compose --env-file .env -f compose.yml up -d --no-deps app`；不要恢复数据库卷或覆盖整个环境文件。

真实模型连续多轮、记忆更新、手机真机和用户人工视觉签收仍保留原有验收边界；本轮未调用付费模型。
