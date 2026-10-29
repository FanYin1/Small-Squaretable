# 计量测试事务夹具修复

对应[容量交付](story-model-capacity-delivery-20261027.md)留下的19项计量测试失败。此项属于回归可靠性修复，不是AD-3新增机制、AD-5逐卡玩法或页面加载问题的完成证据。

## 原因与修改

WebSocket在检查消息配额、领取请求和保存输入之前调用`prepareStoryTurn`。该服务现已通过只读、可重复读事务准备故事，即使旧档最终返回null，也必须先进入事务。旧计量测试只提供update/set/where数据库替身，没有transaction，因此请求在进入计量路径前报错。缺失方法也使预设的一次性失败没有按预期消费，影响后续用例；上轮的19项失败不代表19个独立生产计费故障。

仅修改`src/server/routes/websocket-metering.spec.ts`：事务替身实际调用回调、每项用例重置事务行为，继续使用真实`prepareStoryTurn`的旧档判断，没有把它整体替换成恒定成功。事务对象不提供虚构查询结果；测试并不模拟数据库隔离、提交或回滚，因此不替代已有真实数据库验收。生产代码、配额检查、请求幂等和费用逻辑均未改变。

新增三项保护检查：

1. 旧档准备确实使用只读可重复读事务，并发生在配额检查之前。
2. 状态事务读取失败时，不领取请求、不保存消息、不记录用量、不生成；恢复后同一处理器可接受新输入，没有遗留本地忙状态。
3. 向旧档发送原生行动时，由真实准备逻辑返回`STORY_ACTION_UNAVAILABLE`，不绕过为默认成功，也不保存或计量。

## 实际结果

原36项计量测试修复后全部通过，加3项后为39项。连同预付点数49、WebSocket15、模型配置15、上下文预算8、上下文管理12、意图19，共7文件157项通过；定向lint与补丁格式检查通过。没有运行全仓库测试，不把157项称为全量。

```bash
npx vitest run src/server/routes/websocket-metering.spec.ts src/server/routes/websocket-credits.spec.ts src/server/routes/websocket.spec.ts src/server/config/llm.config.spec.ts src/server/services/context-budget.spec.ts src/server/services/context-manager.service.spec.ts src/types/story-intent.spec.ts
npx eslint src/server/routes/websocket-metering.spec.ts
```

私有证据：`backups/exploration/metering-regression-20261027/manifest.json`，保留上轮真实失败日志及此次最终结果；没有改写旧容量交付的证据文件。此次启动的一个名为before的临时日志实际已读到修改后的文件，不能当作修复前复现；修复前依据仍是容量交付归档的19项失败。

**本次实际效果是恢复回归测试的有效覆盖，不是改变玩家页面或收费规则。**3081仍为`exploration-20261027-capacity`（c7fa6ed9935e），3080未变；只改测试，不为它重建部署。新增付费请求0、个人点数调整0；工程账本占用692,784、可分配757,216，新增在途/未知为0。

关闭待办“既有计量测试事务夹具”。AD-3完整来源机制、四张用户卡持续玩法、AD-5父项、EXP-07D-LOAD及人工验收仍开放。本轮代码阅读没有确认个人库加载超时根因，不凭测试通过或已有失败提示宣布已修复。
