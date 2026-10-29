# 有限规则检查与冻结运行

本功能是 EXP-ADAPT 的确定性工作流基础：LangGraph 组织收集、检查、编译，PostgreSQL 保存任务、租约和不可变结果。它不使用模型，也不会自动理解自然语言、执行作者 JavaScript 或转换任意第三方框架。完整适配任务状态见[活动待办](../product/backlog.md)。

## 用户入口与结果

在自己的角色卡详情中打开“整理与兼容检查”，选择“检查这张卡”。页面显示等待/运行、四个步骤、取消、重新检查和最近十次记录。一次结果的“完成”表示检查结束，可能仍是未支持、需核对或无效；只有通过校验的声明才可供新故事运行。

当前显式声明格式是本项目新增的作者接口；既有《蔚蓝星域》、t1、t2、t3 原件没有这种声明。它们的剧情体验、已审查开局记录和逐卡限制报告仍可使用，但本检查不能使其外部数值机制自动生效。

来源仅限当前角色明确绑定、启用的角色级世界书及启用条目。不会临时搜索其他世界书、全局启用资料或修改原卡。卡片、绑定、条目或相关配置改变后，旧结果不再供新故事采用；已经开始的故事和分支保留其冻结版本。

## 作者声明示例

在已绑定世界书的一个启用条目中加入以下代码块。示例是合成的“领取一次通行章”规则，不能作为真实第三方卡的转换证据：

````text
```squaretable-rules-v1
{
  "version": 1,
  "fields": [
    { "id": "stamp", "label": "通行章", "type": "boolean", "initial": false }
  ],
  "actions": [
    {
      "id": "claim",
      "label": "领取通行章",
      "intent": "act",
      "once": true,
      "requires": [{ "field": "stamp", "operator": "eq", "value": false }],
      "changes": [{ "field": "stamp", "operation": "set", "value": true }],
      "outcome": "你领取了通行章。"
    }
  ]
}
```
````

检查通过后，重新进入开场选择并建立新故事。开场预览若引用旧修订号，服务会拒绝创建，须重新读取。状态变化经过现有完整轮次提交与事件记录；中断、重复请求、条件不满足均不能重复执行。自由描述不会被推测为某个数值行动，模型输出也不能任意覆盖状态。

声明使用 [exploration v1 的校验结构](../../src/types/story-state.ts)：标量字段、`set`/`add`、`eq`/`ne`/`gte`/`lte` 条件和 `once`。有限适配不接受地图、公式、随机判定或嵌套资产；字段和行动均须非空。最多检查 2000 条启用条目、200 万字符；单份声明最多 64000 字符。超限不截取后声称成功。

原生 `extensions.squaretable.exploration` 与外部声明并存、多个声明、已识别外部控制/机制等会拒绝自动采用。发现可疑依赖并不等于已完整理解整张卡；无提示也不能保证未识别机制受支持。

## API 与运行维护

三个接口均须登录、当前租户且为卡片创建者；写接口沿用现有 CSRF 保护：

| 方法与路径（前缀 `/api/v1`） | 行为 |
| --- | --- |
| `GET /characters/:id/adaptations` | 最近十条任务，仅返回状态、结果类型及计数，不泄漏规则正文或来源全文 |
| `POST /characters/:id/adaptations` | JSON `{ "requestId": "UUID" }`，返回 202；同一请求查回原记录，另一活动请求返回 409 |
| `POST /characters/:id/adaptations/:jobId/cancel` | 取消等待/运行中的任务；已完成结果保持不可变 |

`STORY_ADAPTER_JOBS_ENABLED` 默认启用，设为 `false` 会停止本进程消费检查任务，不影响正常剧情记忆队列。默认每两秒取一批、每批最多四项；30 秒租约、最多三次领取。数据库记录及租约是恢复依据，当前没有 LangGraph 外部持久化检查点服务。过期工作进程、取消后的回调与源版本变化均不得发布结果。

升级需要 beta `0013_story_adapter_jobs` 或完整迁移 `0053_story_adapter_jobs`，新增 `story_adapter_jobs` 表。先备份并在恢复副本演练；单故事导出迁移携带冻结产物而不要求复制原库任务表。源卡身份映射到目标卡，原始来源摘要/任务出处保持为历史证明，不借其读取目标库其他世界书。

隔离验证：`node scripts/exploration-entry-check.mjs --adapter`。恢复迁移：`node scripts/story-nonempty-restore-check.mjs --transfer --export`。实际候选只读检查：`node scripts/story-overview-deployed-check.mjs --adapter`，依赖私有验收账户与夹具，不能把凭据提交到仓库。各命令验证范围及最新证据见[交付记录](../product/story-adapter-workflow-delivery-20261027.md)。

当前模型调用为零。后续增加模型整理节点须先接入独立工程额度预留、可靠用量结算、失败未知占用及取消后的迟到回执处理，不能把此确定性入口默认为无限额度 agent。
