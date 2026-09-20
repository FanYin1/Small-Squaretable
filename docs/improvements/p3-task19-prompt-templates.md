# Task #19: Prompt Templates 实施总结

**实施日期**: 2026-03-02
**状态**: ✅ 完成

---

## 已完成内容

### 1. 创建 Prompt Templates 配置文件

**文件**: `src/server/config/prompt-templates.ts`

**功能特性:**
- ✅ 定义 PromptTemplate 接口
- ✅ 实现 5 种预设模板：
  - `default`: 标准 OpenAI 聊天格式
  - `alpaca`: Alpaca 指令格式 (### Instruction / ### Response)
  - `chatml`: ChatML 格式 (<|im_start|>role / <|im_end|>)
  - `vicuna`: Vicuna 对话格式 (SYSTEM: / USER: / ASSISTANT:)
  - `llama2`: Llama 2 Chat 格式 ([INST] <<SYS>> / [/INST])
- ✅ 提供 `getPromptTemplate()` 获取模板
- ✅ 提供 `formatMessagesWithTemplate()` 格式化消息

### 2. 数据库 Schema 更新

**文件**: `src/db/schema/characters.ts`

**修改内容:**
- ✅ 添加 `promptTemplate` 字段 (varchar(50), default: 'default')

**迁移文件**: `src/db/migrations/0031_character_prompt_template.sql`
- ✅ ALTER TABLE 添加 prompt_template 列

### 3. 前端 UI 集成

**文件**: `src/client/components/character/CharacterCardEditor.vue`

**修改内容:**
- ✅ 在 Advanced 标签页添加 Prompt Template 选择器
- ✅ 5 个选项：Default, Alpaca, ChatML, Vicuna, Llama 2 Chat
- ✅ 添加说明文本：用于不支持聊天补全 API 的模型
- ✅ 数据持久化到 `cardData.extensions.promptTemplate`
- ✅ 添加 `promptTemplate` ref 和初始化逻辑
- ✅ 添加 `updatePromptTemplate()` 方法
- ✅ 在 watch 中同步外部更新

### 4. 国际化支持

**文件**: `src/client/i18n/locales/zh-CN.json` 和 `en-US.json`

**添加内容:**
- ✅ `promptTemplates.title`: "提示词模板" / "Prompt Template"
- ✅ `promptTemplates.description`: 说明文本
- ✅ 各模板名称的翻译

### 5. 后端集成

**文件**: `src/server/routes/websocket.ts`

**修改内容:**
- ✅ 导入 `formatMessagesWithTemplate` 函数
- ✅ 在 `handleSingleCharacterResponse` 中检查角色的 promptTemplate
- ✅ 如果使用非 default 模板：
  - 使用 `formatMessagesWithTemplate()` 格式化消息
  - 调用新增的 `streamTextCompletion()` 方法
  - 使用 `llmService.completion()` 进行 text completion
- ✅ 如果使用 default 模板：
  - 保持现有逻辑，使用 `streamLlmResponse()`
- ✅ 实现 `streamTextCompletion()` 方法处理文本补全

---

## 技术说明

### Prompt Template 的作用

不同的 LLM 模型在训练时使用了不同的对话格式：

1. **OpenAI 模型**: 原生支持 chat completion API，直接传递 messages 数组
2. **Alpaca 模型**: 需要 `### Instruction:\n{text}\n\n### Response:\n` 格式
3. **ChatML 模型**: 需要 `<|im_start|>role\n{text}<|im_end|>\n` 格式
4. **Vicuna 模型**: 需要 `SYSTEM: {text}\nUSER: {text}\nASSISTANT:` 格式
5. **Llama 2 模型**: 需要 `[INST] <<SYS>>\n{system}\n<</SYS>>\n\n{user} [/INST]` 格式

使用正确的格式可以显著提升模型的响应质量。

### 数据存储位置

Prompt template 存储在两个位置：
1. **数据库**: `characters.prompt_template` 列（用于查询和过滤）
2. **角色卡**: `cardData.extensions.promptTemplate`（用于导入/导出兼容性）

### 实现逻辑

```typescript
// 检查角色的 prompt template 设置
const promptTemplate = character?.cardData?.extensions?.promptTemplate || 'default';

if (promptTemplate !== 'default') {
  // 构建完整消息数组（包含 system prompt）
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...contextResult.messages
  ];

  // 使用模板格式化
  const formattedPrompt = formatMessagesWithTemplate(allMessages, promptTemplate);

  // 调用 text completion API
  const response = await llmService.completion({
    prompt: formattedPrompt,
    model,
    temperature: 0.7,
    max_tokens: 2048,
  });
} else {
  // 使用标准 chat completion
  await streamLlmResponse(...);
}
```

---

## 测试验证

### 前端测试
- ✅ UI 显示正常，选择器工作正常
- ✅ 数据保存到 extensions.promptTemplate
- ✅ 导入/导出角色卡时保留 promptTemplate
- ✅ 中英文翻译正确显示

### 后端测试
- ✅ 代码逻辑实现完成
- ✅ 检测 promptTemplate 设置
- ✅ 根据模板选择不同的 API 调用路径
- ⏳ 实际模型测试（需要配置支持 text completion 的模型）

---

## 文件修改清单

**新建文件:**
- `src/server/config/prompt-templates.ts` (150 行)
- `src/db/migrations/0031_character_prompt_template.sql` (8 行)
- `docs/improvements/p3-task19-prompt-templates.md` (本文档)

**修改文件:**
- `src/db/schema/characters.ts` (+3 行)
- `src/client/components/character/CharacterCardEditor.vue` (+55 行)
- `src/client/i18n/locales/zh-CN.json` (+9 行)
- `src/client/i18n/locales/en-US.json` (+9 行)
- `src/server/routes/websocket.ts` (+60 行)
- `docs/improvements/p3-progress-summary.md` (更新进度)

**总代码量**: 约 300 行

---

## 使用示例

### 1. 在角色卡编辑器中选择模板

1. 打开角色卡编辑器
2. 切换到 "Advanced" 标签页
3. 找到 "Prompt Template" 选择器
4. 选择适合模型的模板（如 Alpaca、Vicuna 等）
5. 保存角色卡

### 2. 模板格式示例

**Alpaca 格式:**
```
### Instruction:
You are a helpful assistant.

### Instruction:
Hello, how are you?

### Response:
I'm doing well, thank you!
```

**ChatML 格式:**
```
<|im_start|>system
You are a helpful assistant.<|im_end|>
<|im_start|>user
Hello, how are you?<|im_end|>
<|im_start|>assistant
I'm doing well, thank you!<|im_end|>
```

---

**最后更新**: 2026-03-02
**状态**: ✅ 完全实施完成（前端 + 后端）
