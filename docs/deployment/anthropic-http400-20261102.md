# Anthropic HTTP 400 调查与错误诊断修复

2026-11-02，关联DEC-31/32、INV-02/04/05/08；范围是原生Anthropic适配器的请求拒绝处理，不改变模型配置或剧情执行规则。

## 调查结论

太衍商途会话在北京时间20:55:35及20:55:49发起的两次请求，分别约1.3秒、1.0秒后记为failed / LLM_API_ERROR。当前会话模型字段为claude-sonnet-5-5；该字段不是历史轮次的冻结证据。用户看到Anthropic API returned HTTP 400，对应原生Messages适配器路径，与此前生成结束后的STORY_INVALID_JSON不同。

该渠道使用anthropic格式，路径/v1，模型名称无别名映射，单次max_tokens配置为10,000。现有适配器没有发送OpenAI penalties/stream_options，同时只选择temperature或top_p。不能凭400推断密钥、模型映射、温度或容量中哪项错误，未修改这些设置。

旧适配器在非2xx时直接抛出状态码，未读取上游错误正文；WebSocket错误日志又把对象作为Error参数，导致仅留下[object Object]。因此无法恢复这两次拒绝的具体原因。用户此前确认中转站无法查询原响应，不再要求提供不可得的日志。

## 已实现

- 普通与流式请求都在成功内容解析前读取非2xx错误：最多16KiB、总计1.5秒，超限或读取失败回退；中断保留AbortError，成功流不额外读取。
- 依据HTTP状态及可识别的JSON错误提示，返回固定中文类别：上下文、输出长度、采样参数、模型、消息格式、认证、权限、限流、服务不可用或未知。分类是供应商报告的线索，不等于本地已独立确认根因；不反射上游原文、密钥、URL或用户输入。
- 保留HTTP状态与LLM_API_ERROR；400不自动重试。WebSocket日志记录正确的Error与chatId/requestId/statusCode/category/bodyState。已接收的轮次保持防重复提交保护，失败释放未消耗的预扣，状态不提交。
- 未改变任何模型参数、协议、额度、数据库结构或历史故事，不增加自动修复/兜底模型调用。

## 验证与限制

139项定向回归通过，涵盖普通/流式服务、错误分类、超大/超时/取消响应、既有SSE行为、失败预扣释放与无状态提交；日志断言补充后63项WebSocket回归通过。完整构建（类型检查、服务端、客户端）通过；相关lint0错误、4条既有警告。证据：/tmp/anthropic-tests.log、/tmp/anthropic-ws-tests.log、/tmp/anthropic-lint.log、/tmp/anthropic-build.log。

工程付费测试暂停保持，未调用真实模型或重放用户失败轮次。本次解决诊断信息丢失，**尚未复现或确认上游400的具体触发参数**。发布结果见下节。

## 远程发布

已部署至 http://47.116.114.103/ ，镜像 `small-squaretable:remote-20261102-anthropic`，ID `14a0772cd14eedb9da943dec3997320ff9cff9489b30319dd187740b6b4432bd`。发布目录 `/srv/small-squaretable/releases/anthropic-20261102T130720Z/`，数据库备份48,984,051字节，目录清单校验通过，保留旧镜像与配置用于回滚。

75项依赖/迁移文件一致，244运行文件与发布包一致；相对上一版本只改变server/index.js及其source map，客户端文件逐字节相同。核心七表指纹、模型配置、Nginx、生成/记忆/适配队列计数保持；环境仅应用镜像变更，无数据库迁移。

四容器健康，公网ready200，HTML及210assets逐字节一致，页面入口200；匿名后台模型API401、缺租户400符合预期。认证WebSocket101、工程故事idle及三次心跳通过，临时凭据已删除，没有发送剧情行动。启动检查中唯一error级记录为上述匿名API测试预期的401。公网证据 `/tmp/squaretable-anthropic-public/`。

没有进行付费模型验证，原400具体原因仍未确认。后续若上游继续拒绝请求，新增分类和关联请求日志用于定位；无法识别的错误仍明确显示未知，不能据此承诺模型现已可正常生成。
