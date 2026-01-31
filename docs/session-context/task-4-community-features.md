# Task #4: 社区功能实现 - 子会话启动上下文

## 会话配置

- **模型**: Claude Sonnet（中-高复杂度任务）
- **工作目录**: `/var/aichat/Small-Squaretable`
- **依赖**: Task #3（CRUD API）✅ 已完成
- **必需技能**: `superpowers:test-driven-development`

## 任务概述

实现社区功能，包括：
- 五维度评分系统
- 角色市场（发布/下架）
- Fork 功能（复制公开角色）
- 评分聚合逻辑

## 技术栈

- **数据库**: PostgreSQL + Drizzle ORM
- **HTTP框架**: Hono
- **验证**: Zod
- **事务处理**: Drizzle transactions

## 项目结构

```
src/
├── db/
│   ├── schema/
│   │   ├── ratings.ts        # 待创建（评分表）
│   │   └── characters.ts     # 待修改（添加评分字段）
│   ├── repositories/
│   │   └── rating.repository.ts  # 待创建
│   └── migrations/
│       └── XXXX_add_ratings.sql  # 待创建
├── server/
│   ├── services/
│   │   └── rating.service.ts     # 待创建
│   └── routes/
│       └── characters.ts         # 待修改（添加评分端点）
└── types/
    └── rating.ts                 # 待创建
```

## 五维度评分系统

### 评分维度

1. **Quality（质量）** - 角色卡的完整性和细节
2. **Creativity（创意）** - 角色设定的原创性
3. **Interactivity（互动性）** - 对话体验的流畅度
4. **Accuracy（准确性）** - 角色人设的一致性
5. **Entertainment（娱乐性）** - 聊天的趣味性

每个维度：1-5 星

### 数据库设计

#### ratings 表

```sql
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 五维度评分 (1-5)
    quality INT NOT NULL CHECK (quality BETWEEN 1 AND 5),
    creativity INT NOT NULL CHECK (creativity BETWEEN 1 AND 5),
    interactivity INT NOT NULL CHECK (interactivity BETWEEN 1 AND 5),
    accuracy INT NOT NULL CHECK (accuracy BETWEEN 1 AND 5),
    entertainment INT NOT NULL CHECK (entertainment BETWEEN 1 AND 5),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 每个用户对每个角色只能评分一次
    UNIQUE(character_id, user_id)
);

CREATE INDEX ratings_character_id_idx ON ratings(character_id);
CREATE INDEX ratings_user_id_idx ON ratings(user_id);
```

#### characters 表扩展

```sql
ALTER TABLE characters
ADD COLUMN rating_quality_avg DECIMAL(3,2),
ADD COLUMN rating_creativity_avg DECIMAL(3,2),
ADD COLUMN rating_interactivity_avg DECIMAL(3,2),
ADD COLUMN rating_accuracy_avg DECIMAL(3,2),
ADD COLUMN rating_entertainment_avg DECIMAL(3,2),
ADD COLUMN rating_overall_avg DECIMAL(3,2);
```

## API 设计

### 评分 API

```typescript
POST   /api/v1/characters/:id/ratings  // 提交评分
GET    /api/v1/characters/:id/ratings  // 获取评分详情
PUT    /api/v1/characters/:id/ratings  // 更新自己的评分
DELETE /api/v1/characters/:id/ratings  // 删除自己的评分
```

### 请求/响应格式

**提交评分请求**:
```json
{
  "quality": 5,
  "creativity": 4,
  "interactivity": 4,
  "accuracy": 4,
  "entertainment": 5
}
```

**评分响应**:
```json
{
  "success": true,
  "data": {
    "overall": 4.2,
    "dimensions": {
      "quality": 4.5,
      "creativity": 4.0,
      "interactivity": 4.3,
      "accuracy": 4.1,
      "entertainment": 4.2
    },
    "count": 128,
    "userRating": {
      "quality": 5,
      "creativity": 4,
      "interactivity": 4,
      "accuracy": 4,
      "entertainment": 5
    }
  }
}
```

## 评分聚合逻辑

### 事务处理流程

```typescript
async submitRating(characterId: string, userId: string, ratingData: RatingInput) {
  await db.transaction(async (tx) => {
    // 1. 插入或更新评分记录
    await tx.insert(ratings).values({
      characterId,
      userId,
      ...ratingData,
    }).onConflictDoUpdate({
      target: [ratings.characterId, ratings.userId],
      set: { ...ratingData, updatedAt: new Date() }
    });

    // 2. 重新计算角色的平均评分
    const avgRatings = await tx
      .select({
        quality: avg(ratings.quality),
        creativity: avg(ratings.creativity),
        interactivity: avg(ratings.interactivity),
        accuracy: avg(ratings.accuracy),
        entertainment: avg(ratings.entertainment),
        count: count(),
      })
      .from(ratings)
      .where(eq(ratings.characterId, characterId));

    // 3. 计算综合评分
    const overall = (
      avgRatings.quality +
      avgRatings.creativity +
      avgRatings.interactivity +
      avgRatings.accuracy +
      avgRatings.entertainment
    ) / 5;

    // 4. 更新角色表
    await tx.update(characters)
      .set({
        ratingQualityAvg: avgRatings.quality,
        ratingCreativityAvg: avgRatings.creativity,
        ratingInteractivityAvg: avgRatings.interactivity,
        ratingAccuracyAvg: avgRatings.accuracy,
        ratingEntertainmentAvg: avgRatings.entertainment,
        ratingOverallAvg: overall,
        ratingCount: avgRatings.count,
      })
      .where(eq(characters.id, characterId));
  });
}
```

## Fork 功能

### 业务逻辑

```typescript
async forkCharacter(sourceId: string, userId: string, tenantId: string) {
  // 1. 验证源角色是公开的
  const source = await characterRepository.findById(sourceId);
  if (!source || !source.isPublic) {
    throw new NotFoundError('Public character');
  }

  // 2. 创建副本到当前用户租户
  const forked = await characterRepository.create({
    ...source,
    id: undefined,  // 生成新 ID
    tenantId,
    creatorId: userId,
    isPublic: false,  // 默认私有
    downloadCount: 0,
    viewCount: 0,
    ratingQualityAvg: null,
    ratingCreativityAvg: null,
    ratingInteractivityAvg: null,
    ratingAccuracyAvg: null,
    ratingEntertainmentAvg: null,
    ratingOverallAvg: null,
    ratingCount: 0,
  });

  // 3. 更新源角色的下载计数
  await characterRepository.incrementDownloadCount(sourceId);

  return forked;
}
```

## 实施顺序

### Task 1: 数据库迁移
1. 创建 ratings 表
2. 扩展 characters 表（添加评分字段）
3. 创建索引
4. 运行迁移

### Task 2: Rating Schema 和 Repository
1. 定义 ratings schema
2. 实现 RatingRepository
3. 单元测试

### Task 3: Rating Service
1. 实现评分业务逻辑
2. 事务处理
3. 聚合计算
4. 单元测试

### Task 4: Rating API
1. 创建评分类型定义
2. 添加评分端点到 characters 路由
3. 集成测试

### Task 5: Fork 功能增强
1. Fork 业务逻辑（已在 CharacterService 中部分实现）
2. 验证和测试
3. 集成测试

## 验收标准

- [ ] 数据库迁移成功
- [ ] ratings 表和索引创建成功
- [ ] RatingRepository 测试通过
- [ ] RatingService 测试通过
- [ ] 评分 API 正确工作
- [ ] 事务处理正确（原子性）
- [ ] 评分聚合计算正确
- [ ] Fork 功能正确工作
- [ ] 类型检查通过

## 关键注意事项

1. **事务处理**: 评分提交和聚合必须在同一事务中
2. **并发控制**: UNIQUE 约束防止重复评分
3. **数据一致性**: 使用 ON DELETE CASCADE 保持引用完整性
4. **性能优化**: 索引 character_id 和 user_id
5. **权限控制**: 只能评分公开角色或自己的角色

## 启动命令

```bash
cd /var/aichat/Small-Squaretable

# 使用 TDD 技能
# 按 Task 顺序执行：迁移 → Schema → Repository → Service → API
```

## 完成后汇报

在主会话中汇报：
- 迁移执行结果
- 评分功能测试结果
- Fork 功能测试结果
- 提交的 commit 列表
