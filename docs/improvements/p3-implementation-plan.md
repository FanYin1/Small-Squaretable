# P3 功能实施计划

**优先级**: P3 (高级用户功能)
**实施日期**: 2026-03-01

---

## 功能列表

### 1. Prompt Templates (提示词模板)

**功能描述:**
支持不同模型的 prompt 格式模板（Alpaca, ChatML, Vicuna 等），允许用户为不同的 LLM 模型选择合适的格式。

**实施内容:**
- 创建 prompt-templates.ts 配置文件
- 支持预设模板：default, alpaca, chatml, vicuna
- 允许全局和角色级别的模板选择
- 在 LLM 服务中应用模板格式化

**优先级**: 中

---

### 2. Regex Scripts UI 集成

**功能描述:**
在前端 UI 中集成 Regex Scripts 编辑器，允许用户创建和管理正则表达式脚本来后处理 AI 输出。

**当前状态:**
- ✅ 后端已有 regex-scripts.service.ts
- ✅ 支持基本的 find/replace
- ❌ 未集成到前端 UI
- ❌ 未支持 SillyTavern 的完整格式

**实施内容:**
- 在 Character Card Editor 中添加 Regex Scripts 标签页
- 支持 `markdownOnly` 标志（仅在显示时应用）
- 支持 `trimStrings` 正则（去除空白）
- 支持脚本的启用/禁用、排序

**优先级**: 高

---

### 3. Quick Replies (快速回复)

**功能描述:**
预设的快速回复按钮，支持宏和变量替换，方便用户快速发送常用消息。

**实施内容:**
- 创建 quick_replies 数据库表
- 创建 Quick Reply 管理 UI
- 在 MessageInput 下方显示快速回复按钮
- 支持 {{char}}, {{user}} 等宏替换
- 支持排序和分组

**优先级**: 低

---

## 实施顺序

1. **Regex Scripts UI 集成** (优先级最高)
   - 用户需求强烈
   - 后端已实现，只需前端集成
   - 预计工作量：2-3 小时

2. **Prompt Templates** (优先级中等)
   - 对高级用户有用
   - 实现相对简单
   - 预计工作量：1-2 小时

3. **Quick Replies** (优先级最低)
   - 便利功能，非必需
   - 需要数据库迁移和完整的 CRUD
   - 预计工作量：3-4 小时

---

## 详细实施计划

### Task #18: Regex Scripts UI 集成

**步骤:**
1. 在 Character Card Editor 中添加 "Regex Scripts" 标签页
2. 创建 RegexScriptEditor 组件
3. 支持添加/编辑/删除脚本
4. 支持 markdownOnly, trimStrings 选项
5. 集成到角色卡保存/加载流程
6. 更新 i18n 翻译

**文件修改:**
- `src/client/components/character/CharacterCardEditor.vue`
- `src/client/i18n/locales/zh-CN.json`
- `src/client/i18n/locales/en-US.json`
- `src/types/character.ts`

---

### Task #19: Prompt Templates

**步骤:**
1. 创建 `src/server/config/prompt-templates.ts`
2. 定义预设模板（default, alpaca, chatml, vicuna）
3. 在 LLM 服务中应用模板
4. 在角色设置中添加模板选择器
5. 支持全局默认模板设置

**文件创建:**
- `src/server/config/prompt-templates.ts`

**文件修改:**
- `src/server/services/llm.service.ts`
- `src/client/components/character/CharacterCardEditor.vue`
- `src/db/schema/characters.ts` (添加 promptTemplate 字段)

---

### Task #20: Quick Replies

**步骤:**
1. 创建数据库迁移
2. 创建 quick-replies schema
3. 创建 quick-replies repository
4. 创建 quick-replies API 路由
5. 创建 Quick Reply 管理 UI
6. 在 MessageInput 中集成快速回复按钮
7. 支持宏替换

**文件创建:**
- `src/db/migrations/0031_quick_replies.sql`
- `src/db/schema/quick-replies.ts`
- `src/db/repositories/quick-reply.repository.ts`
- `src/server/routes/quick-replies.ts`
- `src/client/components/chat/QuickReplyManager.vue`
- `src/client/services/quick-reply.api.ts`

**文件修改:**
- `src/client/components/chat/MessageInput.vue`

---

## 成功标准

### Regex Scripts UI
- ✅ 用户可以在角色卡编辑器中添加/编辑 regex scripts
- ✅ 支持 markdownOnly 和 trimStrings 选项
- ✅ 脚本正确应用到 AI 输出
- ✅ 导入/导出角色卡时保留 regex scripts

### Prompt Templates
- ✅ 用户可以选择不同的 prompt 模板
- ✅ 模板正确格式化 system/user/assistant 消息
- ✅ 支持角色级别和全局级别的模板设置

### Quick Replies
- ✅ 用户可以创建和管理快速回复
- ✅ 快速回复按钮显示在消息输入框下方
- ✅ 点击按钮自动填充消息
- ✅ 支持 {{char}}, {{user}} 宏替换

---

**最后更新**: 2026-03-01
**状态**: 计划中
