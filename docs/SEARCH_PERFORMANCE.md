/**
 * 搜索系统性能优化和验证指南
 *
 * 本文档提供了搜索系统的性能优化建议和验证方法
 */

# 搜索系统性能优化和验证

## 1. 数据库索引验证

### GIN 索引验证 SQL

```sql
-- 验证 GIN 索引是否被使用
EXPLAIN ANALYZE
SELECT *, ts_rank(search_vector, plainto_tsquery('english', 'wizard')) AS rank
FROM characters
WHERE search_vector @@ plainto_tsquery('english', 'wizard')
  AND is_public = true
ORDER BY rank DESC
LIMIT 20;
```

**预期结果**: 应该看到 "Bitmap Index Scan on characters_search_idx"

### 索引大小查询

```sql
-- 查看索引大小
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
WHERE tablename = 'characters'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**预期结果**: search_idx 大小约为表大小的 30-50%

## 2. 查询性能优化

### 优化策略

1. **使用 plainto_tsquery 而不是 to_tsquery**
   - plainto_tsquery: 安全，自动处理特殊字符
   - to_tsquery: 需要手动处理操作符，容易出错

2. **权重设置**
   - A (name): 最高权重 - 精确匹配优先
   - B (description): 中等权重 - 相关内容
   - C (tags): 较低权重 - 辅助信息

3. **查询条件顺序**
   - 先执行全文搜索（使用索引）
   - 再执行其他过滤条件

### 性能基准

| 场景 | 记录数 | 响应时间 | 索引使用 |
|------|--------|----------|----------|
| 简单关键词搜索 | 10,000 | < 50ms | Bitmap Index Scan |
| 带过滤条件搜索 | 10,000 | < 100ms | Bitmap Index Scan |
| 带排序搜索 | 10,000 | < 150ms | Bitmap Index Scan |
| 复杂多条件搜索 | 100,000 | < 200ms | Bitmap Index Scan |

## 3. 触发器性能

### 触发器函数优化

```sql
-- 当前实现已优化：
-- 1. 使用 setweight 分配权重
-- 2. 使用 || 操作符连接向量
-- 3. 使用 COALESCE 处理 NULL 值

CREATE OR REPLACE FUNCTION characters_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 触发器性能指标

- INSERT 操作: +2-5ms（触发器开销）
- UPDATE 操作: +3-8ms（触发器开销）
- 批量操作: 使用 COPY 或 INSERT ... SELECT 避免逐行触发

## 4. 应用层优化

### 缓存策略

```typescript
// 建议实现缓存层
interface CacheConfig {
  ttl: number; // 缓存时间（秒）
  maxSize: number; // 最大缓存条目数
}

// 缓存热门搜索
const POPULAR_SEARCHES = [
  'wizard', 'knight', 'hero', 'fantasy', 'scifi'
];

// 缓存键生成
function getCacheKey(options: SearchOptions): string {
  return `search:${options.query}:${options.sort}:${options.filter}:${options.page}`;
}
```

### 查询优化

1. **分页优化**
   - 使用 LIMIT + OFFSET（当前实现）
   - 对于大偏移量，考虑使用 keyset pagination

2. **字段选择**
   - 只选择必要的字段
   - 避免选择大型 JSONB 字段（cardData）

3. **连接优化**
   - 当前实现无连接，性能最优
   - 如需关联用户信息，使用 LEFT JOIN

## 5. 监控指标

### 关键性能指标 (KPI)

```typescript
interface SearchMetrics {
  // 响应时间
  p50ResponseTime: number; // 中位数
  p95ResponseTime: number; // 95 百分位
  p99ResponseTime: number; // 99 百分位

  // 吞吐量
  queriesPerSecond: number;
  successRate: number;

  // 资源使用
  cpuUsage: number;
  memoryUsage: number;
  diskIOUsage: number;
}
```

### 监控查询

```sql
-- 监控慢查询
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%search_vector%'
ORDER BY mean_exec_time DESC;

-- 监控索引使用
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'characters';
```

## 6. 扩展性考虑

### 水平扩展

1. **读副本**
   - 搜索查询可以路由到只读副本
   - 减少主库压力

2. **分片策略**
   - 按 tenant_id 分片
   - 按 category 分片

### 垂直扩展

1. **索引优化**
   - 定期 REINDEX
   - 监控索引膨胀

2. **统计信息更新**
   - 定期运行 ANALYZE
   - 保持查询计划最优

## 7. 测试清单

- [ ] 验证 GIN 索引被使用（EXPLAIN ANALYZE）
- [ ] 测试搜索响应时间 < 100ms
- [ ] 测试分页功能正确性
- [ ] 测试过滤条件组合
- [ ] 测试排序功能
- [ ] 测试触发器自动更新
- [ ] 测试并发搜索
- [ ] 测试大数据集性能（100k+ 记录）
- [ ] 测试特殊字符处理
- [ ] 测试 NULL 值处理

## 8. 部署检查清单

- [ ] 迁移文件已执行
- [ ] search_vector 列已创建
- [ ] GIN 索引已创建
- [ ] 触发器已创建
- [ ] 现有数据已更新搜索向量
- [ ] 搜索 API 已集成
- [ ] 类型检查通过
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试通过

## 9. 故障排查

### 问题：搜索返回空结果

**原因**:
1. search_vector 为 NULL
2. 查询词不匹配
3. 过滤条件过严格

**解决**:
```sql
-- 检查 search_vector 是否为 NULL
SELECT COUNT(*) FROM characters WHERE search_vector IS NULL;

-- 检查特定记录的搜索向量
SELECT id, name, search_vector FROM characters LIMIT 5;

-- 测试查询
SELECT * FROM characters
WHERE search_vector @@ plainto_tsquery('english', 'wizard');
```

### 问题：搜索性能缓慢

**原因**:
1. 索引未被使用
2. 索引膨胀
3. 统计信息过期

**解决**:
```sql
-- 重建索引
REINDEX INDEX characters_search_idx;

-- 更新统计信息
ANALYZE characters;

-- 检查查询计划
EXPLAIN ANALYZE SELECT * FROM characters
WHERE search_vector @@ plainto_tsquery('english', 'wizard');
```

### 问题：触发器未更新搜索向量

**原因**:
1. 触发器未创建
2. 触发器被禁用
3. 函数有错误

**解决**:
```sql
-- 检查触发器
SELECT * FROM pg_trigger WHERE tgrelid = 'characters'::regclass;

-- 检查函数
SELECT * FROM pg_proc WHERE proname = 'characters_search_vector_update';

-- 手动更新搜索向量
UPDATE characters
SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
WHERE search_vector IS NULL;
```

## 10. 参考资源

- PostgreSQL 全文搜索文档: https://www.postgresql.org/docs/current/textsearch.html
- Drizzle ORM 文档: https://orm.drizzle.team/
- 性能优化最佳实践: https://wiki.postgresql.org/wiki/Performance_Optimization
