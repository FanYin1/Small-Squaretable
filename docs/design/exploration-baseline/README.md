# 七页示例：开发参考快照

日期：2026-10-22。参考版本：EXP-02 七页示例 v0.2。

用户在七页示例交付后回复“可以，准备后续开发吧”。该快照作为后续页面实现的比对依据，不代表生产页面、模型能力、长期记忆或真机已验收。当前计划见 [正式开发计划](../../product/exploration-implementation-plan.md)，可交互入口见 [示例说明](../exploration-demo/README.md)。

## 保存内容

- `desktop-dark.webp`、`desktop-light.webp`：七页桌面总览，从已验证的浏览器截图转换保存。原始逐页截图由 `scripts/exploration-pages-check.mjs` 重新生成，包含 390/768/1440px 与明暗主题。
- `prototype-source.tar.gz`：该版本的 HTML、CSS、JS、示例服务器、两个验证脚本及所需字体。只包含明确列出的原型文件，不含环境配置、邀请码、真实消息或生产数据。
- `manifest.json`：源文件及上述交付文件的 SHA-256 摘要，记录来源和验证边界。保存于仓库内，避免只依赖临时目录截图。

## 查看与校验

从项目根目录运行：

```bash
npm run check:exploration-baseline
npm run check:exploration-baseline -- --compare-current
```

第一条检查已保存的参考文件是否完整。第二条额外比较当前原型源码是否仍与快照相同；差异提示不是禁止修改，后续按用户反馈正常迭代，但应记录新的参考版本与替代原因，保留此前的依据。

需要恢复旧示例时，将 `prototype-source.tar.gz` 解压到一个新的空目录，进入该目录运行 `node scripts/exploration-demo-server.mjs`；端口冲突时设置 `EXPLORATION_DEMO_PORT`。不要直接覆盖当前工作区。运行验证脚本还需要项目中已有的 Playwright、Chromium 和 sharp 依赖，快照不包含 node_modules。

## 证据边界

此处保存的是独立预写示例，不是正式产品截图。两种场景、本地身份/草稿/进度和主题行为已有 Chromium 检查记录；构建发布、真实供应商、Safari/Firefox、真机软键盘及用户最终视觉验收另行记录。总览经过缩放和有损压缩，只用于布局参考，文字清晰度、颜色数值和逐像素比较应使用重新生成的原始 PNG 与设计令牌。

本次准备验证：三个参考文件与八个当前源文件摘要一致；归档已在独立临时目录解压，八个文件摘要复核通过，恢复的服务器可读取 HTML、CSS、JS 和两份字体。临时服务随后关闭，现有候选与示例服务未变更。未为文档准备重复运行全套业务测试或将该校验计为生产验收。
