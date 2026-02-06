# 多语言情感分析升级设计

**日期**: 2026-02-06
**状态**: 已完成

## 背景

当前情感分析使用 `Xenova/distilbert-base-uncased-finetuned-sst-2-english`，仅支持英语。向量嵌入使用 `Xenova/all-MiniLM-L6-v2`，对中文支持有限。需要升级为支持中文和英文的多语言模型。

## 目标

- 支持中文和英文的情感分析
- 支持中文和英文的向量嵌入（用于记忆检索）
- 保持现有 API 接口不变
- 保持数据库 schema 不变

## 模型选择

### 情感分析模型

**选用**: `Xenova/bert-base-multilingual-uncased-sentiment`

- 支持语言：中文、英文及其他多语言
- 模型大小：~700MB
- 输出：5 分类 (1-5 stars) + 置信度
- 基于 BERT multilingual，Xenova 官方 ONNX 版本

### 向量嵌入模型

**选用**: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`

- 支持语言：50+ 语言（包含中英文）
- 模型大小：~470MB
- 输出维度：384（与现有相同，无需改数据库）
- 专为语义相似度优化，适合记忆检索

### 总体影响

| 项目 | 当前 | 升级后 |
|------|------|--------|
| 情感模型 | ~270MB (英文) | ~700MB (多语言) |
| 嵌入模型 | ~90MB (英文) | ~470MB (多语言) |
| 嵌入维度 | 384 | 384 (不变) |
| 首次加载 | ~5s | ~8s |

## 代码改动

### 改动文件

`ml-service/server.js`

### 模型常量

```javascript
// 改动前
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SENTIMENT_MODEL = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

// 改动后
const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const SENTIMENT_MODEL = 'Xenova/bert-base-multilingual-uncased-sentiment';
```

### 情感分析输出适配

新模型输出 5 星评分，需要调整 valence 计算逻辑：

```javascript
// 改动前：2 分类 (POSITIVE/NEGATIVE)
const valence = sentiment.label === 'POSITIVE'
  ? sentiment.score * 2 - 1
  : -(sentiment.score * 2 - 1);

// 改动后：5 星评分 (1-5 stars)
let valence;
const starMatch = sentiment.label.match(/(\d+)/);
if (starMatch) {
  const stars = parseInt(starMatch[1], 10);
  valence = (stars - 3) / 2;  // 1->-1, 2->-0.5, 3->0, 4->0.5, 5->1
} else {
  valence = 0;
}
```

### 不需要改动的部分

- 数据库 schema（嵌入维度仍是 384）
- `embedding.service.ts`（API 接口不变）
- `emotion.service.ts`（接收的数据格式不变）
- 前端代码

## 测试验证

### 中文情感分析

```bash
curl -X POST http://localhost:3001/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "今天心情很好，阳光明媚"}'
# 期望: valence > 0.5
```

### 英文情感分析

```bash
curl -X POST http://localhost:3001/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "I am feeling terrible today"}'
# 期望: valence < -0.3
```

### 中文向量嵌入

```bash
curl -X POST http://localhost:3001/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "我喜欢吃苹果"}'
# 期望: 返回 384 维向量
```

## 回滚方案

如果新模型有问题，只需改回模型名称：

```javascript
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SENTIMENT_MODEL = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
```

旧模型已缓存在 `models/` 目录，无需重新下载。

## 注意事项

- 首次启动需要下载新模型（约 740MB）
- 建议在低峰期部署
- 现有记忆数据无需迁移（维度相同）
