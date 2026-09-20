# ERA角色卡Greeting连续性问题 - 问题总结

## 问题描述

用户选择ERA角色卡的alternate greeting后，AI在回复时完全忽略开局场景，给出通用回复（如"欢迎来到蔚蓝星域..."），而不是继续场景。

---

## 根本原因

**GLM-4.5-air模型配置缺失**

系统在 `src/server/config/llm.config.ts` 的 `MODEL_REGISTRY` 中没有配置GLM-4.5-air，导致使用了默认配置：

```typescript
// 错误的默认配置
const DEFAULT_MODEL_META = {
  contextWindow: 4096,      // ❌ 太小
  maxOutputTokens: 2048,    // ❌ 太小
  defaultTemperature: 0.7,
};
```

### 影响链

1. **Token预算严重不足**
   - 可用预算：4096 - 2048 - 100(buffer) = **1948 tokens**
   - ERA角色卡greeting长度：6922字符 ≈ **1730 tokens**
   - 几乎没有空间留给system prompt和其他上下文

2. **Context Manager截断**
   - `contextManager.buildContext()` 从后往前选择消息
   - 由于预算不足，greeting被部分截断
   - System prompt和Author's Note没有足够空间

3. **AI看不到完整上下文**
   - 只能看到部分greeting
   - 无法理解要继续场景
   - 给出通用回复

---

## 解决方案

### 修复代码

**文件：** `src/server/config/llm.config.ts`

**位置：** 第123-136行

**修改：** 添加GLM模型配置

```typescript
const MODEL_REGISTRY: Record<string, Omit<ModelMeta, 'id' | 'provider'>> = {
  // ... 其他模型配置 ...

  // GLM (智谱AI) - 新增
  'glm-4': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-plus': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-air': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-airx': { contextWindow: 8192, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4-flash': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  'glm-4.5-air': { contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 },
};
```

### 效果

- ✅ Context window: 4096 → **128000 tokens**
- ✅ 足够的空间容纳长greeting + system prompt + 对话历史
- ✅ AI能看到完整的场景上下文
- ✅ 正确继续场景

---

## 验证方法

### 1. 检查模型配置

```bash
# 查看context manager日志
grep "Context built" /tmp/backend-server.log

# 应该看到：
# contextWindow: 128000 (而不是 4096)
# truncated: false (而不是 true)
```

### 2. 测试场景连续性

1. 创建新会话
2. 选择一个开局场景（右滑）
3. 发送消息（如"开始"）
4. 验证AI回复是否继续场景

**期望结果：**
- ✅ AI继续场景中的情节
- ✅ 使用场景中的角色和设定
- ✅ 不给出通用欢迎语

---

## 附加优化（可选）

虽然主要问题已解决，但也实施了Author's Note优化：

**文件：** `src/server/routes/websocket.ts`

**位置：** 第276-298行

```typescript
// 在第一次用户消息前插入Author's Note
if (chatMessages.length === 2 && chatMessages[0].role === 'assistant') {
  const scenePreview = chatMessages[0].content.substring(0, 400);

  const authorNote = {
    role: 'system',
    content: `[Author's Note: You are continuing the roleplay scene you established. Your previous message set this scene: "${scenePreview}..." - Continue naturally from where you left off. Do not restart or give a generic greeting.]`
  };

  chatMessages.splice(chatMessages.length - 1, 0, authorNote);
}
```

**作用：** 进一步提醒AI继续场景（基于SillyTavern最佳实践）

---

## 调试经验教训

### ❌ 错误的调试路径

1. 过早假设是prompt engineering问题
2. 研究复杂的SillyTavern实现细节
3. 尝试多种消息插入策略
4. 没有先检查基础配置

### ✅ 正确的调试流程

1. **检查基础配置** - 模型参数、token限制
2. **验证数据完整性** - greeting是否保存、加载
3. **检查token预算** - context manager日志
4. **查看实际发送内容** - LLM收到了什么
5. **最后考虑prompt优化** - 如果以上都正常

### 关键指标

监控这些日志来快速定位问题：

```bash
# Context manager日志
grep "Context built" /tmp/backend-server.log

# 关键字段：
# - contextWindow: 应该是 128000
# - truncated: 应该是 false
# - includedMessages: 应该包含所有消息
```

---

## 相关文件

### 修改的文件
- ✅ `src/server/config/llm.config.ts` - 添加GLM模型配置（主要修复）
- ✅ `src/server/routes/websocket.ts` - 添加Author's Note（辅助优化）

### 文档
- `docs/troubleshooting/greeting-continuity-fix.md` - 详细技术方案（已过时）
- `docs/troubleshooting/FINAL_ANALYSIS.md` - 之前的错误分析（已过时）
- `docs/troubleshooting/greeting-continuity-RESOLVED.md` - 本文档（最新）

---

## 影响范围

### 受益的场景

1. **所有使用GLM模型的会话**
   - 不仅是ERA角色卡
   - 所有长greeting的角色卡
   - 所有需要长上下文的对话

2. **其他可能受影响的功能**
   - World Book注入
   - Memory检索
   - 长对话历史

### 不受影响的场景

- 使用OpenAI/Anthropic模型的会话（已有正确配置）
- 短greeting的角色卡（即使用默认配置也能工作）

---

## 预防措施

### 添加新模型时的检查清单

1. ✅ 在 `MODEL_REGISTRY` 中添加配置
2. ✅ 设置正确的 `contextWindow`
3. ✅ 设置正确的 `maxOutputTokens`
4. ✅ 测试长上下文场景
5. ✅ 检查context manager日志

### 监控建议

定期检查是否有模型使用默认配置：

```bash
# 查找使用默认配置的模型
grep "contextWindow.*4096" /tmp/backend-server.log | grep -v "gpt-4:"
```

---

## 总结

**问题：** GLM-4.5-air模型配置缺失，导致token预算不足，greeting被截断

**解决：** 添加正确的模型配置（128K context window）

**教训：** 先检查基础配置，不要过早优化

**状态：** ✅ 已解决

**最后更新：** 2026-03-01
