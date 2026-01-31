# Task #3: CRUD API 实现 - 子会话启动上下文

## 会话配置

- **模型**: Claude Haiku（中复杂度任务）
- **工作目录**: `/var/aichat/Small-Squaretable`
- **依赖**: Task #1（认证系统）✅ 和 Task #2（Repository层）✅ 已完成
- **必需技能**: `superpowers:test-driven-development`

## 任务概述

实现业务 API 路由层，提供用户、角色、聊天的 CRUD 操作：
- 用户管理 API（获取、更新、删除、修改密码）
- 角色管理 API（CRUD + 发布/下架）
- 聊天管理 API（CRUD + 消息管理）

## 技术栈

- **HTTP框架**: Hono ^4.6.14
- **验证**: Zod + @hono/zod-validator
- **认证**: 已完成的 authMiddleware
- **数据访问**: 已完成的 Repository 层

## 项目结构

```
src/server/
├── routes/
│   ├── auth.ts           # 已存在
│   ├── users.ts          # 待创建
│   ├── characters.ts     # 待创建
│   ├── chats.ts          # 待创建
│   └── index.ts          # 待更新（路由聚合）
├── services/
│   ├── auth.service.ts   # 已存在
│   ├── user.service.ts   # 待创建
│   ├── character.service.ts # 待创建
│   └── chat.service.ts   # 待创建
└── middleware/
    └── auth.ts           # 已存在
```

## API 设计规范

### 用户管理 API

```typescript
GET    /api/v1/users/me           // 获取当前用户信息
PATCH  /api/v1/users/me           // 更新当前用户信息
DELETE /api/v1/users/me           // 删除账户
PATCH  /api/v1/users/me/password  // 修改密码
```

### 角色管理 API

```typescript
// 基础 CRUD
POST   /api/v1/characters              // 创建角色
GET    /api/v1/characters              // 列表（支持过滤和分页）
GET    /api/v1/characters/:id          // 获取单个角色
PATCH  /api/v1/characters/:id          // 更新角色
DELETE /api/v1/characters/:id          // 删除角色

// 市场功能
POST   /api/v1/characters/:id/publish  // 发布到市场
POST   /api/v1/characters/:id/unpublish // 从市场下架
GET    /api/v1/characters/marketplace  // 浏览市场（仅公开角色）
POST   /api/v1/characters/:id/fork     // 复制公开角色
```

### 聊天管理 API

```typescript
POST   /api/v1/chats                   // 创建聊天
GET    /api/v1/chats                   // 列表（分页）
GET    /api/v1/chats/:id               // 获取单个聊天
PATCH  /api/v1/chats/:id               // 更新聊天
DELETE /api/v1/chats/:id               // 删除聊天

// 消息管理
POST   /api/v1/chats/:id/messages      // 发送消息
GET    /api/v1/chats/:id/messages      // 获取消息列表（游标分页）
```

## 实施顺序

### Task 1: 用户 Service 和 API
- UserService（业务逻辑层）
- 用户路由（4个端点）
- 输入验证 schemas
- 单元测试 + 集成测试

### Task 2: 角色 Service 和 API
- CharacterService（业务逻辑层）
- 角色路由（9个端点）
- 输入验证 schemas
- 单元测试 + 集成测试

### Task 3: 聊天 Service 和 API
- ChatService（业务逻辑层）
- 聊天路由（7个端点）
- 输入验证 schemas
- 单元测试 + 集成测试

### Task 4: 路由聚合和服务器集成
- 更新 `src/server/routes/index.ts`
- 集成到主服务器
- 端到端测试

## 权限控制规则

1. **用户资源**: 只能操作自己的资源（通过 `c.get('user').id` 验证）
2. **角色资源**:
   - 私有角色：只有创建者可以修改/删除
   - 公开角色：所有人可以查看，只有创建者可以修改
   - Fork：任何人可以 fork 公开角色到自己租户
3. **聊天资源**: 只能操作自己租户内的聊天（通过 `c.get('tenantId')` 验证）

## 输入验证示例

```typescript
// src/types/user.ts
export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// src/types/character.ts
export const createCharacterSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  avatarUrl: z.string().url().max(500).optional(),
  cardData: z.record(z.any()), // SillyTavern 角色卡 JSON
  tags: z.array(z.string()).optional(),
  category: z.string().max(50).optional(),
  isNsfw: z.boolean().default(false),
});

// src/types/chat.ts
export const createChatSchema = z.object({
  characterId: z.string().uuid(),
  title: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const createMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  attachments: z.array(z.any()).optional(),
});
```

## Service 层模式

```typescript
// 示例：CharacterService
export class CharacterService {
  constructor(
    private characterRepo = characterRepository,
    private userRepo = userRepository
  ) {}

  async create(userId: string, tenantId: string, data: CreateCharacterInput) {
    // 业务逻辑验证
    // 调用 Repository
    return await this.characterRepo.create({
      ...data,
      tenantId,
      creatorId: userId,
    });
  }

  async publish(characterId: string, userId: string, tenantId: string) {
    const character = await this.characterRepo.findById(characterId);
    if (!character) throw new NotFoundError('Character');
    if (character.tenantId !== tenantId) throw new ForbiddenError();
    if (character.creatorId !== userId) throw new ForbiddenError();

    return await this.characterRepo.update(characterId, tenantId, {
      isPublic: true,
    });
  }

  async fork(sourceId: string, userId: string, tenantId: string) {
    const source = await this.characterRepo.findById(sourceId);
    if (!source || !source.isPublic) {
      throw new NotFoundError('Public character');
    }

    await this.characterRepo.incrementDownloadCount(sourceId);

    return await this.characterRepo.create({
      ...source,
      id: undefined,
      tenantId,
      creatorId: userId,
      isPublic: false,
      downloadCount: 0,
      viewCount: 0,
      ratingAvg: null,
      ratingCount: 0,
    });
  }
}
```

## TDD 开发流程

每个 API 端点：
1. 编写失败的测试（单元测试 + 路由测试）
2. 实现 Service 方法
3. 实现路由处理器
4. 运行测试验证
5. 提交代码

## 验收标准

- [ ] 所有 API 端点实现
- [ ] 输入验证正确工作
- [ ] 权限控制正确实现
- [ ] 租户隔离正确实现
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 类型检查通过
- [ ] 错误处理完善

## 错误处理

使用现有的错误类：
- `ValidationError` - 输入验证失败（400）
- `UnauthorizedError` - 未登录（401）
- `ForbiddenError` - 无权限（403）
- `NotFoundError` - 资源不存在（404）

## 启动命令

```bash
cd /var/aichat/Small-Squaretable

# 使用 TDD 技能
# 按 Task 顺序实现：User API → Character API → Chat API → 集成
```

## 完成后汇报

在主会话中汇报：
- 完成的 API 端点列表
- 测试结果
- 提交的 commit 列表
