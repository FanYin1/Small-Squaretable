# 控制 JSON 尾随排版符号兼容与诊断

对应DEC-31/32/34、INV-02/04/05/08。用户反馈会话 `af30a1e9-bb9c-4b9f-b34e-de089ed98185` 再次出现剧情控制格式错误。

## 现场证据

北京时间2026-11-03 20:59:30，消息469失败：GLM-5.3-FlashX，实际请求输出上限128000，供应商报告输出2059 token，finishReason=stop，无长度截断或流中断。控制尾部生成1721ms，结束信号到释放连接1ms，因此本轮不是输出额度不足或等待连接关闭。

校验为 `invalid_json / unexpected_content`，控制JSON长度620，错误偏移619，字符类别other。可确定根JSON结束后仍有一个非空白字符；不能由other推断它一定是句号、反引号或任何具体字符。服务器未保存失败原文，只保留28字失败提示和诊断，因此无法对该历史输出作精确重放。

前一轮20:57通过，warning为redundant_closer_removed；更早一轮通过且记录redundant_quote_removed。旧兼容逻辑确实已执行，并非部署未生效。消息469为interrupted，生成请求failed/STORY_INVALID_JSON，不自动恢复历史、不重放用户行动。

## 改动及边界

- 保留严格JSON解析；仅当解析失败且找到配对完整的唯一根对象，才允许去除根对象之后的一个白名单排版字符：英文单引号、反引号、英文句号/分号、中文句号/分号、右弯双/单引号。原有单个多余右花括号/双引号兼容保持。
- 去除后根对象必须独立通过JSON.parse；记录trailing_punctuation_removed。没有补写缺失字段或分隔符，不改字符串、证据或行动值。额外对象/数组/单词/数字、多个标点、零宽字符、截断对象和无闭合协议继续拒绝。
- 原schema、输入证据、可用行动、资源规则、流完成状态和事务幂等全部保留；无依据行动不能因排版兼容而提交。成功轮次仍生成并保存推荐；失败轮次不提交规则后果、事实或推荐。
- 提示词明确根对象与结束标签之间不得附带排版符号；错误诊断新增固定类别apostrophe/backtick/period/semicolon/typographic_quote/letter/digit，仍不记录原字符、私有正文或供应商异常原文。

## 验证

171项针对性回归通过（story-intent、story-recommendations、story-state-direct）：覆盖白名单、拒绝边界、转义/Unicode证据不变、成功仅执行一次，以及无依据/不可用行动、语法错误、截断均不改变资产。定向lint通过。首轮8项新测试因未计入既有recommendations_fallback警告而失败，修正断言后完整重跑通过，未修改推荐回退行为。

完整类型检查、服务端/客户端构建通过，补丁格式检查通过。

## 远程发布

已部署 `small-squaretable:remote-20261103-control-punctuation`，镜像SHA为 `64fa404ee3444d7bfa39f13dd71ad995103aec9bdfcc5d17f5fc0ef97a47864b`。发布目录 `/srv/small-squaretable/releases/control-punctuation-20261103T130554Z`；切换前已检查无活动请求，并备份数据库56,288,098字节、验证归档目录。

244项运行文件与本地测试构建一致，75项依赖/迁移检查通过；七核心表指纹、生成/记忆/适配队列、模型配置、Nginx保持，环境文件仅改应用镜像。公网HTML/210assets逐字节一致，ready及六个页面入口200，四容器健康；1440/390首页和登录页无页面异常、API5xx或横向溢出。认证模型目录5项容量有效、WebSocket101及连续三次心跳通过。未调用真实模型、未重放失败轮次，临时认证文件已删除。

证据：`/tmp/control-punctuation-{tests,lint,build}.log`、`/tmp/verify-control-punctuation-{public,browser,websocket}.log`及`/tmp/squaretable-control-punctuation-public/`。线上资产/连接检查不等同于真实供应商后续生成质量验收。

本项是已知排版尾缀的有界兼容，不宣称已复原消息469的具体符号，也不能保证任意模型输出均合法；正文与控制解耦、结构化输出能力路由属于独立工作。
