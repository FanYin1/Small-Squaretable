# 后台模型管理与用户列表修复

2026-10-31，补齐管理员模型配置编辑，并修复用户管理列表为空的问题。

## 模型管理

- 页面：`/admin/models`
- API：`GET/PUT /api/v1/admin/models`
- 管理员可以编辑协议、端点、模型列表、默认模型和容量 JSON。
- API 密钥只允许写入，读取接口只返回 `hasApiKey`；密钥使用 AES-256-GCM 加密后保存在 `/app/config/llm-config.json`。
- 配置通过独立 Docker 卷持久化，保存后即时更新当前进程；应用重启会自动加载。原远程环境变量配置作为首次默认值。
- 模型容量字段仍要求精确模型名，并校验 `contextWindow`、`maxOutputTokens`、`requestOutputTokens` 的关系。

## 用户管理修复

后端用户列表返回 `items/pagination`，前端此前按不存在的 `users/total` 读取，导致页面显示空表。现已按服务端结构读取，并修正用户详情接口的 `user/subscription/oauthAccounts` 包装层。

## 验证与发布

定向单元测试 38 项通过，LLM 配置校验、类型检查、客户端/服务端构建、JSON 和补丁检查通过。远程镜像为 `small-squaretable:remote-20261031-admin-edit-users`（`sha256:9fb624698935ecf7ade59a21a34ae4001aef6a1b56f80650ce4f040d43546716`），应用健康、数据库、Redis 和 ML 均正常；配置卷 `/app/config` 已挂载。普通验收会话访问两个管理员接口均返回预期 403，普通模型列表返回当前 `gemini-3.8-flash` 的 1M 上下文和 64K声明能力。

未执行数据库迁移、模型调用或故事修改。使用“凡音”账号重新登录后，进入后台模型管理和用户管理即可查看；模型配置保存后不需要手动重启。

回滚资料保存在远程 `releases/admin-edit-users-20261031/`，包括发布前 `.env` 和 Compose 配置；回滚只替换 app 镜像并保留配置卷及业务数据。
