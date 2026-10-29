# PNG 压缩角色资料兼容

日期：2026-10-24（香港时间）。对应 EXP-03B-COMPRESSION、DEC-02/12/14、INV-07/08/09。完成范围是PNG角色文本块的有界解压及三个导入入口的验证，不代表完整角色玩法或全格式兼容。

## 可见行为

网页单卡、网页批量与CLI现在都能读取使用zlib压缩的`iTXt`和`zTXt`角色资料，支持`chara`及`ccv3`关键字；原有JSON、普通`tEXt`和未压缩`iTXt`行为保留。解压结果仍须通过base64、UTF-8、JSON及角色字段校验，之后才允许创建角色和内嵌世界书。

错误数据不会变成空白角色，也不会因为新版本资料损坏而悄悄读取同一PNG中的旧`chara`。`ccv3`仍优先；同关键字冲突规则、原始选中对象归档、未知扩展保留和单文件事务保持原有边界。不执行作者脚本、不自动匹配世界书、不改已有档案。

| 情况 | 结果 |
|---|---|
| 压缩`iTXt`、`zTXt`中的有效V2/V3资料 | 解析并继续既有创建校验；原始对象和内嵌书保留 |
| 截断流、错误zlib校验值、尾部多余数据 | `INVALID_METADATA`，不创建角色 |
| 用gzip或裸deflate替代所支持的zlib流、无效压缩方法 | 拒绝，不尝试猜格式 |
| 解压后资料超过10 MiB | `METADATA_TOO_LARGE`，中文提示精简后重新导入 |
| 当前浏览器/运行环境缺少原生解压能力 | `UNSUPPORTED_COMPRESSION`，提示导出为JSON；普通JSON和未压缩卡仍可使用 |

批量接口沿用逐文件结果；CLI沿用成功/失败/跳过计数和退出码。浏览器单卡在本地发现超限或能力不可用时，不发送角色创建请求。

## 实现边界

`src/types/character-card-import.ts`使用原生`DecompressionStream('deflate')`，没有新增第三方解压依赖。输入以1 KiB分段送入，逐段读取输出；累计输出超过`MAX_CHARACTER_METADATA_BYTES`时取消读取并释放reader。只有完整流读取成功，才解码和解析角色JSON。

输入文件上限仍为10 MiB；新增上限约束的是**解压后的base64文本字节数**，同为10 MiB，且正好达到上限允许继续验证。后续角色字段、`cardData`总大小和请求大小限制仍然生效。这是输出大小约束，不能解读为浏览器或原生解压器总内存分配精确不超过10 MiB。

`parseCharacterPng`、`parseCharacterFile`及CLI的`prepareImportFile`改为异步，所有正式调用点已使用`await`，类型检查覆盖应用与CLI；原始JSON解析函数仍可同步使用。仅解压选中的角色资料，不解压无关文本块或被V3替代的旧载荷。

这里没有添加JPEG/WebP内嵌卡、ZIP资产包、完整PNG像素校验、任意作者协议或原始文件归档能力。原始对象归档仍指所选载荷解码后的对象，不是整个图片的逐字节副本。

## 验证

机器可读证据：[压缩资料验证报告](evidence/character-card-compression.json)。前序[网页格式验证](character-card-formats.md)与[CLI验证](character-cli-import.md)保留当时的源码摘要和范围；其中“压缩资料不支持”的描述已被本轮有限支持替代。

- 9个测试文件合计213项通过：147项格式/CLI专项，加66项相关回归。41种合成文件覆盖JSON与普通PNG、压缩V2/V3、损坏/截断/错误封装、超限、V3不降级；另验证精确10 MiB边界和能力缺失时的普通JSON读取。
- 本机正式构建后端、一次性PostgreSQL/Redis与Chromium共14组检查通过，保留授权目录中3张卡、2本世界书的网页/CLI入库回归、事务、导出、绑定冻结和受控生成检查。
- 真正的CLI子进程导入两份压缩V3卡，角色、内嵌书及条目均保存；另三份超限、尾部损坏或选中V3损坏文件失败，退出2，未产生相应角色/书/条目。
- 正式浏览器页面通过压缩`iTXt`批量导入、`zTXt`单卡导入；本地超限和禁用原生解压能力的检查均显示中文原因，新增创建请求为0，数据库记录数保持不变。无API拦截，页面脚本错误为0。
- 原始资料入库比对采用所有映射字段的多重集，包含作者顺序值、完整正文/关键词/设置和重复条目数量，不依赖SQL为相同排序键提供额外顺序。首次逐行对比失败后采用此比较并复测通过；未保存原始第三方条目差异，不能据此声称首次差异已经被逐项定位。
- 应用及CLI类型检查、生产前后端构建、脚本语法和补丁检查通过；定向lint为0错误、16条宽类型等警告。隔离容器已清理。

主要复现入口：

```sh
npm run type-check
npm run type-check:imports
npx vitest run src/types/character-card-import.spec.ts src/client/utils/sillytavern.spec.ts src/server/services/character-cli-import.spec.ts
CARD_LIBRARY_SAMPLE_ROOT='<已授权本机素材根目录>' node scripts/exploration-entry-check.mjs --library
```

本轮无新增付费模型调用；累计398,002/450,000 token、剩余51,998不变。3080/3081/5188没有部署更新，不把隔离验证当作用户签收。历史旧卡/漏书的只读审计与显式修复、作者脚本/面板适配及真实游玩验收继续由EXP-03B跟踪。
