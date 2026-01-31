/**
 * 服务器入口文件
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from '@/core/config';
import { errorHandler } from './middleware/error-handler';
import { tenantMiddleware } from './middleware/tenant';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { characterRoutes } from './routes/characters';
import { chatRoutes } from './routes/chats';
import { subscriptionRoutes } from './routes/subscriptions';

type Variables = {
  tenantId?: string;
};

const app = new Hono<{ Variables: Variables }>();

// 中间件
app.use('*', logger());
app.use('*', cors());
app.use('*', tenantMiddleware());

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// API 路由
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/characters', characterRoutes);
app.route('/api/v1/chats', chatRoutes);
app.route('/api/v1/subscriptions', subscriptionRoutes);

app.get('/api/v1', (c) => {
  return c.json({
    message: 'Small Squaretable API v1',
    tenantId: c.get('tenantId'),
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      characters: '/api/v1/characters',
      chats: '/api/v1/chats',
      subscriptions: '/api/v1/subscriptions',
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

// 启动服务器（仅在非测试环境）
if (process.env.NODE_ENV !== 'test') {
  const port = config.port;
  console.log(`🚀 Server starting on http://${config.host}:${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: config.host,
  });
}

export { app };
