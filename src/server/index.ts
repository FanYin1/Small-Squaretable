/**
 * 服务器入口文件
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from '@/core/config';
import { errorHandler } from './middleware/error-handler';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors());

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// API 路由
app.get('/api/v1', (c) => {
  return c.json({
    message: 'Small Squaretable API v1',
    endpoints: {
      health: '/health',
      docs: '/api/v1/docs',
    },
  });
});

// 404 处理
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// 错误处理
app.onError(errorHandler);

// 启动服务器
const port = config.port;
console.log(`🚀 Server starting on http://${config.host}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: config.host,
});
