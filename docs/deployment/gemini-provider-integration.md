# Gemini 原生接口与记忆验收接入

> 2026-10-25预算更正：04AB首次部署夹具意外触发后台记忆，平台新增记账8,633 token，另1次失败用量未知。含原未回执预留的累计占用至少455,087/450,000；后续付费验证无剩余授权。原合成任务已隔离，修正版复验未触发任务尝试。详见[事故及账目](story-state-action-04ab-completion.md#预算事故与后续限制)和[机器记录](evidence/story-state-action-04ab-budget-incident.json)。本文下方预算数字均为当时的历史记录。

日期：2026-10-24。对应 EXP-05B / DEC-08、INV-01/03；本项修复供应商协议边界，不修改产品决策或代签体验验收。

最新复测：用户将累计预算追加到45万后，真实100+5轮、整库恢复、失败检查点复用及最早约定返回通过。另修复生产WebSocket对长度截断的处理，并以真实本机API/浏览器和受控模型验证状态/记忆不误提交。EXP-05B按有限验收范围完成，见 [最终依据与限制](story-memory-05b-completion.md)。累计记录398,002 token，线上上限及部署不变；此前50+5轮失败及语义缺陷见 [历史复核](story-memory-real-longrun-review.md)。

## 本次定位

用户提供 MMKG 快速入门文档后，对照其 Cursor 与 Gemini 指南检查了当前配置。项目原来将所有自定义供应商请求发往 `/chat/completions`，当前选择的 Gemini 模型通过该路径不能得到聊天补全对象。403及HTML响应均不能用来断言密钥无效或额度不足。

同一基础地址、密钥及模型通过 `/v1beta/models/{model}:generateContent` 返回了可解析的有效回复；Node应用传输也已单独验证。因此保留用户选择的模型和基础地址，显式增加协议配置，不将 Gemini 模型改成其他系列。

参考页面（公开文档，无密钥）：

- `https://code.mmkg.cloud/docs/quickstart`
- `https://code.mmkg.cloud/docs/cursor`：Claude系列的聊天兼容入口，不能据此认定Gemini也使用该入口。
- `https://code.mmkg.cloud/docs/gemini`：Gemini独立接入指引。
- `https://ai.google.dev/api/generate-content`：原生请求、响应和流格式。

## 配置与实现

```dotenv
CUSTOM_LLM_API_FORMAT=gemini
```

未配置时仍为 `openai`，不根据模型名字自动猜协议；无效值在加载配置时拒绝。Gemini基础地址使用供应商给出的根地址或带 `/v1beta`、`/v1` 的地址，适配器只补一次版本路径。不要把完整的 `:generateContent` 地址或聊天兼容路径填作原生基础地址。

原生非流式与SSE回复在服务内部转换为项目现有格式。系统提示、历史角色、输出上限、停止序列和采样参数映射到原生字段；私有思考片段不进入正文，返回用量包含供应商声明的思考token。缺失用量保留为未知，由已有估算路径处理，不伪造零消耗。中断、缺少结束标记、HTML、结构错误和被阻止的生成明确失败，不输出假的完成标记。

目前支持单个文本候选，不支持函数消息或多候选；这些请求明确拒绝。自定义文本补全支持单提示，不包含Gemini工具调用、多模态或Responses协议支持。未知模型继续使用项目的保守容量估算，不按供应商宣传自动放大窗口。

记忆抽取请求原生JSON模式，但实测该网关仍可能返回JSON代码块。解析只接受纯JSON或一段完整JSON代码块，再执行原有版本、字段、长度和来源ID检查；混有前后解释、多代码块、缺闭合或越界来源仍拒绝。不能把去掉包装当作语义正确性证明。

`.env.beta`只新增协议选择；Compose与配置生成脚本同步传递该字段。没有更新运行中的3080/3081/5188，旧镜像尚不支持这个配置。

## 可重复验证

短探测（一次合成请求，最多32输出token，无重试）：

```bash
node scripts/story-memory-provider-probe.mjs --config .env.beta
```

原生普通回复、流式正文及五轮合成资料抽取（最多三次真实请求）：

```bash
node scripts/story-memory-real-provider-check.mjs --config .env.beta --output /tmp/gemini-provider-check.json
```

真实长程入口使用两个临时PostgreSQL/pgvector及一个临时Redis，全部仅绑定回环地址。它调用实际状态提交、模型服务、记忆任务、来源校验、中文嵌入、检索和上下文裁剪服务，第50轮整库备份到第二个数据库并以新进程继续。预期的嵌入故障通过隔离HTTP服务注入，真实抽取检查点必须复用。队列重试次数上限保留，测试会加速隔离任务的等待时间，并记录每次失败，不等于验证真实等待时长。

```bash
node scripts/story-memory-real-longrun.mjs --config .env.beta
```

长程入口依赖 `/tmp/squaretable-memory-models` 中已下载的 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`；运行时只读取该缓存，不静默下载或切换为固定向量。输出目录包含脱敏报告及私有合成剧情记录，临时数据库和Redis在结束时清理。脚本报告会区分请求上限、故障、结构校验、恢复结果和待语义审阅，失败不得记作完成。

默认测试预算读取配置文件的 `PLATFORM_DAILY_TOKEN_LIMIT`，缺省10万token；一次运行最多145次供应商调用。测试预算使用独立Redis计数，不代表供应商余额或线上当天总消耗，也不包含此前独立探测/其他运行。正在进行的单次调用可能使总量略超阈值，随后拒绝新调用。已获明确额外测试预算时，可追加 `--token-budget <tokens>`（正整数，最多100万）覆盖本次隔离进程的预算，不修改 `.env.beta` 或线上上限。用户后续将累计授权追加到45万；最新百轮运行使用独立30万阈值，记录257,395 token，加此前140,607后累计398,002，剩51,998。单次阈值不是每次重跑的新授权；账目见 [完成记录](story-memory-05b-completion.md)。

## 此前接入结果与未完成项

原生普通回复、流式和五轮合成资料抽取已通过接口/结构检查；短回复使用较小输出预算曾因长度限制结束，不能当作文风验收。已有110项相关单元回归及另2项新增文本模板用例通过；65项记忆数据库检查、19项恢复行为、14项证据守卫和2项损坏探针通过。类型检查和服务端构建通过，定向lint零错误、1条原有 `any` 警告。

真实长程第三次运行完成主故事38轮、同卡平行故事5轮，共51次供应商请求，其中8次真实抽取成功；30轮发生历史裁剪，26轮采用来源有效的批次摘要，本轮已生成回复均正常STOP结束。第39轮主故事生成前触发10万token平台预算阈值，返回 `PLATFORM_SPEND_LIMIT`。前两次较短尝试未通过，已保留失败记录，不能被第三次的部分成功覆盖。

本轮未达到第45轮故障注入、第50轮恢复及第100轮早期约定返回检查；现有受控恢复证据不能补作这些真实场景的通过证据。真实百轮、语义/风格审阅及用户体验签收仍未完成。详情见 [独立验证证据](evidence/gemini-provider-verification.json)。

这是服务级真实模型验收，未覆盖浏览器、HTTP/WebSocket入口、全部角色卡或用户视觉签收。完整状态以 [05B验收矩阵](../product/story-memory-acceptance.md) 与 [唯一活动清单](../product/backlog.md) 为准。
