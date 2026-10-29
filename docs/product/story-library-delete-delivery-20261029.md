# 故事库删除入口与 README 校正

日期：2026-10-29。归属 EXP-02；依用户明确要求补齐故事框右上角删除，遵循 DEC-14 / INV-08 的交付与证据边界。

## 根因及修复

此前修改 ChatSidebar 并不能覆盖 `/chat` 页面。实际入口是 `Chat.vue → WelcomePage.vue → StorySaveCard.vue`，其中缺少删除操作。不能将旧侧栏测试通过视为故事库入口已实现。

- 每张 StorySaveCard 右上角常驻垃圾桶图标和“删除”文字；支持键盘、44px触控区域。
- 确认框带故事名称，取消/关闭不发送请求；确认后使用既有故事删除 API。待确认/删除时禁用按钮，避免重复提交。
- 删除成功仅移除选定存档，保留来源角色卡与其他故事；失败显示错误，保留列表与重试入口。
- 共用 store 的删除操作不再写列表读取的 loading/error 状态，避免列表因删除而卸载或被错误页替换。

## README

重写当前能力与边界、单人内测定位、安装顺序、核心/可选依赖和文档导航；删除旧100%完成与过期统计。历史发现页截图明确标注日期与隔离环境；替换不适合展示的重复模型替身对话截图，新增当前源码的故事库桌面/手机截图。截图使用测试接口及测试故事，不是用户存档或真实模型质量证明。仓库缺独立 LICENSE 的情况如实注明，不自行添加授权文本。

## 验证

- StorySaveCard 与 chat store：76项测试通过，覆盖取消、关闭、确认、重复点击、目标存档、失败重试与不导航。
- Vue/TypeScript检查通过。
- Playwright生产前端构建：1440/390两组 `/chat` 浏览器检查通过，覆盖右上角可见性、键盘确认、取消、503后重试、保留其他故事、刷新后状态及无横向溢出。
- 新截图为 `docs/images/story-library-desktop.png` 和 `story-library-mobile.png`，已人工查看。
- 浏览器使用接口替身，没有删除用户故事、调用付费模型或验证真实数据库删除。本次后端删除协议未修改。

复现：

```bash
npx vitest run src/client/components/chat/StorySaveCard.spec.ts src/client/stores/chat.spec.ts
npm run type-check
README_SCREENSHOTS=1 npx playwright test -c playwright.story.config.ts e2e/story-library.spec.ts
```

## 部署边界

初次交付时 Docker socket 不存在，无法连接原3081容器。本轮交付源码、生产前端验证与 GitHub 更新，不声称3081运行页面已同步；待恢复部署环境后再更新并核验。人工真机签收及其余开放工作包不因本轮而关闭。

## 部署补充与更名

2026-10-29，用户明确中文名称为“小小方桌”，同步 README、中文导航品牌、账户标题、登录欢迎文案及 HTML title，英文名和仓库名不变。Docker通过系统服务启动，既有容器恢复后构建并部署 `small-squaretable:exploration-20261029-brand-library`，镜像前缀 `f3c2465be7bc`。

- 使用现有升级脚本备份与恢复演练，76表原数据一致，16项beta迁移；3080镜像不变。模型配置、登录密钥和每日10M额度保持。
- 3081健康检查、浏览器页面请求和9个HTML引用资源均200，HTML标题正确。
- 对3081正式前端执行1440/390浏览器检查，两组通过；覆盖标题/品牌、卡片删除确认/取消/失败重试/刷新。业务接口使用测试替身，不删除真实存档，不调用模型。
- README两张故事库截图已从本次部署前端重新生成并查看手机图，测试数据与历史发现页来源继续明确标注。
- 备份/回退目录：`backups/exploration/upgrade-ff806801-8803-47db-82c0-a9050bfa40da/`，不纳入Git。

入口：`http://localhost:3081/chat`。旧标签页需刷新以加载新资源。此前“未部署”的限制在此解除；人工真机及其余工作包验收继续保持开放。
