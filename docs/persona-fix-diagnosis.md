# Persona 名称未替换问题诊断与修复

## 问题描述

用户反馈：在使用"凡音"角色时，对话中的 `{{user}}` 宏没有被替换成 Persona 的名称。

## 根本原因

虽然前端和后端都已经实现了 Persona 系统，但在创建聊天时 **personaId 没有被正确保存到数据库**。

## 问题定位

### 1. 数据流追踪

```
前端 Chat.vue (✅)
  ↓ handlePersonaSelected(personaId)
  ↓ chatStore.createChat(characterId, title, characterIds, personaId)

前端 Store (✅)
  ↓ chatApi.createChat({ characterId, personaId })

后端 API (❌ 修复前)
  ↓ chats.ts: 没有传递 personaId 给 service

后端 Service (✅)
  ↓ chatService.create({ characterId, personaId })

数据库 (✅)
  ↓ chats 表有 personaId 字段
```

### 2. 问题代码

**修复前** (`src/server/routes/chats.ts:60-64`):
```typescript
const chat = await chatService.create(user.id, user.tenantId, {
  characterId: primaryCharacterId,
  title: input.title,
  metadata: input.metadata,
  // ❌ 缺少 personaId
});
```

**修复后**:
```typescript
const chat = await chatService.create(user.id, user.tenantId, {
  characterId: primaryCharacterId,
  personaId: input.personaId,  // ✅ 添加 personaId
  title: input.title,
  metadata: input.metadata,
});
```

## 修复内容

### 文件修改

1. **src/server/routes/chats.ts** (第 62 行)
   - 添加 `personaId: input.personaId` 到 create 调用

### 验证点

1. ✅ Schema 验证 (`src/types/chat.ts:29`)
   ```typescript
   personaId: z.string().uuid().optional()
   ```

2. ✅ 数据库 Schema (`src/db/schema/chats.ts:32-33`)
   ```typescript
   personaId: uuid('persona_id')
     .references(() => userPersonas.id, { onDelete: 'set null' })
   ```

3. ✅ WebSocket 传递 (`src/server/routes/websocket.ts:274`)
   ```typescript
   personaId: chat.personaId || undefined
   ```

4. ✅ 宏替换逻辑 (`src/server/services/chat.service.ts:248-262`)
   ```typescript
   if (params.personaId) {
     const persona = await userPersonaRepository.findById(params.personaId);
     if (persona && persona.userId === userId) {
       userName = persona.name;  // 替换 {{user}}
       personaDescription = persona.description;
     }
   }
   ```

## 测试验证

### 手动测试步骤

1. **创建 Persona**
   - 访问 http://localhost:5173/personas
   - 创建名为"凡音"的 Persona
   - 设置为默认

2. **创建聊天**
   - 访问 http://localhost:5173/chat
   - 选择一个角色
   - PersonaSelector 会自动弹出
   - 选择"凡音" Persona
   - 确认创建

3. **验证替换**
   - 在聊天中发送消息
   - 检查角色回复中是否使用了"凡音"而非"User"

### 自动化测试

运行测试脚本：
```bash
./scripts/test-persona-flow.sh
```

该脚本会：
1. 创建测试 Persona
2. 创建聊天并关联 Persona
3. 验证 personaId 正确保存

## 预期效果

### 修复前
```
角色卡: "{{char}} 向 {{user}} 问好"
实际输出: "Rina 向 User 问好"  ❌
```

### 修复后
```
角色卡: "{{char}} 向 {{user}} 问好"
实际输出: "Rina 向 凡音 问好"  ✅
```

## 相关文件

- `src/server/routes/chats.ts` - 聊天创建路由（已修复）
- `src/server/services/chat.service.ts` - 聊天服务（已支持）
- `src/server/services/macro.service.ts` - 宏替换逻辑（已支持）
- `src/client/pages/Chat.vue` - 前端聊天页面（已支持）
- `src/client/components/chat/PersonaSelector.vue` - Persona 选择器（已实现）

## 后续优化建议

1. **添加单元测试**
   ```typescript
   // src/server/routes/chats.spec.ts
   it('should save personaId when creating chat', async () => {
     const response = await request(app)
       .post('/api/v1/chats')
       .send({ characterId: 'xxx', personaId: 'yyy' });

     expect(response.body.data.personaId).toBe('yyy');
   });
   ```

2. **添加 E2E 测试**
   ```typescript
   // e2e/persona-chat.spec.ts
   test('persona name should replace {{user}} macro', async ({ page }) => {
     // 创建 Persona
     // 创建聊天
     // 发送消息
     // 验证回复中使用了 Persona 名称
   });
   ```

3. **添加数据库迁移验证**
   - 确保 personaId 外键约束正确
   - 添加索引以优化查询性能

## 常见问题

### Q: 为什么之前没有发现这个问题？
A: 因为前端和后端的大部分代码都已经支持 Persona，只是在路由层缺少了一行代码传递 personaId。

### Q: 旧的聊天会受影响吗？
A: 不会。旧聊天的 personaId 为 null，会使用默认的 "User" 名称。

### Q: 如何为现有聊天添加 Persona？
A: 目前不支持修改现有聊天的 Persona。可以创建新聊天并选择 Persona。

### Q: Persona 描述如何影响对话？
A: Persona 的 description 字段会被注入到系统提示词的 `[User Context]` 部分，让 AI 了解用户的背景信息。

## 修复确认

- [x] 代码修改完成
- [x] 测试脚本创建
- [x] 文档更新
- [ ] 单元测试补充（建议）
- [ ] E2E 测试补充（建议）

## 修复时间

2026-03-08
