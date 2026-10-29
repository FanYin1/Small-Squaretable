# 探索候选：正式页面与参考对照

日期：2026-10-24。当前部署入口是3081，3080是保留的历史候选，5188是预写原型。依据DEC-03至08、10至14及INV-01/02/03/05/06/07/08/09，记录实际页面、数据来源和证据边界，不替用户签收视觉。

## 两类证据

- `integration/`：临时PostgreSQL/Redis、真实服务端、真实浏览器和受控模型。六页同内容正式/原型对照为390/1440px × 明暗 × 两种来源共48张；游玩页390/768/1440px × 明暗共6张。12组流程验证及源码摘要见 [报告](integration/report.json)。受控模型只验证程序闭环，不验证真实剧情质量。
- `deployed/`：实际3081镜像、恢复迁移后的数据库、合成账户。游玩页390/1440px × 明暗共4张，验证直达/刷新、真实初始状态与笔记保存、创作/账户/余额入口；没有调用模型生成。见 [部署报告](deployed/report.json)。

原型与生产都使用两张原创卡，以减少内容差异遮蔽布局问题；受控生成的后续剧情仅用于测试。所有归档截图都是合成验收内容，不含真实用户聊天、密钥或邀请码。

## 七页查看入口

| 页面 | 正式桌面浅色 | 对照 / 手机浅色 |
|---|---|---|
| 发现 | [正式](integration/production-discover-1440-light.png) | [原型](integration/reference-discover-1440-light.png) / [手机](integration/production-discover-390-light.png) |
| 卡详情 | [正式](integration/production-detail-1440-light.png) | [原型](integration/reference-detail-1440-light.png) / [手机](integration/production-detail-390-light.png) |
| 可选身份 | [正式](integration/production-identity-1440-light.png) | [原型](integration/reference-identity-1440-light.png) / [手机](integration/production-identity-390-light.png) |
| 游玩 | [实际3081](deployed/candidate-play-1440-light.png) | [实际3081手机](deployed/candidate-play-390-light.png) / [受控行动后](integration/play-1440-light.png) |
| 我的故事 | [正式](integration/production-library-1440-light.png) | [原型](integration/reference-library-1440-light.png) / [手机](integration/production-library-390-light.png) |
| 创作 | [正式](integration/production-create-1440-light.png) | [原型](integration/reference-create-1440-light.png) / [手机](integration/production-create-390-light.png) |
| 账户 | [正式](integration/production-account-1440-light.png) | [原型](integration/reference-account-1440-light.png) / [手机](integration/production-account-390-light.png) |

暗色图片将文件名中的`light`替换为`dark`。游玩原型保存于 [七页参考快照](../exploration-baseline/README.md)；原型中预写的数值、剧情和可选控件不能直接当成生产能力要求或实现证明。

## 可见变化与待签收点

游玩页采用正文与资料分区，桌面300px资料列、窄屏可收起窗口，不再常驻平台侧栏。角色状态、行动依据、已知地点和个人笔记来自当前故事；普通叙事卡不补造货币或地图。账户与创作也进入同一视觉体系，同时保留已有的角色权限和功能开关。

保留差异：真实资料可能缺少作者定义，原型预写的展示项不能直接照搬；账户及创作展示真实服务操作，原型展示本地样例；推荐明确提供“填入输入框”和“执行”供比较，默认方式未定。正文样式、资料密度、手机窗口是否妨碍阅读和软键盘、明暗视觉与长期对白体验，仍需用户实际验收。

检查记录、镜像、恢复演练及供应商429见 [本机候选交付](../../deployment/exploration-candidate.md)。源文件摘要对应测试时文件；后续改动必须重新生成受影响证据，不能沿用本次截图宣称新版本通过。
