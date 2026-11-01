# 故事对话工作空间扩展

日期：2026-10-31。根据用户提供的 1680px 会话页面截图，正文和输入仍显得狭窄。本轮解除工作台接入后遗留的内层宽度限制。

## 原因与变化

- 叙事正文 `.markdown-content` 和用户消息 `.user-text` 被 `--chat-measure: 36em` 限制，桌面约 580px；现在工作台会话中允许占满正文列，正文最大列宽 1120px。
- `MessageInput` 自身最大宽度 720px；工作台会话中现扩至 1120px。
- 推荐行动、开局正文、听众提示和额度行跟随 1120px 工作区；桌面正文为 20px/1.95 行高，手机为 18px/1.9。
- 分支存档导航桌面默认收成 48px 轨道，把主要宽度留给对话；用户可以展开，选择保存在浏览器并跨故事会话保持。手机仍使用原有抽屉交互。

## 验证

- 分支栏偏好与 ChatWindow 定向测试 20/20 通过；`npm run type-check`、`npm run build:client` 和 `git diff --check` 通过。
- 部署前远端 `generation_requests` 中 `accepted`/`running` 记录为 0。
- 正式应用、PostgreSQL、Redis、ML 均健康；公网首页及 `/health/ready` 返回 200。
- 既有认证验收令牌在本轮已过期，重新登录受到临时登录频率限制。因此没有声称本轮通过公网私人对话页面的浏览器截图或推荐交互复验。新 CSS/JS 已随构建部署，用户刷新当前会话即可查看扩宽效果。
- 未调用模型，未迁移数据库，未修改故事数据。

## 部署与回退

- 正式镜像：`small-squaretable:remote-20261031-chat-space-final`，ID 前缀 `6eff864d7e28`。
- 基于 `small-squaretable:remote-20261031-workbench-paper` 仅替换 `dist/client`；随后加发可访问性修正镜像，仍然只包含客户端产物。
- 备份在 `/srv/small-squaretable/releases/workbench-chat-space-20261031/`，包含部署前镜像引用、`image.before-accessibility`、Compose、环境文件及增量构建文件。环境文件含密钥，仅保存在远端受限目录。
- 回退时仅将 `.env` 的 `BETA_IMAGE` 恢复为 `image.before` 中的镜像，再重建 app；不要恢复数据库卷或覆盖整个环境文件。
