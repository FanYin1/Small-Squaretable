# 视觉语言规范

> 常驻文档。记录视觉与交互的既定规则，以及每条规则背后的理由。
> 定位见 [`../product/positioning.md`](../product/positioning.md)。任务见 [`../product/backlog.md`](../product/backlog.md)。
>
> 最后修订：2026-10-18（审计后修订：断点按实测数据重定；字体改为系统栈优先；动作描述放弃斜体方案；主题合并改为挂根节点）

---

## 设计目标：氛围优先于功能

这个产品只有一个界面是被长时间注视的：聊天。用户一次读几百字，连读几十分钟。

其余所有界面（登录、市场、设置）都是通往那个界面的路。它们应该高效、不显眼、不抢注意力。

由此得出两条贯穿全文的判断：

1. **聊天区与角色卡区是产品身份所在**，值得投入自有组件与定制排版。
2. **表单区与管理区没有差异化价值**，继续用 Element Plus，不要花时间重写。

这条分界线同时也是 Element Plus 的使用边界（见下文）。

---

## 令牌层的现状评估：做得对，不要推翻

`src/client/styles/variables.css` 里的可访问性工作质量很高，且**理由都写在注释里**。几个代表性的决定：

| 决定 | 理由 |
|---|---|
| 双角色主色：`--accent: #D97706` 用于填充，`--accent-text: #A55B05` 用于文字 | #D97706 在白底上实测只有 3.19:1，而全站 114 处在用 `color: var(--accent)` |
| `--accent-on: #1A1918`（琥珀底上用深炭字，不用白字） | 深炭 5.51:1，白字只有 3.19:1，不达 AA |
| `--text-tertiary` 从 #A39E99 提到 `#726D67` | 原值 2.66:1，而有 74 处在用 |
| `--focus-ring` 是双环：`0 0 0 2px var(--bg-base), 0 0 0 4px var(--focus-ring-color)` | 内环用底色隔开，保证在任何表面上都可见。注释里记着：129 个文件只有 12 个定义了焦点样式，还有几个写了 `outline: none` |

`src/client/styles/immersive.css` 同样：遮罩 alpha ≥ 0.90 是按「纯白立绘」这种最坏情况实测推导的（0.90 时 `faint(#8F8982)` 达 4.60:1 过 AA，0.82 时只有 3.54:1 不达标）。

**规则：新增任何颜色，必须在它会出现的最差表面上验证对比度，并把实测值写进注释。** 这个项目已经建立了这个习惯，不要在后续工作里丢掉它。

---

## 主题决定：暗色沉浸为默认

**现状的矛盾**：`immersive.css` 是全项目质量最高的一层视觉工作，但它的作用域限定在 `.immersive`，而全站只有 `src/client/pages/Market.vue` 一个页面挂了这个类。同时 `src/client/composables/useTheme.ts` 里：

```ts
theme = ref(localStorage.getItem(STORAGE_KEY) || 'light')
```

默认浅色，且不读 `prefers-color-scheme`。

结果是产品的视觉身份存在，但默认看不到。

**决定：**

- 暗色沉浸为默认主题，浅色作为可选项保留
- 首次访问读 `prefers-color-scheme`；用户显式选择后持久化并优先于系统偏好
- 主题必须在首帧前确定（避免 FOUC），不能等 `mounted` 后再切
- `variables.css` 283–399 行的 dark 主题段与 `immersive.css` 有重叠，**合并为一套，不要并存**

**暗色下的三条硬约束**（都是 `immersive.css` 已经踩过的坑，写在这里避免重犯）：

1. **层次用表面明度递增表达，不用阴影。** 暗背景下阴影不可见，`--el-box-shadow` 要清零，否则只是把黑加深。
2. **边框承担分隔职责，权重比浅色模式高一档。**
3. **琥珀底必须配深炭字，绝不配白字**（~8.5:1 vs ~2.1:1）。选中态优先用「琥珀字 + 琥珀薄衬底」而不是「琥珀底」。

**teleport 作用域问题：把主题挂在根节点，问题自然消失。** Element Plus 的 `el-select` / `el-dropdown` 下拉会 teleport 到 `<body>`，落在 `.immersive` 容器之外，`var()` 解析失败时会继承浅色值——表面变深了但下拉还是白底。`immersive.css` 的解法是给下拉挂 `popper-class="im-select-popper"` 并在文档级重复声明令牌。

**不要把这套推广到全站。** `useTheme.ts` 已经把 `data-theme` 设在 `document.documentElement` 上，`<body>` 和所有 teleport 出去的弹层都在它之内。所以正确的合并方式是把 `--im-*` 的取值写进 `[data-theme="dark"]`，而不是让更多页面挂 `.immersive`。合并后，`.im-select-popper`、令牌桥接段、侧栏令牌补齐都可以删除；需要保留的只有 `--el-*` 变量映射。

**首帧前确定主题。** 现在 `index.html` 只有 `type="module"` 的入口脚本，主题要等 JS 包加载完、`useTheme` 执行后才设置。默认是浅色时问题不明显；默认改成暗色后，每次刷新都会先闪一下浅色。需要在 `<head>` 里放一段同步内联脚本，读 `localStorage` 与 `prefers-color-scheme` 后立即设好 `data-theme`。

另一个同类坑：侧栏用自己一套 `--sidebar-*` 令牌，不读 `--bg-surface`，所以全局桥接够不到它，实测会渲染成纯白并在深色内容区旁拼出一条白边。合并主题时逐组检查这类自治令牌集。

---

## 字体栈

**现状**：`src/client/styles/fonts.css` 自托管 6 个 woff2——`newsreader-*` ×4（含 italic）、`plus-jakarta-sans-*` ×2——**子集只有 `latin` 和 `latin-ext`**。

全站 grep `noto` / `cjk` / `pingfang` / `思源` / `microsoft yahei`：**零命中**。

问题的准确位置在字体栈：

```css
--font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Newsreader', 'Georgia', serif;
```

两条都没有声明中文，中文落到通用族。`sans-serif` 在 Windows 上是雅黑、macOS 上是苹方，尚可；**`serif` 在 Windows 上是宋体**——现在所有用 `--font-display` 的中文标题都是宋体。聊天正文改用衬线之前必须先修这里。

**规范：**

| 用途 | 令牌 | 西文 | 中文（按顺序回落） |
|---|---|---|---|
| 叙事正文（聊天气泡） | `--font-reading` | Newsreader | `'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC'`，再回落到无衬线中文 |
| 界面文字（按钮、表单、导航） | `--font-body` | Plus Jakarta Sans | `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC'` |
| 标题 | `--font-display` | Newsreader | 同叙事正文 |

**规则：衬线栈在通用族 `serif` 之前必须插入无衬线中文。** 系统没有像样的衬线中文时，宁可显示雅黑也不要显示宋体。

**中文 webfont 是可选的第二步，不是默认方案。** 系统字体栈零下载成本，能拿走大部分收益。只有在它的效果仍不够时才考虑自托管衬线中文，届时的约束：

- 单字重全量 10MB 以上，必须按 `unicode-range` 分片 + `font-display: swap`
- 长对话用字覆盖面广，分片后一次会话加载 1–2MB 是常态（估计值，需实测）。只给聊天正文用一个字重
- fallback 字体的 metrics 用 `size-adjust` / `ascent-override` 对齐，避免换字时布局跳动（CLS）

---

## 聊天排版

**现状**：`src/client/components/chat/MessageBubble.vue` 正文 `font-size: 14px` / `line-height: 1.6`，与全局 `--font-size-body: 14px` 一致。

14px/1.6 是**管理后台的密度**。聊天气泡里是叙事文本，用户一次读几百字、连读几十分钟——这是本产品唯一真正被长时间注视的界面，它现在的排版和 admin 表格一样。

而项目早已自托管了 Newsreader 含斜体，衬线字体买了却没用在该用的地方。

**规范：**

| 项 | 值 | 理由 |
|---|---|---|
| 字号 | 17px（至少两档可调，偏好持久化） | 阅读密度而非后台密度 |
| 行高 | 1.75 | 长段落需要更松的行距 |
| 字体 | `--font-reading`（Newsreader + 衬线中文栈） | 叙事文本用衬线 |
| 行宽上限 | 中文约 35–40 字，西文约 60–75 字符 | 不随窗口拉宽无限延伸，否则回行时找不到下一行 |
| `*动作描述*` | `font-synthesis: none` + 次要文字色 | 见下 |

**动作描述不能只靠斜体。** `*动作*` 经 `MarkdownRenderer.vue` 渲染为 `<em>`。中文字体没有斜体字形，浏览器会把字形硬掰歪来伪造倾斜——当前线上的中文动作描述就是这样。规则：

- `em` 设 `font-synthesis: none`：西文部分仍用 Newsreader 的真斜体，中文保持直立，不再伪造
- 动作与对话的区分交给次要文字色。这个颜色要在浅色与暗色两套主题的气泡底色上都实测 ≥ 4.5:1
- 这不违反「颜色不作为唯一信息载体」：动作与对话的区分本身有上下文与标点承载，颜色只是辅助

**聊天排版必须走独立令牌，不要改全局 `--font-size-body`** —— 后者会波及全站 44 个页面的表单与表格。

---

## 断点

**现状**：`variables.css` 声明了 `--breakpoint-mobile: 640px` / `--breakpoint-tablet: 1024px`，但全站媒体查询实测出现 10 种取值：767/768（共 45 处）、480/479（12 处）、1023/1024（9 处）、640（3 处）、1279/1280 与 560（各 1 处）。

根因是 CSS 变量在媒体查询里不生效——`@media (max-width: var(--breakpoint-mobile))` 是无效语法。令牌声明了却没人能用，于是每个人各写一个数。结果令牌声明的 640 反而是用得最少的。

**规范：收敛到事实标准，不要逆着现状改。**

| 名称 | 值 | 适用 |
|---|---|---|
| phone | < 480px | 窄屏手机，单列 + 紧凑间距 |
| mobile | < 768px | 单列，侧栏为抽屉 |
| tablet | < 1024px | 侧栏可折叠 |
| desktop | ≥ 1024px | 完整布局 |

**边界写法全站只用一种。** 现在 767 与 768、1023 与 1024 成对并存：一部分规则写 `max-width: 767px`，另一部分写 `max-width: 768px`，恰好 768px 宽时两组规则一组生效一组不生效。选定一种写法（推荐移动优先的 `min-width: 768px`），全站统一。

**单一来源**：用 Sass 变量（项目已有 `sass-embedded`）或 PostCSS 自定义媒体查询，让媒体查询和 CSS 令牌指向同一组数值。`--breakpoint-*` 这组 CSS 变量可保留给 JS 读取（`getComputedStyle`），但不要指望它能用在 `@media` 里。

`ChatWindow.vue` 1985 行**只有 1 条 `@media`**。聊天产品的移动端占比大概率过半，而这是核心页面——详见 `backlog.md` 的 P1-3。

---

## Element Plus 的边界

`immersive.css` 242 行里约 80 行在和 Element Plus 搏斗：teleport popper 的作用域失效、子组件在自己的 scoped 样式里读全局令牌（需要在作用域内重定向令牌名让它们靠级联变深）、侧栏自带令牌集够不到桥接。

**既有做法是对的，确立为规则：**

- **只改 `--el-*` 变量，不用 `:deep()` 重写组件内部 DOM。** 前者是 Element Plus 的公开契约，升级不会崩；后者依赖内部类名，升级必崩。
- 需要大幅偏离 Element Plus 外观的地方，**写自有组件，不要把它改造成别的样子。** 改造成本会超过重写，且每次升级都要重付一遍。

**按界面分区的清单：**

| 分区 | 策略 | 理由 |
|---|---|---|
| 聊天区（气泡、输入、流式状态） | 自有组件 | 产品身份所在，且交互独特（流式、重roll、编辑） |
| 角色卡区（卡片、立绘、市场网格） | 自有组件 | 同上；`immersive.css` 的遮罩推导已经是定制工作 |
| 表单（登录、注册、设置） | Element Plus | 无差异化价值，表单可访问性自己写容易写错 |
| 管理区（简化后的 1 页后台） | Element Plus | 同上，且使用者是运营者本人 |
| 下拉 / 弹层 / 分页 | Element Plus + 令牌映射 | 自己写弹层定位与焦点管理不划算 |

`ChatWindow.vue` 当前用了 20 种 `el-` 组件（15 个 `el-dropdown-item`、9 个 `el-button`、4 个 `el-dialog`、2 个 `el-drawer`）。按上表它属于"自有组件"区，但**不要为此单独开一轮重写**——在 P1-3 加响应式和 P4-3 拆分文件时顺带收敛。

---

## 待清理的遗留令牌

`variables.css` 399 行里约 260 行是遗留层。188–250 行集中了大部分：

| 令牌 | 问题 |
|---|---|
| `--accent-purple: var(--accent)` | 紫色令牌指向琥珀。名字与值不符的令牌比没有令牌更糟——下一个人会以为存在紫色体系 |
| `--accent-cyan`、`--accent-pink` | 同上，无实际配色体系支撑 |
| "Iteration 13 aliases" 整段 | 某轮迭代的过渡层，迭代已结束 |
| `--glass-bg`、`--backdrop-blur` | 玻璃拟态，与当前沉浸叙事方向不一致 |

**清理规则：**

1. 每个保留的令牌，名字与实际值语义一致
2. 删除前确认全站零引用，**包含 `.vue` 文件的 scoped 样式**（这是最容易漏的地方）
3. **保留推导过程注释** —— 对比度实测值、"为什么取这个数"、"原值 X 只有 N:1 不达标"这类记录是资产。删令牌不要删理由

时机：等 `backlog.md` 的 P2-1（功能下线，大量引用随页面消失）和 P2-2（主题合并）之后做，见 P4-1。

---

## 可访问性底线

项目已有的标准不要降：

- 正文文字对比度 ≥ 4.5:1（AA），在它实际出现的**最差表面**上测量，不是在理想底色上
- 焦点必须可见。`variables.css` 的注释记着：129 个文件只有 12 个定义了焦点样式，有几个还写了 `outline: none`。新增可交互元素一律用 `--focus-ring`
- 尊重 `prefers-reduced-motion`（`immersive.css` 末尾已有实现，新增动效沿用）
- 颜色不作为唯一的信息载体（错误、警告、选中态等状态必须另有图标、文字或形状提示）

---

## 修订方式

本文是规范，不是任务清单。任务见 [`../product/backlog.md`](../product/backlog.md)。

改变主题默认值、字体栈、断点或 Element Plus 边界时修改本文，并注明改动日期与理由。
新增颜色时在相应段落补上实测对比度。




