# 本机内测部署

基础安装流程沿用 beta.1；前端 R5 候选默认镜像为 `small-squaretable:0.1.0-beta.2-r5`，可通过 `BETA_IMAGE` 指定版本。最新验证、视觉签收与回退信息见 [R5 验收记录](frontend-r5-acceptance.md)。已有内测环境不要再次生成配置、初始化用户或重新导入数据。

本版本面向单实例、邀请码准入的互动故事内测。默认预付点数、关闭 NSFW 和可选模块，不包含在线支付、多实例生成接管、跨设备阅读位置或存量数据库自动升级。

## 全新安装

要求 Docker Engine、Docker Compose，域名公开访问时使用支持 WebSocket 的 HTTPS 反向代理。以下命令均在仓库根目录执行。

```bash
node scripts/beta-config.mjs
docker compose --env-file .env.beta -f compose.beta.yml config --quiet
docker compose --env-file .env.beta -f compose.beta.yml build app
docker compose --env-file .env.beta -f compose.beta.yml up -d
curl --fail http://127.0.0.1:3080/health/ready
```

配置生成器以 0600 权限创建 `.env.beta`，拒绝覆盖已有文件，为数据库、访问令牌、刷新令牌和 TOTP 生成独立密钥。它只从原 `.env` 复制自定义模型服务和 SMTP 相关配置，不复用业务数据库或用户认证密钥。`.env.beta` 已被 Git 和 Docker 构建上下文排除；密钥不要粘贴到工单或构建日志。

首次生成后检查 `.env.beta`：`APP_URL` 是完整访问来源，公开访问时填写实际 HTTPS 域名；`PLATFORM_DAILY_TOKEN_LIMIT` 是每日 token 熔断阈值；模型配置需要正确的兼容端点、密钥、模型列表与默认模型。模型列表可查询不代表有生成额度；必须验证一次短生成。SMTP 未配置时，邮件验证、找回密码不具备交付条件。关闭外部注册宣传，直到邮件与模型验证通过。

应用仅绑定 `127.0.0.1:3080`，PostgreSQL 和 Redis 不映射宿主机端口。反向代理把 `/` 与 `/api` 转发到该地址，`/ws` 保留 Upgrade/Connection 请求头，读取超时应覆盖长生成；代理应覆盖而不是透传访客自报的 `X-Forwarded-For`、`X-Real-IP`。应用读取可信代理设置的来源 IP 做限流。不要直接向公网开放容器内部 3000 端口。

## 可选 HTTPS 入口

仓库提供 `compose.beta.https.yml` 与 `deploy/Caddyfile.beta`。域名确定后，在 `.env.beta` 增加 `BETA_DOMAIN=story.example.com`（仅主机名，不含协议、路径或端口），并把 `APP_URL` 设为同一来源 `https://story.example.com`。将真实域名的 DNS 指向部署主机，确保 80 / 443 可达且未被其他服务占用，先完成模型、邮件和运营初始化，再运行：

```bash
docker compose --env-file .env.beta -f compose.beta.yml -f compose.beta.https.yml config --quiet
docker compose --env-file .env.beta -f compose.beta.yml -f compose.beta.https.yml run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.beta -f compose.beta.yml -f compose.beta.https.yml up -d --no-build
```

此覆盖文件为应用统一设置 HTTPS 的 `APP_URL`、CORS 来源与 OAuth 回调，并通过 Docker 内网连接应用。Caddy 自动申请与续期公开证书，支持 WebSocket 和流式传输，覆盖来源 IP 请求头、移除访客自报的 Cloudflare IP；默认不启用访问日志，避免记录 WebSocket URL 中的认证令牌。不要在 Caddy 前额外添加 CDN 或代理而沿用这份单代理来源 IP 配置。

可在已安装开发依赖的 Linux Docker 主机上运行 `npm run release:proxy-check`，使用独立网络、临时 Node 上游和 Caddy 容器验证 TLS、路径 / 查询串转发、SSE 分块、WSS 升级及来源 IP 头覆盖，完成后自动清理。默认仅占用回环端口 55443，可用 `BETA_PROXY_CHECK_PORT` 调整；需要本机存在或能够拉取 `node:22-bookworm-slim` 与 `caddy:2-alpine`。本地检查使用 Caddy 的 localhost 证书，检查客户端仅在此次隔离验证中关闭证书信任校验，不能替代真实域名证书、应用认证或公网验收。

验证真实 HTTPS 首页、深链接、邮件链接、登录与生成，并确认伪造来源 IP 无法绕过限流。后续启动、更新与查看日志都保留这两个 `-f` 参数。证书与账户保存在独立 `caddy-data` / `caddy-config` 卷，按私密运维数据保护；不要执行 `down -v`。只用基础 Compose 文件仍保持本机内测，不会启动此公网入口。当前未配置真实域名，不代表证书签发或公网链路已经验收。

## 数据库边界

`migrate` 服务等待 PostgreSQL 就绪后执行 `db:migrate:beta`，成功后才启动应用。Beta 安装使用 `src/db/beta-migrations` 和独立 `beta_release.__drizzle_migrations`。基线来自当前完整 schema，并包含全文搜索、trigram 索引和点数账本不可改写触发器。

**只支持全新空库。** 未初始化 beta 标识但包含业务表的数据库会以 `BETA_REQUIRES_EMPTY_DATABASE` 拒绝；不要创建 beta 标识绕过保护。旧 `src/db/migrations` 历史与 journal 存在不完整和重复定义，不能把此基线套入现有业务库，也不能声称旧库升级已通过。现有库升级须对照实际 schema 单独审查，参考 `generation-requests.md` 与 `chat-creation.md`；上线前备份并在恢复副本演练。

已安装的 beta 库重复迁移不会重复建表。此版本不支持多节点部署，发布更新前停止接收生成并等待正在执行的请求结束；进程崩溃遗留请求不会自动接管或自动重发。

## 第一个运营账号

```bash
docker compose --env-file .env.beta -f compose.beta.yml exec app node scripts/beta-admin.mjs invite
```

该命令输出一个 24 小时内有效、仅可使用一次的邀请码。本人在 `/auth/register` 创建账号、设置密码并完成成年声明。然后对该已注册账号执行：

```bash
docker compose --env-file .env.beta -f compose.beta.yml exec -e BETA_ADMIN_EMAIL=operator@example.com app node scripts/beta-admin.mjs first-admin
```

首次管理员初始化在事务内检查不存在任何管理员，写入审计记录，成功后拒绝再次提权。退出再登录以刷新令牌。后续邀请码、用户管理、点数充值和冲正在后台完成；不要通过直接改账本余额充值。先创建并预览一张非 NSFW 故事卡，按发布审核流程让其进入发现页，再发放普通内测用户的邀请码。

可在角色管理的导入入口选择 [`rainy-record-shop.json`](../product/examples/rainy-record-shop.json)，得到一张中文温柔悬疑故事卡。它不依赖外部封面或世界书，包含身份名字宏、开场、互动范例与角色边界。导入后仍为私有草稿，运营者须先预览并完成发布审核；此文件不会自动创建账号、确认年龄、充值或绕过审核。

## 验收

- `/health/ready` 必须返回 200 且数据库、Redis 均正常；Redis 故障返回 503。首页、登录和 `/chat/:chatId` 深链接可加载，API 和不存在的静态文件保留 404，生产包不提供视觉演示和分析报告。
- 注册必须需要有效邀请码和成年声明。用普通用户完成发现、详情、身份确认、进入阅读；刷新后仍能加载正文。
- 预付模式充值后发送一次行动，确认流式输出、停止后正文保留、余额冻结释放，流水与关联故事可追溯。余额为零时提供余额入口；网络异常不显示猜测费用。订阅模式隐藏点数控件。
- 确认上游异常不会制造成功回复或重复收费，同标识消息与聊天创建重放不重复执行。
- 在 390×844、768×1024、1440×1000 的浅色、暗色界面检查阅读、输入、费用提示和弹层。真实手机软键盘需要真机补验。

开发回归：`npm run type-check`、`npx vitest run`、`npx playwright test -c playwright.story.config.ts`、`npm run build`。

真实服务隔离检查使用一次性 `squaretable_beta_test` 数据库与回环 Redis 55449，先执行 beta 迁移，再执行 `DATABASE_URL=... REDIS_URL=redis://127.0.0.1:55449 BETA_SMOKE_BROWSER=1 npm run release:smoke`。此脚本真实运行生产产物、PostgreSQL、Redis、HTTP、WebSocket、账本与浏览器，但模型上游是受控本地替身，**不能作为真实模型服务通过的证据**。截图写入 `/tmp/squaretable-beta-screenshots`，不要把包含用户凭据的日志或浏览器状态纳入仓库。

在支持 host 网络的 Linux Docker 主机上，增加 `BETA_SMOKE_IMAGE=small-squaretable:0.1.0-beta.1` 可直接检查待发布镜像，避免宿主机依赖或环境变量掩盖容器问题。测试会启动临时容器，以 0600 临时环境文件传入独立认证密钥，结束时停止容器并删除临时文件。它仍只允许指定的一次性数据库和隔离 Redis，不可指向实际 beta 或业务库。运行前需安装宿主机测试依赖和 Playwright Chromium；未设置此变量时检查本地 `dist/server/index.js`。

## 备份与回退

备份目录需仅运营账号可访问；数据库与上传目录必须一起备份，敏感配置密钥单独安全保管。

```bash
umask 077
mkdir -p backups/beta
docker compose --env-file .env.beta -f compose.beta.yml exec -T postgres pg_dump -U squaretable -d squaretable_beta -Fc > backups/beta/database.dump
docker compose --env-file .env.beta -f compose.beta.yml exec -T app tar -czf - -C /app uploads > backups/beta/uploads.tar.gz
```

发布前记录已验证镜像 ID，把镜像保存到安全位置，停止 app 后再切换版本；不执行 `down -v`。只有应用改动且数据库版本兼容时可恢复旧镜像；涉及 schema 的回退需要先停机，将数据库与上传文件恢复到独立环境并验收，再切换入口。不要对运行中的业务库直接覆盖恢复。

运维观察 `docker compose ... ps`、`logs --tail 100 app migrate` 与健康端点，关注生成失败率、未释放冻结、每日 token、数据库磁盘和上传磁盘；健康通过不代表模型额度正常。发现模型额度耗尽时先暂停发放邀请码、检查上游额度，保留已有正文与账本。
