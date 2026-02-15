# i18n Full Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all ~304 hardcoded strings across 27 Vue files with `$t()` calls, add missing locale keys for analytics/admin sections, achieving 100% i18n coverage.

**Architecture:** Scan each Vue file for hardcoded Chinese/English text in `<template>` sections, replace with `$t('section.key')` calls using existing locale keys where possible, add new keys to both `en-US.json` and `zh-CN.json` where needed. No structural changes — purely string replacement.

**Tech Stack:** Vue 3, vue-i18n v10, TypeScript

---

## Context

- Locale files: `src/client/i18n/locales/en-US.json` and `zh-CN.json` (~460 keys each, 1:1 parity)
- i18n is already installed and registered in `src/client/main.ts`
- 49 of 86 Vue files already use `$t()` — follow their patterns
- In `<script setup>` files, use `const { t } = useI18n()` then `t('key')` in script, `$t('key')` in template
- In Options API files, use `this.$t('key')` in script, `$t('key')` in template

## How to identify hardcoded strings

In `<template>` sections, look for:
- Chinese characters not inside `$t()` calls (e.g., `>删除<` should be `>{{ $t('common.delete') }}<`)
- English labels/titles not inside `$t()` calls (e.g., `>Rank<` should be `>{{ $t('analytics.rank') }}<`)
- `:placeholder="'搜索...'"` should be `:placeholder="$t('market.search')"`
- String literals in `ElMessage`, `ElMessageBox`, `useToast` calls in `<script>` sections

## IMPORTANT: Do NOT touch

- Strings already wrapped in `$t()` or `t()`
- CSS class names, HTML attributes, component names
- Console.log messages, error codes
- Comments

---

### Task 1: MyCharacters.vue (~31 hardcoded strings)

**Files:**
- Modify: `src/client/pages/MyCharacters.vue`
- Reference: `src/client/i18n/locales/en-US.json` (keys under `myCharacters.*`, `common.*`, `characterPublish.*`)

**Step 1: Read the file and identify all hardcoded strings**

Read `src/client/pages/MyCharacters.vue` and list every hardcoded Chinese/English string in both `<template>` and `<script>` sections.

**Step 2: Replace hardcoded strings with $t() calls**

For each hardcoded string, find the matching locale key and replace. Examples of expected replacements:
- `我的角色` → `{{ $t('myCharacters.title') }}`
- `创建角色` → `{{ $t('myCharacters.createCharacter') }}`
- `导入角色` → `{{ $t('myCharacters.importCharacter') }}`
- `搜索角色名称、描述或标签...` → `$t('myCharacters.searchPlaceholder')`
- `私有角色` → `{{ $t('myCharacters.private') }}`
- `已发布` → `{{ $t('myCharacters.published') }}`
- `确认删除` → `$t('myCharacters.deleteTitle')`
- `删除成功` / `删除失败` → `$t('myCharacters.deleted')` / `$t('myCharacters.deleteFailed')`
- Common strings: `删除` → `$t('common.delete')`, `编辑` → `$t('common.edit')`, `导出` → `$t('common.export')`

If `useI18n` is not already imported in `<script setup>`, add: `const { t } = useI18n()`

**Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests still pass

**Step 4: Commit**

```bash
git add src/client/pages/MyCharacters.vue
git commit -m "feat(i18n): wire $t() calls in MyCharacters.vue"
```

---

### Task 2: Chat.vue (~29 hardcoded strings)

**Files:**
- Modify: `src/client/pages/Chat.vue`
- Reference: locale keys under `chat.*`, `common.*`

**Step 1: Read and identify hardcoded strings**

Read `src/client/pages/Chat.vue`. Look for hardcoded Chinese in template and script sections.

**Step 2: Replace with $t() calls**

Expected key mappings:
- `会话` → `chat.title`
- `新建会话` → `chat.newChat`
- `搜索会话...` → `chat.searchChats`
- `输入消息...` → `chat.inputPlaceholder`
- `开始新的对话` → `chat.startNewConversation`
- `选择角色` → `chat.selectCharacter`
- `创建聊天` → `chat.createChat`
- `删除成功` → `chat.deleteSuccess`
- `加载失败` → `chat.loadFailed`
- Toast/message strings in script section

**Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/client/pages/Chat.vue
git commit -m "feat(i18n): wire $t() calls in Chat.vue"
```

---

### Task 3: UpgradePrompt.vue (~26 hardcoded strings)

**Files:**
- Modify: `src/client/components/subscription/UpgradePrompt.vue`
- Reference: locale keys under `subscription.*`, `common.*`

**Step 1-4:** Same pattern — read, replace hardcoded strings with `$t()`, test, commit.

Expected key mappings:
- Subscription plan names: `subscription.free`, `subscription.pro`, `subscription.team`
- Feature descriptions: `subscription.freeMessages`, `subscription.proMessages`, etc.
- `立即升级` → `common.upgradeNow`
- `升级方案` → `subscription.upgradePlan`
- Quota-related: `subscription.quotaExhausted`, `subscription.quotaReached`, `subscription.upgradeToUnlock`

```bash
git commit -m "feat(i18n): wire $t() calls in UpgradePrompt.vue"
```

---

### Task 4: MemoryPanel.vue (~22 hardcoded strings)

**Files:**
- Modify: `src/client/components/MemoryPanel.vue`
- Reference: locale keys under `memory.*`, `common.*`

Expected key mappings:
- `角色记忆` → `memory.title`
- `全部` → `memory.filterAll`
- `事实` / `偏好` / `关系` / `事件` → `memory.typeFact` / `typePreference` / `typeRelationship` / `typeEvent`
- `暂无记忆` → `memory.empty`
- `重要度:` → `memory.importance`
- `清除全部` → `memory.clearAll`
- `确定要清除所有记忆吗？` → `memory.clearConfirm`

```bash
git commit -m "feat(i18n): wire $t() calls in MemoryPanel.vue"
```

---

### Task 5: CharacterPublishForm.vue (~19 hardcoded strings)

**Files:**
- Modify: `src/client/components/character/CharacterPublishForm.vue`
- Reference: locale keys under `characterPublish.*`, `market.filters.*`

Expected key mappings:
- `发布角色到市场` → `characterPublish.dialogTitle`
- `角色名称` → `characterPublish.nameLabel`
- `输入角色名称` → `characterPublish.namePlaceholder`
- `分类` → `characterPublish.categoryLabel`
- `标签` → `characterPublish.tagsLabel`
- `发布` → `characterPublish.submit`
- Category options: `market.filters.assistant`, `market.filters.entertainment`, etc.

```bash
git commit -m "feat(i18n): wire $t() calls in CharacterPublishForm.vue"
```

---

### Task 6: Debug panels (3 files, ~43 hardcoded strings)

**Files:**
- Modify: `src/client/components/debug/PerformanceMetrics.vue` (~18 strings)
- Modify: `src/client/components/debug/SystemPromptViewer.vue` (~14 strings)
- Modify: `src/client/components/debug/IntelligenceDebugPanel.vue` (~11 strings)
- Reference: locale keys under `debug.*`, `debug.performance.*`, `debug.prompt.*`, `debug.tab.*`

**Step 1: Read all 3 files and identify hardcoded strings**

**Step 2: Replace with $t() calls**

PerformanceMetrics.vue key mappings:
- `性能指标` → `debug.performance.title`
- `延迟指标 (ms)` → `debug.performance.latencyMetrics`
- `嵌入生成` → `debug.performance.embedding`
- `向量检索` → `debug.performance.vectorSearch`
- `情感分析` → `debug.performance.sentiment`
- `提示构建` → `debug.performance.promptBuild`
- `Token 统计` → `debug.performance.tokenStats`
- `模型状态` → `debug.performance.modelStatus`
- `已加载` / `未加载` → `debug.performance.loaded` / `debug.performance.notLoaded`
- `良好` / `一般` / `较慢` → `debug.performance.good` / `average` / `slow`

SystemPromptViewer.vue key mappings:
- `系统提示预览` → `debug.prompt.title`
- `总计:` → `debug.prompt.total`
- `角色基础` → `debug.prompt.character`
- `记忆` → `debug.prompt.memories`
- `情感状态` → `debug.prompt.emotionState`
- `行为指引` → `debug.prompt.guidelines`
- `完整提示` → `debug.prompt.fullPrompt`

IntelligenceDebugPanel.vue key mappings:
- `智能系统调试` → `debug.title`
- Tab labels: `debug.tab.systemPrompt`, `debug.tab.memoryRetrieval`, etc.
- `请先选择聊天` → `debug.selectChatFirst`

**Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/client/components/debug/PerformanceMetrics.vue src/client/components/debug/SystemPromptViewer.vue src/client/components/debug/IntelligenceDebugPanel.vue
git commit -m "feat(i18n): wire $t() calls in debug panel components"
```

---

### Task 7: Layout components (5 files, ~29 hardcoded strings)

**Files:**
- Modify: `src/client/components/layout/AppHeader.vue` (~16 strings)
- Modify: `src/client/components/layout/UserMenu.vue` (~7 strings)
- Modify: `src/client/components/layout/AppSidebar.vue` (~3 strings)
- Modify: `src/client/components/layout/LeftSidebar.vue` (~2 strings)
- Modify: `src/client/components/layout/DashboardLayout.vue` (~1 string)
- Reference: locale keys under `nav.*`, `settings.*`, `theme.*`, `common.*`

**Step 1: Read all 5 files**

**Step 2: Replace with $t() calls**

AppHeader.vue key mappings:
- Navigation items: `nav.home`, `nav.chat`, `nav.market`, `nav.myCharacters`, etc.
- Theme toggle: `theme.light`, `theme.dark`
- Language: `settings.language`, `settings.languageEn`, `settings.languageZh`

UserMenu.vue key mappings:
- `个人中心` → `nav.profile`
- `设置` → `nav.settings`
- `退出登录` → `nav.logout`
- `开发者` → `nav.developer`

AppSidebar/LeftSidebar/DashboardLayout: nav labels

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/client/components/layout/AppHeader.vue src/client/components/layout/UserMenu.vue src/client/components/layout/AppSidebar.vue src/client/components/layout/LeftSidebar.vue src/client/components/layout/DashboardLayout.vue
git commit -m "feat(i18n): wire $t() calls in layout components"
```

---

### Task 8: Market components (4 files, ~22 hardcoded strings)

**Files:**
- Modify: `src/client/components/market/FilterToolbar.vue` (~14 strings)
- Modify: `src/client/components/market/SearchCombo.vue` (~4 strings)
- Modify: `src/client/pages/Market.vue` (~3 strings)
- Modify: `src/client/components/market/EmptyState.vue` (~1 string)
- Reference: locale keys under `market.*`, `market.filters.*`, `market.empty.*`

**Step 1: Read all 4 files**

**Step 2: Replace with $t() calls**

FilterToolbar.vue key mappings:
- `分类` → `market.filters.category`
- `排序` → `market.filters.sort`
- `热门` → `market.filters.hot`
- `最新` → `market.filters.latest`
- `最高评分` → `market.filters.topRated`
- Category names: `market.filters.all`, `market.filters.assistant`, `market.filters.entertainment`, etc.

SearchCombo.vue:
- `搜索角色名称或描述...` → `market.searchPlaceholder`
- `搜索` → `market.searchBtn`

Market.vue:
- `角色市场` → `market.title`

EmptyState.vue:
- Uses `market.empty.*` keys

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/client/components/market/FilterToolbar.vue src/client/components/market/SearchCombo.vue src/client/pages/Market.vue src/client/components/market/EmptyState.vue
git commit -m "feat(i18n): wire $t() calls in market components"
```

---

### Task 9: Add analytics locale keys

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

The analytics dashboard components have ~35 hardcoded English strings with NO existing locale keys. Add a new `analytics` section to both locale files.

**Step 1: Add `analytics` section to en-US.json**

Add after the `recommendations` section:

```json
"analytics": {
  "title": "Analytics Dashboard",
  "executiveOverview": "Executive Overview",
  "productMetrics": "Product Metrics",
  "weeklyActiveUsers": "Weekly Active Users",
  "weeklyMessages": "Weekly Messages",
  "activeUsersRealtime": "Active Users (Realtime)",
  "eventsPerMin": "Events / Min",
  "messagesPerMin": "Messages / Min",
  "userSegments": "User Segments",
  "noSegmentData": "No segment data",
  "conversionFunnel": "Conversion Funnel",
  "noFunnelData": "No funnel data",
  "cohortRetention": "Cohort Retention",
  "noRetentionData": "No retention data",
  "trendOverview": "Trend Overview",
  "noTrendData": "No trend data",
  "rank": "Rank",
  "characterId": "Character ID",
  "messages": "Messages",
  "chatStarts": "Chat Starts",
  "avgRating": "Avg Rating",
  "impressions": "Impressions",
  "clicks": "Clicks",
  "variant": "Variant"
}
```

**Step 2: Add corresponding `analytics` section to zh-CN.json**

```json
"analytics": {
  "title": "数据分析仪表盘",
  "executiveOverview": "管理概览",
  "productMetrics": "产品指标",
  "weeklyActiveUsers": "周活跃用户",
  "weeklyMessages": "周消息数",
  "activeUsersRealtime": "实时活跃用户",
  "eventsPerMin": "事件/分钟",
  "messagesPerMin": "消息/分钟",
  "userSegments": "用户分群",
  "noSegmentData": "暂无分群数据",
  "conversionFunnel": "转化漏斗",
  "noFunnelData": "暂无漏斗数据",
  "cohortRetention": "群组留存",
  "noRetentionData": "暂无留存数据",
  "trendOverview": "趋势概览",
  "noTrendData": "暂无趋势数据",
  "rank": "排名",
  "characterId": "角色 ID",
  "messages": "消息数",
  "chatStarts": "聊天次数",
  "avgRating": "平均评分",
  "impressions": "展示次数",
  "clicks": "点击次数",
  "variant": "变体"
}
```

**Step 3: Commit**

```bash
git add src/client/i18n/locales/en-US.json src/client/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add analytics locale keys to en-US and zh-CN"
```

---

### Task 10: Analytics components (7 files, ~35 hardcoded English strings)

**Files:**
- Modify: `src/client/pages/analytics/AnalyticsDashboard.vue` (~2 strings)
- Modify: `src/client/pages/analytics/ExecutiveOverview.vue` (~2 strings)
- Modify: `src/client/pages/analytics/ProductMetrics.vue` (~4 strings)
- Modify: `src/client/components/analytics/RankingTable.vue` (~5 strings)
- Modify: `src/client/components/analytics/FunnelChart.vue` (~2 strings)
- Modify: `src/client/components/analytics/RetentionHeatmap.vue` (~2 strings)
- Modify: `src/client/components/analytics/TrendChart.vue` (~2 strings)
- Reference: new `analytics.*` locale keys from Task 9

**Step 1: Read all 7 files**

**Step 2: Replace hardcoded English with $t() calls**

AnalyticsDashboard.vue:
- `"Executive Overview"` → `$t('analytics.executiveOverview')`
- `"Product Metrics"` → `$t('analytics.productMetrics')`

ExecutiveOverview.vue:
- `"Weekly Active Users"` → `$t('analytics.weeklyActiveUsers')`
- `"Weekly Messages"` → `$t('analytics.weeklyMessages')`

ProductMetrics.vue:
- `"Active Users (Realtime)"` → `$t('analytics.activeUsersRealtime')`
- `"Events / Min"` → `$t('analytics.eventsPerMin')`
- `"Messages / Min"` → `$t('analytics.messagesPerMin')`
- `"User Segments"` / `"No segment data"` → `$t('analytics.userSegments')` / `$t('analytics.noSegmentData')`

RankingTable.vue:
- `"Rank"` → `$t('analytics.rank')`
- `"Character ID"` → `$t('analytics.characterId')`
- `"Messages"` → `$t('analytics.messages')`
- `"Chat Starts"` → `$t('analytics.chatStarts')`
- `"Avg Rating"` → `$t('analytics.avgRating')`

FunnelChart/RetentionHeatmap/TrendChart: title + empty state strings

**Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/client/pages/analytics/ src/client/components/analytics/
git commit -m "feat(i18n): wire $t() calls in analytics components"
```

---

### Task 11: Admin + Subscription pages (3 files, ~10 hardcoded strings)

**Files:**
- Modify: `src/client/pages/admin/Experiments.vue` (~6 strings: "Variant", "Impressions", "Clicks", "Chat Starts", "Variant name" placeholder)
- Modify: `src/client/pages/admin/SystemDashboard.vue` (~3 strings: "Free", "Pro", "Team")
- Modify: `src/client/pages/admin/UserManagement.vue` (~3 strings: "User", "Moderator", "Admin")
- Modify: `src/client/pages/Subscription.vue` (~16 strings)
- Reference: locale keys under `admin.experiments.*`, `admin.system.*`, `admin.users.*`, `subscription.*`

**Step 1: Read all files**

**Step 2: Replace with $t() calls**

Experiments.vue:
- `"Variant"` → `$t('admin.experiments.variants')` or `$t('analytics.variant')`
- `"Impressions"` → `$t('analytics.impressions')`
- `"Clicks"` → `$t('analytics.clicks')`
- `"Variant name"` placeholder → `$t('admin.experiments.variantName')`

SystemDashboard.vue:
- `"Free"` → `$t('subscription.free')`
- `"Pro"` → `$t('subscription.pro')`
- `"Team"` → `$t('subscription.team')`

UserManagement.vue:
- `"User"` / `"Moderator"` / `"Admin"` — add new keys if not present, or use existing role keys

Subscription.vue:
- All subscription-related strings should map to `subscription.*` keys

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/client/pages/admin/ src/client/pages/Subscription.vue
git commit -m "feat(i18n): wire $t() calls in admin and subscription pages"
```

---

### Task 12: Profile components (3 files, ~17 hardcoded strings)

**Files:**
- Modify: `src/client/pages/Profile.vue` (~8 strings)
- Modify: `src/client/components/profile/ProfileForm.vue` (~8 strings)
- Modify: `src/client/components/profile/AvatarUpload.vue` (~1 string)
- Reference: locale keys under `profile.*`

**Step 1: Read all 3 files**

**Step 2: Replace with $t() calls**

Profile.vue:
- `个人中心` → `profile.title`
- `基本信息` → `profile.basicInfo`
- `安全设置` → `profile.security`
- `偏好设置` → `profile.preferences`
- `保存成功` / `保存失败` → `profile.saveSuccess` / `profile.saveFailed`

ProfileForm.vue:
- Form labels and placeholders using `profile.*` keys
- `请输入用户名` → `profile.nameRequired`
- `邮箱不可修改` → `profile.emailReadonly`

AvatarUpload.vue:
- Upload-related string

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/client/pages/Profile.vue src/client/components/profile/ProfileForm.vue src/client/components/profile/AvatarUpload.vue
git commit -m "feat(i18n): wire $t() calls in profile components"
```

---

### Task 13: UsageDashboard.vue (~15 hardcoded strings)

**Files:**
- Modify: `src/client/components/subscription/UsageDashboard.vue`
- Reference: locale keys under `subscription.*`

**Step 1: Read and identify hardcoded strings**

**Step 2: Replace with $t() calls**

Expected key mappings:
- `使用量统计` → `subscription.usageTitle`
- `消息数` → `subscription.messages`
- `图片生成` → `subscription.images`
- `LLM Tokens` → `subscription.tokens`
- `剩余:` → `subscription.remaining`
- `接近限制` → `subscription.nearLimit`
- `已超限` → `subscription.exceeded`
- `查看订阅方案` → `subscription.viewPlans`

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/client/components/subscription/UsageDashboard.vue
git commit -m "feat(i18n): wire $t() calls in UsageDashboard.vue"
```

---

### Task 14: Run full test suite and verify

**Step 1: Run full unit test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: 1337+ tests passing, 0 failures

**Step 2: If any tests fail, fix them**

Common issues:
- Component tests that assert on hardcoded text will need updating to match `$t()` output
- Tests using `wrapper.text()` or `wrapper.find()` with Chinese text selectors need updating
- Add i18n plugin to test mount options if not already present (pattern from Iter 7)

**Step 3: Commit fixes if any**

```bash
git commit -m "fix(i18n): update tests for i18n string changes"
```

---

### Task 15: Verify coverage and update docs

**Step 1: Verify no remaining hardcoded strings**

Search for remaining hardcoded Chinese in Vue templates:
```bash
grep -rn '[\u4e00-\u9fff]' src/client/ --include='*.vue' | grep -v 'node_modules' | grep -v '$t(' | grep -v '// ' | grep -v 'locale' | head -20
```

If any remain, fix them.

**Step 2: Update CLAUDE.md**

Add Iteration 8 section noting i18n full coverage completion.

**Step 3: Update ROADMAP.md**

Add 迭代 8 entry with progress bar.

**Step 4: Commit**

```bash
git add CLAUDE.md ROADMAP.md
git commit -m "docs: update CLAUDE.md and ROADMAP.md for Iteration 8"
```
