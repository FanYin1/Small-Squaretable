# 开发待办

> **唯一的活动任务清单。** 不在本文中的工作，先进本文再开始做。
> 定位与边界见 [`positioning.md`](./positioning.md)。视觉规范见 [`../design/visual-language.md`](../design/visual-language.md)。
>
> 最后修订：2026-10-18（审计后修订：新增 P0-6、P0-7、P2-6、P3-3 与里程碑；修正 P1-1、P1-3、P2-1 中与代码不符之处）｜ 基线：`9063c7e`

## 使用约定

- 任务 ID 永久有效，完成后不复用。对话里可直接引用（"做 P1-2"）。
- 每条任务必须有**验收标准**。没有验收标准的条目不算任务，算想法，放到文末「待评估」。
- 完成时把 `[ ]` 改成 `[x]` 并补一行实际结论（尤其是与预期不符的部分）。
- 优先级分档的含义：
  - **P0** 真 bug 与阻塞项，不改变产品形态，先做完
  - **P1** 用户立即可感知、投入产出比最高
  - **P2** 产品形态收敛（减法）
  - **P3** 商业模式
  - **P4** 技术债与文档

## 关键依赖

```
P0-1 (计费口径)  ──┬───────→ P3-1 (预付点数)
                   └───────→ P3-3 (前缀缓存，需要准确的输入 token 数才能衡量收益)
P0-2 (类型错误)  ──────────→ P0-3 (测试失败，部分随之消失)
P0-6 (邀请码)    ──────────→ P2-6 (NSFW 开关默认开)
P2-1 (功能下线)  ──┬───────→ P2-2 (immersive 提默认，QA 面从 44 页降到 ~15 页)
                   └───────→ P4-1 (令牌清理，引用随页面下线而消失)
```

P1 不依赖 P0 与 P2，可立即开始，且与 P0 并行不冲突（P1 只动前端样式，P0 只动服务端与类型）。P1 内部只有一条先后：P1-2 依赖 P1-1 第一步。

## 里程碑

| 里程碑 | 含义 | 包含 |
|---|---|---|
| **M1 可以放人** | 圈子里的人可以进来用，平台成本有上限 | P0 全部 + P1-1 第一步 |
| **M2 可以收钱** | 运营者能手动充值，用户能看见消耗 | P3-1 第一阶段 + P3-2 |
| **M3 形态收敛** | 减法完成，默认皮肤是沉浸的 | P2 全部 |

M2 和 M3 可以并行。M1 之前不要放人：邀请码（P0-6）和花费熔断（P0-7）没上线时，开放注册就是把推理账单交给陌生人。

---

## P0 — 真 bug 与阻塞项

### [x] P0-0 收尾年龄声明改动

未提交的工作：17 个文件 / +453 行 / 新迁移 `src/db/migrations/0036_age_confirmation.sql`。

实现质量高（存"何时声明过成年"而非出生日期、时间点 + 截断 SHA-256 的 IP 作举证、存量用户留 NULL 不回填、`z.literal(true)` 让漏传和传 false 都返回 400、service 层复核挡住绕过前端直接打接口），迁移注释里把取舍都记录了。

唯一问题：它弄坏了一个测试（见 P0-3 第一项）。

- **验收**：测试补齐后作为一个提交落地，工作区干净。
- **估时**：10 分钟
- **结论（2026-10-18）**：测试已补（`auth-email-verify.spec.ts` 的 payload 加 `ageConfirmed: true`），年龄声明本身未改动。在分支 `m1-wave1` 作为独立提交 `a6f75df` 落地，单独检出该提交跑认证相关 9 个测试文件 122 项全过

### [x] P0-1 修计费口径：主聊天通道未计入输入 token

两条传输通道口径不一致：

| 位置 | 计量内容 |
|---|---|
| `src/server/routes/llm.ts:128` | `response.usage.total_tokens`（输入 + 输出）✅ |
| `src/server/routes/websocket.ts:451`、`:611` | `llmService.countTokens(fullContent)`，`fullContent` 是流式回复 → **仅输出** ❌ |

WebSocket 是主聊天通道。而本产品的全部功能都在堆输入 context：记忆注入、世界书、角色卡、情绪状态、历史。真实成本的 90%+ 在未计量的那一侧，输入输出比轻松到 10:1 甚至 50:1。

当前配额（free 100 条 / 50k tokens）看似自洽（输出约 400 tokens/条 × 100 ≈ 40k），但它量的是成本结构里最小的一块。

- **范围**：`src/server/routes/websocket.ts`、`src/server/services/usage-meter.ts`
- **做法**：`src/server/services/context-manager.service.ts` 组装上下文时已经算出了 `totalTokens`（system + 置顶 + 历史），直接把它加进计量即可，不需要改流式接口。provider 若在流末尾返回 `usage`，优先用 provider 的数字
- **验收**：
  1. 两条通道对同一次对话计量结果一致（误差来自分词器，不来自口径）
  2. 新增测试断言 prompt tokens 被计入，且断言值量级与 context 大小正相关
  3. 既有配额数字按新口径重算后写回 `feature.service.ts`（旧数字在新口径下会立刻被击穿）。这是 P3-1 上线前的过渡措施，P3-1 之后配额让位于点数
- **阻塞**：P3-1 预付点数。在此之前所有定价测算都是假的
- **估时**：半天
- **结论（2026-10-18）**：
  - 所有生成路径（WS 单聊/群聊/模板、HTTP 流式与 `/completions`）统一经 `usage-meter.ts` 的 `meterLlmTokens` 计量：provider 返回的 `usage` 优先（流式请求带 `stream_options.include_usage`，Ollama 原生接口读 `prompt_eval_count`/`eval_count`），否则输入取 context-manager 的 `totalTokens` + atDepth 注入、输出按累积文本估算，估算器统一为 `utils/tokens`。严格 provider 拒绝 `stream_options` 时可设 `LLM_STREAM_INCLUDE_USAGE=false` 回退估算
  - 顺带修掉：context-manager 的 `totalTokens` 漏算 atDepth 注入；HTTP 流式 SSE 行跨分片时被丢弃
  - 行为变化：被中断或空回复的生成也计输入；`/completions` 无 usage 时按估算计，不再跳过
  - 配额按「每次生成 ≈ 3,000 上下文 + 400 回复」、messages 每轮计 2 条重算：free 50K → 170K、pro 1M → 17M、team 10M → 170M，推导写在 `feature.service.ts` 注释里，前端 `useFeatureGate.ts`、`Subscription.vue` 和 i18n 文案已同步。**这是假设值**，pro 用满 17M 在贵模型上可能超过 ¥29 月费，上线后须按实测 usage 校准，P3-1 之后让位于点数
  - 验收 1 的「一致」指口径一致；两条通道在没有 provider usage 时都落到同一个估算器上

### [x] P0-2 修 23 个类型错误（两批根因）

`npx tsc --noEmit` 当前 23 个错误，集中在两处 schema 漂移：

**a) 世界书条目缺 `excludeRecursion`（3 处 TS2353）**
`src/server/routes/characters.ts:138`、`src/server/routes/worldbooks.ts:181`、`:509` 都在写入该字段，但 repository 入参类型里没有。字段在业务代码里加了，类型与落库路径没跟上。另有 `worldbooks.ts:656` 的 TS2345 属同一批。

**b) message 类型缺 `pinned` / `importance`（6 处）**
`src/db/repositories/message.repository.ts:92`、`:116`、`src/server/routes/websocket.ts:348`、`:633`、`src/server/services/chat.service.ts:171`。消息加了置顶与重要度，但带 `chatTitle` 的联表查询返回类型没同步。

**其余零散项：**
`src/server/config/llm.config.ts:71`（`'ollama'` 不在 `LLMProvider` 联合类型里）、`src/server/services/llm.service.ts:79/81`（`baseUrl` 可能 undefined）、`summarization.service.ts:63`、`chat.service.ts:274/277/379`、`chats.ts:475`、`character-preset.repository.ts:87`、`user-persona.repository.ts:107`。

- **验收**：`npx tsc --noEmit` 零错误
- **注意**：a) 修完后 P0-3 的 `worldbooks.spec.ts` 失败会自动消失
- **估时**：半天
- **结论（2026-10-18）**：`tsc --noEmit` 23 → 0。要点：
  - `excludeRecursion` 存入 `settings` JSONB，无需迁移；`/scan` 路由新增 `toScanEntry()` 把 DB 行显式映射为引擎条目
  - 联表查询补 `pinned` / `importance`；顺带修出一个真 bug：`messageRepository.update` 只写 `content`，**编辑置顶与重要度此前被静默丢弃**，现按传入字段写部分更新（有测试）
  - `LLMProvider` 加 `'ollama'`；`baseUrl` 未配置时抛 `LLM_NOT_CONFIGURED`（500），不再拼出 `undefined/chat/completions`
  - `chats.ts` 读的 `user.name` 不存在，改为 `user.displayName || 'User'`——轻微行为变化：此前恒为 `'User'`
  - chat overrides 只取字符串值并入提示词（前端 `CharacterTuner` 只写字符串字段，无行为变化）
  - 「注意」一条不成立：`worldbooks.spec.ts` 的失败与类型无关，见 P0-3

### [x] P0-3 修 8 个测试失败

当前 `2407 passed / 8 failed / 17 skipped`，4 个文件：

| 文件 | 失败数 | 原因 |
|---|---|---|
| `src/server/routes/auth-email-verify.spec.ts` | 1 | **P0-0 引入**：期望 201 实际 400，测试 payload 缺 `ageConfirmed: true` |
| `src/server/routes/chats.spec.ts` | 1 | mock 漂移：测试里的 `usageService` 没有 `trackUsage` 方法，`usage-meter.ts:53` 调用抛错 → 500 |
| `src/server/routes/worldbooks.spec.ts` | 1 | `excludeRecursion` 断言不匹配，随 P0-2a 消失 |
| `src/server/services/__tests__/intelligence.integration.spec.ts` | 5 | 全部 5000ms 超时（非断言失败），很可能有 await 未被 mock 覆盖 |

`intelligence.integration.spec.ts` 目前等于零保护，而它覆盖的记忆注入正是产品的差异化所在，不要简单加大 timeout 绕过。

- **验收**：`npx vitest run` 全绿；`intelligence.integration.spec.ts` 的 5 项是真正通过而非延长超时
- **估时**：半天
- **结论（2026-10-18）**：全量 `2452 passed / 0 failed / 17 skipped`（含 Wave 1 新增测试）。根因：
  - `worldbooks.spec.ts`：创建条目的期望值过时（缺 `recursive: true, preventRecursion: false`），与 `excludeRecursion` 无关
  - `chats.spec.ts`：缺 `usageService.trackUsage` mock；另外创建对话路由有一处未 mock 的 `db.select` 直连 Postgres
  - `intelligence.integration.spec.ts`：`buildEnhancedSystemPrompt` → `chatVariableStore.loadAll` → Redis，测试未 mock，ioredis 在重连退避里挂到 5s 超时。补 mock 后 17/17 用时 23ms，**未改任何 timeout**
  - 测试运行不依赖 Postgres / Redis，日志里的 ECONNREFUSED 是噪声

### [x] P0-4 修两处 null 解引用（生产会崩）

- `src/server/routes/websocket.ts:566` —— `chat` 可能为 null（TS18047）
- `src/server/routes/analytics.ts:93` —— `producer` 可能为 null（TS18047）

- **验收**：两处有显式判空与合理的错误响应，不是加 `!` 断言绕过
- **估时**：1 小时
- **结论（2026-10-18）**：`analytics.ts` producer 为 null 时 warn 日志 + 503 `ANALYTICS_UNAVAILABLE`；`websocket.ts` 群聊 chat 为 null 时抛 `NotFoundError('Chat')`，由 `handleUserMessage` 既有 catch 转成 WS ERROR，且不进入流式与计量。三条新测试覆盖

### [x] P0-5 修 6 个 lint error

`no-this-alias`、`ban-ts-comment`（`@ts-ignore` → `@ts-expect-error`）、`no-useless-escape`、`no-require-imports`、2 处 `prefer-const`。另有 167 个 warning（多为 `no-explicit-any`、未使用变量），本轮不处理。

- **验收**：`npm run lint` 零 error
- **估时**：半小时
- **结论（2026-10-18）**：0 error / 167 warning（warning 未动）。`@ts-ignore` 实际不再需要，直接删除而非改成 `@ts-expect-error`。注意 lint 不覆盖 `.vue`，见 P4-5

### [x] P0-6 邀请码注册

定位的承重墙（理由见 [`positioning.md`](./positioning.md#目标用户)）。现状是开放注册，代码里没有邀请码，也没有关闭注册的开关。

有两条建号路径，**都要过这道门**，只拦一条等于没拦：

- 邮箱注册：`src/server/services/auth.service.ts:61`
- OAuth 首次登录自动建号：`src/server/services/oauth.service.ts:183`

- **做法要点**：
  - 邀请码由运营者在后台生成，可设使用次数上限与过期时间
  - OAuth 首次登录且无对应账号时，先要求输入邀请码再建号；已有账号的 OAuth 登录不受影响
  - 校验放在 service 层（与年龄声明同一位置、同一模式），不只在前端拦
  - 码的消耗与账号创建在同一事务里，避免并发下一码多用
- **验收**：
  1. 无码 / 错码 / 过期码 / 用尽码的注册请求，两条路径都返回 400，且不产生用户行
  2. 并发用同一个单次码注册，只有一个成功
  3. 每次用码写审计日志（谁、哪个码、何时），运营者可追溯"这个人是谁邀请的"
  4. 存量用户不受影响
- **阻塞**：P2-6
- **估时**：1 天
- **进展（2026-10-18）**：完成，已在开发库验证
  - 新表 `invite_codes` + `invite_code_uses`（迁移 `0037_invite_codes.sql`）。使用记录单独建表而不只靠审计：审计是 fire-and-forget 且有保留期清理，追溯关系要和建号同事务落库。审计日志另写一份（`invite_code_use` / `_create` / `_disable`）
  - 消费是一条条件 `UPDATE ... WHERE used_count < max_uses AND 未过期 AND 未禁用 RETURNING id`，与建租户、建用户、OAuth 绑定、写使用记录同在 `inviteCodeService.createAccountWithInvite` 的事务里；四个 repository 的 `create` 加了可选 executor 参数。CHECK `used_count <= max_uses` 作第二道防线
  - 邮箱查重先于扣码（重复邮箱不烧码）；错误码只有 `INVITE_CODE_REQUIRED` / `INVITE_CODE_INVALID`，不区分过期/用尽，避免帮人猜码
  - OAuth：邀请码随 state 存 Redis（同 `ageConfirmed`），首次登录缺码或码无效时重定向 `/auth/register?error=invite_code_*`。发起时不预校验，错码要等第三方往返后才提示
  - 后台：`/api/v1/admin/invite-codes` 批量生成 / 列表 / 禁用，前端 `InviteCodes.vue`
  - **真实库验证**（开发库执行 0036、0037 后）：
    - 单次码 10 并发注册恰好 1 个成功，3 次码 10 并发恰好 3 个成功，`used_count` 与使用记录一致；失败的都是 `INVITE_CODE_INVALID`
    - 建号中途抛错时扣码与租户行一起回滚；停用码、过期码被拒；CHECK 约束拒绝越界写入；小写输入可用
    - 浏览器：错码注册提示"邀请码无效、已过期或已被用完"且不建号，正确码注册 201 后进 `/chat`；后台列表与生成正常，`createdBy` 已记录；审计日志 `invite_code_use` / `invite_code_create` 均落库
    - E2E `auth.spec.ts` + `auth-interactions.spec.ts` 31/31 通过（注册用例走 mock API，`E2E_INVITE_CODE` 任意非空值即可；连真实后端跑时需在测试库预置一个多次可用的码）
  - **顺带修复**：全站 toast 被静默丢弃。`App.vue` 中 `ToastContainer` 与 `<router-view>` 是兄弟节点，页面 `inject('toast')` 拿不到，落到只打 warning 的空实现，错码注册因此毫无反馈。队列改为 `useToast` 模块内共享，`ToastContainer` 只负责渲染
  - **顺带修复**：E2E 页面对象只勾了第一个复选框，P0-0 加的满 18 岁声明没勾，注册用例必然被前端校验拦下
  - **已知存量问题（未修）**：直接刷新 `/admin/*` 会被弹回"权限不足"。路由守卫读 `userStore.user?.role`，而 user 不持久化、`/auth/me` 尚未返回

### [x] P0-7 平台花费熔断

从现在到 P3-1 上线，平台成本只靠套餐配额兜底，而配额量的口径到 P0-1 修好之前都是错的。需要一道与计费逻辑无关的独立保险。

- **做法**：按日累计全平台 token 消耗（Redis 计数即可），超过阈值后拒绝新的生成请求并通知运营者。阈值走环境变量
- **验收**：
  1. 超阈值后 WebSocket 与 HTTP 两条通道都拒绝新生成，返回用户可读的提示（不是 500）
  2. 已在流式输出中的回复不被中途切断
  3. 计数按自然日重置；Redis 不可用时**失败关闭**（拒绝生成）而非放行
- **估时**：半天
- **结论（2026-10-18）**：
  - 闸门在 `llm.service.ts` 的 `chatCompletion` / `streamChatCompletion` / `completion` 开头（`spend-breaker.service.ts`），超限抛 503 `PLATFORM_SPEND_LIMIT`；WS 的 catch 透传 AppError 的 code，前端 `stores/chat.ts` 映射为 `chat.platformSpendLimit` 本地化提示，HTTP 走 errorHandler 返回 JSON
  - Redis key `spend-breaker:tokens:YYYY-MM-DD`，按 `SPEND_BREAKER_TZ`（默认 Asia/Shanghai）划日，INCRBY + 72h 过期。累加用与 P0-1 同一个数字：非流式在 llm.service 内记，流式由 `meterLlmTokens` 记，已记过的路径传 `recordPlatformSpend: false` 防重
  - `PLATFORM_DAILY_TOKEN_LIMIT` 未设置：非 production 禁用并启动 warn；production 由 `core/config.ts` 校验拒绝启动
  - 首次超限每天通知一次（Redis `SET NX`）：error 日志 + Sentry `captureMessage`。项目没有给管理员发邮件的现成能力，未做邮件
  - 局限：先查后记，超额上限约为检查通过时仍在途的生成量；摘要、记忆整合等内部 LLM 调用计入熔断但不计入用户配额

---

## P1 — 用户立即可感知

这三条投入产出比最高，且只动前端样式，可与 P0 并行。规范见 [`../design/visual-language.md`](../design/visual-language.md)。

### [ ] P1-1 补中文字体

`src/client/styles/fonts.css` 自托管 6 个 woff2（Newsreader ×4 含斜体、Plus Jakarta Sans ×2），**子集只有 `latin` 和 `latin-ext`**。全站 grep `noto` / `cjk` / `pingfang` / `思源` / `microsoft yahei` 零命中——**中文没有任何字体设计**，全靠系统 fallback。

问题的准确位置在字体栈（`variables.css`）：

```css
--font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Newsreader', 'Georgia', serif;
```

两条都没有声明中文字体，中文落到通用族。`sans-serif` 在 Windows 上是雅黑、macOS 上是苹方，尚可接受；但 **`serif` 在 Windows 上落到宋体**——标题现在就是宋体，而 P1-2 计划让聊天正文用衬线，不先修这里，聊天正文也会变成宋体。

分两步，第一步拿走大部分收益：

**第一步：显式声明系统中文字体（属于 M1）**
- 无衬线栈补 `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC'`
- 衬线栈补 `'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC'`，且在 Windows 上**宁可回落到雅黑也不要回落到宋体**——即衬线栈末尾在 `serif` 之前插入无衬线中文
- 零下载成本
- **验收**：Windows / macOS / Android 三端截图，任何界面不出现宋体；中西文混排同一行基线对齐
- **估时**：1 小时（含三端核对）
- **结论（2026-10-18，第一步代码完成，验收未完成）**：`variables.css` 两条栈已按上述规则补齐，`--el-font-family` 改为引用 `var(--font-body)`，Element Plus 组件跟随。**三端截图与基线对齐尚未核对**，这一项在截图前不打勾。
  遗留（未在本步范围内）：
  - `immersive.css` 第 86–87 行 `--im-font-display` / `--im-font-body` 没有中文字体，Windows 上仍会落到宋体——并入 P2-2 处理
  - `Home.vue` 第 173 / 275 / 513 行硬编码了 `'Plus Jakarta Sans'` 字体栈——并入 P4-1

**第二步（可选）：衬线中文 webfont**
- 只在第一步之后、确认系统字体效果仍不够时再做
- 衬线中文字体单字重全量 10MB 以上，必须按 `unicode-range` 分片 + `font-display: swap`
- 预算要现实：长对话用字覆盖面广，分片后一次会话加载 1–2MB 是常态（估计值，需实测）。只给聊天正文用一个字重，标题与界面继续用系统字体
- **验收**：实测一段 5,000 字的典型对话的字体下载总量，并与第一步的效果并排对比后再决定是否保留
- **估时**：1 天

### [x] P1-2 聊天正文排版：从后台密度改为阅读密度

`src/client/components/chat/MessageBubble.vue` 正文是 `font-size: 14px` / `line-height: 1.6`，与全站 `--font-size-body: 14px` 一致。

14px/1.6 是**管理后台的密度**。但聊天气泡里是叙事文本，用户一次读几百字、连读几十分钟。这是本产品唯一真正被长时间注视的界面，它现在的排版和 admin 表格一样。

项目里已经自托管了 Newsreader（含斜体），但正文用的是 Plus Jakarta Sans——衬线字体买了没用在该用的地方。

- **范围**：`MessageBubble.vue`，新增聊天专用排版令牌（不要改全局 `--font-size-body`，会波及全站 44 个页面）
- **目标值**：正文 17px / line-height 1.75，西文 Newsreader，中文按 P1-1 的衬线栈
- **动作描述的处理**：`*动作*` 经 `MarkdownRenderer.vue` 渲染为 `<em>`，浏览器默认斜体。**中文没有斜体字形，浏览器会伪造倾斜**——当前线上的中文动作描述就是这样歪着的。做法：`em { font-synthesis: none; }`，西文仍用 Newsreader 的真斜体，中文保持直立；再用次要文字色区分动作与对话
- **依赖**：P1-1 第一步（否则 Windows 上正文会落到宋体）
- **验收**：
  1. 聊天正文与 UI 文字（按钮、输入框、头部）使用不同令牌，互不影响
  2. 行宽有上限（中文约 35–40 字、西文约 60–75 字符），不随窗口拉宽无限延伸
  3. 字号可调（至少两档），用户偏好持久化
  4. 中文动作描述不出现伪斜体；动作描述的次要色在浅色与暗色两套主题下都 ≥ 4.5:1（P2-2 会把默认改成暗色，这里先按两套验证）
- **估时**：半天
- **结论（2026-10-18）**：
  - 令牌：`--font-reading` / `--chat-font-size` / `--chat-line-height` / `--chat-measure` / `--chat-action-color`，只被聊天正文引用；全站 `--font-size-body` 未动
  - 排版挂在 `MarkdownRenderer.vue` 的 `.markdown-content` 上（历史消息、流式消息、开场白共用，流式结束换气泡时不跳），用户纯文本在 `MessageBubble.vue` 的 `.user-text` 上挂同一份；气泡本身保持 14px 界面密度
  - 字号三档 15 / 17 / 19px：`composables/useChatFontSize.ts`（localStorage 持久化）+ `components/chat/ChatFontSizeSetting.vue`（账户设置页"聊天阅读"卡片，带实时预览）
  - 动作色取 `--text-tertiary`，六个前景/背景组合实测 4.62–6.55:1
  - 验收 2 的取舍：行宽取 36em，中文 36 字达标，西文约 75–84 字符略超上沿；两个区间换算成 em 不重叠，按中文定值。想压西文可降到 33em
  - 未覆盖：`<i>` 标签不在 `em` 规则内（`*x*` 只产出 `<em>`，影响小）；无真机截图
  - 遗留：用户气泡白字 on `#D97706` 只有 3.19:1，不满足 AA——并入 P2-2 配色调整

### [x] P1-3 ChatWindow 移动端 + 统一断点

`ChatWindow.vue` **1985 行，只有 1 条 `@media`**。聊天产品的移动端占比大概率过半，而这是核心页面。

同时断点是乱的。`variables.css` 声明了 `--breakpoint-mobile: 640px` / `--breakpoint-tablet: 1024px`，但媒体查询里不能用 CSS 变量（`@media (max-width: var(--x))` 无效），令牌声明了却没人能用，于是全站实测出现 **10 种**取值：

| 值 | 出现次数 |
|---|---|
| 767px / 768px | 23 / 22 |
| 480px / 479px | 11 / 1 |
| 1023px / 1024px | 5 / 4 |
| 640px | 3 |
| 1279px / 1280px、560px | 各 1 |

令牌声明的 640 反而是最少用的。**收敛到事实标准 480 / 768 / 1024**，而不是逆着现状改成 640。

成对出现的 767/768、1023/1024 还有一个真 bug：有的规则写 `max-width: 767px`，有的写 `max-width: 768px`，恰好 768px 宽时两组规则一组生效一组不生效。统一写法：移动优先用 `min-width`，或桌面优先统一用 `max-width: (断点 - 1)px`，全站只选一种。

- **范围**：`ChatWindow.vue`；断点统一需配合 Sass 变量（项目已有 `sass-embedded`）或 PostCSS 媒体查询变量
- **验收**：
  1. 390px 宽（iPhone 基准）下可完成：进入对话 → 发消息 → 看回复 → 切换角色，无横向滚动
  2. 侧栏在移动端为抽屉而非挤压主区
  3. 输入框在软键盘弹出时不被遮挡（`dvh` 而非 `vh`）
  4. 全站断点值收敛到 480 / 768 / 1024 三个，媒体查询有单一来源，`variables.css` 的 `--breakpoint-*` 同步改为这三个值
  5. 同一断点全站只有一种写法（grep 不再出现 767 与 768、1023 与 1024 并存）
- **注意**：此条与 P4-3（拆分 ChatWindow）相关但不要绑定。先加响应式，拆分是独立的技术债
- **估时**：2 天
- **结论（2026-10-18）**：
  - 写法选桌面优先：`src/client/styles/_breakpoints.scss` 的 `$breakpoints: (sm: 480px, md: 768px, lg: 1024px)` 是唯一来源，mixin `below()`（`max-width: 断点-1`）/ `from()` / `between()` 经 `vite.config.ts` 的 `additionalData` 注入所有 `lang="scss"` 样式块；纯 CSS 的 `global.css` 只有一处字面量 767px。`--breakpoint-sm/md/lg` 只供 JS 读
  - 守卫：`styles/breakpoints.spec.ts` 校验 Sass 与令牌一致，并在 `.vue` 出现字面量宽度 `@media` 或 `.css` 出现非标准值时失败（全站无豁免文件）
  - 抽屉在 `ChatLayout.vue`（侧栏挂载处）：`role="dialog"`、Esc 关闭、焦点进出管理、关闭时 `inert`；`100dvh`、`interactive-widget=resizes-content`、输入框安全区内边距与 16px 防 iOS 缩放
  - 验证：`e2e/chat-mobile.spec.ts` 在 390×844 Chromium 下 5/5 通过（API 全 mock，未连真实后端）；验收 1、2、4、5 满足
  - **验收 3 只部分满足**：`interactive-widget` 只有 Chrome Android 支持，iOS Safari 软键盘弹出时输入框仍可能被遮挡；未上真机、未跑 WebKit
  - 遗留：软键盘弹出时底部 Tab 栏仍可见；`MessageInput` 与底部 Tab 栏的安全区内边距重复；`LeftSidebar` / `CharacterDetail` / `ChatLayout` 的 `innerWidth < 768` 是 JS 字面量，未读令牌

---

## P2 — 产品形态收敛（减法）

依据见 [`positioning.md`](./positioning.md) 的「明确不做的事」。**这一档的主要动作是关入口，不是删代码。**

### [ ] P2-1 功能可见性开关：下线约 19,700 行对应的入口

不要删代码。在 `src/server/index.ts` 注册路由处加一份**模块开关配置**，配合前端路由守卫与侧栏入口，把下列模块关掉。

**不要用 `src/server/middleware/feature-gate.ts`。** 它是按订阅套餐判断权限的（`featureService.hasFeature(entitlement.plan, …)`），没权限时返回 403——路由仍然挂着，只是对低套餐说"不"。这里要的是路由根本不存在，语义不同，复用它会让"这个功能要升级套餐"和"这个功能已下线"混在一起。

| 模块 | 处置 | 入口位置 |
|---|---|---|
| Flink + ClickHouse 管线 | 封存 | 不注册 analytics 路由；K8s 不部署 |
| analytics + 实验 + Kafka | 封存 | 同上；`src/client/pages/` 下 analytics 页面移出路由。Kafka 只在 `index.ts` 被引用，聊天链路不依赖它 |
| social：关注 + 动态流 | 下线 | 关注相关路由、动态页、侧栏入口 |
| social：收藏 + 评论 | **保留** | `src/server/routes/social.ts` 里与关注同文件，需要按路由拆开开关，不能整文件关 |
| 通知 | 收窄 | 保留 NotificationBell；关掉 `follow` 类型，保留 `comment` / `reply` / `favorite` |
| admin 后台 6 页 | 简化为 1 页 | 只留"删卡 / 封号 / 邀请码 / 充值"（后两项来自 P0-6、P3-1） |
| 插件沙箱 | 封存 | 不注册 plugins 路由 |
| Webhook + 开发者 API | 封存 | 不注册 webhooks / developer 路由 |
| GDPR + 同意 | 留删号，同意管理界面下线 | 保留账号删除入口。**审计日志服务不动**——年龄声明、订阅、管理员操作、充值都依赖它 |
| MFA + TOTP + 备份码 | 降级为可选 | **从注册路径移出**，放进设置页 |
| 审核 + 举报 | 简化 | 去掉工作流界面；NSFW 拦截见 P2-6 |
| 推荐引擎 | 下线 | 市场页改为排序 + 标签 + 搜索。注意 `Market.vue` 里用了 `RecommendationCarousel`，要一起移除 |

- **验收**：
  1. 一个配置开关能整组开关，不是散落在十几个文件里的 `if`
  2. 关掉的路由不再注册（不是返回 403，是根本不挂载），减少攻击面与启动依赖
  3. 关掉 Kafka / ClickHouse 后后端能在只有 Postgres + Redis 的环境里干净启动，无报错无重试日志
  4. 既有测试不因入口关闭而失败（被封存模块的测试可整体 skip 并注明原因）
- **阻塞**：P2-2、P4-1
- **注意**：**多租户不在此列，不要拆**（理由见 positioning.md）
- **估时**：2–3 天

### [ ] P2-2 immersive 提为默认主题

现状矛盾：`src/client/styles/immersive.css`（242 行）是质量最高的一层视觉工作——暗色叙事语言、遮罩 alpha 按纯白立绘最坏情况实测推导、Element Plus 的 teleport popper 作用域问题都解决了——但它**只在 `Market.vue` 一个页面生效**。同时 `useTheme.ts` 默认 `light`，且不读 `prefers-color-scheme`。

等于：产品的视觉身份存在，但用户默认看不到。

一个角色扮演产品的默认皮肤应该是沉浸的，不是办公的。

- **范围**：`immersive.css`（`--im-*` 提升为主题层而非作用域层）、`useTheme.ts`、`variables.css` 的 dark 主题段（283–399 行，与 immersive 有重叠，需合并而非并存）
- **验收**：
  1. 默认主题为暗色沉浸；浅色作为可选项保留
  2. 首次访问读 `prefers-color-scheme`，用户显式选择后持久化并优先
  3. 无 FOUC（主题在首帧前确定，不是 mounted 后切换）
  4. 全站 `el-select` / `el-dropdown` 等 teleport 组件的下拉在暗色下正确
  5. `.im-select-popper` 与 `immersive.css` 的全局令牌桥接段（107–147 行）被删除而非保留
  6. （P1 遗留并入）合并后的暗色主题不再有独立的 `--im-font-*` 字体栈，统一引用 P1-1 的 `--font-body` / `--font-display`；用户气泡文字对气泡底色 ≥ 4.5:1（现浅色主题白字 on `#D97706` 为 3.19:1）
- **做法要点**：
  - **把 `--im-*` 的取值并进 `[data-theme="dark"]`，不要推广 `.immersive` 容器类。** `useTheme.ts` 已经把 `data-theme` 挂在 `document.documentElement` 上，teleport 到 `<body>` 的弹层天然在它之内，能继承到令牌。`immersive.css` 里那 80 行和 Element Plus 搏斗的代码（`.im-select-popper`、令牌桥接、侧栏补齐）只是因为作用域挂在容器上才需要——作用域上移到根节点后，它们大部分可以直接删
  - **FOUC 需要在 `index.html` 的 `<head>` 里加内联脚本。** 现在 `index.html` 只有一个 `type="module"` 的入口脚本，主题要等整个 JS 包加载完才设置。默认改成暗色后，每次刷新都会先闪一下浅色。内联脚本只做一件事：读 `localStorage` 与 `prefers-color-scheme`，同步设好 `data-theme`
- **依赖**：P2-1 做完后 QA 面从 44 页降到约 15 页，再做这条成本低得多。**不要反序**
- **估时**：2 天（P2-1 之后）／4+ 天（之前）

### [ ] P2-3 onboarding

全站 grep `onboard` / `firstRun` / `tutorial` **零命中**。减法之后页面变少了，但"第一次进来该干什么"仍然需要有人说。

- **验收**：新注册用户在不看任何文档的情况下，三步内开始第一次对话；可跳过且跳过状态持久化
- **估时**：1–2 天

### [ ] P2-4 模型选择收敛为 3–5 个精选项

现状是 provider × 模型的矩阵。用户不该看见 `dolphin-mistral:7b-v2.8-q4_K_M` 这种字符串。

需要 3–5 个选项，每个配一句人话：「便宜耐聊 / 聪明但贵 / 记性最好」。provider 概念对用户不可见。

- **范围**：`src/server/config/llm.config.ts` 增加一层"面向用户的档位"映射到真实模型；前端选择器改为档位
- **验收**：
  1. 选择界面无 provider 字样、无原始模型 ID
  2. 档位到真实模型的映射在服务端配置，换模型不需要改前端
  3. 每档标注相对消耗速度（配合 P3-2）
- **注意**：`llm.config.ts:71` 的 `provider: 'ollama'` 类型错误在 P0-2 里修
- **估时**：1 天

### [ ] P2-5 PWA

`CLAUDE.md` 声称有 PWA。实际 `package.json` 无 `vite-plugin-pwa`、`vite.config.ts` 无 `VitePWA`——**PWA 不存在**。文档与现实不符本身也要修（P4-4）。

小圈子产品装到桌面/主屏的价值不小，但优先级低于 P1-3 的响应式——**没有可用的移动端布局，装成 app 只是把窄屏问题装起来**。

- **依赖**：P1-3
- **验收**：可安装；离线时给出明确的离线态而非白屏；Service Worker 不缓存 API 响应（流式聊天会被缓存层破坏）
- **估时**：1 天

### [ ] P2-6 NSFW 改为平台开关，默认开

决定见 [`positioning.md`](./positioning.md)。现状是硬编码拦截：发现入口一律过滤（提交 `7719ac0`），发布时直接拒绝（提交 `7feca98`）。拦截逻辑分布在 4 个文件：`src/server/routes/characters.ts`、`src/server/services/character.service.ts`、`src/server/services/search.service.ts`、`src/server/routes/character-collections.ts`。

- **做法要点**：
  - 一个平台级开关（环境变量或运营者后台配置），4 处拦截都读它，不要各自判断
  - 卡片上的 NSFW 标记保留并继续要求填写——平台允许不等于每个用户都想看
  - 用户侧加一个"显示 NSFW 内容"偏好，**新用户默认关**，自己打开。平台开关决定"能不能有"，用户偏好决定"我看不看"
- **验收**：
  1. 开关关闭时行为与现状完全一致（既有测试不改即通过）
  2. 开关打开时 NSFW 卡可发布、可在市场与搜索中被打开了偏好的用户看到
  3. 未打开偏好的用户在任何发现入口（市场、搜索、合集）都看不到 NSFW 卡
- **依赖**：P0-6 邀请码、P0-0 年龄声明。**两者都上线之前开关不得打开**
- **估时**：1 天

---

## P3 — 商业模式

### [ ] P3-1 预付点数制替代包月订阅

决定与理由见 [`positioning.md`](./positioning.md#商业模式预付点数不是包月订阅)。

**硬前提：P0-1 必须先完成。** 当前主聊天通道只计输出 token，成本的 90%+ 在未计量的输入侧。在这个数据上做定价测算，算出来的每一个数字都是假的。

**第一阶段：运营者手动充值，不接支付通道。** 用户在群里转账，运营者在后台给账号加点。支付通道选型移到「待评估」。

- **范围**：新增点数账本（充值、扣费、余额、流水）；admin 页加"给用户充值"操作；`feature.service.ts` 的 messages/llm_tokens 配额让位于点数；`entitlement.ts` 保留但不再是主路径
- **做法要点**：
  - 点数按 token 扣，不按消息条数扣
  - 扣费记录要可追溯到具体消息，否则争议无法处理
  - **流式调用要先预扣、再结算。** 一次生成的成本要等回复结束才知道，所以只在结束时扣费的话，同一用户并发开几个对话就能把余额扣成负数，行锁也救不了。做法：发起生成前按"输入 token（已知，来自 P0-1）+ 输出上限"冻结一笔额度，结束后按实际消耗结算并释放差额；生成异常中断也要结算已产生的部分
  - 余额不足时的行为：拒绝发送并提示。不要自动缩短 context，那会悄悄降低对话质量
  - 充值前先定规则：点数是否过期、能否退款，写进用户可见页面
- **验收**：
  1. 账本是追加式流水，余额由流水推导，不是可直接改写的单一数字
  2. 同一用户并发发起多次生成，余额不会为负（测试覆盖这个场景）
  3. 生成中途断开、provider 报错时，冻结额度被正确结算或释放，不残留
  4. 运营者每次手动充值都写审计日志（给谁、多少、何时、哪个运营者操作）
  5. 有一份按真实 token 分布算出的定价测算（基于 P0-1 修好后的数据）
- **依赖**：P0-1
- **估时**：1 周（第一阶段）

### [ ] P3-2 让用户看见消耗

预付制下这是信任基础，不是可选的透明度点缀。而且它会自然教育用户"为什么长记忆值钱"——把上下文深度变成用户自己的权衡，比替他们设一个 `messages: 100` 的硬配额既优雅也诚实。

- **验收**：
  1. 每条回复旁可看到本次消耗（如"6,200 tokens / 0.6 点"）
  2. 消耗拆分可展开：角色卡 / 世界书 / 记忆 / 历史各占多少
  3. 开关长记忆或挂厚世界书时，界面给出消耗变化的预期
- **依赖**：P3-1
- **估时**：2 天

### [ ] P3-3 调整 prompt 拼装顺序，让历史能命中前缀缓存

成本的大头在输入侧，而相邻两轮之间输入的大部分不变——这正是各家 provider 的 prompt caching 打折的部分（OpenAI 与部分国产模型自动缓存，Anthropic 需显式标 `cache_control`）。全项目目前**没有用任何前缀缓存**，而且拼装顺序会主动破坏它（`src/server/services/chat.service.ts`）：

- 世界书的 `before` 位置条目被 `unshift` 到 system prompt 最前面（约 393 行），而世界书是按关键词逐轮触发的，命中集合一变，整个前缀失效
- 记忆（约 455–480 行，按本轮用户消息检索）和情绪（约 484 行起）每轮都变，却拼在 system prompt 末尾、**历史消息之前**——所以历史消息永远命中不了缓存。而长对话里历史正是输入的主体

改法：稳定的部分在前（角色卡、示例对话、常驻世界书），历史居中，每轮变化的部分（记忆、情绪、关键词触发的世界书）挪到历史之后，作为靠近末尾的注入块——即 SillyTavern 的 author's note at depth 做法。

- **风险**：注入位置会影响模型对这些信息的权重，记忆放到末尾可能让角色"太在意"刚检索到的事实。**这是行为变更，不是纯优化**
- **验收**：
  1. 有缓存命中率的计量（provider 返回的 cached tokens 记入日志），改前改后各跑一组对比
  2. 长对话（50 轮以上）下单轮输入成本的下降幅度有实测数字
  3. 用同一组角色卡与对话脚本，改前改后各生成一批回复，由运营者盲评，不劣化才合入
  4. 世界书各注入位置（ST 的 7 种位置）的语义不变——变的只是变动内容相对历史的位置
- **依赖**：P0-1（没有准确的输入 token 数，无法衡量收益）
- **估时**：2 天 + 盲评时间

---

## P4 — 技术债与文档

这一档没有用户可见收益，但不做会持续拖慢前面几档。排在最后，不等于可以永远不做。

### [ ] P4-1 清理遗留设计令牌

`src/client/styles/variables.css` 399 行里约 260 行是遗留或已死的：188–250 行是别名层，含 `--accent-purple: var(--accent)`（紫色令牌指向琥珀）、`--accent-cyan`、`--accent-pink`、"Iteration 13 aliases"、玻璃拟态 `--glass-bg` / `--backdrop-blur`。

名字与值不符的令牌比没有令牌更糟：下一个人看到 `--accent-purple` 会以为有紫色体系。

- **依赖**：P2-1（大量引用随页面下线而消失）、P2-2（主题合并时顺带处理）
- **验收**：
  1. 每个保留的令牌名与其实际值语义一致
  2. 删除的令牌全站零引用（含 `.vue` 的 scoped 样式）
  3. 保留 `variables.css` 里那些推导过程注释（对比度实测值、为什么取这个数）——**这些注释是资产，删令牌不要删理由**
  4. （P1-1 遗留并入）全站零处硬编码字体栈，`font-family` 一律引用令牌（已知 `Home.vue` 第 173 / 275 / 513 行）
- **估时**：1 天

### [ ] P4-2 明确 Element Plus 的边界

`immersive.css` 242 行里约 80 行在和 Element Plus 搏斗：teleport 到 `<body>` 的 popper 作用域失效、子组件在自己 scoped 样式里读全局令牌、侧栏自带 `--sidebar-*` 令牌够不到桥接。`ChatWindow.vue` 用了 20 种 `el-` 组件。

已有的处理方式是对的（只改 `--el-*` 变量，不用 `:deep()` 重写 DOM，这样升级不会崩）。缺的是把它写成规则，而不是每次遇到再想一遍。

- **验收**：在 `docs/design/visual-language.md` 中给出按界面分区的允许/禁用清单——聊天区与角色卡区用自有组件（这是产品身份所在），表单与后台区继续用 Element Plus（这里没有差异化价值）
- **估时**：半天（规范）；逐步替换另计

### [ ] P4-3 拆分超大文件

`ChatWindow.vue` 1985 行、`src/server/routes/characters.ts` 1706 行、`chats.ts` 1466 行。

- **验收**：拆分后每个文件单一职责；拆分过程不改变行为，由既有测试守住（所以要在 P0-3 测试全绿之后做）
- **依赖**：P0-3
- **估时**：2–3 天

### [ ] P4-5 补上 .vue 文件的类型检查与 lint

`npx tsc --noEmit` 不检查 `.vue` 文件，项目没有装 `vue-tsc`；ESLint 配置也忽略了 `.vue`。也就是说前端组件里的类型错误和 lint 问题目前没有任何工具在拦，P0-2 / P0-5 的"清零"只覆盖了 `.ts`。

- **范围**：引入 `vue-tsc`（锁定版本）与 `eslint-plugin-vue`，`package.json` 增加 `typecheck` 脚本，CI 接入
- **验收**：`vue-tsc --noEmit` 与 `npm run lint` 覆盖 `.vue`，并在 CI 中执行；首次接入暴露的存量错误要么修完，要么记录数量后分批清理（不得用全局 ignore 掩盖）
- **估时**：半天接入 + 视存量错误数而定

### [ ] P4-4 文档收口

当前文档状态会主动误导：

| 文档 | 问题 |
|---|---|
| `CLAUDE.md`（项目级，每会话加载） | "Phase 1-7 100% Complete"叙事；"Next: Post-MVP Iterations"列的多模态/智能角色/社交/插件正是要砍的方向；声称有 PWA（不实） |
| `ROADMAP.md`（626 行） | 迭代 1–22+ 全部标 ✅，隐含的下一步与现定位不一致 |
| `docs/plans/` 55 份 2026-02 计划 | 历史记录，但没有任何标记说明它们已过期 |
| 根目录 `findings.md` / `progress.md` / `task_plan.md` | 过往会话草稿，建议归档到 `docs/archive/` |

- **验收**：
  1. `docs/plans/README.md` 明确标注该目录为历史记录，指向 `docs/product/`
  2. `CLAUDE.md` 的"项目状态"与"Next"段落与 `positioning.md` 一致；PWA 一项按实际情况改写
  3. `ROADMAP.md` 要么重写为与定位一致，要么整体移入历史并在 README 注明
- **注意**：`CLAUDE.md` 每次会话都加载，改错影响比其他文档大。**等定位确认后再动**
- **估时**：半天

---

## 待评估

有想法但还没有验收标准，不算任务。要做之前先补标准并升档。

- **角色卡质量分层** —— 小圈子里卡片质量差异大，是否需要「精选」位。规模小到可以手动精选，所以不急着做机制
- **对话导出** —— 长期用户会想留存。格式待定（ST 兼容 / Markdown / 纯文本）
- **多人同卡** —— 同一张卡的不同用户之间是否共享什么。目前记忆与情绪按 `chatId` 隔离，共享会打破这个设计，需要先想清楚
- **移动端语音输入** —— 长对话场景下打字是主要摩擦。但依赖 P1-3 与 P2-5 先落地
- **在线支付通道（P3-1 第二阶段）** —— 取决于圈子所在地区，需要先确定用户分布。手动充值的运营负担变得明显时再做
- **用户侧 NSFW 偏好的默认值** —— P2-6 暂定新用户默认不显示、自己打开。如果圈子本身就是为此聚集的，可以改为默认显示

