# 小小方桌工作台交互原型

2026-10-31：根据现有单人故事、私人库、公开角色卡、开局选择、每轮推荐和创作能力，提供统一工作台的五个测试视图，并增加三套可比较的视觉方案。A · 书页已接入正式前端；本页继续保留三套独立原型，用于比较信息层级、阅读空间和交互，B/C 不代表正式产品选型。

## 三套视觉方案与稳定切换

[方案对比入口](http://47.116.114.103/previews/workbench/#styles)提供三套方案的示意与直达按钮。右上角下拉框可随时切换，保留当前视图、演示消息和草稿，不请求后端。

| 方案 | 首页 | 对话 | 视觉与布局差异 |
| --- | --- | --- | --- |
| A · 书页 | [首页](http://47.116.114.103/previews/workbench/?style=paper#home) | [对话](http://47.116.114.103/previews/workbench/?style=paper#play) | 米白、暖棕、衬线正文、横幅封面和纵向推荐 |
| B · 简约工作室 | [首页](http://47.116.114.103/previews/workbench/?style=studio#home) | [对话](http://47.116.114.103/previews/workbench/?style=studio#play) | 白蓝、无衬线正文、横向卡片、桌面并排推荐；手机推荐恢复纵向 |
| C · 夜航 | [首页](http://47.116.114.103/previews/workbench/?style=cinema#home) | [对话](http://47.116.114.103/previews/workbench/?style=cinema#play) | 默认墨蓝深色、海青、背景封面横幅、竖版卡片和安静阅读区 |

三套均覆盖首页、库、详情、对话、创作，支持各自的深浅主题。书页是当前正式方案的原型对应版本，另外两套是可比较的设计提案。

2026-10-31 用户指出进入会话过于突兀并同意调整：侧栏只随用户手动操作展开/收起，跨页面保留；顶栏、背景与角色名称/封面标识保持连续。仅主内容做200ms透明度渐入，减少动态偏好下禁用。演示故事分别在当前会话内保留消息、草稿与阅读位置，返回时还原；第一次继续示例故事定位最新，选择新开局则从开场开始，且两项开局展示不同内容。离开最新位置后显示“回到最新”。这替代初版“进入对话自动收起侧栏且每次定位末尾”的行为，既有推荐直接提交和DEC-29抽屉行为保留。

| 页面 | 公网入口 | 可体验的内容 |
| --- | --- | --- |
| 工作台首页 | http://47.116.114.103/previews/workbench/#home | 继续故事、角色卡和创作快捷入口 |
| 我的库 | http://47.116.114.103/previews/workbench/#library | 卡片网格、私人/公开筛选、搜索及空态 |
| 角色详情 | http://47.116.114.103/previews/workbench/#detail | 主操作、示例开局、折叠兼容说明 |
| 故事对话 | http://47.116.114.103/previews/workbench/#play | 手动收起导航、独立正文滚动、三项推荐、自由输入、覆盖式资料抽屉 |
| 创作工作台 | http://47.116.114.103/previews/workbench/#create | 分步编辑、卡片预览、导出本地演示 JSON |

太衍商途详情与对话可通过库进入，也可使用 `#detail-trade`、`#play-trade`。统一提供浅色/深色主题；窄屏导航和创作预览按需展开。继续故事恢复阅读位置，新开局从开场开始，输入框保持可见；推荐点击直接提交演示行动，不先填入输入框。资料抽屉加暗幕、阻止正文操作，支持 Escape、焦点循环和关闭后焦点恢复。

## 数据与范围

- 蔚蓝星域、太衍商途仅复用正式站点已公开的名称及缩略封面；简介、开场、存档、对白和记忆均为明确标注的预写示例，不表示原卡的真实剧情或规则。
- 雾港来信、山间书店为演示私人卡，入口引导到创作示例。没有真实收藏、导入、发布、登录、保存、分支或模型调用；当前页面会话内保留演示消息、阅读位置和草稿；刷新重置全部演示内容。
- 不显示无来源的资源数值、关系分数、地图或成功保存状态。导出文件标记 `kind: workbench_demo_draft`，不是正式角色卡格式。
- 页面无业务 API 请求，CSP 设置 `connect-src 'none'`；不会读取或修改正式账户。图片为本地 WebP 缩略资源，字体及授权见 `assets/FONT-LICENSE.md`。发布资源不足220KB，未包含完整原卡或私有资料。
- 对应 DEC-03/05/15/16/17/23/25/29、INV-02/08；原型没有实现 DEC-21 的真实分支。正式 A 方案只统一页面外壳、阅读排版和资料抽屉，不改变既有产品契约；B/C 仍是比较用原型。

## 验证与复现

本地运行：

```bash
node scripts/workbench-preview-server.mjs
node scripts/workbench-preview-check.mjs
```

公网复核：

```bash
WORKBENCH_PREVIEW_URL=http://47.116.114.103/previews/workbench/ \
WORKBENCH_PREVIEW_EVIDENCE=backups/exploration/workbench-styles-public-20261031 \
node scripts/workbench-preview-check.mjs
```

初版五页本地及公网通过15页面组合/3交互旅程。三风格更新的最终结果见下方，检查范围为1440/768/390宽度、三风格各六视图（含方案对比），共54页面组合、9条交互旅程。覆盖搜索筛选、推荐直接提交、自由输入转义、抽屉焦点/Escape、创作字段保留、实时预览、JSON导出、主题和手机预览切换；截图与 report.json 分别位于上述本地默认/公网证据目录。浏览器窄屏模拟不代表手机真机、中文输入法和软键盘验收。

修复记录：首轮本地发现抽屉 Shift+Tab 焦点逃逸，加入焦点循环；另修正测试可访问名称中的空白匹配和网格最小高度导致的输入框超出视口。首次公网验证403，原因是 `/srv/small-squaretable` 为私有目录，已将公开文件改放 `/var/www/squaretable-previews/`，未放宽私有目录权限；最终完整重跑通过，不将首轮失败计为成功。

最终三风格本地及公网完整重跑均通过54视图/9交互旅程，无水平溢出、业务API请求或页面异常。追加核验手动侧栏跨页保留、演示消息/草稿/阅读位置恢复、切换风格不丢内容、两卡不同开场和对应资料、回到最新、正常动态偏好的200ms内容渐入及外壳宽度不变；减少动态旅程均禁用渐入。证据为 `backups/exploration/workbench-styles-local-20261031/` 与 `backups/exploration/workbench-styles-public-20261031/`。最终公网 HTML/CSS/JS 与本地逐字节一致，首页与ready为200，付费调用0。

## 公网部署与回退

仅给 Nginx 新增 `/previews/workbench/` 静态入口，原 `/` 应用代理保持。资源位于 `/var/www/squaretable-previews/workbench-20261031/`，`workbench` 符号链接指向当前版本（三风格更新使用 `workbench-20261031-styles`）；配置为 `/etc/nginx/snippets/squaretable-workbench-preview.conf`，由原站点 server 引用。`nginx -t` 通过后平滑重载，未重建/重启应用或修改数据库。

上线后正式首页、`/health/ready`、预览及脚本均200；预览目录下不存在的 `.env` 和图片路径404，CSP响应头有效。正式应用已切换至 `small-squaretable:remote-20261031-workbench-paper`；三风格原型入口仍不调用业务 API。

三风格版本以原子切换符号链接发布，未修改Nginx或重启应用。上一资源目录记录于 `/srv/small-squaretable/releases/workbench-preview-20261031/styles.previous`，需要撤销本次视觉更新时原子切回该目录即可。

原配置备份：`/srv/small-squaretable/releases/workbench-preview-20261031/nginx.before`。撤销预览时从站点配置移除该 snippet 的 include，再 `nginx -t` 并平滑重载；若期间有其他配置变更，不直接覆盖整份配置。初次受目录权限阻挡的资源副本保留在 `/srv/small-squaretable/previews/`，不作为线上资源路径。

EXP-02及其他父工作包维持既有状态；A 方案已完成正式前端接入，真实模型连续游玩和手机真机验收仍按各自边界另行记录。
