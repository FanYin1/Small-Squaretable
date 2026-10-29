# 介绍任务：私有回执归档与离线核对

本工具承接[自动介绍队列](story-presentation-queue.md)，只处理“供应商用量已经在共享账本核销，但应用未保存结果”的有据恢复。不是重新生成入口，也不允许用人工填写的零用量释放未知占用。属于 EXP-ADAPT 的 AD-1/4 恢复链路，不等于第三方数值机制适配。

## 1. 归档边界

工作区的 `scripts/story-presentation-worker.mjs` 默认在配置文件同级 `presentation-receipts/` 创建700权限目录；也可在私有配置中设置 `PRESENTATION_WORKER_RECEIPTS_DIR`。目录不存在时创建，已有目录必须为私有真实目录，不能是符号链接。

受控网关返回完整的非流式响应后，provider 在返回数据库处理代码之前写入600权限、按 dispatch UUID 命名的不可覆盖回执，文件及目录同步落盘。回执包括版本、账本/批次/dispatch、请求和响应摘要、模型/协议及原始响应；不保存完整提示词或供应商密钥。响应仍可能包含模型生成的私密文本，应只放在服务器私有目录，不能公开或提交 Git。

每份原始响应最多65,536字节。已有文件不覆盖；保存失败不重新调用模型。目录数量/磁盘生命周期由管理员管理，本工具不删除历史证据。调用前检查目录，调用后磁盘失败仍有可能，不能因此认为免费。

**局限：仅能恢复已归档的完整响应。** 网关已结算但响应没到worker、写回执前进程退出、供应商根本没给完整正文或用量，都不能凭此工具找回。旧调用没有归档的，也不会凭摘要还原正文。私有目录和账本属于受信任的管理员边界，不抵御拥有本机文件写权限的管理员同时篡改二者。

## 2. 只读审计

使用该次调用的私有worker配置和**原有**工程账本：

```bash
node scripts/story-presentation-reconcile.mjs audit \
  --config <private/worker.env> --ledger backups/engineering-model/ledger.json
```

仅查询配置中的账户/租户，最新100个未知、发出中、取消或失败任务；超过时 `limited=true`，不表示全库审计完成。输出任务ID、dispatch、状态、账本是否存在/已核销/未知及记录用量，不输出角色正文或回执内容。

- `not-in-ledger` 不代表免费、未发出或允许重试；可能配置了错误账本或根本未能预留。
- `pending/unknown` 仍保留占用；本工具不核销、不关闭批次、不修改账本。
- `conflict` 表示本地用量和账本不一致，必须停下核对，不能覆盖旧凭据。
- `settled` 仅说明账本有回执，用量已知；还需要原始正文、来源和状态校验才能恢复介绍。

`audit` 与下面的 `plan` 使用只读数据库事务，以及不创建锁文件、不重写账本的快照读取。它们不调用网关、供应商、记忆服务或点数服务。

## 3. 预览单个恢复计划

```bash
node scripts/story-presentation-reconcile.mjs plan \
  --config <private/worker.env> --ledger backups/engineering-model/ledger.json \
  --receipt <private/presentation-receipts/dispatch-uuid.json> --job <job-uuid>
```

必须匹配原账本ID、批次、dispatch、模型和协议，以及已核销的请求摘要、响应SHA256和真实用量。使用同版本请求构造器，复核当前公开候选生成的请求摘要；不能把另一次对话的响应套进来。Gemini包括已计费思考token。未核销、缺正文、未知用量、篡改、过大文件、不安全权限或活动请求均拒绝。

计划只输出状态变化、账本引用、已知token及 `fingerprint`，不会包含介绍正文。这个指纹绑定任务状态、来源修订、公开性及回执；不是付费授权。修改源卡、取消任务或并发处理后，需要重新预览。

## 4. 显式应用

```bash
node scripts/story-presentation-reconcile.mjs apply \
  --config <private/worker.env> --ledger backups/engineering-model/ledger.json \
  --receipt <private/presentation-receipts/dispatch-uuid.json> --job <job-uuid> \
  --fingerprint <plan输出的64位指纹>
```

单个数据库事务锁定任务与卡片并重新复核：

| 情况 | 结果 |
|---|---|
| 未知/过期dispatch，原卡仍有效，选择有据 | 保存一个派生版本和已知用量，变为complete |
| 模型明确选择null | skipped，仅记已知用量 |
| 选择无效/输出不满足协议 | failed，仅记已知用量，不重试 |
| 作者已编辑、开场改变、角色已公开 | stale，保留作者内容，不采用旧结果 |
| 已取消或其他终态 | 保持原终态，只补同一调用的缺失用量，不复活任务 |
| 同一回执已处理 | alreadyApplied，不新增派生版本 |
| 回执或旧计划冲突 | 拒绝，原件、用量和状态不变 |

采用派生介绍，不写原卡、世界书、旧故事、点数或预算账本。只处理指定任务，不顺便消费其他排队任务。批次已关闭、网关已停止均可运行；配置不用供应商密钥。目标库仍限定本机隔离测试库或经过Docker地址核对的3081库，不能连接3080或任意数据库。

若账本未核销，先由管理员依据真实外部证据使用既有[预算对账流程](engineering-model-budget.md)处理；这里不会自动将预留转成零或仅凭一个JSON文件修改工程额度。没有可信原始回执就保持未知。

## 5. 验证

```bash
node --test scripts/presentation-receipts.test.mjs scripts/presentation-queue-provider.test.mjs scripts/engineering-model-budget.test.mjs
npx vitest run src/server/services/presentation-reconciliation.service.spec.ts
node scripts/exploration-entry-check.mjs --adapter
```

最后一条必须不设置 `PRESENTATION_REAL_GATEWAY_CONFIG` 才是零真实供应商检查。覆盖受控HTTP归档后应用丢失结果、离线CLI、只读审计、并发重复应用、旧计划、作者修改、取消/公开、无效选择、不同账户/租户/dispatch及网关停止后的恢复。合成回执不冒充真实供应商质量验收。

本工具交付在工作区，不是后台管理页面或常驻付费服务，不需要数据库迁移。实际3081写入需逐条预览后显式应用，不能将隔离写入测试说成已修改真实用户卡片。
