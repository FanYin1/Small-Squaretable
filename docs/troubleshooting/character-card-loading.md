# Character Card Loading Debug Guide

## 问题：角色卡的greeting在前端会话中没有正确加载

### 症状
- 创建新会话后，角色的greeting（开场白）不显示
- `first_mes`和`alternate_greetings`无法加载
- 会话界面空白，没有初始消息

---

## 调试步骤

### 1. 检查浏览器控制台日志

打开浏览器开发者工具（F12），查看Console标签页，寻找以下日志：

```
[Chat] getChatCharacters result { chatId: '...', count: ... }
[Chat] Loaded characters from getChatCharacters { count: ... }
```

或者fallback日志：

```
[Chat] Attempting fallback character load { chatId: '...' }
[Chat] Found chat in store { found: true/false, characterId: '...' }
[Chat] Loaded character from fallback { characterId: '...', name: '...' }
```

**如果看到：**
- `count: 0` - 说明`chat_characters`表中没有记录
- `No character ID found in chat` - 说明chat没有关联角色
- `Failed to load character` - 说明角色不存在或API错误

### 2. 检查网络请求

在Network标签页中，筛选XHR请求，查找：

1. **GET `/api/v1/chats/:chatId/characters`**
   - 应该返回角色数组，包含`cardData`字段
   - 检查响应中的`cardData.first_mes`是否存在

2. **GET `/api/v1/characters/:characterId`** (fallback)
   - 如果第一个请求失败，会调用这个
   - 同样检查`cardData`字段

### 3. 检查Vue DevTools

安装Vue DevTools扩展，然后：

1. 打开DevTools → Vue标签
2. 找到`ChatWindow`组件
3. 查看`chatStore`状态：
   - `chatCharacters` - 应该是包含角色的数组
   - `currentCharacter` - 应该有值
   - `currentCharacter.cardData` - 应该包含`first_mes`

### 4. 使用诊断脚本

在服务器端运行诊断脚本：

```bash
cd /var/aichat/Small-Squaretable

# 获取最近的两个会话ID
# 方法1: 从数据库查询
psql $DATABASE_URL -c "SELECT id, title, character_id FROM chats ORDER BY created_at DESC LIMIT 2;"

# 方法2: 从API获取（需要token）
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/chats

# 然后诊断特定会话
npx tsx scripts/diagnose-character-loading.ts <chatId>
```

这会显示：
- 会话是否存在
- 角色是否关联
- `cardData`结构是否完整
- `first_mes`是否存在

---

## 常见问题和解决方案

### 问题1: `chat_characters`表为空

**症状：**
```
📋 chat_characters entries: 0
⚠️  WARNING: Character is set in chat.characterId but not in chat_characters table
```

**原因：** 旧版本代码创建的会话，没有插入到`chat_characters`表

**解决方案：**
```bash
# 运行修复脚本（先dry-run查看影响）
npx tsx scripts/fix-character-associations.ts --dry-run

# 确认无误后执行修复
npx tsx scripts/fix-character-associations.ts
```

### 问题2: `cardData`为空或缺少`first_mes`

**症状：**
```
❌ cardData is null or empty
或
- first_mes: ❌ (missing)
```

**原因：** 角色上传时`cardData`没有正确保存

**解决方案：**

1. 重新上传角色卡（PNG或JSON格式）
2. 或者手动修复数据库：

```sql
-- 查看当前cardData
SELECT id, name, card_data FROM characters WHERE id = 'character_id';

-- 如果cardData为空，需要重新上传角色卡
-- 或者手动设置最小cardData
UPDATE characters
SET card_data = jsonb_build_object(
  'name', name,
  'description', description,
  'personality', '',
  'scenario', '',
  'first_mes', 'Hello! How can I help you today?',
  'mes_example', ''
)
WHERE id = 'character_id' AND card_data IS NULL;
```

### 问题3: 前端状态未更新

**症状：** API返回正确数据，但前端`chatCharacters`为空

**解决方案：**

1. 刷新页面（Ctrl+F5 强制刷新）
2. 清除浏览器缓存
3. 检查是否有JavaScript错误阻止了状态更新

### 问题4: 角色卡格式不正确

**症状：** 上传时提示格式错误

**解决方案：**

确保角色卡包含必需字段：

```json
{
  "name": "角色名称",
  "description": "角色描述",
  "personality": "性格特征",
  "scenario": "场景设定",
  "first_mes": "你好！我是...",
  "mes_example": "对话示例"
}
```

对于PNG格式，确保：
- PNG文件包含`tEXt`或`iTXt` chunk
- chunk的keyword是`chara`
- 数据是base64编码的JSON

---

## 前端代码检查点

### 1. ChatWindow.vue - Greeting显示逻辑

```vue
<!-- 检查这个computed是否返回正确值 -->
const currentGreeting = computed(() => {
  if (allGreetings.value.length === 0) return '';
  const idx = Math.min(greetingIndex.value, allGreetings.value.length - 1);
  return allGreetings.value[idx] || '';
});
```

在浏览器控制台测试：
```javascript
// 打开Vue DevTools，选择ChatWindow组件，然后在控制台：
$vm.chatStore.currentCharacter?.cardData?.first_mes
```

### 2. chat.ts Store - 角色加载逻辑

关键函数：`setCurrentChat(chatId)`

检查点：
- `getChatCharacters` API是否成功
- `chatCharacters.value`是否被正确赋值
- fallback逻辑是否触发

---

## 预防措施

### 1. 确保角色卡完整性

上传角色时，前端应验证：

```typescript
// src/client/utils/sillytavern.ts
const validation = validateSillyTavernFormat(stCharacter);
if (!validation.valid) {
  throw new Error(`Invalid character format: ${validation.errors.join(', ')}`);
}
```

### 2. 创建会话时确保关联

```typescript
// src/server/routes/chats.ts (已实现)
if (allCharacterIds.length > 0) {
  await chatCharacterRepository.batchInsert(chat.id, allCharacterIds);
}
```

### 3. 添加数据库约束

确保`chat_characters`表的外键约束正确：

```sql
ALTER TABLE chat_characters
  ADD CONSTRAINT fk_chat_characters_chat
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;

ALTER TABLE chat_characters
  ADD CONSTRAINT fk_chat_characters_character
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
```

---

## 联系支持

如果以上步骤都无法解决问题，请提供：

1. 诊断脚本的完整输出
2. 浏览器控制台的错误日志
3. Network标签中相关API请求的响应
4. 角色卡文件（如果可以分享）

这将帮助快速定位问题根源。
