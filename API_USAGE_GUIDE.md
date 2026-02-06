# Small Squaretable - API 使用指南

**日期**: 2026-02-02
**状态**: 本地部署已完成

---

## 🎯 当前状态

### ✅ 已完成
- 后端 API 服务正常运行 (localhost:3000)
- PostgreSQL 数据库运行正常
- Redis 缓存运行正常
- WebSocket 服务已初始化

### ⚠️ 待完成
- **前端认证界面** - 登录和注册页面是占位符（标记为 "Task 5 实现"）
- **租户系统配置** - 需要先创建租户才能使用完整功能

---

## 🔧 临时解决方案：通过 API 直接使用

由于前端认证界面尚未实现，你可以通过 API 直接测试后端功能。

### 步骤 1: 创建租户

首先需要在数据库中创建一个租户：

```bash
# 连接到数据库
docker compose exec postgres psql -U postgres -d sillytavern_saas

# 创建默认租户
INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES (
  'default-tenant-id-123456789012',
  'Default Tenant',
  'default',
  'active',
  NOW(),
  NOW()
);

# 退出
\q
```

### 步骤 2: 注册用户

使用 API 注册新用户：

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "tenantId": "default-tenant-id-123456789012"
  }'
```

### 步骤 3: 登录获取 Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

响应示例：
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-id",
      "email": "test@example.com",
      "name": "Test User"
    }
  }
}
```

### 步骤 4: 使用 Token 访问受保护的 API

```bash
# 保存 token
TOKEN="your-access-token-here"

# 获取用户信息
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 创建角色
curl -X POST http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: default-tenant-id-123456789012" \
  -d '{
    "name": "My Character",
    "description": "A test character",
    "personality": "Friendly and helpful"
  }'

# 获取角色列表
curl http://localhost:3000/api/v1/characters \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: default-tenant-id-123456789012"
```

---

## 📝 API 端点列表

### 认证 API (无需租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/v1/auth/register` | 注册新用户 |
| POST | `/api/v1/auth/login` | 用户登录 |
| POST | `/api/v1/auth/refresh` | 刷新 Token |
| POST | `/api/v1/auth/logout` | 登出 (需要 Token) |
| GET | `/api/v1/auth/me` | 获取当前用户信息 (需要 Token) |

### 用户 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/users/me` | 获取个人资料 |
| PUT | `/api/v1/users/me` | 更新个人资料 |
| DELETE | `/api/v1/users/me` | 删除账户 |

### 角色 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/characters` | 获取角色列表 |
| POST | `/api/v1/characters` | 创建角色 |
| GET | `/api/v1/characters/:id` | 获取角色详情 |
| PUT | `/api/v1/characters/:id` | 更新角色 |
| DELETE | `/api/v1/characters/:id` | 删除角色 |
| GET | `/api/v1/characters/public` | 获取公开角色 |
| POST | `/api/v1/characters/:id/publish` | 发布角色到市场 |

### 聊天 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/chats` | 获取聊天列表 |
| POST | `/api/v1/chats` | 创建聊天 |
| GET | `/api/v1/chats/:id` | 获取聊天详情 |
| PUT | `/api/v1/chats/:id` | 更新聊天 |
| DELETE | `/api/v1/chats/:id` | 删除聊天 |
| GET | `/api/v1/chats/:id/messages` | 获取消息列表 |
| POST | `/api/v1/chats/:id/messages` | 发送消息 |

### 智能角色 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/characters/:id/intelligence/memories` | 获取角色记忆 |
| DELETE | `/api/v1/characters/:id/intelligence/memories` | 清空所有记忆 |
| DELETE | `/api/v1/characters/:id/intelligence/memories/:memoryId` | 删除单条记忆 |
| GET | `/api/v1/characters/:id/intelligence/emotion` | 获取当前情感状态 |
| DELETE | `/api/v1/characters/:id/intelligence/emotion` | 重置情感状态 |
| POST | `/api/v1/characters/:id/intelligence/extract-memories` | 从聊天提取记忆 |
| GET | `/api/v1/characters/:id/intelligence/debug` | 获取调试状态 |
| GET | `/api/v1/characters/:id/intelligence/system-prompt` | 获取系统提示详情 |

### 订阅 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/subscriptions/current` | 获取当前订阅 |
| POST | `/api/v1/subscriptions/checkout` | 创建订阅 |
| POST | `/api/v1/subscriptions/cancel` | 取消订阅 |
| POST | `/api/v1/subscriptions/webhook` | Stripe Webhook |

### 使用量 API (需要 Token + 租户 ID)

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/v1/usage/current` | 获取当前使用量 |

---

## 🔍 调试技巧

### 查看服务器日志

开发服务器会实时显示请求日志：

```bash
# 日志格式
<-- GET /api/v1/characters
--> GET /api/v1/characters 200 45ms
```

### 检查数据库

```bash
# 查看用户
docker compose exec postgres psql -U postgres -d sillytavern_saas -c "SELECT * FROM users;"

# 查看租户
docker compose exec postgres psql -U postgres -d sillytavern_saas -c "SELECT * FROM tenants;"

# 查看角色
docker compose exec postgres psql -U postgres -d sillytavern_saas -c "SELECT * FROM characters;"
```

### 测试 WebSocket

```javascript
// 在浏览器控制台中测试
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', e.data);
ws.send(JSON.stringify({ type: 'ping' }));
```

---

## ⚠️ 已知问题

### 1. 前端认证界面未实现

**问题**: 登录和注册页面显示 "Task 5 实现"
**解决方案**: 使用 API 直接注册和登录（见上文）
**计划**: 需要实现完整的前端认证界面

### 2. 租户 ID 要求

**问题**: 大部分 API 需要 `X-Tenant-ID` 请求头
**解决方案**: 在请求中添加 `-H "X-Tenant-ID: default-tenant-id-123456789012"`
**计划**: 前端应该自动管理租户 ID

### 3. UUID 生成错误

**问题**: 注册时可能出现 "invalid input syntax for type uuid"
**原因**: 租户 ID 格式不正确
**解决方案**: 确保使用正确的 UUID 格式（36 字符，包含连字符）

---

## 🎯 下一步开发建议

### 优先级 1: 实现前端认证界面

创建完整的登录和注册页面：
- `src/client/pages/auth/Login.vue` - 登录表单
- `src/client/pages/auth/Register.vue` - 注册表单
- 集成 user store 进行状态管理
- 自动处理租户 ID

### 优先级 2: 简化租户管理

- 自动创建默认租户
- 前端自动获取和存储租户 ID
- 或者实现单租户模式（移除租户要求）

### 优先级 3: 改进错误处理

- 更友好的错误消息
- 前端错误提示
- API 文档和示例

---

## 📚 相关文档

- [部署状态](DEPLOYMENT_STATUS.md)
- [本地部署测试报告](LOCAL_DEPLOYMENT_TEST_REPORT.md)
- [操作手册](OPERATIONS_MANUAL.md)
- [用户指南](USER_GUIDE.md)

---

**状态**: 🟢 后端可用，前端已完善
**最后更新**: 2026-02-06
