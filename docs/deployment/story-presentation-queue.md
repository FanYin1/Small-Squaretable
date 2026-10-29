# 本机内测：自动介绍队列

固定范围见[队列契约](../product/story-presentation-queue-contract.md)。默认创建/导入私有卡时，与角色和内嵌世界书在同一事务排队；已有有效介绍或无候选资料记为跳过，公开卡不排队。历史卡不自动回填，不按编辑次数自动触发收费。

详情的“介绍整理”区域显示当前状态并允许停止采用。页面轮询只是读取，不触发模型；没有运行预算 worker 时明确显示等待。常驻 Web 服务不会直接使用供应商密钥消费此队列，也不自动扣用户点数。

## 启动有限 worker

先按[共享工程网关](engineering-model-budget.md)在**现有**私有账本核对余额并开有界批次。不得重新初始化账本、直接给 worker 使用 `.env.beta`，或将累计工程授权当运营额度。

worker 使用权限600的独立配置文件，包含网关生成的 `CUSTOM_LLM_*`、`ENGINEERING_MODEL_GATEWAY_LEDGER_ID`、`ENGINEERING_MODEL_GATEWAY_BATCH_ID`，另加：

```text
PRESENTATION_WORKER_DATABASE_URL=<明确目标数据库连接>
PRESENTATION_WORKER_USER_ID=<本批授权测试账户UUID>
PRESENTATION_WORKER_TENANT_ID=<该账户租户UUID>
```

不将秘密复制进命令输出或文档。目标仅允许回环 `squaretable_beta_test`，或通过 Docker inspect 复核的 `squaretable-exploration-postgres-1` 当前地址、5432端口及 `squaretable_beta` 库；不暴露数据库端口，也不能连接3080旧候选。

```bash
node scripts/story-presentation-worker.mjs --config <private/worker.env> --max-jobs 1
node scripts/story-presentation-worker.mjs --config <private/worker.env> --max-jobs 4 --watch-seconds 600
```

最多20个任务、最多等待3600秒，网关批次仍限制总token和请求数；最大任务数包含无需网络的恢复/过期处理，不是付费请求承诺。仅处理指定账户/租户，空队列不会访问网关。SIGTERM/SIGINT停止领取新任务，允许当前有界请求结算；强制退出后的请求不会自动重发。

## 持久状态与恢复

`queued → dispatching → received → complete/skipped`。发出前写入唯一dispatch ID，网关以同一ID持久预留；同ID重放在上游调用前被拒绝。只选有来源候选，复用LangGraph收集/选择/校验；不允许自由生成介绍。

- 已发出后断连、超时或进程退出：超过期限显示/记为 `unknown`，保留预算占用，不重试。不能手工将状态改回queued来绕过。
- 已收到且保存了受校验结果：`received`可在网关离线时无网络恢复采用；采用时重新锁定并验证源卡，派生版本与完成状态同事务。
- 取消：不采用迟到结果，但仍保存收到的用量；已发出的调用不自动免费。编辑/公开性变化使结果过期；旧故事、作者介绍不被覆盖。
- 已知无效输出：`failed`保留用量；没有默认重试按钮。缺失用量保留未知，不能猜零。
- 物理删除卡片会级联删除任务，独立共享预算账本仍保留调用凭据，删除不是退费或重新开放额度。

未知调用需要管理员用dispatch ID对照同一私有账本与真实回执，按网关文档核销；无回执不得释放。工作区已补[私有回执归档及离线审计/预览/恢复CLI](story-presentation-reconciliation.md)：新worker完整收到的响应先私有落盘，已核销的匹配回执可在不重发的情况下恢复单个任务。尚未到达worker或未落盘的正文不能恢复；没有允许付费重试的管理界面。公网常驻调度、运营额度分配与图形化对账仍是未完成边界。

本次真实短测仅在隔离数据库使用原始t1：一次4,811 token，无重试，自动采用和页面接口一致；批次已关闭、网关已停止。3081页面和队列接入不代表预算worker当前常驻运行。
