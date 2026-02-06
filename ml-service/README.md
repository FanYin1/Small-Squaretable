# ML Service
# 独立的机器学习微服务，提供文本嵌入和情感分析

## 功能

- **文本嵌入**: 使用 MiniLM 模型生成 384 维向量
- **情感分析**: 使用 DistilBERT 模型分析文本情感
- **批量处理**: 支持批量文本嵌入

## API 端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/embed` | 单文本嵌入 |
| POST | `/embed/batch` | 批量文本嵌入 |
| POST | `/sentiment` | 情感分析 |

## 使用方法

### 启动服务

```bash
cd ml-service
npm install
npm start
```

服务默认运行在 `http://localhost:3001`

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `ML_SERVICE_PORT` | 3001 | 服务端口 |
| `HTTP_PROXY` | - | HTTP 代理地址 |
| `HTTPS_PROXY` | - | HTTPS 代理地址 |

### 代理支持

ML 服务自动检测 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量。如果设置了代理，服务会使用 `undici` 的 `ProxyAgent` 配置全局代理，确保模型下载能够通过代理进行。

```bash
# 如果在代理环境下，确保设置了代理变量
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
npm start
```

**注意**: Node.js 原生 `fetch` 不会自动使用代理环境变量，ML 服务通过 `undici` 解决了这个问题。

### API 示例

**文本嵌入**:
```bash
curl -X POST http://localhost:3001/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

**情感分析**:
```bash
curl -X POST http://localhost:3001/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "I am very happy today!"}'
```

**批量嵌入**:
```bash
curl -X POST http://localhost:3001/embed/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello", "World"]}'
```

## 模型

- **嵌入模型**: `Xenova/all-MiniLM-L6-v2` (384 维)
- **情感模型**: `Xenova/distilbert-base-uncased-finetuned-sst-2-english`

模型会在首次请求时自动下载到 `../models` 目录。

## 依赖

- `@xenova/transformers` - Hugging Face Transformers 的 JavaScript 实现
- `undici` - 用于代理支持的 HTTP 客户端

## Docker

```bash
docker build -t ml-service .
docker run -p 3001:3001 -v ./models:/app/models ml-service
```

## 架构

```
主服务 (3000)  ──HTTP──>  ML 服务 (3001)
     │                         │
     │                         ├── /embed
     │                         ├── /sentiment
     │                         └── /health
     │
     └── embedding.service.ts (HTTP 客户端)
```

ML 服务对用户完全透明，主服务通过 HTTP 调用 ML 服务的 API。
