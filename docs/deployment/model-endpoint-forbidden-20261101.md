# 模型地址缺少 API 前缀导致 Forbidden

2026-11-01（香港时间）。用户反馈简单配置后出现 `LLM API error: Forbidden`。本次修正远程生产配置，对应 INV-05/08，不代表真实模型质量验收。

## 现场证据

远程加密运行配置的自定义渠道使用 OpenAI 兼容协议，地址为 `https://code.mmkg.cloud`，模型为 `glm-5.3-flash`。本项目直接在地址后追加 `/chat/completions`，不会自动补 `/v1`。

在远程应用容器内使用已配置密钥进行非生成检查，未输出密钥：

| 请求 | 结果 |
| --- | --- |
| GET `/`（无认证） | 403，HTML Access Denied |
| GET `/models`（已配置认证） | 403，HTML Access Denied |
| GET `/v1/models`（同一认证） | 200，包含 `glm-5.3-flash` |
| HEAD `/chat/completions` | 403，HTML |
| HEAD `/v1/chat/completions` | 404，text/plain |

这些结果确认未带 API 前缀的地址被网关拒绝；同一密钥可以访问带前缀的模型列表。HEAD 的 404 不证明 POST 生成接口不可用，也不能算生成成功。现有应用日志只保留了泛化的 WebSocket 处理错误，没有上次失败的供应商原始响应；不能把本轮探测冒充上次 POST 的完整取证。

## 已执行修正

- 只将自定义渠道 `baseUrl` 改为 `https://code.mmkg.cloud/v1`；预期聊天请求地址为 `https://code.mmkg.cloud/v1/chat/completions`。
- 加密密钥、模型列表、别名、协议、请求选项、容量等其他配置字段逐项比较均未改变。
- 修改前检查生成、记忆与适配运行任务合计为 0；核对原配置 SHA-256，停止 app 后原子替换配置，再启动同一容器加载配置。未改镜像、数据库或其他容器。
- 远程权限受限备份：`/srv/small-squaretable/releases/model-baseurl-20261031T163823Z/llm-config.encrypted.backup.json`。未复制到产品文档或输出其内容。

## 核验与限制

修正后从实际配置拼接的 GET `/models` 返回 200，配置模型在列表中。公网 `/health/ready` 为 200，app、PostgreSQL、Redis、ML 四容器健康，启动日志没有配置恢复错误。应用镜像仍为 `small-squaretable:remote-20261031-model-list-refresh`。

本次没有 POST 生成、自动重试用户消息或改动工程预算。既有未知用量暂停规则仍有效；真实聊天、该密钥的生成权限以及剧情结构/推荐/记忆仍未验证。用户后续正常发送新消息可确认实际生成结果，不能仅凭模型列表成功关闭供应商验收。
