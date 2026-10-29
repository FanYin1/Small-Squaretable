# 共享工程模型预算入口

2026-10-27接续：[自动介绍队列](story-presentation-queue.md)已使用同一入口，网关支持持久`x-engineering-request-id`，同ID重放不会到达供应商；预算加provider共33项受控测试通过。新增真实t1一次4,811 token已核销并关闭批次，当前占用673,338、可分配776,662；下方首批15,440和781,473余额为历史。网关现已停止，非默认常驻消费。

此入口属于EXP-ADAPT的AD-4，解决多个工程脚本及其前后台分别复用余额的问题。2026-10-27通过28项本地受控检查，并已用实际账本完成首批四卡介绍整理：3次真实供应商调用、15,440 token，全部回执核销、批次关闭；未部署产品变更。累计授权与历史用量以[额度台账](../product/engineering-model-test-budget.md)为准，不能以示例账本代替实际余额。

## 记账与边界

`scripts/engineering-model-budget.mjs`操作私有JSON账本；`scripts/lib/engineering-model-gateway.mjs`只在回环地址提供固定供应商、固定模型的代理。供应商密钥留在代理进程，客户端只拿本地临时令牌。账本只记录请求摘要、批次、预留和回执摘要，不存提示词、卡片正文或密钥。

整批上限先占用累计授权。每个请求按UTF-8 JSON字节数、最大输出和1,024余量预留，持久写入后才发送；收到有效用量后用实际token替换该请求预留，不重复计费。批次关闭释放未使用分配，未知请求仍占用。分配、回执及核销采用文件锁、临时文件、fsync和原子替换，目录700、账本600，拒绝符号链接和损坏账本。真实供应商的计量不一定等于该预留算法，不能承诺绝对财务硬上限。

代理同一时刻仅发一个上游请求，前后台竞争返回本地429，不追加付费重试。失败、超时、重定向、缺用量、SSE缺终结、关停和未知回执均保留占用并停止新请求。重启不会自动重发持久pending。实际用量超过预留会记录实际值并停止。流式内容可能先到客户端，回执核销仍在进行；此时下一请求会被拒绝，不能因看到终结内容就跳过账本核对。

支持文本OpenAI聊天及Gemini原生JSON/SSE；必须声明输出上限，拒绝工具、多模态、任意路径和模型。库接口可显式允许OpenAI文本向量模型并共用账本；当前CLI未配置付费向量模型，不能借此宣称所有向量供应商均已接入。长程记忆脚本使用本地MiniLM向量。

## 接入范围

下列入口调用前必须通过认证状态检查并核对账本、批次ID；直接传`.env.beta`供应商配置会拒绝，不能绕过工程台账执行：

- `scripts/character-journey-model-check.mjs`：原有调用参数保持，配置改为代理生成的文件。
- `scripts/story-memory-real-provider-check.mjs`：原有调用参数保持。
- `scripts/story-memory-provider-probe.mjs --config <gateway.env>`。
- `scripts/story-memory-real-longrun.mjs --config <gateway.env>`：前台与记忆子进程共享；`--controlled`仍为无付费隔离模式。
- `scripts/story-intent-real-check.mjs <gateway.env> <owned-fixture.json> <private-report.json>`。
- `scripts/story-presentation-check.mjs draft --config <gateway.env> --card <png/json> --output <private-report.json>`：新增的来源受限介绍摘录；已有介绍不调用模型，保存结果可离线复验。
- `scripts/story-presentation-worker.mjs --config <worker.env> --max-jobs <1..20>`：限定账户/租户的自动介绍队列，配置及恢复边界见[操作说明](story-presentation-queue.md)。

这是已接入工程入口的控制，不是生产全局代理；未接入的其他脚本、外部客户端和正常用户请求不受此账本拦截。不要修改生产配置以强行共享工程额度，也不要停用正常用户记忆队列。

## 操作流程

实际账本已初始化于私有`backups/engineering-model/ledger.json`，后续必须续用，不重新初始化或清空。历史策略为累计授权1,450,000、known448,496、unreceipted6,591，另对历史失败保守占用198,000；这不是失败请求的计费核销。[旧镜像请求约束证据](evidence/engineering-model-historical-reserve-20261027.json)记录估算公式，未知本身仍保留。无法界定的其他未知应使用`hasUnboundedUnknown:true`阻止开批，不能填零绕过。

以下命令是新环境的操作参考，本机后续从status/open继续，不执行init。策略JSON由操作者准备；初始化不会覆盖现有账本。专用私有目录权限700、文件600。

```bash
node scripts/engineering-model-budget.mjs init --ledger <private/ledger.json> --policy <private/history-policy.json>
node scripts/engineering-model-budget.mjs status --ledger <private/ledger.json>
node scripts/engineering-model-budget.mjs open --ledger <private/ledger.json> --batch-policy <private/batch-policy.json>
node scripts/engineering-model-budget.mjs serve --ledger <private/ledger.json> --batch <batch-uuid> --config <private/provider.env> --output <private/new-gateway.env>
```

批次策略为`{"scope":"明确的测试范围","maxTokens":20000,"maxRequests":2}`，仅为形状示例。serve常驻回环随机端口，输出文件必须不存在，文件含本地令牌、账本和批次ID。它不包含上游密钥，但仍需保密。另一个进程使用该文件运行已接入脚本，结束后核对状态；发送SIGTERM/SIGINT会中止上游、保留未核销请求并释放代理锁。

大型卡片可为`serve`显式传入`--max-input-bytes`（默认65,536，范围1,024至1,048,576）和`--max-output-tokens`（默认4,096，最高64,000）。扩大HTTP请求上限不会扩大批次授权；网关仍在发送前按请求体字节数、输出上限和固定余量预留账本额度，超出批次时拒绝上游调用。仅在排查时设置`ENGINEERING_MODEL_GATEWAY_DIAGNOSTICS=1`，日志只包含拒绝码、路径、请求字节数、输出上限和是否已预留，不记录密钥或正文。

```bash
node scripts/engineering-model-budget.mjs status --ledger <private/ledger.json>
node scripts/engineering-model-budget.mjs close --ledger <private/ledger.json> --batch <batch-uuid>
```

未知请求只能用核对过的证据显式核销，receipt JSON为`{"requestId":"请求UUID","actualTokens":123,"evidence":"私有回执路径及摘要"}`，再执行`settle --ledger <path> --receipt <private/receipt.json>`。实际回执不可改写，重复相同回执幂等，冲突拒绝。缺回执时不要猜零、删账本或重建账本。进程崩溃残留锁不会自动清理；先确认PID、在途请求和账本备份，避免两进程同时发送。已创建的代理配置不能覆盖，重启应生成新文件。

## 验证证据

执行`node --test scripts/engineering-model-budget.test.mjs`，28项通过，包含独立进程并发分配、持久预留、未知与超额、OpenAI/Gemini JSON/SSE、Gemini原生密钥头、共享向量、认证/模型/路径限制、关停竞态、CLI排他和5个既有脚本直连拒绝。此测试集的上游为本地合成HTTP服务，另有下述真实调用证据。

首批分配60,000 token/最多4请求，无自动重试；实际3请求15,440 token，t3保留作者介绍为0请求。批次已关闭、代理已停止，pending/新增unknown均为0。当前工程占用668,527，可再分配781,473；其中198,000是历史未知保守占用，不是供应商收费。详见[四卡整理记录](../product/story-presentation-delivery-20261027.md)。这不证明真实剧情、多轮机制或生产自动整理已通过。

公开索引：[验证范围](evidence/engineering-model-budget-20261027.json)。私有日志不进入公共文档；本次不运行全套业务测试或构建，因为没有服务端、前端和数据库变更。
