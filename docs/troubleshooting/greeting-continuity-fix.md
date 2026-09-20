# Greeting Continuity Fix

## 问题描述

用户选择了特定的开局场景（alternate greeting），但AI在回复时完全忽略了这个场景，给出了通用的回复。

### 示例

**用户选择的开局：**
```
公元2901年，蛮荒边界，"卡戎之渡"星区。
冰冷的触感从后背传来，将User从一片混沌中唤醒...
```

**用户输入：** "开始"

**AI回复（错误）：**
```
欢迎来到蔚蓝星域！在这里，我们可以一起探索浩瀚宇宙的奥秘...
```

**期望的AI回复：**
```
（继续开局场景）你挣扎着坐起身，发现自己身处一个狭小的逃生舱中...
```

---

## 根本原因

AI虽然能看到第一条assistant消息（开局场景），但没有意识到应该继续这个场景。原因：

1. **System prompt不够明确** - 没有指示AI要维持场景连续性
2. **消息历史的语义不清** - AI可能认为第一条消息只是示例
3. **缺少上下文提示** - 没有明确告诉AI"这是你刚才说的话，继续下去"

---

## 解决方案

### 方案1: 增强System Prompt（推荐）

修改`buildEnhancedSystemPrompt`函数，在system prompt中添加场景连续性指示。

**文件：** `src/server/services/chat.service.ts`

```typescript
async buildEnhancedSystemPrompt(params: EnhancedPromptParams): Promise<EnhancedPromptResult> {
  // ... existing code ...

  // 检查是否有开局消息（第一条assistant消息）
  const messages = await this.messageRepo.findByChatId(params.chatId, { limit: 5 });
  const firstAssistantMsg = messages.find(m => m.role === 'assistant');

  if (firstAssistantMsg && messages.length <= 3) {
    // 如果对话刚开始，且有开局消息，添加连续性指示
    parts.push(`
IMPORTANT: You have already started this conversation with a specific scene/scenario.
Your first message was:
"${firstAssistantMsg.content.substring(0, 300)}..."

Continue from this established scene. Maintain the setting, tone, and context you've already created.
Do NOT restart or give a generic greeting. Build upon what you've already established.
    `.trim());
  }

  // ... rest of the code ...
}
```

### 方案2: 在消息历史中添加System提示

在构建消息历史时，如果检测到是开局后的第一次回复，插入一条system消息。

**文件：** `src/server/routes/websocket.ts`

```typescript
// 在第277行之前添加
if (chatMessages.length === 2 && chatMessages[0].role === 'assistant') {
  // 第一条是assistant（greeting），第二条是user，现在要生成第三条
  // 插入一条system提示
  chatMessages.splice(1, 0, {
    role: 'system',
    content: 'Continue the scene and context you established in your previous message. Do not restart or give a generic response.'
  });
}

const contextResult = contextManager.buildContext(systemPrompt, chatMessages, model);
```

### 方案3: 修改Greeting的保存方式（最彻底）

将greeting保存为system消息而不是assistant消息，这样AI会将其视为场景设定而不是对话历史。

**文件：** `src/client/stores/chat.ts`

```typescript
async function addGreetingMessage(chatId: string, content: string): Promise<void> {
  try {
    // 将greeting保存为system消息，作为场景设定
    const response = await chatApi.sendMessage(chatId, {
      role: 'system',  // 改为system
      content: `[Scene Setting]\n${content}`,  // 添加标记
    });
    messages.value.push(response.message);
  } catch (e) {
    logger.error('Failed to persist greeting message', e);
    throw e;
  }
}
```

然后在后端的system prompt构建中：

```typescript
// 检查是否有scene setting消息
const sceneMsg = messages.find(m => m.role === 'system' && m.content.startsWith('[Scene Setting]'));
if (sceneMsg) {
  const scene = sceneMsg.content.replace('[Scene Setting]\n', '');
  parts.push(`Current Scene:\n${scene}`);
  parts.push('You are currently in this scene. All your responses should be consistent with this setting.');
}
```

---

## 推荐实施步骤

### 第一步：快速修复（方案2）

最简单快速的修复，立即生效：

```bash
cd /var/aichat/Small-Squaretable
```

编辑 `src/server/routes/websocket.ts`，在第277行之前添加：

```typescript
// Fix: Ensure AI continues the greeting scene
if (chatMessages.length === 2 && chatMessages[0].role === 'assistant') {
  chatMessages.splice(1, 0, {
    role: 'system',
    content: 'IMPORTANT: Continue the scene and narrative you established in your first message. Maintain the setting, characters, and tone. Do not restart or give a generic greeting.'
  });
}
```

### 第二步：长期优化（方案1）

修改 `src/server/services/chat.service.ts` 的 `buildEnhancedSystemPrompt` 函数，添加场景连续性检查。

### 第三步：测试

1. 创建新会话
2. 选择一个开局场景（右滑）
3. 发送"开始"或其他消息
4. 验证AI是否继续了开局场景

---

## 测试脚本

创建测试脚本验证修复效果：

```bash
cat > scripts/test-greeting-continuity.ts << 'EOF'
import { db } from '../src/db/index';
import { messages } from '../src/db/schema/chats';
import { eq, asc } from 'drizzle-orm';

async function testContinuity(chatId: string) {
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.sentAt))
    .limit(3);

  if (msgs.length < 3) {
    console.log('Not enough messages to test');
    return;
  }

  const [greeting, userMsg, aiResponse] = msgs;

  console.log('\n=== GREETING CONTINUITY TEST ===\n');
  console.log('1. Greeting (Assistant):');
  console.log(greeting.content.substring(0, 200) + '...\n');

  console.log('2. User Message:');
  console.log(userMsg.content + '\n');

  console.log('3. AI Response:');
  console.log(aiResponse.content.substring(0, 200) + '...\n');

  // Simple heuristic: check if AI response mentions elements from greeting
  const greetingKeywords = extractKeywords(greeting.content);
  const responseKeywords = extractKeywords(aiResponse.content);
  const overlap = greetingKeywords.filter(k => responseKeywords.includes(k));

  console.log('Keyword Overlap:', overlap.length, '/', greetingKeywords.length);

  if (overlap.length > greetingKeywords.length * 0.3) {
    console.log('✅ PASS: AI seems to continue the greeting scene');
  } else {
    console.log('❌ FAIL: AI appears to ignore the greeting scene');
  }
}

function extractKeywords(text: string): string[] {
  // Extract Chinese words and English words
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const english = text.match(/[a-zA-Z]{4,}/gi) || [];
  return [...chinese, ...english.map(w => w.toLowerCase())];
}

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: npx tsx scripts/test-greeting-continuity.ts <chatId>');
  process.exit(1);
}

testContinuity(chatId).then(() => process.exit(0)).catch(console.error);
EOF
```

---

## 相关文件

- `src/server/services/chat.service.ts` - System prompt构建
- `src/server/routes/websocket.ts` - 消息处理和LLM调用
- `src/client/stores/chat.ts` - Greeting保存逻辑
- `src/client/components/chat/ChatWindow.vue` - Greeting显示

---

## 注意事项

1. **不要删除第一条assistant消息** - 它是场景的一部分
2. **测试不同的开局** - 确保所有alternate_greetings都能正常工作
3. **检查token限制** - 确保greeting不会被context manager截断
4. **考虑多角色场景** - 如果是群聊，每个角色可能有不同的greeting

---

## 预期效果

修复后，对话应该是这样的：

```
[Assistant - Greeting]
公元2901年，蛮荒边界，"卡戎之渡"星区。
冰冷的触感从后背传来，将User从一片混沌中唤醒...

[User]
开始

[Assistant - 继续场景]
你挣扎着坐起身，发现自己身处一个狭小的逃生舱中。
透过破裂的舷窗，可以看到外面漂浮着无数的残骸碎片...
```

而不是：

```
[Assistant - Greeting]
公元2901年，蛮荒边界，"卡戎之渡"星区...

[User]
开始

[Assistant - 忽略场景]
欢迎来到蔚蓝星域！在这里，我们可以一起探索浩瀚宇宙的奥秘...
```
